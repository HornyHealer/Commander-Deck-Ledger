(() => {
"use strict";
// ---------- card index ----------
let CARDS = [];
let NAMES = [];
const IDX = new Map();
const OID = new Map(); // Scryfall oracle ID -> index in CARDS
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
function indexCards(list) {
  CARDS = Array.isArray(list) ? list : []; IDX.clear(); OID.clear();
  CARDS.forEach((r, i) => {
    if (r[5]) OID.set(r[5], i);
    const k = norm(r[0]);
    if (!IDX.has(k)) IDX.set(k, i);
    if (r[0].includes(" // ")) { const f = norm(r[0].split(" // ")[0]); if (!IDX.has(f)) IDX.set(f, i); }
  });
  NAMES = CARDS.map(r => norm(r[0]));
}
const TYPE_ORDER = ["C", "P", "B", "I", "S", "A", "E", "L", "O"];
const TYPE_NAME = { C: "Creatures", P: "Planeswalkers", B: "Battles", I: "Instants", S: "Sorceries", A: "Artifacts", E: "Enchantments", L: "Lands", O: "Other" };
const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"]);
const rec = n => { const i = IDX.get(norm(n)); return i === undefined ? null : CARDS[i]; };
const canon = n => { const r = rec(n); return r ? r[0] : n.trim(); };
const ciOf = n => { const r = rec(n); return r ? r[3] : ""; };
const typeOf = n => { const r = rec(n); return r ? r[2] : "O"; };
function cmcOf(n) {
  const r = rec(n); if (!r || !r[1]) return 0;
  let t = 0;
  for (const s of r[1].split(" // ")[0].split(" ")) { if (/^\d+$/.test(s)) t += +s; else if (s && s !== "X" && s !== "Y") t += 1; }
  return t;
}
const isBasic = n => BASICS.has(norm(n));
// Card records: [name, cost, type, colorIdentity, flags, oracleId, pairCode, copyLimit] (see scripts/build-cards.mjs)
const RULES = window.CardRules; // js/card-rules.js, shared with the card-list builder
const F = RULES.FLAG;
const flagsOf = r => (r ? (r[4] | 0) : 0);
const canLead = r => !!r && (flagsOf(r) & F.COMMANDER) > 0;
const pairOf = r => (r && r[6]) || "";
const limitOf = r => (r && r[7]) || 0;
const isCmdrPick = r => canLead(r) || pairOf(r) === "BG";
const hasRules = () => CARDS.length > 0 && CARDS[0].length >= 7; // false until the Scryfall card list is in use
const recById = id => { const i = OID.get(id); return i === undefined ? null : CARDS[i]; };
function validPair(a, b) {
  const pa = pairOf(a), pb = pairOf(b);
  if (pa === "P" && pb === "P") return true;
  if (pa.startsWith("PW:") && pb.startsWith("PW:")) return norm(pa.slice(3)) === norm(b[0]) && norm(pb.slice(3)) === norm(a[0]);
  if (pa === "FF" && pb === "FF") return true;
  if ((pa === "CB" && pb === "BG") || (pa === "BG" && pb === "CB")) return true;
  if ((pa === "DC" && pb === "TD") || (pa === "TD" && pb === "DC")) return true;
  if (pa.startsWith("PV:") && pa === pb) return true;
  return false;
}

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtShort = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const clone = o => JSON.parse(JSON.stringify(o));
const scry = n => "https://scryfall.com/search?q=" + encodeURIComponent('!"' + n + '"');
const MANA_ORDER = "WUBRG";

const ICONS = {
  back: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>',
  cut: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4.5" r="2"/><circle cx="4" cy="11.5" r="2"/><path d="M5.6 5.6 14 12M5.6 10.4 14 4"/></svg>',
  ext: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5"/></svg>',
  back2: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4 2.5 7.5 6 11"/><path d="M3 7.5h7a3.5 3.5 0 0 1 0 7H8"/></svg>',
  x: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h7"/></svg>',
  caret: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="width:12px;height:12px"><path d="m4 6 4 4 4-4"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5V5h-2.5"/></svg>',
  down: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>',
  up: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10"/></svg>',
  user: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c.8-2.8 3-4.3 5.5-4.3s4.7 1.5 5.5 4.3"/></svg>',
  stack: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.5" y="2" width="8" height="10.5" rx="1"/><path d="M2.5 4.5v9h7.5"/></svg>',
  print: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 6V2.5h7V6"/><rect x="2" y="6" width="12" height="5.5" rx="1.2"/><path d="M4.5 9.5h7v4h-7z"/></svg>',
  printed: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  tag: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 2.5h5l6 6-5 5-6-6z"/><circle cx="5.5" cy="5.5" r="1"/></svg>',
  list: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M3 8h10M3 12h6"/><path d="m11 11 1.5 1.5L15 10"/></svg>',
};

function pipsFor(cost, lg) {
  if (!cost) return "";
  const parts = cost.split(" // ").map(face => face.split(" ").filter(Boolean).map(s => {
    const c = lg ? " lg" : "";
    if (/^\d+$/.test(s)) return `<span class="pip N${c}">${s}</span>`;
    if (s.length === 1) return `<span class="pip ${s}${c}">${s}</span>`;
    const [a, b, x] = s.split("/");
    if (x === "P") return `<span class="pip${c}" title="${esc(s)}" style="background:linear-gradient(135deg,var(--mana-${a.toLowerCase()}) 50%,var(--mana-${b.toLowerCase()}) 50%)">ϕ</span>`;
    if (b === "P") return `<span class="pip ${a}${c}" title="Phyrexian">ϕ</span>`;
    if (/^\d$/.test(a)) return `<span class="pip ${b}${c}" title="${esc(s)}">${a}</span>`;
    return `<span class="pip${c}" title="${esc(s)}" style="background:linear-gradient(135deg,var(--mana-${a.toLowerCase()}) 50%,var(--mana-${b.toLowerCase()}) 50%)"></span>`;
  }).join(""));
  return `<span class="pips">${parts.join('<span class="sep">//</span>')}</span>`;
}
const ciPips = ci => ci ? `<span class="pips">${[...ci].map(c => `<span class="pip ${c} lg">${c}</span>`).join("")}</span>` : `<span class="pips"><span class="pip C lg">C</span></span>`;
function ciBand(ci) {
  const cols = ci ? [...ci].map(c => `var(--mana-${c.toLowerCase()})`) : ["var(--mana-c)"];
  return `<div class="ci-band">${cols.map(c => `<span style="background:${c}"></span>`).join("")}</div>`;
}

// ---------- list parsing ----------
const SKIP_SECTIONS = /^(sideboard|maybeboard|maybe|considering|tokens?|outside the deck|acquireboard)$/i;
function parseList(text) {
  const out = new Map(); const commanders = new Set(); let section = "main";
  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    const hdr = line.replace(/[:\s]*(\(\d+\))?\s*$/, "").trim();
    if (/^(commanders?|deck|main ?(deck|board)?|sideboard|maybeboard|maybe|considering|companion|tokens?|outside the deck|acquireboard|lands?|creatures?|instants?|sorcer(y|ies)|artifacts?|enchantments?|planeswalkers?|battles?|other)$/i.test(hdr) && !/^\d/.test(line)) {
      section = /^commanders?$/i.test(hdr) ? "commander" : SKIP_SECTIONS.test(hdr) ? "skip" : "main"; continue;
    }
    if (/^SB:\s*/i.test(line)) continue;
    if (section === "skip") continue;
    let q = 1; const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) { q = parseInt(m[1], 10); line = m[2]; }
    const tags = [...line.matchAll(/\[([^\]]*)\]/g)].map(x => x[1]).join(",");
    if (/maybeboard|sideboard|considering/i.test(tags)) continue;
    line = line.replace(/\^[^^]*\^/g, "").replace(/\[[^\]]*\]/g, "").replace(/\*[A-Za-z]+\*/g, "")
      .replace(/\s+\([A-Za-z0-9]{2,8}\)(\s+[^\s]+)?\s*$/, "").replace(/\s+#\S+$/, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const name = canon(line);
    out.set(name, (out.get(name) || 0) + q);
    if (section === "commander" || /commander/i.test(tags)) commanders.add(name);
  }
  const cards = [...out].map(([n, q]) => ({ n, q }));
  return { cards, commanders: [...commanders], unknown: cards.filter(c => !rec(c.n)).map(c => c.n) };
}

// ---------- state ----------
let SORT0 = "cost"; try { SORT0 = localStorage.getItem("ledger-sort") || "cost"; } catch {}
const S = { sort: SORT0, loose: { cards: [] }, decks: new Map(), view: "library", deckId: null, tab: "current", filter: "", printedFilter: "all", db: null, col: null, live: false, ready: false, confirm: null, dialog: null };
const writeChains = new Map();
let pendingRender = false;

function curMap(d) { return new Map(d.cur.map(c => [c.n, c.q])); }
function total(d) { return d.cur.reduce((a, c) => a + c.q, 0); }
const qsum = arr => arr.reduce((a, c) => a + c.q, 0);
function printedTotal(d) { return qsum(d.printed); }
function deckCI(d) { const s = new Set(); (d.commanders || []).forEach(n => [...ciOf(n)].forEach(c => s.add(c))); return MANA_ORDER.split("").filter(c => s.has(c)).join(""); }
function origOf(d) { return d.orig || d.printed.filter(p => p.o === 0).map(p => ({ n: p.n, q: p.q })); }
function printedMap(d) { return new Map(d.printed.map(p => [p.n, p.q])); }
function peakMap(d) {
  const cm = new Map(origOf(d).map(c => [c.n, c.q])); const peak = new Map(cm);
  for (const e of d.log) {
    for (const o of e.out || []) { const v = (cm.get(o.n) || 0) - o.q; if (v > 0) cm.set(o.n, v); else cm.delete(o.n); }
    for (const i of e.in || []) { const v = (cm.get(i.n) || 0) + i.q; cm.set(i.n, v); if (v > (peak.get(i.n) || 0)) peak.set(i.n, v); }
  }
  for (const p of d.printed) if (p.q > (peak.get(p.n) || 0)) peak.set(p.n, p.q);
  return peak;
}
function removedList(d) {
  const cm = curMap(d); const pm = printedMap(d); const rows = [];
  for (const [n, q] of peakMap(d)) { const have = cm.get(n) || 0; if (have < q) rows.push({ n, q: q - have, printed: pm.get(n) || 0 }); }
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
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const isChange = e => e.kind === "swap" || e.kind === "import";
function printCards(d, list, from) {
  const now = Date.now(); const cards = [];
  for (const x of list) { if (x.q > 0) { markPrinted(d, x.n, x.q); cards.push({ n: x.n, q: x.q }); } }
  if (!cards.length) return;
  const last = d.log[d.log.length - 1];
  if (!from && last && last.kind === "print" && !last.from && sameDay(last.t, now)) {
    for (const c of cards) { const ex = last.cards.find(y => y.n === c.n); if (ex) ex.q += c.q; else last.cards.push(c); }
    last.t = now;
  } else {
    const e = { id: uid(), t: now, kind: "print", cards }; if (from) e.from = from; d.log.push(e);
  }
  d.updatedAt = now;
}
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
  for (const d of S.decks.values()) for (const u of unprinted(d)) if (map.has(u.n)) map.get(u.n).needs.push({ id: d.id, name: d.name, q: u.q });
  return [...map.values()].sort((a, b) => a.n.localeCompare(b.n));
}
function moveFromBin(n, targetId) {
  const target = S.decks.get(targetId); if (!target) return 0;
  const r = binRows().find(x => x.n === n); if (!r) return 0;
  const need = (unprinted(target).find(x => x.n === n) || {}).q || 0;
  let left = Math.min(need, r.total); const moved = left; if (!moved) return 0;
  const froms = []; const fromLoose = [];
  for (const s of r.srcs) {
    if (!left) break; if (s.id === targetId) continue;
    if (s.loose) {
      let take = Math.min(s.q, left); const got0 = take;
      for (const c of S.loose.cards) { if (!take) break; if (c.n !== n || looseLabel(c) !== s.name) continue; const k = Math.min(c.q, take); c.q -= k; take -= k; fromLoose.push({ n, q: k, from: c.from || "" }); }
      S.loose.cards = S.loose.cards.filter(c => c.q > 0);
      froms.push(s.name); left -= got0; saveLoose(); continue;
    }
    const src = S.decks.get(s.id); const take = Math.min(s.q, left);
    unprintCards(src, [{ n, q: take }], { id: target.id, name: target.name });
    froms.push(src.name); left -= take; save(src);
  }
  const got = moved - left; if (!got) return 0;
  printCards(target, [{ n, q: got }], fromLoose.length ? { names: froms, loose: fromLoose } : { names: froms });
  save(target); return got;
}
function lastOut(d, n) {
  for (let i = d.log.length - 1; i >= 0; i--) { const e = d.log[i]; if ((e.out || []).some(o => o.n === n)) return e; }
  return null;
}
function lastIn(d, n) {
  for (let i = d.log.length - 1; i >= 0; i--) { const e = d.log[i]; if ((e.in || []).some(o => o.n === n)) return e; }
  return null;
}
function outsideCI(d, n) { const ci = deckCI(d); if (!d.commanders?.length || !rec(n)) return false; return [...ciOf(n)].some(c => !ci.includes(c)); }

