// js/src/12-stats.js: the deck's Stats tab: colors against land sources, the mana curve by card type, and a sample hand.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.

// ---------- stats tab ----------
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };
// Card types in the curve, in a fixed order; each keeps its color (--series-1…8) whatever the deck holds.
const CURVE_TYPES = [["C", "Creatures"], ["I", "Instants"], ["S", "Sorceries"], ["A", "Artifacts"], ["E", "Enchantments"], ["P", "Planeswalkers"], ["B", "Battles"], ["O", "Other"]];
const BASIC_MAKES = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G", wastes: "C" };

// Coloured mana symbols in a card's cost (both halves of a split card). Hybrid symbols count half for each color.
function pipsOf(n) {
  const r = rec(n), out = {}; if (!r || !r[1]) return out;
  for (const s of r[1].replace(/ \/\/ /g, " ").split(" ")) {
    const cols = (s.match(/[WUBRGC]/g) || []).filter((c, i, a) => a.indexOf(c) === i);
    if (!cols.length || /^\d+$/.test(s)) continue;
    const share = /^\d+\//.test(s) || /\/P$/.test(s) && cols.length === 1 ? 1 : 1 / cols.length; // 2/W and W/P count as one W
    for (const c of cols) out[c] = (out[c] || 0) + share;
  }
  return out;
}
// The colors a land makes ("" if it makes none, or isn't known yet; "*" fetches any basic).
function landMakes(n) {
  const r = rec(n); if (r && r[8]) return r[8];
  const b = norm(n).replace(/^snow-covered /, ""); return BASIC_MAKES[b] || "";
}
// Whether this card list records land colors at all (lists built before that was added don't).
let landDataKnown = null;
const hasLandData = () => landDataKnown === null ? (landDataKnown = CARDS.some(r => r && r[8])) : landDataKnown;
function statsOf(d) {
  const cmdrs = new Set(d.commanders || []), deckCols = (deckCI(d) || "").split("").filter(Boolean);
  const pips = {}, sources = {}, curve = Array.from({ length: 8 }, () => ({})), types = {};
  let lands = 0, noColor = 0, unknownLands = 0, spells = 0, mvSum = 0;
  for (const c of d.cur) {
    const tc = typeOf(c.n);
    if (tc === "L") {
      lands += c.q; const m = landMakes(c.n);
      if (!m && (!rec(c.n) || !hasLandData())) { unknownLands += c.q; continue; }
      const cols = m === "*" ? deckCols : m.split("");
      if (!cols.some(x => x !== "C")) noColor += c.q;
      for (const x of cols) sources[x] = (sources[x] || 0) + c.q;
      continue;
    }
    for (const [x, v] of Object.entries(pipsOf(c.n))) pips[x] = (pips[x] || 0) + v * c.q;
    if (cmdrs.has(c.n)) continue; // the commander isn't part of the curve
    const mv = cmcOf(c.n), k = CURVE_TYPES.some(([t]) => t === tc) ? tc : "O";
    curve[Math.min(7, mv)][k] = (curve[Math.min(7, mv)][k] || 0) + c.q;
    types[k] = (types[k] || 0) + c.q; spells += c.q; mvSum += mv * c.q;
  }
  return { pips, sources, curve, types, lands, noColor, unknownLands, spells, avg: spells ? mvSum / spells : 0, deckCols };
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const fmtN = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
function renderStats(d) {
  const st = statsOf(d);
  return `<div class="statsview">${statsColors(st)}${statsCurve(st)}${statsHand(d)}</div>`;
}
// Colors: each color's share of the colored symbols beside its share of what the lands make.
function statsColors(st) {
  const cols = ["W", "U", "B", "R", "G", "C"].filter(x => st.deckCols.includes(x) || (st.pips[x] || 0) > 0);
  if (!cols.length) return `<section class="st-sec"><h3>Colors</h3><p class="muted">No colored mana symbols in this deck.</p></section>`;
  const pipTotal = cols.reduce((a, x) => a + (st.pips[x] || 0), 0), srcTotal = cols.reduce((a, x) => a + (st.sources[x] || 0), 0);
  const rows = cols.map(x => {
    const p = st.pips[x] || 0, s = st.sources[x] || 0, ps = pct(p, pipTotal), ss = pct(s, srcTotal), short = p > 0 && ss < ps - 10;
    return `<div class="st-color${short ? " short" : ""}">
      <span class="pip ${x}" aria-hidden="true">${x}</span><span class="st-cname">${COLOR_NAME[x]}</span>
      <div class="st-pair">
        <div class="st-bar"><span class="label">Symbols</span><div class="track"><i style="width:${ps}%"></i></div><span class="mono">${ps}%<small> · ${fmtN(p)}</small></span></div>
        <div class="st-bar land"><span class="label">Lands</span><div class="track"><i style="width:${ss}%"></i></div><span class="mono">${ss}%<small> · ${s} land${s === 1 ? "" : "s"}</small></span></div>
      </div>
      ${short ? `<span class="flag warn">Few ${COLOR_NAME[x].toLowerCase()} sources</span>` : ""}
    </div>`;
  }).join("");
  const notes = [`${st.lands} land${st.lands === 1 ? "" : "s"}. A land that makes two colors counts for both; fetch lands count for the colors they find.`];
  if (st.noColor) notes.push(`${st.noColor} make${st.noColor === 1 ? "s" : ""} no colored mana.`);
  if (st.unknownLands) notes.push(`${st.unknownLands} land${st.unknownLands === 1 ? "'s colors aren't" : "s' colors aren't"} known yet.`);
  return `<section class="st-sec"><h3>Colors <span class="muted">symbols in your spells against the colors your lands make</span></h3>${rows}<p class="muted st-note">${notes.join(" ")}</p></section>`;
}
// The mana curve, each bar split by card type; a table gives the exact counts.
function statsCurve(st) {
  const present = CURVE_TYPES.map(([t, name], i) => ({ t, name, slot: i + 1 })).filter(x => st.types[x.t]);
  const totals = st.curve.map(b => Object.values(b).reduce((a, v) => a + v, 0)), mx = Math.max(1, ...totals);
  if (!st.spells) return `<section class="st-sec"><h3>Mana curve</h3><p class="muted">No spells yet.</p></section>`;
  const bars = st.curve.map((b, mv) => {
    const segs = present.filter(x => b[x.t]).map(x => `<i class="seg s${x.slot}" style="height:${b[x.t] / mx * 100}%" title="${x.name}, mana value ${mv === 7 ? "7 or more" : mv}: ${b[x.t]}"></i>`).join("");
    return `<div class="st-col"><span class="mono st-tot">${totals[mv] || ""}</span><div class="st-stack">${segs}</div><span class="mono st-mv">${mv === 7 ? "7+" : mv}</span></div>`;
  }).join("");
  const legend = present.map(x => `<span class="st-key"><i class="s${x.slot}"></i>${x.name} <b class="mono">${st.types[x.t]}</b></span>`).join("");
  const table = `<table class="st-table"><thead><tr><th scope="col">Type</th>${st.curve.map((_, mv) => `<th scope="col">${mv === 7 ? "7+" : mv}</th>`).join("")}<th scope="col">All</th></tr></thead><tbody>`
    + present.map(x => `<tr><th scope="row"><i class="s${x.slot}"></i>${x.name}</th>${st.curve.map(b => `<td>${b[x.t] || ""}</td>`).join("")}<td>${st.types[x.t]}</td></tr>`).join("")
    + `</tbody></table>`;
  return `<section class="st-sec"><h3>Mana curve <span class="muted">${st.spells} spells, not counting lands or your commander · average mana value ${st.avg.toFixed(2)}</span></h3>
    <div class="st-curve" role="img" aria-label="Mana curve: ${totals.map((v, mv) => `${v} at ${mv === 7 ? "7 or more" : mv}`).join(", ")}">${bars}</div>
    <div class="st-legend">${legend}</div><details class="st-details"><summary>Counts by type</summary><div class="st-tablewrap">${table}</div></details></section>`;
}
// A sample opening hand: seven cards from the deck (not the commander), shuffled. Mulligans follow the London
// rule (draw seven, put one on the bottom per mulligan), with the first mulligan free as in multiplayer Commander.
function newHand(d, mull) {
  const cmdrs = new Set(d.commanders || []), lib = [];
  for (const c of d.cur) if (!cmdrs.has(c.n)) for (let k = 0; k < c.q; k++) lib.push(c.n);
  for (let k = lib.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [lib[k], lib[j]] = [lib[j], lib[k]]; }
  S.hand = { id: d.id, lib, shown: Math.min(7, lib.length), mull: mull || 0 };
}
function statsHand(d) {
  if (!S.hand || S.hand.id !== d.id) newHand(d, 0);
  const h = S.hand, cards = h.lib.slice(0, h.shown), lands = cards.filter(n => typeOf(n) === "L").length;
  const bottom = Math.max(0, h.mull - 1), drawn = h.shown - Math.min(7, h.lib.length);
  const note = h.mull ? `Mulligan ${h.mull}: ${bottom ? `put ${bottom} card${bottom === 1 ? "" : "s"} on the bottom` : "the first one is free in multiplayer Commander, so keep all seven"}.` : "";
  return `<section class="st-sec"><h3>Sample hand <span class="muted">${cards.length ? `${lands} land${lands === 1 ? "" : "s"} in ${cards.length} cards${drawn > 0 ? `, ${drawn} drawn` : ""}` : "no cards to draw"}</span></h3>
    <div class="st-handbar"><button class="btn sm" data-act="hand-new">New hand</button><button class="btn sm" data-act="hand-mull">Mulligan</button><button class="btn sm" data-act="hand-draw"${h.shown >= h.lib.length ? " disabled" : ""}>Draw a card</button>${note ? `<span class="muted st-mull">${note}</span>` : ""}</div>
    <div class="hand">${cards.map((n, i) => `<figure class="hand-card${i >= 7 ? " drawn" : ""}"><img src="${esc(imgUrl(n))}" alt="${esc(n)}" loading="lazy" onerror="this.remove()"><figcaption>${esc(n)}</figcaption></figure>`).join("")}</div></section>`;
}
