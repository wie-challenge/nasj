import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
const password = 'Browser-test-password-2026!';
const resetPassword = 'Browser-reset-password-2026!';
async function token(request: APIRequestContext, email: string, kind = 'verify') {
  const response = await request.get(
    `${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}&kind=${kind}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).token as string;
}
async function register(request: APIRequestContext, email: string, name: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        data: { email, name, password },
        headers: { Origin: 'http://127.0.0.1:3100' },
      })
    ).status(),
  ).toBe(202);
  const value = await token(request, email);
  expect(
    (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(value)}`)).status(),
  ).toBe(200);
}
async function login(page: Page, email: string, pw = password, next = '/settings/profile') {
  await page.goto(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile|\/admin\/users/);
}

test('protected routes redirect and authentication errors are accessible', async ({ page }) => {
  await page.goto('/settings/profile');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
  await page.getByLabel('Email address', { exact: true }).fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Sign-in unsuccessful');
});
test('signup, email verification, profile, sessions and password changes work in the browser', async ({
  page,
  request,
  browser,
}) => {
  const email = 'ui-maker@example.com';
  await page.goto('/auth/register');
  await page.getByLabel('Your name', { exact: true }).fill('UI Maker');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('check your inbox');
  const verification = await token(request, email);
  await page.goto(`/auth/verify-email#token=${encodeURIComponent(verification)}`);
  await page.getByRole('button', { name: 'Verify email address' }).click();
  await expect(page.getByRole('status')).toContainText('email is verified');
  expect(await page.evaluate(() => location.hash)).toBe('');
  await login(page, email);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('UI Maker');
  await page.reload();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('UI Maker');
  expect(await page.evaluate(() => document.cookie.includes('nasj.session_token'))).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByLabel('Your name', { exact: true }).fill('UI Maker Updated');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toContainText('profile has been saved');
  await page.reload();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('UI Maker Updated');
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await other.newPage();
  await login(otherPage, email);
  await page.reload();
  await page.getByRole('tab', { name: 'Password & sessions', exact: true }).click();
  await expect(page.getByText('Another session', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out session', exact: true }).click();
  await expect(page.getByText('Another session', { exact: true })).toHaveCount(0);
  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/auth\/login/);
  await other.close();
  expect((await page.request.get('/api/v1/admin/users')).status()).toBe(403);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users/);
  await page.goto('/settings/profile');
  await page.getByRole('tab', { name: 'Password & sessions', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(resetPassword);
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password updated');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await login(page, email, resetPassword);
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('UI Maker Updated');
});
test('password recovery token stays out of URLs after hydration and revokes sessions', async ({
  page,
  request,
}) => {
  const email = 'ui-recovery@example.com';
  await register(request, email, 'UI Recovery');
  await login(page, email);
  await page.goto('/auth/forgot-password');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(page.getByRole('status')).toContainText('check your inbox');
  const value = await token(request, email, 'reset');
  await page.goto(`/auth/reset-password#token=${encodeURIComponent(value)}`);
  await page.getByLabel('New password', { exact: true }).fill(resetPassword);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('password has been updated');
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await login(page, email, resetPassword);
});
test('admin user search and status controls work; last admin cannot be removed', async ({
  page,
  request,
}) => {
  const email = 'ui-admin@example.com';
  await register(request, email, 'UI Admin');
  expect(
    (
      await request.post(
        `${process.env.E2E_CONTROL_URL}/promote?email=${encodeURIComponent(email)}`,
      )
    ).ok(),
  ).toBeTruthy();
  await login(page, email, password, '/admin/users');
  await expect(page.getByRole('table', { name: 'User administration' })).toBeVisible();
  await page.getByLabel('Search by name or email').fill('ui-maker@example.com');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('UI Maker Updated', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Status for UI Maker Updated' })
    .selectOption('SUSPENDED');
  await expect(page.getByRole('status')).toContainText('Account access updated');
  const denied = await request.post('/api/auth/sign-in/email', {
    data: { email: 'ui-maker@example.com', password: resetPassword },
    headers: { Origin: 'http://127.0.0.1:3100' },
  });
  expect(denied.status()).toBe(401);
  await page.getByRole('combobox', { name: 'Status for UI Maker Updated' }).selectOption('ACTIVE');
  await expect(page.getByRole('status')).toContainText('Account access updated');
  await page.getByLabel('Search by name or email').fill('ui-admin@example.com');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('combobox', { name: 'Platform access for UI Admin' }).selectOption('USER');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'at least one active verified administrator',
  );
});
test('mobile forms, reduced motion and validation do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('highlighted fields');
  await expect(page.getByLabel('Your name', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/foundation-mobile.png', fullPage: true });
});
test('network failures show a recoverable message without exposing upstream details', async ({
  page,
}) => {
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.route('**/api/auth/sign-in/email', (route) => route.abort('failed'));
  await page.getByLabel('Email address', { exact: true }).fill('error@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('forms remain disabled without JavaScript and cannot fall back to credential-bearing GET requests', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3100',
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('/auth/login');
    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    expect(new URL(page.url()).search).toBe('');
  } finally {
    await context.close();
  }
});
test('pending authentication disables duplicate submissions and recovers after a failed response', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route('**/api/auth/sign-in/email', async (route) => {
    received();
    await held;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SIGN_IN_FAILED', message: 'Sign-in unsuccessful. Try again.' }),
    });
  });
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.getByLabel('Email address', { exact: true }).fill('pending@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await started;
  try {
    await expect(page.getByRole('button', { name: 'Please wait…', exact: true })).toBeDisabled();
    await expect(page.locator('fieldset')).toHaveAttribute('aria-busy', 'true');
  } finally {
    release();
  }
  await expect(page.locator('main').getByRole('alert')).toContainText('Sign-in unsuccessful');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('small-screen login supports keyboard focus, associated labels and direct API denials through the proxy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  const email = page.getByLabel('Email address', { exact: true });
  await email.focus();
  await page.keyboard.type('keyboard@example.com');
  await page.keyboard.press('Tab');
  const passwordInput = page.getByLabel('Password', { exact: true });
  await expect(passwordInput).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(passwordInput).toHaveAttribute('type', 'text');
  await page.keyboard.press('Enter');
  await expect(passwordInput).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const field of await page.locator('input:not([type="hidden"])').all()) {
    const id = await field.getAttribute('id');
    expect(id).toBeTruthy();
    await expect(page.locator(`label[for="${id}"]`)).not.toBeEmpty();
  }
  const denied = await page.request.get('/api/v1/me');
  expect(denied.status()).toBe(401);
  expect((await denied.json()).requestId).toBe(denied.headers()['x-request-id']);
  const malformed = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { email: 'bad', password: 'bad', wearableSummary: {} },
  });
  expect(malformed.status()).toBe(400);
});
