// End-to-end checks of the main features. Scryfall and Google Fonts are replaced
// with local stand-ins so the tests never depend on outside services.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('https://cards.scryfall.io/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await context.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/cards/search') {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [
        { id: 'print-a', set: 'abc', set_name: 'Set A', released_at: '2025-01-01', artist: 'Artist A', image_uris: { art_crop: 'https://cards.scryfall.io/art_crop/a.jpg' } },
        { id: 'print-b', set: 'xyz', set_name: 'Set B', released_at: '2020-01-01', artist: 'Artist B', image_uris: { art_crop: 'https://cards.scryfall.io/art_crop/b.jpg' } },
      ] }) });
    }
    if (u.searchParams.get('format') === 'image') return r.fulfill({ body: PNG, contentType: 'image/png' });
    if (u.searchParams.get('exact') === 'Brand New Commander') {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Brand New Commander', mana_cost: '{2}{U}{B}', type_line: 'Legendary Creature — Test', color_identity: ['U', 'B'], oracle_text: '' }) });
    }
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

async function importBackup(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No decks yet' })).toBeVisible();
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(2);
}
const openDeck = (page, name) => page.locator('.deckbox', { hasText: name }).click();

test('first visit shows an empty library and can load the example deck @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No decks yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.dhead h2')).toHaveText('Zagras, Thief of Heartbeats');
  await expect(page.locator('.summary')).toContainText('100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('importing a backup keeps the decks after a reload @phone', async ({ page }) => {
  await importBackup(page);
  await page.reload();
  await expect(page.locator('.deckbox')).toHaveCount(2);
  await expect(page.locator('.deckbox', { hasText: 'Rat Pack' })).toContainText('1 to print');
  await expect(page.locator('.deckbox', { hasText: 'Rat Pack' }).locator('a.arch')).toHaveAttribute('href', /archidekt\.com/);
});

test('a swap is recorded in history and the new card can be marked printed', async ({ page }) => {
  await importBackup(page);
  await openDeck(page, 'Rat Pack');
  await page.click('[data-cut="Typhoid Rats"]');
  await page.fill('#s-in', 'Brainstorm');
  await page.locator('#g-in button .nm', { hasText: /^Brainstorm$/ }).click();
  await page.click('[data-act="commit"]');
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Typhoid Rats');
  await expect(page.locator('.hist .entry').first()).toContainText('Brainstorm');
  await page.click('[data-tab="current"]');
  const row = page.locator('.row', { hasText: 'Brainstorm' });
  await expect(row).toContainText('Not printed');
  await page.click('[data-print="Brainstorm"]');
  await expect(row).not.toContainText('Not printed');
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Printed 1 card');
});

test.describe('copying lists', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('copies the deck and the unprinted cards in "1x Name" format', async ({ page }) => {
    await importBackup(page);
    await openDeck(page, 'Rat Pack');
    await page.click('[data-act="copy-menu"]');
    await page.click('.menu [data-act="copy-cur"]');
    const all = await page.evaluate(() => navigator.clipboard.readText());
    expect(all.split('\n')[0]).toBe("1x Captain N'ghathrod [Commander]");
    expect(all).toContain('5x Island');
    await page.click('[data-act="copy-menu"]');
    await page.click('.menu [data-act="copy-toprint"]');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1x Typhoid Rats');
  });
});

test('cards can be added straight to the bin and moved into a deck that needs them', async ({ page }) => {
  await importBackup(page);
  await page.click('[data-act="bin-add"]');
  await page.fill('#ba-list', '3x Swamp\n1x Lightning Bolt');
  await page.click('#ba-go');
  const bin = page.locator('.bin');
  await expect(bin.locator('.group h3', { hasText: 'Lands' })).toBeVisible();
  await expect(bin.locator('.row', { hasText: 'Lightning Bolt' })).toContainText('Added directly');
  // The example deck has a spare printed Typhoid Rats, which Rat Pack still needs.
  await bin.getByRole('button', { name: 'Move to Rat Pack' }).click();
  await expect(page.locator('.deckbox', { hasText: 'Rat Pack' })).toContainText('All printed');
});

