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
  await expect(page.locator('.view.vfx-in')).toHaveCount(0); // not on first load
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.view.vfx-in')).toHaveCount(1);
  await expect(page.locator('.vfx')).toHaveCount(1);
  await expect(page.locator('.vfx-ghosts .vfx-ghost')).toHaveCount(2); // the red and cyan copies
  expect(await page.locator('.vfx-ghost [id]').count()).toBe(0); // copies carry no ids
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0, { timeout: 2000 }); // all of it removes itself
  // Re-drawing the same view (switching tabs, typing) doesn't replay it.
  await page.click('[data-tab="history"]');
  await expect(page.locator('.view.vfx-in')).toHaveCount(0);
  await page.click('[data-act="home"]');
  await expect(page.locator('.view.vfx-in')).toHaveCount(1);
  // The overlay never blocks taps.
  await page.locator('.deckbox').first().click();
  await expect(page.locator('#app .dhead')).toBeVisible();
});

test('no glitch when the device is set to reduce motion @phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="home"]');
  await expect(page.locator('.view.vfx-in')).toHaveCount(0);
  await expect(page.locator('.vfx, .vfx-ghosts')).toHaveCount(0);
});
