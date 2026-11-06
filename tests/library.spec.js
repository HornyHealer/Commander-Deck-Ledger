// Library tools: search decks by name, commander or card; sort; pin favourites to the top.
const { test, expect } = require('@playwright/test');
const path = require('path');

test.beforeEach(async ({ context }) => {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
});
async function withBackup(page) {
  await page.goto('/');
  await page.setInputFiles('#imp-file', path.join(__dirname, 'fixtures', 'backup.json'));
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(2);
}
const titles = page => page.locator('.deckbox .dname').allTextContents();

test('search finds decks by name, commander or a card in them @phone', async ({ page }) => {
  await withBackup(page);
  const q = page.locator('#f-lib');
  await q.fill('rat');
  await expect(page.locator('.deckbox')).toHaveCount(1);
  await expect(page.locator('.deckbox .dname')).toHaveText('Rat Pack');
  await expect(page.locator('.sect')).toContainText('1of 2');
  await expect(q).toBeFocused();                                   // typing isn't interrupted
  await q.fill('nghathrod');                                       // commander (Captain N'ghathrod)
  await expect(page.locator('.deckbox .dname')).toHaveText(['Rat Pack']);
  await q.fill('thief heartbeats');                                // words of a commander's name, in any order
  await expect(page.locator('.deckbox .dname')).toHaveText(['Fixture Zagras']);
  await q.fill('sol ring');                                        // a card in both decks
  await expect(page.locator('.deckbox')).toHaveCount(2);
  await expect(page.locator('.deckbox .hits').first()).toContainText('Sol Ring');
  await q.fill('no such card anywhere');
  await expect(page.locator('.deckbox')).toHaveCount(0);
  await expect(page.locator('.lib-none')).toContainText('No decks match');
  await q.press('Escape');
  await expect(page.locator('.deckbox')).toHaveCount(2);
});

test('sort by name or commander, remembered; pinned decks stay on top @phone', async ({ page }) => {
  await withBackup(page);
  await page.selectOption('#s-lib', 'name');
  expect(await titles(page)).toEqual(['Fixture Zagras', 'Rat Pack']);
  await page.reload();
  await expect(page.locator('#s-lib')).toHaveValue('name');
  await page.selectOption('#s-lib', 'commander');                 // Captain N'ghathrod before Zagras
  expect(await titles(page)).toEqual(['Rat Pack', 'Fixture Zagras']);
  // Pin Zagras: it moves to the top whatever the sort.
  const before = await page.locator('.deckbox', { hasText: 'Zagras' }).locator('.stats').last().textContent();
  await page.locator('.deckbox', { hasText: 'Zagras' }).getByRole('button', { name: 'Pin Fixture Zagras' }).click();
  expect(await titles(page)).toEqual(['Fixture Zagras', 'Rat Pack']);
  await expect(page.locator('.deckbox', { hasText: 'Zagras' }).getByRole('button', { name: 'Unpin Fixture Zagras' })).toHaveAttribute('aria-pressed', 'true');
  // Pinning isn't a change: "last change" and the history stay as they were.
  await expect(page.locator('.deckbox', { hasText: 'Zagras' }).locator('.stats').last()).toHaveText(before);
  await page.reload();
  expect(await titles(page)).toEqual(['Fixture Zagras', 'Rat Pack']);     // remembered
  await page.locator('.deckbox', { hasText: 'Zagras' }).getByRole('button', { name: 'Unpin Fixture Zagras' }).click();
  expect(await titles(page)).toEqual(['Rat Pack', 'Fixture Zagras']);
  // the pin button doesn't open the deck
  await expect(page.locator('#app .dhead')).toHaveCount(0);
});
