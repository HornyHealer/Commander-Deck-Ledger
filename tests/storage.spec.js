// How decks, their history and the card bin are saved to the account (step 10: room for history).
// Uses the stand-in for Firebase in tests/fixtures/fake-firebase.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE = path.join(__dirname, 'fixtures', 'fake-firebase');
const BACKUP = require('./fixtures/backup.json');
const USER = { uid: 'u-test', displayName: 'Test Player', email: 'test@example.com' };
const DECKS = 'users/u-test/decks/', META = 'users/u-test/meta/bin';
const clone = o => JSON.parse(JSON.stringify(o));

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
const deckLog = (s, id) => { const d = s[DECKS + id]; return d.fmt === 2 ? [].concat(...d.hist.sigs.map(n => s[DECKS + id + '/history/' + n].p)) : d.log; };
const pieceKeys = (s, prefix) => Object.keys(s).filter(k => k.startsWith(prefix)).sort();
const binCards = s => { const m = s[META]; return m.fmt === 2 ? [].concat(...m.sigs.map(n => n === '-' ? [] : s['users/u-test/bin/' + n].p)) : m.cards; };
const remote = (page, p, data) => page.evaluate(([p, data]) => window.__fakeFirebase.remoteSet(p, data), [p, data]);

// An account saved the old way: each deck with its whole history inside it, and the bin as one record.
function oldAccount() {
  const [zagras, rats] = clone(BACKUP.decks);
  zagras.rev = 1761500000000; rats.rev = 1761500000000;
  for (let k = 0; k < 225; k++) {
    rats.log.push({ id: 'a' + k, t: 1761200000000 + k * 2000, kind: 'swap', out: [], in: [{ n: 'Brainstorm', q: 1 }] });
    rats.log.push({ id: 'b' + k, t: 1761200001000 + k * 2000, kind: 'swap', out: [{ n: 'Brainstorm', q: 1 }], in: [] });
  }
  const cards = Array.from({ length: 300 }, (_, k) => ({ n: 'Test Card ' + k, q: 1 + (k % 3), at: 1761000000000 }));
  return { [DECKS + zagras.id]: zagras, [DECKS + rats.id]: rats, [META]: { cards, rev: 1761500000000 } };
}
async function openWith(page, store) {
  await page.goto('/');
  await page.evaluate(([s, u]) => { localStorage.setItem('fake-fb-store', JSON.stringify(s)); localStorage.setItem('fake-fb-user', JSON.stringify(u)); }, [store, USER]);
  await page.reload();
  await expect(page.locator('.deckbox')).toHaveCount(2);
}
const newLayout = s => [s[DECKS + 'fixture-rats'], s[DECKS + 'fixture-zagras'], s[META]].every(x => x && x.fmt === 2);

test('decks and a bin saved the old way move to the new layout by themselves', async ({ page }) => {
  const before = oldAccount();
  await openWith(page, before);
  await expect.poll(async () => newLayout(await fakeStore(page))).toBe(true);
  const s = await fakeStore(page);
  // The deck no longer carries its history: 453 entries now sit in 3 pieces of up to 200.
  expect(s[DECKS + 'fixture-rats'].log).toBeUndefined();
  expect(s[DECKS + 'fixture-rats'].hist.sigs).toHaveLength(3);
  expect(pieceKeys(s, DECKS + 'fixture-rats/history/')).toHaveLength(3);
  const ids = deckLog(s, 'fixture-rats').map(e => e.id);
  expect(ids.slice(0, 452)).toEqual(before[DECKS + 'fixture-rats'].log.map(e => e.id));
  expect(deckLog(s, 'fixture-zagras').map(e => e.id)).toEqual(before[DECKS + 'fixture-zagras'].log.map(e => e.id));
  // The bin is in 10 sections with every card still there.
  expect(s[META].sigs).toHaveLength(10);
  expect(s[META].cards).toEqual([]);
  const sections = pieceKeys(s, 'users/u-test/bin/');
  expect(sections.length).toBeGreaterThan(5);
  expect(sections.length).toBeLessThanOrEqual(10);
  const cards = binCards(s);
  expect(cards).toHaveLength(300);
  expect(cards.reduce((a, c) => a + c.q, 0)).toBe(before[META].cards.reduce((a, c) => a + c.q, 0));
  // And it all reads back the same after a reload.
  await page.reload();
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry')).toHaveCount(ids.length);
});

