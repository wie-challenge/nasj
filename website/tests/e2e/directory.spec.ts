import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-directory-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic directory persona', password },
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
  await page.goto('/auth/login?next=%2Fdirectory');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/directory/);
}
async function search(page: Page, region: string) {
  const craft = page.getByLabel('Craft', { exact: true });
  await expect(craft.locator('option[value="weaving"]')).toHaveCount(1);
  await craft.selectOption('weaving');
  const regionSelect = page.getByLabel('Region', { exact: true });
  await expect(regionSelect.locator(`option[value="${region}"]`).first()).toBeAttached();
  await regionSelect.selectOption({ label: region });
  await page.getByLabel('Capacity unit', { exact: true }).selectOption('PIECES');
  await page.getByRole('button', { name: 'Search capacity', exact: true }).click();
}
for (const width of [360, 1280])
  test(`production directory search stays private and responsive at ${width}px`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const suffix = `dir-${width}`;
    for (const role of ['buyer', 'sfax', 'kairouan'])
      await register(request, `directory-${role}-${suffix}@example.com`);
    expect(
      (
        await request.post(`${process.env.E2E_CONTROL_URL}/directory-fixture?suffix=${suffix}`)
      ).ok(),
    ).toBeTruthy();
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
      const [buyer, coordinator] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
      await signIn(buyer, `directory-buyer-${suffix}@example.com`);
      await signIn(coordinator, `directory-kairouan-${suffix}@example.com`);
      await buyer.getByLabel('Craft', { exact: true }).focus();
      await expect(buyer.getByLabel('Craft', { exact: true })).toBeFocused();
      await search(buyer, 'Sfax');
      const large = buyer.getByRole('article', { name: `Directory group Sfax ${suffix}` });
      await expect(large).toContainText('300.00 pieces');
      await expect(large).toContainText('Capacity available');
      await expect(buyer.getByText('Hidden directory')).toHaveCount(0);
      await expect(buyer.getByText('+21699000111')).toHaveCount(0);
      await large.getByRole('link').click();
      await expect(buyer.getByText('Individual artisan records are not included')).toBeVisible();
      await buyer.goto('/directory');
      await search(buyer, 'Kairouan');
      const hidden = buyer.getByRole('article', { name: `Directory group Kairouan ${suffix}` });
      await expect(hidden).toContainText('Capacity unknown');
      await expect(hidden).not.toContainText('40.00');
      await buyer.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await buyer.getByLabel('Minimum known remaining', { exact: true }).fill('99999');
      await buyer.getByRole('button', { name: 'Search capacity', exact: true }).click();
      await expect(buyer.getByText('No production groups match these filters.')).toBeVisible();
      await search(coordinator, 'Kairouan');
      const local = coordinator.getByRole('article', {
        name: `Directory group Kairouan ${suffix}`,
      });
      await expect(local).toContainText('40.00 pieces');
      await local.getByRole('link').click();
      await expect(
        coordinator.getByRole('link', { name: `Hidden directory solo ${suffix}` }),
      ).toBeVisible();
      await expect(coordinator.getByText('No current declaration for this period.')).toHaveCount(0);
      const result = await new AxeBuilder({ page: buyer })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      expect(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await coordinator.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
    }
  });
