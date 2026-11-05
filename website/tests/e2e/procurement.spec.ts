import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ actionTimeout: 15000 });
const origin = 'http://127.0.0.1:3100',
  password = 'Synthetic-commerce-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Procurement Persona', password },
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
  await page.goto('/auth/login?next=%2Fprocurement');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/procurement$/);
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
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
async function quote(page: Page, expiresAt: string, total: string) {
  await tab(page, 'Quotes');
  await page.getByLabel('Total price including configured tax (TND)', { exact: true }).fill(total);
  await page.getByLabel('Quote expires', { exact: true }).fill(expiresAt.slice(0, 16));
  await page
    .getByLabel('Current price review', { exact: true })
    .fill('Synthetic current price reviewed for this exact request.');
  await page
    .getByLabel('Current capacity review', { exact: true })
    .fill('Synthetic declared capacity reviewed; availability needs renewed agreement.');
  await page
    .getByLabel('Current materials review', { exact: true })
    .fill('Fictional materials checked for this request version.');
  await page
    .getByLabel('Reviewed synthetic tax policy reference', { exact: true })
    .fill('SYNTHETIC-ZERO-RATE-POLICY');
  await page.getByRole('button', { name: 'Issue quotation', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: `Quotation v${total === '100.001' ? '1' : '2'} · ${total} TND`,
      exact: true,
    }),
  ).toBeVisible();
}
for (const viewport of [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`E02 buyer and operator complete versioned procurement on ${viewport.name}`, async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240000);
    await page.setViewportSize(viewport);
    page.on('dialog', (d) => d.accept());
    const suffix = `e02-${viewport.name}`;
    for (const role of ['buyer', 'operator', 'artisan', 'quality', 'outsider'])
      await register(request, `commerce-${role}-${suffix}@example.com`);
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/commerce-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok()).toBeTruthy();
    const fixture = await seeded.json();
    await login(page, `commerce-buyer-${suffix}@example.com`);
    await page.getByText('Create a request', { exact: true }).click();
    await page
      .getByLabel('NASJ team', { exact: true })
      .selectOption(fixture.operatorOrganizationId);
    await page
      .getByLabel('Request title', { exact: true })
      .fill('Synthetic revised procurement runner');
    await page.getByLabel('Craft', { exact: true }).selectOption('weaving');
    await page
      .getByLabel('Specification', { exact: true })
      .fill('Synthetic cotton runner, exact design version one.');
    await page
      .getByLabel('Design requirements', { exact: true })
      .fill('Synthetic blue border and confirmed dimensions.');
    await page.getByLabel('Quantity in pieces', { exact: true }).fill('10');
    await page
      .getByLabel('Delivery deadline', { exact: true })
      .fill(fixture.deliveryAt.slice(0, 16));
    await page
      .getByLabel('Delivery destination', { exact: true })
      .fill('Synthetic Tunis collection point');
    await page.route(
      '**/api/v1/procurement/rfqs',
      (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'VALIDATION_ERROR',
            message: 'Check the submitted fields.',
            fieldErrors: { quantity: ['Confirm the requested quantity.'] },
          }),
        }),
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByLabel('Quantity in pieces', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByText('Confirm the requested quantity.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page).toHaveURL(/\/procurement\/[a-zA-Z0-9_-]+$/);
    const url = page.url();
    await expect(
      page.getByRole('heading', { name: 'Synthetic revised procurement runner', exact: true }),
    ).toBeVisible();
    await tab(page, 'References');
    await page.getByLabel('Reference image', { exact: true }).setInputFiles({
      name: 'unsafe.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ executable disguised as a picture'),
    });
    await page.getByRole('button', { name: 'Upload reference image', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('valid PNG');
    await page
      .getByLabel('Reference image', { exact: true })
      .setInputFiles('tests/fixtures/reference.png');
    await page.getByRole('button', { name: 'Upload reference image', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Preview reference.webp', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Preview reference.webp', exact: true }).click();
    await expect(page.getByAltText('Reference: reference.webp', { exact: true })).toBeVisible();
    await axe(page, `procurement-references-${viewport.name}`);
    await tab(page, 'Details');
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toHaveCount(
      0,
    );
    const context = await browser.newContext({ viewport });
    const operator = await context.newPage();
    try {
      await login(operator, `commerce-operator-${suffix}@example.com`);
      await operator
        .getByRole('link', { name: 'Synthetic revised procurement runner', exact: true })
        .click();
      await operator.getByRole('button', { name: 'Start review', exact: true }).click();
      await expect(operator.getByRole('button', { name: 'Start review', exact: true })).toHaveCount(
        0,
      );
      await tab(operator, 'Clarifications');
      await operator
        .getByLabel('Question', { exact: true })
        .fill('Which synthetic border should this version use?');
      await operator.getByRole('button', { name: 'Ask a question', exact: true }).click();
      await expect(
        operator.getByRole('heading', {
          name: 'Which synthetic border should this version use?',
          exact: true,
        }),
      ).toBeVisible();
      await tab(operator, 'Discussion');
      await operator
        .getByLabel('Message', { exact: true })
        .fill('Internal test note hidden from buyers.');
      await operator
        .getByLabel('Internal note, hidden from buyers and coordinators', { exact: true })
        .check();
      await operator.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(
        operator.getByText('Internal test note hidden from buyers.', { exact: true }),
      ).toBeVisible();
      await page.reload();
      await tab(page, 'Clarifications');
      await page.getByLabel('Your answer', { exact: true }).fill('Use the fictional blue border.');
      await page.getByRole('button', { name: 'Send answer', exact: true }).click();
      await expect(
        page.getByText('Buyer answer: Use the fictional blue border.', { exact: true }),
      ).toBeVisible();
      await tab(page, 'Discussion');
      await expect(
        page.getByText('Internal test note hidden from buyers.', { exact: true }),
      ).toHaveCount(0);
      await page
        .getByLabel('Message', { exact: true })
        .fill('<script>window.procurementUnsafe=true</script> Plain buyer text.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(
        page.getByText('<script>window.procurementUnsafe=true</script> Plain buyer text.', {
          exact: true,
        }),
      ).toBeVisible();
      expect(await page.evaluate(() => Object.hasOwn(window, 'procurementUnsafe'))).toBe(false);
      await operator.reload();
      await quote(operator, fixture.quoteExpiresAt, '100.001');
      await page.reload();
      await tab(page, 'Quotes');
      await expect(
        page.getByRole('heading', { name: 'Quotation v1 · 100.001 TND', exact: true }),
      ).toBeVisible();
      await tab(page, 'Details');
      await page.getByText('Propose a revised specification', { exact: true }).click();
      await page.getByLabel('Quantity in pieces', { exact: true }).fill('8');
      await page
        .getByLabel('Reason for revision', { exact: true })
        .fill('Reduce the fictional quantity after quote review.');
      await page.getByRole('button', { name: 'Save revision', exact: true }).click();
      await tab(page, 'Quotes');
      await expect(
        page.getByRole('button', { name: 'Accept quotation v1', exact: true }),
      ).toHaveCount(0);
      await tab(page, 'Revisions');
      await expect(
        page.getByText('Reduce the fictional quantity after quote review.', { exact: false }),
      ).toBeVisible();
      await axe(page, `procurement-history-${viewport.name}`);
      await operator.reload();
      await operator.getByRole('button', { name: 'Start review', exact: true }).click();
      await expect(operator.getByRole('button', { name: 'Start review', exact: true })).toHaveCount(
        0,
      );
      await quote(operator, fixture.quoteExpiresAt, '88.888');
      await tab(operator, 'Samples');
      await operator
        .getByLabel('Sample evidence reference', { exact: true })
        .fill('SYNTHETIC-SAMPLE-V1');
      await operator
        .getByLabel('Sample acceptance criteria', { exact: true })
        .fill('Synthetic dimensions and blue border for eight pieces.');
      await operator.getByRole('button', { name: 'Publish sample version', exact: true }).click();
      await expect(operator.getByRole('heading', { name: 'Sample v1', exact: true })).toBeVisible();
      await page.reload();
      await tab(page, 'Samples');
      await page.getByLabel('Sample decision', { exact: true }).selectOption('APPROVED');
      await page
        .getByLabel('Decision comments', { exact: true })
        .fill('The exact fictional sample is approved.');
      await page.getByRole('button', { name: 'Record sample decision', exact: true }).click();
      await expect(
        page.getByText('Latest sample and specification approved.', { exact: true }),
      ).toBeVisible();
      await axe(page, `procurement-sample-${viewport.name}`);
      await tab(page, 'Quotes');
      await page
        .getByLabel(
          'I approve this exact specification, quantity, total, deadline and quotation version.',
          { exact: true },
        )
        .check();
      await page.getByRole('button', { name: 'Accept quotation v2', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Accept quotation v2', exact: true }),
      ).toHaveCount(0);
      await operator.reload();
      await tab(operator, 'Documents');
      await operator.getByRole('button', { name: 'Issue synthetic invoice', exact: true }).click();
      await expect(operator.getByRole('button', { name: /Download invoice \d+/ })).toBeVisible();
      await operator.getByLabel('Product code', { exact: true }).fill('SYNTHETIC-RUNNER');
      await operator
        .getByLabel('Compatible materials', { exact: true })
        .fill('Synthetic cotton yarn from the approved sample.');
      await operator.getByLabel('Observed lead time in days', { exact: true }).fill('7');
      await operator.getByLabel('Number of lead-time samples', { exact: true }).fill('2');
      await operator
        .getByLabel('Lead-time evidence and context', { exact: true })
        .fill('Two fictional samples, indicative only.');
      await operator
        .getByRole('button', { name: 'Publish approved product version', exact: true })
        .click();
      await expect(
        operator.getByRole('button', { name: 'Discontinue SYNTHETIC-RUNNER v1', exact: true }),
      ).toBeVisible();
      await page.goto('/procurement/documents');
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: /Download invoice \d+/ }).click();
      const file = await downloaded;
      expect(file.suggestedFilename()).toMatch(/^synthetic-invoice-\d+-v1.json$/);
      await axe(page, `procurement-documents-${viewport.name}`);
      await page.goto('/procurement/products');
      await page.getByText('Reorder this product', { exact: true }).click();
      await page.getByLabel('New quantity in pieces', { exact: true }).fill('5');
      await page
        .getByLabel('New delivery deadline', { exact: true })
        .fill(fixture.deliveryAt.slice(0, 16));
      await page
        .getByLabel('New delivery destination', { exact: true })
        .fill('New fictional destination');
      await page
        .getByLabel(
          'Confirm quantity, destination and deadline. Current price, capacity and materials must be reviewed again.',
          { exact: true },
        )
        .check();
      await page.getByRole('button', { name: 'Create reorder draft', exact: true }).click();
      await expect(page).toHaveURL(/\/procurement\/[a-zA-Z0-9_-]+$/);
      expect(page.url()).not.toBe(url);
      await expect(page.getByText('5 pieces', { exact: true })).toBeVisible();
      await tab(page, 'Quotes');
      await expect(page.getByText('No quotation issued yet.', { exact: true })).toBeVisible();
      await tab(page, 'Samples');
      await expect(
        page.getByText('No sample evidence has been published.', { exact: true }),
      ).toBeVisible();
      await axe(page, `procurement-reorder-${viewport.name}`);
      await page.screenshot({ path: `.local/e02-${viewport.name}.png`, fullPage: true });
    } finally {
      await context.close();
    }
  });
}
test('E02 shows field errors, empty records and a recoverable list failure', async ({
  page,
  request,
}) => {
  await register(request, 'e02-empty@example.com');
  await login(page, 'e02-empty@example.com');
  await expect(
    page.getByText(
      'No requests are available yet. Submitted requests appear for assigned operators.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.route('**/api/v1/procurement/rfqs?page=1', (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Temporary procurement outage.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Temporary procurement outage.',
  );
  await page.unroute('**/api/v1/procurement/rfqs?page=1');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByText(
      'No requests are available yet. Submitted requests appear for assigned operators.',
      { exact: true },
    ),
  ).toBeVisible();
  await axe(page, 'procurement-empty-recovery');
});
