import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { CommerceWorkspaceView } from '@nasj/contracts';
const password = 'Synthetic-commerce-browser-password-2026!';
const origin = 'http://127.0.0.1:3100';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Commerce Persona', password },
      })
    ).status(),
  ).toBe(202);
  const token = await (
    await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`)
  ).json();
  expect(
    (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(token.token)}`)).status(),
  ).toBe(200);
}
async function login(page: Page, email: string) {
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/settings\/profile/);
}
async function workspace(page: Page) {
  return (await (
    await page.request.get('/api/v1/commerce/workspace')
  ).json()) as CommerceWorkspaceView;
}
async function a11y(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach(`axe-${label}`, {
    body: JSON.stringify(
      { url: page.url(), violations: result.violations, passes: result.passes.map((p) => p.id) },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(
    result.violations,
    JSON.stringify(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function keyboardButton(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeEnabled();
  await page.keyboard.press('Tab');
  await button.focus();
  await expect(button).toBeFocused();
  expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/commerce/') && ['POST', 'PATCH'].includes(req.method()),
  );
  await page.keyboard.press('Enter');
  const response = await (await request).response();
  if (response) await response.finished();
  await expect(page.locator('fieldset[aria-busy="true"]')).toHaveCount(0);
}

for (const profile of [
  { name: 'mobile', width: 360, height: 800, slow: true },
  { name: 'tablet', width: 768, height: 1024, slow: false },
  { name: 'desktop', width: 1280, height: 900, slow: false },
]) {
  test(`buyer RFQ, voluntary artisan decisions/progress and operator QA are accessible on ${profile.name}`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(240000);
    for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider'])
      await register(request, `commerce-${role}-${profile.name}@example.com`);
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/commerce-fixture?suffix=${profile.name}`,
    );
    expect(seeded.ok()).toBeTruthy();
    const fixture = await seeded.json();
    const contexts = await Promise.all(
      ['buyer', 'operator', 'artisan'].map(() =>
        browser.newContext({
          baseURL: origin,
          viewport: { width: profile.width, height: profile.height },
          reducedMotion: 'reduce',
        }),
      ),
    );
    try {
      const [buyer, operator, artisan] = await Promise.all(
        contexts.map((context) => context.newPage()),
      );
      for (const [page, role] of [
        [buyer, 'buyer'],
        [operator, 'operator'],
        [artisan, 'artisan'],
      ] as const)
        await login(page, `commerce-${role}-${profile.name}@example.com`);
      if (profile.slow) {
        for (const page of [buyer, operator, artisan]) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 150,
            downloadThroughput: 200 * 1024,
            uploadThroughput: 100 * 1024,
          });
        }
      }
      await buyer.goto('/commerce/buyer');
      await buyer.getByText('Create a synthetic request', { exact: true }).click();
      await buyer
        .getByLabel('Buyer organization', { exact: true })
        .selectOption(fixture.buyerOrganizationId);
      await buyer
        .getByLabel('Responsible operator organization', { exact: true })
        .selectOption(fixture.operatorOrganizationId);
      await buyer
        .getByLabel('Request title', { exact: true })
        .fill(`Synthetic ${profile.name} woven request`);
      await buyer.getByLabel('Craft', { exact: true }).selectOption('weaving');
      await buyer
        .getByLabel('Craft specification', { exact: true })
        .fill('Ten fictional woven blue samples.');
      await buyer
        .getByLabel('Design requirements', { exact: true })
        .fill('Synthetic pattern and agreed dimensions.');
      await buyer.getByLabel('Requested pieces', { exact: true }).fill('10');
      await buyer
        .getByLabel('Delivery deadline', { exact: true })
        .fill(fixture.deliveryAt.slice(0, 16));
      await buyer
        .getByLabel('Delivery location', { exact: true })
        .fill('Synthetic Tunis collection point');
      await a11y(buyer, `${profile.name}-buyer-form`);
      await keyboardButton(buyer, 'Save RFQ draft');
      await expect(
        buyer.getByRole('heading', {
          name: `Synthetic ${profile.name} woven request`,
          exact: true,
        }),
      ).toBeVisible();
      let state = await workspace(buyer);
      expect(state.rfqs[0].status).toBe('DRAFT');
      await buyer.reload();
      await buyer.getByText('Edit saved draft', { exact: true }).click();
      await expect(buyer.getByLabel('Request title', { exact: true }).last()).toHaveValue(
        `Synthetic ${profile.name} woven request`,
      );
      await keyboardButton(buyer, 'Submit RFQ for review');
      await expect(buyer.getByText(/Submitted · Version/)).toBeVisible();
      await operator.goto('/commerce/operator');
      await keyboardButton(operator, 'Start RFQ review');
      await operator.getByLabel('Exact buyer quote (TND)', { exact: true }).fill('100.001');
      await operator
        .getByLabel('Quote expiry', { exact: true })
        .fill(fixture.quoteExpiresAt.slice(0, 16));
      await keyboardButton(operator, 'Issue synthetic quote');
      await buyer.reload();
      await keyboardButton(buyer, 'Accept exact synthetic quote');
      await expect(buyer.getByText('Order · Approved · Synthetic', { exact: true })).toBeVisible();
      await operator.reload();
      const order = operator.getByRole('article', {
        name: `Order Synthetic ${profile.name} woven request`,
        exact: true,
      });
      await order.getByText('Schedule a simulated payment', { exact: true }).click();
      await order.getByLabel('Simulated payment amount (TND)', { exact: true }).fill('100.001');
      await keyboardButton(operator, 'Schedule simulated payment');
      for (const stage of ['approved', 'initiated', 'settled'])
        await keyboardButton(operator, `Mark simulated payment ${stage}`);
      await keyboardButton(operator, 'Confirm simulated funding');
      await keyboardButton(operator, 'Start allocation planning');
      await order.getByText('Create a voluntary artisan offer', { exact: true }).click();
      await order
        .getByLabel('Artisan declared capacity', { exact: true })
        .selectOption(fixture.capacityDeclarationId);
      await order.getByLabel('Offered pieces', { exact: true }).fill('10');
      await order.getByLabel('Agreed artisan pay per piece (TND)', { exact: true }).fill('2.345');
      await order.getByLabel('Estimated effort range (hours)', { exact: true }).fill('2 to 3');
      await order
        .getByLabel('Offer expiry', { exact: true })
        .fill(fixture.offerExpiresAt.slice(0, 16));
      await order
        .getByLabel('Material responsibility', { exact: true })
        .fill('Operator supplies synthetic yarn');
      await order
        .getByLabel('Quality and rework terms', { exact: true })
        .fill('Rework requires explicit agreement; no decline penalty');
      await order
        .getByLabel('Agreed payment conditions', { exact: true })
        .fill('Pay approved units independent of buyer delays');
      await keyboardButton(operator, 'Send synthetic offer');
      await artisan.goto('/commerce/artisan');
      await expect(artisan.getByText('23.450 TND', { exact: true })).toBeVisible();
      await a11y(artisan, `${profile.name}-artisan-decision`);
      await artisan.getByLabel('Offer language', { exact: true }).selectOption('en');
      await artisan
        .getByRole('checkbox', {
          name: 'I understand and have reviewed the original English terms for this exact offer version.',
          exact: true,
        })
        .check();
      await keyboardButton(artisan, 'Accept this offer voluntarily');
      state = await workspace(artisan);
      expect(state.batches).toHaveLength(1);
      expect(state.offers[0].status).toBe('ACCEPTED');
      await operator.reload();
      await keyboardButton(operator, 'Release order to production');
      await keyboardButton(operator, 'Confirm synthetic material readiness');
      await artisan.reload();
      await keyboardButton(artisan, 'Start accepted production');
      await artisan.getByLabel('Total pieces produced so far', { exact: true }).fill('10');
      // Commit on the real API, lose its response, and retry through the accessible error state.
      let dropped = false;
      const keys: string[] = [];
      await artisan.route('**/commerce/batches/*/progress', async (route) => {
        keys.push(route.request().headers()['idempotency-key']);
        if (!dropped) {
          dropped = true;
          expect((await route.fetch()).status()).toBe(201);
          await route.abort('failed');
        } else await route.continue();
      });
      await keyboardButton(artisan, 'Save cumulative progress');
      await expect(artisan.getByRole('main').getByRole('alert')).toContainText(
        'temporarily unavailable',
      );
      await keyboardButton(artisan, 'Save cumulative progress');
      await expect(
        artisan.getByRole('status').filter({ hasText: 'Saved successfully.' }),
      ).toBeVisible();
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      await keyboardButton(artisan, 'Submit produced pieces for QA');
      expect((await workspace(artisan)).batches[0].submitted).toBe(10);
      await operator.reload();
      await keyboardButton(operator, 'Request order quality review');
      await keyboardButton(operator, 'Start quality inspection');
      await operator.getByLabel('Approved pieces', { exact: true }).fill('9');
      await operator.getByLabel('Pending pieces', { exact: true }).fill('0');
      await keyboardButton(operator, 'Save reconciled inspection');
      await expect(operator.getByRole('main').getByRole('alert')).toContainText(
        'QA totals must reconcile',
      );
      await operator.getByLabel('Approved pieces', { exact: true }).fill('10');
      await keyboardButton(operator, 'Save reconciled inspection');
      await keyboardButton(operator, 'Approve inspected batch');
      await keyboardButton(operator, 'Complete approved batch');
      await a11y(operator, `${profile.name}-operator-review`);
      await operator.evaluate(() => window.scrollTo(0, 0));
      await operator.screenshot({
        path: `.local/commerce-${profile.name}-operator.png`,
        fullPage: true,
      });
      await keyboardButton(operator, 'Approve order for shipment');
      await keyboardButton(operator, 'Record synthetic shipment');
      await keyboardButton(operator, 'Record synthetic delivery');
      await buyer.reload();
      await keyboardButton(buyer, 'Accept delivered order');
      state = await workspace(buyer);
      expect(state.orders[0].status).toBe('BUYER_ACCEPTED');
      expect(state.orders[0].approved).toBe(10);
      expect(state.orders[0].delivered).toBe(10);
      expect(state.orders[0].quoteTnd).toBe('100.001');
      expect(state.offers).toHaveLength(0);
      await operator.reload();
      // The same browser journey continues through the separate artisan ledger and closure.
      await order.getByText('Schedule a simulated payment', { exact: true }).click();
      await order.getByLabel('Payment ledger', { exact: true }).selectOption('ARTISAN_PAYOUT');
      const artisanState = await workspace(artisan);
      await order
        .getByLabel('Artisan batch (payouts only)', { exact: true })
        .selectOption(artisanState.batches[0].id);
      await order.getByLabel('Simulated payment amount (TND)', { exact: true }).fill('23.450');
      await keyboardButton(operator, 'Schedule simulated payment');
      for (const stage of ['approved', 'initiated', 'settled'])
        await keyboardButton(operator, `Mark simulated payment ${stage}`);
      await keyboardButton(operator, 'Reconcile simulated settlement');
      await operator.getByLabel('I confirm synthetic materials and returns are resolved').check();
      await operator
        .getByLabel('Material disposition note', { exact: true })
        .fill('Synthetic materials and returns reconciled in browser fixture.');
      await keyboardButton(operator, 'Close reconciled synthetic order');
      expect((await workspace(operator)).orders[0].status).toBe('CLOSED');
      await order.getByText('Synthetic fulfillment report', { exact: true }).click();
      // The complete suite shares this disposable queue. Drain real worker batches until this
      // organization's projection catches up, independently of how many earlier fixtures exist.
      await expect(async () => {
        expect((await request.post(`${process.env.E2E_CONTROL_URL}/run-worker`)).ok()).toBeTruthy();
        await order.getByRole('button', { name: 'Refresh report', exact: true }).click();
        await expect(order.getByRole('status')).toContainText('Current', { timeout: 1000 });
      }).toPass({ timeout: 60000, intervals: [100] });
      await expect(order.getByText('23450 millimes (TND)', { exact: true })).toHaveCount(2);
      const downloadPromise = operator.waitForEvent('download');
      await order.getByRole('link', { name: 'Download synthetic CSV', exact: true }).click();
      expect((await downloadPromise).suggestedFilename()).toBe('synthetic-commerce.csv');
      await operator.getByText('Commerce notifications', { exact: true }).click();
      await operator.getByRole('button', { name: 'Refresh notifications', exact: true }).click();
      await expect(operator.getByRole('list').filter({ hasText: /order.closed/i })).toBeVisible();
      await a11y(operator, `${profile.name}-report-inbox`);
      await operator.evaluate(() => window.scrollTo(0, 0));
      await operator.screenshot({
        path: `.local/commerce-${profile.name}-operator.png`,
        fullPage: true,
      });

      expect(
        await artisan.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      expect(
        await artisan.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.animation = 'sample 10s infinite';
          document.body.append(probe);
          const value = getComputedStyle(probe).animationName;
          probe.remove();
          return value;
        }),
      ).toBe('none');
      await a11y(buyer, `${profile.name}-buyer-fulfillment`);
      await test.info().attach(`${profile.name}-persisted-result`, {
        body: JSON.stringify({
          fixture: 'commerce-v1',
          provenance: 'SYNTHETIC',
          state: state.orders[0],
          cpuThrottle: profile.slow ? 4 : 1,
          latencyMs: profile.slow ? 150 : 0,
        }),
        contentType: 'application/json',
      });
    } finally {
      for (const context of contexts) await context.close();
    }
  });
}
