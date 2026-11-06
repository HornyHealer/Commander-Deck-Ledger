// The deck's Stats tab: colors against land sources, the mana curve by type, and the sample hand.
const { test, expect } = require('@playwright/test');
const path = require('path');

test.beforeEach(async ({ context }) => {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
});
async function openStats(page) {
  await page.goto('/');
  await page.setInputFiles('#imp-file', path.join(__dirname, 'fixtures', 'backup.json'));
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.deckbox', { hasText: 'Zagras' }).click();
  await page.click('[data-tab="stats"]');
}

test('colors and the mana curve for a deck @phone', async ({ page }) => {
  await openStats(page);
  // Zagras is black and red: one row each, symbols beside land sources
  await expect(page.locator('.st-color')).toHaveCount(2);
  await expect(page.locator('.st-color').first()).toContainText('Black');
  await expect(page.locator('.st-color').nth(1)).toContainText('Red');
  await expect(page.locator('.st-color .st-bar.land').first()).toContainText('lands');
  // the curve: eight columns (0 to 7+), split by type, with a legend and the exact counts in a table
  await expect(page.locator('.st-col')).toHaveCount(8);
  await expect(page.locator('.st-legend')).toContainText('Creatures');
  const shown = await page.locator('.st-tot').allTextContents();
  const sum = shown.reduce((a, v) => a + (+v || 0), 0);
  await expect(page.locator('.st-curve').locator('xpath=..').locator('h3')).toContainText(`${sum} spells`);
  await page.click('.st-details summary');
  await expect(page.locator('.st-table tbody tr').first()).toContainText('Creatures');
});

test('sample hand: new hand, draw and London mulligans @phone', async ({ page }) => {
  await openStats(page);
  const hand = page.locator('.hand .hand-card');
  await expect(hand).toHaveCount(7);
  await expect(page.locator('.hand')).not.toContainText('Zagras, Thief of Heartbeats'); // the commander isn't in the library
  await page.click('[data-act="hand-draw"]');
  await expect(hand).toHaveCount(8);
  await expect(page.locator('.hand-card.drawn')).toHaveCount(1);
  await page.click('[data-act="hand-mull"]');
  await expect(hand).toHaveCount(7);
  await expect(page.locator('.st-mull')).toContainText('first one is free');
  await page.click('[data-act="hand-mull"]');
  await expect(page.locator('.st-mull')).toContainText('put 1 card on the bottom');
  await page.click('[data-act="hand-new"]');
  await expect(page.locator('.st-mull')).toHaveCount(0);
  await expect(hand).toHaveCount(7);
});

test('a card in the sample hand opens bigger, and closes with Escape or a tap @phone', async ({ page }) => {
  await openStats(page);
  const first = page.locator('.hand .hand-card').first();
  const name = await first.getAttribute('data-card');
  await first.click();
  await expect(page.locator('.cardpv.tap')).toBeVisible();
  await expect(page.locator('.cardpv img')).toHaveAttribute('alt', name);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cardpv')).toBeHidden();
  await first.click();
  await page.mouse.click(5, 5);                                  // anywhere else
  await expect(page.locator('.cardpv')).toBeHidden();
  await expect(page.locator('.hand .hand-card')).toHaveCount(7);  // and that tap didn't do anything else
});
