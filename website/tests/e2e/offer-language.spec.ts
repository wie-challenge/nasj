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
  test(`FPA09 preferred language gate, clarification, RTL and exact acceptance at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize({ width, height: 900 });
    const suffix = `l09${width}${Date.now().toString(36)}`;
    const email = (role: string) => `production-${role}-${suffix}@example.com`;
    for (const role of ['operator', 'artisan', 'coordinator', 'outsider'])
      await register(request, email(role));
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok(), await seeded.text()).toBeTruthy();
    const fixture = await seeded.json();
    await login(page, email('operator'));
    await issueUpstream(page, fixture.rfqId, fixture.linkedName);
    await login(page, email('artisan'), '/commerce/artisan');
    const card = page.getByRole('article', { name: /^Artisan offer / });
    const current = async () => await (await page.request.get('/api/v1/commerce/workspace')).json();
    const before = (await current()).offers[0];
    if (width === 1280) {
      await page.goto('/artisan/profile');
      await page.getByLabel('Preferred language', { exact: true }).selectOption('ar');
      await page.getByRole('button', { name: 'Save artisan profile', exact: true }).click();
      await expect(page.getByText('Saved successfully.', { exact: true })).toBeVisible();
      await page.goto('/commerce/artisan');
      await expect(card).toHaveAttribute('lang', 'ar');
      await expect(card).toHaveAttribute('dir', 'rtl');
      await card.getByLabel('Offer language', { exact: true }).selectOption('fr');
    }

    await expect(card).toHaveAttribute('lang', 'fr');
    await expect(card).toHaveAttribute('dir', 'ltr');
    await expect(card.getByText(/Aucune traduction commerciale approuvée/)).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Accepter volontairement cette offre', exact: true }),
    ).toBeDisabled();
    await card.getByLabel('Offer language', { exact: true }).selectOption('ar');
    await expect(card).toHaveAttribute('lang', 'ar');
    await expect(card).toHaveAttribute('dir', 'rtl');
    await expect(
      card.getByRole('button', { name: 'قبول هذا العرض طوعا', exact: true }),
    ).toBeDisabled();
    await expect(card.getByText('30.000 TND', { exact: true })).toHaveAttribute('dir', 'ltr');
    await checkA11y(page);
    await card
      .getByLabel('سؤال للتوضيح', { exact: true })
      .fill('Synthetic clarification: explain the original English material terms.');
    let lost = false;
    let originalKey = '';
    let originalBody = '';
    await page.route('**/api/v1/collaboration/tickets', async (route) => {
      if (!lost) {
        lost = true;
        originalKey = route.request().headers()['idempotency-key'];
        originalBody = route.request().postData()!;
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort('connectionfailed');
      } else {
        expect(route.request().headers()['idempotency-key']).toBe(originalKey);
        expect(route.request().postData()).toBe(originalBody);
        await route.continue();
      }
    });
    await card.getByRole('button', { name: 'طلب توضيح', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(card.getByRole('alert')).toContainText('تعذر إتمام الإجراء');
    await expect(card.getByLabel('سؤال للتوضيح', { exact: true })).toBeDisabled();
    expect((await view(page)).tickets).toHaveLength(1);
    await card.getByRole('button', { name: 'طلب توضيح', exact: true }).click();
    await expect(card.getByRole('status')).toContainText('تم تسجيل طلب التوضيح');
    expect((await view(page)).tickets).toHaveLength(1);
    await page.unroute('**/api/v1/collaboration/tickets');
    expect((await current()).batches).toHaveLength(0);
    expect((await current()).offers[0].termsSha256).toBe(before.termsSha256);
    // Switching languages invalidates any acknowledgement; English source review is explicit.
    await card.getByLabel('Offer language', { exact: true }).selectOption('en');
    const ack = card.getByRole('checkbox', {
      name: 'I understand and have reviewed the original English terms for this exact offer version.',
      exact: true,
    });
    await expect(ack).not.toBeChecked();
    await ack.check();
    await card.getByLabel('Offer language', { exact: true }).selectOption('fr');
    await card.getByLabel('Offer language', { exact: true }).selectOption('en');
    await expect(ack).not.toBeChecked();
    await expect(
      card.getByRole('button', { name: 'Accept this offer voluntarily', exact: true }),
    ).toBeDisabled();
    if (width === 360) {
      await card.getByLabel('Offer language', { exact: true }).selectOption('ar');
      await card.getByRole('button', { name: 'الرفض دون عقوبة', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'État de l’offre: Declined', exact: true }),
      ).toBeVisible();
    } else {
      await ack.check();
      await card
        .getByRole('button', { name: 'Accept this offer voluntarily', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'حالة العرض: Accepted', exact: true }),
      ).toBeVisible();
    }
    const after = (await current()).offers[0];
    for (const key of [
      'termsSha256',
      'quantity',
      'unitPayTnd',
      'totalPayTnd',
      'materials',
      'specification',
      'deliveryAt',
    ])
      expect(after[key]).toBe(before[key]);
    expect((await current()).batches).toHaveLength(width === 360 ? 0 : 1);
    await checkA11y(page);
    await login(page, email('outsider'), '/commerce/artisan');
    expect((await current()).offers).toEqual([]);
    const denied = await command(page, `commerce/offers/${before.id}/actions`, {
      next: 'ACCEPTED',
      version: before.version,
      termsSha256: before.termsSha256,
      reviewLanguage: 'en',
      sourceTermsLanguage: 'en',
      acknowledgeOriginalTerms: true,
    });
    expect([403, 404]).toContain(denied.status());
  });
}
