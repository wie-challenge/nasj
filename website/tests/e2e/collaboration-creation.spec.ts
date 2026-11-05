import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-collaboration-creation-2026!';
test.use({ actionTimeout: 15000 });
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic collaboration persona', password },
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
async function login(page: Page, email: string, next = '/collaboration') {
  await page.context().clearCookies();
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}
async function command(page: Page, path: string, body: unknown, key = crypto.randomUUID()) {
  const me = await (await page.request.get('/api/v1/me')).json();
  return page.request.post(`/api/v1/${path}`, {
    headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken, 'Idempotency-Key': key },
    data: body,
  });
}
async function view(page: Page) {
  return (await page.request.get('/api/v1/collaboration')).json();
}
async function checkA11y(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}
async function issueUpstream(page: Page, rfqId: string, name: string) {
  await page.goto(`/procurement/${rfqId}`);
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  const assess = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Assess eligibility', exact: true }) });
  await assess.getByRole('checkbox', { name: /I reviewed the product/ }).check();
  await assess
    .getByLabel('Restriction review source', { exact: true })
    .fill('Synthetic product review');
  await assess.getByRole('button', { name: 'Assess eligibility', exact: true }).click();
  const candidate = page.getByRole('article', { name: `ELIGIBLE ${name}` });
  await candidate.getByLabel('Offer quantity', { exact: true }).fill('10');
  await candidate.getByLabel('Offer expires', { exact: true }).fill('2027-09-12T09:00');
  for (const [label, value] of [
    ['Materials responsibility', 'Operator supplies synthetic yarn'],
    ['Quality and rework', 'Rework requires separate consent'],
    ['Payment conditions', 'Pay approved units'],
    ['Collection arrangement', 'Synthetic workshop collection'],
    ['Instructions', 'Synthetic specification'],
  ] as const)
    await candidate.getByLabel(label, { exact: true }).fill(value);
  await candidate.getByRole('button', { name: `Save offer for ${name}` }).click();
  await page.getByRole('button', { name: `Issue offer to ${name}` }).click();
  await expect(page.getByRole('article', { name: `Offer ${name} OFFERED` })).toBeVisible();
}
for (const width of [360, 1280]) {
  test(`FPA08 empty workflows create through UI, preserve terms and require scoped consent at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize({ width, height: 900 });
    const suffix = `c08${width}${Date.now().toString(36)}`;
    const email = (role: string) => `production-${role}-${suffix}@example.com`;
    for (const role of ['operator', 'artisan', 'coordinator', 'outsider'])
      await register(request, email(role));
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok(), await seeded.text()).toBeTruthy();
    const fixture = await seeded.json();
    await login(page, email('operator'));
    expect((await view(page)).counteroffers).toEqual([]);
    expect((await view(page)).exceptions).toEqual([]);
    expect((await view(page)).scheduleRevisions).toEqual([]);
    await issueUpstream(page, fixture.rfqId, fixture.linkedName);
    await login(page, email('artisan'));
    const counter = page.getByRole('form', { name: 'Propose a counteroffer' });
    await counter.getByLabel('Issued offer', { exact: true }).selectOption({ index: 1 });
    await counter.getByLabel('Proposed quantity', { exact: true }).fill('5');
    await counter.getByLabel('Proposed deadline', { exact: true }).fill('2027-09-11T10:00');
    await counter
      .getByLabel('Clarification (optional)', { exact: true })
      .fill('Synthetic smaller quantity request');
    await counter.getByRole('button', { name: 'Preview proposal', exact: true }).click();
    const preview = counter.getByRole('region', { name: 'Proposal preview' });
    await expect(preview).toContainText('30.000 TND');
    await expect(preview).toContainText('15.000 TND');
    await expect(preview).toContainText('Unknown until manager review');
    await expect(preview).toContainText('Operator supplies synthetic yarn');
    expect((await view(page)).counteroffers).toEqual([]); // preview is read-only
    await counter
      .getByLabel('Clarification (optional)', { exact: true })
      .fill('Synthetic smaller quantity request, reviewed draft');
    await expect(
      counter.getByRole('button', { name: 'Submit counteroffer', exact: true }),
    ).toBeDisabled();
    await counter.getByRole('button', { name: 'Preview proposal', exact: true }).click();

    await checkA11y(page);

    let lostResponse = false;
    let originalKey = '';
    await page.route('**/api/v1/collaboration/counteroffers', async (route) => {
      if (!lostResponse && route.request().method() === 'POST') {
        lostResponse = true;
        originalKey = route.request().headers()['idempotency-key'];
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort('connectionfailed');
      } else {
        expect(route.request().headers()['idempotency-key']).toBe(originalKey);
        await route.continue();
      }
    });
    await counter.getByRole('button', { name: 'Submit counteroffer', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      counter.getByRole('button', { name: 'Retry original submission', exact: true }),
    ).toBeVisible();
    expect((await view(page)).counteroffers).toHaveLength(1);
    await counter.getByLabel('Proposed quantity', { exact: true }).fill('4');
    await expect(
      counter.getByRole('button', { name: 'Submit counteroffer', exact: true }),
    ).toBeDisabled();
    await expect(
      counter.getByRole('button', { name: 'Refresh eligible choices', exact: true }),
    ).toBeDisabled();
    await page.route('**/api/v1/collaboration', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'API_UNAVAILABLE', message: 'Synthetic refresh unavailable' }),
      });
    });
    await counter.getByRole('button', { name: 'Retry original submission', exact: true }).click();
    await expect(
      counter.getByText('The original submission is confirmed. Your edited draft is preserved.'),
    ).toBeVisible();
    await expect(counter.getByLabel('Proposed quantity', { exact: true })).toHaveValue('4');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Synthetic refresh unavailable' }),
    ).toBeVisible();
    await expect(counter.getByLabel('Proposed quantity', { exact: true })).toHaveValue('4');
    await page.unroute('**/api/v1/collaboration');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(counter.getByLabel('Proposed quantity', { exact: true })).toHaveValue('4');
    await page.unroute('**/api/v1/collaboration/counteroffers');
    let data = await view(page);
    expect(data.counteroffers).toHaveLength(1);
    const declinedId = data.counteroffers[0].id;
    expect(data.counteroffers[0].createsAgreement).toBe(false);
    expect(data.creation.exceptionBatches).toEqual([]);
    await login(page, email('coordinator'));
    await expect(
      page.getByRole('button', { name: 'Manager approves terms', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await command(page, `collaboration/counteroffers/${declinedId}/review`, {
          decision: 'APPROVE_TERMS',
        })
      ).status(),
    ).toBe(403);
    await login(page, email('operator'));
    await page
      .getByLabel('Review note', { exact: true })
      .fill('Synthetic decline; original remains available');
    await page.getByRole('button', { name: 'Decline counteroffer', exact: true }).click();
    await expect(page.getByText(/Decision history: Declined/)).toBeVisible();
    expect((await view(page)).counteroffers[0].original.quantity).toBe(10);
    await login(page, email('artisan'));
    await counter.getByLabel('Issued offer', { exact: true }).selectOption({ index: 1 });
    await counter.getByLabel('Proposed quantity', { exact: true }).fill('5');
    await counter.getByLabel('Proposed deadline', { exact: true }).fill('2027-09-11T10:00');
    await counter.getByRole('button', { name: 'Preview proposal', exact: true }).click();
    await counter.getByRole('button', { name: 'Submit counteroffer', exact: true }).click();
    await expect(
      page.getByText(
        'Proposal submitted. Existing commitments remain until the required approvals.',
      ),
    ).toBeVisible();
    await login(page, email('operator'));
    await page
      .getByLabel('Review note', { exact: true })
      .fill('Synthetic revised quantity approved');
    await page.getByRole('button', { name: 'Manager approves terms', exact: true }).click();
    await expect(
      page.getByText('Changed terms accepted for review. The artisan must still accept them.'),
    ).toBeVisible();
    await login(page, email('artisan'));
    data = await view(page);
    const activeCounter = data.counteroffers.find(
      (c: { status: string }) => c.status === 'MANAGER_REVIEW',
    );
    expect(activeCounter.createsAgreement).toBe(false);
    expect(
      (await command(page, `collaboration/counteroffers/${activeCounter.id}/accept`, {})).status(),
    ).toBe(409);
    await page.goto('/commerce/artisan');
    await page
      .getByRole('article', { name: /^Artisan offer / })
      .filter({ has: page.getByRole('heading', { name: /Offered$/ }) })
      .getByLabel('Offer language', { exact: true })
      .selectOption('en');
    await page
      .getByRole('checkbox', {
        name: 'I understand and have reviewed the original English terms for this exact offer version.',
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Accept this offer voluntarily', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'État de l’offre: Accepted' })).toBeVisible();
    await page.goto('/collaboration');
    await page.getByRole('button', { name: 'Confirm my offer acceptance', exact: true }).click();
    await expect(page.getByText('The authoritative offer acceptance is confirmed.')).toBeVisible();
    const exception = page.getByRole('form', { name: 'Report a production exception' });
    await exception.getByLabel('Production batch', { exact: true }).selectOption({ index: 1 });
    await expect(exception).toContainText(
      'Responsible coordinator: Synthetic collaboration persona',
    );
    await exception.getByLabel('Affected quantity (optional)', { exact: true }).fill('2');
    await exception
      .getByLabel('Affected date (optional)', { exact: true })
      .fill('2027-09-09T10:00');
    await exception
      .getByLabel('Original report and requested assistance', { exact: true })
      .fill('Synthetic yarn shortage; please arrange replacement yarn');
    await exception
      .getByLabel('Evidence reference (optional)', { exact: true })
      .fill('Synthetic stock note 08');
    await exception.getByRole('button', { name: 'Submit exception report', exact: true }).click();
    await expect(
      page.getByText('Exception reported. Original facts and agreed pay are preserved.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    data = await view(page);
    const originalTerms = data.creation.exceptionBatches[0].terms;
    await login(page, email('coordinator'));
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(page.getByText('Exception acknowledged.', { exact: true })).toBeVisible();
    await page
      .getByLabel('Resolution for Material shortage', { exact: true })
      .fill('Synthetic replacement yarn supplied; no pay change');
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(
      page.getByText('Exception resolved. The original report is preserved.'),
    ).toBeVisible();
    const schedule = page.getByRole('form', { name: 'Propose a schedule revision' });
    async function propose(date: string, reason: string) {
      await schedule.getByLabel('Production batch', { exact: true }).selectOption({ index: 1 });
      await schedule.getByLabel('Proposed deadline', { exact: true }).fill(date);
      await schedule.getByLabel('Reason for revision', { exact: true }).fill(reason);
      await schedule.getByRole('button', { name: 'Preview proposal', exact: true }).click();
      await expect(schedule.getByRole('region', { name: 'Proposal preview' })).toContainText(
        'Transport: unknown',
      );
      await schedule.getByRole('button', { name: 'Submit schedule revision', exact: true }).click();
      await expect(
        schedule.getByText(
          'Proposal submitted. Existing commitments remain until the required approvals.',
        ),
      ).toBeVisible();
    }
    await propose('2027-09-10T10:00', 'Synthetic declined revision');
    await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toHaveCount(0);
    await login(page, email('operator'));
    await page
      .getByLabel('Schedule decision note', { exact: true })
      .fill('Synthetic buyer rejects this date');
    await page.getByRole('button', { name: 'Reject change', exact: true }).click();
    await expect(
      page.getByText('Schedule change rejected. The original deadline stands.'),
    ).toBeVisible();
    await expect(page.getByLabel('Schedule decision history')).toContainText(
      'Synthetic buyer rejects this date',
    );
    await login(page, email('coordinator'));
    await propose('2027-09-10T10:00', 'Synthetic approved revision');
    await propose('2027-09-09T10:00', 'Synthetic sibling becomes stale');
    data = await view(page);
    const approvedRevision = data.scheduleRevisions.find(
      (r: { reason: string }) => r.reason === 'Synthetic approved revision',
    );
    const staleRevision = data.scheduleRevisions.find(
      (r: { reason: string }) => r.reason === 'Synthetic sibling becomes stale',
    );
    await login(page, email('operator'));
    const approvedItem = page
      .locator('li')
      .filter({ has: page.getByText('Reason: Synthetic approved revision', { exact: true }) });
    await approvedItem.getByRole('button', { name: 'Approve change', exact: true }).click();
    await expect(approvedItem).toContainText('Buyer approval: recorded');
    expect((await view(page)).creation.exceptionBatches[0].terms.deadline).toBe(
      originalTerms.deadline,
    );
    await login(page, email('artisan'));
    const approvedItemArtisan = page
      .locator('li')
      .filter({ has: page.getByText('Reason: Synthetic approved revision', { exact: true }) });
    await approvedItemArtisan.getByRole('button', { name: 'Approve change', exact: true }).click();
    await expect(approvedItemArtisan).toContainText('Approved');
    data = await view(page);
    expect(data.creation.exceptionBatches[0].terms.quantity).toBe(originalTerms.quantity);
    expect(data.creation.exceptionBatches[0].terms.totalPayTnd).toBe(originalTerms.totalPayTnd);
    const staleItem = page
      .locator('li')
      .filter({ has: page.getByText('Reason: Synthetic sibling becomes stale', { exact: true }) });
    await staleItem.getByRole('button', { name: 'Approve change', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The effective agreement changed.' }),
    ).toBeVisible();
    expect(
      (await view(page)).scheduleRevisions.find((r: { id: string }) => r.id === staleRevision.id)
        .status,
    ).toBe('PENDING_APPROVAL');
    // Repeated concurrent decisions are serialized: approved revision cannot apply twice.
    const repeated = await Promise.all([
      command(page, `collaboration/schedule-revisions/${approvedRevision.id}/decision`, {
        decision: 'APPROVED',
      }),
      command(page, `collaboration/schedule-revisions/${approvedRevision.id}/decision`, {
        decision: 'REJECTED',
      }),
    ]);
    expect(repeated.map((r) => r.status())).toEqual([409, 409]);
    await checkA11y(page);
    await login(page, email('outsider'));
    data = await view(page);
    expect(data.creation).toEqual({ exceptionBatches: [], scheduleBatches: [], counterOffers: [] });
    expect(data.exceptions).toEqual([]);
    expect(data.counteroffers).toEqual([]);
    expect(data.scheduleRevisions).toEqual([]);
    expect(
      (
        await command(page, `collaboration/schedule-revisions/${staleRevision.id}/decision`, {
          decision: 'APPROVED',
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await command(page, 'collaboration/exceptions', {
          batchId: approvedRevision.batchId,
          category: 'PRODUCTION_DELAY',
          severity: 'LOW',
          description: 'Synthetic denied outsider report',
        })
      ).status(),
    ).toBe(404);
  });
}
