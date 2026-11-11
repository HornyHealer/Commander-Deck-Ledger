// The short glitch played when switching views, and that it's skipped when the device asks for less motion.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the other tests run with reduced motion
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // No accounts here, so the page is ready without waiting on Google's servers.
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
});

test('switching views plays a short glitch, then cleans up after itself', async ({ page }) => {
  await page.goto('/');
  // Wait out the loading screen's own glitch (tested below).
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  await expect(page.locator('.view')).toHaveCount(1);
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx.v')).toHaveCount(1);
  await expect(page.locator('.vfx-ghosts .vfx-ghost')).toHaveCount(2); // the red and cyan copies
  expect(await page.locator('.vfx-ghost [id]').count()).toBe(0); // copies carry no ids
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 }); // all of it removes itself
  // Re-drawing the same view (switching tabs, typing) doesn't replay it.
  await page.click('[data-tab="history"]');
  await page.waitForTimeout(100);
  await expect(page.locator('.vfx')).toHaveCount(0);
  await page.click('[data-act="home"]');
  await expect(page.locator('.vfx.v')).toHaveCount(1);
  // The overlay never blocks taps.
  await page.locator('.deckbox').first().click();
  await expect(page.locator('#app .dhead')).toBeVisible();
});

test('no glitch when the device is set to reduce motion @phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="home"]');
  await page.waitForTimeout(100);
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0);
});

test('popups glitch in when they open, and the pieces go when they close', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  await page.click('[data-act="edit"]');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
  await expect(page.locator('.vfx-ghosts.p .vfx-ghost')).toHaveCount(2);
  await expect(page.locator('.vfx.p, .vfx-ghosts.p')).toHaveCount(0, { timeout: 2000 });
  // Typing doesn't replay it.
  await page.fill('#e-name', 'Renamed');
  await expect(page.locator('.vfx.p')).toHaveCount(0);
  await page.click('[data-dlg="close"]');
  await page.click('[data-act="edit"]');
  await page.click('[data-dlg="close"]');
  await expect(page.locator('.vfx.p, .vfx-ghosts.p')).toHaveCount(0);
});

test('a card image glitches in as it loads', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop'); // the hover preview is for mouse users
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  const name = page.locator('#app .row .nm > span:first-child').nth(2);
  // The rows can be redrawn as card details arrive, so try the hover again if that happens mid-step.
  await expect(async () => {
    await name.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await name.hover();
    await expect(page.locator('.cardpv .vfx-img img.vfx-ghost')).toHaveCount(2, { timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(page.locator('.cardpv .vfx-img')).toHaveCount(0, { timeout: 2000 });
  await expect(page.locator('.cardpv img').first()).toBeVisible();
});

test('the site opens on "Defragmenting", which breaks apart into the page once it has loaded @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#boot')).toContainText('DEFRAGMENTING');
  await expect(page.locator('#boot .boot-map i')).toHaveCount(96);
  await expect(page.locator('#boot.boot-gone .boot-tiles')).toHaveCount(1, { timeout: 5000 }); // the dark blocks
  await expect(page.locator('.vfx.v')).toHaveCount(1); // and the page glitching in
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 2000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('#app .dhead')).toBeVisible();
});

test('with reduced motion the loading screen just goes once the page is ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.locator('.vfx, .boot-tiles')).toHaveCount(0);
});

test('switching a deck tab, and opening or closing a fold, glitches just that part', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  const settle = () => expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  // a tab: the pieces cover the tab's contents, not the whole page
  await page.click('[data-tab="stats"]');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
  const fx = await page.locator('.vfx.p').boundingBox(), panel = await page.locator('#app .tabpanel').boundingBox();
  // (the contents jitter sideways during the effect, so allow for that)
  expect(Math.abs(fx.x - panel.x)).toBeLessThan(40); expect(Math.abs(fx.width - panel.width)).toBeLessThan(2);
  expect(fx.width).toBeLessThan(await page.evaluate(() => innerWidth) - 100); // not the whole page
  await settle();
  // clicking the tab that's already open does nothing
  await page.click('[data-tab="stats"]');
  await page.waitForTimeout(100); await expect(page.locator('.vfx')).toHaveCount(0);
  // a fold-out section
  await page.click('.st-details summary');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
  await settle();
  // the bracket explanation, open and shut
  await page.click('[data-act="toggle-bracket"]');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
  await settle();
  await page.click('[data-act="toggle-bracket"]');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
  await settle();
  // the card bin
  await page.click('[data-act="home"]');
  await settle();
  await page.click('.bin-fold');
  await expect(page.locator('.vfx.p')).toHaveCount(1);
});

test('in Starlight, changing boxes fill with a nebula and open from the center, then clean up', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  await page.click('.themes [data-v="starlight"]');
  // a whole page: each panel on screen gets its own nebula, inside its own shape
  await expect(page.locator('.sl-gal').first()).toBeAttached();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0); // no glitch in this theme
  const shapes = await page.evaluate(() => [...document.querySelectorAll('.sl-gal')].map(g => {
    const r = g.getBoundingClientRect(); return [...document.querySelectorAll('.sheet, .summary, .bench')].some(b => { const q = b.getBoundingClientRect(); return Math.abs(q.left - r.left) < 2 && Math.abs(q.width - r.width) < 2; });
  }));
  expect(shapes.length).toBeGreaterThan(0);
  expect(shapes.every(Boolean)).toBe(true);
  await expect(page.locator('canvas.sl-fx')).toHaveCount(1);
  await expect(page.locator('.sl-gal, .sl-rimbox')).toHaveCount(0, { timeout: 4000 }); // all of it removes itself
  // a popup gets its own, and taps still work afterwards
  await page.click('[data-act="edit"]');
  await expect(page.locator('.sl-gal')).toHaveCount(1);
  await expect(page.locator('.sl-gal')).toHaveCount(0, { timeout: 3000 });
  await page.click('[data-dlg="close"] >> nth=0');
  await page.click('[data-tab="stats"]');
  await expect(page.locator('.sl-gal')).toHaveCount(1); // just the tab's contents
  await expect(page.locator('.sl-gal')).toHaveCount(0, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('in Starlight, changing pages from further down still transforms (the jump to the top does not cancel it)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.addInitScript(() => { try { localStorage.setItem('cdl-theme', 'starlight'); localStorage.setItem('cdl-bin-open', '1'); } catch {} });
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 6000 });
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="home"]');
  await expect(page.locator('.sl-gal')).toHaveCount(0, { timeout: 4000 });
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.locator('.deckbox').first().click();
  await page.waitForTimeout(400);
  await expect(page.locator('.sl-gal').first()).toBeAttached(); // still running after the scroll back to the top
  // scrolling away by hand ends it early, so nothing is left floating out of place
  await page.mouse.wheel(0, 400);
  await expect(page.locator('.sl-gal')).toHaveCount(0, { timeout: 1000 });
});

test('Starlight loads with its own loading screen', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cdl-theme', 'starlight'); } catch {} });
  await page.goto('/');
  await expect(page.locator('#boot .boot-star')).toBeVisible();
  await expect(page.locator('#boot .boot-in')).toBeHidden();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 6000 });
});
