// Deck insight: description, bracket estimate, role tags, and viewing or comparing past versions.
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
  await expect(page.locator('.deckbox')).toHaveCount(2);
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });
const openDeck = (page, name) => page.locator('.deckbox', { hasText: name }).click();
const rowNames = page => page.locator('.groups .row .nm > span:first-child').allTextContents();

test('estimates each deck\'s bracket and explains why @phone', async ({ page }) => {
  await expect(page.locator('.deckbox', { hasText: 'Night Shift' }).locator('.bpill')).toHaveText('Bracket 4+');
  await expect(page.locator('.deckbox', { hasText: 'Calm Waters' }).locator('.bpill')).toHaveText('Bracket 2');
  await openDeck(page, 'Night Shift');
  await page.click('[data-act="toggle-bracket"]');
  const why = page.locator('#deck-bracket');
  await expect(why).toContainText('4 Game Changers');
  await expect(why).toContainText('Cyclonic Rift');
  await expect(why).toContainText('Extra turns');
  await expect(why).toContainText('lowest bracket the cards allow');
});

test('a short description can be added when creating a deck and edited later', async ({ page }) => {
  await page.click('[data-act="new"]');
  await page.fill('#n-name', 'Desc Test');
  await page.fill('#n-desc', 'Mills everyone, then wins with the Oracle.');
  await page.fill('#n-list', "1 Vela the Night-Clad [Commander]\n1 Thassa's Oracle\n98 Island");
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.dhead .ddesc')).toHaveText('Mills everyone, then wins with the Oracle.');
  await page.click('[data-act="edit"]');
  await page.fill('#e-desc', 'Now a control deck.');
  await page.click('[data-dlg="save-edit"]');
  await expect(page.locator('.dhead .ddesc')).toHaveText('Now a control deck.');
  await page.click('[data-act="home"]');
  await expect(page.locator('.deckbox', { hasText: 'Desc Test' }).locator('.ddesc')).toHaveText('Now a control deck.');
});

test('role counts come from card text, filter the list and can be changed per card', async ({ page }) => {
  await openDeck(page, 'Night Shift');
  const chip = role => page.locator(`[data-rolefilter="${role}"]`);
  await expect(chip('ramp')).toContainText('2');
  await expect(chip('draw')).toContainText('1');
  await expect(chip('removal')).toContainText('1');
  await expect(chip('tutor')).toContainText('1');
  await expect(chip('wincon')).toContainText('0');
  await chip('ramp').click();
  expect((await rowNames(page)).sort()).toEqual(['Arcane Signet', 'Sol Ring']);
  await chip('ramp').click();
  // Mark Thassa's Oracle as a win condition; it survives a reload.
  await page.click(`[data-roleedit="Thassa's Oracle"]`);
  await page.getByRole('group', { name: "Roles for Thassa's Oracle" }).getByRole('button', { name: 'Win con' }).click();
  await expect(chip('wincon')).toContainText('1');
  await page.click('[data-act="role-done"]');
  await expect(page.locator('.row', { hasText: "Thassa's Oracle" }).locator('.rtag')).toHaveText('Win con');
  await page.reload();
  await expect(page.locator('[data-rolefilter="wincon"]')).toContainText('1');
  await page.click(`[data-roleedit="Thassa's Oracle"]`);
  await page.click(`[data-rolereset="Thassa's Oracle"]`);
  await expect(page.locator('[data-rolefilter="wincon"]')).toContainText('0');
});

test('history can show the deck as it was after a change or on a date @phone', async ({ page }) => {
  await openDeck(page, 'Night Shift');
  await page.click('[data-tab="history"]');
  await page.click('[data-snap="ins1"]');
  await expect(page.locator('.snap-banner')).toContainText('Past version');
  let names = await rowNames(page);
  expect(names).toContain('Demonic Tutor');
  expect(names).toContain('Counterspell');
  expect(names).not.toContain('Brainstorm');
  await expect(page.locator('.row', { hasText: 'Counterspell' })).toContainText('Not in deck now');
  await page.locator('.snap-banner [data-act="snap-close"]').click();
  await expect(page.locator('.snap-banner')).toHaveCount(0);
  await page.click('[data-tab="history"]');
  await page.click('[data-snap="start"]');
  expect(await rowNames(page)).toContain('Brainstorm');
  await page.locator('.snap-banner [data-act="snap-close"]').click();
  await page.click('[data-tab="history"]');
  await page.fill('#h-date', '2025-12-01');
  await page.click('[data-act="view-date"]');
  names = await rowNames(page);
  expect(names).toContain('Demonic Tutor');
  expect(names).toContain('Counterspell');
  expect(names).not.toContain('Time Warp');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('two versions can be compared side by side', async ({ page }) => {
  await openDeck(page, 'Night Shift');
  await page.click('[data-tab="history"]');
  await page.click('[data-act="cmp-open"]');
  await page.selectOption('#cmp-a', 'start');
  const cmp = page.locator('#compare');
  await expect(cmp.locator('.cmp-diff .o')).toHaveText(['Brainstorm', 'Counterspell', 'Island']);
  await expect(cmp.locator('.cmp-diff .i')).toHaveText(['Cyclonic Rift', 'Demonic Tutor', 'Time Warp']);
  await expect(cmp.locator('tr', { hasText: 'Bracket' })).toContainText('Higher');
  await expect(cmp.locator('tr', { hasText: 'Tutors' })).toContainText('+1');
});
