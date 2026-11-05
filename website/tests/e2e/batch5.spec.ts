import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
const password = 'Synthetic-Batch5-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: { email, name: 'Synthetic Batch5 Participant', password },
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
  await page.context().clearCookies();
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}
function form(page: Page, label: string) {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: label, exact: true }) });
}
async function fill(page: Page, label: string, fields: Record<string, string>) {
  const target = form(page, label);
  for (const [name, value] of Object.entries(fields))
    await target.getByLabel(name, { exact: true }).fill(value);
  await target.getByRole('button', { name: label, exact: true }).click();
}
async function finances(page: Page, orderId: string) {
  await page.goto('/operator/finance');
  await fill(page, 'Open order finances', { 'Commercial order reference': orderId });
  await expect(
    page.getByRole('heading', { name: 'Financial controls and closure', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Loading workspace…')).toHaveCount(0);
}
test('Batch 5 real synthetic material custody, payout governance, dispute and blocked closure journeys', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const suffix = `b5-${Date.now().toString(36)}`;
  const email = (role: string) => `production-${role}-${suffix}@example.com`;
  for (const role of ['operator', 'artisan', 'coordinator', 'checker'])
    await register(request, email(role));
  const seeded = await request.post(
    `${process.env.E2E_CONTROL_URL}/batch5-fixture?suffix=${suffix}`,
  );
  expect(seeded.ok(), await seeded.text()).toBeTruthy();
  const fixture = (await seeded.json()) as {
    orderId: string;
    batchId: string;
    receiverOrganizationId: string;
  };
  await login(page, email('operator'), '/operator/inventory');
  await page.getByText('Register a material lot', { exact: true }).click();
  await fill(page, 'Register material lot', {
    'Material identity code': 'yarn',
    'Material name': 'Synthetic yarn',
    'Lot reference': `LOT-${suffix}`,
    'Supplier reference': 'Synthetic supplier',
    'Received quantity': '20',
    'Receipt evidence reference (operator reported)':
      'Synthetic warehouse entry, no independent verification',
  });
  const lot = page.getByRole('article', { name: `Material lot LOT-${suffix}` });
  await expect(lot).toContainText('Available 20.000');
  await fill(page, `Reserve LOT-${suffix}`, {
    'Approved production batch reference': fixture.batchId,
    'Quantity to reserve': '10',
    'Reservation reason': 'Synthetic accepted production requirement',
  });
  await expect(lot).toContainText('Available 10.000');
  await fill(page, 'Record outgoing handover', {
    'Receiving association reference': fixture.receiverOrganizationId,
    'Handed over quantity': '10',
    'Sender handover evidence reference': 'Synthetic sender custody report',
  });
  await expect(page.getByText('Material handover · Pending receiver confirmation')).toBeVisible();
  await login(page, email('artisan'), '/artisan/materials');
  await page.setViewportSize({ width: 390, height: 844 });
  await fill(page, 'Record material receipt or discrepancy', {
    'Quantity received': '9',
    'Damaged quantity': '1',
    'Recipient evidence reference': 'Synthetic authenticated recipient report',
    'Receipt note or shortage description': 'One meter missing and one meter damaged',
  });
  await expect(page.getByText('Material handover · Discrepancy reported')).toBeVisible();
  await expect(page.getByText(/Authenticated acknowledgement/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await login(page, email('operator'), '/operator/inventory');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('article', { name: `Material lot LOT-${suffix}` })).toContainText(
    'Damaged 1.000',
  );
  await fill(page, 'Record returned materials', {
    'Returned quantity': '1',
    'Return reason': 'Unused synthetic material returned for inspection',
    'Return evidence': 'Synthetic return custody record',
  });
  await expect(page.getByText(/Return 1.000.*Awaiting inspection/)).toBeVisible();
  await finances(page, fixture.orderId);
  await page.getByRole('button', { name: 'Save closure assessment', exact: true }).click();
  const assessment = page.locator('details').filter({ has: page.getByText(/^Recorded by /) });
  await expect(assessment).toHaveCount(1);
  await assessment.locator('summary').click();
  await expect(assessment.locator('pre')).toContainText('"verifiedPaidTnd": "0.000"');
  await expect(page.getByText(/Synthetic readiness does not verify payment/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await fill(page, 'Record pending buyer deposit', {
    'Claimed deposit amount (TND)': '10.000',
    'Buyer payment reference': `SYNTHETIC-${suffix}`,
    'Reported payment date': '2026-10-20T09:00',
    'Buyer deposit evidence reference': 'Synthetic operator claim; no bank evidence',
  });
  await expect(
    page.getByText(
      new RegExp(`10.000 TND · SYNTHETIC-${suffix.toUpperCase()} · Pending verification`),
    ),
  ).toBeVisible();
  await fill(page, 'Request payout approval', {
    'Requested payout amount (TND)': '5.000',
    'Payout request reason': 'Synthetic partial payout against recognized payable',
  });
  await fill(page, 'Independently approve payout', {
    'Independent approval reason': 'Self approval must be rejected by backend',
  });
  await expect(page.getByRole('alert').filter({ hasText: 'independent reviewer' })).toBeVisible();
  await login(page, email('checker'), '/operator/finance');
  await fill(page, 'Open order finances', { 'Commercial order reference': fixture.orderId });
  await fill(page, 'Independently approve payout', {
    'Independent approval reason': 'Independent synthetic checker reviewed payable and amount',
  });
  await expect(page.getByText(/5.000 TND · Approved · payable/)).toBeVisible();
  await login(page, email('operator'), '/operator/finance');
  await fill(page, 'Open order finances', { 'Commercial order reference': fixture.orderId });
  await fill(page, 'Record payout execution report', {
    'Reported execution amount (TND)': '2.000',
    'Operator-reported payment reference': `SYNTHETIC-EXEC-${suffix}`,
    'Execution evidence reference': 'Synthetic report only, no bank evidence',
    'Reported execution date': '2026-10-20T10:00',
  });
  await expect(page.getByText(/Execution 2.000 TND · Verification pending/)).toBeVisible();
  await page.getByText('Contractual due-date evidence', { exact: true }).click();
  await form(page, 'Record contractual due-date evidence')
    .getByLabel('Contractual date basis', { exact: true })
    .selectOption('ACCEPTED_TERMS_EVIDENCE');
  await fill(page, 'Record contractual due-date evidence', {
    'Exact contractual due date (leave empty for unknown)': '2026-10-15T12:00',
    'Accepted agreement source evidence': 'Synthetic accepted milestone document reference',
    'Date recording or correction reason': 'Transcribe existing source without amending terms',
  });
  await expect(
    page.getByText(/Version 1:.*Synthetic accepted milestone document reference/),
  ).toBeVisible();
  await fill(page, 'Set financial reporting period', {
    'Financial period from': '2026-01-01T00:00',
    'Financial period to (exclusive)': '2026-12-31T00:00',
  });
  await page.getByRole('button', { name: 'Calculate payment timeliness', exact: true }).click();
  await expect(page.getByText(/operational state PARTIAL_REPORTED_UNVERIFIED/)).toBeVisible();
  await expect(page.getByText(/Eligible verified: 0;.*on-time rate: Unavailable/)).toBeVisible();
  await login(page, email('artisan'), '/artisan/compensation');
  await fill(page, 'Raise a payment dispute', {
    'Disputed amount (TND)': '3.000',
    'Payment concern': 'Payment not independently confirmed',
    'Describe the payment concern': 'Synthetic pending payment dispute from authenticated claimant',
    'Supporting evidence reference': 'Synthetic artisan statement',
  });
  await expect(page.getByText(/Dispute 3.000 TND · Open/)).toBeVisible();
  await login(page, email('checker'), '/operator/finance');
  await fill(page, 'Open order finances', { 'Commercial order reference': fixture.orderId });
  await fill(page, 'Review payment dispute', {
    'Evidence and resolution reason': 'Reviewer investigating synthetic payment evidence',
  });
  await expect(page.getByText(/Dispute 3.000 TND · Under review/)).toBeVisible();
  await form(page, 'Review payment dispute')
    .getByLabel('Dispute next status', { exact: true })
    .selectOption('PROPOSED_RESOLUTION');
  await fill(page, 'Review payment dispute', {
    'Evidence and resolution reason':
      'Proposed resolution pending claimant acceptance and real evidence',
  });
  await expect(page.getByText(/Dispute 3.000 TND · Proposed resolution/)).toBeVisible();
  await expect(page.getByText('Artisan payables outstanding', { exact: true })).toBeVisible();
  await expect(page.getByText('Open payment disputes', { exact: true })).toBeVisible();
  await expect(page.getByText('Buyer bank evidence unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Material liabilities unresolved', { exact: true })).toBeVisible();
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
});

test('full synthetic material receipt confirms custody while physical verification remains unavailable', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const suffix = `b5-full-${Date.now().toString(36)}`;
  const email = (role: string) => `production-${role}-${suffix}@example.com`;
  for (const role of ['operator', 'artisan', 'coordinator', 'checker'])
    await register(request, email(role));
  const seeded = await request.post(
    `${process.env.E2E_CONTROL_URL}/batch5-fixture?suffix=${suffix}`,
  );
  expect(seeded.ok(), await seeded.text()).toBeTruthy();
  const fixture = (await seeded.json()) as { batchId: string; receiverOrganizationId: string };
  await login(page, email('operator'), '/operator/inventory');
  await page.getByText('Register a material lot', { exact: true }).click();
  const lotForm = form(page, 'Register material lot');
  await lotForm.getByLabel('Evidence provenance', { exact: true }).selectOption('SYNTHETIC');
  await fill(page, 'Register material lot', {
    'Material identity code': 'yarn',
    'Material name': 'Synthetic yarn',
    'Lot reference': `FULL-${suffix}`,
    'Supplier reference': 'Synthetic supplier',
    'Received quantity': '10',
    'Receipt evidence reference (operator reported)':
      'Synthetic demonstration stock, not physical verification',
  });
  await expect(page.getByRole('article', { name: `Material lot FULL-${suffix}` })).toContainText(
    'Available 10.000',
  );
  await fill(page, `Reserve FULL-${suffix}`, {
    'Approved production batch reference': fixture.batchId,
    'Quantity to reserve': '10',
    'Reservation reason': 'Synthetic full material coverage',
  });
  await fill(page, 'Record outgoing handover', {
    'Receiving association reference': fixture.receiverOrganizationId,
    'Handed over quantity': '10',
    'Sender handover evidence reference': 'Synthetic full custody demonstration',
  });
  await expect(page.getByText('Material handover · Pending receiver confirmation')).toBeVisible();
  await login(page, email('artisan'), '/artisan/materials');
  await fill(page, 'Record material receipt or discrepancy', {
    'Quantity received': '10',
    'Damaged quantity': '0',
    'Recipient evidence reference': 'Synthetic authenticated receipt',
    'Receipt note or shortage description': 'Complete demonstration material receipt',
  });
  await expect(page.getByText('Material handover · Received confirmed')).toBeVisible();
  await expect(page.getByText(/Authenticated acknowledgement/)).toBeVisible();
  await login(page, email('operator'), '/operator/inventory');
  await expect(page.getByText('Material handover · Received confirmed')).toBeVisible();
  await fill(page, 'Record material consumption', {
    'Consumed quantity': '10',
    'Material consumption reason': 'Consumed in controlled synthetic demonstration production',
  });
  await expect(page.getByRole('article', { name: `Material lot FULL-${suffix}` })).toContainText(
    'Consumed 10.000',
  );
  await expect(page.getByText(/Independent physical verification: unavailable/)).toBeVisible();
});
