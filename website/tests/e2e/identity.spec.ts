import { test, expect, type APIRequestContext, type Page, type Browser } from '@playwright/test';
import { createHmac } from 'node:crypto';
const password = 'Identity-browser-password-2026!';
const origin = 'http://127.0.0.1:3100';
test.use({ actionTimeout: 15000 });
async function mailToken(request: APIRequestContext, email: string, kind = 'verify') {
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
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(202);
  expect(
    (
      await request.get(
        `/api/auth/verify-email?token=${encodeURIComponent(await mailToken(request, email))}`,
      )
    ).ok(),
  ).toBeTruthy();
}
async function login(page: Page, email: string) {
  await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile/);
}
async function administrator(browser: Browser, request: APIRequestContext, suffix: string) {
  const email = `identity-admin-${suffix}@example.com`;
  await register(request, email, `Identity Admin ${suffix}`);
  expect(
    (
      await request.post(
        `${process.env.E2E_CONTROL_URL}/promote?email=${encodeURIComponent(email)}`,
      )
    ).ok(),
  ).toBeTruthy();
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await login(page, email);
  return { context, page };
}
async function createOrganization(page: Page, name: string, type = 'BUYER_BUSINESS') {
  await page.goto('/settings/organizations');
  await page.getByLabel('Organization type', { exact: true }).selectOption(type);
  await page.getByLabel('Organization name', { exact: true }).fill(name);
  await page
    .getByLabel('Authorized representative', { exact: true })
    .fill('Synthetic Representative');
  await page.getByLabel('Region', { exact: true }).fill('Tunis');
  await page
    .getByLabel('Organization description', { exact: true })
    .fill('Synthetic identity foundation browser test organization.');
  await page
    .getByLabel('Contact email', { exact: true })
    .fill('synthetic-organization@example.com');
  await page.getByRole('button', { name: 'Create organization', exact: true }).click();
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/settings/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.getByRole('button', { name: 'Request approval', exact: true }).click();
  await expect(page.getByText('Approval: Pending review', { exact: false })).toBeVisible();
  return id;
}
// Approval dialogs must be accepted before the triggering click resolves.
async function approveOrganization(page: Page, name: string) {
  await page.goto('/admin/approvals');
  const card = page
    .locator('li.panel')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card
    .getByLabel('Review reason', { exact: true })
    .fill('Synthetic organization reviewed and approved.');
  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Record approval decision', exact: true }).click();
  await expect(card).toHaveCount(0);
}

