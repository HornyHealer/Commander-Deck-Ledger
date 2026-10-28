// Phone and computer usability: the swap bench as a slide-up panel, touch-friendly rows, install as an app.
const { test, expect } = require('@playwright/test');
const path = require('path');
const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');

let pageErrors;
test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
});
test.afterEach(() => { expect(pageErrors, 'page errors').toEqual([]); });

test('on a phone the swap bench is a bar that slides up @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  const bar = page.locator('.sheet-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Cut or add cards');
  await expect(page.locator('#s-in')).toBeHidden();
  // Rows aren't draggable on touch screens, and the hint says what to tap.
  await expect(page.locator('.groups .row[draggable="true"]')).toHaveCount(0);
  await expect(page.locator('.toolbar')).toContainText('Tap the scissors');
  await page.click('[data-cut="Sol Ring"]');
  await expect(page.locator('.toast')).toContainText('Sol Ring added to the swap bench');
  await expect(bar).toContainText('1 out');
  await bar.click();
  await expect(page.locator('.bench.open #s-in')).toBeVisible();
  await page.fill('#s-in', 'Brainstorm');
  await page.locator('#g-in button .nm', { hasText: /^Brainstorm$/ }).click();
  await expect(bar).toContainText('1 in');
  await page.click('[data-act="commit"]');
  await expect(page.locator('.bench.open')).toHaveCount(0);
  await expect(page.locator('.groups .row', { hasText: 'Brainstorm' })).toHaveCount(1);
  // Row buttons are always visible on touch screens.
  const op = await page.locator('.groups .row .acts').first().evaluate(el => getComputedStyle(el).opacity);
  expect(op).toBe('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('on a computer the swap bench stays beside the list', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await expect(page.locator('.sheet-bar')).toBeHidden();
  await expect(page.locator('#s-in')).toBeVisible();
  await expect(page.locator('.groups .row[draggable="true"]').first()).toBeVisible();
});

test('the site can be installed as an app', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get('/' + href);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('./');
  for (const icon of m.icons) expect((await request.get('/' + icon.src)).ok(), icon.src).toBe(true);
  expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
  // When the browser offers installing, an Install button appears at the bottom of the page.
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await expect(page.locator('.site-foot [data-act="install"]')).toBeVisible();
});
