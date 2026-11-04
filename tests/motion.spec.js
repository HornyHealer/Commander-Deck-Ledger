// The short glitch played when switching views, and that it's skipped when the device asks for less motion.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the other tests run with reduced motion
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
});

test('switching views plays a short glitch, then cleans up after itself', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.view')).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(page.locator('.vfx')).toHaveCount(0); // not on first load
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
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 });
  const name = page.locator('#app .row .nm > span:first-child').nth(2);
  await name.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await name.hover();
  await expect(page.locator('.cardpv .vfx-img')).toHaveCount(1);
  await expect(page.locator('.cardpv .vfx-img img.vfx-ghost')).toHaveCount(2);
  await expect(page.locator('.cardpv .vfx-img')).toHaveCount(0, { timeout: 2000 });
  await expect(page.locator('.cardpv img').first()).toBeVisible();
});
