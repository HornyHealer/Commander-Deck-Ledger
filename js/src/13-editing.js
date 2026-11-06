// js/src/13-editing.js: suggestions, the swap bench and the clipboard.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
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
  if (sheetMode() && !S.benchOpen) toast(`${n} added to the swap bench${side === "out" ? " to cut" : ""}.`);
}
const sheetMode = () => window.matchMedia && matchMedia("(max-width: 900px)").matches;
function unstage(d, side, n) { d.bench[side] = d.bench[side].filter(x => x.n !== n); render(); saveSoon(d); }
function bumpQty(d, side, n, delta) {
  const x = d.bench[side].find(x => x.n === n); if (!x) return;
  const max = side === "out" ? (curMap(d).get(n) || 1) : 99;
  x.q = Math.max(1, Math.min(max, x.q + delta)); render(); saveSoon(d);
}
function commit(d) {
  const note = ($("#b-note") || {}).value || d.bench.note || "";
  const kind = d.bench.kind === "import" ? "import" : "swap";
  const ins = d.bench.in;
  applyChange(d, d.bench.out, ins, note, kind);
  ownNew(d, d.log[d.log.length - 1], ins);
  const n = d.bench.out.length + d.bench.in.length;
  d.bench = { out: [], in: [], note: "" };
  clearTimeout(benchTimers.get(d.id));
  S.benchOpen = false; save(d); render(); toast(`Saved ${n} card change${n > 1 ? "s" : ""} to history.`);
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