function newDeck({ name, cards, commanders, printedNow }) {
  const now = Date.now();
  return {
    v: 1, id: uid(), name: name || (commanders[0] ? commanders[0].split(",")[0] : "New deck"), commanders,
    createdAt: now, updatedAt: now,
    cur: cards.map(c => ({ n: c.n, q: c.q })),
    orig: cards.map(c => ({ n: c.n, q: c.q })),
    printed: printedNow ? cards.map(c => ({ n: c.n, q: c.q, at: now, o: 0 })) : [],
    log: [{ id: uid(), t: now, kind: "create", count: cards.reduce((a, c) => a + c.q, 0) }],
    bench: { out: [], in: [], note: "" },
  };
}
function applyChange(d, outs, ins, note, kind = "swap") {
  const cm = curMap(d); const now = Date.now(); const id = uid();
  outs = outs.filter(o => o.q > 0); ins = ins.filter(o => o.q > 0);
  for (const o of outs) { const v = (cm.get(o.n) || 0) - o.q; if (v > 0) cm.set(o.n, v); else cm.delete(o.n); }
  for (const i of ins) cm.set(i.n, (cm.get(i.n) || 0) + i.q);
  const order = d.cur.map(c => c.n).filter(n => cm.has(n));
  for (const n of cm.keys()) if (!order.includes(n)) order.push(n);
  d.cur = order.map(n => ({ n, q: cm.get(n) }));
  d.commanders = (d.commanders || []).filter(n => cm.has(n));
  const e = { id, t: now, kind, out: outs, in: ins };
  if (note && note.trim()) e.note = note.trim();
  d.log.push(e); d.updatedAt = now;
}
function undoLast(d) {
  const e = d.log[d.log.length - 1]; if (!e || e.kind === "create") return;
  const cm = curMap(d);
  for (const i of e.in || []) { const v = (cm.get(i.n) || 0) - i.q; if (v > 0) cm.set(i.n, v); else cm.delete(i.n); }
  for (const o of e.out || []) cm.set(o.n, (cm.get(o.n) || 0) + o.q);
  const order = d.cur.map(c => c.n).filter(n => cm.has(n));
  for (const n of cm.keys()) if (!order.includes(n)) order.push(n);
  d.cur = order.map(n => ({ n, q: cm.get(n) }));
  d.printed = d.printed.filter(p => p.by !== e.id);
  if (e.kind === "print" && e.from && e.from.loose) { e.from.loose.forEach(x => S.loose.cards.push({ n: x.n, q: x.q, from: x.from, at: Date.now() })); saveLoose(); }
  if (e.kind === "print") for (const c of e.cards || []) { const p = d.printed.find(y => y.n === c.n); if (p) { p.q -= c.q; if (p.q <= 0) d.printed = d.printed.filter(y => y !== p); } }
  if (e.kind === "unprint") for (const c of e.cards || []) { const p = d.printed.find(y => y.n === c.n); if (p) p.q += c.q; else d.printed.push({ n: c.n, q: c.q, at: c.at || Date.now(), o: c.o ?? 1 }); }
  d.log.pop(); d.updatedAt = Date.now();
}

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
  for (const d of S.decks.values()) if (syncDeckIds(d)) changed = true;
  if (changed) persist();
}
window.addEventListener("pagehide", () => { if (persistTimer) { clearTimeout(persistTimer); persistNow(); } });
window.addEventListener("storage", e => { if (e.key === STORE_KEY && !CLOUD.user) { loadStore(); safeRender(); } });
function cardLists(d) {
  const out = [d.cur, d.orig, d.printed, d.bench && d.bench.out, d.bench && d.bench.in];
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
  return new Promise(resolve => {
    let settled = false; const done = () => { if (!settled) { settled = true; resolve(); } };
    setTimeout(done, 4000); // don't hold the page if Firebase is slow to answer
    Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]).then(([appM, authM, fsM]) => {
      const app = appM.initializeApp(cfg);
      const auth = authM.getAuth(app);
      let db;
      try { db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) }); }
      catch { db = fsM.getFirestore(app); }
      CLOUD.api = { authM, fsM, auth, db };
      authM.onAuthStateChanged(auth, user => { onUser(user); done(); });
    }).catch(() => { CLOUD.failed = true; done(); safeRender(); });
  });
}
function stopCloud() { CLOUD.unsubs.forEach(u => { try { u(); } catch {} }); CLOUD.unsubs = []; synced.clear(); syncedBinRev = 0; CLOUD.loaded = CLOUD.serverDecks = CLOUD.serverBin = CLOUD.migrated = false; }
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
  CLOUD.unsubs.push(fsM.onSnapshot(fsM.collection(db, "users", uid, "decks"), { includeMetadataChanges: true }, snap => {
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id;
      if (ch.type === "removed") { if (!ch.doc.metadata.hasPendingWrites) { S.decks.delete(id); synced.delete(id); } continue; }
      if (ch.doc.metadata.hasPendingWrites) continue; // our own change on its way to the server
      const data = ch.doc.data(); if (!data || !Array.isArray(data.cur)) continue;
      const local = S.decks.get(id);
      if (local && (local.rev || 0) > (data.rev || 0)) continue;
      const d = normalizeDeck(Object.assign({}, data, { id }));
      syncDeckIds(d); S.decks.set(id, d); synced.set(id, d.rev || 0);
    }
    CLOUD.loaded = true;
    if (!snap.metadata.fromCache) CLOUD.serverDecks = true;
    maybeMigrate(); safeRender();
  }, cloudError));
  CLOUD.unsubs.push(fsM.onSnapshot(CLOUD.binRef, { includeMetadataChanges: true }, snap => {
    if (!snap.metadata.hasPendingWrites) {
      const data = snap.exists() ? snap.data() : null;
      if (data && Array.isArray(data.cards) && (data.rev || 0) >= (S.loose.rev || 0)) { S.loose = data; syncBinIds(); syncedBinRev = data.rev || 0; }
    }
    if (!snap.metadata.fromCache) CLOUD.serverBin = true;
    maybeMigrate(); safeRender();
  }, cloudError));
  if (S.ready) render();
}
function cloudError(err) {
  const code = err && err.code || "";
  toast(code === "permission-denied" ? "Your account's data couldn't be read. Firebase's security rules may not be set up yet." : "Lost the connection to your account. Changes are kept and will sync when it's back.");
}
// The first time someone signs in on a browser, decks saved there move into their account.
function maybeMigrate() {
  if (CLOUD.migrated || !CLOUD.serverDecks || !CLOUD.serverBin) return;
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
    S.decks.set(d.id, d); synced.delete(d.id); moved++;
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
function cloudFlush() {
  if (!CLOUD.user || !CLOUD.api) return;
  const { fsM, db } = CLOUD.api; const uid = CLOUD.user.uid;
  for (const d of S.decks.values()) {
    if (synced.has(d.id) && synced.get(d.id) === (d.rev || 0)) continue;
    synced.set(d.id, d.rev || 0);
    cloudWrite(fsM.setDoc(fsM.doc(db, "users", uid, "decks", d.id), forCloud(d)));
  }
  for (const id of [...synced.keys()]) if (!S.decks.has(id)) { synced.delete(id); cloudWrite(fsM.deleteDoc(fsM.doc(db, "users", uid, "decks", id))); }
  if ((S.loose.rev || 0) !== syncedBinRev) { syncedBinRev = S.loose.rev || 0; cloudWrite(fsM.setDoc(CLOUD.binRef, forCloud(S.loose))); }
}
function syncText() {
  if (!CLOUD.pending) return "Synced";
  return navigator.onLine === false ? `Offline · ${CLOUD.pending} waiting` : "Saving…";
}
function updateSyncChip() { const el = $("#sync-status"); if (el) { el.textContent = syncText(); el.classList.toggle("busy", CLOUD.pending > 0); } }
window.addEventListener("online", updateSyncChip); window.addEventListener("offline", updateSyncChip);
async function signIn() {
  if (!CLOUD.api) return toast("Sign-in isn't available right now. Check your connection and reload.");
  const { authM, auth } = CLOUD.api; const provider = new authM.GoogleAuthProvider();
  try { await authM.signInWithPopup(auth, provider); }
  catch (e) {
    const code = e && e.code || "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") { try { await authM.signInWithRedirect(auth, provider); } catch {} return; }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    toast(code === "auth/unauthorized-domain" ? "This website isn't on Firebase's list of authorized domains yet." : code === "auth/network-request-failed" ? "Couldn't reach Google. Check your connection and try again." : "Couldn't sign in. Try again.");
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
  if (CLOUD.failed) return `<span class="sync-chip warn" title="Firebase didn't load">Sync unavailable</span>`;
  if (!CLOUD.authReady) return "";
  if (!CLOUD.user) return `<button class="btn" data-act="signin">${ICONS.user}Sign in</button>`;
  const initials = (CLOUD.user.name || CLOUD.user.email || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return `<span id="sync-status" class="sync-chip${CLOUD.pending ? " busy" : ""}" role="status">${syncText()}</span><div class="menuwrap"><button class="btn acct" data-act="acct-menu" aria-haspopup="menu" aria-expanded="${CLOUD.menu}" title="${esc(CLOUD.user.email)}"><span class="avatar">${esc(initials)}</span><span class="acct-name">${esc(CLOUD.user.name || CLOUD.user.email)}</span></button>${CLOUD.menu ? `<div class="menu acct-menu" role="menu"><span class="menu-note">${esc(CLOUD.user.email)}</span><button role="menuitem" data-act="signout">Sign out</button></div>` : ""}</div>`;
}

// ---------- Scryfall: card images and lookups for cards missing from the built-in list ----------
const SCRY = "https://api.scryfall.com/cards/named?exact=";
const front = n => String(n).split(" // ")[0];
const imgUrl = (n, v) => SCRY + encodeURIComponent(front(n)) + "&format=image&version=" + (v || "normal");
let EXTRA = {}; try { EXTRA = JSON.parse(localStorage.getItem("cdl-cards-extra") || "{}") || {}; } catch {}
function addRec(r, alias) {
  let i = IDX.get(norm(r[0]));
  if (i === undefined) { i = CARDS.push(r) - 1; const k = norm(r[0]); IDX.set(k, i); NAMES.push(k); if (r[0].includes(" // ")) { const f = norm(front(r[0])); if (!IDX.has(f)) IDX.set(f, i); } if (r[5] && !OID.has(r[5])) OID.set(r[5], i); }
  if (alias && !IDX.has(alias)) IDX.set(alias, i);
}
function loadExtraCards() { for (const [alias, r] of Object.entries(EXTRA)) if (Array.isArray(r) && r.length >= 5) addRec(r, alias); }
function scryCost(s) { return (s || "").split(" // ").map(f => (f.match(/\{([^}]+)\}/g) || []).map(x => x.slice(1, -1)).join(" ")).join(" // "); }
function scryRec(c) {
  if (!c || !c.name) return null;
  const faces = c.card_faces || [];
  const cost = c.layout === "split" && faces.length ? faces.map(f => f.mana_cost || "").join(" // ") : (faces.length && faces[0].mana_cost !== undefined ? faces[0].mana_cost : c.mana_cost);
  const typeLine = c.type_line || (faces[0] && faces[0].type_line) || "";
  const frontType = faces.length && faces[0].type_line ? faces[0].type_line : front(typeLine);
  const words = frontType.split(/[\s—-]+/);
  let tc = "O";
  for (const [w, code] of [["Creature", "C"], ["Planeswalker", "P"], ["Battle", "B"], ["Land", "L"], ["Instant", "I"], ["Sorcery", "S"], ["Artifact", "A"], ["Enchantment", "E"]]) if (words.includes(w)) { tc = code; break; }
  const ci = MANA_ORDER.split("").filter(x => (c.color_identity || []).includes(x)).join("");
  const text = [c.oracle_text, ...faces.map(f => f.oracle_text)].filter(Boolean).join("\n");
  const legal = (c.legalities || {}).commander;
  let flags = 0;
  if ((words.includes("Legendary") && words.includes("Creature")) || /can be your commander/i.test(text)) flags |= F.COMMANDER;
  if (legal === "banned") flags |= F.BANNED;
  if (legal === "not_legal") flags |= F.NOT_LEGAL;
  if (c.game_changer === true) flags |= F.GAME_CHANGER;
  flags |= RULES.textFlags(text, tc);
  const r = [c.name, scryCost(cost), tc, ci, flags, c.oracle_id || "", RULES.pairCode(text, frontType)];
  const limit = RULES.copyLimit(text); if (limit) r.push(limit);
  return r;
}
const looked = new Set(); let lookTimer = null, looking = false;
function queueLookups() { clearTimeout(lookTimer); lookTimer = setTimeout(runLookups, 500); }
async function runLookups() {
  if (looking) return queueLookups();
  const names = new Set();
  for (const d of S.decks.values()) { d.cur.forEach(c => names.add(c.n)); d.printed.forEach(p => names.add(p.n)); (d.bench && d.bench.in || []).forEach(x => names.add(x.n)); }
  (S.loose.cards || []).forEach(c => names.add(c.n));
  const todo = [...names].filter(n => !rec(n) && !looked.has(norm(n))).slice(0, 30);
  if (!todo.length) return;
  looking = true; let added = 0;
  for (const n of todo) {
    looked.add(norm(n));
    try {
      const res = await fetch(SCRY + encodeURIComponent(front(n)), { headers: { Accept: "application/json" } });
      if (res.ok) { const r = scryRec(await res.json()); if (r) { addRec(r, norm(n)); EXTRA[norm(n)] = r; added++; } }
    } catch {}
    await new Promise(ok => setTimeout(ok, 120));
  }
  looking = false;
  if (added) {
    try { localStorage.setItem("cdl-cards-extra", JSON.stringify(EXTRA)); } catch {}
    let changed = syncBinIds(); for (const d of S.decks.values()) if (syncDeckIds(d)) changed = true;
    if (changed) persist();
    safeRender();
  }
}

// hover previews (mouse) and tap previews (touch)
const canHover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
const PREVIEW_SEL = ".row .nm > span:first-child, .brow .nm, .swap .o, .swap .i, .plines span, .sugg button:not(.free-row) .nm";
function cardNameFrom(el) {
  let s = "";
  for (const node of el.childNodes) { if (node.nodeType === 3) s += node.textContent; else break; }
  s = (s || el.textContent || "").trim().replace(/^\d+x\s+/, "").replace(/\s+×\d+$/, "").trim();
  return s;
}
let pv = null, pvTimer = null, pvFor = null;
function pvEl() {
  if (!pv) { pv = document.createElement("div"); pv.className = "cardpv"; pv.hidden = true; pv.innerHTML = '<img alt="">'; document.body.appendChild(pv); pv.querySelector("img").addEventListener("error", () => { pv.hidden = true; }); }
  return pv;
}
function placePv(x, y) {
  const p = pvEl(); const w = 250, h = 349, pad = 16;
  let left = x + 22, top = y - 60;
  if (left + w + pad > innerWidth) left = x - w - 22;
  if (top + h + pad > innerHeight) top = innerHeight - h - pad;
  if (top < pad) top = pad;
  p.style.left = Math.max(pad, left) + "px"; p.style.top = top + "px";
}
function showPv(name, x, y) {
  const p = pvEl(); const img = p.querySelector("img");
  const url = imgUrl(name); if (img.getAttribute("src") !== url) img.src = url;
  img.alt = name; placePv(x, y); p.hidden = false;
}
if (canHover) {
  document.addEventListener("mouseover", e => {
    const el = e.target.closest && e.target.closest(PREVIEW_SEL); if (!el || el === pvFor) return;
    pvFor = el; clearTimeout(pvTimer);
    const n = cardNameFrom(el); if (!n) return;
    const x = e.clientX, y = e.clientY;
    pvTimer = setTimeout(() => { if (pvFor === el) showPv(n, x, y); }, 140);
  });
  document.addEventListener("mousemove", e => { if (pv && !pv.hidden) placePv(e.clientX, e.clientY); });
  document.addEventListener("mouseout", e => {
    if (!pvFor) return; const to = e.relatedTarget;
    if (to && pvFor.contains(to)) return;
    pvFor = null; clearTimeout(pvTimer); if (pv) pv.hidden = true;
  });
  document.addEventListener("scroll", () => { if (pv) pv.hidden = true; pvFor = null; }, true);
} else {
  document.addEventListener("click", e => {
    if (pv && !pv.hidden) { pv.hidden = true; pv.classList.remove("tap"); return; }
    const el = e.target.closest && e.target.closest(".row .nm > span:first-child"); if (!el) return;
    const n = cardNameFrom(el); if (!n) return;
    const p = pvEl(); p.classList.add("tap"); const img = p.querySelector("img"); img.src = imgUrl(n); img.alt = n; p.style.left = ""; p.style.top = ""; p.hidden = false;
  });
}

function safeRender() {
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && $("#app").contains(a)) { pendingRender = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (pendingRender) setTimeout(() => { const a = document.activeElement; if (!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) { pendingRender = false; render(); } }, 0); });

