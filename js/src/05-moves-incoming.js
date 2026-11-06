// js/src/05-moves-incoming.js: moving cards between decks, and incoming changes.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- moving cards between decks ----------
// Cuts cards from one deck (and its owned list) and adds them to another as owned. Both decks log the move
// with a shared id, so undoing it from either deck reverses both sides.
function transferCards(src, dst, items) {
  items = items.filter(x => x.q > 0); if (!items.length) return 0;
  const xid = uid();
  applyChange(src, items, [], "", "swap");
  const se = src.log[src.log.length - 1]; se.xfer = { id: xid, to: { id: dst.id, name: dst.name } };
  const lost = [];
  for (const x of items) {
    const p = src.printed.find(y => y.n === x.n); if (!p) continue;
    const take = Math.min(p.q, x.q); if (take <= 0) continue;
    lost.push({ n: x.n, q: take, at: p.at, o: p.o }); p.q -= take;
    if (p.q <= 0) src.printed = src.printed.filter(y => y !== p);
  }
  if (lost.length) se.lost = lost;
  applyChange(dst, [], items, "", "swap");
  const de = dst.log[dst.log.length - 1]; de.xfer = { id: xid, from: { id: src.id, name: src.name } };
  ownNew(dst, de, items);
  save(src); save(dst); return qsum(items);
}
// The other deck's half of a move, if that deck still exists and still has it.
function xferPartner(e) {
  if (!e || !e.xfer) return null;
  const other = S.decks.get((e.xfer.to || e.xfer.from || {}).id); if (!other) return null;
  const pe = other.log.find(x => x.xfer && x.xfer.id === e.xfer.id && x !== e);
  return pe ? { deck: other, entry: pe } : null;
}

