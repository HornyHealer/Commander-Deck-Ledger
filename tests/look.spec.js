// The card bin fold, the light/dark switch, the phone top bar and the backdrop.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
});

test('the card bin starts folded and remembers being opened @phone', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.removeItem('cdl-bin-open'); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="home"]');
  const fold = page.locator('.bin-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toContainText('Card bin');
  await expect(page.locator('.bin .row')).toHaveCount(0);   // the cards are tucked away
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.bin .row').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.bin-fold')).toHaveAttribute('aria-expanded', 'true');
  await page.click('.bin-fold');
  await expect(page.locator('.bin .row')).toHaveCount(0);
});

test('the light/dark switch overrides the device setting and is remembered @phone', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect.poll(bg).toBe('rgb(11, 11, 10)');
  const sw = page.locator('[data-act="theme"]');
  await expect(sw).toHaveAttribute('aria-label', 'Switch to light mode');
  await sw.click();
  await expect.poll(bg).toBe('rgb(239, 238, 247)');                  // white with a lilac tint
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-act="theme"]')).toHaveAttribute('aria-label', 'Switch to dark mode');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // applied before the page draws
  await expect.poll(bg).toBe('rgb(239, 238, 247)');
  await page.click('[data-act="theme"]');
  await expect.poll(bg).toBe('rgb(11, 11, 10)');
});

test('on a phone the top bar is one even row @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="home"]');
  const cells = page.locator('.topacts > *');
  await expect(cells).toHaveCount(4); // Cards, Check, light/dark, New (no accounts in this test)
  const boxes = await cells.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), Math.round(r.width)]; }));
  expect(new Set(boxes.map(b => b[0])).size).toBe(1);   // same row
  expect(new Set(boxes.map(b => b[1])).size).toBe(1);   // same height
  expect(Math.max(...boxes.map(b => b[2])) - Math.min(...boxes.map(b => b[2]))).toBeLessThanOrEqual(1); // same width
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the backdrop and console frame sit behind the page @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas#bd')).toHaveCount(1);
  await expect(page.locator('.bd-frame')).toContainText('Ledger_terminals_online');
  // behind everything and never in the way of a tap
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bd')).pointerEvents)).toBe('none');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('#app .dhead')).toBeVisible();
  // it has drawn something
  expect(await page.evaluate(() => { const c = document.getElementById('bd'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; })).toBe(true);
});
