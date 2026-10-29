// Archidekt link import: the Fetch button fills the deck list (the Cloudflare Worker is stood in for here),
// and the New deck popup sorts cards by what you own.
const { test, expect } = require('@playwright/test');
const path = require('path');
const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');
const PROXY = 'https://cdl-archidekt.deckledger.workers.dev/**';
const DECK = { id: '26238673', name: 'Goblin Party', count: 4, commanders: ['Krenko, Mob Boss'], text: '1x Krenko, Mob Boss [Commander]\n1x Arcane Signet\n1x Lightning Bolt\n1x Rhystic Study' };

let pageErrors, asked;
test.beforeEach(async ({ page, context }) => {
  pageErrors = []; asked = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route(PROXY, r => {
    const deck = new URL(r.request().url()).searchParams.get('deck'); asked.push(deck);
    if (deck === '26238673') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(DECK) });
    return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not-found' }) });
  });
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });
async function importBackup(page) {
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(2);
}

test('New deck: Fetch fills the deck list and name from an Archidekt link @phone', async ({ page }) => {
  await importBackup(page);
  await page.click('[data-act="new"]');
  await page.fill('#n-link', 'https://archidekt.com/decks/26238673/goblin_party');
  await page.click('[data-arch="n"]');
  await expect(page.locator('#n-fetch-msg')).toContainText('Fetched 4 cards from “Goblin Party”');
  await expect(page.locator('#n-list')).toHaveValue(DECK.text);
  await expect(page.locator('#n-name')).toHaveValue('Goblin Party');
  await expect(page.locator('#n-parse .cmdpick input[value="Krenko, Mob Boss"]')).toBeChecked();
  // The collection rows sort the fetched cards like a pasted list.
  await expect(page.locator('.rule', { hasText: 'In the card bin' })).toBeVisible();
  await expect(page.locator('.rule', { hasText: 'In other decks' })).toBeVisible();
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.dhead .dn')).toContainText('Goblin Party');
  await expect(page.locator('.dhead .dn a')).toHaveAttribute('href', /archidekt\.com\/decks\/26238673/);
  expect(asked).toEqual(['26238673']);
});

test('New deck: a name already typed in is kept, and bad links get a clear message', async ({ page }) => {
  await importBackup(page);
  await page.click('[data-act="new"]');
  await page.fill('#n-link', 'not a link');
  await page.click('[data-arch="n"]');
  await expect(page.locator('#n-fetch-msg')).toContainText("doesn't look like an Archidekt deck link");
  expect(asked).toEqual([]);
  await page.fill('#n-link', 'https://archidekt.com/decks/999/private');
  await page.press('#n-link', 'Enter');
  await expect(page.locator('#n-fetch-msg')).toContainText('couldn\'t find that deck');
  await page.fill('#n-name', 'My Name');
  await page.fill('#n-link', '26238673');
  await page.click('[data-arch="n"]');
  await expect(page.locator('#n-list')).toHaveValue(DECK.text);
  await expect(page.locator('#n-name')).toHaveValue('My Name');
});

test('Check a list: Fetch fills the list and the check runs', async ({ page }) => {
  await importBackup(page);
  await page.click('[data-act="check"]');
  await page.fill('#chk-link', 'https://archidekt.com/decks/26238673/goblin_party');
  await page.click('[data-arch="chk"]');
  await expect(page.locator('#chk-fetch-msg')).toContainText('Fetched 4 cards');
  await expect(page.locator('#chk-list')).toHaveValue(DECK.text);
  await expect(page.locator('#chk-results .chk-need')).toContainText('Rhystic Study');
  await expect(page.locator('#chk-results .chk-bin')).toContainText('Arcane Signet');
  // Creating a deck from the check carries the link along.
  await page.click('[data-act="chk-create"]');
  await expect(page.locator('#n-link')).toHaveValue('https://archidekt.com/decks/26238673/goblin_party');
  await page.reload();
  await expect(page.locator('#chk-link')).toHaveValue('https://archidekt.com/decks/26238673/goblin_party');
});

test("someone's first deck starts with not-owned cards as Owned", async ({ page }) => {
  await page.goto('/');
  await page.click('[data-act="new"]');
  await expect(page.locator('#n-rules')).toContainText('Paste a list or fetch one');
  await page.fill('#n-list', '1 Krenko, Mob Boss [Commander]\n1 Lightning Bolt\n98 Mountain');
  await expect(page.locator('[data-rule="need|owned"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rule', { hasText: 'In the card bin' })).toHaveCount(0);
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.inc')).toHaveCount(0);
  await expect(page.locator('.summary')).toContainText('100');
});

const RAT_PACK_NOW = { id: '1', name: 'Rat Pack', count: 9, commanders: ["Captain N'ghathrod"], text: "1x Captain N'ghathrod [Commander]\n1x Brainstorm\n6x Island\n1x Typhoid Rats" };

test('Update from Archidekt fetches the saved link and puts only the differences on the bench @phone', async ({ page, context }) => {
  await context.route(PROXY, r => {
    const deck = new URL(r.request().url()).searchParams.get('deck'); asked.push(deck);
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(deck === '1' ? RAT_PACK_NOW : DECK) });
  });
  await importBackup(page);
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-act="update"]');
  await expect(page.locator('#dlg-t')).toHaveText('Update from Archidekt');
  // The deck already has its link saved, so it fetches right away.
  await expect(page.locator('#u-fetch-msg')).toContainText('Fetched 9 cards');
  expect(asked).toEqual(['1']);
  const diff = page.locator('#u-diff');
  await expect(diff).toContainText('Sol Ring');
  await expect(diff).toContainText('Brainstorm');
  // Typhoid Rats is already incoming, so it isn't added again.
  await expect(diff).not.toContainText('Typhoid Rats');
  await expect(page.locator('#u-go-save')).toHaveCount(0);
  await page.click('#u-go');
  const bench = page.locator('.bench');
  await expect(bench.locator('.dropbox[data-drop="out"]')).toContainText('Sol Ring');
  await expect(bench.locator('.dropbox[data-drop="in"]')).toContainText('Brainstorm');
  await expect(bench.locator('.dropbox[data-drop="in"]')).toContainText('Island');
});

test('Update from Archidekt asks for a link when none is saved, and can save it to the deck', async ({ page }) => {
  await importBackup(page);
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-act="update"]');
  await expect(page.locator('#u-link')).toHaveValue('');
  expect(asked).toEqual([]);
  await page.fill('#u-link', '26238673');
  await page.press('#u-link', 'Enter');
  await expect(page.locator('#u-fetch-msg')).toContainText('Fetched 4 cards');
  await expect(page.locator('#u-go')).toBeEnabled();
  await page.click('#u-go-save');
  await expect(page.locator('.dhead .dn a')).toHaveAttribute('href', 'https://archidekt.com/decks/26238673');
  await expect(page.locator('.bench .dropbox[data-drop="in"]')).toContainText('Krenko, Mob Boss');
});

test('Update from Archidekt still takes a pasted list', async ({ page }) => {
  await importBackup(page);
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-act="update"]');
  await page.click('.u-paste summary');
  await page.fill('#u-list', '1 Zagras, Thief of Heartbeats [Commander]\n1 Sol Ring');
  await expect(page.locator('#u-diff')).toContainText('Coming out');
  await expect(page.locator('#u-go-save')).toHaveCount(0);
  await page.click('#u-go');
  await expect(page.locator('.bench .dropbox[data-drop="out"] .brow').first()).toBeVisible();
});
