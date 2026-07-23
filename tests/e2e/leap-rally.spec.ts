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
});
