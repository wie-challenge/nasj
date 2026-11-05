import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {
  DemoFeedbackCreateInput,
  DemoFeedbackMineList,
  DemoFeedbackView,
} from '@nasj/contracts';

const origin = 'http://127.0.0.1:3100';
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Start Demo', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Share feedback', exact: true });
  await expect(panel).toBeVisible();
  const scenarioId = (await page.getByTestId('demo-scenario-id').textContent())!.trim();
  return { panel, scenarioId, comment: panel.getByLabel('Comment (optional)', { exact: true }) };
}
async function mine(page: Page): Promise<DemoFeedbackMineList> {
  const response = await page.request.get('/api/v1/demo/feedback');
  expect(response.status()).toBe(200);
  return response.json();
}
async function loseFirstResponse(page: Page, committed: boolean) {
  const attempts: { payload: DemoFeedbackCreateInput; key: string }[] = [];
  let accepted: DemoFeedbackView | undefined;
  await page.route('**/api/v1/demo/feedback', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push({
      payload: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });
    if (attempts.length === 1) {
      if (committed) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        accepted = await response.json();
      }
      return route.abort('failed');
    }
    return route.continue();
  });
  return { attempts, accepted: () => accepted };
}
async function accessible(page: Page) {
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

for (const width of [390, 1280]) {
  test(`B14 recovery A: lost committed response, unchanged draft at ${width}`, async ({ page }) => {
    const { panel, comment } = await start(page, width);
    const loss = await loseFirstResponse(page, true);
    await comment.fill('Original committed feedback A');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('unavailable');
    await expect(comment).toHaveValue('Original committed feedback A');
    const retry = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/demo/feedback'),
    );
    await panel.getByRole('button', { name: 'Retry original feedback' }).click();
    const recovered: DemoFeedbackView = await (await retry).json();
    expect(recovered.id).toBe(loss.accepted()!.id);
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      recovered.comment,
    );
    await expect(comment).toHaveValue('');
    expect(loss.attempts[1]).toEqual(loss.attempts[0]);
    expect((await mine(page)).total).toBe(1);
    await accessible(page);
  });

  test(`B14 recovery B: independent P2 edited-draft counterexample recovers at ${width}`, async ({
    page,
  }) => {
    const { panel, comment } = await start(page, width);
    const loss = await loseFirstResponse(page, true);
    await comment.fill('Original committed words');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await comment.fill('Edited words after unavailable error');
    await panel.getByLabel('Category', { exact: true }).selectOption('IDEA');
    await panel
      .getByLabel('Screen or story', { exact: true })
      .selectOption('PRESENTATION:workflow');
    // This is the independent P2 sequence: the editable draft differs before the retry.
    await panel.getByRole('button', { name: 'Retry original feedback' }).click();
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      'Original committed words',
    );
    await expect(comment).toHaveValue('Edited words after unavailable error');
    await expect(panel.getByLabel('Category', { exact: true })).toHaveValue('IDEA');
    await expect(panel.getByLabel('Screen or story', { exact: true })).toHaveValue(
      'PRESENTATION:workflow',
    );
    expect(loss.attempts[1]).toEqual(loss.attempts[0]);
    const first = await mine(page);
    expect(first.total).toBe(1);
    expect(first.items[0].id).toBe(loss.accepted()!.id);
    await accessible(page);
    await panel.getByRole('button', { name: 'Send edited feedback as new submission' }).click();
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      'Edited words after unavailable error',
    );
    expect(loss.attempts[2].key).not.toBe(loss.attempts[0].key);
    expect(loss.attempts[2].payload.category).toBe('IDEA');
    expect(loss.attempts[2].payload.screenKey).toBe('PRESENTATION:workflow');
    const rows = await mine(page);
    expect(rows.total).toBe(2);
    expect(rows.items.map((r) => r.comment).sort()).toEqual([
      'Edited words after unavailable error',
      'Original committed words',
    ]);
    await accessible(page);
  });

  test(`B14 recovery C: request never committed at ${width}`, async ({ page }) => {
    const { panel, comment } = await start(page, width);
    const loss = await loseFirstResponse(page, false);
    await comment.fill('Original request never reached the API');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('unavailable');
    expect((await mine(page)).total).toBe(0);
    await comment.press('Tab');
    await expect(panel.getByRole('button', { name: 'Retry original feedback' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      'Original request never reached the API',
    );
    expect(loss.attempts[1]).toEqual(loss.attempts[0]);
    expect((await mine(page)).total).toBe(1);
    await accessible(page);
  });

  test(`B14 recovery D: expired visitor cannot recover accepted data at ${width}`, async ({
    page,
    browser,
  }) => {
    const { panel, comment, scenarioId } = await start(page, width);
    const loss = await loseFirstResponse(page, true);
    await comment.fill('Authority-bound original feedback');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    expect(
      (
        await page.request.post(
          `${process.env.E2E_CONTROL_URL}/expire-demo-visitor?scenarioId=${scenarioId}`,
        )
      ).status(),
    ).toBe(200);
    const denied = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/demo/feedback'),
    );
    await panel.getByRole('button', { name: 'Retry original feedback' }).click();
    expect((await denied).status()).toBe(403);
    await expect(panel.getByRole('alert')).toContainText('visitor session ended');
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toHaveCount(0);
    await expect(comment).toHaveValue('Authority-bound original feedback');
    expect(loss.attempts[1]).toEqual(loss.attempts[0]);
    const stranger = await browser.newContext();
    try {
      await stranger.request.get(`${origin}/api/v1/demo/session`);
      const unrelated = await stranger.request.get(
        `${origin}/api/v1/demo/feedback?scenarioId=${scenarioId}`,
      );
      expect((await unrelated.json()).total).toBe(0);
    } finally {
      await stranger.close();
    }
    await page.request.get('/api/v1/demo/session');
    const renewed = await page.request.get(`/api/v1/demo/feedback?scenarioId=${scenarioId}`);
    expect((await renewed.json()).total).toBe(0);
    await accessible(page);
  });

  test(`B14 recovery E: real validation error permits correction at ${width}`, async ({ page }) => {
    const { panel, comment } = await start(page, width);
    const attempts: { key: string; status: number }[] = [];
    await page.route('**/api/v1/demo/feedback', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const first = attempts.length === 0;
      // Exercise the real API validator; only the first outgoing request has an invalid enum.
      const response = await route.fetch(
        first ? { postData: { ...route.request().postDataJSON(), category: 'INVALID' } } : {},
      );
      attempts.push({
        key: route.request().headers()['idempotency-key'],
        status: response.status(),
      });
      await route.fulfill({ response });
    });
    await comment.fill('Draft preserved through validation rejection');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(comment).toHaveValue('Draft preserved through validation rejection');
    expect(attempts[0].status).toBe(400);
    expect((await mine(page)).total).toBe(0);
    await comment.fill('Corrected valid draft');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      'Corrected valid draft',
    );
    expect(attempts[1].status).toBe(201);
    expect(attempts[1].key).not.toBe(attempts[0].key);
    expect((await mine(page)).total).toBe(1);
    await accessible(page);
  });

  test(`B14 recovery respects the per-scenario cap at ${width}`, async ({ page }) => {
    const { panel, comment, scenarioId } = await start(page, width);
    const session = await (await page.request.get('/api/v1/demo/session')).json();
    for (let n = 0; n < 9; n++) {
      expect(
        (
          await page.request.post('/api/v1/demo/feedback', {
            headers: {
              Origin: origin,
              'X-Demo-CSRF': session.csrfToken,
              'Idempotency-Key': crypto.randomUUID(),
            },
            data: {
              scenarioId,
              screenKey: 'SHOWROOM_OVERVIEW',
              category: 'IDEA',
              comment: `Cap fixture ${n}`,
            },
          })
        ).status(),
      ).toBe(201);
    }
    const loss = await loseFirstResponse(page, true);
    await comment.fill('Tenth accepted feedback');
    await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await comment.fill('Intentional eleventh draft');
    await panel.getByRole('button', { name: 'Retry original feedback' }).click();
    await expect(panel.getByRole('region', { name: 'Accepted feedback' })).toContainText(
      'Tenth accepted feedback',
    );
    expect(loss.attempts[1]).toEqual(loss.attempts[0]);
    const refused = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/demo/feedback'),
    );
    await panel.getByRole('button', { name: 'Send edited feedback as new submission' }).click();
    expect((await refused).status()).toBe(409);
    await expect(panel.getByRole('alert')).toContainText('feedback limit');
    await expect(comment).toHaveValue('Intentional eleventh draft');
    expect((await mine(page)).total).toBe(10);
    await accessible(page);
  });
}
