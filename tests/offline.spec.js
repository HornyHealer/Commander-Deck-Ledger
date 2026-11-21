// The installed app's saved copy (sw.js) and the card list: opening offline, on a slow connection, after an
// update whose download failed, and the card list trying again by itself.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
// The browser fetches the saved-copy script itself (tests can't swap it), so each version is a copy beside it.
const swFile = v => { const f = `sw-test-${v}.js`; fs.writeFileSync(path.join(ROOT, f), SW.replace('__VERSION__', v)); return f; };
test.afterAll(() => { for (const f of fs.readdirSync(ROOT)) if (/^sw-test-.*\.js$/.test(f)) fs.rmSync(path.join(ROOT, f)); });
let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route(/scryfall\.(com|io)|workers\.dev/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

const ready = page => expect(page.locator('#boot')).toHaveCount(0, { timeout: 15000 });
const noCardNotice = page => expect(page.locator('.notice', { hasText: "card list didn't load" })).toHaveCount(0);
async function exampleHasManaCosts(page) {
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await expect(page.locator('.groups .row .pips').first()).toBeVisible();
}
// The site only installs its saved copy on the real (https) site, so the tests install it by hand.
async function install(page, version) {
  await page.evaluate(async f => { await navigator.serviceWorker.register(f); await navigator.serviceWorker.ready; }, swFile(version));
  await page.reload(); await ready(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async v => { const c = await caches.open('cdl-' + v); return !!(await c.match('data/cards.json')); }, version)).toBe(true);
}

test('the installed app opens with its card list when there is no connection', async ({ page, context }) => {
  await page.goto('/'); await ready(page);
  await install(page, 'v1');
  await context.setOffline(true);
  await page.reload(); await ready(page);
  await noCardNotice(page);
  await exampleHasManaCosts(page);
});

test('on a slow connection the installed app opens from its saved copy within a few seconds', async ({ page, context }) => {
  await page.goto('/'); await ready(page);
  await install(page, 'v1');
  // Now every file takes 30 seconds to arrive.
  await context.route(/127\.0\.0\.1:4173\/(?!sw)/, async r => { await new Promise(res => setTimeout(res, 30000)).catch(() => {}); r.continue().catch(() => {}); });
  const t0 = Date.now();
  await page.reload({ waitUntil: 'commit', timeout: 15000 });
  await ready(page);
  expect(Date.now() - t0).toBeLessThan(12000);
  await noCardNotice(page);
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

test('an update keeps the card list even when the card list download fails', async ({ page, context }) => {
  await page.goto('/'); await ready(page);
  await install(page, 'v1');
  // The next version arrives while the card list can't be downloaded.
  await context.route('**/data/cards.json', r => r.fulfill({ status: 503, body: '' }));
  // (a new script address stands in for the same sw.js with new contents)
  await page.evaluate(f => navigator.serviceWorker.register(f), swFile('v2'));
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['cdl-v2']);
  expect(await page.evaluate(async () => !!(await (await caches.open('cdl-v2')).match('data/cards.json')))).toBe(true);
  await page.reload(); await ready(page);
  await noCardNotice(page);
  await exampleHasManaCosts(page);
});

test('if the card list does not load, it tries again by itself and from the Try again button', async ({ page, context }) => {
  let fail = true;
  await context.route('**/data/cards.json', r => fail ? r.fulfill({ status: 503, body: '' }) : r.continue());
  await page.goto('/'); await ready(page);
  const notice = page.locator('.notice', { hasText: "card list didn't load" });
  await expect(notice).toContainText('Trying again');
  fail = false;
  await expect(notice).toHaveCount(0, { timeout: 8000 }); // the first retry is after 4 seconds
  await exampleHasManaCosts(page);
});

test('after a couple of minutes it stops trying, and the Try again button still works', async ({ page, context }) => {
  let fail = true;
  await context.route('**/data/cards.json', r => fail ? r.fulfill({ status: 503, body: '' }) : r.continue());
  await page.clock.install();
  await page.goto('/'); await ready(page);
  const notice = page.locator('.notice', { hasText: "card list didn't load" });
  for (let i = 0; i < 6; i++) await page.clock.runFor(60000);
  await expect(notice).toContainText('Check your connection');
  fail = false;
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(notice).toHaveCount(0);
  await exampleHasManaCosts(page);
});
