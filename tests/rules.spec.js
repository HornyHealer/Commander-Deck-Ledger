// Commander legality checks and permanent card IDs, using a small fixed card list.
const { test, expect } = require('@playwright/test');
const path = require('path');

const CARDS = path.join(__dirname, 'fixtures', 'cards-rules.json');
const BACKUP = path.join(__dirname, 'fixtures', 'backup-rules.json');

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // These tests run with accounts switched off; tests/cloud.spec.js covers sign-in and sync.
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/data/cards.json', r => r.fulfill({ path: CARDS, contentType: 'application/json' }));
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(3);
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });
const openDeck = (page, name) => page.locator('.deckbox', { hasText: name }).click();

test('lists every rule problem in a deck', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await expect(page.locator('.deckbox', { hasText: 'Broken Brew' })).toContainText('rule issue');
  await openDeck(page, 'Broken Brew');
  await page.click('[data-act="toggle-checks"]');
  const checks = page.locator('#deck-checks');
  await expect(checks).toContainText("Thrasios, Triton Hero and Wilson, Refined Grizzly can't be commanders together.");
  await expect(checks).toContainText('banned in Commander');
  await expect(checks).toContainText('more copies than allowed');
  await expect(checks).toContainText('short of 100');
  await expect(checks).toContainText('outside your commander');
  // Relentless Rats may have any number of copies; Seven Dwarves up to seven.
  await expect(page.locator('.row', { hasText: 'Relentless Rats' })).not.toContainText('Too many copies');
  await expect(page.locator('.row', { hasText: 'Seven Dwarves' })).toContainText('Too many copies');
  await expect(page.locator('.row', { hasText: 'Lightning Bolt' })).toContainText('Too many copies');
  await expect(page.locator('.row', { hasText: 'Black Lotus' })).toContainText('Banned');
  await expect(page.locator('.row', { hasText: 'Island' })).not.toContainText('Too many copies');
});

test('a legal partner pair passes the check @phone', async ({ page }) => {
  await openDeck(page, 'Partners');
  await expect(page.locator('.summary .checkcell')).toContainText('Legal');
  await expect(page.locator('.deckbox')).toHaveCount(0);
});

test('"partner with" pairs are matched by name', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await openDeck(page, 'Renamed');
  await expect(page.locator('.summary .checkcell')).toContainText('Legal');
});

test('decks get permanent card IDs and follow renames', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await openDeck(page, 'Renamed');
  // Saved as "Ye Olde Sol Ring" but its ID belongs to Sol Ring, so it shows under the current name.
  await expect(page.locator('.row', { hasText: 'Sol Ring' })).toBeVisible();
  await expect(page.locator('.row', { hasText: 'Ye Olde' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cdl-data-v1'))).not.toBeNull();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cdl-data-v1')));
  const deck = saved.decks.find(d => d.id === 'rules-renamed');
  expect(deck.cur.every(c => c.i)).toBe(true);
  expect(deck.printed.find(p => p.n === 'Sol Ring').i).toBe('00000000-0000-0000-0000-000000000010');
  expect(saved.bin.cards[0].i).toBe('00000000-0000-0000-0000-000000000011');
});

test('the commander picker offers Backgrounds', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.click('[data-act="new"]');
  await page.fill('#n-list', '1 Wilson, Refined Grizzly\n1 Raised by Giants\n1 Sol Ring');
  await expect(page.locator('#n-parse .cmdpick')).toContainText('Raised by Giants');
  await expect(page.locator('#n-parse .cmdpick')).not.toContainText('Sol Ring');
});