test('buyer onboarding, approval, invitation and scoped membership revocation work across organizations', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120000);
  const buyerEmail = 'identity-buyer@example.com';
  await page.goto('/auth/register');
  await page.getByLabel('Your name', { exact: true }).fill('Identity Buyer');
  await page.getByLabel('Email address', { exact: true }).fill(buyerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('check your inbox');
  await page.goto(
    `/auth/verify-email#token=${encodeURIComponent(await mailToken(request, buyerEmail))}`,
  );
  await page.getByRole('button', { name: 'Verify email address' }).click();
  await expect(page.getByRole('status')).toContainText('email is verified');
  await login(page, buyerEmail);
  const orgId = await createOrganization(page, 'Identity Buyer Organization');
  const admin = await administrator(browser, request, 'buyer');
  await approveOrganization(admin.page, 'Identity Buyer Organization');
  await page.reload();
  await expect(page.getByText('Approval: Approved', { exact: false })).toBeVisible();
  const staffEmail = 'identity-staff@example.com';
  await page.getByLabel('Invitee email', { exact: true }).fill(staffEmail);
  await page.getByRole('checkbox', { name: 'Buyer representative', exact: true }).check();
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  await expect(page.getByText(staffEmail, { exact: true })).toBeVisible();
  const invitation = await mailToken(request, staffEmail, 'invitation');
  await register(request, staffEmail, 'Identity Staff');
  const staffContext = await browser.newContext({ baseURL: origin });
  const staff = await staffContext.newPage();
  await login(staff, staffEmail);
  const enrollmentResponse = await staff.request.post('/api/auth/two-factor/enable', {
    data: { password },
    headers: { Origin: origin },
  });
  expect(enrollmentResponse.ok()).toBeTruthy();
  const enrollment = (await enrollmentResponse.json()) as { totpURI: string };
  expect(
    (
      await staff.request.post('/api/auth/two-factor/verify-totp', {
        data: { code: totp(enrollment.totpURI) },
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBeTruthy();
  await staff.getByRole('button', { name: 'Account menu' }).click();
  await staff.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await staff.goto(`/invitations/accept#token=${invitation}`);
  await staff.getByLabel('Email address', { exact: true }).fill(staffEmail);
  expect(await staff.evaluate(() => location.hash)).toBe('');
  expect(await staff.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await staff.getByLabel('Password', { exact: true }).fill(password);
  await staff.getByRole('button', { name: 'Sign in', exact: true }).click();
  await staff.getByLabel('Authenticator code', { exact: true }).fill(totp(enrollment.totpURI));
  await staff.getByRole('button', { name: 'Verify sign-in', exact: true }).click();
  await expect(staff).toHaveURL(/\/invitations\/accept$/);
  await expect(staff.getByText(staffEmail, { exact: true })).toBeVisible();
  await staff.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(staff.getByRole('status')).toContainText('Invitation accepted');
  expect(await staff.evaluate(() => location.hash)).toBe('');
  const newStaffEmail = 'identity-new-staff@example.com';
  await page.getByLabel('Invitee email', { exact: true }).fill(newStaffEmail);
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  await expect(page.getByText(newStaffEmail, { exact: true })).toBeVisible();
  const newInvitation = await mailToken(request, newStaffEmail, 'invitation');
  const newStaffContext = await browser.newContext({ baseURL: origin });
  const newStaff = await newStaffContext.newPage();
  await newStaff.goto(`/invitations/accept#token=${newInvitation}`);
  await newStaff.getByRole('button', { name: 'Create an account here', exact: true }).click();
  await newStaff.getByLabel('Your name', { exact: true }).fill('Identity New Staff');
  await newStaff.getByLabel('Email address', { exact: true }).fill(newStaffEmail);
  await newStaff.getByLabel('Password', { exact: true }).fill(password);
  await newStaff.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(newStaff.getByRole('status')).toContainText('verification email has been sent');
  const verifyTab = await newStaffContext.newPage();
  await verifyTab.goto(
    `/auth/verify-email#token=${encodeURIComponent(await mailToken(request, newStaffEmail))}`,
  );
  await verifyTab.getByRole('button', { name: 'Verify email address', exact: true }).click();
  await expect(verifyTab.getByRole('status')).toContainText('email is verified');
  await verifyTab.close();
  await newStaff.getByLabel('Email address', { exact: true }).fill(newStaffEmail);
  await newStaff.getByLabel('Password', { exact: true }).fill(password);
  await newStaff.getByRole('button', { name: 'Sign in', exact: true }).click();
  await newStaff.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(newStaff.getByRole('status')).toContainText('Invitation accepted');
  expect(await newStaff.evaluate(() => location.hash + location.search)).toBe('');
  expect(await newStaff.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await newStaffContext.close();
  await staff.goto(`/organizations/${orgId}/settings`);
  await expect(staff.getByRole('heading', { level: 1 })).toHaveText('Identity Buyer Organization');
  await expect(staff.getByRole('button', { name: 'Invite member', exact: true })).toHaveCount(0);
  await expect(staff.getByRole('button', { name: 'Save organization', exact: true })).toHaveCount(
    0,
  );
  const separateId = await createOrganization(staff, 'Identity Staff Separate Organization');
  await expect((await page.request.get(`/api/v1/organizations/${separateId}`)).status()).toBe(403);
  await page.reload();
  const member = page
    .locator('#main-content li')
    .filter({ has: page.getByRole('heading', { name: 'Identity Staff', exact: true }) });
  await member.getByText('Change membership access', { exact: true }).click();
  await member
    .getByLabel('Membership status for Identity Staff', { exact: true })
    .selectOption('SUSPENDED');
  await member
    .getByLabel('Reason for access change', { exact: true })
    .fill('Synthetic scoped suspension verification.');
  page.once('dialog', (dialog) => dialog.accept());
  await member.getByRole('button', { name: 'Update membership', exact: true }).click();
  await expect(
    member.getByText('identity-staff@example.com · Suspended', { exact: true }),
  ).toBeVisible();
  expect((await staff.request.get(`/api/v1/organizations/${orgId}`)).status()).toBe(403);
  expect((await staff.request.get(`/api/v1/organizations/${separateId}`)).status()).toBe(200);
  expect((await staff.request.get('/api/v1/me')).status()).toBe(200);
  await staffContext.close();
  await admin.context.close();
});

test('independent artisan manages skills, capacity, association consent and limited delegation', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const artisanEmail = 'identity-artisan@example.com';
  const coordinatorEmail = 'identity-coordinator@example.com';
  await register(request, artisanEmail, 'Identity Artisan');
  await register(request, coordinatorEmail, 'Identity Coordinator');
  const coordinatorContext = await browser.newContext({ baseURL: origin });
  const coordinator = await coordinatorContext.newPage();
  await login(coordinator, coordinatorEmail);
  const associationId = await createOrganization(
    coordinator,
    'Identity Artisan Association',
    'ASSOCIATION',
  );
  const admin = await administrator(browser, request, 'artisan');
  await approveOrganization(admin.page, 'Identity Artisan Association');
  await login(page, artisanEmail);
  await page.goto('/artisan/profile');
  await page.getByLabel('Display name', { exact: true }).fill('Independent Test Artisan');
  await page.getByLabel('Region', { exact: true }).fill('Nabeul');
  await page.getByLabel('I consent to processing this artisan profile', { exact: false }).check();
  await page.getByRole('button', { name: 'Save artisan profile', exact: true }).click();
  await expect(
    page.getByText('You are participating independently.', { exact: true }),
  ).toBeVisible();
  const skills = page.locator('#skills');
  await skills.getByLabel('Embroidery', { exact: true }).check();
  await skills.getByRole('button', { name: 'Save craft skills', exact: true }).click();
  const capacity = page.locator('#capacity');
  await capacity.getByLabel('Quantity per week', { exact: true }).fill('12');
  await capacity.getByLabel('Effective from', { exact: true }).fill('2027-01-01T08:00');
  await capacity.getByLabel('Effective until', { exact: true }).fill('2027-01-08T08:00');
  const replayKeys: string[] = [];
  let dropResponse = true;
  await page.route('**/api/v1/artisans/me/capacity', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    replayKeys.push(route.request().headers()['idempotency-key']);
    if (dropResponse) {
      dropResponse = false;
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      return route.abort('failed');
    }
    return route.continue();
  });
  await capacity.getByRole('button', { name: 'Declare capacity', exact: true }).click();
  await expect(capacity.getByRole('alert')).toContainText('temporarily unavailable');
  await capacity.getByRole('button', { name: 'Declare capacity', exact: true }).click();
  await expect(capacity.getByText('12 hours per week', { exact: false })).toBeVisible();
  expect(replayKeys).toHaveLength(2);
  expect(replayKeys[0]).toBeTruthy();
  expect(replayKeys[1]).toBe(replayKeys[0]);
  const persisted = await (await page.request.get('/api/v1/artisans/me/capacity')).json();
  expect(persisted.items).toHaveLength(1);
  expect(persisted.items[0].quantity).toBe('12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.unroute('**/api/v1/artisans/me/capacity');
  await page
    .getByLabel('Availability for new opportunities', { exact: true })
    .selectOption('PAUSED');
  await page.getByRole('button', { name: 'Save artisan profile', exact: true }).click();
  await expect(capacity.getByText('12 hours per week', { exact: false })).toBeVisible();
  await page.getByLabel('Approved association', { exact: true }).selectOption(associationId);
  await page
    .getByLabel('I consent to recording this association relationship', { exact: false })
    .check();
  await page.getByRole('button', { name: 'Link association', exact: true }).click();
  await page
    .getByLabel('Association for delegation', { exact: true })
    .selectOption({ label: 'Identity Artisan Association' });
  await page
    .getByLabel('Coordinator', { exact: true })
    .selectOption({ label: 'Identity Coordinator' });
  await page.getByLabel('Artisan.profile.read', { exact: true }).check();
  await page.getByLabel('Artisan.profile.update', { exact: true }).check();
  const expiry = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 16);
  await page.getByLabel('Assistance expires', { exact: true }).fill(expiry);
  await page.getByLabel('I authorize only the selected actions', { exact: false }).check();
  await page.getByRole('button', { name: 'Grant limited assistance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revoke delegation', exact: true })).toBeVisible();
  const profileId = (await (await page.request.get('/api/v1/artisans/me')).json()).id as string;
  let releaseRead!: () => void;
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let readStarted!: () => void;
  const startedRead = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  let holdFirstRead = true;
  await coordinator.route(`**/api/v1/artisans/${profileId}`, async (route) => {
    if (route.request().method() === 'GET' && holdFirstRead) {
      holdFirstRead = false;
      readStarted();
      await heldRead;
    }
    await route.continue();
  });
  await coordinator.goto('/artisan/profile');
  await coordinator.getByRole('link', { name: 'Independent Test Artisan', exact: true }).click();
  await startedRead;
  try {
    await expect(coordinator.getByLabel('Display name', { exact: true })).toHaveCount(0);
  } finally {
    releaseRead();
  }
  await expect(coordinator.getByLabel('Display name', { exact: true })).toHaveValue(
    'Independent Test Artisan',
  );
  await coordinator.getByLabel('Display name', { exact: true }).fill('Assisted Test Artisan');
  await coordinator.getByRole('button', { name: 'Save artisan profile', exact: true }).click();
  await expect(coordinator.getByRole('status')).toContainText('Saved successfully');
  await expect(
    coordinator.getByRole('button', { name: 'Declare capacity', exact: true }),
  ).toHaveCount(0);
  const artisanId = new URL(coordinator.url()).pathname.split('/').at(-1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke delegation', exact: true }).click();
  await expect(page.locator('#delegations').getByText('· Revoked', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke delegation', exact: true })).toHaveCount(0);
  expect((await coordinator.request.get(`/api/v1/artisans/${artisanId}`)).status()).toBe(403);
  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Assisted Test Artisan',
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/identity-artisan-mobile.png', fullPage: true });
  await coordinatorContext.close();
  await admin.context.close();
});

function totp(uri: string) {
  const secret = new URL(uri).searchParams.get('secret')!;
  let bits = '';
  for (const character of secret.toUpperCase().replaceAll('=', ''))
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
test('authenticator enrollment and recovery-code sign-in work without persisting secrets', async ({
  page,
  request,
}) => {
  const email = 'identity-mfa@example.com';
  await register(request, email, 'Identity MFA');
  await login(page, email);
  await page.goto('/settings/security');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  const uri = await page.getByLabel('Authenticator setup URI', { exact: true }).inputValue();
  const backup = (await page.locator('.recovery-codes').textContent())!.split('\n')[0];
  await page.getByLabel('Six-digit authenticator code', { exact: true }).fill(totp(uri));
  await page.getByRole('button', { name: 'Confirm authenticator code', exact: true }).click();
  await expect(
    page.getByText('Two-factor authentication is enabled.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.recovery-codes')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Authenticator code', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use recovery code', exact: true }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(backup);
  await page.getByRole('button', { name: 'Verify sign-in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
