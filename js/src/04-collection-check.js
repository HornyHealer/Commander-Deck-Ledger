// js/src/04-collection-check.js: the collection check: which cards of a pasted list you already own.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- collection check: which cards of a pasted list you already own ----------
function collectionCheck(cards) {
  const bin = new Map(binRows().map(r => [r.n, r]));
  const inDecks = new Map(); const incoming = new Map();
  for (const d of S.decks.values()) {
    for (const c of d.cur) { if (!inDecks.has(c.n)) inDecks.set(c.n, []); inDecks.get(c.n).push({ id: d.id, name: d.name, q: c.q }); }
    for (const u of incomingNeeds(d)) { if (!incoming.has(u.n)) incoming.set(u.n, []); incoming.get(u.n).push(d.name); }
  }
  return cards.map(c => {
    if (isBasic(c.n)) return { n: c.n, q: c.q, basic: true };
    const b = bin.get(c.n); const fromBin = Math.min(c.q, b ? b.total : 0);
    const decks = inDecks.get(c.n) || []; const fromDecks = Math.min(c.q - fromBin, decks.reduce((a, x) => a + x.q, 0));
    return { n: c.n, q: c.q, fromBin, fromDecks, need: c.q - fromBin - fromDecks, decks, binFrom: b ? b.srcs.map(x => x.name) : [], binInc: b && b.inc, incoming: incoming.get(c.n) || [] };
  });
}
let CHECK_TEXT = "", CHECK_LINK = ""; try { CHECK_TEXT = localStorage.getItem("cdl-check-text") || ""; CHECK_LINK = localStorage.getItem("cdl-check-link") || ""; } catch {}
function renderCheck() {
  return `<button class="crumb" data-act="home">${ICONS.back}All decks</button>
  <div class="dhead"><div><div class="eyebrow"><span class="label">Collection</span></div><h2>Check a list</h2><div class="dn">Paste any deck list to see which cards you already own</div></div></div>
  <div class="check-grid"><div class="check-input"><div class="f"><label class="label" for="chk-link">Archidekt link (optional)</label><div class="linkrow"><input class="field" id="chk-link" placeholder="https://archidekt.com/decks/…" value="${esc(CHECK_LINK)}" autocomplete="off"><button class="btn sm" data-arch="chk" data-act="arch-fetch">${ICONS.down}Fetch</button></div><p class="fetch-msg" id="chk-fetch-msg" hidden></p></div><label class="f"><span class="label">Deck list</span><textarea class="field" id="chk-list" placeholder="1 Zagras, Thief of Heartbeats [Commander]&#10;1 Sol Ring&#10;1 Arcane Signet&#10;30 Mountain">${esc(CHECK_TEXT)}</textarea></label></div>
    <div id="chk-results" aria-live="polite">${checkResults()}</div></div>`;
}
function checkResults() {
  const p = parseList(CHECK_TEXT); S.checkParsed = p;
  if (!p.cards.length) return `<div class="empty"><h2>Nothing to check yet</h2><p>Paste a list on the left and each card is sorted into what's free in your card bin, what's owned in another deck, and what you'd need to get.</p></div>`;
  const rows = collectionCheck(p.cards); S.checkRows = rows;
  const tot = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const basics = rows.filter(r => r.basic); const nBasic = qsum(basics);
  const nBin = tot("fromBin"), nDeck = tot("fromDecks"), nNeed = tot("need"), all = qsum(rows);
  const list = (arr, fn) => arr.length ? arr.sort((a, b) => a.n.localeCompare(b.n)).map(fn).join("") : "";
  const rc = r => { const x = rec(r.n); return x ? pipsFor(x[1]) : "<span></span>"; };
  const line = (r, q, sub, flags = "") => `<div class="row"><span class="q">${q}</span><span class="nm"><span>${cardLink(r.n)}</span>${flags}${sub ? `<small>${sub}</small>` : ""}</span>${rc(r)}<span class="acts"></span></div>`;
  const binL = list(rows.filter(r => r.fromBin), r => line(r, r.fromBin, [...new Set(r.binFrom)].map(x => x === "Added directly" ? "Added to the bin" : "Spare from " + esc(x)).join(" · "), r.binInc ? `<span class="flag leaving">Incoming for ${esc([...new Set(r.binInc)].join(", "))}</span>` : ""));
  const deckL = list(rows.filter(r => r.fromDecks), r => line(r, r.fromDecks, "In " + r.decks.map(x => esc(x.name) + (x.q > 1 ? ` ×${x.q}` : "")).join(", ")));
  const needL = list(rows.filter(r => r.need), r => line(r, r.need, r.incoming.length ? "Already incoming for " + r.incoming.map(esc).join(", ") : "", !rec(r.n) ? '<span class="flag warn">Unrecognized</span>' : ""));
  const grp = (id, title, n, body, extra = "") => body ? `<div class="group chk-${id}"><h3>${title}<span class="mono">${n}</span></h3>${extra}${body}</div>` : "";
  return `<div class="summary">
      <div class="k"><span class="label">In list</span><span class="v">${all}</span></div>
      <div class="k"><span class="label">In card bin</span><span class="v ${nBin ? "ok" : ""}">${nBin}</span></div>
      <div class="k"><span class="label">In other decks</span><span class="v">${nDeck}</span></div>
      <div class="k"><span class="label">Need to get</span><span class="v ${nNeed ? "warn" : "ok"}">${nNeed}</span></div>
      ${nBasic ? `<div class="k"><span class="label">Basic lands</span><span class="v">${nBasic}</span></div>` : ""}
    </div>
    <div class="check-acts"><button class="btn sm" data-act="chk-copy-need" ${nNeed ? "" : "disabled"}>${ICONS.copy}Copy need to get<span class="mono muted">${nNeed}</span></button><button class="btn sm" data-act="chk-copy-owned" ${nBin + nDeck ? "" : "disabled"}>${ICONS.copy}Copy owned<span class="mono muted">${nBin + nDeck}</span></button><button class="btn sm primary" data-act="chk-create">${ICONS.plus}Create deck from this list</button></div>
    ${p.unknown.length ? `<p class="muted check-hint">${p.unknown.length} card${p.unknown.length > 1 ? "s weren't" : " wasn't"} recognized and ${p.unknown.length > 1 ? "are" : "is"} counted as need to get: ${p.unknown.slice(0, 8).map(esc).join(", ")}${p.unknown.length > 8 ? "…" : ""}</p>` : ""}
    <div class="groups check-groups">
      ${grp("need", "Need to get", nNeed, needL)}
      ${grp("bin", "Free in the card bin", nBin, binL)}
      ${grp("decks", "Owned in another deck", nDeck, deckL, `<p class="muted check-hint">Using these means cutting them from that deck first.</p>`)}
      ${nBasic ? `<div class="group"><h3>Basic lands<span class="mono">${nBasic}</span></h3><p class="muted check-hint">Not checked: ${basics.map(r => `${r.q} ${esc(r.n)}`).join(", ")}.</p></div>` : ""}
    </div>`;
}
function updateCheck() { const el = $("#chk-results"); if (el) el.innerHTML = checkResults(); }