test('a change saves only the pieces it touches', async ({ page }) => {
  await openWith(page, oldAccount());
  await expect.poll(async () => newLayout(await fakeStore(page))).toBe(true);
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const s1 = await fakeStore(page);
  const hist1 = s1[DECKS + 'fixture-rats'].hist.sigs, bin1 = s1[META].sigs;
  const writes1 = await page.evaluate(() => window.__fakeFirebase.writes || 0);
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.locator('.inc [data-arrive]').click();
  await expect.poll(async () => (await fakeStore(page))[DECKS + 'fixture-rats'].hist.sigs.join()).not.toBe(hist1.join());
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const s2 = await fakeStore(page);
  const hist2 = s2[DECKS + 'fixture-rats'].hist.sigs;
  expect(hist2.slice(0, 2)).toEqual(hist1.slice(0, 2)); // the two full pieces weren't saved again
  expect(hist2[2]).not.toBe(hist1[2]);
  expect(pieceKeys(s2, DECKS + 'fixture-rats/history/')).toHaveLength(3); // the replaced piece was removed
  expect(s2[META].sigs).toEqual(bin1);
  // The deck, its new last piece, and removing the old one.
  expect(await page.evaluate(() => window.__fakeFirebase.writes) - writes1).toBe(3);
});

test('a big bin changes one section at a time', async ({ page }) => {
  await openWith(page, oldAccount());
  await expect.poll(async () => newLayout(await fakeStore(page))).toBe(true);
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const bin1 = (await fakeStore(page))[META].sigs;
  // Deleting a deck puts its owned cards in the bin: only the sections those cards belong to are saved again.
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-act="edit"]');
  await page.click('[data-dlg="del"]');
  await page.click('[data-dlg="del-yes"]');
  await expect(page.locator('.deckbox')).toHaveCount(1);
  await expect.poll(async () => (await fakeStore(page))[META].sigs.join()).not.toBe(bin1.join());
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const s = await fakeStore(page);
  const changed = s[META].sigs.filter((n, k) => n !== bin1[k]).length;
  expect(changed).toBeGreaterThan(0);
  expect(changed).toBeLessThan(10);
  // The deleted deck's history pieces went with it.
  expect(pieceKeys(s, DECKS + 'fixture-rats')).toEqual([]);
  expect(binCards(s).length).toBeGreaterThan(300);
});

test("another device's change only shows once all of its pieces have arrived", async ({ page }) => {
  await openWith(page, oldAccount());
  await expect.poll(async () => newLayout(await fakeStore(page))).toBe(true);
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const s = await fakeStore(page);
  const deck = clone(s[DECKS + 'fixture-rats']);
  const log = deckLog(s, 'fixture-rats');
  log.push({ id: 'remote1', t: Date.now(), kind: 'swap', out: [], in: [{ n: 'Brainstorm', q: 1 }] });
  deck.name = 'Changed on my phone'; deck.rev = Date.now() + 60000; deck.hist = { sigs: ['cphone1'] };
  // The deck record arrives first...
  await remote(page, DECKS + 'fixture-rats', deck);
  await page.waitForTimeout(400);
  await expect(page.locator('.deckbox', { hasText: 'Rat Pack' })).toHaveCount(1);
  // ...and the change appears once the history piece it needs is there too.
  await remote(page, DECKS + 'fixture-rats/history/cphone1', { p: log });
  await expect(page.locator('.deckbox', { hasText: 'Changed on my phone' })).toHaveCount(1);
  await page.locator('.deckbox', { hasText: 'Changed on my phone' }).click();
  await page.click('[data-tab="history"]');
  await expect(page.locator('.hist .entry')).toHaveCount(log.length);
});

test('history saved by an older copy of the site is kept and folded in', async ({ page }) => {
  await openWith(page, oldAccount());
  await expect.poll(async () => newLayout(await fakeStore(page))).toBe(true);
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  const s = await fakeStore(page);
  const n = deckLog(s, 'fixture-zagras').length;
  // A tab still running the old site saves the deck with its new entry inside it, as it used to.
  const deck = clone(s[DECKS + 'fixture-zagras']);
  deck.log = [{ id: 'oldsite1', t: Date.now(), kind: 'swap', out: [], in: [{ n: 'Brainstorm', q: 1 }] }];
  deck.rev = Date.now() + 60000;
  await remote(page, DECKS + 'fixture-zagras', deck);
  await expect.poll(async () => { const x = await fakeStore(page); return !x[DECKS + 'fixture-zagras'].log && deckLog(x, 'fixture-zagras').some(e => e.id === 'oldsite1'); }).toBe(true);
  expect(deckLog(await fakeStore(page), 'fixture-zagras')).toHaveLength(n + 1);
});
