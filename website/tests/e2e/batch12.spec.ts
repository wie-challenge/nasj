import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-Batch12-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Batch12 reviewer', password },
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
  await page.goto('/auth/login?next=%2Foperator%2Fsales');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/operator\/sales$/);
}
async function command(page: Page, path: string, data: unknown) {
  const me = await (await page.request.get('/api/v1/me')).json();
  const r = await page.request.post(`/api/v1/${path}`, {
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
for (const width of [390, 1280])
  test(`Batch12 sales proposal and financial controls use real scoped records at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 950 });
    const suffix = `b12${width}${Date.now().toString(36)}`;
    const email = `production-operator-${suffix}@example.com`;
    for (const e of [
      email,
      `production-artisan-${suffix}@example.com`,
      `production-coordinator-${suffix}@example.com`,
    ])
      await register(request, e);
    const seed = await request.post(
      `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
    );
    expect(seed.ok(), await seed.text()).toBeTruthy();
    const fixture = await seed.json();
    await login(page, email);
    await expect(
      page.getByText('No prospects in your authorized sales organizations.'),
    ).toBeVisible();
    await page.getByText('Add prospect organization', { exact: true }).click();
    const create = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create prospect', exact: true }) });
    await create
      .getByLabel('Existing assigned buyer reference (instead of new name)', { exact: true })
      .fill(fixture.buyerOrganizationId);
    await create.getByLabel('Commercial segment', { exact: true }).fill('Synthetic hospitality');
    await create.getByLabel('Buyer needs', { exact: true }).fill('Ten reviewed pilot runners');
    await create
      .getByLabel('Qualification notes', { exact: true })
      .fill('Documented synthetic discovery');
    await create.getByLabel('Next action', { exact: true }).fill('Review sample proposal');
    await create
      .getByLabel('Permission evidence', { exact: true })
      .fill('Synthetic contact permission');
    await create
      .getByLabel('Contact permission review date', { exact: true })
      .fill('2027-12-01T12:00');
    await create.getByLabel('Change reason', { exact: true }).fill('Synthetic discovery only');
    await create.getByRole('button', { name: 'Create prospect', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Production buyer ${suffix}`, exact: true }),
    ).toBeVisible();
    const product = await command(page, 'catalog/specifications', {
      productCode: `B12-${suffix.toUpperCase()}`,
      name: 'Synthetic pilot design',
      craftSkillId: 'weaving',
      revision: {
        revisionNumber: 1,
        description: 'Synthetic specification',
        dimensions: '10x10 cm',
        unit: 'cm',
        materials: [
          { materialCode: 'cotton', name: 'Cotton cloth', quantity: '1.000', unit: 'METERS' },
        ],
        instructions: 'Follow the approved dimensions.',
        tolerances: 'One cm',
        qualityCriteria: 'Dimensions match',
        referenceImages: [],
      },
    });
    await command(page, `catalog/specification-revisions/${product.revisionId}/submit`, {
      version: 1,
    });
    await command(page, `catalog/specification-revisions/${product.revisionId}/decision`, {
      version: 1,
      decision: 'APPROVED',
      comments: 'Synthetic product review',
    });
    await page.getByText('Pilot proposal', { exact: true }).click();
    async function proposal(status: string) {
      const form = page
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Save proposal revision', exact: true }) });
      await form
        .getByLabel('Product specification revision reference', { exact: true })
        .fill(product.revisionId);
      await form.getByLabel('Proposed quantity', { exact: true }).fill('10');
      await form.getByLabel('Proposed total price (TND)', { exact: true }).fill('100.001');
      await form
        .getByLabel('Estimated total costs (TND, optional)', { exact: true })
        .fill('70.001');
      await form.getByLabel('Proposal valid until', { exact: true }).fill('2027-12-01T12:00');
      await form
        .getByLabel('Proposed timing', { exact: true })
        .fill('Review before any production');
      await form
        .getByLabel('Proposed responsibilities', { exact: true })
        .fill('No artisan commitment');
      await form.getByLabel('Proposal status', { exact: true }).selectOption(status);
      await form
        .getByLabel('Buyer response or pending response', { exact: true })
        .fill(status === 'LOST' ? 'Buyer declined timing' : 'Awaiting buyer response');
      await form
        .getByLabel('Outcome or revision reason', { exact: true })
        .fill(status === 'LOST' ? 'Buyer timing objection' : 'Preserve pilot negotiation');
      if (status === 'WON')
        await form
          .getByLabel('Authorized RFQ reference (required for won)', { exact: true })
          .fill(fixture.rfqId);
      if (status === 'LOST' || status === 'WON')
        await form.getByLabel('Buyer decision date', { exact: true }).fill('2026-10-28T10:00');
      await form.getByRole('button', { name: 'Save proposal revision', exact: true }).click();
    }
    await proposal('DRAFT');
    await expect(page.getByText('Proposal history (1)', { exact: true })).toBeVisible();
    await page.getByLabel('Proposal to revise', { exact: true }).selectOption({ index: 1 });
    await proposal('SENT');
    await expect(page.getByText('Proposal history (2)', { exact: true })).toBeVisible();
    await page.getByLabel('Proposal to revise', { exact: true }).selectOption({ index: 1 });
    await proposal('LOST');
    await expect(page.getByText('Proposal history (3)', { exact: true })).toBeVisible();
    await proposal('DRAFT');
    await expect(page.getByText('Proposal history (4)', { exact: true })).toBeVisible();
    await page.getByLabel('Proposal to revise', { exact: true }).selectOption({ index: 1 });
    await proposal('SENT');
    await expect(page.getByText('Proposal history (5)', { exact: true })).toBeVisible();
    await page.getByLabel('Proposal to revise', { exact: true }).selectOption({ index: 1 });
    await proposal('WON');
    await expect(page.getByText('Proposal history (6)', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Customer stage source: SYNTHETIC_APPLICATION_ACCEPTANCE/),
    ).toBeVisible();

    await page.goto('/operator/finance');
    await page.getByText('Review funding before a sales-linked contract', { exact: true }).click();
    const funding = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Record RFQ finance review', exact: true }),
    });
    await funding.getByLabel('RFQ to review', { exact: true }).fill(fixture.rfqId);
    await funding.getByLabel('Exact costed quote reference', { exact: true }).fill(fixture.quoteId);
    await funding
      .getByLabel('Funding plan evidence', { exact: true })
      .fill('Synthetic changed funding plan requires review');
    await funding
      .getByLabel('Finance review reason', { exact: true })
      .fill('Synthetic HOLD does not verify payment');
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/v1/finance/rfqs/${fixture.rfqId}/review`) &&
        r.request().method() === 'POST',
    );
    await funding.getByRole('button', { name: 'Record RFQ finance review', exact: true }).click();
    const saved = await response;
    expect(saved.status()).toBe(201);
    expect((await saved.json()).decision).toBe('HOLD');

    await page.getByLabel('Commercial order reference', { exact: true }).fill(fixture.orderId);
    await page.getByRole('button', { name: 'Open order finances', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Contribution and working capital', exact: true }),
    ).toBeVisible();
    await page.getByText('Record attributable cost evidence', { exact: true }).click();
    const cost = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Record cost evidence', exact: true }) });
    await cost.getByLabel('Recorded cost (TND)', { exact: true }).fill('12.345');
    await cost
      .getByLabel('Unique cost evidence reference', { exact: true })
      .fill(`BROWSER-${suffix}`);
    await cost.getByLabel('Cost occurrence date', { exact: true }).fill('2026-10-15T12:00');
    await cost
      .getByLabel('Cost recording reason', { exact: true })
      .fill('Synthetic attributed material cost');
    await cost.getByRole('button', { name: 'Record cost evidence', exact: true }).click();
    await expect(
      page.getByText(`MATERIAL: 12.345 TND — BROWSER-${suffix}`, { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Financial period from', { exact: true }).fill('2026-10-01T00:00');
    await page
      .getByLabel('Financial period to (exclusive)', { exact: true })
      .fill('2026-11-01T00:00');
    await page.getByRole('button', { name: 'Set financial reporting period', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate payment timeliness', exact: true }).click();
    await expect(page.getByText(/Eligible verified: 0;.*on-time rate: Unavailable/)).toBeVisible();
    await page.getByRole('button', { name: 'Prepare accounting CSV', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Download accounting CSV', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Closure decision reason', { exact: true })
      .fill('Review unreconciled synthetic obligations');
    await page.getByRole('button', { name: 'Request financial closure', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('alert').filter({ hasText: 'Closure denied:' }),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main *'))
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 80) }))
        .slice(0, 8),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      JSON.stringify(overflow),
    ).toBeTruthy();
  });
