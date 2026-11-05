import { expect, test, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-commerce-browser-password-2026!';
async function register(request: import('@playwright/test').APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Commercial Persona', password },
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
test('buyer accepts the exact costed quotation after feasibility review', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  page.on('dialog', (dialog) => dialog.accept());
  const suffix = `c${Date.now().toString(36)}`;
  await register(request, `commercial-buyer-${suffix}@example.com`);
  await register(request, `commercial-operator-${suffix}@example.com`);
  const seeded = await request.post(
    `${process.env.E2E_CONTROL_URL}/commercial-fixture?suffix=${suffix}`,
  );
  expect(seeded.ok()).toBeTruthy();
  const fixture = (await seeded.json()) as {
    rfqId: string;
    periodStart: string;
    periodEnd: string;
    expiresAt: string;
  };
  await login(page, `commercial-operator-${suffix}@example.com`);
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Quotes', exact: true }).click();
  const assess = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Assess feasibility', exact: true }),
  });
  await assess
    .getByLabel('Production period start (Africa/Tunis)', { exact: true })
    .fill(fixture.periodEnd);
  await assess
    .getByLabel('Production period end (Africa/Tunis)', { exact: true })
    .fill(fixture.periodStart);
  await assess.getByRole('button', { name: 'Assess feasibility', exact: true }).click();
  await expect(assess.getByRole('alert')).toContainText('Check the highlighted fields.');
  await assess.getByLabel('Capacity unit', { exact: true }).selectOption('HOURS');
  await assess
    .getByLabel('Production period start (Africa/Tunis)', { exact: true })
    .fill(fixture.periodStart);
  await assess
    .getByLabel('Production period end (Africa/Tunis)', { exact: true })
    .fill(fixture.periodEnd);
  await assess.getByRole('button', { name: 'Assess feasibility', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Feasibility v1 · NOT FEASIBLE' })).toBeVisible();
  await assess.getByLabel('Capacity unit', { exact: true }).selectOption('PIECES');
  await assess.getByRole('button', { name: 'Assess feasibility', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Feasibility v2 · NEEDS REVIEW' })).toBeVisible();
  await assess
    .getByLabel('Material attestation', { exact: true })
    .selectOption('CONFIRMED_AVAILABLE');
  await assess
    .getByLabel('Material source, when attested', { exact: true })
    .fill('Synthetic warehouse attestation');
  await assess.getByLabel('Logistics lead days, when known', { exact: true }).fill('3');
  await assess.getByRole('checkbox', { name: 'Reviewed calendar shows no known conflict' }).check();
  await assess
    .getByLabel('Calendar source, when cleared', { exact: true })
    .fill('Synthetic reviewed calendar');
  await assess.getByRole('button', { name: 'Assess feasibility', exact: true }).click();
  const feasible = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Feasibility v3 · FEASIBLE' }) });
  await expect(feasible).toBeVisible();
  await expect(feasible.getByText('Known remaining 130.00')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Hidden commercial');
  await expect(page.getByRole('main')).not.toContainText('+21699000222');
  const cost = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Save cost version', exact: true }),
  });
  for (const [name, rate] of [
    ['MATERIALS', '2.000'],
    ['ARTISAN_LABOR', '3.000'],
    ['QUALITY_ASSURANCE', '30.000'],
    ['LOGISTICS', '20.000'],
    ['OVERHEAD', '50.000'],
    ['CONTINGENCY', '0.000'],
  ] as const)
    await cost.getByLabel(`${name} rate in TND`, { exact: true }).fill(rate);
  await cost.getByLabel('Margin rule', { exact: true }).selectOption('MARKUP_ON_COST');
  await cost.getByLabel('Margin basis points', { exact: true }).fill('1000');
  await cost.getByRole('button', { name: 'Save cost version', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cost v1 · 660.000 TND' })).toBeVisible();
  const issue = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Issue costed quotation', exact: true }),
  });
  await issue.getByLabel('Costed quote expires', { exact: true }).fill(fixture.expiresAt);
  await issue
    .getByLabel('Payment terms', { exact: true })
    .fill('Synthetic milestone, no live payment.');
  await issue
    .getByLabel('Delivery conditions', { exact: true })
    .fill('Synthetic collection at the stated site.');
  await issue.getByRole('button', { name: 'Issue costed quotation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quotation v1 · 660.000 TND' })).toBeVisible();
  await login(page, `commercial-buyer-${suffix}@example.com`);
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Quotes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quotation v1 · 660.000 TND' })).toBeVisible();
  await expect(page.getByText('Tax is pending legal review', { exact: false })).toBeVisible();
  await expect(page.getByText(/Acceptance does not\s+reserve capacity/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('ARTISAN_LABOR');
  const detail = await page.request.get(`/api/v1/procurement/rfqs/${fixture.rfqId}`);
  expect(detail.ok()).toBeTruthy();
  const before = (await detail.json()) as {
    rfq: { version: number };
    quotes: { id: string; totalTnd: string; termsSha256: string }[];
  };
  await page.getByRole('checkbox', { name: /I approve this exact/ }).check();
  await page.getByRole('button', { name: 'Accept quotation v1', exact: true }).click();
  await expect(page.getByText('ACCEPTED.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quotation v1 · 660.000 TND' })).toBeVisible();
  const me = await page.request.get('/api/v1/me');
  const stale = await page.request.post(`/api/v1/procurement/rfqs/${fixture.rfqId}/accept`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': ((await me.json()) as { csrfToken: string }).csrfToken,
      'Idempotency-Key': 'stale-commercial-accept-01', // gitleaks:allow -- Fixed synthetic request replay identifier, not authentication.
    },
    data: {
      version: before.rfq.version,
      quoteId: before.quotes[0].id,
      confirm: true,
      termsSha256: 'a'.repeat(64),
    },
  });
  expect(stale.status()).toBe(409);
  const accepted = await page.request.get(`/api/v1/procurement/rfqs/${fixture.rfqId}`);
  const after = (await accepted.json()) as {
    quotes: { totalTnd: string; status: string; termsSha256: string }[];
    costs: unknown[];
  };
  expect(after.quotes[0].status).toBe('ACCEPTED');
  expect(after.quotes[0].totalTnd).toBe('660.000');
  expect(after.quotes[0].termsSha256).toBe(before.quotes[0].termsSha256);
  expect(after.costs).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByRole('heading', { name: 'Quotation v1 · 660.000 TND' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
