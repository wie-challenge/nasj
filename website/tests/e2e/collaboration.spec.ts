import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const password = 'Synthetic-collaboration-password-2026!';
const origin = 'http://127.0.0.1:3100';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic support requester', password },
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
for (const viewport of [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`private backend-connected support creation and withdrawal on ${viewport.name}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const email = `collaboration-${viewport.name}@example.com`;
    await register(request, email);
    await login(page, email);
    await page.goto('/collaboration');
    await expect(
      page.getByRole('heading', { name: 'Collaboration and support', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('You have no open support case.')).toBeVisible();
    const description = 'Synthetic voluntary craft support request';
    await page.getByLabel('Describe the issue', { exact: true }).fill(description);
    const submit = page.getByRole('button', { name: 'Open case', exact: true });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await expect(page.getByText('Support case opened.', { exact: true })).toBeVisible();
    const view = await (await page.request.get('/api/v1/collaboration')).json();
    expect(view.tickets).toHaveLength(1);
    expect(view.tickets[0].description).toBe(description);
    await page.getByRole('button', { name: 'Withdraw request', exact: true }).click();
    await expect(
      page.getByText('Request withdrawn. Original facts remain in the private audit history.'),
    ).toBeVisible();
    const after = await (await page.request.get('/api/v1/collaboration')).json();
    expect(after.tickets[0].status).toBe('WITHDRAWN');
    expect(after.tickets[0].description).toBe(description);
    expect(after.tickets[0].events).toHaveLength(2);
    const axe = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
