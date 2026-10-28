// Collection check: paste a list and see what's in the card bin, owned in other decks, or needed.
const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route('https://cards.scryfall.io/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await context.route('https://api.scryfall.com/**', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(2);
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

// Fixture: the bin holds 2 Arcane Signet (added directly) and spares cut from Fixture Zagras
// (Fervent Champion, Typhoid Rats, ...). Sol Ring is in both decks; Rhystic Study is in neither.
const LIST = '1 Krenko, Mob Boss [Commander]\n1 Arcane Signet\n1 Fervent Champion\n1 Sol Ring\n1 Rhystic Study\n20 Mountain';

test('sorts a pasted list into card bin, other decks, and need to get @phone', async ({ page }) => {
  await page.click('[data-act="check"]');
  await expect(page.locator('.dhead h2')).toHaveText('Check a list');
  await page.fill('#chk-list', LIST);
  const res = page.locator('#chk-results');
  await expect(res.locator('.chk-bin')).toContainText('Arcane Signet');
  await expect(res.locator('.chk-bin')).toContainText('Fervent Champion');
  await expect(res.locator('.chk-decks')).toContainText('Sol Ring');
  await expect(res.locator('.chk-need')).toContainText('Rhystic Study');
  await expect(res.locator('.summary')).toContainText('Basic lands');
  await expect(res.locator('.chk-need')).not.toContainText('Mountain');
  // The pasted list is still there after a reload.
  await page.reload();
  await expect(page.locator('#chk-list')).toHaveValue(LIST);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('with clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('copies the cards you need to get', async ({ page }) => {
    await page.click('[data-act="check"]');
    await page.fill('#chk-list', LIST);
    await page.click('[data-act="chk-copy-need"]');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split('\n').sort()).toEqual(['1x Krenko, Mob Boss', '1x Rhystic Study']);
  });
});

test('creates a deck from the checked list, taking bin cards and waiting on the rest', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', LIST);
  await page.click('[data-act="chk-create"]');
  await expect(page.locator('#n-wait')).toHaveValue(/Rhystic Study/);
  await expect(page.locator('#n-takebin')).toBeChecked();
  await page.fill('#n-name', 'Goblin Time');
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.dhead .dn')).toContainText('Goblin Time');
  await expect(page.locator('.inc')).toContainText('Rhystic Study');
  await expect(page.locator('.groups .row', { hasText: 'Arcane Signet' })).toHaveCount(1);
  await page.click('[data-act="home"]');
  // Arcane Signet and Fervent Champion left the bin; Fixture Zagras gave up its spare Fervent Champion.
  await expect(page.locator('.bin .row', { hasText: 'Fervent Champion' })).toHaveCount(0);
  await expect(page.locator('.bin .row', { hasText: 'Arcane Signet' })).toContainText('1');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Moved 1 owned card to Goblin Time');
});