// ---------- routing ----------
function go(view, deckId) {
  if (deckId !== S.deckId) { S.snap = null; S.cmp = null; S.roleFilter = null; S.roleEdit = null; S.showBracket = false; }
  S.view = view; S.deckId = deckId || null; S.filter = ""; S.confirm = null;
  try { history.replaceState(null, "", view === "deck" ? "#deck-" + deckId : view === "all" ? "#all-cards" : location.pathname + location.search); } catch {}
  render(); window.scrollTo(0, 0);
}
function fromHash() { if (location.hash === "#all-cards") { S.view = "all"; return; } const m = (location.hash || "").match(/^#deck-([A-Za-z0-9_-]+)$/); if (m) { S.view = "deck"; S.deckId = m[1]; } }

// ---------- render ----------
function render() {
  const app = $("#app");
  let html = `<div class="top"><div class="brand"><h1>Commander Deck Ledger</h1><span class="barcode" aria-hidden="true"></span></div>`;
  html += `<div class="topacts">${accountHtml()}<button class="btn${S.view === "all" ? " on" : ""}" data-act="${S.view === "all" ? "home" : "all"}" aria-pressed="${S.view === "all"}">${ICONS.stack}All cards</button>${S.view === "library" ? `<button class="btn primary" data-act="new">${ICONS.plus}New deck</button>` : ""}</div>`;
  html += `</div>`;
  if (S.cardsFailed) html += `<div class="notice">The card list didn't load, so mana costs, types and colors are missing. Check your connection and reload the page.</div>`;
  if (CLOUD.enabled && CLOUD.authReady && !CLOUD.user && !CLOUD.failed && S.view === "library") html += `<div class="signin-note"><div><b>Sync your decks</b> Sign in with Google to keep your decks in step between your phone and computer.${S.decks.size || (S.loose.cards || []).length ? " The decks saved in this browser move into your account the first time you sign in." : ""}</div><button class="btn primary" data-act="signin">${ICONS.user}Sign in with Google</button></div>`;
  if (S.ready && !S.live && !CLOUD.user) html += `<div class="notice">Your browser is blocking storage for this site, so changes last only until you close the page. Export a backup before you leave, or allow site data for this page in your browser settings.</div>`;
  const d = S.deckId && S.decks.get(S.deckId);
  if (CLOUD.user && !CLOUD.loaded) html += `<div class="empty"><h2>Loading your decks…</h2><p>Getting your library from your account.</p></div>`;
  else if (S.view === "all") html += renderAll();
  else if (S.view === "deck" && d) html += renderDeck(d);
  else if (S.view === "deck" && S.ready) { S.view = "library"; html += renderLibrary(); }
  else html += renderLibrary();
  html += `<footer class="site-foot"><p>${CLOUD.user ? "Your decks are saved to your account and sync across your devices." : "Your decks are saved in this browser only. Use <b>Export backup</b> to keep a copy or move them to another device."}</p><p>Card data and images from <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>. Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p></footer>`;
  app.innerHTML = html;
  if (S.dialog) renderDialog();
}

function renderLibrary() {
  if (!S.ready) return `<div class="empty"><h2>Opening your library…</h2><p>Your decks load here in a moment.</p></div>`;
  const decks = [...S.decks.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!decks.length) return `<div class="empty"><h2>No decks yet</h2><p>Paste a list the same way you'd import it into Archidekt, one card per line like <span class="mono">1 Sol Ring</span>. The first list becomes the deck's original list, every swap after that goes into its history, and you mark cards as printed once you have the copies.</p><div class="emptybtns"><button class="btn primary" data-act="new">${ICONS.plus}Add your first deck</button><button class="btn" data-act="example">Try an example deck</button></div><div class="emptybtns">${backupBtns(true)}</div></div>${renderBin()}`;
  return `<div class="sect"><span>Decks</span><b>${String(decks.length).padStart(2, "0")}</b></div><div class="libtools">${backupBtns()}</div>${backupWarning()}<div class="lib-grid">${decks.map((d, i) => {
    const ci = deckCI(d); const changes = d.log.filter(isChange).length; const t = total(d); const toPrint = qsum(unprinted(d));
    const cmd = (d.commanders && d.commanders.length) ? d.commanders.join(" & ") : d.name;
    const arch = d.link ? `<a class="arch" href="${esc(d.link)}" target="_blank" rel="noopener">Archidekt ${ICONS.ext}</a>` : `<button class="arch add" data-editlink="${esc(d.id)}">${ICONS.plus}Archidekt link</button>`;
    const art = artNameOf(d);
    return `<div class="deckbox${art ? " has-art" : ""}" role="link" tabindex="0" aria-label="Open ${esc(d.name)}" data-open="${esc(d.id)}">${art ? `<img class="tile-art" src="${esc(artSrcOf(d))}" alt="" loading="lazy" style="object-position:center ${esc(d.artPos || "center")}">` : ""}${ciBand(ci)}<span class="tile-no">${String(i + 1).padStart(2, "0")}</span><div class="body">
      <div class="cmd">${esc(cmd)}${d.example ? '<span class="tag-ex">Example</span>' : ""}</div>
      <div class="dname">${esc(d.name)}</div>
      ${d.desc ? `<div class="ddesc">${esc(d.desc)}</div>` : ""}
      <div class="pipline">${ciPips(ci)}<span class="bpill" title="Bracket estimate">Bracket ${esc(bracketOf(d.cur).label)}</span></div>
      <div class="stats"><span><b>${t}</b> in deck</span><span><b>${printedTotal(d)}</b> printed</span><span><b>${changes}</b> changes</span></div>
      ${toPrint ? `<div class="tp-pill"><b class="mono">${toPrint}</b> to print</div>` : `<div class="tp-pill done">All printed</div>`}
      <div class="stats" style="margin-top:0">Last change ${fmtShort(d.updatedAt)}${(() => { const n = legality(d).length; return n ? ` · <span class="rule-issues">${n} rule issue${n === 1 ? "" : "s"}</span>` : ""; })()}</div>
      <div class="tile-foot">${arch}</div>
    </div></div>`;
  }).join("")}</div>${renderBin()}`;
}
function ownedRows() {
  const map = new Map();
  const row = n => { if (!map.has(n)) map.set(n, { n, printed: 0, inDecks: [], deckQ: 0, toPrint: 0, bin: 0 }); return map.get(n); };
  for (const d of S.decks.values()) {
    for (const p of d.printed) if (p.q > 0) row(p.n).printed += p.q;
    for (const c of d.cur) { const r = row(c.n); r.inDecks.push({ id: d.id, name: d.name, q: c.q }); r.deckQ += c.q; }
    for (const u of unprinted(d)) row(u.n).toPrint += u.q;
  }
  for (const c of S.loose.cards || []) if (c.q > 0) row(c.n).printed += c.q;
  for (const b of binRows()) row(b.n).bin = b.total;
  return [...map.values()];
}
function renderAll() {
  const all = ownedRows(); const chip = S.allChip || "all"; const f = norm(S.allFilter || "");
  const qOf = r => chip === "toprint" ? r.toPrint : chip === "bin" ? r.bin : chip === "all" ? Math.max(r.printed, r.deckQ) : r.printed;
  const types = S.allTypes || new Set(), cols = S.allColors || new Set();
  const facet = r => {
    if (types.size && !types.has(typeOf(r.n))) return false;
    if (cols.size) {
      const ci = ciOf(r.n); const want = [...cols].filter(c => c !== "C"); const wantC = cols.has("C");
      const mode = S.colorMode || "incl"; let hit;
      if (!want.length) hit = !ci;
      else if (mode === "exact") hit = ci.length === want.length && want.every(c => ci.includes(c));
      else if (mode === "most") hit = [...ci].every(c => want.includes(c));
      else hit = want.every(c => ci.includes(c));
      if (!hit && !(wantC && !ci)) return false;
    }
    return true;
  };
  const keep = r => facet(r) && (chip === "printed" ? r.printed > 0 : chip === "toprint" ? r.toPrint > 0 : chip === "bin" ? r.bin > 0 : true);
  const sum = (fn, arr) => arr.reduce((a, r) => a + fn(r), 0);
  const counts = { all: sum(r => Math.max(r.printed, r.deckQ), all), printed: sum(r => r.printed, all), toprint: sum(r => r.toPrint, all), bin: sum(r => r.bin, all) };
  const shown = all.filter(r => keep(r) && (!f || norm(r.n).includes(f)));
  S.allShown = shown.map(r => ({ n: r.n, q: qOf(r) }));
  S.allUnprinted = all.filter(r => r.toPrint > 0 && facet(r) && (!f || norm(r.n).includes(f))).map(r => ({ n: r.n, q: r.toPrint }));
  const shownTotal = S.allShown.reduce((a, x) => a + x.q, 0), unpTotal = S.allUnprinted.reduce((a, x) => a + x.q, 0);
  const chipB = (id, label) => `<button class="chip${chip === id ? " on" : ""}" data-allchip="${id}">${label} ${counts[id]}</button>`;
  let h = `<button class="crumb" data-act="home">${ICONS.back}All decks</button>
  <div class="dhead"><div><div class="eyebrow"><span class="label">Collection</span></div><h2>All cards</h2><div class="dn">${all.length} unique cards across ${S.decks.size} deck${S.decks.size === 1 ? "" : "s"} and the bin</div></div></div>
  <div class="summary">
    <div class="k"><span class="label">Printed</span><span class="v">${counts.printed}</span></div>
    <div class="k"><span class="label">In decks</span><span class="v">${sum(r => r.deckQ, all)}</span></div>
    <div class="k"><span class="label">In bin</span><span class="v">${counts.bin}</span></div>
    <div class="k"><span class="label">To print</span><span class="v ${counts.toprint ? "warn" : "ok"}">${counts.toprint}</span></div>
  </div>
  <div class="toolbar"><input class="field" id="f-all" type="search" placeholder="Find a card in your collection" value="${esc(S.allFilter || "")}" aria-label="Find a card in your collection"><label class="sortsel"><span class="label">Sort</span><select class="field" id="s-sort" aria-label="Sort cards within each type">${[["cost", "Cost"], ["name", "Name A–Z"], ["color", "Color"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><div class="menuwrap"><button class="btn sm" data-act="copy-menu" aria-haspopup="menu" aria-expanded="${!!S.menu}">${ICONS.copy}Copy ${ICONS.caret}</button>${S.menu ? `<div class="menu" role="menu"><button role="menuitem" data-act="copy-all" ${shownTotal ? "" : "disabled"}>This list<span class="mono muted">${shownTotal}</span></button><button role="menuitem" data-act="copy-all-unp" ${unpTotal ? "" : "disabled"}>Unprinted only<span class="mono muted">${unpTotal}</span></button></div>` : ""}</div>
    <div class="chips" style="flex-basis:100%">${chipB("all", "Everything")}${chipB("printed", "Printed")}${chipB("toprint", "To print")}${chipB("bin", "In bin")}</div></div>
  <div class="facets">
    <div class="facet"><span class="label">Type</span><div class="chips">${TYPE_ORDER.filter(g => all.some(r => typeOf(r.n) === g)).map(g => `<button class="chip${types.has(g) ? " on" : ""}" data-alltype="${g}" aria-pressed="${types.has(g)}">${TYPE_NAME[g]}</button>`).join("")}</div></div>
    <div class="facet"><span class="label">Color</span><div class="chips">${[..."WUBRG"].map(c => `<button class="chip colorchip${cols.has(c) ? " on" : ""}" data-allcolor="${c}" aria-pressed="${cols.has(c)}" title="${({ W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" })[c]}"><span class="pip ${c}">${c}</span></button>`).join("")}<button class="chip colorchip${cols.has("C") ? " on" : ""}" data-allcolor="C" aria-pressed="${cols.has("C")}"><span class="pip C">C</span>Colorless</button></div><div class="chips modeseg" role="group" aria-label="Color match">${[["incl", "Including"], ["exact", "Exactly"], ["most", "At most"]].map(([v, l]) => `<button class="chip${(S.colorMode || "incl") === v ? " on" : ""}" data-colormode="${v}" aria-pressed="${(S.colorMode || "incl") === v}" title="${v === "incl" ? "Cards that have every selected color, and maybe more" : v === "exact" ? "Cards whose colors are exactly the selected ones" : "Cards that use only the selected colors (colorless included)"}">${l}</button>`).join("")}</div></div>
    ${types.size || cols.size ? `<button class="btn sm ghost" data-act="facet-clear">Clear filters</button>` : ""}
  </div>`;
  if (!all.length) return h + `<div class="empty"><h2>No cards yet</h2><p>Add a deck or put printed cards in the card bin, and they show up here.</p></div>`;
  if (!shown.length) return h + `<p class="muted">No cards match${f ? ` “${esc(S.allFilter)}”` : ""} in this view.</p>`;
  const groups = new Map();
  for (const r of shown) { const g = typeOf(r.n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  h += `<div class="groups all-list">`;
  for (const g of TYPE_ORDER) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${TYPE_NAME[g]}<span class="mono">${arr.reduce((a, r) => a + qOf(r), 0)}</span></h3>${arr.map(r => {
      const rc = rec(r.n);
      const where = [...r.inDecks.map(x => `<button class="deckref" data-open="${esc(x.id)}">${esc(x.name)}${x.q > 1 ? " ×" + x.q : ""}</button>`), r.bin ? `<span>Bin${r.bin > 1 ? " ×" + r.bin : ""}</span>` : ""].filter(Boolean).join("");
      const flags = (r.toPrint ? `<span class="flag warn">${r.toPrint} to print</span>` : "") + (!r.inDecks.length && r.bin ? '<span class="flag plain">Bin only</span>' : "") + (!rc ? '<span class="flag warn">Unrecognized</span>' : "");
      return `<div class="row"><span class="q">${qOf(r)}</span><span class="nm"><span>${esc(r.n)}</span>${flags}<small class="where">${r.printed ? `${r.printed} printed` : "Not printed"}${where ? " · " : ""}${where}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts"><a class="iconbtn" href="${scry(r.n)}" target="_blank" rel="noopener" aria-label="Open ${esc(r.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
    }).join("")}</div>`;
  }
  return h + `</div>`;
}
function artSrcOf(d) { const a = artNameOf(d); if (!a) return ""; return d.artUrl && d.artFor === a ? d.artUrl : imgUrl(a, "art_crop"); }
const PRINTS = new Map();
function loadPrintings(name) {
  if (PRINTS.has(name)) return;
  PRINTS.set(name, { state: "loading", list: [] });
  const q = '!"' + front(name).replace(/"/g, "") + '"';
  fetch("https://api.scryfall.com/cards/search?unique=art&order=released&dir=desc&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(j => {
      const list = (j.data || []).map(c => {
        const iu = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {};
        return iu.art_crop ? { id: c.id, url: iu.art_crop, set: String(c.set || "").toUpperCase(), setName: c.set_name || "", year: String(c.released_at || "").slice(0, 4), artist: c.artist || "" } : null;
      }).filter(Boolean);
      PRINTS.set(name, { state: "ok", list });
    })
    .catch(() => PRINTS.set(name, { state: "err", list: [] }))
    .finally(() => { if (S.dialog && S.dialog.kind === "edit") { keepDialogFields(); renderDialog(); } });
}
function printingsHtml(d, art) {
  const p = PRINTS.get(art);
  if (!p) setTimeout(() => loadPrintings(art), 0);
  const cur = d.artUrl && d.artFor === art ? d.artId : "";
  let body;
  if (!p || p.state === "loading") body = `<p class="arthint">Loading printings from Scryfall…</p>`;
  else if (p.state === "err") body = `<p class="arthint">Couldn't load printings from Scryfall. <button class="btn sm ghost" data-dlg="prints-retry">Try again</button></p>`;
  else if (!p.list.length) body = `<p class="arthint">Scryfall has no other artwork for this card.</p>`;
  else body = `<div class="prints" role="group" aria-label="Choose the artwork"><button type="button" class="print${cur ? "" : " on"}" data-print-art="" aria-pressed="${!cur}"><img src="${esc(imgUrl(art, "art_crop"))}" alt="" loading="lazy"><span><b>Default</b>Scryfall's pick</span></button>${p.list.map(x => `<button type="button" class="print${cur === x.id ? " on" : ""}" data-print-art="${esc(x.id)}" aria-pressed="${cur === x.id}" title="${esc(x.setName)} · ${esc(x.artist)}"><img src="${esc(x.url)}" alt="" loading="lazy"><span><b>${esc(x.set)} · ${esc(x.year)}</b>${esc(x.artist)}</span></button>`).join("")}</div>`;
  return `<div class="printwrap"><span class="label">Artwork${p && p.list.length ? ` · ${p.list.length} version${p.list.length === 1 ? "" : "s"}` : ""}</span>${body}</div>`;
}
function artNameOf(d) { if (d.artOff) return null; if (d.artCard && curMap(d).has(d.artCard)) return d.artCard; return (d.commanders || [])[0] || null; }
function backupBtns(onlyImport) {
  const st = backupStatus();
  const chip = onlyImport ? "" : CLOUD.user ? `<span class="backup-chip" title="Your decks are stored in your account.">Saved to your account</span>` : `<span class="backup-chip${st.stale ? " warn" : ""}" title="Backups are files you download. Keep one somewhere safe.">Last backup: ${st.last ? agoText(st.days) : "never"}</span>`;
  return `${chip}${onlyImport ? "" : `<button class="btn sm" data-act="export">${ICONS.down}Export backup</button>`}<label class="btn sm" for="imp-file">${ICONS.up}Import backup</label><input type="file" id="imp-file" accept=".json,application/json" hidden>`;
}
function backupWarning() {
  if (CLOUD.user) return "";
  const st = backupStatus(); if (!st.stale || st.snoozed) return "";
  return `<div class="backup-warn" role="status"><span><b>Back up your decks.</b> ${st.last ? `Your last backup was ${agoText(st.days)}, and you've made changes since.` : "You haven't made a backup yet."} Your decks are saved only in this browser, so clearing its data or switching devices would lose them.</span><span class="grow"></span><button class="btn sm primary" data-act="export">${ICONS.down}Export backup</button><button class="btn sm ghost" data-act="backup-snooze">Remind me later</button></div>`;
}
function backupData() {
  const decks = [...S.decks.values()].map(d => { const c = clone(d); delete c.art; delete c.rev; c.bench = { out: [], in: [], note: "" }; return c; });
  return { app: "commander-deck-ledger", version: 1, exported: new Date().toISOString(), decks, bin: { cards: clone(S.loose.cards || []) } };
}
function exportBackup() {
  const text = JSON.stringify(backupData(), null, 1);
  const now = new Date(); const name = "commander-ledger-backup-" + [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-") + ".json";
  try {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    lsSetNum(BACKUP_KEY, Date.now()); render();
    toast("Backup downloaded. Keep the file somewhere safe, like cloud storage.");
  } catch { openDialog({ kind: "copy", text, label: "Backup" }); }
}
function readBackup(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let data = null; try { data = JSON.parse(fr.result); } catch {}
    if (!data || data.app !== "commander-deck-ledger" || !Array.isArray(data.decks)) return toast("That file isn't a Commander Deck Ledger backup.");
    const decks = data.decks.filter(d => d && d.id && Array.isArray(d.cur) && Array.isArray(d.printed) && Array.isArray(d.log));
    const bin = data.bin && Array.isArray(data.bin.cards) ? data.bin.cards.filter(c => c && c.n && c.q > 0) : [];
    openDialog({ kind: "import", decks, bin, file: file.name });
  };
  fr.onerror = () => toast("Couldn't read that file.");
  fr.readAsText(file);
}
function applyImport(dl) {
  const wasEmpty = !S.decks.size && !(S.loose.cards || []).length;
  for (const raw of dl.decks) {
    const d = clone(raw); delete d.art;
    if (!d.orig) d.orig = d.printed.filter(p => p.o === 0).map(p => ({ n: p.n, q: p.q }));
    d.bench = d.bench && Array.isArray(d.bench.out) ? d.bench : { out: [], in: [], note: "" };
    syncDeckIds(d); touch(d); S.decks.set(d.id, d);
  }
  for (const c of dl.bin) {
    const ex = S.loose.cards.find(x => x.n === c.n && (x.from || "") === (c.from || ""));
    if (ex) ex.q = c.q; else S.loose.cards.push({ n: c.n, q: c.q, from: c.from, at: c.at || Date.now() });
  }
  S.loose.rev = Date.now(); syncBinIds(); persist(); queueLookups();
  if (wasEmpty) lsSetNum(BACKUP_KEY, Date.now()); // the imported file is itself an up-to-date backup
}
function renderBin() {
  const rows = binRows(); const tot = rows.reduce((a, r) => a + r.total, 0); const f = norm(S.binFilter || "");
  const addBtn = `<button class="btn sm primary" data-act="bin-add">${ICONS.plus}Add cards</button>`;
  let h = `<section class="bin"><div class="bin-head"><div><h2>Card bin <span class="mono muted" style="font-size:15px">${tot}</span></h2><p class="muted">Printed copies that aren't in any deck's current list.</p></div>`;
  if (!rows.length) return h + `<div class="bin-tools">${addBtn}</div></div><p class="muted bin-empty">Empty. When you cut a card you've already printed, it lands here. You can also add printed cards you have lying around.</p></section>`;
  const needed = rows.filter(r => r.needs.length).length;
  h += `<div class="bin-tools"><input class="field" id="f-bin" type="search" placeholder="Find a card in the bin" value="${esc(S.binFilter || "")}" aria-label="Find a card in the bin"><button class="btn sm" data-act="copy-bin">${ICONS.copy}Copy list</button>${addBtn}</div></div>`;
  if (needed) h += `<div class="toprint" style="margin-bottom:12px"><span><b class="mono">${needed}</b> card${needed > 1 ? "s" : ""} in the bin ${needed > 1 ? "are" : "is"} waiting to be printed for a deck. Move ${needed > 1 ? "them" : "it"} over instead of printing again.</span></div>`;
  const shown = rows.filter(r => !f || norm(r.n).includes(f));
  if (!shown.length) return h + `<p class="muted">No cards in the bin match “${esc(S.binFilter)}”.</p></section>`;
  const groups = new Map();
  for (const r of shown) { const g = typeOf(r.n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const binRow = r => {
    const rc = rec(r.n);
    const from = r.srcs.map(s => (s.direct ? "Added directly" : "From " + esc(s.name)) + (s.q > 1 && r.srcs.length > 1 ? ` (${s.q})` : "")).join(" · ");
    const lq = r.srcs.filter(s => s.loose).reduce((a, s) => a + s.q, 0);
    const rm = lq ? (S.confirm === "binrm|" + r.n ? `<span class="confirm" style="margin-top:4px">Throw out ${lq} cop${lq > 1 ? "ies" : "y"} not tied to a deck? <button class="btn sm danger" data-binrm-yes="${esc(r.n)}">Throw out</button><button class="btn sm ghost" data-act="binrm-no">Keep</button></span>` : `<button class="iconbtn" title="Throw out copies not tied to a deck" aria-label="Throw out ${esc(r.n)} from the bin" data-binrm="${esc(r.n)}">${ICONS.x}</button>`) : "";
    const moves = r.needs.map(nd => `<button class="btn sm" data-binmove="${esc(JSON.stringify([r.n, nd.id]))}">Move to ${esc(nd.name)}</button>`).join("");
    return `<div class="row"><span class="q">${r.total}</span><span class="nm"><span>${esc(r.n)}</span>${r.needs.length ? '<span class="flag good">Needed</span>' : ""}<small>${from}</small>${moves ? `<span class="bin-moves">${moves}</span>` : ""}${rm && S.confirm === "binrm|" + r.n ? rm : ""}</span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts">${rm && S.confirm !== "binrm|" + r.n ? rm : ""}<a class="iconbtn" href="${scry(r.n)}" target="_blank" rel="noopener" aria-label="Open ${esc(r.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
  };
  h += `<div class="groups bin-list">`;
  for (const g of TYPE_ORDER) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort((x, y) => x.n.localeCompare(y.n));
    h += `<div class="group"><h3>${TYPE_NAME[g]}<span class="mono">${arr.reduce((a, r) => a + r.total, 0)}</span></h3>${arr.map(binRow).join("")}</div>`;
  }
  return h + `</div></section>`;
}

// Commander deck rules. Returns a list of problems; empty means the deck is legal.
function legality(d) {
  const issues = []; const cm = curMap(d); const t = total(d);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (t !== 100) issues.push({ kind: "count", text: t < 100 ? `${plural(100 - t, "card")} short of 100.` : `${plural(t - 100, "card")} over 100.` });
  const cmds = (d.commanders || []).filter(n => cm.has(n));
  if (!cmds.length) issues.push({ kind: "commander", text: "No commander chosen. Pick one in Edit details." });
  else if (cmds.length > 2) issues.push({ kind: "commander", text: `A deck can have at most two commanders; this one has ${cmds.length}.` });
  else if (hasRules()) {
    const rs = cmds.map(rec);
    if (cmds.length === 1 && rs[0] && !canLead(rs[0])) issues.push({ kind: "commander", text: `${cmds[0]} can't be a commander.`, cards: cmds });
    if (cmds.length === 2 && rs[0] && rs[1] && !validPair(rs[0], rs[1])) issues.push({ kind: "commander", text: `${cmds[0]} and ${cmds[1]} can't be commanders together.`, cards: cmds });
  }
  const banned = [], notLegal = [], extra = [], off = [];
  for (const c of d.cur) {
    const r = rec(c.n); if (!r) continue;
    const f = flagsOf(r);
    if (f & F.BANNED) banned.push(c.n); else if (f & F.NOT_LEGAL) notLegal.push(c.n);
    const lim = limitOf(r);
    if (!isBasic(c.n) && lim !== -1 && c.q > (lim > 0 ? lim : 1)) extra.push(c.n);
    if (outsideCI(d, c.n)) off.push(c.n);
  }
  if (banned.length) issues.push({ kind: "banned", text: `${plural(banned.length, "card")} banned in Commander.`, cards: banned });
  if (notLegal.length) issues.push({ kind: "notlegal", text: `${plural(notLegal.length, "card")} not legal in Commander (for example Un-set or digital-only cards).`, cards: notLegal });
  if (extra.length) issues.push({ kind: "singleton", text: `${plural(extra.length, "card")} with more copies than allowed. Commander allows one of each card except basic lands.`, cards: extra });
  if (off.length) issues.push({ kind: "colors", text: `${plural(off.length, "card")} outside your commander's colors.`, cards: off });
  return issues;
}
function renderChecks(d, issues) {
  if (!issues.length || !S.showChecks) return "";
  return `<div class="checks" id="deck-checks"><ul>${issues.map(x => `<li><span class="flag bad">${esc({ count: "Count", commander: "Commander", banned: "Banned", notlegal: "Not legal", singleton: "Singleton", colors: "Colors" }[x.kind])}</span><span>${esc(x.text)}${x.cards && x.cards.length ? `<small>${x.cards.map(esc).join(", ")}</small>` : ""}</span></li>`).join("")}</ul></div>`;
}
// ---------- deck insight: bracket, roles and past versions ----------
// Commander Brackets (Oct 2025 rules): Game Changers, mass land denial and extra turns set the lowest
// bracket a deck can be in. Combos and how fast it wins can only be judged by the people playing it.
const BRACKET_NAMES = { 1: "Exhibition", 2: "Core", 3: "Upgraded", 4: "Optimized", 5: "cEDH" };
let textFlagsReady = null; // false until the card list has been rebuilt with text flags
const hasTextFlags = () => textFlagsReady || (textFlagsReady = CARDS.some(r => (r[4] | 0) >= 16));
function bracketOf(cards) {
  const gc = [], mld = [], et = [];
  for (const c of cards) { const f = flagsOf(rec(c.n)); if (f & F.GAME_CHANGER) gc.push(c.n); if (f & F.LAND_DENIAL) mld.push(c.n); if (f & F.EXTRA_TURN) et.push(c.n); }
  const lo = mld.length || gc.length > 3 ? 4 : gc.length ? 3 : et.length ? 2 : 1;
  const reasons = [];
  if (gc.length > 3) reasons.push({ kind: "Game Changers", text: `${gc.length} Game Changers. Bracket 3 allows up to three, so this deck is bracket 4 or higher.`, cards: gc });
  else if (gc.length) reasons.push({ kind: "Game Changers", text: `${gc.length} Game Changer${gc.length === 1 ? "" : "s"}. Brackets 1 and 2 allow none and bracket 3 allows up to three.`, cards: gc });
  else reasons.push({ kind: "Game Changers", text: "No Game Changers, so brackets 1 and 2 are open to this deck." });
  if (mld.length) reasons.push({ kind: "Land denial", text: "Mass land denial, which only brackets 4 and 5 allow.", cards: mld });
  if (et.length) reasons.push({ kind: "Extra turns", text: et.length >= 3 ? `${et.length} extra-turn cards. Bracket 1 allows none, and brackets 2 and 3 allow them only if they aren't chained together.` : "Bracket 1 allows no extra turns. Brackets 2 and 3 allow them as long as they aren't chained together.", cards: et });
  return { lo, label: lo === 1 ? "1–2" : lo === 4 ? "4+" : String(lo), name: lo === 1 ? "Exhibition or Core" : BRACKET_NAMES[lo], gc, mld, et, reasons };
}
function renderBracket(b) {
  if (!S.showBracket) return "";
  return `<div class="checks bracket-why" id="deck-bracket"><p class="bracket-head"><b>Bracket ${esc(b.label)}</b> · ${esc(b.name)}</p><ul>${b.reasons.map(x => `<li><span class="flag ${x.cards ? "warn" : "good"}">${esc(x.kind)}</span><span>${esc(x.text)}${x.cards ? `<small>${x.cards.map(esc).join(", ")}</small>` : ""}</span></li>`).join("")}</ul>
    <p class="muted bracket-note">This is the lowest bracket the cards allow. Two-card combos (none in brackets 1–2, none before turn six in bracket 3) and how fast the deck wins can push it higher, so settle the final number with your table.${hasTextFlags() ? "" : " Mass land denial and extra turns will be checked once the card list finishes updating."}</p></div>`;
}

const ROLES = [["ramp", "Ramp", F.RAMP], ["draw", "Draw", F.DRAW], ["removal", "Removal", F.REMOVAL], ["wipe", "Wipes", F.WIPE], ["tutor", "Tutors", F.TUTOR], ["wincon", "Win cons", 0], ["protect", "Protection", 0]];
const ROLE_NAME = { ramp: "Ramp", draw: "Draw", removal: "Removal", wipe: "Wipe", tutor: "Tutor", wincon: "Win con", protect: "Protection" };
const roleKey = c => c.i || (rec(c.n) || [])[5] || c.n;
function autoRoles(n) { const f = flagsOf(rec(n)); return ROLES.filter(r => r[2] && (f & r[2])).map(r => r[0]); }
function rolesOf(d, c) { const o = d.roles && d.roles[roleKey(c)]; return Array.isArray(o) ? o : autoRoles(c.n); }
function roleCounts(d, cards) { const m = Object.fromEntries(ROLES.map(r => [r[0], 0])); for (const c of cards) for (const r of rolesOf(d, c)) if (r in m) m[r] += c.q; return m; }
function setRoles(d, n, list) {
  const c = d.cur.find(x => x.n === n); if (!c) return;
  const order = ROLES.map(r => r[0]); list = order.filter(r => list.includes(r));
  d.roles = d.roles || {};
  if (list.join() === autoRoles(n).join()) delete d.roles[roleKey(c)]; else d.roles[roleKey(c)] = list;
  if (!Object.keys(d.roles).length) delete d.roles;
}
function rolesBar(d) {
  const counts = roleCounts(d, d.cur);
  return `<div class="roles-bar"><span class="label">Roles</span><div class="chips">${ROLES.map(([id, label]) => `<button class="chip${S.roleFilter === id ? " on" : ""}" data-rolefilter="${id}" aria-pressed="${S.roleFilter === id}">${label}<b class="mono">${counts[id]}</b></button>`).join("")}</div><span class="muted rhint">Suggested from each card's text. Use the tag button on a card to change its roles. Tap a role to show only those cards.</span></div>`;
}

function changeTitle(e) {
  const o = (e.out || []).length, i = (e.in || []).length;
  return e.kind === "import" ? "Updated from pasted list" : o && i ? `Swapped ${o === i ? o : o + " for " + i} card${Math.max(o, i) > 1 ? "s" : ""}` : o ? `Cut ${o} card${o > 1 ? "s" : ""}` : `Added ${i} card${i > 1 ? "s" : ""}`;
}
// Points in a deck's life that can be viewed or compared.
function versionPoints(d) {
  const pts = [{ key: "start", t: d.createdAt, label: `Original list (${fmtDate(d.createdAt)})` }];
  for (const e of d.log) if (isChange(e)) pts.push({ key: e.id, t: e.t, label: `${fmtDate(e.t)}: ${changeTitle(e)}` });
  pts.push({ key: "now", t: Date.now(), label: "Now" });
  return pts;
}
// The deck's list at a point: "start", "now", a history entry's id (right after that change) or a time.
function versionAt(d, key) {
  if (key === "now") return d.cur.map(c => ({ n: c.n, q: c.q }));
  const base = origOf(d); const cm = new Map(base.map(c => [c.n, c.q])); const order = base.map(c => c.n);
  if (key !== "start") for (const e of d.log) {
    if (typeof key === "number" && e.t > key) break;
    if (isChange(e)) {
      for (const o of e.out || []) { const v = (cm.get(o.n) || 0) - o.q; if (v > 0) cm.set(o.n, v); else cm.delete(o.n); }
      for (const i of e.in || []) { if (!cm.has(i.n)) order.push(i.n); cm.set(i.n, (cm.get(i.n) || 0) + i.q); }
    }
    if (e.id === key) break;
  }
  return [...new Set(order)].filter(n => cm.has(n)).map(n => ({ n, q: cm.get(n) }));
}
function versionLabel(d, key) {
  if (typeof key === "number") return "as of the end of " + fmtDate(key);
  if (key === "start") return "as first listed, " + fmtDate(d.createdAt);
  const e = d.log.find(x => x.id === key); return e ? `after the ${fmtDate(e.t)} change` : "today";
}
function deckStats(d, cards) {
  const cmds = d.commanders || []; let n = 0, lands = 0, mv = 0, spells = 0;
  for (const c of cards) { n += c.q; if (typeOf(c.n) === "L") lands += c.q; else if (!cmds.includes(c.n)) { mv += cmcOf(c.n) * c.q; spells += c.q; } }
  return { n, lands, avg: spells ? mv / spells : 0, bracket: bracketOf(cards), roles: roleCounts(d, cards) };
}
function listDiff(a, b) {
  const am = new Map(a.map(c => [c.n, c.q])), bm = new Map(b.map(c => [c.n, c.q])); const out = [], ins = [];
  for (const [n, q] of am) { const v = q - (bm.get(n) || 0); if (v > 0) out.push({ n, q: v }); }
  for (const [n, q] of bm) { const v = q - (am.get(n) || 0); if (v > 0) ins.push({ n, q: v }); }
  return { out: out.sort((x, y) => x.n.localeCompare(y.n)), ins: ins.sort((x, y) => x.n.localeCompare(y.n)) };
}
function renderSnapshot(d) {
  const key = S.snap.key; const cards = versionAt(d, key); const st = deckStats(d, cards); const now = curMap(d);
  const cmds = d.commanders || []; const groups = new Map();
  for (const c of cards) { const g = cmds.includes(c.n) ? "CMD" : typeOf(c.n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  const df = listDiff(cards, d.cur); const changed = qsum(df.out) + qsum(df.ins);
  let h = `<button class="crumb" data-act="snap-close">${ICONS.back}Back to the current deck</button>
  <div class="snap-banner" role="status"><div><span class="label">Past version</span><b>${esc(d.name)} ${esc(versionLabel(d, key))}</b><span class="muted">${changed ? `${qsum(df.out)} card${qsum(df.out) === 1 ? "" : "s"} here are gone now, and ${qsum(df.ins)} have been added since.` : "Same as the deck today."} This view is read-only.</span></div><div class="snap-acts"><button class="btn sm" data-act="copy-snap">${ICONS.copy}Copy this list</button><button class="btn sm primary" data-act="snap-close">Back to current</button></div></div>
  <div class="summary">
    <div class="k"><span class="label">Cards</span><span class="v">${st.n}</span></div>
    <div class="k"><span class="label">Lands</span><span class="v">${st.lands}</span></div>
    <div class="k"><span class="label">Avg. mana value</span><span class="v">${st.avg.toFixed(2)}</span></div>
    <div class="k"><span class="label">Bracket</span><span class="v">${esc(st.bracket.label)}</span></div>
    <div class="k"><span class="label">Roles</span><span class="role-mini">${ROLES.map(([id, l]) => `<span>${l} <b class="mono">${st.roles[id]}</b></span>`).join("")}</span></div>
  </div><div class="groups">`;
  for (const g of ["CMD", ...TYPE_ORDER]) {
    const arr = groups.get(g); if (!arr) continue; arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${g === "CMD" ? "Commander" : TYPE_NAME[g]}<span class="mono">${qsum(arr)}</span></h3>`;
    for (const c of arr) {
      const r = rec(c.n); const have = now.get(c.n) || 0;
      const fl = have >= c.q ? "" : have ? `<span class="flag plain">${have} in deck now</span>` : '<span class="flag plain">Not in deck now</span>';
      h += `<div class="row"><span class="q">${c.q}</span><span class="nm"><span>${esc(c.n)}</span>${fl}</span>${r ? pipsFor(r[1]) : "<span></span>"}<span class="acts"><a class="iconbtn" href="${scry(c.n)}" target="_blank" rel="noopener" aria-label="Open ${esc(c.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
    }
    h += `</div>`;
  }
  return h + `</div>`;
}
function renderCompare(d) {
  const pts = versionPoints(d); const c = S.cmp;
  const sel = (id, v) => `<select class="field" id="${id}">${pts.map(p => `<option value="${esc(p.key)}" ${p.key === v ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>`;
  const A = versionAt(d, c.a), B = versionAt(d, c.b); const sa = deckStats(d, A), sb = deckStats(d, B); const df = listDiff(A, B);
  const delta = (x, y, dp = 0) => { const v = y - x; if (Math.abs(v) < (dp ? 0.005 : 1)) return '<span class="muted">–</span>'; return `<span class="${v > 0 ? "up" : "down"}">${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}</span>`; };
  const rows = [["Cards", sa.n, sb.n, delta(sa.n, sb.n)], ["Lands", sa.lands, sb.lands, delta(sa.lands, sb.lands)], ["Avg. mana value", sa.avg.toFixed(2), sb.avg.toFixed(2), delta(sa.avg, sb.avg, 2)], ["Bracket", sa.bracket.label, sb.bracket.label, sa.bracket.lo === sb.bracket.lo ? '<span class="muted">–</span>' : `<span class="${sb.bracket.lo > sa.bracket.lo ? "up" : "down"}">${sb.bracket.lo > sa.bracket.lo ? "Higher" : "Lower"}</span>`],
    ...ROLES.map(([id, l]) => [l, sa.roles[id], sb.roles[id], delta(sa.roles[id], sb.roles[id])])];
  const list = (arr, cls) => arr.length ? arr.map(x => `<span class="${cls}">${x.q > 1 ? x.q + "x " : ""}${esc(x.n)}</span>`).join("") : '<span class="muted">Nothing</span>';
  return `<div class="compare" id="compare"><div class="cmp-head"><h3>Compare versions</h3><button class="iconbtn" data-act="cmp-close" aria-label="Close comparison">${ICONS.x}</button></div>
    <div class="cmp-pick"><label class="f"><span class="label">From</span>${sel("cmp-a", c.a)}</label><span class="arr">→</span><label class="f"><span class="label">To</span>${sel("cmp-b", c.b)}</label></div>
    <table class="cmp-table"><thead><tr><th></th><th>From</th><th>To</th><th>Change</th></tr></thead><tbody>${rows.map(r => `<tr><th>${r[0]}</th><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td><td class="mono">${r[3]}</td></tr>`).join("")}</tbody></table>
    <div class="cmp-diff"><div><span class="label out">Taken out <b class="mono">${qsum(df.out)}</b></span><div class="cmp-list">${list(df.out, "o")}</div></div><div><span class="label in">Put in <b class="mono">${qsum(df.ins)}</b></span><div class="cmp-list">${list(df.ins, "i")}</div></div></div></div>`;
}

function renderDeck(d) {
  if (S.snap && S.snap.id === d.id) return renderSnapshot(d);
  const t = total(d); const ci = deckCI(d); const removed = removedList(d);
  const changes = d.log.filter(isChange); const histCount = d.log.filter(e => e.kind !== "create").length;
  const curve = Array(8).fill(0);
  d.cur.forEach(c => { if (typeOf(c.n) !== "L" && !(d.commanders || []).includes(c.n)) curve[Math.min(7, cmcOf(c.n))] += c.q; });
  const mx = Math.max(1, ...curve);
  const lands = d.cur.filter(c => typeOf(c.n) === "L").reduce((a, c) => a + c.q, 0);
  const unknown = d.cur.filter(c => !rec(c.n)).length;
  const issues = legality(d); const br = bracketOf(d.cur);
  const toPrint = qsum(unprinted(d));
  const cmd = (d.commanders && d.commanders.length) ? d.commanders.join(" & ") : "No commander set";
  let h = `<button class="crumb" data-act="home">${ICONS.back}All decks</button>
  <div class="dhead"><div>
    <div class="eyebrow">${ciPips(ci)}${d.example ? '<span class="tag-ex">Example</span>' : ""}</div>
    <h2>${esc(cmd)}</h2>
    <div class="dn">${esc(d.name)} · started ${fmtDate(d.createdAt)}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener">Archidekt ${ICONS.ext}</a>` : ""}</div>
    ${d.desc ? `<p class="ddesc">${esc(d.desc)}</p>` : ""}
  </div><div class="actions">
    <button class="btn" data-act="update">${ICONS.list}Update from list</button>
    <button class="btn" data-act="edit">Edit details</button>
  </div></div>
  <div class="summary">
    <div class="k"><span class="label">Cards</span><span class="v ${t === 100 ? "ok" : "warn"}">${t}<span class="muted" style="font-size:13px">/100</span></span></div>
    <div class="k"><span class="label">Lands</span><span class="v">${lands}</span></div>
    <div class="k"><span class="label">Printed</span><span class="v">${printedTotal(d)}</span></div>
    <div class="k"><span class="label">To print</span><span class="v ${toPrint ? "warn" : "ok"}">${toPrint}</span></div>
    <div class="k"><span class="label">Changes</span><span class="v">${changes.length}</span></div>
    <div class="k"><span class="label">Curve</span><div class="curve">${curve.map(v => `<div style="height:${Math.round(v / mx * 100)}%" title="${v}"></div>`).join("")}</div><div class="curve-l">${curve.map((_, i) => `<span>${i === 7 ? "7+" : i}</span>`).join("")}</div></div>
    <div class="k"><span class="label">Rules</span><span class="checkcell">${issues.length ? `<button class="flag bad flagbtn" data-act="toggle-checks" aria-expanded="${!!S.showChecks}" aria-controls="deck-checks">${issues.length} issue${issues.length === 1 ? "" : "s"} ${S.showChecks ? "▴" : "▾"}</button>` : `<span class="flag good" style="margin:0">Legal</span>`}${unknown ? `<span class="flag warn" style="margin:0">${unknown} unrecognized</span>` : ""}</span></div>
    <div class="k"><span class="label">Bracket</span><button class="v bracket-btn" data-act="toggle-bracket" aria-expanded="${!!S.showBracket}" aria-controls="deck-bracket" title="Why this bracket?">${esc(br.label)}<span class="bname">${esc(br.name)} ${S.showBracket ? "▴" : "▾"}</span></button></div>
  </div>${renderChecks(d, issues)}${renderBracket(br)}
  <div class="layout"><div style="min-width:0">
    <div class="tabs" role="tablist">
      ${tabBtn("current", "Current list", t)}
      ${tabBtn("removed", "Removed", removed.reduce((a, r) => a + r.q, 0), true)}
      ${tabBtn("printed", "Printed", printedTotal(d))}
      ${tabBtn("history", "History", histCount)}
    </div>`;
  if (S.tab === "current") h += renderCurrent(d);
  else if (S.tab === "removed") h += renderRemoved(d, removed);
  else if (S.tab === "printed") h += renderPrinted(d);
  else h += renderHistory(d);
  h += `</div>${renderBench(d)}</div>`;
  return h;
}
function tabBtn(id, label, n, drop) {
  return `<button class="tab${S.tab === id ? " on" : ""}" role="tab" aria-selected="${S.tab === id}" data-tab="${id}"${drop ? ' data-drop="out"' : ""}>${label}<span class="n">${n}</span></button>`;
}

function colorRank(n) { const ci = ciOf(n); if (!ci) return 99; if (ci.length === 1) return MANA_ORDER.indexOf(ci); return 10 + ci.length * 10 + MANA_ORDER.indexOf(ci[0]); }
function cardSorter(mode) {
  const byName = (a, b) => a.n.localeCompare(b.n);
  if (mode === "name") return byName;
  if (mode === "color") return (a, b) => colorRank(a.n) - colorRank(b.n) || (ciOf(a.n) < ciOf(b.n) ? -1 : ciOf(a.n) > ciOf(b.n) ? 1 : 0) || cmcOf(a.n) - cmcOf(b.n) || byName(a, b);
  return (a, b) => cmcOf(a.n) - cmcOf(b.n) || byName(a, b);
}
function renderCurrent(d) {
  const f = norm(S.filter); const staged = new Map(d.bench.out.map(o => [o.n, o.q])); const pm = printedMap(d); const todo = unprinted(d);
  const bin = new Map(binRows().filter(r => r.srcs.some(s => s.id !== d.id)).map(r => [r.n, r]));
  const groups = new Map(); const cmds = d.commanders || [];
  for (const c of d.cur) {
    if (f && !norm(c.n).includes(f)) continue;
    if (S.roleFilter && !rolesOf(d, c).includes(S.roleFilter)) continue;
    const g = cmds.includes(c.n) ? "CMD" : typeOf(c.n);
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c);
  }
  let h = `<div class="toolbar"><input class="field" id="f-cur" type="search" placeholder="Find a card in this deck" value="${esc(S.filter)}" aria-label="Find a card in this deck"><label class="sortsel"><span class="label">Sort</span><select class="field" id="s-sort" aria-label="Sort cards within each type">${[["cost", "Cost"], ["name", "Name A–Z"], ["color", "Color"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><div class="menuwrap"><button class="btn sm" data-act="copy-menu" aria-haspopup="menu" aria-expanded="${!!S.menu}">${ICONS.copy}Copy ${ICONS.caret}</button>${S.menu ? `<div class="menu" role="menu"><button role="menuitem" data-act="copy-cur">Whole list<span class="mono muted">${total(d)}</span></button><button role="menuitem" data-act="copy-toprint" ${todo.length ? "" : "disabled"}>Unprinted only<span class="mono muted">${qsum(todo)}</span></button></div>` : ""}</div><span class="muted" style="font-size:12px;flex-basis:100%">Drag a card onto <b>Removed</b> or the bench, or use the scissors.</span></div>`;
  if (todo.length) h += `<div class="toprint"><span><b class="mono">${qsum(todo)}</b> card${qsum(todo) > 1 ? "s" : ""} not printed yet</span><span class="grow"></span><button class="btn sm" data-act="copy-toprint">${ICONS.copy}Copy print list</button>${S.confirm === "printall" ? `<span class="confirm">Mark all ${qsum(todo)} as printed? <button class="btn sm primary" data-act="printall-yes">Mark printed</button><button class="btn sm ghost" data-act="printall-no">Cancel</button></span>` : `<button class="btn sm" data-act="printall">${ICONS.print}Mark all printed</button>`}</div>`;
  h += rolesBar(d);
  if (!groups.size) return h + `<p class="muted">${S.roleFilter ? `No cards${S.filter ? ` matching “${esc(S.filter)}”` : ""} have the ${esc(ROLE_NAME[S.roleFilter])} role.` : `No cards match “${esc(S.filter)}”.`}</p>`;
  h += `<div class="groups">`;
  for (const g of ["CMD", ...TYPE_ORDER]) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${g === "CMD" ? "Commander" : TYPE_NAME[g]}<span class="mono">${arr.reduce((a, c) => a + c.q, 0)}</span></h3>`;
    for (const c of arr) {
      const r = rec(c.n); const st = staged.get(c.n); const pq = Math.min(pm.get(c.n) || 0, c.q);
      const prFlag = pq >= c.q ? "" : pq > 0 ? `<span class="flag warn">${pq} of ${c.q} printed</span>` : '<span class="flag warn">Not printed</span>';
      const inBin = pq < c.q && bin.has(c.n) ? `<button class="flag good flagbtn" title="Move a printed copy from the bin into this deck" data-binmove="${esc(JSON.stringify([c.n, d.id]))}">In bin · move here</button>` : "";
      const rf = flagsOf(r), lim = limitOf(r);
      const ruleFlags = (rf & F.BANNED ? '<span class="flag bad">Banned</span>' : rf & F.NOT_LEGAL ? '<span class="flag bad">Not legal</span>' : "") + (r && !isBasic(c.n) && lim !== -1 && c.q > (lim > 0 ? lim : 1) ? '<span class="flag bad">Too many copies</span>' : "");
      const flags = prFlag + inBin + ruleFlags + (!r ? '<span class="flag warn">Unrecognized</span>' : "") + (outsideCI(d, c.n) ? '<span class="flag bad">Outside colors</span>' : "") + (st ? `<span class="flag bad">Cutting${c.q > 1 ? " " + st : ""}</span>` : "");
      const roles = rolesOf(d, c); const editing = S.roleEdit === c.n;
      const rtags = roles.length ? `<span class="rtags">${roles.map(x => `<span class="rtag">${ROLE_NAME[x] || esc(x)}</span>`).join("")}</span>` : "";
      const redit = editing ? `<span class="roleedit" role="group" aria-label="Roles for ${esc(c.n)}">${ROLES.map(([id, l]) => `<button class="chip sm${roles.includes(id) ? " on" : ""}" aria-pressed="${roles.includes(id)}" data-roletoggle="${esc(JSON.stringify([c.n, id]))}">${ROLE_NAME[id]}</button>`).join("")}${d.roles && d.roles[roleKey(c)] ? `<button class="btn sm ghost" data-rolereset="${esc(c.n)}">Use suggested</button>` : ""}<button class="btn sm" data-act="role-done">Done</button></span>` : "";
      h += `<div class="row${st ? " staged-out" : ""}${editing ? " editing" : ""}" draggable="true" data-drag="cur" data-name="${esc(c.n)}">
        <span class="q">${c.q}</span><span class="nm"><span>${esc(c.n)}</span>${flags}${rtags}${redit}</span>${r ? pipsFor(r[1]) : "<span></span>"}
        <span class="acts"><button class="iconbtn${editing ? " on" : ""}" title="Roles" aria-label="Set roles for ${esc(c.n)}" aria-expanded="${editing}" data-roleedit="${esc(c.n)}">${ICONS.tag}</button>${pq >= c.q ? `<span class="iconbtn done" title="Printed" aria-label="Printed">${ICONS.printed}</span>` : `<button class="iconbtn todo" title="Mark ${esc(c.n)} as printed" aria-label="Mark ${esc(c.n)} as printed" data-print="${esc(c.n)}">${ICONS.print}</button>`}<button class="iconbtn" title="Cut ${esc(c.n)}" aria-label="Cut ${esc(c.n)}" data-cut="${esc(c.n)}">${ICONS.cut}</button><a class="iconbtn" href="${scry(c.n)}" target="_blank" rel="noopener" title="Open on Scryfall" aria-label="Open ${esc(c.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
    }
    h += `</div>`;
  }
  return h + `</div>`;
}

function renderRemoved(d, removed) {
  if (!removed.length) return `<div class="empty"><h2>Nothing removed yet</h2><p>Cards you cut land here. They stay on your printed list, so you can see what's sitting in the box and bring any of them back.</p></div>`;
  const rows = removed.map(r => ({ ...r, e: lastOut(d, r.n) })).sort((a, b) => (b.e ? b.e.t : 0) - (a.e ? a.e.t : 0));
  return `<div class="plist">${rows.map(r => {
    const rc = rec(r.n); const e = r.e;
    const repl = e && e.in && e.in.length ? `replaced by ${e.in.map(i => esc(i.n)).join(", ")}` : "";
    const sub = e ? `Cut ${fmtShort(e.t)}${repl ? " · " + repl : ""}` : "Out of the current list";
    const staged = d.bench.in.some(i => i.n === r.n);
    return `<div class="row" draggable="true" data-drag="removed" data-name="${esc(r.n)}"><span class="q">${r.q}</span>
      <span class="nm"><span>${esc(r.n)}</span>${staged ? '<span class="flag good">Coming back</span>' : ""}${r.printed ? "" : (() => { for (let i = d.log.length - 1; i >= 0; i--) { const e = d.log[i]; if (e.kind === "unprint" && e.cards.some(c => c.n === r.n)) return e.to ? `<span class="flag plain">Moved to ${esc(e.to.name)}</span>` : '<span class="flag plain">Taken off printed</span>'; } return '<span class="flag plain">Never printed</span>'; })()}<small>${sub}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}
      <span class="acts" style="opacity:1"><button class="iconbtn" title="Bring back" aria-label="Bring ${esc(r.n)} back" data-bringback="${esc(r.n)}">${ICONS.back2}</button><a class="iconbtn" href="${scry(r.n)}" target="_blank" rel="noopener" aria-label="Open ${esc(r.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
  }).join("")}</div>`;
}

function renderPrinted(d) {
  const cm = curMap(d); const pf = S.printedFilter;
  const rows = d.printed.filter(p => pf === "all" || (pf === "orig" ? p.o === 0 : p.o === 1))
    .sort((a, b) => a.o - b.o || (a.o ? b.at - a.at : a.n.localeCompare(b.n)));
  const orig = qsum(d.printed.filter(p => p.o === 0)); const added = printedTotal(d) - orig;
  let h = `<div class="toolbar"><div class="chips">
    <button class="chip${pf === "all" ? " on" : ""}" data-pf="all">All ${printedTotal(d)}</button>
    <button class="chip${pf === "orig" ? " on" : ""}" data-pf="orig">Original list ${orig}</button>
    <button class="chip${pf === "added" ? " on" : ""}" data-pf="added">Added later ${added}</button></div>
    <span style="flex:1"></span><button class="btn sm" data-act="copy-printed">${ICONS.copy}Copy as list</button></div>`;
  if (!d.printed.length) return h + `<div class="empty"><h2>Nothing printed yet</h2><p>Use the printer button on a card in the current list, or <b>Mark all printed</b>, once you have the copies in hand.</p></div>`;
  h += `<div class="plist">${rows.map(p => {
    const have = cm.get(p.n) || 0; const rc = rec(p.n);
    const st = have >= p.q ? '<span class="flag good">In deck</span>' : have > 0 ? `<span class="flag warn">${have} of ${p.q} in deck</span>` : '<span class="flag plain">Removed</span>';
    const sub = p.o ? `Added ${fmtShort(p.at)}` : "Original list";
    return `<div class="row"><span class="q">${p.q}</span><span class="nm"><span>${esc(p.n)}</span>${st}<small>${sub}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts">${S.confirm === "unprint|" + p.n ? `<span class="confirm">Remove? <button class="btn sm danger" data-unprint-yes="${esc(p.n)}">Remove</button><button class="btn sm ghost" data-act="unprint-no">Keep</button></span>` : `<button class="iconbtn" title="Remove from printed" aria-label="Remove ${esc(p.n)} from printed" data-unprint="${esc(p.n)}">${ICONS.x}</button>`}<a class="iconbtn" href="${scry(p.n)}" target="_blank" rel="noopener" aria-label="Open ${esc(p.n)} on Scryfall">${ICONS.ext}</a></span></div>`;
  }).join("")}</div>`;
  return h;
}

function swapLines(e) {
  const o = e.out || [], i = e.in || [];
  const fmt = x => esc(x.n) + (x.q > 1 ? ` ×${x.q}` : "");
  if (o.length === i.length && o.length) return `<div class="swaps">${o.map((x, k) => `<div class="swap"><span class="o">${fmt(x)}</span><span class="arr">→</span><span class="i">${fmt(i[k])}</span></div>`).join("")}</div>`;
  const n = Math.max(o.length, i.length); let s = "";
  for (let k = 0; k < n; k++) s += `<div class="swap"><span class="o">${o[k] ? fmt(o[k]) : ""}</span><span class="arr">${o[k] && i[k] ? "→" : ""}</span><span class="i">${i[k] ? fmt(i[k]) : ""}</span></div>`;
  return `<div class="swaps">${s}</div>`;
}
function renderHistory(d) {
  const entries = [...d.log].reverse();
  const today = new Date(); const iso = x => { const z = new Date(x); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`; };
  const tools = `<div class="hist-tools"><label class="f"><span class="label">See the deck on a date</span><span class="datego"><input class="field" type="date" id="h-date" min="${iso(d.createdAt)}" max="${iso(today)}" value="${esc(S.histDate || iso(today))}"><button class="btn sm" data-act="view-date">View</button></span></label>${S.cmp ? "" : `<button class="btn sm" data-act="cmp-open">Compare versions</button>`}</div>`;
  return tools + (S.cmp ? renderCompare(d) : "") + `<div class="hist">${entries.map((e, k) => {
    const latest = k === 0 && e.kind !== "create";
    let title;
    const pl = e.cards ? qsum(e.cards) : 0; const s = pl > 1 ? "s" : "";
    if (e.kind === "create") title = `Deck created with ${e.count} cards`;
    else if (e.kind === "print") title = e.from ? `Took ${pl} card${s} from the bin${e.from.names && e.from.names.length ? " (" + e.from.names.map(esc).join(", ") + ")" : ""}` : `Printed ${pl} card${s}`;
    else if (e.kind === "unprint") title = e.to ? `Moved ${pl} printed card${s} to ${esc(e.to.name)}` : `Removed ${pl} card${s} from printed`;
    else title = changeTitle(e);
    const undo = latest ? (S.confirm === "undo" ? `<span class="confirm">Undo this change? <button class="btn sm danger" data-act="undo-yes">Undo</button><button class="btn sm ghost" data-act="undo-no">Keep</button></span>` : `<button class="btn sm ghost" data-act="undo">Undo</button>`) : "";
    const view = e.kind === "create" || isChange(e) ? `<button class="btn sm ghost" data-snap="${e.kind === "create" ? "start" : esc(e.id)}">${e.kind === "create" ? "View original list" : "View deck after this"}</button>` : "";
    return `<div class="entry"><div class="when">${fmtDate(e.t)}</div><div class="what"><div class="kind">${title}${undo}${view}</div>${e.kind === "create" ? "" : e.cards ? `<div class="plines ${e.kind}">${e.cards.map(c => `<span>${c.q}x ${esc(c.n)}</span>`).join("")}</div>` : swapLines(e)}${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}</div></div>`;
  }).join("")}</div>`;
}

function renderBench(d) {
  const b = d.bench; const cm = curMap(d);
  const row = (x, side) => {
    const max = side === "out" ? (cm.get(x.n) || 1) : 99;
    return `<div class="brow"><span class="nm">${esc(x.n)}${side === "in" && outsideCI(d, x.n) ? '<span class="flag bad">Outside colors</span>' : ""}${side === "in" && !rec(x.n) ? '<span class="flag warn">Unrecognized</span>' : ""}${side === "in" && (printedMap(d).get(x.n) || 0) ? '<span class="flag good">Printed</span>' : ""}</span>
      <span class="qty">${max > 1 || x.q > 1 ? `<button aria-label="Fewer" data-qty="${side}|${esc(x.n)}|-1">−</button>${x.q}<button aria-label="More" data-qty="${side}|${esc(x.n)}|1">+</button>` : ""}</span>
      <button class="iconbtn" aria-label="Unstage ${esc(x.n)}" data-unstage="${side}|${esc(x.n)}">${ICONS.x}</button></div>`;
  };
  const n = b.out.length + b.in.length;
  const pair = b.out.length && b.in.length ? (b.out.length === b.in.length ? `Saves as ${b.out.length} swap${b.out.length > 1 ? "s" : ""}, matched in order.` : `${b.out.length} out, ${b.in.length} in.`) : b.out.length ? "Cuts only. Add replacements below if you have them." : b.in.length ? "Adds only." : "";
  return `<aside class="bench" aria-label="Swap bench"><header><h3>Swap bench</h3><p>Stage cuts and adds, then save them as one change.</p></header>
    <div class="zone"><div class="zt"><span class="label out">Taking out</span><span class="mono muted" style="font-size:12px">${b.out.reduce((a, x) => a + x.q, 0)}</span></div>
      <div class="dropbox" data-drop="out">${b.out.length ? b.out.map(x => row(x, "out")).join("") : '<div class="hint">Drag cards here from the current list</div>'}</div>
      <div class="search"><input class="field" id="s-out" placeholder="Search this deck to cut…" autocomplete="off" aria-label="Search this deck to cut"><div class="sugg" id="g-out" hidden></div></div>
    </div>
    <div class="zone"><div class="zt"><span class="label in">Putting in</span><span class="mono muted" style="font-size:12px">${b.in.reduce((a, x) => a + x.q, 0)}</span></div>
      <div class="dropbox" data-drop="in">${b.in.length ? b.in.map(x => row(x, "in")).join("") : '<div class="hint">Drag removed cards here, or search any card</div>'}</div>
      <div class="search"><input class="field" id="s-in" placeholder="Search all cards to add…" autocomplete="off" aria-label="Search all cards to add"><div class="sugg" id="g-in" hidden></div></div>
    </div>
    <div class="foot">
      <textarea class="field" id="b-note" placeholder="Why the change? (optional)" aria-label="Note for this change">${esc(b.note || "")}</textarea>
      ${pair ? `<div class="pairhint">${pair}</div>` : ""}
      <div class="row2"><button class="btn ghost sm" data-act="clear-bench" ${n ? "" : "disabled"}>Clear</button><button class="btn primary" data-act="commit" ${n ? "" : "disabled"}>Save change</button></div>
    </div></aside>`;
}

// ---------- suggestions ----------
function suggest(q, side, d) {
  const f = norm(q); if (!f) return [];
  if (side === "out") {
    const staged = new Set(d.bench.out.map(o => o.n));
    return d.cur.filter(c => !staged.has(c.n) && norm(c.n).includes(f)).sort((a, b) => norm(a.n).indexOf(f) - norm(b.n).indexOf(f)).slice(0, 10).map(c => ({ n: c.n, tag: c.q > 1 ? "×" + c.q : "" }));
  }
  const cm = curMap(d); const removed = new Set(removedList(d).map(r => r.n)); const ci = deckCI(d); const has = d.commanders && d.commanders.length;
  const res = []; const seen = new Set();
  for (const r of removedList(d)) if (norm(r.n).includes(f)) { res.push({ n: r.n, tag: "Removed" }); seen.add(r.n); }
  const starts = [], contains = [];
  for (let i = 0; i < NAMES.length && starts.length < 40; i++) {
    const k = NAMES[i]; if (!k.includes(f)) continue;
    const r = CARDS[i]; if (seen.has(r[0])) continue;
    if (cm.has(r[0]) && !isBasic(r[0])) continue;
    const off = has && [...r[3]].some(c => !ci.includes(c));
    (k.startsWith(f) ? starts : contains).push({ n: r[0], off, cost: r[1], banned: !!(flagsOf(r) & (F.BANNED | F.NOT_LEGAL)) });
  }
  const pool = [...starts, ...contains].sort((a, b) => (a.off + a.banned) - (b.off + b.banned));
  for (const p of pool) { if (res.length >= 10) break; res.push({ n: p.n, tag: p.banned ? "Banned" : p.off ? "Outside colors" : "", cost: p.cost, off: p.off || p.banned }); }
  if (!res.some(r => norm(r.n) === f)) res.push({ n: q.trim(), free: true });
  return res;
}
let suggState = { side: null, items: [], act: 0 };
function showSugg(side, q, d) {
  const box = $("#g-" + side); if (!box) return;
  const items = suggest(q, side, d); suggState = { side, items, act: 0 };
  if (!items.length) { box.hidden = true; return; }
  box.innerHTML = items.map((it, i) => `<button type="button" class="${i === 0 ? "act" : ""}" data-pick="${side}|${i}"><span class="nm">${it.free ? `<span class="free">Add as typed:</span> ${esc(it.n)}` : esc(it.n)}</span><span class="meta">${it.tag ? `<span class="flag ${it.tag === "Removed" ? "plain" : it.off ? "bad" : "plain"}" style="margin:0">${esc(it.tag)}</span>` : ""}${it.cost ? pipsFor(it.cost) : ""}</span></button>`).join("");
  box.hidden = false;
}
function pick(side, i) {
  const d = S.decks.get(S.deckId); const it = suggState.items[i]; if (!d || !it) return;
  stage(d, side, it.free ? canon(it.n) : it.n);
  setTimeout(() => { const el = $("#s-" + side); if (el) el.focus(); }, 0);
}

// ---------- bench actions ----------
function stage(d, side, n) {
  const list = d.bench[side];
  const ex = list.find(x => x.n === n);
  if (side === "out") {
    const have = curMap(d).get(n) || 0; if (!have) return;
    if (ex) ex.q = Math.min(have, ex.q + 1); else list.push({ n, q: 1 });
  } else {
    if (ex) ex.q += 1; else list.push({ n, q: 1 });
  }
  render(); saveSoon(d);
}
function unstage(d, side, n) { d.bench[side] = d.bench[side].filter(x => x.n !== n); render(); saveSoon(d); }
function bumpQty(d, side, n, delta) {
  const x = d.bench[side].find(x => x.n === n); if (!x) return;
  const max = side === "out" ? (curMap(d).get(n) || 1) : 99;
  x.q = Math.max(1, Math.min(max, x.q + delta)); render(); saveSoon(d);
}
function commit(d) {
  const note = ($("#b-note") || {}).value || d.bench.note || "";
  const kind = d.bench.kind === "import" ? "import" : "swap";
  applyChange(d, d.bench.out, d.bench.in, note, kind);
  const n = d.bench.out.length + d.bench.in.length;
  d.bench = { out: [], in: [], note: "" };
  clearTimeout(benchTimers.get(d.id));
  save(d); render(); toast(`Saved ${n} card change${n > 1 ? "s" : ""} to history.`);
}

// ---------- clipboard ----------
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label + " copied."); }
  catch { openDialog({ kind: "copy", text, label }); }
}
function listText(d, rows, withCmd) {
  const cmds = withCmd ? (d.commanders || []) : [];
  const first = rows.filter(r => cmds.includes(r.n)); const rest = rows.filter(r => !cmds.includes(r.n));
  return [...first.map(r => `${r.q}x ${r.n} [Commander]`), ...rest.map(r => `${r.q}x ${r.n}`)].join("\n");
}