test('All cards filters by color with the Exactly and At most modes', async ({ page }) => {
  await importBackup(page);
  await page.click('[data-act="all"]');
  await expect(page.locator('.dhead h2')).toHaveText('All cards');
  await page.click('[data-allcolor="B"]');
  await page.click('[data-allcolor="R"]');
  await page.click('[data-colormode="exact"]');
  const names = () => page.locator('.all-list .nm > span:first-child').allTextContents();
  let list = await names();
  expect(list).toContain('Terminate');
  expect(list).not.toContain('Lightning Bolt');
  await page.click('[data-colormode="most"]');
  list = await names();
  expect(list).toContain('Lightning Bolt');
  expect(list).toContain('Sol Ring');
});

test('export downloads a backup and the reminder tracks it', async ({ page }) => {
  await importBackup(page);
  await expect(page.locator('.backup-chip')).toHaveText('Last backup: today');
  // Pretend the last backup was 20 days ago: the reminder should appear.
  await page.evaluate(() => localStorage.setItem('cdl-last-backup', String(Date.now() - 20 * 86400000)));
  await openDeck(page, 'Rat Pack');
  await page.click('[data-print="Typhoid Rats"]');
  await page.click('[data-act="home"]');
  await expect(page.locator('.backup-warn')).toContainText('Back up your decks');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.backup-warn [data-act="export"]').click()]);
  const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(data.app).toBe('commander-deck-ledger');
  expect(data.decks).toHaveLength(2);
  await expect(page.locator('.backup-warn')).toHaveCount(0);
  await expect(page.locator('.backup-chip')).toHaveText('Last backup: today');
});

test('the artwork picker lists Scryfall printings and saves the choice', async ({ page }) => {
  await importBackup(page);
  await openDeck(page, 'Rat Pack');
  await page.click('[data-act="edit"]');
  await expect(page.locator('.print')).toHaveCount(3);
  await page.click('[data-print-art="print-b"]');
  await expect(page.locator('.artprev')).toHaveAttribute('src', 'https://cards.scryfall.io/art_crop/b.jpg');
  await page.click('[data-dlg="save-edit"]');
  await page.click('[data-act="home"]');
  await expect(page.locator('.deckbox', { hasText: 'Rat Pack' }).locator('.tile-art')).toHaveAttribute('src', 'https://cards.scryfall.io/art_crop/b.jpg');
});

test('cards missing from the built-in list are looked up on Scryfall', async ({ page }) => {
  await importBackup(page);
  await openDeck(page, 'Rat Pack');
  await page.fill('#s-in', 'Brand New Commander');
  await page.keyboard.press('Enter');
  await page.click('[data-act="commit"]');
  const creatures = page.locator('.group', { has: page.locator('h3', { hasText: 'Creatures' }) });
  await expect(creatures).toContainText('Brand New Commander', { timeout: 5000 });
  await expect(page.locator('.row', { hasText: 'Brand New Commander' })).not.toContainText('Unrecognized');
});

test('hovering a card name shows its picture', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await importBackup(page);
  await openDeck(page, 'Rat Pack');
  await page.locator('.row .nm > span:first-child', { hasText: 'Sol Ring' }).hover();
  await expect(page.locator('.cardpv')).toBeVisible();
  await expect(page.locator('.cardpv img')).toHaveAttribute('src', /exact=Sol%20Ring/);
});

test('tapping a card name on a phone shows its picture @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await importBackup(page);
  await openDeck(page, 'Rat Pack');
  await page.locator('.row .nm > span:first-child', { hasText: 'Sol Ring' }).tap();
  await expect(page.locator('.cardpv.tap')).toBeVisible();
});
