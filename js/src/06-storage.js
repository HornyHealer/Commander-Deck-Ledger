// js/src/06-storage.js: saving in this browser, and installing as an app.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- persistence ----------
let toastTimer;
function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function touch(d) { d.rev = Math.max(Date.now(), (d.rev || 0) + 1); }
const STORE_KEY = "cdl-data-v1";
let storageOK = true, persistTimer = null, persistAsked = false;
// Ask the browser to treat this site's data as important, so it isn't cleared to free up space.
function askToKeepData() {
  if (persistAsked || !S.decks.size || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then(yes => yes || navigator.storage.persist()).catch(() => {});
}
// Backup reminder
const BACKUP_KEY = "cdl-last-backup", SNOOZE_KEY = "cdl-backup-snooze", DAY = 86400000;
const lsNum = k => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const lsSetNum = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };
function lastChange() { let t = S.loose.rev || 0; for (const d of S.decks.values()) t = Math.max(t, d.rev || 0, d.updatedAt || 0); return t; }
function backupStatus() {
  const last = lsNum(BACKUP_KEY), days = last ? Math.floor((Date.now() - last) / DAY) : null;
  const oldest = Math.min(Date.now(), ...[...S.decks.values()].map(d => d.createdAt || Date.now()));
  const changed = lastChange() > last;
  const due = last ? days >= 14 : (Date.now() - oldest) >= 3 * DAY;
  return { last, days, stale: S.decks.size > 0 && changed && due, snoozed: lsNum(SNOOZE_KEY) > Date.now() };
}
const agoText = days => days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
function persist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, CLOUD.user ? 600 : 150); }
function persistNow() {
  persistTimer = null;
  if (CLOUD.user) return cloudFlush();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, decks: [...S.decks.values()], bin: S.loose }));
    if (!storageOK) { storageOK = true; S.live = true; render(); }
    askToKeepData();
  } catch (err) {
    const full = err && (err.name === "QuotaExceededError" || err.code === 22);
    toast(full ? "Your browser's storage for this site is full. Export a backup, then delete old decks." : "Couldn't save. Your browser may be blocking storage for this site.");
    if (!full) { storageOK = false; S.live = false; render(); }
  }
}
function normalizeDeck(d) {
  if (!d.orig) d.orig = (d.printed || []).filter(p => p.o === 0).map(p => ({ n: p.n, q: p.q }));
  if (!d.bench) d.bench = { out: [], in: [], note: "" };
  if (!Array.isArray(d.log)) d.log = [];
  if (!Array.isArray(d.printed)) d.printed = [];
  return d;
}
function readLocalStore() {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function loadStore() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); storageOK = true; } catch { storageOK = false; return; }
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
  S.decks = new Map();
  for (const d of (data && Array.isArray(data.decks) ? data.decks : [])) {
    if (!d || !d.id || !Array.isArray(d.cur)) continue;
    if (!d.orig) d.orig = (d.printed || []).filter(p => p.o === 0).map(p => ({ n: p.n, q: p.q }));
    if (!d.bench) d.bench = { out: [], in: [], note: "" };
    S.decks.set(d.id, d);
  }
  S.loose = data && data.bin && Array.isArray(data.bin.cards) ? data.bin : { cards: [] };
  // Converts older decks to permanent card IDs (and follows any renames) without changing their history.
  let changed = syncBinIds();
  for (const d of S.decks.values()) { if (syncDeckIds(d)) changed = true; if (convertUnowned(d)) { touch(d); changed = true; } }
  if (changed) persist();
}
window.addEventListener("pagehide", () => { if (persistTimer) { clearTimeout(persistTimer); persistNow(); } });
window.addEventListener("storage", e => { if (e.key === STORE_KEY && !CLOUD.user) { loadStore(); safeRender(); } });
function cardLists(d) {
  const out = [d.cur, d.orig, d.printed, d.bench && d.bench.out, d.bench && d.bench.in];
  for (const b of incomingOf(d)) out.push(b.out, b.in);
  for (const e of d.log || []) { out.push(e.out, e.in, e.cards); if (e.from && Array.isArray(e.from.loose)) out.push(e.from.loose); }
  return out.filter(Array.isArray);
}
function stampIds(list) { for (const x of list) if (x && x.n && !x.i) { const r = rec(x.n); if (r && r[5]) x.i = r[5]; } }
function mergeSameName(list) {
  const seen = new Map();
  for (let k = 0; k < list.length; k++) { const x = list[k], p = seen.get(x.n); if (p) { p.q += x.q; list.splice(k--, 1); } else seen.set(x.n, x); }
}
// When the card list renames a card, decks follow it by ID. Returns true if anything changed.
function syncDeckIds(d) {
  const renames = new Map(); let stamped = false;
  for (const list of cardLists(d)) for (const x of list) {
    if (!x || !x.n) continue;
    if (x.i) { const r = recById(x.i); if (r && r[0] !== x.n) { renames.set(x.n, r[0]); x.n = r[0]; } }
    else { const r = rec(x.n); if (r && r[5]) { x.i = r[5]; stamped = true; } }
  }
  if (renames.size) {
    const rn = n => renames.get(n) || n;
    d.commanders = (d.commanders || []).map(rn);
    if (d.artCard) d.artCard = rn(d.artCard);
    if (d.artFor) d.artFor = rn(d.artFor);
    [d.cur, d.orig, d.printed].forEach(l => Array.isArray(l) && mergeSameName(l));
  }
  return stamped || renames.size > 0;
}
function syncBinIds() {
  let changed = false;
  for (const c of S.loose.cards || []) {
    if (c.i) { const r = recById(c.i); if (r && r[0] !== c.n) { c.n = r[0]; changed = true; } }
    else { const r = rec(c.n); if (r && r[5]) { c.i = r[5]; changed = true; } }
  }
  return changed;
}
function save(d) { touch(d); cardLists(d).forEach(stampIds); S.decks.set(d.id, d); persist(); queueLookups(); return Promise.resolve(); }
const benchTimers = new Map();
function saveSoon(d) { touch(d); persist(); }
function saveLoose() { S.loose.rev = Math.max(Date.now(), (S.loose.rev || 0) + 1); stampIds(S.loose.cards || []); persist(); queueLookups(); }
async function removeDeck(id) { S.decks.delete(id); persist(); }
async function boot() {
  try {
    const res = await fetch("data/cards.json");
    if (!res.ok) throw new Error(String(res.status));
    indexCards(await res.json());
  } catch { S.cardsFailed = true; }
  loadExtraCards();
  loadStore();
  await cloudInit();
  S.ready = true; S.live = storageOK;
  if (!CLOUD.user && S.view === "deck" && !S.decks.has(S.deckId)) S.view = "library";
  render(); queueLookups(); if (!CLOUD.user) askToKeepData();
}

// ---------- install as an app ----------
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.ready) safeRender(); });
window.addEventListener("appinstalled", () => { installEvt = null; if (S.ready) safeRender(); });
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function installHtml() {
  if (isStandalone()) return "";
  if (installEvt) return `<p class="install"><button class="btn sm" data-act="install">${ICONS.down}Install as an app</button> Opens in its own window from your home screen or desktop.</p>`;
  if (isIOS) return `<p class="install">Install as an app: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>`;
  return "";
}
// Saves the site for opening without a connection (only on the real https site, not in local tests).
if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