// ---------- dialogs ----------
function openDialog(dl) { S.dialog = dl; renderDialog(); }
function closeDialog() { S.dialog = null; const s = $(".scrim"); if (s) s.remove(); }
function renderDialog() {
  let s = $(".scrim"); if (!s) { s = document.createElement("div"); s.className = "scrim"; document.body.appendChild(s); }
  const dl = S.dialog; let h = "";
  if (dl.kind === "new") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 id="dlg-t">New deck</h2><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">
      <label class="f"><span class="label">Deck name</span><input class="field" id="n-name" placeholder="Flaming Cobra Chickens" value="${esc(dl.name || "")}"></label>
      <label class="f"><span class="label">Archidekt link (optional)</span><input class="field" id="n-link" placeholder="https://archidekt.com/decks/…" value="${esc(dl.link || "")}"></label>
      <label class="f"><span class="label">Short description (optional)</span><textarea class="field short" id="n-desc" maxlength="280" placeholder="What the deck does and how it wins">${esc(dl.desc || "")}</textarea></label>
      <label class="f"><span class="label">Deck list</span><textarea class="field" id="n-list" placeholder="1 Zagras, Thief of Heartbeats [Commander]&#10;1 Sol Ring&#10;1 Arcane Signet&#10;30 Mountain">${esc(dl.text || "")}</textarea></label>
      <div id="n-parse"></div>
      <label class="checkline"><input type="checkbox" id="n-printed" ${dl.printedNow === false ? "" : "checked"}> I've already printed this list</label>
    </div>
    <footer><span class="grow">This list is saved as the deck's original list.</span><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="create">Create deck</button></footer></div>`;
  } else if (dl.kind === "edit") {
    const d = S.decks.get(dl.id);
    const leg = d.cur.filter(c => isCmdrPick(rec(c.n))).map(c => c.n);
    const opts = [...new Set([...(d.commanders || []), ...leg])];
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 id="dlg-t">Edit details</h2><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">
      <label class="f"><span class="label">Deck name</span><input class="field" id="e-name" value="${esc(dl.name ?? d.name)}"></label>
      <label class="f"><span class="label">Archidekt link</span><input class="field" id="e-link" value="${esc(dl.link ?? (d.link || ""))}" placeholder="https://archidekt.com/decks/…"></label>
      <label class="f"><span class="label">Short description</span><textarea class="field short" id="e-desc" maxlength="280" placeholder="What the deck does and how it wins">${esc(dl.desc ?? (d.desc || ""))}</textarea></label>
      <div class="f"><span class="label">Commander</span><div class="cmdpick" style="margin-top:5px">${opts.length ? opts.map(n => `<label><input type="checkbox" name="e-cmd" value="${esc(n)}" ${(dl.cmds || d.commanders || []).includes(n) ? "checked" : ""}>${esc(n)}</label>`).join("") : '<span class="muted">No legendary creatures in this list.</span>'}</div></div>
      <div class="f"><span class="label">Panel art</span>${(() => {
        const art = artNameOf(d); const cmds = d.commanders || [];
        const others = d.cur.map(c => c.n).filter(n => !cmds.includes(n) && typeOf(n) !== "L").sort((a, b) => a.localeCompare(b));
        const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(l)}</option>`;
        const sel = d.artOff ? "__none" : (art || "");
        return `<div class="artrow">${art ? `<img class="artprev" src="${esc(artSrcOf(d))}" alt="Art from ${esc(art)}" style="object-position:center ${d.artPos || "center"}">` : `<div class="artprev empty-art">No art</div>`}<div class="artbtns">
          <label class="checkline">Art from <select class="field" id="e-artcard">${cmds.map(n => opt(n, n, sel === n)).join("")}${others.length ? `<optgroup label="Other cards in this deck">${others.map(n => opt(n, n, sel === n)).join("")}</optgroup>` : ""}${opt("__none", "No art", sel === "__none")}</select></label>
          ${art ? `<label class="checkline">Show <select class="field" id="e-artpos">${["top", "center", "bottom"].map(v => `<option value="${v}" ${(d.artPos || "center") === v ? "selected" : ""}>${v === "center" ? "middle" : v}</option>`).join("")}</select> of the image</label>` : ""}
        </div></div>${art ? printingsHtml(d, art) : ""}<p class="arthint">Art comes from Scryfall and appears faded behind this deck's panel on the main page.</p>`;
      })()}</div>
      <div class="f"><span class="label">Delete</span><div style="margin-top:5px">${dl.del ? `<div class="delbox"><span>Delete ${esc(d.name)} and all of its history?</span>${printedTotal(d) ? `<label class="checkline"><input type="checkbox" id="del-keep" ${dl.keep === false ? "" : "checked"}> Keep its ${printedTotal(d)} printed card${printedTotal(d) > 1 ? "s" : ""} in the card bin</label>` : ""}<span class="confirm"><button class="btn sm danger" data-dlg="del-yes">Delete deck</button><button class="btn sm ghost" data-dlg="del-no">Keep it</button></span></div>` : `<button class="btn sm danger" data-dlg="del">Delete this deck</button>`}</div></div>
    </div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="save-edit">Save</button></footer></div>`;
  } else if (dl.kind === "update") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Update from list</h2><p class="muted" style="margin:4px 0 0;font-size:13px">Paste the deck's newest list (from Archidekt or anywhere). The differences go onto the swap bench for you to review and save.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db"><textarea class="field" id="u-list" placeholder="Paste the full current list">${esc(dl.text || "")}</textarea><div id="u-diff"></div></div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="to-bench" id="u-go" disabled>Put changes on the bench</button></footer></div>`;
  } else if (dl.kind === "binadd") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Add to card bin</h2><p class="muted" style="margin:6px 0 0;font-size:13px">For printed cards you already have that aren't in a deck. Search for a card, or paste a list with one card per line like <span class="mono">2x Sol Ring</span>.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">
      <div class="search"><input class="field" id="ba-search" placeholder="Search all cards…" autocomplete="off" aria-label="Search all cards"><div class="sugg" id="g-ba" hidden></div></div>
      <textarea class="field" id="ba-list" placeholder="1x Sol Ring&#10;1x Arcane Signet&#10;4x Swamp" style="min-height:200px">${esc(dl.text || "")}</textarea>
      <div id="ba-sum" class="parse-sum"></div>
    </div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="ba-go" id="ba-go" disabled>Add to bin</button></footer></div>`;
  } else if (dl.kind === "import") {
    const same = dl.decks.filter(d => S.decks.has(d.id)).length; const binN = dl.bin.reduce((a, c) => a + c.q, 0);
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 id="dlg-t">Import backup</h2><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db"><p class="mono muted" style="margin:0;font-size:11px">${esc(dl.file || "")}</p>
      <p style="margin:0">This backup has <b>${dl.decks.length} deck${dl.decks.length === 1 ? "" : "s"}</b>${binN ? ` and <b>${binN} card${binN === 1 ? "" : "s"}</b> in the card bin` : ""}.</p>
      ${dl.decks.length ? `<ul class="implist">${dl.decks.map(d => `<li><span>${esc(d.name)}</span><span class="mono muted">${(d.commanders || []).map(esc).join(" & ")}</span>${S.decks.has(d.id) ? '<span class="flag warn">Replaces your copy</span>' : '<span class="flag good">New</span>'}</li>`).join("")}</ul>` : ""}
      ${same ? `<p class="muted" style="margin:0;font-size:13px">${same} of these ${same === 1 ? "is" : "are"} already here and will be replaced by the backup's version. Your other decks stay as they are.</p>` : `<p class="muted" style="margin:0;font-size:13px">Your current decks stay as they are.</p>`}
    </div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="imp-go" ${dl.decks.length || binN ? "" : "disabled"}>Import</button></footer></div>`;
  } else if (dl.kind === "copy") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 id="dlg-t">${esc(dl.label)}</h2><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db"><p class="muted" style="margin:0">Your browser blocked copying, so select the text and copy it yourself.</p><textarea class="field" id="c-text" readonly>${esc(dl.text)}</textarea></div>
    <footer><button class="btn primary" data-dlg="close">Done</button></footer></div>`;
  }
  const keepScroll = s.dataset.kind === dl.kind ? s.scrollTop : 0; s.dataset.kind = dl.kind;
  s.innerHTML = h; s.scrollTop = keepScroll;
  if (dl.kind === "new") { updateNewParse(); setTimeout(() => $("#n-name") && !dl.text && $("#n-name").focus(), 0); }
  if (dl.kind === "update") { updateDiff(); setTimeout(() => $("#u-list") && $("#u-list").focus(), 0); }
  if (dl.kind === "binadd") { updateBinAdd(); setTimeout(() => $("#ba-search") && $("#ba-search").focus(), 0); }
  if (dl.kind === "copy") setTimeout(() => { const t = $("#c-text"); if (t) { t.focus(); t.select(); } }, 0);
}
function keepDialogFields() { const n = $("#e-name"), l = $("#e-link"), ds = $("#e-desc"); if (S.dialog && n) { S.dialog.name = n.value; S.dialog.link = l ? l.value : S.dialog.link; if (ds) S.dialog.desc = ds.value; S.dialog.cmds = [...document.querySelectorAll('input[name="e-cmd"]:checked')].map(i => i.value); } }
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 900; const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadArt(file) {
  const dl = S.dialog; if (!dl || dl.kind !== "edit" || !S.assets) return;
  const dd = S.decks.get(dl.id); if (!dd) return;
  if (!/^image\//.test(file.type)) return toast("Choose an image file (JPG, PNG or WebP).");
  keepDialogFields(); dl.uploading = true; renderDialog();
  try {
    const blob = await shrinkImage(file);
    const res = await S.assets.upload(blob, { type: "image/jpeg" });
    const old = dd.art; dd.art = res.id; dd.updatedAt = Date.now(); save(dd);
    if (old) S.assets.delete(old).catch(() => {});
    toast("Panel art saved.");
  } catch (err) {
    const c = err && err.code;
    toast(c === "quota_exceeded" ? "Storage is full. Remove art from another deck first." : c === "too_large" ? "That image is too large. Try a smaller one." : "Couldn't upload that image. Try again or pick a different file.");
  }
  if (S.dialog === dl) { dl.uploading = false; renderDialog(); }
  render();
}
function updateBinAdd() {
  const el = $("#ba-sum"), ta = $("#ba-list"), go = $("#ba-go"); if (!el || !ta) return;
  const p = parseList(ta.value); S.dialog.parsed = p; const n = p.cards.reduce((a, c) => a + c.q, 0);
  if (go) { go.disabled = !n; go.textContent = n ? `Add ${n} card${n > 1 ? "s" : ""} to bin` : "Add to bin"; }
  el.innerHTML = n ? `<span><b class="mono">${n}</b> cards</span><span><b class="mono">${p.cards.length}</b> unique</span>${p.unknown.length ? `<span class="unk">${p.unknown.length} not recognized: ${p.unknown.slice(0, 6).map(esc).join(", ")}</span>` : '<span style="color:var(--good)">All names recognized</span>'}` : "";
}
let baItems = [], baAct = 0;
function showBaSugg(q) {
  const box = $("#g-ba"); if (!box) return; const f = norm(q);
  if (!f) { box.hidden = true; return; }
  const starts = [], contains = [];
  for (let i = 0; i < NAMES.length && starts.length < 10; i++) { const k = NAMES[i]; if (!k.includes(f)) continue; (k.startsWith(f) ? starts : contains).push(CARDS[i]); }
  baItems = [...starts, ...contains].slice(0, 10); baAct = 0;
  if (!baItems.length) { box.hidden = true; return; }
  box.innerHTML = baItems.map((r, i) => `<button type="button" class="${i === 0 ? "act" : ""}" data-bapick="${i}"><span class="nm">${esc(r[0])}</span><span class="meta">${pipsFor(r[1])}</span></button>`).join("");
  box.hidden = false;
}
function baPick(i) {
  const r = baItems[i]; const ta = $("#ba-list"); if (!r || !ta) return;
  const p = parseList(ta.value); const ex = p.cards.find(c => c.n === r[0]);
  if (ex) { ex.q += 1; ta.value = p.cards.map(c => `${c.q}x ${c.n}`).join("\n"); }
  else ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, "") + "\n" : "") + `1x ${r[0]}`;
  S.dialog.text = ta.value; updateBinAdd();
  const s = $("#ba-search"); s.value = ""; $("#g-ba").hidden = true; s.focus();
}
function updateNewParse() {
  const el = $("#n-parse"); const ta = $("#n-list"); if (!el || !ta) return;
  const p = parseList(ta.value); const dl = S.dialog; dl.parsed = p;
  if (!p.cards.length) { el.innerHTML = ""; return; }
  const t = p.cards.reduce((a, c) => a + c.q, 0);
  const leg = p.cards.filter(c => isCmdrPick(rec(c.n))).map(c => c.n);
  if (!dl.cmdTouched) dl.cmds = p.commanders.length ? p.commanders : (leg.length === 1 ? leg : []);
  const opts = [...new Set([...p.commanders, ...leg])];
  el.innerHTML = `<div class="parse-sum"><span><b class="mono">${t}</b> cards</span><span><b class="mono">${p.cards.length}</b> unique</span>${p.unknown.length ? `<span class="unk">${p.unknown.length} not recognized: ${p.unknown.slice(0, 6).map(esc).join(", ")}${p.unknown.length > 6 ? "…" : ""}</span>` : '<span style="color:var(--good)">All names recognized</span>'}</div>
  <div class="f" style="margin-top:10px"><span class="label">Commander</span><div class="cmdpick" style="margin-top:5px">${opts.length ? opts.map(n => `<label><input type="checkbox" name="n-cmd" value="${esc(n)}" ${dl.cmds.includes(n) ? "checked" : ""}>${esc(n)}</label>`).join("") : '<span class="muted" style="font-size:13px">No legendary creatures found. You can set it later.</span>'}</div></div>`;
}
function diffLists(d, p) {
  const cm = curMap(d); const nm = new Map(p.cards.map(c => [c.n, c.q])); const out = [], ins = [];
  for (const [n, q] of cm) { const v = nm.get(n) || 0; if (v < q) out.push({ n, q: q - v }); }
  for (const [n, q] of nm) { const v = cm.get(n) || 0; if (q > v) ins.push({ n, q: q - v }); }
  return { out, ins };
}
function updateDiff() {
  const el = $("#u-diff"); const ta = $("#u-list"); if (!el || !ta) return;
  const d = S.decks.get(S.dialog.id); const p = parseList(ta.value); const go = $("#u-go");
  if (!p.cards.length) { el.innerHTML = ""; if (go) go.disabled = true; return; }
  const { out, ins } = diffLists(d, p); S.dialog.diff = { out, ins };
  if (go) go.disabled = !(out.length || ins.length);
  const li = (a, cls) => a.length ? a.map(x => `<li class="${cls}">${x.q > 1 ? x.q + " " : ""}${esc(x.n)}</li>`).join("") : '<li class="muted">None</li>';
  el.innerHTML = (out.length || ins.length) ? `<div class="diffcols"><div><span class="label" style="color:var(--bad)">Coming out · ${out.reduce((a, x) => a + x.q, 0)}</span><ul>${li(out, "")}</ul></div><div><span class="label" style="color:var(--good)">Going in · ${ins.reduce((a, x) => a + x.q, 0)}</span><ul>${li(ins, "")}</ul></div></div>${p.unknown.length ? `<p class="unk">${p.unknown.length} names not recognized: ${p.unknown.slice(0, 6).map(esc).join(", ")}</p>` : ""}` : `<p class="muted">This list matches the current deck exactly.</p>`;
}

