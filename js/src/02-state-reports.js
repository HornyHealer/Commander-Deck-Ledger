// js/src/02-state-reports.js: app state and error reports.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- state ----------
let SORT0 = "cost"; try { SORT0 = localStorage.getItem("ledger-sort") || "cost"; } catch {}
const S = { libQ: "", libSort: (() => { try { return localStorage.getItem("cdl-lib-sort") || "recent"; } catch { return "recent"; } })(), binOpen: (() => { try { return localStorage.getItem("cdl-bin-open") === "1"; } catch { return false; } })(), sort: SORT0, loose: { cards: [] }, decks: new Map(), view: "library", deckId: null, tab: "current", filter: "", printedFilter: "all", db: null, col: null, live: false, ready: false, confirm: null, dialog: null };

// ---------- error reports ----------
// When something goes wrong in a visitor's browser, a short report goes to the Cloudflare Worker: the error
// message, where it happened, the page, the browser, whether it's the installed app or signed in, and the site
// version. Never deck contents, names or emails. Only from the real site, at most 5 per visit, each error once.
// The daily health check posts new reports to the "Error reports" issue on GitHub.
const REPORT_URL = "https://cdl-archidekt.deckledger.workers.dev/report";
const reportsOn = () => location.hostname === "hornyhealer.github.io" || window.LEDGER_REPORT_ERRORS === true;
const reportedErrors = new Set();
function reportError(kind, message, where) {
  try {
    const msg = String(message || "").trim().slice(0, 300);
    if (!reportsOn() || !msg || msg === "Script error." || reportedErrors.size >= 5) return;
    const key = kind + "|" + msg + "|" + (where || ""); if (reportedErrors.has(key)) return; reportedErrors.add(key);
    const src = (document.querySelector('script[src*="js/app.js"]') || {}).src || "";
    const body = { kind, message: msg, where: String(where || "").slice(0, 160), view: S.view, browser: navigator.userAgent.slice(0, 200),
      app: typeof isStandalone === "function" && isStandalone(), signedIn: !!(typeof CLOUD !== "undefined" && CLOUD.user), version: (src.match(/[?&]v=([\w-]+)/) || [])[1] || "" };
    fetch(REPORT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch {}
}
window.addEventListener("error", e => { if (e && e.message) reportError("crash", e.message, (String(e.filename || "").split("/").pop().split("?")[0]) + (e.lineno ? ":" + e.lineno : "")); });
window.addEventListener("unhandledrejection", e => { const r = e && e.reason; reportError("crash", r && (r.message || r.code) || String(r), r && r.stack ? String(r.stack).split("\n")[1] || "" : ""); });
let pendingRender = false;

function curMap(d) { return new Map(d.cur.map(c => [c.n, c.q])); }
function total(d) { return d.cur.reduce((a, c) => a + c.q, 0); }
const qsum = arr => arr.reduce((a, c) => a + c.q, 0);
// "printed" in the saved data means owned: copies in hand, however they were got. The name stays so older
// backups and synced decks keep working.
function printedTotal(d) { return qsum(d.printed); }
function deckCI(d) { const s = new Set(); (d.commanders || []).forEach(n => [...ciOf(n)].forEach(c => s.add(c))); return MANA_ORDER.split("").filter(c => s.has(c)).join(""); }
function origOf(d) { return d.orig || d.printed.filter(p => p.o === 0).map(p => ({ n: p.n, q: p.q })); }
function printedMap(d) { return new Map(d.printed.map(p => [p.n, p.q])); }
function peakMap(d) {
  const cm = new Map(origOf(d).map(c => [c.n, c.q])); const peak = new Map(cm);
  for (const e of d.log) {
    if (e.kind === "incoming") continue;
    for (const o of e.out || []) { const v = (cm.get(o.n) || 0) - o.q; if (v > 0) cm.set(o.n, v); else cm.delete(o.n); }
    for (const i of e.in || []) { const v = (cm.get(i.n) || 0) + i.q; cm.set(i.n, v); if (v > (peak.get(i.n) || 0)) peak.set(i.n, v); }
  }
  for (const p of d.printed) if (p.q > (peak.get(p.n) || 0)) peak.set(p.n, p.q);
  return peak;
}
function removedList(d) {
  const cm = curMap(d); const pm = printedMap(d); const rows = [];
  const waiting = new Map(); for (const b of incomingOf(d)) if (b.fromList) for (const x of b.in) waiting.set(x.n, (waiting.get(x.n) || 0) + x.q);
  for (const [n, q] of peakMap(d)) { const have = (cm.get(n) || 0) + (waiting.get(n) || 0); if (have < q) rows.push({ n, q: q - have, printed: pm.get(n) || 0 }); }
  return rows;
}
function unprinted(d) {
  const pm = printedMap(d); const rows = [];
  for (const c of d.cur) { const p = pm.get(c.n) || 0; if (p < c.q) rows.push({ n: c.n, q: c.q - p }); }
  return rows;
}
function markPrinted(d, n, q) {
  const now = Date.now(); const p = d.printed.find(x => x.n === n);
  const isOrig = origOf(d).some(o => o.n === n);
  if (!p) d.printed.push({ n, q, at: now, o: isOrig ? 0 : 1 });
  else { p.q += q; if (p.o === 0 && !p.at) p.at = now; }
}
const isChange = e => e.kind === "swap" || e.kind === "import";
function unprintCards(d, list, to) {
  const now = Date.now(); const cards = [];
  for (const x of list) {
    const p = d.printed.find(y => y.n === x.n); if (!p) continue;
    const take = Math.min(p.q, x.q); if (take <= 0) continue;
    cards.push({ n: p.n, q: take, at: p.at, o: p.o });
    p.q -= take; if (p.q <= 0) d.printed = d.printed.filter(y => y !== p);
  }
  if (!cards.length) return 0;
  const e = { id: uid(), t: now, kind: "unprint", cards }; if (to) e.to = to; d.log.push(e);
  d.updatedAt = now; return qsum(cards);
}
function looseLabel(c) { return c.from ? c.from + " (deleted)" : "Added directly"; }
function addToBin(cards) {
  const now = Date.now(); let n = 0;
  for (const x of cards) {
    if (!(x.q > 0)) continue;
    const ex = S.loose.cards.find(c => c.n === x.n && !c.from);
    if (ex) ex.q += x.q; else S.loose.cards.push({ n: x.n, q: x.q, at: now });
    n += x.q;
  }
  if (n) saveLoose(); return n;
}
function binRows() {
  const map = new Map();
  const row = n => { if (!map.has(n)) map.set(n, { n, total: 0, srcs: [], needs: [] }); return map.get(n); };
  for (const d of S.decks.values()) {
    const cm = curMap(d);
    for (const p of d.printed) { const spare = p.q - (cm.get(p.n) || 0); if (spare > 0) { const r = row(p.n); r.total += spare; r.srcs.push({ id: d.id, name: d.name, q: spare }); } }
  }
  for (const c of S.loose.cards || []) { if (c.q > 0) { const r = row(c.n); r.total += c.q; r.srcs.push({ id: "_bin", name: looseLabel(c), q: c.q, loose: true, direct: !c.from }); } }
  for (const d of S.decks.values()) for (const u of incomingNeeds(d)) if (map.has(u.n)) map.get(u.n).needs.push({ id: d.id, name: d.name, q: u.q });
  for (const d of S.decks.values()) for (const b of incomingOf(d)) for (const x of b.in) if (map.has(x.n)) { const r = map.get(x.n); (r.inc || (r.inc = [])).push(d.name); }
  return [...map.values()].sort((a, b) => a.n.localeCompare(b.n));
}
// Takes up to `want` copies of a card out of the card bin for a deck: loose bin cards are removed and spares
// owned by other decks come off those decks' owned lists. Returns what was taken and where from.
function pullFromBin(n, want, target, pairId) {
  const r = binRows().find(x => x.n === n); const froms = []; const fromLoose = []; const srcs = [];
  if (!r) return { got: 0, froms, fromLoose, srcs };
  let left = Math.min(want, r.total); const moved = left;
  for (const s of r.srcs) {
    if (!left) break; if (s.id === target.id) continue;
    if (s.loose) {
      let take = Math.min(s.q, left); const got0 = take;
      for (const c of S.loose.cards) { if (!take) break; if (c.n !== n || looseLabel(c) !== s.name) continue; const k = Math.min(c.q, take); c.q -= k; take -= k; fromLoose.push({ n, q: k, from: c.from || "" }); }
      S.loose.cards = S.loose.cards.filter(c => c.q > 0);
      froms.push(s.name); left -= got0 - take; saveLoose(); continue;
    }
    const src = S.decks.get(s.id); const take = Math.min(s.q, left);
    unprintCards(src, [{ n, q: take }], { id: target.id, name: target.name });
    const se = src.log[src.log.length - 1]; if (pairId) se.pair = { deck: target.id, entry: pairId }; srcs.push({ deck: src.id, entry: se.id, name: src.name });
    froms.push(src.name); left -= take; save(src);
  }
  return { got: moved - left, froms, fromLoose, srcs };
}
// Fills an incoming card with a spare from the card bin: the copy leaves the bin and joins the deck list right
// away (one history entry, undoable from this deck or the deck the spare came from). Cards that are part of a
// swap still waiting on Arrived are marked owned now and join the list when the swap arrives.
// Takes up to q copies of a card off a deck's incoming changes that only add cards (swaps keep waiting for
// Arrived). Returns how many came off and from which changes, so undo can put them back.
function takeFromIncoming(target, n, q) {
  let left = q; const taken = [];
  for (const b of incomingOf(target)) {
    if (!left) break; if (b.out.length) continue;
    const x = b.in.find(y => y.n === n); if (!x) continue;
    const k = Math.min(x.q, left); x.q -= k; left -= k;
    const tb = { id: b.id, t: b.t, q: k }; if (b.note) tb.note = b.note; if (b.fromList) tb.fromList = true; taken.push(tb);
  }
  target.incoming = incomingOf(target).map(b => ({ ...b, in: b.in.filter(x => x.q > 0) })).filter(b => b.in.length || b.out.length);
  if (!target.incoming.length) delete target.incoming;
  return { into: q - left, taken };
}
function restoreIncoming(target, n, taken) {
  for (const tb of taken || []) {
    const b = incomingOf(target).find(x => x.id === tb.id);
    if (b) { const x = b.in.find(y => y.n === n); if (x) x.q += tb.q; else b.in.push({ n, q: tb.q }); }
    else { const nb = { id: tb.id, t: tb.t, out: [], in: [{ n, q: tb.q }] }; if (tb.note) nb.note = tb.note; if (tb.fromList) nb.fromList = true; target.incoming = [...incomingOf(target), nb].sort((x, y) => x.t - y.t); }
  }
}
function addToList(d, n, q) { if (!q) return; const cm = curMap(d); cm.set(n, (cm.get(n) || 0) + q); const order = d.cur.map(c => c.n); if (!order.includes(n)) order.push(n); d.cur = order.map(x => ({ n: x, q: cm.get(x) })); }
// Fills an incoming card with a copy from another deck: cut from that deck (and its owned list), added here as
// owned. Both decks log the move and either can undo it, which also puts the card back on the incoming list.
function grabFromDeck(n, srcId, targetId) {
  const target = S.decks.get(targetId), src = S.decks.get(srcId); if (!target || !src || src === target) return 0;
  const need = (incomingNeeds(target).find(x => x.n === n) || {}).q || 0;
  const q = Math.min(need, curMap(src).get(n) || 0); if (!q) return 0;
  const xid = uid(); const now = Date.now();
  applyChange(src, [{ n, q }], [], "", "swap");
  const se = src.log[src.log.length - 1]; se.xfer = { id: xid, to: { id: target.id, name: target.name } };
  const p = src.printed.find(y => y.n === n);
  if (p) { const take = Math.min(p.q, q); se.lost = [{ n, q: take, at: p.at, o: p.o }]; p.q -= take; if (p.q <= 0) src.printed = src.printed.filter(y => y !== p); }
  const { into, taken } = takeFromIncoming(target, n, q);
  addToList(target, n, into); markPrinted(target, n, q);
  target.log.push({ id: uid(), t: now, kind: "swap", out: [], in: into ? [{ n, q: into }] : [], cards: [{ n, q }], got: [{ n, q }], xfer: { id: xid, from: { id: src.id, name: src.name } }, grabInc: taken });
  target.updatedAt = now; save(src); save(target); return q;
}
function moveFromBin(n, targetId) {
  const target = S.decks.get(targetId); if (!target) return 0;
  const need = (incomingNeeds(target).find(x => x.n === n) || {}).q || 0; if (!need) return 0;
  const id = uid();
  const { got, froms, fromLoose, srcs } = pullFromBin(n, need, target, id); if (!got) return 0;
  const { into, taken } = takeFromIncoming(target, n, got); const now = Date.now();
  addToList(target, n, into);
  markPrinted(target, n, got);
  const e = { id, t: now, kind: "swap", out: [], in: into ? [{ n, q: into }] : [], cards: [{ n, q: got }], got: [{ n, q: got }], fromBin: { names: froms, loose: fromLoose, srcs, inc: taken } };
  target.log.push(e); target.updatedAt = now;
  save(target); return got;
}
// Undoes a move out of the card bin: the card leaves the deck (and its owned list), goes back to the bin or the
// deck that owned the spare, and back onto the incoming list.
function undoBinMove(target, e) {
  undoEntry(target, e);
  const fb = e.fromBin;
  if (fb.loose && fb.loose.length) { for (const x of fb.loose) S.loose.cards.push({ n: x.n, q: x.q, from: x.from || undefined, at: Date.now() }); S.loose.cards.forEach(c => { if (c.from === undefined) delete c.from; }); saveLoose(); }
  for (const sref of fb.srcs || []) { const src = S.decks.get(sref.deck); const se = src && src.log.find(x => x.id === sref.entry); if (se) { undoEntry(src, se); save(src); } }
  restoreIncoming(target, (e.cards[0] || {}).n, fb.inc);
}
// The other deck's half of a bin move, for the undo message.
function binPartner(d, e) {
  if (e.fromBin) { const sref = (e.fromBin.srcs || [])[0]; const dk = sref && S.decks.get(sref.deck); return dk ? { deck: dk } : null; }
  if (e.pair) { const dk = S.decks.get(e.pair.deck); const te = dk && dk.log.find(x => x.id === e.pair.entry); return te ? { deck: dk, entry: te } : null; }
  return null;
}
