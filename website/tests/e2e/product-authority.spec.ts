import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ actionTimeout: 15000 });
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-product-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic product persona', password },
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
  await page.goto('/auth/login?next=%2Fcatalog');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
}
async function signout(page: Page) {
  const response = await page.request.post('/api/auth/sign-out', {
    headers: { Origin: origin },
    data: {},
  });
  expect(response.ok()).toBeTruthy();
}
async function command(page: Page, path: string, data: unknown) {
  const me = await (await page.request.get('/api/v1/me')).json();
  const r = await page.request.post(`/api/v1/catalog${path}`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': me.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data,
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
for (const viewport of [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`paid sample explicit consent and rejection retain obligation on ${viewport.name}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    const suffix = `product-${viewport.name}`;
    const email = (role: string) => `commerce-${role}-${suffix}@example.com`;
    for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider'])
      await register(request, email(role));
    const seed = await request.post(
      `${process.env.E2E_CONTROL_URL}/product-authority-fixture?suffix=${suffix}`,
    );
    expect(seed.ok()).toBeTruthy();
    const fixture = await seed.json();
    await login(page, email('operator'));
    await expect(
      page.getByText('No product specification exists for your organization yet.'),
    ).toBeVisible();
    const product = await command(page, '/specifications', {
      productCode: `BROWSER-${viewport.name.toUpperCase()}`,
      name: 'Synthetic browser runner',
      craftSkillId: 'weaving',
      revision: {
        revisionNumber: 1,
        description: 'Synthetic approved runner standard',
        dimensions: '130 x 30 cm',
        unit: 'cm',
        materials: [
          { materialCode: 'cotton', name: 'Cotton cloth', quantity: '1.500', unit: 'METERS' },
        ],
        instructions: 'Measure and weave to approved tolerances.',
        tolerances: '+/- 1cm',
        qualityCriteria: 'Dimensions and trim match the approved sample.',
        referenceImages: [],
      },
    });
    await page.reload();
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Approved', exact: true })).toBeVisible();
    await signout(page);
    await login(page, email('buyer'));
    const sample = await command(page, '/samples', {
      revisionId: product.revisionId,
      buyerOrganizationId: fixture.buyerOrganizationId,
      operatorOrganizationId: fixture.operatorOrganizationId,
      sampleQuantity: 1,
      responsibleArtisanProfileId: fixture.artisanProfileId,
      workTerms: 'Payment on completion regardless of bulk award.',
      materialResponsibility: 'Operator supplies cotton; no reimbursement.',
      plannedCompletion: fixture.deliveryAt,
    });
    await signout(page);
    await login(page, email('operator'));
    await page.getByLabel('Agreed compensation (TND)').fill('45.001');
    await page.getByRole('button', { name: 'Issue sample terms' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The artisan must review' }),
    ).toBeVisible();
    await signout(page);
    await login(page, email('artisan'));
    await expect(page.getByText('Acceptance criteria:', { exact: false })).toBeVisible();
    const accept = page.getByRole('button', { name: 'Accept these sample terms' });
    await accept.focus();
    await expect(accept).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Completion evidence')).toBeVisible();
    await page.getByLabel('Completion evidence').fill('Synthetic browser sample completion');
    await page.getByRole('button', { name: 'Submit sample work', exact: true }).click();
    await expect(page.getByText(/Sample obligation: 45.001 TND/)).toBeVisible();
    await signout(page);
    await login(page, email('operator'));
    await page.getByRole('button', { name: 'Record inspection pass' }).click();
    await expect(page.getByText('Under review', { exact: true })).toBeVisible();
    await signout(page);
    await login(page, email('buyer'));
    await page.getByRole('button', { name: 'Reject sample', exact: true }).click();
    await expect(page.getByText('Rejected', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Sample obligation: 45.001 TND/)).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.route('**/api/v1/catalog', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'TEST_UNAVAILABLE', message: 'Synthetic temporary outage' }),
      }),
    );
    await page.reload();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Synthetic temporary outage',
    );
    await page.unroute('**/api/v1/catalog');
    await page.getByRole('button', { name: /try again/i }).click();
    await expect(page.getByText(/Sample obligation: 45.001 TND/)).toBeVisible();
    expect(sample.id).toBeTruthy();
  });
}
