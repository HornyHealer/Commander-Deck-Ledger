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
  // Every group starts as Incoming. Here bin cards come out of the bin; other-deck cards stay put (Owned).
  await expect(page.locator('#n-wait')).toHaveCount(0);
  for (const g of ['bin', 'decks', 'need']) await expect(page.locator(`[data-rule="${g}|incoming"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rule', { hasText: 'In other decks' }).locator('.seg .chip')).toHaveText(['Swap from Decks', 'New Incoming', 'Add to Collection']);
  await page.click('[data-rule="bin|owned"]');
  await page.click('[data-rule="decks|owned"]');
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

async function createTaking(page) {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Lightning Bolt\n1 Rhystic Study');
  await page.click('[data-act="chk-create"]');
  await page.click('[data-rule="decks|swap"]');
  await page.click('[data-rule-open="decks"]');
  await expect(page.locator('.rule-list li', { hasText: 'Lightning Bolt' })).toContainText('From Fixture Zagras');
  await page.fill('#n-name', 'Goblin Time');
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.dhead .dn')).toContainText('Goblin Time');
}
const deckRow = (page, n) => page.locator('.groups .row', { has: page.locator('.nm > span:first-child', { hasText: new RegExp('^' + n + '$') }) });

test('creating from a check can take cards from other decks, logged in both decks', async ({ page }) => {
  await createTaking(page);
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Took 1 card from Fixture Zagras');
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(0);
  await page.click('[data-tab="printed"]');
  await expect(page.locator('.plist .row', { hasText: 'Lightning Bolt' })).toHaveCount(0);
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Moved 1 card to Goblin Time');
  // Not left in the card bin either: the card moved, it wasn't cut.
  await page.click('[data-act="home"]');
  await expect(page.locator('.bin .row', { hasText: 'Lightning Bolt' })).toHaveCount(0);
});

test('undoing the move from the deck it left puts the card back and clears both histories', async ({ page }) => {
  await createTaking(page);
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-tab="history"]');
  await page.click('[data-act="undo"]');
  await expect(page.locator('.hist .confirm')).toContainText('also undone in Goblin Time');
  await page.click('[data-act="undo-yes"]');
  await expect(page.locator('.hist .entry').first()).not.toContainText('Goblin Time');
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
  await page.click('[data-tab="printed"]');
  await expect(page.locator('.plist .row', { hasText: 'Lightning Bolt' })).toContainText('In deck');
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Goblin Time' }).click();
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(0);
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist')).not.toContainText('Fixture Zagras');
});

test('undoing the move from the new deck works the same way', async ({ page }) => {
  await createTaking(page);
  await page.click('[data-tab="history"]');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(0);
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist')).not.toContainText('Goblin Time');
  // The move is gone for good: still not there after a reload.
  await page.reload();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist')).not.toContainText('Goblin Time');
});

test('the rule buttons decide where each group goes', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Arcane Signet\n1 Lightning Bolt\n1 Rhystic Study');
  await page.click('[data-act="chk-create"]');
  // Bin and other-deck cards wait as incoming (the default); the not-owned card is already owned.
  await page.click('[data-rule="need|owned"]');
  await expect(page.locator('.rule', { hasText: 'Not owned' })).toContainText('added as owned');
  await page.fill('#n-name', 'Rules Test');
  await page.click('[data-dlg="create"]');
  const inc = page.locator('.inc');
  await expect(inc).toContainText('Arcane Signet');
  await expect(inc).toContainText('Lightning Bolt');
  await expect(inc).not.toContainText('Rhystic Study');
  await expect(deckRow(page, 'Rhystic Study')).toHaveCount(1);
  await expect(deckRow(page, 'Krenko, Mob Boss')).toHaveCount(1);
  // Nothing was taken from the bin or from Fixture Zagras.
  await page.click('[data-act="home"]');
  await expect(page.locator('.bin .row', { hasText: 'Arcane Signet' })).toContainText('2');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
});

test('a card in more than one deck can be taken from the deck you pick', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Sol Ring');
  await page.click('[data-act="chk-create"]');
  await page.click('[data-rule="decks|swap"]');
  const row = page.locator('.rule', { hasText: 'In other decks' });
  await expect(row.locator('.rule-multi')).toContainText('1 in more than one deck');
  await page.click('[data-rule-open="decks"]');
  await row.locator('select.src-pick').selectOption({ label: 'Rat Pack' });
  await page.fill('#n-name', 'Pick Test');
  await page.click('[data-dlg="create"]');
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Took 1 card from Rat Pack');
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(0);
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(1);
});

test('a bin card set to incoming can be moved in later, leaving the bin, and undone from either deck', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Arcane Signet\n1 Fervent Champion');
  await page.click('[data-act="chk-create"]');
  await page.fill('#n-name', 'Bin Test');
  await page.click('[data-dlg="create"]');
  const inc = page.locator('.inc');
  await expect(inc).toContainText('Arcane Signet');
  // Arcane Signet was added to the bin directly; Fervent Champion is a spare cut from Fixture Zagras.
  // Each incoming card you have a copy of somewhere gets a source picker and a Grab button; Krenko doesn't.
  await expect(inc.locator('.swap', { hasText: 'Krenko, Mob Boss' }).locator('.grab')).toHaveCount(0);
  await expect(inc).not.toContainText('Spare in the card bin');
  for (const n of ['Arcane Signet', 'Fervent Champion']) {
    const line = inc.locator('.swap', { hasText: n });
    await expect(line.locator('select.grab-src')).toHaveValue('_bin');
    await line.getByRole('button', { name: 'Grab' }).click();
  }
  await expect(deckRow(page, 'Arcane Signet')).toHaveCount(1);
  await expect(deckRow(page, 'Fervent Champion')).toHaveCount(1);
  await expect(inc).not.toContainText('Arcane Signet');
  await expect(inc).toContainText('Krenko, Mob Boss');
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').nth(0)).toContainText('Took 1 card from the card bin (Fixture Zagras)');
  await expect(page.locator('.hist .entry').nth(1)).toContainText('Took 1 card from the card bin (added directly)');
  await page.click('[data-act="home"]');
  const bin = page.locator('.bin');
  await expect(bin.locator('.row', { hasText: 'Fervent Champion' })).toHaveCount(0);
  await expect(bin.locator('.row', { hasText: 'Arcane Signet' }).locator('.q')).toHaveText('1');

  // Undo the Fervent Champion move from Fixture Zagras, the deck the spare came from.
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Moved 1 owned card to Bin Test');
  await page.click('[data-act="undo"]');
  await expect(page.locator('.hist .confirm')).toContainText('also undone in Bin Test');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-act="home"]');
  await expect(bin.locator('.row', { hasText: 'Fervent Champion' })).toContainText('From Fixture Zagras');
  await page.locator('.deckbox', { hasText: 'Bin Test' }).click();
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Fervent Champion')).toHaveCount(0);
  await expect(inc).toContainText('Fervent Champion');

  // Undo the Arcane Signet move from the new deck: it goes back to the bin and back to incoming.
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('added directly');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Arcane Signet')).toHaveCount(0);
  await expect(inc).toContainText('Arcane Signet');
  await page.click('[data-act="home"]');
  await expect(bin.locator('.row', { hasText: 'Arcane Signet' }).locator('.q')).toHaveText('2');
});

test('an incoming card can be grabbed from another deck, picked from every deck that has it', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Lightning Bolt\n1 Sol Ring');
  await page.click('[data-act="chk-create"]');
  await page.fill('#n-name', 'Grab Test');
  await page.click('[data-dlg="create"]');
  const inc = page.locator('.inc');
  // Sol Ring is in both decks, so both are offered; Lightning Bolt only in Fixture Zagras.
  const sol = inc.locator('.swap', { hasText: 'Sol Ring' });
  await expect(sol.locator('select.grab-src option')).toHaveText(['Fixture Zagras', 'Rat Pack']);
  await sol.locator('select.grab-src').selectOption({ label: 'Rat Pack' });
  await sol.getByRole('button', { name: 'Grab' }).click();
  await inc.locator('.swap', { hasText: 'Lightning Bolt' }).getByRole('button', { name: 'Grab' }).click();
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(1);
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
  await expect(inc).not.toContainText('Sol Ring');
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').nth(0)).toContainText('Took 1 card from Fixture Zagras');
  await expect(page.locator('.hist .entry').nth(1)).toContainText('Took 1 card from Rat Pack');
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(0);

  // Undo the Lightning Bolt grab from Fixture Zagras: it goes back there and back on the incoming list.
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Fixture Zagras' }).click();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry').first()).toContainText('Moved 1 card to Grab Test');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(1);
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Grab Test' }).click();
  await expect(deckRow(page, 'Lightning Bolt')).toHaveCount(0);
  await expect(page.locator('.inc')).toContainText('Lightning Bolt');

  // Undo the Sol Ring grab from the new deck: back to Rat Pack and back on the incoming list.
  await page.click('[data-tab="history"]');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-tab="current"]');
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(0);
  await expect(page.locator('.inc')).toContainText('Sol Ring');
  await page.click('[data-act="home"]');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await expect(deckRow(page, 'Sol Ring')).toHaveCount(1);
});

test('the collection buttons say what they do', async ({ page }) => {
  await page.click('[data-act="check"]');
  await page.fill('#chk-list', '1 Krenko, Mob Boss [Commander]\n1 Arcane Signet\n1 Lightning Bolt\n1 Rhystic Study');
  await page.click('[data-act="chk-create"]');
  await expect(page.locator('.rule', { hasText: 'In the card bin' }).locator('.seg .chip')).toHaveText(['New Incoming', 'Use Owned']);
  await expect(page.locator('.rule', { hasText: 'In other decks' }).locator('.seg .chip')).toHaveText(['Swap from Decks', 'New Incoming', 'Add to Collection']);
  await expect(page.locator('.rule', { hasText: 'Not owned' }).locator('.seg .chip')).toHaveText(['New Incoming', 'Add to Collection']);
});
