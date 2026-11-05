import { expect, test } from '@playwright/test';

test('public financial model recalculates exact assumptions without commercial writes', async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    )
      mutations.push(`${request.method()} ${request.url()}`);
  });
  await page.goto('/simulator');
  const custom = page.getByRole('article', { name: 'Custom scenario' });
  await expect(custom).toContainText('645.000');
  await expect(custom).toContainText('8.000 TND/hour');
  await page.getByLabel('Labor effort per piece', { exact: false }).fill('120');
  await expect(custom).toContainText('6.000 TND/hour');
  await page.getByRole('button', { name: 'Load conservative' }).click();
  await expect(custom).toContainText('-353.000');
  await expect(custom).toContainText('-27.69%');
  await page.getByLabel('Order quantity', { exact: false }).fill('0');
  await expect(custom).toContainText('UNAVAILABLE');
  await expect(custom).toContainText('-275.000');
  await page.getByLabel('Buyer unit selling price', { exact: false }).fill('');
  await expect(custom.getByRole('alert')).toContainText('Results withheld');
  await expect(custom).not.toContainText('Planned contribution');
  await page.getByRole('button', { name: 'Reset to baseline' }).click();
  await page.getByLabel('Expected rejection', { exact: false }).fill('100');
  await expect(custom).toContainText('1200.000');
  await expect(custom).toContainText('-2205.000');
  await expect(custom).toContainText('UNAVAILABLE — nonpositive unit margin');
  await expect(
    page.getByRole('img', {
      name: 'Calculated planned contributions, negative values extend left of zero',
    }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test('financial model remains readable and operable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/simulator');
  await expect(page.getByRole('heading', { name: 'Financial scenario comparison' })).toBeVisible();
  await page.getByLabel('Compensation calculation').selectOption('HOURLY');
  await page.getByLabel('Artisan hourly rate', { exact: false }).fill('10.000');
  const custom = page.getByRole('article', { name: 'Custom scenario' });
  await expect(custom).toContainText('1500.000');
  await expect(custom).toContainText('10.000 TND/hour');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
