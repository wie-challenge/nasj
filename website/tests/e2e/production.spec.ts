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
async function fillOffer(scope: ReturnType<Page['getByRole']>) {
  await scope.getByLabel('Offer quantity', { exact: true }).fill('10');
  await scope.getByLabel('Offer expires', { exact: true }).fill('2027-09-20T09:00');
  for (const [label, value] of [
    ['Materials responsibility', 'Operator supplies synthetic yarn'],
    ['Quality and rework', 'Rework requires a new agreement'],
    ['Payment conditions', 'Pay approved pieces independently of buyer delay'],
    ['Collection arrangement', 'Collect at the synthetic workshop'],
    ['Instructions', 'Follow the accepted specification'],
  ] as const)
    await scope.getByLabel(label, { exact: true }).fill(value);
}
test('an artisan accepts issued work and an accountless report stays unverified', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  page.on('dialog', (dialog) => dialog.accept());
  const suffix = `p${Date.now().toString(36)}`;
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
    accountlessName: string;
  };
  await login(page, emails.operator, '/procurement');
  await page.goto(`/procurement/${fixture.rfqId}`);
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Production commitment summary' })).toBeVisible();
  const assess = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Assess eligibility', exact: true }),
  });
  await assess.getByRole('checkbox', { name: /I reviewed the product/ }).check();
  await assess
    .getByLabel('Restriction review source', { exact: true })
    .fill('Synthetic product file');
  await assess.getByRole('button', { name: 'Assess eligibility', exact: true }).click();
  const linked = page.getByRole('article', { name: `ELIGIBLE ${fixture.linkedName}` });
  const accountless = page.getByRole('article', { name: `ELIGIBLE ${fixture.accountlessName}` });
  await expect(linked).toContainText('Known remaining capacity is 50.00');
  await expect(accountless).toContainText('without a digital account');
  await fillOffer(linked);
  await linked.getByRole('button', { name: `Save offer for ${fixture.linkedName}` }).click();
  await page.getByRole('button', { name: `Issue offer to ${fixture.linkedName}` }).click();
  await expect(
    page.getByRole('article', { name: `Offer ${fixture.linkedName} OFFERED` }),
  ).toBeVisible();
  await fillOffer(accountless);
  await accountless
    .getByRole('button', { name: `Save offer for ${fixture.accountlessName}` })
    .click();
  await page.getByRole('button', { name: `Issue offer to ${fixture.accountlessName}` }).click();
  await expect(
    page.getByRole('article', { name: `Offer ${fixture.accountlessName} OFFERED` }),
  ).toBeVisible();
  await page.context().clearCookies();
  await login(page, emails.artisan, '/commerce/artisan');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('30.000 TND', { exact: true })).toBeVisible();
  await page.getByLabel('Offer language', { exact: true }).selectOption('en');
  await expect(page.getByText(/A reviewed translation is not available/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Offer language', { exact: true }).selectOption('en');
  await page
    .getByRole('checkbox', {
      name: 'I understand and have reviewed the original English terms for this exact offer version.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Accept this offer voluntarily', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'État de l’offre: Accepted' })).toBeVisible();
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, emails.coordinator, '/association');
  await page.goto('/association/offers');
  const reported = page.getByRole('article', { name: `${fixture.accountlessName} OFFERED` });
  await reported.getByLabel('Reported artisan choice', { exact: true }).selectOption('ACCEPT');
  await reported
    .getByLabel('Confirmation reference', { exact: true })
    .fill('Synthetic in-person note');
  await reported
    .getByRole('button', { name: `Record reported decision for ${fixture.accountlessName}` })
    .click();
  await expect(reported).toContainText('This is not acceptance');
  await reported.getByRole('button', { name: 'Request verification', exact: true }).click();
  await expect(page.getByText('No approved verification method exists')).toBeVisible();
});
