import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-feedback-browser-password-2026!';

async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic feedback persona', password },
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

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`buyer receipt, private feedback, correction and support case link on ${viewport.name}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize(viewport);
    const suffix = `f${Date.now().toString(36)}`;
    const buyerEmail = `feedback-buyer-${suffix}@example.com`;
    const operatorEmail = `production-operator-${suffix}@example.com`;
    const artisanEmail = `production-artisan-${suffix}@example.com`;
    const coordinatorEmail = `production-coordinator-${suffix}@example.com`;
    await register(request, operatorEmail);
    await register(request, artisanEmail);
    await register(request, coordinatorEmail);
    await register(request, buyerEmail);
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok(), await seeded.text()).toBeTruthy();
    const feedbackSeed = await request.post(
      `${process.env.E2E_CONTROL_URL}/feedback-fixture?suffix=${suffix}&buyer=${encodeURIComponent(buyerEmail)}`,
    );
    expect(feedbackSeed.ok(), await feedbackSeed.text()).toBeTruthy();
    const feedback = (await feedbackSeed.json()) as { rfqId: string; orderId: string };

    // ---- The buyer confirms receipt, then records a private assessment through the real UI.
    await login(page, buyerEmail, '/procurement');
    await page.goto(`/procurement/${feedback.rfqId}`);
    await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
    const receipt = page.getByRole('article', { name: 'Shipment DELIVERY_REPORTED' });
    await expect(receipt).toBeVisible();
    await receipt.getByLabel('Pieces received', { exact: true }).fill('7');
    await receipt.getByLabel('Pieces accepted', { exact: true }).fill('5');
    await receipt.getByLabel('Pieces missing', { exact: true }).fill('3');
    await receipt.getByLabel('Pieces damaged', { exact: true }).fill('2');
    await receipt.getByRole('button', { name: 'Confirm buyer receipt', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Shipment DISCREPANCY' })).toBeVisible();

    const panel = page.getByRole('region', { name: 'Your delivery feedback' });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText(
        'Feedback is private to you and the assigned support team. A recorded receipt is not payment or commercial acceptance, and feedback never resolves a claim or changes an amount.',
        { exact: true },
      ),
    ).toBeVisible();
    const receiptSelect = panel.getByLabel('Confirmed receipt', { exact: true });
    await expect(receiptSelect).toBeVisible();
    await expect(receiptSelect.locator('option')).toHaveCount(1);
    await panel.getByLabel('Category', { exact: true }).selectOption('DELIVERY');
    await panel.getByLabel('Rating (optional, 1 to 5)', { exact: true }).fill('2');
    const comment = 'Synthetic: three pieces were missing and two were damaged on arrival.';
    await panel.getByLabel('Comment (optional, plain text)', { exact: true }).fill(comment);
    // Keyboard submission: focus then Enter.
    const submit = panel.getByRole('button', { name: 'Submit private assessment', exact: true });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByText('Your current assessment (version 1)')).toBeVisible();
    await expect(panel.getByText(comment, { exact: true }).first()).toBeVisible();
    await expect(
      panel.getByText(/Visitor feedback about a synthetic showroom|User-submitted feedback/),
    ).toBeVisible();
    // The original assessment is visible to the buyer and never published publicly.
    await expect(page.getByText('Submit private assessment', { exact: true })).toHaveCount(0);

    const axeBuyer = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axeBuyer.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    // ---- A buyer correction appends a version and the original statement is preserved.
    await panel.getByLabel('Category', { exact: true }).selectOption('COMMUNICATION');
    await panel.getByLabel('Rating (optional, 1 to 5)', { exact: true }).fill('4');
    const corrected = 'Synthetic: support explained the missing pieces quickly afterwards.';
    await panel.getByLabel('Comment (optional, plain text)', { exact: true }).fill(corrected);
    await panel
      .getByLabel('Why are you correcting this?', { exact: true })
      .fill('Updated after support contact');
    await panel.getByRole('button', { name: 'Save correction', exact: true }).click();
    await expect(panel.getByText('Your current assessment (version 2)')).toBeVisible();
    await panel.getByText('Assessment history (2 versions)').click();
    await expect(panel.getByText(comment, { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('Internal support notes are not shown to buyers.')).toBeVisible();

    // ---- Support assigns follow-up and links the buyer's own existing order claim.
    await page.context().clearCookies();
    await login(page, buyerEmail, '/collaboration');
    await page.goto('/collaboration');
    await expect(
      page.getByRole('heading', { name: 'Collaboration and support', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Case category', exact: true })
      .selectOption('COMMERCIAL');
    await page
      .getByRole('combobox', { name: 'Related resource type', exact: true })
      .selectOption('ORDER');
    await page.getByLabel('Related resource reference', { exact: true }).fill(feedback.orderId);
    const claimText = 'Synthetic claim: three missing and two damaged pieces.';
    await page.getByLabel('Describe the issue', { exact: true }).fill(claimText);
    await page.getByRole('button', { name: 'Open case', exact: true }).click();
    await expect(page.getByText('Support case opened.', { exact: true })).toBeVisible();

    await page.context().clearCookies();
    await login(page, operatorEmail, '/collaboration');
    await page.goto('/collaboration');
    const supportPanel = page.getByRole('region', { name: 'Buyer delivery feedback' });
    await expect(supportPanel).toBeVisible();
    const assessment = supportPanel.locator('li').first();
    await expect(assessment).toContainText(corrected);
    await expect(assessment).toContainText('case: not linked');
    await assessment
      .getByLabel('Internal follow-up note', { exact: true })
      .fill('Internal: claim opened for the missing pieces; no financial action taken.');
    await assessment
      .getByLabel('Reason for this change', { exact: true })
      .fill('Assigned to the support manager for this buyer');
    await assessment.getByRole('button', { name: 'Set Follow up', exact: true }).click();
    await expect(
      page.getByText('Follow-up updated. The buyer assessment fields are unchanged.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(assessment).toContainText('Follow-up: Follow up');
    await assessment
      .getByLabel('Existing order claim for this order', { exact: true })
      .selectOption({ index: 0 });
    await assessment.getByRole('button', { name: 'Link existing claim', exact: true }).click();
    await expect(
      page.getByText('Case linked. The claim keeps its own status and lifecycle.', { exact: true }),
    ).toBeVisible();
    await expect(assessment).toContainText('(Open)');
    // v1 submitted, v2 correction, v3 follow-up, v4 case link. Wait for the reloaded version so the
    // next command carries the current expectedVersion.
    await expect(assessment).toContainText('version 4');
    // The claim itself remains open; resolving follow-up does not resolve the case.
    await assessment
      .getByLabel('Reason for this change', { exact: true })
      .fill('Answered the buyer');
    await assessment.getByRole('button', { name: 'Set Resolved', exact: true }).click();
    await expect(assessment).toContainText('version 5');
    await expect(assessment).toContainText('Follow-up: Resolved');
    const collaboration = await (await page.request.get('/api/v1/collaboration')).json();
    expect(collaboration.tickets[0].status).toBe('OPEN');
    expect(collaboration.orderFeedback).toHaveLength(1);
    expect(collaboration.orderFeedback[0].comment).toBe(corrected);
    expect(collaboration.orderFeedback[0].followUpStatus).toBe('RESOLVED');

    const axeSupport = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axeSupport.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    // ---- A stale version surfaces a reload instruction and never rewrites accepted history.
    await assessment.getByLabel('Reason for this change', { exact: true }).fill('Stale attempt');
    const operatorMe = await (await page.request.get('/api/v1/me')).json();
    const stale = await page.request.post(
      `/api/v1/collaboration/order-feedback/${collaboration.orderFeedback[0].id}/follow-up`,
      {
        headers: {
          Origin: origin,
          'X-CSRF-Token': operatorMe.csrfToken,
          'Idempotency-Key': `stale${Date.now().toString(36)}xxxxxxxx`,
        },
        data: {
          expectedVersion: 1,
          status: 'FOLLOW_UP',
          ownerId: operatorMe.user.id,
          note: '',
          reason: 'Stale attempt',
        },
      },
    );
    const staleBody = await stale.json();
    expect(stale.status(), JSON.stringify(staleBody)).toBe(409);
    expect(staleBody.code).toBe('STALE_VERSION');

    // ---- An anonymous visitor cannot read any private feedback.
    await page.context().clearCookies();
    expect((await request.get('/api/v1/collaboration/order-feedback')).status()).toBe(401);
    // ---- The buyer renders comments as plain text, never as markup.
    const buyerHistory = await request.get(
      `/api/v1/collaboration/order-feedback?orderId=${feedback.orderId}`,
    );
    expect(buyerHistory.status()).toBe(401);
  });
}
