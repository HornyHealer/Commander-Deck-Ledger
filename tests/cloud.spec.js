// Accounts and sync, using a stand-in for Firebase (tests/fixtures/fake-firebase).
const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');
const FAKE = path.join(__dirname, 'fixtures', 'fake-firebase');
const STORE = 'users/u-test/decks/';

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.LEDGER_FIREBASE = { apiKey: 'test-key', projectId: 'test-project', authDomain: 'test-project.firebaseapp.com' };" }));
  await context.route('https://www.gstatic.com/firebasejs/**', r => {
    const file = r.request().url().split('/').pop();
    r.fulfill({ path: path.join(FAKE, file), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

const fakeStore = page => page.evaluate(() => JSON.parse(localStorage.getItem('fake-fb-store') || '{}'));
async function importBackup(page) {
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await expect(page.locator('.deckbox')).toHaveCount(2);
}

test('signed out, the site offers Google sign-in and still works from the browser @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-act="signin"]').first()).toBeVisible();
  await expect(page.locator('.signin-note')).toContainText('Sign in with Google');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.dhead h2')).toHaveText('Zagras, Thief of Heartbeats');
});

test('the first sign-in moves browser decks into the account', async ({ page }) => {
  await page.goto('/');
  await importBackup(page);
  await expect(page.locator('.signin-note')).toContainText('move into your account');
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('.toast')).toContainText('Moved 2 decks');
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  await expect(page.locator('.deckbox')).toHaveCount(2);
  await expect.poll(async () => Object.keys(await fakeStore(page)).filter(k => k.startsWith(STORE)).length).toBe(2);
  const store = await fakeStore(page);
  expect(store['users/u-test/meta/bin'].cards.some(c => c.n === 'Arcane Signet')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cdl-data-v1'))).toBeNull();
  await expect(page.locator('.site-foot')).toContainText('saved to your account');
});

test('changes sync to the account and are there after a reload', async ({ page }) => {
  await page.goto('/');
  await importBackup(page);
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-print="Typhoid Rats"]');
  await expect.poll(async () => {
    const s = await fakeStore(page);
    return (s[STORE + 'fixture-rats'].printed || []).some(p => p.n === 'Typhoid Rats');
  }).toBe(true);
  await page.reload();
  await expect(page.locator('.acct')).toBeVisible();
  // The page reopens the deck that was showing, now loaded from the account.
  await expect(page.locator('.dhead .dn')).toContainText('Rat Pack');
  await expect(page.locator('.row', { hasText: 'Typhoid Rats' })).not.toContainText('Not printed');
});

test('a change made on another device shows up', async ({ page }) => {
  await page.goto('/');
  await importBackup(page);
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect.poll(async () => Object.keys(await fakeStore(page)).filter(k => k.startsWith(STORE)).length).toBe(2);
  await page.evaluate(path => {
    const g = window.__fakeFirebase; const d = JSON.parse(JSON.stringify(g.store[path]));
    d.name = 'Renamed on my phone'; d.rev = Date.now() + 60000; g.remoteSet(path, d);
  }, STORE + 'fixture-rats');
  await expect(page.locator('.deckbox', { hasText: 'Renamed on my phone' })).toBeVisible();
});

test('signing out hides the account and its decks', async ({ page }) => {
  await page.goto('/');
  await importBackup(page);
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('.deckbox')).toHaveCount(2);
  await page.click('[data-act="acct-menu"]');
  await page.click('[data-act="signout"]');
  await expect(page.locator('.signin-note')).toBeVisible();
  await expect(page.locator('.deckbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No decks yet' })).toBeVisible();
});
