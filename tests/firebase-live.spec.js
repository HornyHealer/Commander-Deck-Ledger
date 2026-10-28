// Runs on GitHub only (it needs the internet): loads the real Firebase library with the
// site's real settings and checks that sign-in is offered. No one is signed in.
const { test, expect } = require('@playwright/test');

test('the real Firebase library loads and offers sign-in', async ({ page }, info) => {
  test.skip(!process.env.CI || info.project.name !== 'desktop', 'needs the internet; runs on GitHub');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.topacts [data-act="signin"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.sync-chip.warn')).toHaveCount(0);
  expect(errors).toEqual([]);
});
