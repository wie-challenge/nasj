import { expect, test, type APIRequestContext } from '@playwright/test';
import type { DemoSessionView } from '@nasj/contracts';
const origin = 'http://127.0.0.1:3100';
async function get(api: APIRequestContext, path: string) {
  const response = await api.get(path);
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function post(
  api: APIRequestContext,
  path: string,
  data: unknown,
  key = crypto.randomUUID(),
) {
  const demo = path.startsWith('/api/v1/demo/');
  const context = await get(api, demo ? '/api/v1/demo/session' : '/api/v1/me');
  const response = await api.post(path, {
    data,
    headers: {
      Origin: origin,
      [demo ? 'X-Demo-CSRF' : 'X-CSRF-Token']: context.csrfToken,
      'Idempotency-Key': key,
    },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
test('Batch 8–11 showroom builds authoritative planning, paid sample and support records in one visitor generation', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const api = page.request;
  await get(api, '/api/v1/demo/session');
  const initial: DemoSessionView = await post(api, '/api/v1/demo/start', {});
  const seed = initial.scenario!;
  expect(seed.version).toBeGreaterThanOrEqual(3);
  expect(seed.totals).toEqual(seed.initialTotals);
  const persona = (value: string) => post(api, '/api/v1/demo/switch', { persona: value });
  const other = await browser.newContext();
  try {
    await get(other.request, '/api/v1/demo/session');
    const second: DemoSessionView = await post(other.request, '/api/v1/demo/start', {});
    await persona('production');
    const catalog = await get(api, '/api/v1/catalog');
    const spec = catalog.specifications[0];
    const revision = spec.revisions[0];
    expect(revision.status).toBe('DRAFT');
    await post(api, `/api/v1/catalog/specification-revisions/${revision.id}/submit`, {
      version: 1,
    });
    await post(api, `/api/v1/catalog/specification-revisions/${revision.id}/decision`, {
      version: 1,
      decision: 'APPROVED',
      comments: 'Synthetic reviewed specification; no physical certification.',
    });
    await persona('buyer');
    const detail = await get(api, `/api/v1/procurement/rfqs/${seed.rfqId}`);
    const quote = detail.quotes[0];
    await post(api, `/api/v1/procurement/rfqs/${seed.rfqId}/accept`, {
      version: detail.rfq.version,
      quoteId: quote.id,
      confirm: true,
      termsSha256: quote.termsSha256,
    });
    const state: DemoSessionView = await get(api, '/api/v1/demo/session');
    const orderId = state.scenario!.orderId!;
    await persona('production');
    await post(api, `/api/v1/procurement/orders/${orderId}/eligibility-assessments`, {
      version: 1,
      restrictionsReviewed: true,
      restrictionSource: 'Synthetic showroom reviewed materials and craft.',
    });
    const planning = await get(api, `/api/v1/procurement/orders/${orderId}/planning`);
    const plan = await post(api, `/api/v1/procurement/orders/${orderId}/allocation-plans`, {
      version: planning.orderVersion,
      requiredQuantity: 10,
      materialAssumptions: {
        readiness: 'READY',
        reference: 'SYNTHETIC material readiness attestation, no physical stock.',
      },
      lines: [
        { artisanProfileId: seed.linkedArtisanId, quantity: 8 },
        { artisanProfileId: seed.accountlessArtisanId, quantity: 2 },
      ],
    });
    expect(plan.state).toBe('DRAFT');
    const reviewed = await post(api, `/api/v1/procurement/allocation-plans/${plan.id}/review`, {
      version: plan.version,
      confirm: true,
    });
    await page.goto(`/operator/planning/${orderId}`);
    await expect(page.getByRole('heading', { name: /planning/i }).first()).toBeVisible();
    await persona('buyer');
    const sample = await post(api, '/api/v1/catalog/samples', {
      revisionId: revision.id,
      buyerOrganizationId: seed.buyerOrganizationId,
      operatorOrganizationId: seed.operatorOrganizationId,
      sampleQuantity: 1,
      responsibleArtisanProfileId: seed.linkedArtisanId,
      workTerms: 'Synthetic one-runner sample with completion milestone.',
      materialResponsibility: 'Synthetic operator-provided cotton; no physical stock.',
      plannedCompletion: seed.deliveryAt,
    });
    await persona('production');
    await post(api, `/api/v1/catalog/samples/${sample.id}/terms`, {
      compensationTnd: '45.000',
      compensationBasis: 'PER_SAMPLE',
      materialCostTnd: '12.000',
      reimburseMaterials: false,
      workTerms: 'Synthetic paid sample, payable on documented completion even if rejected.',
      evidenceReference: 'SYNTHETIC sample agreement',
    });
    await persona('artisan');
    const ownCatalog = await get(api, '/api/v1/catalog');
    const ownSample = ownCatalog.samples.find((s: { id: string }) => s.id === sample.id);
    await post(api, `/api/v1/catalog/samples/${sample.id}/accept`, {
      termsSha256: ownSample.termsSha256,
    });
    await post(api, `/api/v1/catalog/samples/${sample.id}/work`, {
      actualRecordedMinutes: 90,
      timeEvidence: 'SYNTHETIC',
      evidenceReference: 'SYNTHETIC observed-time fixture, no real time study',
    });
    await persona('production');
    await post(api, `/api/v1/catalog/samples/${sample.id}/evaluations`, {
      decision: 'APPROVED',
      criteria: 'Even border and synthetic dimensional criteria.',
      comments: 'Synthetic evaluation only.',
      evidenceReference: 'SYNTHETIC completed sample record',
    });
    await persona('buyer');
    await post(api, `/api/v1/catalog/samples/${sample.id}/approval`, {
      decision: 'APPROVED',
      comments: 'Synthetic buyer sample sign-off.',
      evidenceReference: 'SYNTHETIC exact revision approval',
    });
    await post(api, `/api/v1/catalog/orders/${orderId}/binding`, {
      catalogueRevisionId: revision.id,
    });
    await persona('production');
    const refreshedPlan = await get(api, `/api/v1/procurement/orders/${orderId}/planning`);
    await post(api, `/api/v1/procurement/orders/${orderId}/eligibility-assessments`, {
      version: refreshedPlan.orderVersion,
      restrictionsReviewed: true,
      restrictionSource: 'SYNTHETIC approved design bound; capacity rechecked.',
    });
    const issued = await post(api, `/api/v1/procurement/allocation-plans/${plan.id}/offers`, {
      version: reviewed.version,
      expiresAt: seed.offerExpiresAt,
    });
    expect(issued.items).toHaveLength(2);
    await persona('artisan');
    const offers = (await get(api, '/api/v1/commerce/workspace')).offers;
    const ownOffer = offers.find(
      (offer: { artisanProfileId: string }) => offer.artisanProfileId === seed.linkedArtisanId,
    );
    expect(ownOffer.status).toBe('OFFERED');
    await post(api, `/api/v1/commerce/offers/${ownOffer.id}/actions`, {
      next: 'ACCEPTED',
      version: ownOffer.version,
      termsSha256: ownOffer.termsSha256,
    });
    await persona('production');
    let execution = await get(api, `/api/v1/procurement/orders/${orderId}/execution`);
    const batchId = execution.batches[0].id;
    const released = await post(api, `/api/v1/procurement/batches/${batchId}/release`, {
      version: execution.batches[0].version,
      fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
      materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
    });
    expect(released.batchId).toBe(batchId);
    await persona('artisan');
    const started = await post(api, `/api/v1/procurement/batches/${batchId}/start`, {
      version: released.version,
    });
    await page.goto('/commerce/artisan');
    const timeReport = page
      .locator('details')
      .filter({ has: page.getByText('Voluntary observed time and earnings', { exact: true }) });
    await timeReport.locator('summary').click();
    const periodStart = new Date(Date.now() - 7200000).toISOString().slice(0, 16);
    const periodEnd = new Date(Date.now() - 3600000).toISOString().slice(0, 16);
    await timeReport.getByLabel('Observed period start', { exact: true }).fill(periodStart);
    await timeReport.getByLabel('Observed period end', { exact: true }).fill(periodEnd);
    await timeReport
      .getByLabel('Observed minutes (leave blank when unknown)', { exact: true })
      .fill('60');
    await timeReport.getByLabel('Units covered by this time record', { exact: true }).fill('8');
    await timeReport
      .getByLabel('Task and unit context', { exact: true })
      .fill('Synthetic embroidery timing fixture, eight pieces.');
    await timeReport
      .getByLabel('Observation source and evidence reference', { exact: true })
      .fill('SYNTHETIC observed-time scenario; no real time study.');
    await timeReport
      .getByLabel('I consent to reporting this time for this batch.', { exact: true })
      .check();
    await timeReport
      .getByRole('button', { name: 'Record consented production time', exact: true })
      .click();
    await expect(
      timeReport.getByText('Hourly estimate: 64.000 TND/hour', { exact: true }),
    ).toBeVisible();
    expect(
      (await get(api, `/api/v1/intelligence/batches/${batchId}/time-records`)).items,
    ).toHaveLength(1);
    await page.emulateMedia({ media: 'print' });
    await expect(timeReport).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    const exception = await post(api, '/api/v1/collaboration/exceptions', {
      batchId,
      category: 'PRODUCTION_DELAY',
      severity: 'MEDIUM',
      description: 'SYNTHETIC coordination request: collection window needs review.',
      affectedQuantity: 2,
      affectedDate: seed.deliveryAt,
    });
    await post(api, '/api/v1/collaboration/tickets', {
      category: 'SUPPORT_REQUEST',
      relatedType: 'BATCH',
      relatedId: batchId,
      description: 'Synthetic craft instruction support requested voluntarily.',
    });
    await post(api, `/api/v1/collaboration/orders/${orderId}/discussions`, {
      body: 'SYNTHETIC production coordination update.',
      internalOnly: false,
    });
    const progress = await post(api, `/api/v1/procurement/batches/${batchId}/progress`, {
      version: started.version,
      produced: 8,
      occurredAt: new Date().toISOString(),
    });
    await post(api, `/api/v1/procurement/batches/${batchId}/submit`, { version: progress.version });
    await persona('qa');
    execution = await get(api, `/api/v1/procurement/orders/${orderId}/execution`);
    await post(api, `/api/v1/procurement/batches/${batchId}/inspections`, {
      version: execution.batches[0].version,
      approved: 8,
      rejected: 0,
      pending: 0,
      results: execution.criteria.map((criterion: { id: string }) => ({
        criterionId: criterion.id,
        outcome: 'PASS',
        note: 'Synthetic reference evaluation; no physical certification.',
      })),
    });
    await persona('production');
    await post(api, `/api/v1/collaboration/exceptions/${exception.id}`, {
      status: 'ACKNOWLEDGED',
      resolution: '',
    });
    const approved = await get(api, '/api/v1/catalog');
    expect(approved.samples.find((s: { id: string }) => s.id === sample.id).payable.amountTnd).toBe(
      '45.000',
    );
    expect(
      approved.samples.find((s: { id: string }) => s.id === sample.id).payable.status,
    ).not.toBe('PAID');
    await page.goto('/catalog');
    await expect(page.getByText('SYNTHETIC — Embroidered table runner').first()).toBeVisible();
    await page.goto('/intelligence');
    await expect(
      page.getByRole('heading', { name: /intelligence|analytics/i }).first(),
    ).toBeVisible();
    await page.goto('/collaboration');
    await expect(page.getByRole('heading', { name: /collaboration/i }).first()).toBeVisible();
    const final: DemoSessionView = await get(api, '/api/v1/demo/session');
    expect(final.scenario!.totals.allocationPlans).toBe(1);
    expect(final.scenario!.totals.samplePayables).toBe(1);
    expect(final.scenario!.totals.acceptedCommitments).toBe(1);
    expect(final.scenario!.totals.committedPieces).toBe(8);
    expect(final.scenario!.totals.qualityApproved).toBe(8);
    expect(final.scenario!.totals.productionExceptions).toBe(1);
    expect(final.scenario!.totals.supportTickets).toBe(1);
    expect(final.scenario!.totals.discussions).toBe(1);
    await persona('buyer');
    const cross = await api.get(`/api/v1/procurement/rfqs/${second.scenario!.rfqId}`);
    expect(cross.status()).toBe(404);
    const reset: DemoSessionView = await post(api, '/api/v1/demo/reset', {
      scenarioId: seed.id,
      generation: seed.generation,
      confirm: true,
    });
    expect(reset.scenario!.totals).toEqual(reset.scenario!.initialTotals);
    expect(reset.scenario!.id).not.toBe(seed.id);
    expect((await get(other.request, '/api/v1/demo/session')).scenario.id).toBe(
      second.scenario!.id,
    );
  } finally {
    await other.close();
  }
});
