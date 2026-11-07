// Checks firestore.rules against Firebase's own rules emulator. Runs on GitHub (the "rules" job in
// .github/workflows/test-and-deploy.yml) with:
//   npx firebase-tools emulators:exec --only firestore --project demo-cdl "node --test tests/db-rules/rules.test.mjs"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cdl', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(() => env && env.cleanup());
beforeEach(() => env.clearFirestore());

const me = () => env.authenticatedContext('alice').firestore();
const list = (n, f = k => ({ n: 'Card ' + k, q: 1 })) => Array.from({ length: n }, (_, k) => f(k));
const deck = (o = {}) => ({ id: 'd1', name: 'Test', cur: list(100), orig: list(100), printed: list(100), fmt: 2, hist: { sigs: ['c1'], changes: 3 }, rev: 1, ...o });
const deckRef = db => doc(db, 'users/alice/decks/d1');

test('you can save, read and delete your own deck', async () => {
  const db = me();
  await assertSucceeds(setDoc(deckRef(db), deck()));
  await assertSucceeds(getDoc(deckRef(db)));
  await assertSucceeds(deleteDoc(deckRef(db)));
});
test('nobody else can read or change your decks, and signed-out visitors get nothing', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/decks/d1'), deck()));
  const bob = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  for (const db of [bob, anon]) {
    await assertFails(getDoc(deckRef(db)));
    await assertFails(setDoc(deckRef(db), deck()));
    await assertFails(deleteDoc(deckRef(db)));
    await assertFails(getDoc(doc(db, 'users/alice/meta/bin')));
    await assertFails(getDoc(doc(db, 'users/alice/decks/d1/history/c1')));
  }
});
test('a deck can have up to 500 cards in its current list and 2,000 owned', async () => {
  const db = me();
  await assertSucceeds(setDoc(deckRef(db), deck({ cur: list(500), orig: list(500), printed: list(2000) })));
  await assertFails(setDoc(deckRef(db), deck({ cur: list(501) })));
  await assertFails(setDoc(deckRef(db), deck({ orig: list(501) })));
  await assertFails(setDoc(deckRef(db), deck({ printed: list(2001) })));
  await assertFails(setDoc(deckRef(db), deck({ cur: 'not a list' })));
});
test('a deck lists up to 40 history pieces and keeps up to 2,000 changes waiting in itself', async () => {
  const db = me();
  await assertSucceeds(setDoc(deckRef(db), deck({ hist: { sigs: list(40, k => 'c' + k), changes: 1 }, log: list(2000, k => ({ id: 'e' + k, kind: 'swap' })) })));
  await assertFails(setDoc(deckRef(db), deck({ hist: { sigs: list(41, k => 'c' + k), changes: 1 } })));
  await assertFails(setDoc(deckRef(db), deck({ log: list(2001, k => ({ id: 'e' + k })) })));
  // Decks saved before history moved out (no "hist") still save.
  const old = deck(); delete old.hist; delete old.fmt;
  await assertSucceeds(setDoc(deckRef(db), old));
});
test('a history piece holds up to 500 changes and nothing else', async () => {
  const db = me(); const ref = doc(db, 'users/alice/decks/d1/history/c1');
  await assertSucceeds(setDoc(ref, { p: list(500, k => ({ id: 'e' + k, kind: 'swap' })) }));
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(ref, { p: list(501, k => ({ id: 'e' + k })) }));
  await assertFails(setDoc(ref, { p: [], extra: 'x' }));
  await assertSucceeds(deleteDoc(ref));
});
test('the card bin has up to 5 sections of up to 7,000 entries', async () => {
  const db = me();
  await assertSucceeds(setDoc(doc(db, 'users/alice/meta/bin'), { rev: 1, fmt: 2, sigs: ['a', 'b', 'c', 'd', 'e'], cards: [] }));
  await assertFails(setDoc(doc(db, 'users/alice/meta/bin'), { rev: 1, fmt: 2, sigs: list(6, k => 's' + k), cards: [] }));
  await assertFails(setDoc(doc(db, 'users/alice/meta/bin'), { rev: 1, cards: list(1001) }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/bin/a'), { p: list(7000) }));
  await assertFails(setDoc(doc(db, 'users/alice/bin/a'), { p: list(7001) }));
});
test('a deck, its history piece and the bin can be saved together in one batch, as the site does', async () => {
  const db = me(); const b = writeBatch(db);
  b.set(doc(db, 'users/alice/decks/d1/history/c1'), { p: [{ id: 'e1', kind: 'create' }] });
  b.set(deckRef(db), deck());
  b.delete(doc(db, 'users/alice/decks/d1/history/old'));
  await assertSucceeds(b.commit());
});
test('nothing can be stored anywhere else', async () => {
  const db = me();
  await assertFails(setDoc(doc(db, 'users/alice/other/x'), { a: 1 }));
  await assertFails(setDoc(doc(db, 'users/alice'), { a: 1 }));
  await assertFails(setDoc(doc(db, 'users/alice/meta/other'), { a: 1 }));
  await assertFails(setDoc(doc(db, 'users/alice/decks/d1/notes/x'), { a: 1 }));
  await assertFails(setDoc(doc(db, 'public/x'), { a: 1 }));
});

// ---- shared decks ----
const SID = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 characters, like the site makes
const share = (o = {}) => ({ owner: 'alice', v: 1, name: 'Test', commanders: ['Zagras, Thief of Heartbeats'], desc: 'Goes fast', cur: list(100), combos: { count: 1, at: 1, two: [{ cards: ['A', 'B'], produces: ['Win'] }] }, at: 1, ...o });
const shareRef = (db, id = SID) => doc(db, 'shares/' + id);

test('you can share a deck, update the copy and stop sharing it', async () => {
  const db = me();
  await assertSucceeds(setDoc(shareRef(db), share()));
  const { combos, ...noCombos } = share({ name: 'Renamed', at: 2 }); // combos are optional
  await assertSucceeds(setDoc(shareRef(db), noCombos));
  await assertSucceeds(deleteDoc(shareRef(db)));
  await assertSucceeds(deleteDoc(shareRef(db))); // already gone: still fine
});
test('anyone with the link can read a shared deck, signed in or not, but nobody can list them', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(shareRef(c.firestore()), share()));
  const bob = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  for (const db of [bob, anon]) {
    await assertSucceeds(getDoc(shareRef(db)));
    await assertFails(getDocs(collection(db, 'shares')));
  }
});
test('only the person who shared a deck can change or remove it', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(shareRef(c.firestore()), share()));
  const bob = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(shareRef(bob), share({ owner: 'bob' })));
  await assertFails(setDoc(shareRef(bob), share()));
  await assertFails(deleteDoc(shareRef(bob)));
  await assertFails(setDoc(shareRef(anon), share()));
  await assertFails(deleteDoc(shareRef(anon)));
  await assertFails(setDoc(shareRef(anon, 'ZyXwVuTsRqPoNmLkJiHgFe'), share()));
});
test('a share must be in your name, have a proper id and stay within its limits', async () => {
  const db = me();
  await assertFails(setDoc(shareRef(db), share({ owner: 'bob' })));
  await assertFails(setDoc(shareRef(db, 'short'), share()));
  await assertFails(getDoc(shareRef(db, 'short')));
  await assertSucceeds(setDoc(shareRef(db), share({ cur: list(500) })));
  await assertFails(setDoc(shareRef(db), share({ cur: list(501) })));
  await assertFails(setDoc(shareRef(db), share({ name: 'x'.repeat(201) })));
  await assertFails(setDoc(shareRef(db), share({ commanders: ['a', 'b', 'c', 'd', 'e'] })));
  await assertFails(setDoc(shareRef(db), share({ history: [] })));
  await assertFails(setDoc(shareRef(db), share({ combos: { count: 1, two: list(101) } })));
});