// ---------- incoming: changes waiting for their cards to arrive ----------
// Saved swaps stay off the deck list until the cards show up, so the list matches what's in the box.
const incomingOf = d => Array.isArray(d.incoming) ? d.incoming : [];
function leavingMap(d) { const m = new Map(); for (const b of incomingOf(d)) for (const o of b.out) m.set(o.n, (m.get(o.n) || 0) + o.q); return m; }
// Incoming cards not already sitting in the box as owned spares.
function toGet(d, b) {
  const cm = curMap(d), pm = printedMap(d); const spare = new Map();
  for (const [n, q] of pm) { const v = q - (cm.get(n) || 0); if (v > 0) spare.set(n, v); }
  return b.in.map(x => { const have = Math.min(x.q, spare.get(x.n) || 0); if (have) spare.set(x.n, spare.get(x.n) - have); return { n: x.n, q: x.q - have, have }; });
}
// Cards still to get across all of a deck's incoming changes.
function incomingNeeds(d) { const m = new Map(); for (const b of incomingOf(d)) for (const x of toGet(d, b)) if (x.q > 0) m.set(x.n, (m.get(x.n) || 0) + x.q); return [...m].map(([n, q]) => ({ n, q })); }
const incomingNet = d => incomingOf(d).reduce((a, b) => a + qsum(b.in) - qsum(b.out), 0);
// Cards in a deck's list are owned. After a change, record any new copies as owned (on the change itself, so undo takes them back).
function ownNew(d, e, ins) {
  const cm = curMap(d), pm = printedMap(d); const got = [];
  for (const x of ins) { const v = Math.min(x.q, (cm.get(x.n) || 0) - (pm.get(x.n) || 0)); if (v > 0) { got.push({ n: x.n, q: v }); markPrinted(d, x.n, v); pm.set(x.n, (pm.get(x.n) || 0) + v); } }
  if (got.length) e.got = got;
  return qsum(got);
}
// Older decks could hold cards that weren't owned yet. Those move out of the list into an incoming change.
function convertUnowned(d) {
  const u = unprinted(d); if (!u.length || !Array.isArray(d.cur)) return false;
  const cm = curMap(d); for (const x of u) { const v = (cm.get(x.n) || 0) - x.q; if (v > 0) cm.set(x.n, v); else cm.delete(x.n); }
  d.cur = d.cur.filter(c => cm.has(c.n)).map(c => ({ n: c.n, q: cm.get(c.n) }));
  const now = Date.now(); const id = uid(); const note = "Cards on the list that weren't marked as owned yet.";
  d.incoming = [...incomingOf(d), { id, t: now, out: [], in: u, note, fromList: true }];
  d.log.push({ id, t: now, kind: "incoming", out: [], in: u, fromList: u, note });
  d.updatedAt = now; return true;
}
function saveIncoming(d) {
  const b = d.bench; const out = b.out.filter(x => x.q > 0), ins = b.in.filter(x => x.q > 0);
  if (!out.length && !ins.length) return;
  const cm = curMap(d), lv = leavingMap(d);
  const over = out.find(x => x.q > (cm.get(x.n) || 0) - (lv.get(x.n) || 0));
  if (over) return toast(`${over.n} is already leaving in another incoming change.`);
  const note = (($("#b-note") || {}).value || b.note || "").trim();
  const batch = { id: uid(), t: Date.now(), out, in: ins }; if (note) batch.note = note; if (b.kind === "import") batch.kind = "import";
  d.incoming = [...incomingOf(d), batch];
  const e = { id: batch.id, t: batch.t, kind: "incoming", out, in: ins }; if (note) e.note = note; d.log.push(e);
  d.bench = { out: [], in: [], note: "" }; clearTimeout(benchTimers.get(d.id)); d.updatedAt = Date.now(); S.benchOpen = false;
  save(d); render(); toast(`Saved as incoming. The deck list stays as it is until you press Arrived.`);
}
function arrive(d, id) {
  const b = incomingOf(d).find(x => x.id === id); if (!b) return;
  d.incoming = incomingOf(d).filter(x => x !== b); if (!d.incoming.length) delete d.incoming;
  applyChange(d, b.out, b.in, b.note || "", b.kind === "import" ? "import" : "swap");
  const sw = d.log[d.log.length - 1]; sw.inc = { id: b.id, t: b.t };
  const n = ownNew(d, sw, b.in);
  save(d); render(); toast(`Arrived. ${n ? `${n} card${n > 1 ? "s" : ""} added to owned and the` : "The"} change is in the deck. Undo it from History if that was early.`);
}
function dropIncoming(d, id, toBench) {
  const b = incomingOf(d).find(x => x.id === id); if (!b) return;
  if (toBench && (d.bench.out.length || d.bench.in.length)) return toast("Save or clear the swap bench first.");
  d.incoming = incomingOf(d).filter(x => x !== b); if (!d.incoming.length) delete d.incoming;
  d.log = d.log.filter(e => !(e.kind === "incoming" && e.id === b.id));
  if (toBench) { d.bench = { out: b.out, in: b.in, note: b.note || "" }; if (b.kind === "import") d.bench.kind = "import"; }
  d.updatedAt = Date.now(); save(d); render(); toast(toBench ? "Back on the swap bench. Change it, then save again." : "Incoming change cancelled.");
}
function renderIncoming(d) {
  const list = incomingOf(d); if (!list.length) return "";
  const inBin = new Set(binRows().filter(r => r.srcs.some(x => x.id !== d.id)).map(r => r.n));
  const sourcesOf = n => [...(inBin.has(n) ? [{ id: "_bin", label: "Card bin" }] : []), ...[...S.decks.values()].filter(x => x.id !== d.id).map(x => ({ x, q: curMap(x).get(n) || 0 })).filter(o => o.q).map(o => ({ id: o.x.id, label: o.x.name + (o.q > 1 ? ` (${o.q})` : "") }))];
  const grabBoxFor = (x, need) => {
    if (!need.some(y => y.n === x.n)) return "";
    const src = sourcesOf(x.n); if (!src.length) return "";
    return `<span class="grabbox"><select class="field grab-src" aria-label="Where to grab ${esc(x.n)} from">${src.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select><button class="grab" title="Take this copy into this deck" data-grab="${esc(JSON.stringify([x.n, d.id]))}">${ICONS.down}Grab</button></span>`;
  };
  return `<div class="incoming">${list.map(b => {
    const get = toGet(d, b); const need = get.filter(x => x.q > 0); const have = get.filter(x => x.have > 0); const grabBox = x => grabBoxFor(x, need);
    const nIn = qsum(b.in), nOut = qsum(b.out);
    const conf = S.confirm === "inc-cancel|" + b.id;
    return `<div class="inc" data-inc="${esc(b.id)}"><div class="inc-head"><span class="label">${ICONS.inbox}Incoming since ${fmtShort(b.t)}</span><b>${nIn ? `${nIn} card${nIn > 1 ? "s" : ""} coming in` : "No new cards"}${nOut ? `, ${nOut} leaving` : ""}</b></div>
      ${swapLines(b, grabBox)}${b.note ? `<div class="note">${esc(b.note)}</div>` : ""}
      ${have.length ? `<div class="inc-have">Already in your box: ${have.map(x => esc(x.n) + (x.have > 1 ? ` ×${x.have}` : "")).join(", ")}</div>` : ""}
      <div class="inc-acts">${conf ? `<span class="confirm">Cancel this incoming change? <button class="btn sm danger" data-inc-cancel-yes="${esc(b.id)}">Cancel it</button><button class="btn sm ghost" data-act="inc-cancel-no">Keep</button></span>` : `<button class="btn sm primary" data-arrive="${esc(b.id)}">${ICONS.printed}Arrived</button>${need.length ? `<button class="btn sm" data-inc-copy="${esc(b.id)}" title="Copy the cards you still need to get">${ICONS.copy}Copy list<span class="mono muted">${qsum(need)}</span></button>` : ""}<button class="btn sm ghost" data-inc-bench="${esc(b.id)}">Back to bench</button><button class="btn sm ghost" data-inc-cancel="${esc(b.id)}">Cancel</button>`}</div></div>`;
  }).join("")}</div>`;
}
