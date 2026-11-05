import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-feedback-browser-password-2026!';

async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic feedback persona', password },
      })
    ).status(),
  ).toBe(202);
  const { token } = await (
    await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`)
  ).json();
  expect(
    (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status(),
  ).toBe(200);
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}

async function startFeedback(page: Page, request: APIRequestContext, width: number) {
  page.on('dialog', (dialog) => dialog.accept());
  await page.setViewportSize({ width, height: 900 });
  const suffix = `recovery-${width}-${Date.now().toString(36)}`;
  const buyerEmail = `feedback-buyer-${suffix}@example.com`;
  for (const email of [
    buyerEmail,
    ...['operator', 'artisan', 'coordinator'].map(
      (role) => `production-${role}-${suffix}@example.com`,
    ),
  ])
    await register(request, email);
  expect(
    (await request.post(`${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`)).ok(),
  ).toBe(true);
  const seed = await request.post(
    `${process.env.E2E_CONTROL_URL}/feedback-fixture?suffix=${suffix}&buyer=${encodeURIComponent(buyerEmail)}`,
  );
  expect(seed.ok()).toBe(true);
  const fixture = await seed.json();
  await login(page, buyerEmail, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  const receipt = page.getByRole('article', { name: 'Shipment DELIVERY_REPORTED' });
  for (const [label, value] of Object.entries({
    'Pieces received': '7',
    'Pieces accepted': '5',
    'Pieces missing': '3',
    'Pieces damaged': '2',
  }))
    await receipt.getByLabel(label, { exact: true }).fill(value);
  await receipt.getByRole('button', { name: 'Confirm buyer receipt', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Shipment DISCREPANCY' })).toBeVisible();
  return {
    ...fixture,
    buyerEmail,
    panel: page.getByRole('region', { name: 'Your delivery feedback', exact: true }),
  };
}
async function current(page: Page, orderId: string) {
  const res = await page.request.get(`/api/v1/collaboration/order-feedback?orderId=${orderId}`);
  expect(res.status()).toBe(200);
  return (await res.json()).items;
}
for (const width of [390, 1280])
  for (const committed of [true, false]) {
    test(`B13 immutable recovery ${committed ? 'committed response loss' : 'abort before commit'} at ${width}`, async ({
      page,
      request,
    }) => {
      test.setTimeout(180000);
      const { panel, orderId } = await startFeedback(page, request, width);
      const comment = panel.getByLabel('Comment (optional, plain text)', { exact: true });
      const attempts: { key: string; body: unknown; status: number }[] = [];
      const correctionAttempts: typeof attempts = [];
      let first = true;
      await page.route('**/api/v1/collaboration/orders/*/feedback', async (route) => {
        const body = route.request().postDataJSON();
        const key = route.request().headers()['idempotency-key'];
        if (first) {
          first = false;
          if (!committed) {
            attempts.push({ key, body, status: 0 });
            return route.abort('failed');
          }
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          attempts.push({ key, body, status: 201 });
          return route.abort('failed');
        }
        const response = await route.fetch();
        attempts.push({ key, body, status: response.status() });
        await route.fulfill({ response });
      });
      await comment.fill('Original assessment exact words');
      await panel
        .getByRole('button', { name: 'Submit private assessment', exact: true })
        .press('Enter');
      await expect(panel.getByRole('alert').first()).toContainText('unavailable');
      expect(await current(page, orderId)).toHaveLength(committed ? 1 : 0);
      await comment.fill('Edited assessment kept as draft');
      await panel
        .getByRole('button', { name: 'Retry original assessment', exact: true })
        .dblclick();
      await expect(
        panel.getByRole('region', { name: 'Accepted feedback operation' }),
      ).toContainText('Original assessment exact words');
      await expect(comment).toHaveValue('Edited assessment kept as draft');
      expect(attempts).toHaveLength(2);
      expect(attempts[1].body).toEqual(attempts[0].body);
      expect(attempts[1].key).toBe(attempts[0].key);
      const saved = await current(page, orderId);
      expect(saved).toHaveLength(1);
      expect(saved[0].currentVersion).toBe(1);
      expect(saved[0].comment).toBe('Original assessment exact words');
      await panel
        .getByRole('button', { name: 'Submit edited correction with a new key', exact: true })
        .click();
      await expect(panel.getByText('Your current assessment (version 2)')).toBeVisible();
      expect((await current(page, orderId))[0].comment).toBe('Edited assessment kept as draft');
      await page.unroute('**/api/v1/collaboration/orders/*/feedback');
      first = true;
      await page.route('**/api/v1/collaboration/order-feedback/*/corrections', async (route) => {
        const body = route.request().postDataJSON();
        const key = route.request().headers()['idempotency-key'];
        if (first) {
          first = false;
          if (!committed) {
            correctionAttempts.push({ key, body, status: 0 });
            return route.abort('failed');
          }
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          correctionAttempts.push({ key, body, status: 201 });
          return route.abort('failed');
        }
        const response = await route.fetch();
        correctionAttempts.push({ key, body, status: response.status() });
        await route.fulfill({ response });
      });
      await comment.fill('Original correction exact words');
      await panel
        .getByLabel('Why are you correcting this?', { exact: true })
        .fill('Original correction reason');
      await panel.getByRole('button', { name: 'Save correction', exact: true }).click();
      await expect(panel.getByRole('alert').first()).toContainText('unavailable');
      await comment.fill('Edited correction kept as draft');
      await panel.getByLabel('Why are you correcting this?', { exact: true }).fill('Edited reason');
      // Real authority loss: remove the authenticated cookie. No replay or private read may pass.
      const cookies = await page.context().cookies();
      await page.context().clearCookies();
      await panel.getByRole('button', { name: 'Retry original correction', exact: true }).click();
      await expect(panel.getByRole('alert').first()).toBeVisible();
      expect(
        (
          await page.request.get(`/api/v1/collaboration/order-feedback?orderId=${orderId}`)
        ).status(),
      ).toBe(401);
      expect(correctionAttempts).toHaveLength(1);
      await page.context().addCookies(cookies);
      await panel
        .getByRole('button', { name: 'Retry original correction', exact: true })
        .press('Enter');
      await expect(
        panel.getByRole('region', { name: 'Accepted feedback operation' }),
      ).toContainText('Original correction exact words');
      await expect(comment).toHaveValue('Edited correction kept as draft');
      expect(correctionAttempts).toHaveLength(2);
      expect(correctionAttempts[1].body).toEqual(correctionAttempts[0].body);
      expect(correctionAttempts[1].key).toBe(correctionAttempts[0].key);
      expect((await current(page, orderId))[0].currentVersion).toBe(3);
      await panel
        .getByRole('button', { name: 'Submit edited correction with a new key', exact: true })
        .click();
      await expect(panel.getByText('Your current assessment (version 4)')).toBeVisible();
      expect(correctionAttempts[2].key).not.toBe(correctionAttempts[1].key);
      expect(correctionAttempts[2].body).toMatchObject({
        expectedVersion: 3,
        comment: 'Edited correction kept as draft',
        reason: 'Edited reason',
      });
      // Validation rejects definitively, retaining draft while allowing a new corrected intent.
      await panel.getByLabel('Rating (optional, 1 to 5)', { exact: true }).fill('6');
      await comment.fill('Draft after validation');
      await panel.getByRole('button', { name: 'Save correction', exact: true }).click();
      await expect(panel.getByRole('alert').first()).toBeVisible();
      expect((await current(page, orderId))[0].currentVersion).toBe(4);
      await comment.fill('Draft after stale version');
      await panel.getByLabel('Rating (optional, 1 to 5)', { exact: true }).fill('4');
      const me = await (await page.request.get('/api/v1/me')).json();
      const other = await page.request.post(
        `/api/v1/collaboration/order-feedback/${saved[0].id}/corrections`,
        {
          headers: {
            Origin: origin,
            'X-CSRF-Token': me.csrfToken,
            'Idempotency-Key': crypto.randomUUID(),
          },
          data: {
            expectedVersion: 4,
            category: 'OVERALL',
            comment: 'Concurrent accepted correction',
            reason: 'Synthetic concurrent browser test',
          },
        },
      );
      expect(other.status()).toBe(201);
      await panel
        .getByRole('button', { name: 'Submit edited correction with a new key', exact: true })
        .click();
      await expect(panel.getByRole('alert').first()).toContainText('Someone else changed');
      await expect(panel.getByText('Your current assessment (version 5)')).toBeVisible();
      await expect(comment).toHaveValue('Draft after stale version');
      await panel
        .getByRole('button', { name: 'Submit edited correction with a new key', exact: true })
        .click();
      await expect(panel.getByText('Your current assessment (version 6)')).toBeVisible();
      await page.unroute('**/api/v1/collaboration/order-feedback/*/corrections');
      const final = (await current(page, orderId))[0];
      expect(final.currentVersion).toBe(6);
      expect(final.comment).toBe('Draft after stale version');
      const history = await (
        await page.request.get(`/api/v1/collaboration/order-feedback/${final.id}/history`)
      ).json();
      expect(history.total).toBe(6);
      expect(
        (
          await new AxeBuilder({ page })
            .include('main')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.reload();
      await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
      await expect(page.getByText('Your current assessment (version 6)')).toBeVisible();
    });
  }

test('B13 create recovery preserves a correction-reason-only draft after background refresh', async ({
  page,
  request,
}) => {
  const { panel, orderId } = await startFeedback(page, request, 390);
  let first = true;
  await page.route('**/api/v1/collaboration/orders/*/feedback', async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (first) {
      first = false;
      return route.abort('failed');
    }
    return route.fulfill({ response });
  });
  await panel
    .getByLabel('Comment (optional, plain text)', { exact: true })
    .fill('Original reason-only recovery assessment');
  await panel.getByRole('button', { name: 'Submit private assessment', exact: true }).click();
  await expect(panel.getByRole('alert').first()).toContainText('unavailable');
  await page.evaluate(() => window.dispatchEvent(new Event('nasj:logistics-updated')));
  await expect(panel.getByText('Your current assessment (version 1)')).toBeVisible();
  const reason = panel.getByLabel('Why are you correcting this?', { exact: true });
  await reason.fill('Keep this unsent reason across original create recovery');
  await panel.getByRole('button', { name: 'Retry original assessment', exact: true }).click();
  await expect(reason).toHaveValue('Keep this unsent reason across original create recovery');
  expect((await current(page, orderId))[0].currentVersion).toBe(1);
  await panel
    .getByRole('button', { name: 'Submit edited correction with a new key', exact: true })
    .click();
  await expect(panel.getByText('Your current assessment (version 2)')).toBeVisible();
});
