import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

type JsMonitor = {
  errors: string[];
  assertNoErrors: () => void;
};

function monitorJsErrors(page: Page): JsMonitor {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;

    const text = msg.text();
    if (/favicon/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });

  return {
    errors,
    assertNoErrors: () => {
      expect(errors, errors.join('\n')).toEqual([]);
    },
  };
}

async function gotoAndWait(page: Page, path: string, monitor: JsMonitor) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  monitor.assertNoErrors();
}

test.describe('Leap Rally public app', () => {
  test('Startscreen loads with branding and CTA', async ({ page }) => {
    const monitor = monitorJsErrors(page);

    await gotoAndWait(page, '/', monitor);

    await expect(page.locator('#screen-start')).toHaveClass(/active/);
    await expect(page.locator('#screen-start .start-logo-img')).toBeVisible();
    await expect(page.locator('#screen-start .game-title')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toContainText(/START GAME/i);
  });

  test('Navigation from start to rules works and gameplay starts', async ({ page }) => {
    const monitor = monitorJsErrors(page);

    await gotoAndWait(page, '/', monitor);

    await page.locator('#btn-start').click();
    await expect(page.locator('#screen-rules')).toHaveClass(/active/);
    await expect(page.getByText('HOW TO PLAY')).toBeVisible();

    await page.getByRole('button', { name: /LET'S CHARGE!/i }).click();

    await expect(page.locator('#screen-game')).toHaveClass(/active/);
    await expect(page.locator('#countdown-overlay')).toBeVisible();

    await expect(page.locator('#countdown-overlay')).toHaveClass(/hidden/, {
      timeout: 6_000,
    });

    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.locator('#lives-display')).toBeVisible();
    await expect(page.locator('#combo-value')).toContainText('×1');

    const gameplayState = await page.evaluate(() => {
      return {
        screen: state.currentScreen,
        gameActive: state.gameActive,
        gameStartedAt: session.gameStartTs,
        paddleWidth: paddle.w,
        ballX: ball.x,
        ballY: ball.y,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
      };
    });

    expect(gameplayState.screen).toBe('screen-game');
    expect(gameplayState.gameActive).toBe(true);
    expect(gameplayState.gameStartedAt).toBeTruthy();
    expect(gameplayState.paddleWidth).toBeGreaterThan(0);
    expect(gameplayState.ballX).toBeGreaterThan(0);
    expect(gameplayState.ballY).toBeGreaterThan(0);
    expect(gameplayState.canvasWidth).toBeGreaterThan(0);
    expect(gameplayState.canvasHeight).toBeGreaterThan(0);

    monitor.assertNoErrors();
  });

  test('Mobile viewport has no horizontal overflow on iPhone 14', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Mobile Chrome', 'Runs only in the mobile project.');

    const monitor = monitorJsErrors(page);
    await gotoAndWait(page, '/', monitor);

    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  });

  test('Landscape QR panels are visible on tablet landscape viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'Runs only in the desktop project.');

    const monitor = monitorJsErrors(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoAndWait(page, '/', monitor);

    await expect(page.locator('.landscape-qr-panel.left')).toBeVisible();
    await expect(page.locator('.landscape-qr-panel.right')).toBeVisible();
  });

  test('Leaderboard page loads without JavaScript errors', async ({ page }) => {
    const monitor = monitorJsErrors(page);

    await gotoAndWait(page, '/leaderboard.html', monitor);

    await expect(page.locator('#tv-title')).toContainText(/CHALLENGE/i);
    await expect(page.locator('#tv-wrapper')).toBeVisible();
    await expect(page.locator('.tv-entry').first()).toBeVisible();
  });

  test('Teilnahmebedingungen page loads', async ({ page }) => {
    const monitor = monitorJsErrors(page);

    await gotoAndWait(page, '/teilnahmebedingungen.html', monitor);

    await expect(page.getByRole('heading', { name: /Teilnahmebedingungen/i })).toBeVisible();
    await expect(page.locator('.legal-section').first()).toBeVisible();
  });

  test('lead submission offers top three dealers and submits the selected dealer', async ({ page }) => {
    const monitor = monitorJsErrors(page);
    let submittedBody: Record<string, unknown> | null = null;

    await page.route('**/rest/v1/events?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: '00000000-0000-4000-8000-000000000099', name: 'E2E', instant_win_score: 1500,
        instant_win_ghost_req: false, terms_md: 'Test', terms_version: 1,
      }]) });
    });
    await page.route('**/rest/v1/rpc/nearest_dealers_for_zip', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { dealer_code: 'TEST-803', name: 'Leapmotor Testhändler', address: 'Testweg 1', city: 'Berlin', distance_km: 4.2, rank: 1 },
        { dealer_code: 'TEST-804', name: 'Leapmotor Wunschhändler', address: 'Testweg 2', city: 'Potsdam', distance_km: 8.4, rank: 2 },
        { dealer_code: 'TEST-805', name: 'Leapmotor Dritthändler', address: 'Testweg 3', city: 'Berlin', distance_km: 12.6, rank: 3 },
      ]) });
    });
    await page.route('**/rest/v1/rpc/submit_entry_v2', async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          player_id: '00000000-0000-4000-8000-000000000001',
          score_id: '00000000-0000-4000-8000-000000000002',
          is_instant_win: false,
          is_returning: true,
          claim_code: null,
          dealer: {
            dealer_code: 'TEST-804',
            site_code: '001',
            name: 'Leapmotor Wunschhändler',
            city: 'Potsdam',
            distance_km: 8.4,
          },
        }),
      });
    });

    await gotoAndWait(page, '/', monitor);
    await page.evaluate(() => {
      document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
      document.getElementById('screen-end')?.classList.add('active');
      session.submitted = false;
      session.pendingScore = { score: 1200, level_reached: 1, play_duration_s: 12 };
    });

    await page.locator('#fi-contact').selectOption('angebot');
    await page.locator('#fi-vehicle').selectOption('b10');
    await page.locator('#fi-first').fill('E2E');
    await page.locator('#fi-last').fill('Händlerprüfung');
    await page.locator('#fi-email').fill('e2e-haendler@example.test');
    await page.locator('input[name="consent_stay_in_touch"][value="yes"]').check();
    await page.locator('input[name="consent_better_offers"][value="no"]').check();
    await page.locator('input[name="consent_partners"][value="yes"]').check();
    await page.locator('#fi-terms').check();

    await page.locator('#fi-zip').fill('1234');
    await page.locator('#optin-submit-btn').click();
    await expect(page.locator('#optin-error')).toContainText('Gültige fünfstellige PLZ');
    expect(submittedBody).toBeNull();

    await page.locator('#fi-zip').fill('10115');
    await expect(page.locator('input[name="fi_dealer_code"]')).toHaveCount(3);
    await page.locator('input[name="fi_dealer_code"][value="TEST-804"]').check();
    await page.locator('#optin-submit-btn').click();

    await expect.poll(() => submittedBody).not.toBeNull();
    expect(submittedBody).toMatchObject({
      p_zip: '10115',
      p_city: null,
      p_vehicle_interest: 'b10',
      p_dealer_code: 'TEST-804',
      p_consent_stay: true,
      p_consent_offers: false,
      p_consent_partners: true,
    });
    await expect(page.locator('.dealer-assignment')).toHaveCount(0);
    monitor.assertNoErrors();
  });
});
