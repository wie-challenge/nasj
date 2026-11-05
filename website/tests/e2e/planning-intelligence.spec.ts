import { expect, test, type Page } from '@playwright/test';
test.use({ actionTimeout: 15000 });
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-planning-browser-password-2026!';
async function register(request: import('@playwright/test').APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic planning persona', password },
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
async function login(page: Page, email: string, next: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}
test('operator plans from recorded ranking, reviews material assumptions and compares explicit pricing scenarios', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const suffix = `p${Date.now().toString(36)}`;
  const operator = `production-operator-${suffix}@example.com`;
  for (const email of [
    operator,
    `production-artisan-${suffix}@example.com`,
    `production-coordinator-${suffix}@example.com`,
  ])
    await register(request, email);
  const fixture = await request.post(
    `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
  );
  expect(fixture.ok(), await fixture.text()).toBeTruthy();
  const { rfqId } = await fixture.json();
  await login(page, operator, '/operator/planning');
  const details = await (await page.request.get(`/api/v1/procurement/rfqs/${rfqId}`)).json();
  const me = await (await page.request.get('/api/v1/me')).json();
  const assessments = await page.request.post(
    `/api/v1/procurement/orders/${details.orderId}/eligibility-assessments`,
    {
      headers: {
        Origin: origin,
        'X-CSRF-Token': me.csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: {
        version: (
          await (
            await page.request.get(`/api/v1/procurement/orders/${details.orderId}/planning`)
          ).json()
        ).orderVersion,
        restrictionsReviewed: true,
        restrictionSource: 'Synthetic product restrictions reviewed in browser fixture.',
      },
    },
  );
  expect(assessments.status(), await assessments.text()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Open planning', exact: true }).click();
  await page.getByRole('link', { name: 'Plan this order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidate groups', exact: true })).toBeVisible();
  await expect(page.getByText(/weight version/)).toBeVisible();
  await page.getByLabel('Material readiness assumption', { exact: true }).selectOption('READY');
  await page
    .getByLabel('Material readiness evidence or assumption reference', { exact: true })
    .fill('SYNTHETIC: ready material assumption for planning, not actual receipt.');
  await page.getByRole('button', { name: 'Save draft plan', exact: true }).click();
  await expect(
    page.getByText('Draft allocation plan saved. It is not a production commitment.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review plan', exact: true }).click();
  await expect(
    page.getByText('Plan reviewed. It is still not a production commitment.'),
  ).toBeVisible();
  await page.getByText('Record a human selection override', { exact: true }).click();
  await page.getByLabel('Override quantity', { exact: true }).fill('1');
  await page
    .getByLabel('Reason for alternative selection', { exact: true })
    .fill('SYNTHETIC manager selection adjustment within confirmed capacity.');
  await page.getByRole('button', { name: 'Record selection override', exact: true }).click();
  await expect(
    page.getByText('Override recorded. Re-review this draft before issuing offers.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review plan', exact: true }).click();
  await page
    .getByLabel('Audit review purpose', { exact: true })
    .fill('Review synthetic allocation exposure and human selection decisions.');
  await page.getByRole('button', { name: 'Review recorded recommendations', exact: true }).click();
  await expect(page.getByText(/Human overrides: 1/)).toBeVisible();
  await page
    .getByLabel('Audit finding', { exact: true })
    .fill('Synthetic review: available evidence is sparse; no worker penalty justified.');
  await page
    .getByLabel('Human corrective decision', { exact: true })
    .fill('Review the next allocation with the responsible production coordinator.');
  await page.getByRole('button', { name: 'Record reviewed finding', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Review findings' })).toContainText(
    'no worker penalty justified',
  );
  await page.getByLabel('Minimum minutes per piece (optional)', { exact: true }).fill('15');
  await page.getByLabel('Maximum minutes per piece (optional)', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Calculate suggestion', exact: true }).click();
  await expect(page.getByText(/Effort range: 15–30 minutes per piece/)).toBeVisible();
  await page
    .getByLabel('Assumed weekly pieces per group (unknown when blank)', { exact: true })
    .fill('50');
  await page.getByLabel('Assumed material ready date', { exact: true }).fill('2027-08-01T09:00');
  await page.getByLabel('Comparison material buffer (days)', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Simulate deadline', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Material buffer comparison', exact: true }),
  ).toBeVisible();
  await page.goto('/intelligence');
  await expect(
    page.getByRole('heading', { name: 'Production intelligence and analytics', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No production batch exists to assess.')).toBeVisible();
  await expect(page.getByText(/Reporting period:/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Reporting month', { exact: true }).focus();
  const evaluate = page.getByRole('button', {
    name: 'Evaluate recorded risk and alerts',
    exact: true,
  });
  for (
    let segment = 0;
    segment < 4 && !(await evaluate.evaluate((el) => el === document.activeElement));
    segment++
  )
    await page.keyboard.press('Tab');
  await expect(evaluate).toBeFocused();
  await page
    .getByRole('button', { name: 'Evaluate recorded risk and alerts', exact: true })
    .click();
  await expect(
    page.getByText('Recorded. The underlying production facts and agreements are unchanged.'),
  ).toBeVisible();
});

test('unprivileged production intelligence read shows an honest error without exposing totals', async ({
  page,
  request,
}) => {
  const email = `planning-denied-${Date.now()}@example.com`;
  await register(request, email);
  await login(page, email, '/intelligence');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Analytics access is required',
  );
  await expect(
    page.getByRole('heading', { name: 'Compensation, kept separate', exact: true }),
  ).toHaveCount(0);
});
