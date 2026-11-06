// js/src/01-cards.js: the card index, small helpers and reading pasted lists.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
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
// A card's name, linked to its Scryfall page (on phones a tap shows the picture first, with the link in it).
const cardLink = n => `<a class="cname" href="${scry(n)}" target="_blank" rel="noopener" draggable="false">${esc(n)}</a>`;
// A deck's name that opens that deck, or plain text if the deck is gone.
const deckLink = ref => { if (!ref) return ""; const dk = ref.id ? S.decks.get(ref.id) : [...S.decks.values()].find(x => x.name === ref.name); return dk ? `<button class="deckref" data-open="${esc(dk.id)}" title="Open ${esc(dk.name)}">${esc(ref.name || dk.name)}</button>` : esc(ref.name || ""); };
const MANA_ORDER = "WUBRG";

const ICONS = {
  pin: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 2h5l-.8 4.2 2.3 2.3v1.2H4V8.5l2.3-2.3zM8 9.7V14"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="5" height="5"/><path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.6 1.6M11.4 11.4 13 13M13 3l-1.6 1.6M4.6 11.4 3 13"/></svg>',
  moon: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.5 2.5h-3v2h-2v2h-2v3h2v2h2v2h3v-2h-2v-2h-2v-3h2v-2h2z"/></svg>',
  chev: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 6 4 4 4-4"/></svg>',
  back: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>',
  cut: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4.5" r="2"/><circle cx="4" cy="11.5" r="2"/><path d="M5.6 5.6 14 12M5.6 10.4 14 4"/></svg>',
  ext: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5"/></svg>',
  back2: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4 2.5 7.5 6 11"/><path d="M3 7.5h7a3.5 3.5 0 0 1 0 7H8"/></svg>',
  x: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h7"/></svg>',
  caret: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="width:12px;height:12px"><path d="m4 6 4 4 4-4"/></svg>',
  down: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>',
  up: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10"/></svg>',
  user: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c.8-2.8 3-4.3 5.5-4.3s4.7 1.5 5.5 4.3"/></svg>',
  stack: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.5" y="2" width="8" height="10.5" rx="1"/><path d="M2.5 4.5v9h7.5"/></svg>',
  printed: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  inbox: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v7M5 6.5 8 9.5l3-3"/><path d="M2.5 9.5h3l1 2h3l1-2h3V13.5h-11z"/></svg>',
  combo: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.6 5.2C2.8 5.2 1.5 6.4 1.5 8s1.3 2.8 3.1 2.8c2.6 0 4.2-5.6 6.8-5.6 1.8 0 3.1 1.2 3.1 2.8s-1.3 2.8-3.1 2.8c-2.6 0-4.2-5.6-6.8-5.6z"/></svg>',
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
