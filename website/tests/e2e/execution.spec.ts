import { expect, test, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-production-browser-password-2026!';
async function register(request: import('@playwright/test').APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Production Persona', password },
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
test('an accepted batch is prepared, collected, confirmed and published as synthetic traceability', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  page.on('dialog', (dialog) => dialog.accept());
  const suffix = `x${Date.now().toString(36)}`;
  const emails = {
    operator: `production-operator-${suffix}@example.com`,
    artisan: `production-artisan-${suffix}@example.com`,
    coordinator: `production-coordinator-${suffix}@example.com`,
  };
  await register(request, emails.operator);
  await register(request, emails.artisan);
  await register(request, emails.coordinator);
  const seeded = await request.post(
    `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
  );
  expect(seeded.ok(), await seeded.text()).toBeTruthy();
  const fixture = (await seeded.json()) as {
    rfqId: string;
    linkedName: string;
    coordinatorId: string;
  };
  await login(page, emails.operator, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  const assess = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Assess eligibility', exact: true }) });
  await assess.getByRole('checkbox', { name: /I reviewed the product/ }).check();
  await assess
    .getByLabel('Restriction review source', { exact: true })
    .fill('Synthetic product file');
  await assess.getByRole('button', { name: 'Assess eligibility', exact: true }).click();
  const linked = page.getByRole('article', { name: `ELIGIBLE ${fixture.linkedName}` });
  await linked.getByLabel('Offer quantity', { exact: true }).fill('10');
  await linked.getByLabel('Offer expires', { exact: true }).fill('2027-09-20T09:00');
  for (const [label, value] of [
    ['Materials responsibility', 'Operator supplies synthetic yarn'],
    ['Quality and rework', 'Rework requires a new agreement'],
    ['Payment conditions', 'Pay approved pieces independently of buyer delay'],
    ['Collection arrangement', 'Collect at the synthetic workshop'],
    ['Instructions', 'Follow the accepted specification'],
  ] as const)
    await linked.getByLabel(label, { exact: true }).fill(value);
  await linked.getByRole('button', { name: `Save offer for ${fixture.linkedName}` }).click();
  await page.getByRole('button', { name: `Issue offer to ${fixture.linkedName}` }).click();
  const materials = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save material requirements', exact: true }) });
  await materials.getByLabel('Material code', { exact: true }).fill('yarn');
  await materials.getByLabel('Material name', { exact: true }).fill('Yarn');
  await materials.getByLabel('Material unit', { exact: true }).selectOption('METERS');
  await materials.getByLabel('Thousandths per finished piece', { exact: true }).fill('500');
  await materials.getByRole('button', { name: 'Save material requirements', exact: true }).click();
  await expect(page.getByText('Yarn:')).toBeVisible();
  const criteria = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save inspection checklist', exact: true }) });
  await criteria.getByLabel('Criterion code', { exact: true }).fill('stitch');
  await criteria.getByLabel('What to inspect', { exact: true }).fill('Stitch alignment');
  await criteria.getByLabel('Expected result', { exact: true }).fill('Matches the sample');
  await criteria.getByRole('button', { name: 'Save inspection checklist', exact: true }).click();
  await expect(page.getByText('Stitch alignment: Matches the sample')).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.artisan, '/commerce/artisan');
  await page.getByLabel('Offer language', { exact: true }).selectOption('en');
  await page
    .getByRole('checkbox', {
      name: 'I understand and have reviewed the original English terms for this exact offer version.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Accept this offer voluntarily', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'État de l’offre: Accepted' })).toBeVisible();
  await page.goto('/artisan/compensation');
  await expect(page.getByText(/Verified paid 0\.000 TND/)).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.operator, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  const batch = page.getByRole('article', { name: `Batch ${fixture.linkedName} ACCEPTED` });
  await batch.getByRole('checkbox', { name: /synthetic demonstration/i }).check();
  await batch.getByRole('button', { name: `Release ${fixture.linkedName}`, exact: true }).click();
  await expect(
    page.getByRole('article', { name: `Batch ${fixture.linkedName} MATERIAL_READY` }),
  ).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.artisan, '/commerce/artisan');
  await page.setViewportSize({ width: 390, height: 844 });
  const work = page.getByRole('article', { name: /Work Synthetic production/ });
  await work.getByRole('button', { name: 'Start this batch', exact: true }).click();
  await expect(work.getByLabel('Total pieces produced so far', { exact: true })).toBeVisible();
  await work.getByLabel('Total pieces produced so far', { exact: true }).fill('10');
  await work.getByRole('button', { name: 'Save cumulative progress', exact: true }).click();
  await expect(page.getByText('Saved successfully.')).toBeVisible();
  await work
    .getByRole('button', { name: 'Submit reported pieces for inspection', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: /Work Synthetic production .* SUBMITTED/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, emails.operator, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  const submitted = page.getByRole('article', { name: `Batch ${fixture.linkedName} SUBMITTED` });
  await submitted.getByLabel('Approved pieces', { exact: true }).fill('10');
  await submitted.getByLabel('Rejected pieces', { exact: true }).fill('0');
  await submitted.getByLabel('Pending pieces', { exact: true }).fill('0');
  await submitted.getByLabel('Stitch alignment result', { exact: true }).selectOption('PASS');
  await submitted
    .getByRole('button', { name: `Record inspection for ${fixture.linkedName}`, exact: true })
    .click();
  const approved = page.getByRole('article', { name: `Batch ${fixture.linkedName} APPROVED` });
  await approved.getByLabel('Approved pieces to prepare', { exact: true }).fill('10');
  await approved
    .getByRole('button', { name: `Prepare approved pieces for ${fixture.linkedName}`, exact: true })
    .click();
  await expect(
    page.getByText('Reported production is not quality-approved production.'),
  ).toBeVisible();
  await expect(
    page.getByText('A prepared consolidation is not a shipment or a delivery.'),
  ).toBeVisible();
  await expect(approved).toContainText('Prepared for shipment');
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  const pickup = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Schedule pickup', exact: true }) });
  await pickup.getByLabel('Collection hub', { exact: true }).fill('Synthetic hub');
  await pickup.getByLabel('Pickup window start', { exact: true }).fill('2026-11-02T09:00');
  await pickup.getByLabel('Pickup window end', { exact: true }).fill('2026-11-02T12:00');
  await pickup.getByLabel('Coordinator reference', { exact: true }).fill(fixture.coordinatorId);
  await pickup.getByLabel('Prepared pieces to collect', { exact: true }).fill('10');
  await pickup.getByRole('button', { name: 'Schedule pickup', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Shipment PICKUP_SCHEDULED' })).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.coordinator, '/association');
  await page.goto('/association/pickups');
  await page.getByRole('button', { name: 'Record collection', exact: true }).click();
  await expect(page.getByText('Saved successfully.')).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.operator, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  const shipment = page.getByRole('article', { name: 'Shipment PICKUP_SCHEDULED' });
  await expect(shipment).toBeVisible();
  // Finance and preparation panels insert content above custody when their reads finish.
  // Wait for the workspace to settle so a layout shift cannot move the button mid-click.
  await expect(page.getByText('Loading workspace…', { exact: true })).toHaveCount(0);
  const hubResponse = page.waitForResponse(
    (response) => response.url().endsWith('/handovers') && response.request().method() === 'POST',
  );
  await shipment.getByRole('button', { name: 'Confirm hub receipt', exact: true }).click();
  expect((await hubResponse).status()).toBe(201);
  await page
    .getByRole('article', { name: 'Shipment COLLECTED' })
    .getByRole('button', { name: 'Record synthetic dispatch', exact: true })
    .click();
  const reported = page.getByRole('article', { name: 'Shipment IN_TRANSIT' });
  await reported.getByLabel('Pieces reported delivered', { exact: true }).fill('10');
  await reported.getByRole('button', { name: 'Report delivery', exact: true }).click();
  const receipt = page.getByRole('article', { name: 'Shipment DELIVERY_REPORTED' });
  await receipt.getByLabel('Pieces received', { exact: true }).fill('9');
  await receipt.getByLabel('Pieces accepted', { exact: true }).fill('9');
  await receipt.getByLabel('Pieces missing', { exact: true }).fill('1');
  await receipt.getByRole('button', { name: 'Confirm buyer receipt', exact: true }).click();
  const discrepancy = page.getByRole('article', { name: 'Shipment DISCREPANCY' });
  await expect(discrepancy).toContainText('Buyer accepted 9');
  await expect(discrepancy).toContainText('1 declared missing by the buyer');
  await expect(discrepancy).toContainText('0 not reported delivered by the operator');
  await expect(page.getByText('No buyer-accepted payable is recognized.')).toBeVisible();
  const story = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Draft public traceability', exact: true }) });
  await story
    .getByLabel('Approved public craft story', { exact: true })
    .fill('Handmade weaving following the approved sample and coarse regional origin.');
  await story.getByRole('button', { name: 'Draft public traceability', exact: true }).click();
  await page.getByRole('button', { name: 'Submit traceability for review', exact: true }).click();
  await page.getByRole('button', { name: 'Publish traceability', exact: true }).click();
  const link = page.getByText(/Public traceability link: \/trace\//);
  await expect(link).toBeVisible();
  const token = ((await link.textContent()) ?? '').match(/\/trace\/([0-9a-f-]{36})/i)?.[1];
  expect(token).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/trace/${token}`);
  await expect(page.getByText('Provenance: synthetic demonstration.')).toBeVisible();
  await expect(
    page.getByText('Handmade weaving following the approved sample and coarse regional origin.'),
  ).toBeVisible();
  await expect(page.getByText('The percentage is withheld.')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'QR code for the public traceability page' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke public traceability', exact: true }).click();
  await page.goto(`/trace/${token}`);
  await expect(page.getByText('This public record was revoked.')).toBeVisible();
  await expect(page.getByText('Handmade weaving')).toHaveCount(0);
  await expect(
    page.getByRole('img', { name: 'QR code for the public traceability page' }),
  ).toHaveCount(0);
});
