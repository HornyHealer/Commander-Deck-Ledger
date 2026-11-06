// js/src/07-sync.js: accounts and sync (Firebase), saved in pieces.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- accounts and sync (Firebase) ----------
// Turned on by js/firebase-config.js. Signed out, the site works from browser storage as before.
// Signed in, each deck is one document at users/{uid}/decks/{deckId} and the card bin is users/{uid}/meta/bin.
const FB = "https://www.gstatic.com/firebasejs/12.19.0/";
const CLOUD = { enabled: false, api: null, user: null, authReady: false, loaded: false, failed: false, unsubs: [], pending: 0, serverDecks: false, serverBin: false, migrated: false, menu: false };
const synced = new Map(); // deck id -> rev last written to or read from the account
let syncedBinRev = 0;
function cloudInit() {
  const cfg = window.LEDGER_FIREBASE;
  CLOUD.enabled = !!(cfg && cfg.apiKey && cfg.projectId);
  if (!CLOUD.enabled) return Promise.resolve();
  CLOUD.failed = false; CLOUD.err = "";
  return new Promise(resolve => {
    let settled = false; const done = () => { if (!settled) { settled = true; resolve(); } };
    setTimeout(done, 4000); // don't hold the page if Firebase is slow to answer
    // Phones (an app opened from the home screen especially) can fail the first request while the
    // connection wakes up, so try loading Firebase a few times before giving up.
    // Check the files can be downloaded first: a failed import can be remembered by the browser for the rest of
    // the visit, which would make retrying pointless.
    const files = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"];
    const reach = tries => Promise.all(files.map(f => fetch(FB + f).then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " for " + f); })))
      .catch(err => tries > 1 ? new Promise(r => setTimeout(r, tries === 3 ? 1000 : 3000)).then(() => reach(tries - 1)) : Promise.reject(err));
    const load = tries => reach(tries).then(() => Promise.all(files.map(f => import(FB + f))));
    load(3).then(async ([appM, authM, fsM]) => {
      const app = appM.getApps && appM.getApps().length ? appM.getApp() : appM.initializeApp(cfg);
      await startAppCheck(app, cfg); // before sign-in and the database, so their requests carry the check
      const auth = authM.getAuth(app);
      let db;
      try { db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) }); }
      catch { db = fsM.getFirestore(app); }
      CLOUD.api = { authM, fsM, auth, db };
      authM.onAuthStateChanged(auth, user => { onUser(user); done(); });
    }).catch(err => { CLOUD.failed = true; CLOUD.err = String(err && (err.code || err.message) || err || "unknown error").slice(0, 200); reportError("sync", "Firebase didn't load: " + CLOUD.err, isStandalone() ? "installed app" : "browser"); done(); safeRender(); });
  });
}
// ---- Saving to the account in pieces ----
// Firestore holds at most 1 MB per record, so a deck's history and the card bin are saved as separate
// "piece" records instead of inside one big one:
//   users/{uid}/decks/{id}              the deck itself, with a list of its history pieces (hist.sigs)
//   users/{uid}/decks/{id}/history/c…   up to 500 history entries each
//   users/{uid}/meta/bin                the bin's change number and its list of pieces (sigs)
//   users/{uid}/bin/c…                  one of 5 sections of the bin, split by each card's permanent ID
// A piece is named after its contents, so a piece never changes once saved; a change saves the new pieces and
// the main record in one go, then removes pieces nothing uses any more. Another device only takes the new
// version once every piece it lists has arrived, so it never shows half a change.
// A deck's history is only read when the deck is opened (or something needs it, like undoing a move with
// another deck, or a backup); until then the deck record's hist.changes stands in for the count. Changes made
// to a deck before its history has been read are saved in the deck record's "log" and folded in later.
const HIST_PIECE = 500, PIECE_CHARS = 300000, BIN_PARTS = 5;
function strHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
// The same text for the same contents whatever order Firestore hands the fields back in.
function stableStr(v) {
  if (Array.isArray(v)) return "[" + v.map(x => x === undefined ? "null" : stableStr(x)).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + stableStr(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
const pieceName = part => { const s = stableStr(part); return "c" + strHash(s).toString(36) + "-" + s.length.toString(36); };
function packHistory(log) {
  const out = []; let cur = [], size = 0;
  for (const e of log) {
    const n = JSON.stringify(e).length;
    if (cur.length && (cur.length >= HIST_PIECE || size + n > PIECE_CHARS)) { out.push(cur); cur = []; size = 0; }
    cur.push(e); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
const binPart = c => strHash(String(c.i || c.n || "")) % BIN_PARTS;
function splitBin(cards) { const parts = Array.from({ length: BIN_PARTS }, () => []); for (const c of cards) parts[binPart(c)].push(c); return parts; }

const PIECES = new Map(); // "bin" or "d:<deck id>" -> { docs: name -> contents, wait, mine, seen, unsub }
function pieceSet(key) { let o = PIECES.get(key); if (!o) PIECES.set(key, o = { docs: new Map(), wait: null, mine: new Map(), seen: false, unsub: null, dead: false }); return o; }
function piecePath(key) { const uid = CLOUD.user.uid; return key === "bin" ? ["users", uid, "bin"] : ["users", uid, "decks", key.slice(2), "history"]; }
function watchPieces(key) {
  const o = pieceSet(key); if (o.unsub || !CLOUD.user) return o;
  const { fsM, db } = CLOUD.api;
  o.unsub = fsM.onSnapshot(fsM.collection(db, ...piecePath(key)), snap => {
    for (const ch of snap.docChanges()) {
      if (ch.type === "removed") { o.docs.delete(ch.doc.id); continue; }
      const v = ch.doc.data(); if (v && Array.isArray(v.p)) o.docs.set(ch.doc.id, v.p);
    }
    o.seen = true;
    if (o.dead) return clearPieces(key);
    // Another device removed a piece this one still uses (both changed the same thing at once): put it back.
    if (!snap.metadata.hasPendingWrites && !o.wait && [...o.mine.keys()].some(n => !o.docs.has(n))) {
      const b = fsM.writeBatch(db);
      for (const [n, p] of o.mine) if (!o.docs.has(n)) { b.set(fsM.doc(db, ...piecePath(key), n), forCloud({ p })); o.docs.set(n, p); }
      cloudWrite(b.commit());
    }
    tryPieces(key);
  }, cloudError);
  return o;
}
// Removes every piece of a deleted deck, including ones that show up once the listener has caught up.
function clearPieces(key) {
  const o = PIECES.get(key); if (!o || !CLOUD.user) return;
  o.dead = true; o.wait = null; o.mine = new Map();
  if (o.docs.size) {
    const { fsM, db } = CLOUD.api; const b = fsM.writeBatch(db);
    for (const n of o.docs.keys()) b.delete(fsM.doc(db, ...piecePath(key), n));
    o.docs.clear(); cloudWrite(b.commit());
  }
  if (o.seen) { if (o.unsub) o.unsub(); PIECES.delete(key); }
}
function dropPieces(key) { const o = PIECES.get(key); if (!o || o.dead) return; if (o.unsub) o.unsub(); PIECES.delete(key); }
// Waits for every listed piece, then hands their contents over in order.
function waitPieces(key, names, apply) { const o = watchPieces(key); o.wait = { names, apply }; tryPieces(key); }
function tryPieces(key) {
  const o = PIECES.get(key); if (!o || !o.wait) return;
  const { names, apply } = o.wait;
  if (!names.every(n => n === "-" || o.docs.has(n))) return;
  o.wait = null;
  const parts = names.map(n => n === "-" ? [] : clone(o.docs.get(n)));
  if (apply(parts) !== false) o.mine = new Map(names.filter(n => n !== "-").map(n => [n, o.docs.get(n)]));
  if (!CLOUD.loaded && CLOUD.decksSeen && !decksWaiting()) CLOUD.loaded = true;
  maybeMigrate(); safeRender();
}
function decksWaiting() { for (const [k, o] of PIECES) if (k !== "bin" && o.wait) return true; return false; }
// Adds the pieces a new version needs to a batch of writes and removes the ones it no longer uses.
function writePieces(batch, key, parts) {
  const { fsM, db } = CLOUD.api; const o = watchPieces(key); const path = piecePath(key);
  const names = parts.map(p => p.length ? pieceName(p) : "-");
  const need = new Map();
  parts.forEach((p, k) => {
    const n = names[k]; if (!p.length || need.has(n)) return;
    if (!o.docs.has(n)) { const v = forCloud({ p }); batch.set(fsM.doc(db, ...path, n), v); o.docs.set(n, v.p); } // a copy, so later edits don't change it
    need.set(n, o.docs.get(n));
  });
  if (o.seen) for (const n of [...o.docs.keys()]) if (!need.has(n)) { batch.delete(fsM.doc(db, ...path, n)); o.docs.delete(n); }
  o.mine = need; o.wait = null;
  return names;
}

// App Check: proves requests to Firebase come from this site (using reCAPTCHA, invisibly) so the free quota
// can't be used up by scripts. Only starts when js/firebase-config.js has an appCheckKey. If it can't load,
// the site carries on without it; Firebase only refuses unchecked requests once enforcement is turned on.
async function startAppCheck(app, cfg) {
  if (!cfg.appCheckKey) return;
  try {
    const acM = await import(FB + "firebase-app-check.js");
    acM.initializeAppCheck(app, { provider: new acM.ReCaptchaEnterpriseProvider(cfg.appCheckKey), isTokenAutoRefreshEnabled: true });
    CLOUD.appCheck = true;
  } catch (err) { reportError("sync", "App Check didn't start: " + String(err && (err.code || err.message) || err).slice(0, 200), isStandalone() ? "installed app" : "browser"); }
}
function stopCloud() {
  CLOUD.unsubs.forEach(u => { try { u(); } catch {} }); CLOUD.unsubs = [];
  for (const o of PIECES.values()) { try { if (o.unsub) o.unsub(); } catch {} }
  PIECES.clear(); oldFormat.clear(); synced.clear(); syncedBinRev = 0;
  histInfo.clear(); blocked.clear(); for (const id of [...histWaiters.keys()]) histDone(id, false);
  CLOUD.loaded = CLOUD.decksSeen = CLOUD.serverDecks = CLOUD.serverBin = CLOUD.migrated = CLOUD.binTaken = CLOUD.binOld = false;
}
const oldFormat = new Set(); // decks to save again in the current layout once the server has answered
function resaveDeck(id) { if (CLOUD.serverDecks) { synced.set(id, -1); persist(); } else oldFormat.add(id); }
function takeDeck(id, body, resave) {
  const d = normalizeDeck(body);
  syncDeckIds(d); S.decks.set(id, d); synced.set(id, d.rev || 0);
  if (convertUnowned(d)) { touch(d); persist(); } else if (resave) resaveDeck(id);
}
function takeBin(cards, rev, resave) {
  S.loose = { cards, rev }; syncBinIds(); syncedBinRev = rev; CLOUD.binTaken = true;
  if (resave) { if (CLOUD.serverBin) { syncedBinRev = -1; persist(); } else CLOUD.binOld = true; }
}
// Decks whose history hasn't been read yet: deck id -> { sigs, changes } as saved in the account.
const histInfo = new Map(), histWaiters = new Map();
const historyReady = id => !histInfo.has(id);
const changeCount = d => d.log.filter(isChange).length + (histInfo.has(d.id) ? histInfo.get(d.id).changes || 0 : 0);
function histDone(id, ok) { const w = histWaiters.get(id) || []; histWaiters.delete(id); w.forEach(f => f(ok)); }
// Reads a deck's history if it hasn't been yet. Resolves true once it's there, false if it couldn't be read.
function ensureHistory(id) {
  if (!CLOUD.user || historyReady(id) || !S.decks.has(id)) return Promise.resolve(true);
  return new Promise(res => {
    const w = histWaiters.get(id) || []; w.push(res); histWaiters.set(id, w);
    if (w.length === 1) { loadHistory(id); setTimeout(() => histDone(id, false), 15000); }
  });
}
function loadHistory(id) {
  const info = histInfo.get(id); if (!info) return histDone(id, true);
  waitPieces("d:" + id, info.sigs, parts => {
    const d = S.decks.get(id); if (!d || histInfo.get(id) !== info) return false;
    const log = [].concat(...parts); const have = new Set(log.map(e => e && e.id));
    for (const e of d.log) if (e && !have.has(e.id)) log.push(e); // changes made before the history arrived
    d.log = log; syncDeckIds(d); histInfo.delete(id); histDone(id, true);
  });
}
function onUser(user) {
  CLOUD.authReady = true;
  if (!user) {
    const was = CLOUD.user; CLOUD.user = null; stopCloud();
    if (was) { loadStore(); S.view = "library"; S.deckId = null; }
    if (S.ready) render();
    return;
  }
  if (CLOUD.user && CLOUD.user.uid === user.uid) return;
  if (persistTimer) { clearTimeout(persistTimer); persistNow(); } // finish saving to this browser first
  stopCloud();
  CLOUD.user = { uid: user.uid, name: user.displayName || "", email: user.email || "" };
  S.decks = new Map(); S.loose = { cards: [] };
  const { fsM, db } = CLOUD.api; const uid = user.uid;
  CLOUD.binRef = fsM.doc(db, "users", uid, "meta", "bin");
  watchPieces("bin");
  CLOUD.unsubs.push(fsM.onSnapshot(fsM.collection(db, "users", uid, "decks"), { includeMetadataChanges: true }, snap => {
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id;
      if (ch.type === "removed") { if (!ch.doc.metadata.hasPendingWrites) { S.decks.delete(id); synced.delete(id); oldFormat.delete(id); histInfo.delete(id); histDone(id, false); dropPieces("d:" + id); } continue; }
      if (ch.doc.metadata.hasPendingWrites) continue; // our own change on its way to the server
      const data = ch.doc.data(); if (!data || !Array.isArray(data.cur)) continue;
      const local = S.decks.get(id);
      if (local && (local.rev || 0) >= (data.rev || 0)) continue;
      if (data.fmt === 2 && data.hist && Array.isArray(data.hist.sigs)) {
        oldFormat.delete(id);
        // Changes saved before the history was read (or by an older copy of the site) sit in the deck itself.
        const extra = Array.isArray(data.log) ? data.log : [];
        const body0 = Object.assign({}, data, { id, log: extra.slice() }); delete body0.fmt; delete body0.hist;
        if ((!local || histInfo.has(id)) && typeof data.hist.changes === "number") {
          // Not opened here yet: take the deck now and leave its history until it's needed.
          const info = { sigs: data.hist.sigs, changes: data.hist.changes };
          histInfo.set(id, info); takeDeck(id, body0, false);
          if (histWaiters.has(id)) loadHistory(id);
          continue;
        }
        waitPieces("d:" + id, data.hist.sigs, parts => {
          const now = S.decks.get(id); if (now && (now.rev || 0) >= (data.rev || 0)) return false;
          const log = [].concat(...parts); const have = new Set(log.map(e => e && e.id));
          for (const e of extra) if (e && !have.has(e.id)) log.push(e);
          histInfo.delete(id);
          takeDeck(id, Object.assign(body0, { log }), extra.length > 0 || typeof data.hist.changes !== "number");
          histDone(id, true);
        });
      } else {
        histInfo.delete(id);
        takeDeck(id, Object.assign({}, data, { id }), true);
      }
    }
    CLOUD.decksSeen = true;
    if (!CLOUD.loaded && !decksWaiting()) CLOUD.loaded = true;
    if (!CLOUD.loaded) setTimeout(() => { if (CLOUD.user && !CLOUD.loaded) { CLOUD.loaded = true; safeRender(); } }, 8000);
    if (!snap.metadata.fromCache) {
      CLOUD.serverDecks = true;
      if (oldFormat.size) { for (const id of oldFormat) if (S.decks.has(id)) synced.set(id, -1); oldFormat.clear(); persist(); }
    }
    maybeMigrate(); safeRender();
  }, cloudError));
  CLOUD.unsubs.push(fsM.onSnapshot(CLOUD.binRef, { includeMetadataChanges: true }, snap => {
    if (!snap.metadata.hasPendingWrites) {
      const data = snap.exists() ? snap.data() : null;
      const rev = data && data.rev || 0;
      const newer = !CLOUD.binTaken || rev > (S.loose.rev || 0);
      if (data && newer && data.fmt === 2 && Array.isArray(data.sigs)) {
        CLOUD.binOld = false;
        const extra = Array.isArray(data.cards) ? data.cards : []; // added by an older copy of the site
        waitPieces("bin", data.sigs, parts => {
          if (CLOUD.binTaken && rev <= (S.loose.rev || 0)) return false;
          takeBin([].concat(...parts, extra), rev, extra.length > 0 || data.sigs.length !== BIN_PARTS);
        });
      } else if (data && newer && Array.isArray(data.cards)) { CLOUD.binOld = true; takeBin(data.cards, rev, false); }
    }
    if (!snap.metadata.fromCache) {
      CLOUD.serverBin = true;
      if (CLOUD.binOld) { CLOUD.binOld = false; syncedBinRev = -1; persist(); }
    }
    maybeMigrate(); safeRender();
  }, cloudError));
  if (S.ready) render();
}
function cloudError(err) {
  const code = err && err.code || "";
  reportError("sync", "Sync error: " + (code || (err && err.message) || err), "sync");
  toast(code === "permission-denied" ? "Your account's data couldn't be read. Firebase's security rules may not be set up yet." : "Lost the connection to your account. Changes are kept and will sync when it's back.");
}
// The first time someone signs in on a browser, decks saved there move into their account.
function maybeMigrate() {
  if (CLOUD.migrated || !CLOUD.serverDecks || !CLOUD.serverBin) return;
  // Wait until the account's decks and bin have fully arrived, so nothing is merged into half a copy.
  if (decksWaiting() || (PIECES.get("bin") && PIECES.get("bin").wait)) return;
  CLOUD.migrated = true;
  const local = readLocalStore();
  const decks = local && Array.isArray(local.decks) ? local.decks.filter(d => d && d.id && Array.isArray(d.cur)) : [];
  const binCards = local && local.bin && Array.isArray(local.bin.cards) ? local.bin.cards : [];
  if (!decks.length && !binCards.length) return;
  let moved = 0;
  for (const raw of decks) {
    const here = S.decks.get(raw.id);
    if (here && (here.rev || 0) >= (raw.rev || 0)) continue;
    const d = normalizeDeck(clone(raw)); syncDeckIds(d); if (!d.rev) touch(d);
    S.decks.set(d.id, d); synced.delete(d.id); histInfo.delete(d.id); histDone(d.id, true); moved++;
  }
  for (const c of binCards) {
    const ex = S.loose.cards.find(x => x.n === c.n && (x.from || "") === (c.from || ""));
    if (ex) ex.q = Math.max(ex.q, c.q); else S.loose.cards.push(clone(c));
  }
  if (binCards.length) { S.loose.rev = Math.max(Date.now(), (S.loose.rev || 0) + 1); syncBinIds(); }
  cloudFlush();
  try { localStorage.setItem(STORE_KEY + "-moved", JSON.stringify({ movedAt: Date.now(), uid: CLOUD.user.uid, data: local })); localStorage.removeItem(STORE_KEY); } catch {}
  toast(moved ? `Moved ${moved} deck${moved === 1 ? "" : "s"} from this browser into your account.` : "Your account is up to date with this browser.");
}
function forCloud(o) { return JSON.parse(JSON.stringify(o)); } // drops undefined values, which Firestore rejects
function cloudWrite(promise) {
  CLOUD.pending++; updateSyncChip();
  promise.catch(err => cloudError(err)).finally(() => { CLOUD.pending = Math.max(0, CLOUD.pending - 1); updateSyncChip(); });
}
// The account's limits, matching firestore.rules. Far above normal use; a record over one isn't saved and a
// warning says what to trim.
const LIMITS = { cur: 500, printed: 2000, pieces: 40, waiting: 2000, bin: 30000, binPart: 7000 };
const blocked = new Map(); // "d:<id>" or "bin" -> what's over the limit
function setBlocked(key, why) {
  if ((blocked.get(key) || "") === why) return;
  if (why) blocked.set(key, why); else blocked.delete(key);
  updateSyncChip(); safeRender();
}
function deckOver(d, pieces) {
  const nm = `<b>${esc(d.name)}</b>`;
  if (d.cur.length > LIMITS.cur) return `${nm} has ${d.cur.length} different cards in its list. A deck can hold up to ${LIMITS.cur}, so remove some to save it again.`;
  if ((d.orig || []).length > LIMITS.cur) return `${nm}'s original list has ${d.orig.length} different cards; a deck can hold up to ${LIMITS.cur}.`;
  if (d.printed.length > LIMITS.printed) return `${nm} has ${d.printed.length} different owned cards. A deck can keep up to ${LIMITS.printed.toLocaleString()}, so take some off its owned list to save it again.`;
  if (pieces && pieces.length > LIMITS.pieces) return `${nm}'s history is longer than an account can hold (about 20,000 changes). Export a backup, then start a fresh copy of the deck from its current list.`;
  return "";
}
function binOver(parts) {
  const n = (S.loose.cards || []).length;
  if (n > LIMITS.bin || parts.some(p => p.length > LIMITS.binPart)) return `Your card bin has ${n.toLocaleString()} entries. It can hold up to ${LIMITS.bin.toLocaleString()}, so remove some to save it again.`;
  return "";
}
function cloudFlush() {
  if (!CLOUD.user || !CLOUD.api) return;
  const { fsM, db } = CLOUD.api; const uid = CLOUD.user.uid;
  for (const d of S.decks.values()) {
    if (synced.has(d.id) && synced.get(d.id) === (d.rev || 0)) continue;
    const lazy = !historyReady(d.id);
    // Lots of changes waiting in an unopened deck: read its history so they can be filed into it.
    if (lazy && d.log.length > LIMITS.waiting / 2) { ensureHistory(d.id).then(() => persist()); continue; }
    const pieces = lazy ? null : packHistory(d.log || []);
    const why = deckOver(d, pieces); setBlocked("d:" + d.id, why);
    if (why) continue;
    synced.set(d.id, d.rev || 0);
    if (lazy) {
      // History not read here: keep the saved pieces and put this device's new entries in the deck record.
      const info = histInfo.get(d.id);
      cloudWrite(fsM.setDoc(fsM.doc(db, "users", uid, "decks", d.id), forCloud(Object.assign({}, d, { fmt: 2, hist: { sigs: info.sigs, changes: info.changes } }))));
      continue;
    }
    // The deck and its new history pieces are saved together, so other devices never see one without the other.
    const b = fsM.writeBatch(db);
    const sigs = writePieces(b, "d:" + d.id, pieces);
    const body = Object.assign({}, d, { fmt: 2, hist: { sigs, changes: d.log.filter(isChange).length } }); delete body.log;
    b.set(fsM.doc(db, "users", uid, "decks", d.id), forCloud(body));
    cloudWrite(b.commit());
  }
  for (const id of [...synced.keys()]) if (!S.decks.has(id)) {
    synced.delete(id); histInfo.delete(id); histDone(id, false); setBlocked("d:" + id, ""); cloudWrite(fsM.deleteDoc(fsM.doc(db, "users", uid, "decks", id)));
    watchPieces("d:" + id); clearPieces("d:" + id);
  }
  if ((S.loose.rev || 0) !== syncedBinRev) {
    const parts = splitBin(S.loose.cards || []);
    const why = binOver(parts); setBlocked("bin", why);
    if (why) return;
    syncedBinRev = S.loose.rev || 0; CLOUD.binTaken = true;
    const b = fsM.writeBatch(db);
    const sigs = writePieces(b, "bin", parts);
    // "cards" stays as an empty list so an older copy of the site still open somewhere doesn't mistake the bin for missing.
    b.set(CLOUD.binRef, { rev: S.loose.rev || 0, fmt: 2, sigs, cards: [] });
    cloudWrite(b.commit());
  }
}
function syncText() {
  if (blocked.size) return "Not saved";
  if (!CLOUD.pending) return "Synced";
  return navigator.onLine === false ? `Offline · ${CLOUD.pending} waiting` : "Saving…";
}
function updateSyncChip() { const el = $("#sync-status"); if (el) { el.textContent = syncText(); el.classList.toggle("busy", CLOUD.pending > 0 || blocked.size > 0); } }
window.addEventListener("online", updateSyncChip); window.addEventListener("offline", updateSyncChip);
async function signIn() {
  if (!CLOUD.api) return toast("Sign-in isn't available right now. Check your connection and reload.");
  const { authM, auth } = CLOUD.api; const provider = new authM.GoogleAuthProvider();
  try { await authM.signInWithPopup(auth, provider); }
  catch (e) {
    const code = e && e.code || "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") { try { await authM.signInWithRedirect(auth, provider); } catch {} return; }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    reportError("sign-in", code || (e && e.message) || "sign-in failed", isStandalone() ? "installed app" : "browser");
    toast(code === "auth/unauthorized-domain" ? "This website isn't on Firebase's list of authorized domains yet." : code === "auth/network-request-failed" ? "Couldn't reach Google. Check your connection and try again." : `Couldn't sign in${code ? " (" + code + ")" : ""}. Try again.`);
  }
}
async function signOutNow() {
  if (!CLOUD.api) return;
  if (persistTimer) { clearTimeout(persistTimer); persistNow(); }
  if (CLOUD.pending && navigator.onLine === false) return toast("You have changes waiting to sync. Reconnect before signing out so they aren't lost.");
  try { await CLOUD.api.authM.signOut(CLOUD.api.auth); toast("Signed out."); } catch { toast("Couldn't sign out. Try again."); }
}
function accountHtml() {
  if (!CLOUD.enabled) return "";
  if (CLOUD.failed) return `<button class="sync-chip warn chipbtn" data-act="sync-retry" title="Firebase didn't load${CLOUD.err ? ": " + esc(CLOUD.err) : ""}. Tap to try again.">Sync unavailable · Retry</button>`;
  if (!CLOUD.authReady) return "";
  if (!CLOUD.user) return `<button class="btn" data-act="signin">${ICONS.user}Sign in</button>`;
  const initials = (CLOUD.user.name || CLOUD.user.email || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return `<span id="sync-status" class="sync-chip${CLOUD.pending ? " busy" : ""}" role="status">${syncText()}</span><div class="menuwrap"><button class="btn acct" data-act="acct-menu" aria-haspopup="menu" aria-expanded="${CLOUD.menu}" title="${esc(CLOUD.user.email)}"><span class="avatar">${esc(initials)}</span><span class="acct-name">${esc(CLOUD.user.name || CLOUD.user.email)}</span></button>${CLOUD.menu ? `<div class="menu acct-menu" role="menu"><span class="menu-note">${esc(CLOUD.user.email)}</span><button role="menuitem" data-act="signout">Sign out</button></div>` : ""}</div>`;
}
