import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-foundation-browser-password-2026!';
const reason = 'Synthetic independently reviewed fixture authorization';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Foundation Person', password },
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
async function loginApi(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        headers: { Origin: origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  return (await (await request.get('/api/v1/me')).json()).user.id as string;
}
async function mutate(
  request: APIRequestContext,
  path: string,
  data: unknown,
  method: 'POST' | 'PATCH' = 'POST',
) {
  const { csrfToken } = await (await request.get('/api/v1/me')).json();
  const r = await request.fetch(`/api/v1/${path}`, {
    method,
    headers: { Origin: origin, 'X-CSRF-Token': csrfToken },
    data,
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function signIn(page: Page, email: string, path: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin}${path}`);
}
async function axe(page: Page, label: string) {
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
async function fillEvidence(page: Page) {
  await page.getByLabel('Authorization method', { exact: true }).selectOption('WITNESSED_VERBAL');
  await page
    .getByLabel('Reviewed authorization policy', { exact: true })
    .selectOption({ label: 'Synthetic browser policy v1' });
  await page
    .getByLabel('Authorization date and time', { exact: true })
    .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
  await page
    .getByLabel('Authorization evidence reference', { exact: true })
    .fill('synthetic-confirmation-document');
  await page
    .getByLabel('Separate witness reference (required for verbal authorization)', { exact: true })
    .fill('separate-synthetic-witness');
}

test('coordinator onboards an artisan without login, records declared capacity and loses access immediately on suspension', async ({
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const adminCtx = await browser.newContext({ baseURL: origin });
  const coordCtx = await browser.newContext({
    baseURL: origin,
    viewport: { width: 360, height: 800 },
  });
  try {
    const adminEmail = 'foundation-ui-admin@example.com',
      coordEmail = 'foundation-ui-coordinator@example.com';
    await register(adminCtx.request, adminEmail);
    await register(coordCtx.request, coordEmail);
    await request.post(`${process.env.E2E_CONTROL_URL}/promote?email=${adminEmail}`);
    await loginApi(adminCtx.request, adminEmail);
    const coordId = await loginApi(coordCtx.request, coordEmail);
    const association = await mutate(coordCtx.request, 'organizations', {
      type: 'ASSOCIATION',
      name: 'Synthetic Browser Association',
      region: 'Tunis',
      description: 'Synthetic association for assisted onboarding browser verification.',
      contactEmail: coordEmail,
      representativeName: 'Synthetic Coordinator',
      country: 'TN',
      contactPhone: '',
    });
    await mutate(coordCtx.request, `organizations/${association.id}/submit-approval`, {});
    await mutate(adminCtx.request, `admin/organizations/${association.id}/approve`, { reason });
    await mutate(adminCtx.request, 'admin/authorization-policies', {
      version: 'Synthetic browser policy v1',
      methods: ['WITNESSED_VERBAL'],
      reviewReference: reason,
    });
    await coordCtx.request.post('/api/auth/sign-out', { headers: { Origin: origin }, data: {} });
    const page = await coordCtx.newPage();
    await signIn(page, coordEmail, '/association');
    await axe(page, 'association-role-dashboard');
    await page.screenshot({ path: '.local/nasj-role-association-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'NASJ navigation', exact: true });
    await expect(
      drawer.getByRole('link', { name: 'Assigned artisan registry', exact: true }),
    ).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'User accounts', exact: true })).toHaveCount(0);
    await expect(
      drawer.getByRole('link', { name: 'Procurement requests', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Add artisan', exact: true }).click();
    await page.getByLabel('Artisan name', { exact: true }).fill('Synthetic Assisted Artisan');
    await page.getByLabel('Region', { exact: true }).fill('Tunis');
    await page.getByLabel('Equipment (comma separated)', { exact: true }).fill('Loom');
    await page.getByLabel('Weaving', { exact: true }).check();
    await fillEvidence(page);
    await page.getByRole('button', { name: 'Create authorized artisan', exact: true }).click();
    await page.getByRole('link', { name: 'Open artisan record', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Synthetic Assisted Artisan');
    await page.getByText('Record new worker authorization', { exact: true }).click();
    await page.getByLabel('Authorization purpose', { exact: true }).selectOption('CAPACITY');
    await fillEvidence(page);
    await page.getByRole('button', { name: 'Record worker authorization', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await page.getByLabel('Weekly declared quantity', { exact: true }).fill('8');
    await page.getByLabel('Capacity unit', { exact: true }).selectOption('HOURS');
    await page.getByLabel('Effective from', { exact: true }).fill('2027-01-01T00:00');
    await page.getByLabel('Effective to', { exact: true }).fill('2027-01-08T00:00');
    await page
      .getByLabel('Worker capacity authorization', { exact: true })
      .selectOption({ label: 'Capacity · Synthetic browser policy v1' });
    await page.getByRole('button', { name: 'Record declared capacity', exact: true }).click();
    await expect(page.getByText(/8 HOURS/)).toBeVisible();
    await axe(page, 'revised-mobile-artisan-record');
    await page
      .getByRole('link', {
        name: 'Browse complete authorization, capacity and assignment history',
        exact: true,
      })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Participant history');
    await page.getByRole('button', { name: 'Capacity', exact: true }).click();
    await expect(page.getByRole('heading', { name: '8 HOURS', exact: true })).toBeVisible();
    await axe(page, 'revised-participant-history');
    await page.goto('/operator');
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    expect((await coordCtx.request.get('/api/v1/operator/dashboard')).status()).toBe(403);
    await mutate(
      adminCtx.request,
      `admin/coordinators/${coordId}/status`,
      { status: 'SUSPENDED', reason },
      'PATCH',
    );
    await page.goto('/association/artisans');
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic Assisted Artisan', { exact: true })).toHaveCount(0);
  } finally {
    await adminCtx.close();
    await coordCtx.close();
  }
});

test('buyer and administrator default workspaces are distinct and participant concerns require no account', async ({
  browser,
  request,
  page,
}) => {
  const admin = await browser.newContext({ baseURL: origin }),
    buyer = await browser.newContext({ baseURL: origin }),
    operator = await browser.newContext({ baseURL: origin });
  try {
    const ae = 'foundation-routing-admin@example.com',
      be = 'foundation-routing-buyer@example.com';
    await register(admin.request, ae);
    await register(buyer.request, be);
    expect(
      (await request.post(`${process.env.E2E_CONTROL_URL}/promote?email=${ae}`)).ok(),
    ).toBeTruthy();
    await loginApi(admin.request, ae);
    await loginApi(buyer.request, be);
    const company = await mutate(buyer.request, 'organizations', {
      name: 'Synthetic Buyer Company',
      type: 'BUYER_BUSINESS',
      region: 'Tunis',
      description: 'Synthetic buyer organization for default role routing.',
      contactEmail: be,
      representativeName: 'Synthetic Representative',
      country: 'TN',
      contactPhone: '',
    });
    await mutate(buyer.request, `organizations/${company.id}/submit-approval`, {});
    await mutate(admin.request, `admin/organizations/${company.id}/approve`, { reason });

    const oe = 'foundation-routing-operator@example.com';
    await register(operator.request, oe);
    const operatorId = await loginApi(operator.request, oe);
    const internal = await mutate(admin.request, 'organizations', {
      name: 'Synthetic Internal NASJ',
      type: 'INTERNAL',
      region: 'Tunis',
      description: 'Synthetic internal organization for operator routing.',
      contactEmail: ae,
      representativeName: 'Synthetic Administrator',
      country: 'TN',
      contactPhone: '',
    });
    await mutate(admin.request, `organizations/${internal.id}/submit-approval`, {});
    await mutate(admin.request, `admin/organizations/${internal.id}/approve`, { reason });
    await mutate(admin.request, 'admin/personnel/invite', {
      organizationId: internal.id,
      email: oe,
      persona: 'NASJ_OPERATOR',
      reason,
    });
    const invitation = await (
      await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${oe}&kind=invitation`)
    ).json();
    await mutate(operator.request, 'invitations/accept', { token: invitation.token });
    await mutate(admin.request, 'admin/operator-assignments', {
      operatorId,
      organizationId: company.id,
      enabled: true,
      reason,
    });
    await operator.request.post('/api/auth/sign-out', { headers: { Origin: origin }, data: {} });
    const op = await operator.newPage();
    await signIn(op, oe, '/operator');
    await expect(
      op.getByRole('heading', { name: 'Synthetic Buyer Company', exact: true }),
    ).toBeVisible();
    const operatorNav = op.getByRole('navigation', { name: 'Account navigation', exact: true });
    await expect(
      operatorNav.getByRole('link', { name: 'Procurement requests', exact: true }),
    ).toBeVisible();
    await expect(operatorNav.getByRole('link', { name: 'User accounts', exact: true })).toHaveCount(
      0,
    );
    await expect(
      operatorNav.getByRole('link', { name: 'Assigned artisan registry', exact: true }),
    ).toHaveCount(0);
    await axe(op, 'revised-operator-dashboard');
    await op.screenshot({ path: '.local/nasj-role-operator-desktop.png', fullPage: true });
    await op
      .getByRole('navigation', { name: 'Workspace actions', exact: true })
      .getByRole('link', { name: 'Assigned account activity', exact: true })
      .click();
    await expect(op.getByRole('heading', { level: 1 })).toHaveText('Assigned account activity');
    await axe(op, 'revised-operator-activity');
    await buyer.request.post('/api/auth/sign-out', { headers: { Origin: origin }, data: {} });
    const bp = await buyer.newPage();
    await signIn(bp, be, '/buyer');
    await expect(bp.getByRole('heading', { level: 1 })).toHaveText('Your company workspace');
    const buyerNav = bp.getByRole('navigation', { name: 'Account navigation', exact: true });
    await expect(
      buyerNav.getByRole('link', { name: 'Procurement requests', exact: true }),
    ).toBeVisible();
    await expect(buyerNav.getByRole('link', { name: 'User accounts', exact: true })).toHaveCount(0);
    await axe(bp, 'buyer-role-dashboard');
    await bp.screenshot({ path: '.local/nasj-role-buyer-desktop.png', fullPage: true });
    await bp.goto('/commerce/operator');
    await expect(bp.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    await bp.goto('/admin/users');
    await expect(bp.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    await bp.goto('/association');
    await expect(bp.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    await admin.request.post('/api/auth/sign-out', { headers: { Origin: origin }, data: {} });
    const ap = await admin.newPage();
    await signIn(ap, ae, '/admin');
    const adminNav = ap.getByRole('navigation', { name: 'Account navigation', exact: true });
    await expect(adminNav.getByRole('link', { name: 'User accounts', exact: true })).toBeVisible();
    await expect(
      adminNav.getByRole('link', { name: 'Organization approvals', exact: true }),
    ).toBeVisible();
    await expect(
      adminNav.getByRole('link', { name: 'Procurement requests', exact: true }),
    ).toHaveCount(0);
    await axe(ap, 'admin-role-dashboard');
    await ap.screenshot({ path: '.local/nasj-role-admin-desktop.png', fullPage: true });
    await ap
      .getByRole('navigation', { name: 'Workspace actions', exact: true })
      .getByRole('link', { name: 'Access diagnostics', exact: true })
      .click();
    await expect(ap.getByRole('heading', { level: 1 })).toHaveText('Access diagnostics');
    await axe(ap, 'revised-admin-access-report');
    await page.goto('/participant-support');
    await page
      .getByLabel('Participant or offer reference', { exact: true })
      .fill('synthetic-disputed-reference');
    await page
      .getByLabel('Describe the concern', { exact: true })
      .fill('Synthetic incorrectly recorded decision requires independent review.');
    await page
      .getByRole('button', { name: 'Send concern for independent review', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('sent for independent NASJ review');
    await axe(page, 'revised-public-participant-support');
    await ap.goto('/admin/participant-concerns');
    await expect(
      ap.getByText('Reference: synthetic-disputed-reference', { exact: true }),
    ).toBeVisible();
  } finally {
    await admin.close();
    await buyer.close();
    await operator.close();
  }
});
