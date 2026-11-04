// Daily health check of the live site. Each test is one thing your friends rely on; if any fails,
// the workflow opens an issue on GitHub (which emails you) and closes it once everything passes again.
const { test, expect } = require('@playwright/test');

const SITE = 'https://hornyhealer.github.io/Commander-Deck-Ledger/';
const ARCHIDEKT_DECK = 'https://archidekt.com/decks/26238673/galio_soraka_larp'; // a public deck to fetch
let pageErrors;
test.beforeEach(({ page }) => { pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message)); });
test.afterEach(() => { expect(pageErrors, 'errors on the page').toEqual([]); });

test('the site opens and the card list loads', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.getByRole('heading', { name: 'No decks yet' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.notice', { hasText: "card list didn't load" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.dhead h2')).toHaveText('Zagras, Thief of Heartbeats');
  // Mana costs come from the card list, so seeing them means it loaded.
  await expect(page.locator('.groups .row .pips').first()).toBeVisible();
});

test('sign-in is offered (Firebase loads)', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('.topacts [data-act="signin"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-act="sync-retry"]')).toHaveCount(0);
});

// Google's servers are asked directly, sent as if from the site (the key may be locked to it).
async function firebaseKey(page) {
  await page.goto(SITE);
  return page.evaluate(() => window.LEDGER_FIREBASE);
}

test('Firebase still lets the site sign people in', async ({ page, playwright }) => {
  const cfg = await firebaseKey(page);
  const api = await playwright.request.newContext({ extraHTTPHeaders: { Referer: SITE } });
  const res = await api.get('https://identitytoolkit.googleapis.com/v1/projects?key=' + cfg.apiKey);
  expect(res.ok(), 'Firebase project settings answered: ' + res.status()).toBe(true);
  const body = await res.json();
  expect(body.authorizedDomains || [], 'hornyhealer.github.io is an authorized sign-in domain').toContain('hornyhealer.github.io');
});

test('the database is up and refuses anyone not signed in', async ({ page, playwright }) => {
  const cfg = await firebaseKey(page);
  const api = await playwright.request.newContext({ extraHTTPHeaders: { Referer: SITE } });
  const res = await api.get(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/users/health-check/decks?key=${cfg.apiKey}`);
  // 403 means the database answered and the rules turned a stranger away. 200 would mean decks are readable without signing in.
  expect(res.status(), 'database answer without signing in').toBe(403);
});

test('Archidekt Fetch works from the site', async ({ page }) => {
  await page.goto(SITE);
  await page.click('[data-act="check"]');
  await page.fill('#chk-link', ARCHIDEKT_DECK);
  await page.click('[data-arch="chk"]');
  await expect(page.locator('#chk-fetch-msg')).toContainText('Fetched', { timeout: 20000 });
  await expect(page.locator('#chk-list')).not.toHaveValue('');
});

test('the combo finder works from the site', async ({ page }) => {
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="combos"]');
  await expect(page.locator('.dialog .cb-sec h3').first()).toContainText('In this deck', { timeout: 30000 });
});

// Only runs when the workflow is started with "practice failure" ticked, to try out the alert.
test('practice failure (started on purpose to test the alert)', async () => {
  test.skip(!process.env.PRACTICE_FAILURE, 'only when practicing');
  expect(false, 'this check fails on purpose; the next normal run closes the issue').toBe(true);
});
