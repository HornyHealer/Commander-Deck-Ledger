// Sharing a deck by link, using the stand-in for Firebase (tests/fixtures/fake-firebase).
const { test, expect } = require('@playwright/test');
const path = require('path');

const BACKUP = path.join(__dirname, 'fixtures', 'backup.json');
const FAKE = path.join(__dirname, 'fixtures', 'fake-firebase');
const SID = 'AbCdEfGhIjKlMnOpQrStUv';
const SHARED = {
  owner: 'u-friend', v: 1, name: 'Goblin Party', commanders: ['Krenko, Mob Boss'], desc: 'Lots of goblins.', at: 1767225600000,
  cur: [{ n: 'Krenko, Mob Boss', q: 1 }, { n: 'Lightning Bolt', q: 1 }, { n: 'Sol Ring', q: 1 }, { n: 'Mountain', q: 30 }],
  combos: { count: 2, at: 1767225600000, two: [{ cards: ['Krenko, Mob Boss', 'Thornbite Staff'], produces: ['Infinite goblins'] }] },
};

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
const shares = s => Object.keys(s).filter(k => k.startsWith('shares/'));
// Someone else's shared deck is already in the database; this visitor isn't signed in.
async function seedShare(page, data = SHARED) {
  await page.addInitScript(([id, d]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('fake-fb-store', JSON.stringify({ ['shares/' + id]: d }));
  }, [SID, data]);
}

async function signedInWithBackup(page) {
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('#sync-status')).toHaveText('Synced');
}

test('signed in, every deck gets a link: its own address, which follows changes', async ({ page }) => {
  await signedInWithBackup(page);
  const decks = await page.locator('.deckbox').count();
  await expect.poll(async () => shares(await fakeStore(page)).length).toBe(decks);
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await expect(page).toHaveURL(/#share-[A-Za-z0-9_-]{22}$/);
  const id = page.url().split('#share-')[1];
  const doc = (await fakeStore(page))['shares/' + id];
  expect(doc.owner).toBe('u-test');
  expect(Object.keys(doc).sort()).toEqual(['at', 'commanders', 'cur', 'desc', 'name', 'owner', 'v']);
  expect(doc.cur.every(c => Object.keys(c).join() === 'n,q')).toBe(true);
  await page.click('[data-act="share"]');
  await expect(page.locator('#sh-link')).toHaveValue(new RegExp('#share-' + id + '$'));
  await page.click('.sh-dialog [data-dlg="close"]');

  // A change to the deck reaches the shared copy; a change only to owned cards doesn't rewrite it.
  await page.click('[data-act="edit"]');
  await page.fill('#e-name', 'Rat Pack Deluxe');
  await page.click('[data-dlg="save-edit"]');
  await expect.poll(async () => (await fakeStore(page))['shares/' + id]?.name).toBe('Rat Pack Deluxe');

  // Reloading the address opens it as your own deck, not the read-only view.
  await page.reload();
  await expect(page.locator('.dhead h2')).toBeVisible();
  await expect(page.locator('[data-act="edit"]')).toBeVisible();
  await expect(page.locator('[data-act="share-add"]')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp('#share-' + id + '$'));
});

test('making a deck private removes its link; sharing again makes a new one', async ({ page }) => {
  await signedInWithBackup(page);
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await expect(page).toHaveURL(/#share-/);
  const id = page.url().split('#share-')[1];
  await page.click('[data-act="share"]');
  await page.click('[data-dlg="sh-stop"]');
  await page.click('[data-dlg="sh-stop-yes"]');
  await expect(page.locator('.sh-dialog')).toContainText('This deck is private');
  await expect.poll(async () => (await fakeStore(page))['shares/' + id]).toBeUndefined();
  await expect(page).toHaveURL(/#deck-/);
  await page.click('.sh-dialog [data-dlg="close"]');
  await expect(page.locator('[data-act="share"]')).toHaveText(/Private/);
  // It stays private after a reload (no new link is made by itself).
  await expect.poll(async () => (await fakeStore(page))['users/u-test/decks/fixture-rats']?.noShare).toBe(true);
  await page.reload();
  await expect(page.locator('[data-act="share"]')).toHaveText(/Private/);
  await page.click('[data-act="share"]');
  await page.click('[data-dlg="sh-make"]');
  await expect(page.locator('#sh-link')).toHaveValue(/#share-[A-Za-z0-9_-]{22}$/);
  const id2 = (await page.locator('#sh-link').inputValue()).split('#share-')[1];
  expect(id2).not.toBe(id);
  await expect.poll(async () => (await fakeStore(page))['shares/' + id2]?.owner).toBe('u-test');
  await expect(page).toHaveURL(new RegExp('#share-' + id2 + '$'));
});

test('deleting a shared deck removes its link too', async ({ page }) => {
  await signedInWithBackup(page);
  await expect.poll(async () => shares(await fakeStore(page)).length).not.toBe(0);
  const n = shares(await fakeStore(page)).length;
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-act="edit"]');
  await page.click('[data-dlg="del"]');
  await page.click('[data-dlg="del-yes"]');
  await expect.poll(async () => shares(await fakeStore(page)).length).toBe(n - 1);
});

test('a deck restored from someone else\'s backup gets its own link', async ({ page }) => {
  // The backup's deck points at a link that belongs to another account.
  const fs = require('fs');
  const bk = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  const decks = bk.decks || bk;
  const first = Array.isArray(decks) ? decks[0] : Object.values(decks)[0];
  first.shareId = SID; first.shareSig = 'x';
  await seedShare(page);
  await page.goto('/');
  await page.setInputFiles('#imp-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect.poll(async () => { const st = await fakeStore(page); return Object.values(st).filter(v => v && v.owner === 'u-test').length; }).toBe(await page.locator('.deckbox').count());
  expect((await fakeStore(page))['shares/' + SID].owner).toBe('u-friend'); // theirs is untouched
});

test('signed out, the share popup asks you to sign in first', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example deck' }).click();
  await page.click('[data-act="share"]');
  await expect(page.locator('.sh-dialog')).toContainText('Sign in to share');
  await expect(page.locator('[data-dlg="sh-make"]')).toHaveCount(0);
});

test.describe('with clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  test('anyone with the link sees the deck read-only and can copy its list @phone', async ({ page }) => {
    await seedShare(page);
    await page.goto('/#share-' + SID);
    await expect(page.locator('.dhead h2')).toHaveText('Krenko, Mob Boss');
    await expect(page.locator('.dhead')).toContainText('Shared · read only');
    await expect(page.locator('.dhead')).toContainText('Goblin Party · 33 cards');
    await expect(page.locator('.ddesc')).toHaveText('Lots of goblins.');
    await expect(page.locator('.group', { hasText: 'Commander' })).toContainText('Krenko, Mob Boss');
    await expect(page.locator('.row', { hasText: 'Mountain' }).locator('.q')).toHaveText('30');
    // Nothing that changes a deck.
    for (const sel of ['[data-act="edit"]', '[data-act="update"]', '[data-act="share"]', '[data-cut]', '[data-roleedit]', '[data-qty]']) await expect(page.locator(sel)).toHaveCount(0);
    await page.click('[data-act="share-copy"]');
    await expect(page.locator('.toast')).toContainText('Deck list copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1x Krenko, Mob Boss [Commander]\n1x Lightning Bolt\n1x Sol Ring\n30x Mountain');
    // Stats and combos work on a shared deck too.
    await page.click('[data-sharetab="stats"]');
    await expect(page.locator('.statsview')).toContainText('Mana curve');
    await page.click('[data-act="hand-new"]');
    await expect(page.locator('.hand .hand-card')).toHaveCount(7);
    await page.click('[data-sharetab="combos"]');
    await expect(page.locator('.tabpanel')).toContainText('found 2 combos');
    await expect(page.locator('.combo')).toContainText('Thornbite Staff');
  });
});

