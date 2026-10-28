// Incoming: a change saved before its cards arrive keeps the deck list matching the box until "Arrived".
const { test, expect } = require('@playwright/test');
const path = require('path');

const CARDS = path.join(__dirname, 'fixtures', 'cards-insight.json');
const BACKUP = path.join(__dirname, 'fixtures', 'backup-insight.json');

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/data/cards.json', r => r.fulfill({ path: CARDS, contentType: 'application/json' }));
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.deckbox', { hasText: 'Night Shift' }).click();
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

async function addIn(page, name) {
  await page.fill('#s-in', name);
  await page.locator('#g-in button .nm', { hasText: new RegExp('^' + name + '$') }).click();
}
// Cut Sol Ring for Back to Basics (not owned) and Swamp for Brainstorm (a printed card cut earlier).
async function stageSwap(page) {
  await page.click('[data-cut="Sol Ring"]');
  await page.click('[data-cut="Swamp"]');
  await addIn(page, 'Back to Basics');
  await addIn(page, 'Brainstorm');
}
const row = (page, name) => page.locator('.groups .row', { has: page.locator('.nm > span:first-child', { hasText: new RegExp('^' + name + '$') }) });

test.describe('with clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('saving as incoming keeps the list as it is and copies only the cards still needed @phone', async ({ page }) => {
    await stageSwap(page);
    await page.click('[data-act="save-incoming"]');
    await expect(page.locator('.summary')).toContainText('100');
    await expect(row(page, 'Sol Ring')).toContainText('Leaving');
    await expect(row(page, 'Back to Basics')).toHaveCount(0);
    const inc = page.locator('.inc');
    await expect(inc).toContainText('2 cards coming in, 2 leaving');
    await expect(inc.locator('.inc-have')).toContainText('Brainstorm');
    await inc.locator('[data-inc-copy]').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1x Back to Basics');
    await page.reload();
    await expect(page.locator('.inc')).toHaveCount(1);
    await page.click('[data-act="home"]');
    await expect(page.locator('.deckbox', { hasText: 'Night Shift' })).toContainText('2 incoming');
  });
});

test('Arrived applies the swap, marks new cards printed, and can be undone', async ({ page }) => {
  await stageSwap(page);
  await page.click('[data-act="save-incoming"]');
  await page.locator('.inc [data-arrive]').click();
  await expect(page.locator('.inc')).toHaveCount(0);
  await expect(row(page, 'Sol Ring')).toHaveCount(0);
  await expect(row(page, 'Back to Basics')).not.toContainText('Not printed');
  await expect(row(page, 'Brainstorm')).not.toContainText('Not printed');
  await page.click('[data-tab="history"]');
  const entries = page.locator('.hist .entry');
  await expect(entries.nth(0)).toContainText('Arrived: 1 card marked printed');
  await expect(entries.nth(1)).toContainText('Incoming since');
  await expect(entries.nth(2)).toContainText('Marked 2 cards as incoming');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo-yes"]');
  await page.click('[data-tab="current"]');
  await expect(page.locator('.inc')).toHaveCount(1);
  await expect(row(page, 'Sol Ring')).toContainText('Leaving');
  await expect(row(page, 'Back to Basics')).toHaveCount(0);
});

test('an incoming change can go back to the bench or be cancelled, and cards can only leave once', async ({ page }) => {
  await stageSwap(page);
  await page.click('[data-act="save-incoming"]');
  // A second change can't take out the same Sol Ring again.
  await page.click('[data-cut="Sol Ring"]');
  await page.click('[data-act="save-incoming"]');
  await expect(page.locator('.toast')).toContainText('already leaving');
  await page.click('[data-act="clear-bench"]');
  // A second, separate incoming change.
  await page.click('[data-cut="Arcane Signet"]');
  await addIn(page, 'Counterspell');
  await page.click('[data-act="save-incoming"]');
  await expect(page.locator('.inc')).toHaveCount(2);
  await page.locator('.inc').first().locator('[data-inc-bench]').click();
  await expect(page.locator('.inc')).toHaveCount(1);
  await expect(page.locator('.bench .dropbox[data-drop="in"]')).toContainText('Back to Basics');
  await page.locator('.inc [data-inc-cancel]').click();
  await page.click('[data-inc-cancel-yes]');
  await expect(page.locator('.inc')).toHaveCount(0);
  await expect(row(page, 'Arcane Signet')).not.toContainText('Leaving');
});

test('a spare card that is part of an incoming change is marked in the card bin', async ({ page }) => {
  await stageSwap(page);
  await page.click('[data-act="save-incoming"]');
  await page.click('[data-act="home"]');
  await expect(page.locator('.bin .row', { hasText: 'Brainstorm' })).toContainText('Incoming for Night Shift');
});
