import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-commerce-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Workspace Buyer', password },
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
async function login(page: Page, email: string) {
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/settings\/profile/);
}
async function a11y(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach(label, {
    body: JSON.stringify({ violations: result.violations }),
    contentType: 'application/json',
  });
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('desktop sidebar shows buyer work, active navigation and the current procurement workspace', async ({
  page,
  request,
}) => {
  const suffix = 'ui-layout';
  for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider'])
    await register(request, `commerce-${role}-${suffix}@example.com`);
  expect(
    (await request.post(`${process.env.E2E_CONTROL_URL}/commerce-fixture?suffix=${suffix}`)).ok(),
  ).toBeTruthy();
  await login(page, `commerce-buyer-${suffix}@example.com`);
  const nav = page.getByRole('navigation', { name: 'Account navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Procurement requests', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Operator review', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeHidden();
  await nav.getByRole('link', { name: 'Procurement requests', exact: true }).click();
  await expect(
    nav.getByRole('link', { name: 'Procurement requests', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/\/procurement$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Procurement');
  await expect(page.getByRole('link', { name: 'User accounts', exact: true })).toHaveCount(0);
  expect((await page.locator('.shell-header').boundingBox())!.y).toBe(0);
  await a11y(page, 'ui-desktop-workspace');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/ui-desktop-workspace.png', fullPage: true });
});

test('mobile drawer supports focus, escape, navigation and keyboard account tabs at 360px', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await register(request, 'ui-mobile-navigation@example.com');
  await login(page, 'ui-mobile-navigation@example.com');
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  const personal = page.getByRole('tab', { name: 'Personal details', exact: true });
  await personal.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Password & sessions', exact: true })).toBeFocused();
  await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toBeHidden();
  await a11y(page, 'ui-mobile-account');
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'NASJ navigation', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Operator review', exact: true })).toHaveCount(0);
  await a11y(page, 'ui-mobile-drawer');
  await page.screenshot({ path: '.local/ui-mobile-drawer.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole('link', { name: 'Craft catalog', exact: true }).click();
  await expect(page).toHaveURL(/commerce\/catalog/);
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Craft and example catalog', exact: true }),
  ).toBeVisible();
  await a11y(page, 'ui-mobile-catalog-shell');
  await page.screenshot({ path: '.local/ui-mobile-workspace.png', fullPage: true });
});
