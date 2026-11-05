import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-capacity-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic capacity persona', password },
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
async function signIn(page: Page, email: string) {
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/settings\/profile/);
}
async function totals(page: Page, declared: string, remaining: string, deficit: string) {
  const panel = page.getByRole('region', { name: 'System-calculated capacity' });
  for (const [label, amount] of [
    ['Declared', declared],
    ['Reserved', '20.00'],
    ['Committed', '30.00'],
    ['Remaining', remaining],
    ['Capacity deficit', deficit],
  ]) {
    await expect(
      panel
        .locator('div')
        .filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) })
        .locator('dd'),
    ).toHaveText(`${amount} pieces`);
  }
}
async function axe(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach(name, {
    body: JSON.stringify({ violations: result.violations }),
    contentType: 'application/json',
  });
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [360, 1280])
  test(`capacity revisions preserve commitments for artisan and coordinator at ${width}px`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const suffix = `capacity-${width}`;
    for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider', 'coordinator'])
      await register(request, `commerce-${role}-${suffix}@example.com`);
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/capacity-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok()).toBeTruthy();
    const fixture = await seeded.json();
    const contexts = await Promise.all(
      [1, 2].map(() =>
        browser.newContext({
          baseURL: origin,
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        }),
      ),
    );
    try {
      const [artisan, coordinator] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
      await signIn(artisan, `commerce-artisan-${suffix}@example.com`);
      await signIn(coordinator, `commerce-coordinator-${suffix}@example.com`);
      await coordinator.goto('/association');
      await expect(
        coordinator.getByRole('heading', { name: 'Delegated association capacity', exact: true }),
      ).toBeVisible();
      const associationContext = await (await coordinator.request.get('/api/v1/me/context')).json();
      const sharedResponse = await coordinator.request.get(
        `/api/v1/associations/${associationContext.coordinatorOrganizationId}/capacity`,
      );
      expect(sharedResponse.status()).toBe(200);
      const sharedCapacity = await sharedResponse.json();
      expect(sharedCapacity.organizationId).toBe(associationContext.coordinatorOrganizationId);
      expect(JSON.stringify(sharedCapacity)).not.toContain('unitPay');
      expect(JSON.stringify(sharedCapacity)).not.toContain('contactPhone');
      if (!sharedCapacity.items.length)
        await expect(
          coordinator.getByText('No current capacity has been shared with this association.'),
        ).toBeVisible();
      await coordinator
        .getByRole('button', { name: 'Refresh shared capacity', exact: true })
        .focus();
      await coordinator.keyboard.press('Enter');
      await axe(coordinator, `association-capacity-${width}`);

      await artisan.goto('/artisan/capacity');
      await totals(artisan, '100.00', '50.00', '0.00');
      await artisan.getByLabel('Production period', { exact: true }).focus();
      await expect(artisan.getByLabel('Production period', { exact: true })).toBeFocused();
      await artisan.keyboard.press('Tab');
      const revise = artisan.getByRole('button', { name: 'Revise selected period', exact: true });
      await revise.focus();
      await artisan.keyboard.press('Enter');
      await expect(artisan.getByLabel('Quantity per week', { exact: true })).toHaveValue('100');
      await artisan.getByLabel('Quantity per week', { exact: true }).fill('25');
      const submit = artisan.getByRole('button', { name: 'Declare capacity', exact: true });
      await submit.focus();
      await artisan.keyboard.press('Enter');
      await totals(artisan, '25.00', '0.00', '5.00');
      await expect(
        artisan.getByRole('region', { name: 'System-calculated capacity' }).getByRole('alert'),
      ).toContainText('Existing commitments remain active');
      await expect(artisan.getByText(/Superseded declaration/)).toBeVisible();
      await axe(artisan, `capacity-artisan-${width}`);
      await artisan.screenshot({ path: `.local/capacity-artisan-${width}.png`, fullPage: true });
      await coordinator.goto(`/association/artisans/${fixture.artisanProfileId}`);
      await totals(coordinator, '25.00', '0.00', '5.00');
      await coordinator
        .getByRole('button', { name: 'Revise selected period', exact: true })
        .click();
      await coordinator.getByLabel('Weekly declared quantity', { exact: true }).fill('100');
      await coordinator
        .getByLabel('Worker capacity authorization', { exact: true })
        .selectOption(fixture.authorizationId);
      let failOnce = true;
      await coordinator.route('**/api/v1/associations/me/artisans/*/capacity', async (route) => {
        if (route.request().method() === 'POST' && failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'UNAVAILABLE',
              message: 'Synthetic temporary save failure.',
            }),
          });
        }
        return route.continue();
      });
      await coordinator
        .getByRole('button', { name: 'Record declared capacity', exact: true })
        .click();
      await expect(
        coordinator.getByRole('alert').filter({ hasText: 'Synthetic temporary save failure.' }),
      ).toBeVisible();
      await coordinator
        .getByRole('button', { name: 'Record declared capacity', exact: true })
        .click();
      await totals(coordinator, '100.00', '50.00', '0.00');
      await expect(coordinator.getByText(/Coordinator-assisted/)).toBeVisible();
      await axe(coordinator, `capacity-coordinator-${width}`);
      await coordinator.screenshot({
        path: `.local/capacity-coordinator-${width}.png`,
        fullPage: true,
      });
      await artisan.reload();
      await totals(artisan, '100.00', '50.00', '0.00');
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
    }
  });