test('a shared deck can be added to your own decks, keeping its link for updates', async ({ page }) => {
  await seedShare(page);
  await page.goto('/#share-' + SID);
  await page.click('[data-act="share-add"]');
  await expect(page.locator('#n-name')).toHaveValue('Goblin Party');
  await expect(page.locator('#n-link')).toHaveValue(new RegExp('#share-' + SID + '$'));
  await expect(page.locator('#n-list')).toHaveValue(/^1x Krenko, Mob Boss \[Commander\]/);
  await page.click('[data-dlg="create"]');
  await expect(page.locator('.dhead h2')).toHaveText('Krenko, Mob Boss');
  await expect(page.locator('.dhead .dn a')).toHaveText(/Shared deck/);
  // Update from the link picks up the shared deck's list.
  await page.click('[data-act="update"]');
  await expect(page.locator('#u-fetch-msg')).toContainText('Fetched 33 cards from “Goblin Party”');
});

test('share links work in the New deck and Check a list Fetch boxes', async ({ page }) => {
  await seedShare(page);
  await page.goto('/');
  await page.click('[data-act="new"]');
  await page.fill('#n-link', 'https://example.com/ledger/#share-' + SID);
  await page.click('[data-arch="n"]');
  await expect(page.locator('#n-fetch-msg')).toContainText('Fetched 33 cards from “Goblin Party”');
  await expect(page.locator('#n-name')).toHaveValue('Goblin Party');
  await expect(page.locator('#n-desc')).toHaveValue('Lots of goblins.');
  await page.click('[data-dlg="close"]');
  await page.click('[data-act="check"]');
  await page.fill('#chk-link', 'https://example.com/ledger/#share-' + SID);
  await page.click('[data-arch="chk"]');
  await expect(page.locator('#chk-list')).toHaveValue(/30x Mountain/);
});

test('a link to a deck that is no longer shared says so', async ({ page }) => {
  await page.goto('/#share-' + 'ZyXwVuTsRqPoNmLkJiHgFe');
  await expect(page.locator('.view h2')).toHaveText("This shared deck isn't here");
  await page.click('[data-act="home"]');
  await expect(page).not.toHaveURL(/#share-/);
});
