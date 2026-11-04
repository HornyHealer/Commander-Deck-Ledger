// Error reports: a crash in the browser sends one short report (no deck data) to the Worker.
const { test, expect } = require('@playwright/test');
const path = require('path');
const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');

test('a crash sends one short report with no deck contents', async ({ page, context }) => {
  const reports = [];
  await context.addInitScript(() => { window.LEDGER_REPORT_ERRORS = true; });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route(/scryfall\.(com|io)/, r => r.fulfill({ status: 404, body: '' }));
  await context.route('https://cdl-archidekt.deckledger.workers.dev/report', r => { reports.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  // The same crash twice: reported once.
  await page.evaluate(() => { const boom = () => { throw new Error('test crash'); }; setTimeout(boom, 0); setTimeout(boom, 10); });
  await expect.poll(() => reports.length).toBe(1);
  await page.waitForTimeout(300);
  expect(reports.length).toBe(1);
  const r = reports[0];
  expect(r.kind).toBe('crash');
  expect(r.message).toContain('test crash');
  expect(r.view).toBe('deck');
  expect(Object.keys(r).sort()).toEqual(['app', 'browser', 'kind', 'message', 'signedIn', 'version', 'view', 'where']);
  expect(JSON.stringify(r)).not.toContain('Rat Pack');
  expect(JSON.stringify(r)).not.toContain('Sol Ring');
});

test('reports are only sent from the real site', async ({ page, context }) => {
  let sent = 0;
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await context.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.LEDGER_FIREBASE = null;' }));
  await context.route('https://cdl-archidekt.deckledger.workers.dev/report', r => { sent++; r.fulfill({ body: '{}' }); });
  await page.goto('/');
  await page.evaluate(() => { setTimeout(() => { throw new Error('local crash'); }, 0); });
  await page.waitForTimeout(500);
  expect(sent).toBe(0);
});