// ---------- events ----------
document.addEventListener("click", e => {
  if (CLOUD.menu && !e.target.closest(".menuwrap [data-act='acct-menu']") && !e.target.closest(".menu")) { CLOUD.menu = false; render(); }
  if (e.target.closest("a")) return;
  const el0 = e.target.closest("[data-editlink]"); if (el0) { e.stopPropagation(); return openDialog({ kind: "edit", id: el0.dataset.editlink }); }
  if (S.menu && !e.target.closest(".menuwrap [data-act='copy-menu']")) { S.menu = false; if (!e.target.closest(".menu")) render(); }
  const t = e.target.closest("button, [data-open]"); if (!t) {
    if (!e.target.closest(".search")) document.querySelectorAll(".sugg").forEach(b => b.hidden = true);
    return;
  }
  const d = S.deckId && S.decks.get(S.deckId);
  if (t.dataset.open) return go("deck", t.dataset.open);
  if (t.dataset.tab) { S.tab = t.dataset.tab; S.filter = ""; S.confirm = null; return render(); }
  if (t.dataset.alltype) { const s = S.allTypes || (S.allTypes = new Set()); const g = t.dataset.alltype; s.has(g) ? s.delete(g) : s.add(g); return render(); }
  if (t.dataset.allcolor) { const s = S.allColors || (S.allColors = new Set()); const c = t.dataset.allcolor; s.has(c) ? s.delete(c) : s.add(c); return render(); }
  if (t.dataset.colormode) { S.colorMode = t.dataset.colormode; return render(); }
  if (t.dataset.allchip) { S.allChip = t.dataset.allchip; return render(); }
  if (t.dataset.pf) { S.printedFilter = t.dataset.pf; return render(); }
  if (t.dataset.cut && d) return stage(d, "out", t.dataset.cut);
  if (t.dataset.rolefilter) { S.roleFilter = S.roleFilter === t.dataset.rolefilter ? null : t.dataset.rolefilter; return render(); }
  if (t.dataset.roleedit) { S.roleEdit = S.roleEdit === t.dataset.roleedit ? null : t.dataset.roleedit; return render(); }
  if (t.dataset.roletoggle && d) { const [n, role] = JSON.parse(t.dataset.roletoggle); const c = d.cur.find(x => x.n === n); if (c) { const now = rolesOf(d, c); setRoles(d, n, now.includes(role) ? now.filter(x => x !== role) : [...now, role]); save(d); render(); } return; }
  if (t.dataset.rolereset && d) { const c = d.cur.find(x => x.n === t.dataset.rolereset); if (c && d.roles) { delete d.roles[roleKey(c)]; if (!Object.keys(d.roles).length) delete d.roles; save(d); render(); } return; }
  if (t.dataset.snap && d) { S.snap = { id: d.id, key: t.dataset.snap }; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.print && d) { const have = curMap(d).get(t.dataset.print) || 0; const p = printedMap(d).get(t.dataset.print) || 0; if (have > p) { printCards(d, [{ n: t.dataset.print, q: have - p }]); save(d); render(); toast(`${t.dataset.print} marked as printed.`); } return; }
  if (t.dataset.printArt !== undefined && S.dialog && S.dialog.kind === "edit") {
    const dd = S.decks.get(S.dialog.id); keepDialogFields(); const art = artNameOf(dd); const id = t.dataset.printArt;
    if (!id) { delete dd.artUrl; delete dd.artId; delete dd.artFor; }
    else { const x = ((PRINTS.get(art) || {}).list || []).find(y => y.id === id); if (x) { dd.artUrl = x.url; dd.artId = x.id; dd.artFor = art; } }
    save(dd); render(); renderDialog(); return;
  }
  if (t.dataset.binrm) { S.confirm = "binrm|" + t.dataset.binrm; return render(); }
  if (t.dataset.binrmYes) { S.loose.cards = S.loose.cards.filter(c => c.n !== t.dataset.binrmYes); S.confirm = null; saveLoose(); render(); return toast("Removed from the bin."); }
  if (t.dataset.binmove) { const [n, id] = JSON.parse(t.dataset.binmove); const got = moveFromBin(n, id); render(); return toast(got ? `Moved ${got}x ${n} from the bin to ${S.decks.get(id).name}.` : "Nothing to move."); }
  if (t.dataset.unprint) { S.confirm = "unprint|" + t.dataset.unprint; return render(); }
  if (t.dataset.unprintYes && d) { const pp = d.printed.find(p => p.n === t.dataset.unprintYes); if (pp) unprintCards(d, [{ n: pp.n, q: pp.q }]); S.confirm = null; save(d); render(); return toast("Removed from printed."); }
  if (t.dataset.bringback && d) return stage(d, "in", t.dataset.bringback);
  if (t.dataset.unstage && d) { const [side, ...n] = t.dataset.unstage.split("|"); return unstage(d, side, n.join("|")); }
  if (t.dataset.qty && d) { const p = t.dataset.qty.split("|"); return bumpQty(d, p[0], p.slice(1, -1).join("|"), +p[p.length - 1]); }
  if (t.dataset.bapick) return baPick(+t.dataset.bapick);
  if (t.dataset.pick) { const [side, i] = t.dataset.pick.split("|"); return pick(side, +i); }
  const act = t.dataset.act;
  if (act === "reg") { S.reg = S.reg ? null : "confirm"; return render(); }
  if (act === "reg-close") { S.reg = null; return render(); }
  if (act === "reg-go") { if (S.reg !== "running") startRefresh(); return; }
  if (act === "export") return exportBackup();
  if (act === "signin") return signIn();
  if (act === "acct-menu") { CLOUD.menu = !CLOUD.menu; return render(); }
  if (act === "signout") { CLOUD.menu = false; return signOutNow(); }
  if (act === "toggle-checks") { S.showChecks = !S.showChecks; return render(); }
  if (act === "toggle-bracket") { S.showBracket = !S.showBracket; return render(); }
  if (act === "role-done") { S.roleEdit = null; return render(); }
  if (act === "snap-close") { S.snap = null; render(); window.scrollTo(0, 0); return; }
  if (act === "copy-snap" && d && S.snap) return copyText(listText(d, versionAt(d, S.snap.key), true), "Past version");
  if (act === "view-date" && d) {
    const v = ($("#h-date") || {}).value || ""; const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return toast("Pick a date first.");
    S.histDate = v; const end = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime();
    if (end < d.createdAt) return toast(`This deck was started on ${fmtDate(d.createdAt)}.`);
    S.snap = { id: d.id, key: end }; render(); window.scrollTo(0, 0); return;
  }
  if (act === "cmp-open" && d) { const pts = versionPoints(d); S.cmp = { a: pts.length > 2 ? pts[pts.length - 2].key : "start", b: "now" }; return render(); }
  if (act === "cmp-close") { S.cmp = null; return render(); }
  if (act === "backup-snooze") { lsSetNum(SNOOZE_KEY, Date.now() + 3 * DAY); return render(); }
  if (act === "example") {
    fetch("data/example-deck.json").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(ex => {
      ex.id = "example-" + uid(); ex.example = true; touch(ex); S.decks.set(ex.id, ex); persist(); go("deck", ex.id);
      toast("Example deck added. Delete it from Edit details when you're done.");
    }).catch(() => toast("Couldn't load the example deck. Check your connection and try again."));
    return;
  }
  if (act === "all") { S.allFilter = ""; return go("all"); }
  if (act === "facet-clear") { S.allTypes = new Set(); S.allColors = new Set(); return render(); }
  if (act === "copy-all") { if ($(".menu")) render(); return copyText((S.allShown || []).filter(x => x.q > 0).sort((a, b) => a.n.localeCompare(b.n)).map(x => `${x.q}x ${x.n}`).join("\n"), "Card list"); }
  if (act === "copy-all-unp") { if ($(".menu")) render(); return copyText((S.allUnprinted || []).sort((a, b) => a.n.localeCompare(b.n)).map(x => `${x.q}x ${x.n}`).join("\n"), "Unprinted cards"); }
  if (act === "bin-add") return openDialog({ kind: "binadd" });
  if (act === "copy-bin") return copyText(binRows().map(r => `${r.total}x ${r.n}`).join("\n"), "Bin list");
  if (act === "copy-menu") { S.menu = !S.menu; return render(); }
  if (act === "new") return openDialog({ kind: "new", cmds: [] });
  if (act === "home") return go("library");
  if (act === "edit" && d) return openDialog({ kind: "edit", id: d.id });
  if (act === "update" && d) return openDialog({ kind: "update", id: d.id });
  if (act === "copy-cur" && d) { if (S.menu === false && $(".menu")) render(); return copyText(listText(d, d.cur, true), "Current list"); }
  if (act === "copy-printed" && d) return copyText(listText(d, d.printed.filter(p => S.printedFilter === "all" || (S.printedFilter === "orig" ? p.o === 0 : p.o === 1)), false), "Printed list");
  if (act === "clear-bench" && d) { d.bench = { out: [], in: [], note: "" }; render(); return save(d); }
  if (act === "commit" && d) return commit(d);
  if (act === "undo") { S.confirm = "undo"; return render(); }
  if (act === "printall") { S.confirm = "printall"; return render(); }
  if (act === "printall-no" || act === "unprint-no" || act === "binrm-no") { S.confirm = null; return render(); }
  if (act === "printall-yes" && d) { const todo = unprinted(d); printCards(d, todo); S.confirm = null; save(d); render(); return toast(`${qsum(todo)} cards marked as printed.`); }
  if (act === "copy-toprint" && d) { if ($(".menu")) render(); return copyText(unprinted(d).map(x => `${x.q}x ${x.n}`).join("\n"), "Unprinted cards"); }
  if (act === "undo-no") { S.confirm = null; return render(); }
  if (act === "undo-yes" && d) { undoLast(d); S.confirm = null; save(d); render(); return toast("Change undone."); }
  const dlg = t.dataset.dlg; if (!dlg) return;
  if (dlg === "close") return closeDialog();
  if (dlg === "create") {
    const p = parseList(($("#n-list") || {}).value || "");
    if (!p.cards.length) { toast("Paste a list first, one card per line."); return; }
    const cmds = [...document.querySelectorAll('input[name="n-cmd"]:checked')].map(i => i.value);
    const name = ($("#n-name").value || "").trim();
    const deck = newDeck({ name, cards: p.cards, commanders: cmds, printedNow: !!($("#n-printed") || {}).checked });
    const link = ($("#n-link").value || "").trim(); if (/^https?:\/\//i.test(link)) deck.link = link;
    const desc = (($("#n-desc") || {}).value || "").trim(); if (desc) deck.desc = desc;
    save(deck); closeDialog(); S.tab = "current"; go("deck", deck.id); toast(deck.printed.length ? "Deck created and marked as printed." : "Deck created. Mark cards as printed once you have them.");
    return;
  }
  if (dlg === "save-edit") {
    const dd = S.decks.get(S.dialog.id);
    dd.name = ($("#e-name").value || "").trim() || dd.name;
    const link = ($("#e-link").value || "").trim(); if (!link) delete dd.link; else if (/^https?:\/\//i.test(link)) dd.link = link;
    const desc = (($("#e-desc") || {}).value || "").trim(); if (desc) dd.desc = desc; else delete dd.desc;
    dd.commanders = [...document.querySelectorAll('input[name="e-cmd"]:checked')].map(i => i.value);
    dd.updatedAt = Date.now(); save(dd); closeDialog(); render(); return;
  }
  if (dlg === "prints-retry" && S.dialog) { const dd = S.decks.get(S.dialog.id); PRINTS.delete(artNameOf(dd)); keepDialogFields(); return renderDialog(); }
  if (dlg === "imp-go") { const dl = S.dialog; applyImport(dl); closeDialog(); go("library"); return toast(`Imported ${dl.decks.length} deck${dl.decks.length === 1 ? "" : "s"}.`); }
  if (dlg === "ba-go") { const p = parseList(($("#ba-list") || {}).value || ""); const n = addToBin(p.cards); closeDialog(); render(); return toast(n ? `Added ${n} card${n > 1 ? "s" : ""} to the card bin.` : "Nothing to add."); }
  if (dlg === "art-rm") { const dd = S.decks.get(S.dialog.id); keepDialogFields(); const old = dd.art; delete dd.art; delete dd.artPos; save(dd); render(); renderDialog(); if (old && S.assets) S.assets.delete(old).catch(() => {}); return toast("Panel art removed."); }
  if (dlg === "del") { S.dialog.del = true; return renderDialog(); }
  if (dlg === "del-no") { S.dialog.del = false; return renderDialog(); }
  if (dlg === "del-yes") {
    const id = S.dialog.id; const dd = S.decks.get(id); const keepEl = $("#del-keep"); const keep = !!(keepEl && keepEl.checked);
    let kept = 0;
    if (dd && keep) { const now = Date.now(); for (const p of dd.printed) if (p.q > 0) { S.loose.cards.push({ n: p.n, q: p.q, from: dd.name, at: now }); kept += p.q; } saveLoose(); }
    if (dd && dd.art && S.assets) S.assets.delete(dd.art).catch(() => {});
    closeDialog(); removeDeck(id); go("library"); return toast(kept ? `Deck deleted. ${kept} printed cards moved to the card bin.` : "Deck deleted.");
  }
  if (dlg === "to-bench") {
    const dd = S.decks.get(S.dialog.id); const df = S.dialog.diff; if (!df) return;
    dd.bench = { out: df.out, in: df.ins, note: dd.bench.note || "", kind: "import" };
    closeDialog(); S.tab = "current"; render(); save(dd); toast("Changes are on the swap bench. Review, then save."); return;
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "s-sort") { S.sort = e.target.value; try { localStorage.setItem("ledger-sort", S.sort); } catch {} render(); const el = $("#s-sort"); if (el) el.focus(); return; }
  if (e.target.id === "imp-file" && e.target.files && e.target.files[0]) { readBackup(e.target.files[0]); e.target.value = ""; return; }
  if (e.target.id === "e-artcard" && S.dialog) { const dd = S.decks.get(S.dialog.id); keepDialogFields(); if (e.target.value === "__none") dd.artOff = true; else { dd.artOff = false; dd.artCard = e.target.value; } save(dd); render(); renderDialog(); return; }
  if (e.target.id === "e-artpos" && S.dialog) { const dd = S.decks.get(S.dialog.id); keepDialogFields(); dd.artPos = e.target.value; save(dd); render(); renderDialog(); return; }
  if (e.target.id === "del-keep" && S.dialog) S.dialog.keep = e.target.checked;
  if ((e.target.id === "cmp-a" || e.target.id === "cmp-b") && S.cmp) { S.cmp[e.target.id.slice(4)] = e.target.value; const id = e.target.id; render(); const el = $("#" + id); if (el) el.focus(); return; }
  if (e.target.id === "h-date") S.histDate = e.target.value;
  if (e.target.id === "n-printed" && S.dialog) S.dialog.printedNow = e.target.checked;
  if (e.target.name === "n-cmd" && S.dialog) { S.dialog.cmdTouched = true; S.dialog.cmds = [...document.querySelectorAll('input[name="n-cmd"]:checked')].map(i => i.value); }
});
document.addEventListener("input", e => {
  const id = e.target.id; const d = S.deckId && S.decks.get(S.deckId);
  if (id === "f-all") { S.allFilter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-all"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (id === "f-bin") { S.binFilter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-bin"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (id === "f-cur") { S.filter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-cur"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if ((id === "s-out" || id === "s-in") && d) return showSugg(id.slice(2), e.target.value, d);
  if (id === "b-note" && d) { d.bench.note = e.target.value; saveSoon(d); return; }
  if (id === "n-list" && S.dialog) { S.dialog.text = e.target.value; return updateNewParse(); }
  if (id === "n-name" && S.dialog) S.dialog.name = e.target.value;
  if (id === "n-link" && S.dialog) S.dialog.link = e.target.value;
  if (id === "n-desc" && S.dialog) S.dialog.desc = e.target.value;
  if (id === "ba-list" && S.dialog) { S.dialog.text = e.target.value; return updateBinAdd(); }
  if (id === "ba-search") return showBaSugg(e.target.value);
  if (id === "u-list" && S.dialog) { S.dialog.text = e.target.value; return updateDiff(); }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".deckbox[data-open]")) { e.preventDefault(); return go("deck", e.target.dataset.open); }
  if (e.target.id === "ba-search") {
    const box = $("#g-ba"); if (!box || box.hidden) return; const btns = [...box.querySelectorAll("button")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); baAct = (baAct + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle("act", i === baAct)); return; }
    if (e.key === "Enter") { e.preventDefault(); return baPick(baAct); }
    if (e.key === "Escape") { e.preventDefault(); box.hidden = true; return; }
  }
  if (e.key === "Escape" && S.dialog) return closeDialog();
  const id = e.target.id; if (id !== "s-out" && id !== "s-in") return;
  const side = id.slice(2); const box = $("#g-" + side); if (!box || box.hidden) return;
  const btns = [...box.querySelectorAll("button")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); suggState.act = (suggState.act + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle("act", i === suggState.act)); btns[suggState.act].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") { e.preventDefault(); pick(side, suggState.act); }
  else if (e.key === "Escape") box.hidden = true;
});
document.addEventListener("focusin", e => {
  const id = e.target.id; const d = S.deckId && S.decks.get(S.deckId);
  if ((id === "s-out" || id === "s-in") && d && e.target.value) showSugg(id.slice(2), e.target.value, d);
});

// drag and drop
let dragInfo = null;
document.addEventListener("dragstart", e => {
  const r = e.target.closest && e.target.closest("[data-drag]"); if (!r) return;
  dragInfo = { from: r.dataset.drag, n: r.dataset.name };
  try { e.dataTransfer.setData("text/plain", r.dataset.name); e.dataTransfer.effectAllowed = "move"; } catch {}
  r.classList.add("dragging");
});
document.addEventListener("dragend", e => {
  const r = e.target.closest && e.target.closest("[data-drag]"); if (r) r.classList.remove("dragging");
  document.querySelectorAll(".hot, .drop-ok").forEach(x => x.classList.remove("hot", "drop-ok")); dragInfo = null;
});
const accepts = (zone, info) => info && ((zone === "out" && info.from === "cur") || (zone === "in" && (info.from === "removed")));
document.addEventListener("dragover", e => {
  const z = e.target.closest && e.target.closest("[data-drop]"); if (!z || !accepts(z.dataset.drop, dragInfo)) return;
  e.preventDefault(); z.classList.add(z.classList.contains("tab") ? "drop-ok" : "hot");
});
document.addEventListener("dragleave", e => {
  const z = e.target.closest && e.target.closest("[data-drop]"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("hot", "drop-ok");
});
document.addEventListener("drop", e => {
  const z = e.target.closest && e.target.closest("[data-drop]"); const d = S.deckId && S.decks.get(S.deckId);
  if (!z || !d || !accepts(z.dataset.drop, dragInfo)) return;
  e.preventDefault(); const info = dragInfo; dragInfo = null; stage(d, z.dataset.drop, info.n);
  if (z.classList.contains("tab")) toast(`${info.n} staged to cut. Save it on the swap bench.`);
});

document.addEventListener("error", e => { const el = e.target; if (el && el.classList && (el.classList.contains("tile-art") || el.classList.contains("artprev"))) el.style.visibility = "hidden"; }, true);
fromHash();
boot();
})();
