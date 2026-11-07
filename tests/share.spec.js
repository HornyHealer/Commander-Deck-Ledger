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

test('sharing a deck makes a read-only copy that follows changes, and stopping removes it', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-act="share"]');
  await page.click('[data-dlg="sh-make"]');
  await expect(page.locator('#sh-link')).toHaveValue(/#share-[A-Za-z0-9_-]{22}$/);
  const id = (await page.locator('#sh-link').inputValue()).split('#share-')[1];
  await expect.poll(async () => (await fakeStore(page))['shares/' + id]?.owner).toBe('u-test');
  const doc = (await fakeStore(page))['shares/' + id];
  expect(Object.keys(doc).sort()).toEqual(['at', 'commanders', 'cur', 'desc', 'name', 'owner', 'v']);
  expect(doc.cur.every(c => Object.keys(c).join() === 'n,q')).toBe(true);
  await page.click('.sh-dialog [data-dlg="close"]');
  await expect(page.locator('[data-act="share"]')).toHaveText(/Shared/);

  // A change to the deck reaches the shared copy.
  await page.click('[data-act="edit"]');
  await page.fill('#e-name', 'Rat Pack Deluxe');
  await page.click('[data-dlg="save-edit"]');
  await expect.poll(async () => (await fakeStore(page))['shares/' + id]?.name).toBe('Rat Pack Deluxe');

  await page.click('[data-act="share"]');
  await page.click('[data-dlg="sh-stop"]');
  await page.click('[data-dlg="sh-stop-yes"]');
  await expect(page.locator('.sh-dialog')).toContainText('Not shared yet');
  await expect.poll(async () => shares(await fakeStore(page))).toEqual([]);
});

test('deleting a shared deck removes its link too', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#imp-file', BACKUP);
  await page.click('[data-dlg="imp-go"]');
  await page.locator('.signin-note [data-act="signin"]').click();
  await expect(page.locator('#sync-status')).toHaveText('Synced');
  await page.locator('.deckbox', { hasText: 'Rat Pack' }).click();
  await page.click('[data-act="share"]');
  await page.click('[data-dlg="sh-make"]');
  await expect.poll(async () => shares(await fakeStore(page)).length).toBe(1);
  await page.click('.sh-dialog [data-dlg="close"]');
  await page.click('[data-act="edit"]');
  await page.click('[data-dlg="del"]');
  await page.click('[data-dlg="del-yes"]');
  await expect.poll(async () => shares(await fakeStore(page))).toEqual([]);
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
