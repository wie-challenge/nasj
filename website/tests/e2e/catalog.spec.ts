import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BuyerCatalog, CommerceWorkspaceView } from '@nasj/contracts';

const password = 'Synthetic-commerce-browser-password-2026!';
const origin = 'http://127.0.0.1:3100';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Catalog Persona', password },
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
async function accessible(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach(label, {
    body: JSON.stringify({ violations: result.violations }),
    contentType: 'application/json',
  });
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const profile of [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`synthetic catalog browses safely and prefills a persisted RFQ on ${profile.name}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize(profile);
    const suffix = `catalog-${profile.name}`;
    for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider'])
      await register(request, `commerce-${role}-${suffix}@example.com`);
    const seed = await request.post(
      `${process.env.E2E_CONTROL_URL}/commerce-fixture?suffix=${suffix}`,
    );
    expect(seed.ok()).toBeTruthy();
    const fixture = await seed.json();
    await login(page, `commerce-buyer-${suffix}@example.com`);
    await page.goto('/commerce/catalog');
    await expect(page.getByRole('heading', { name: 'Craft and example catalog' })).toBeVisible();
    const runner = page.getByRole('article', { name: 'Woven table runner', exact: true });
    await expect(runner.getByText('Synthetic example · Illustrative only')).toBeVisible();
    await expect(runner.getByText(/Indicative lead time: 14–28 days/)).toBeVisible();
    await expect(runner.getByRole('img')).toBeVisible();
    await runner.getByRole('img').scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        runner.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const vase = page.getByRole('article', { name: 'Decorative ceramic vase', exact: true });
    await expect(vase.getByText('Synthetic example · Unavailable')).toBeVisible();
    await expect(vase.getByRole('link')).toHaveCount(0);
    const panel = page.getByRole('article', { name: 'Embroidered decorative panel', exact: true });
    await expect(panel.getByText(/No example image available/)).toBeVisible();
    await accessible(page, `catalog-${profile.name}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.local/catalog-${profile.name}.png`, fullPage: true });
    await page.getByRole('combobox', { name: 'Browse craft', exact: true }).selectOption('other');
    await expect(page.getByText('No examples are available in this category yet.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Browse craft', exact: true }).selectOption('weaving');
    const start = page.getByRole('link', { name: 'Start RFQ for Woven table runner', exact: true });
    await start.focus();
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/commerce\/buyer\?example=woven-table-runner-v1/);
    await expect(page.getByLabel('Request title', { exact: true })).toHaveValue(
      'Synthetic Woven table runner',
    );
    await expect(page.getByLabel('Craft', { exact: true })).toHaveValue('weaving');
    await expect(
      page.getByRole('textbox', { name: 'Craft specification', exact: true }),
    ).toHaveValue(/Fictional cotton table runner/);
    for (const field of ['Requested pieces', 'Delivery deadline', 'Delivery location'])
      await expect(page.getByLabel(field, { exact: true })).toHaveValue('');
    await page
      .getByLabel('Buyer organization', { exact: true })
      .selectOption(fixture.buyerOrganizationId);
    await page
      .getByLabel('Responsible operator organization', { exact: true })
      .selectOption(fixture.operatorOrganizationId);
    await page
      .getByRole('textbox', { name: 'Craft specification', exact: true })
      .fill('Buyer-confirmed synthetic cotton runner, 130 × 30 cm.');
    await page.getByLabel('Requested pieces', { exact: true }).fill('10');
    await page
      .getByLabel('Delivery deadline', { exact: true })
      .fill(fixture.deliveryAt.slice(0, 16));
    await page
      .getByLabel('Delivery location', { exact: true })
      .fill('Synthetic Tunis collection point');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/commerce/rfqs') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save RFQ draft', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON().catalogExampleId).toBe('woven-table-runner-v1');
    await expect(
      page.getByRole('heading', { name: 'Synthetic Woven table runner', exact: true }),
    ).toBeVisible();
    await page.reload();
    const state = (await (
      await page.request.get('/api/v1/commerce/workspace')
    ).json()) as CommerceWorkspaceView;
    expect(state.rfqs[0].status).toBe('DRAFT');
    expect(state.rfqs[0].specification).toBe(
      'Buyer-confirmed synthetic cotton runner, 130 × 30 cm.',
    );
    expect(state.orders).toHaveLength(0);
    await accessible(page, `catalog-rfq-${profile.name}`);
    await page.goto('/commerce/buyer?example=decorative-vase-v1');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'unavailable or no longer active',
    );
    await expect(page.getByRole('button', { name: 'Save RFQ draft', exact: true })).toHaveCount(0);
    await page.goto('/commerce/buyer?example=forged-example');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'unavailable or no longer active',
    );
  });
}

test('catalog loading, retry, empty and broken-image states remain usable', async ({
  page,
  request,
}) => {
  await register(request, 'catalog-states@example.com');
  await login(page, 'catalog-states@example.com');
  const url = '**/api/v1/commerce/catalog';
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    await hold;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Catalog temporarily unavailable.' }),
    });
  });
  await page.goto('/commerce/catalog');
  await expect(page.getByRole('status')).toContainText('Loading workspace');
  release!();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Catalog temporarily unavailable',
  );
  await page.unroute(url);
  await page.route(url, (route) =>
    route.fulfill({
      json: { version: 1, provenance: 'SYNTHETIC', categories: [] } satisfies BuyerCatalog,
    }),
  );
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByText('No craft categories are available. Please check again later.'),
  ).toBeVisible();
  await page.unroute(url);
  await page.route('**/catalog/woven-runner.svg', (route) => route.abort());
  await page.reload();
  const runner = page.getByRole('article', { name: 'Woven table runner', exact: true });
  await runner.scrollIntoViewIfNeeded();
  await expect(runner.getByText(/No example image available/)).toBeVisible();
  await expect(runner.getByRole('link')).toBeVisible();
  await accessible(page, 'catalog-image-fallback');
});