function lastOut(d, n) {
  for (let i = d.log.length - 1; i >= 0; i--) { const e = d.log[i]; if ((e.out || []).some(o => o.n === n)) return e; }
  return null;
}
function outsideCI(d, n) { const ci = deckCI(d); if (!d.commanders?.length || !rec(n)) return false; return [...ciOf(n)].some(c => !ci.includes(c)); }

function newDeck({ name, cards, commanders, printedNow = true }) {
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
  if (e.kind === "incoming") {
    d.incoming = incomingOf(d).filter(b => b.id !== e.id); if (!d.incoming.length) delete d.incoming;
    if (e.fromList) { const cm = curMap(d); for (const x of e.fromList) cm.set(x.n, (cm.get(x.n) || 0) + x.q); const order = d.cur.map(c => c.n); for (const n of cm.keys()) if (!order.includes(n)) order.push(n); d.cur = order.map(n => ({ n, q: cm.get(n) })); }
    d.log.pop(); d.updatedAt = Date.now(); return;
  }
  if (e.xfer) {
    const pt = xferPartner(e); undoEntry(d, e); if (pt) { undoEntry(pt.deck, pt.entry); save(pt.deck); }
    const [rd, re] = e.xfer.from ? [d, e] : pt ? [pt.deck, pt.entry] : [null, null];
    if (rd && re.grabInc) { restoreIncoming(rd, (re.cards[0] || {}).n, re.grabInc); if (rd !== d) save(rd); }
    return;
  }
  if (e.fromBin) return undoBinMove(d, e);
  if (e.pair) { const pt = binPartner(d, e); if (pt) { undoBinMove(pt.deck, pt.entry); save(pt.deck); return; } }
  undoEntry(d, e);
  // Undoing an arrival also undoes its swap and puts the cards back on the incoming list.
  let sw = e.inc ? e : null;
  if (e.kind === "print" && e.arrival) { const prev = d.log[d.log.length - 1]; if (prev && prev.inc && prev.inc.id === e.arrival) { undoEntry(d, prev); sw = prev; } }
  if (sw) { const b = { id: sw.inc.id, t: sw.inc.t, out: sw.out || [], in: sw.in || [] }; if (sw.note) b.note = sw.note; if (sw.kind === "import") b.kind = "import"; d.incoming = [...incomingOf(d), b].sort((x, y) => x.t - y.t); }
}
function undoEntry(d, e) {
  const cm = curMap(d);
  for (const i of e.in || []) { const v = (cm.get(i.n) || 0) - i.q; if (v > 0) cm.set(i.n, v); else cm.delete(i.n); }
  for (const o of e.out || []) cm.set(o.n, (cm.get(o.n) || 0) + o.q);
  const order = d.cur.map(c => c.n).filter(n => cm.has(n));
  for (const n of cm.keys()) if (!order.includes(n)) order.push(n);
  d.cur = order.map(n => ({ n, q: cm.get(n) }));
  d.printed = d.printed.filter(p => p.by !== e.id);
  if (e.kind === "print" && e.from && e.from.loose) { e.from.loose.forEach(x => S.loose.cards.push({ n: x.n, q: x.q, from: x.from, at: Date.now() })); saveLoose(); }
  if (e.kind === "print") for (const c of e.cards || []) { const p = d.printed.find(y => y.n === c.n); if (p) { p.q -= c.q; if (p.q <= 0) d.printed = d.printed.filter(y => y !== p); } }
  for (const c of e.got || []) { const p = d.printed.find(y => y.n === c.n); if (p) { p.q -= c.q; if (p.q <= 0) d.printed = d.printed.filter(y => y !== p); } }
  if (e.kind === "unprint") for (const c of e.cards || []) { const p = d.printed.find(y => y.n === c.n); if (p) p.q += c.q; else d.printed.push({ n: c.n, q: c.q, at: c.at || Date.now(), o: c.o ?? 1 }); }
  for (const c of e.lost || []) { const p = d.printed.find(y => y.n === c.n); if (p) p.q += c.q; else d.printed.push({ n: c.n, q: c.q, at: c.at || Date.now(), o: c.o ?? 1 }); }
  d.log = d.log.filter(x => x !== e); d.updatedAt = Date.now();
}
