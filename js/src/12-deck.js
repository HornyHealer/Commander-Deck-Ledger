// js/src/12-deck.js: deck insight (bracket, roles, past versions) and the deck screens.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- deck insight: bracket, roles and past versions ----------
// Commander Brackets (Oct 2025 rules): Game Changers, mass land denial and extra turns set the lowest
// bracket a deck can be in. Combos and how fast it wins can only be judged by the people playing it.
const BRACKET_NAMES = { 1: "Exhibition", 2: "Core", 3: "Upgraded", 4: "Optimized", 5: "cEDH" };
let textFlagsReady = null; // false until the card list has been rebuilt with text flags
const hasTextFlags = () => textFlagsReady || (textFlagsReady = CARDS.some(r => (r[4] | 0) >= 16));
// combos: the deck's last combo check (see deckCombos), so two-card combos count toward the bracket.
function bracketOf(cards, combos) {
  const gc = [], mld = [], et = [];
  for (const c of cards) { const f = flagsOf(rec(c.n)); if (f & F.GAME_CHANGER) gc.push(c.n); if (f & F.LAND_DENIAL) mld.push(c.n); if (f & F.EXTRA_TURN) et.push(c.n); }
  const two = combos && Array.isArray(combos.two) ? combos.two : [];
  let lo = mld.length || gc.length > 3 ? 4 : gc.length ? 3 : et.length ? 2 : 1;
  if (two.length && lo < 3) lo = 3;
  const reasons = [];
  if (gc.length > 3) reasons.push({ kind: "Game Changers", text: `${gc.length} Game Changers. Bracket 3 allows up to three, so this deck is bracket 4 or higher.`, cards: gc });
  else if (gc.length) reasons.push({ kind: "Game Changers", text: `${gc.length} Game Changer${gc.length === 1 ? "" : "s"}. Brackets 1 and 2 allow none and bracket 3 allows up to three.`, cards: gc });
  else reasons.push({ kind: "Game Changers", text: "No Game Changers, so brackets 1 and 2 are open to this deck." });
  if (mld.length) reasons.push({ kind: "Land denial", text: "Mass land denial, which only brackets 4 and 5 allow.", cards: mld });
  if (two.length) reasons.push({ kind: "Combos", text: `${two.length} two-card combo${two.length === 1 ? "" : "s"}. Brackets 1 and 2 allow none, and bracket 3 only if it can't happen before turn six.`, cards: two.map(c => c.cards.join(" + ")) });
  if (et.length) reasons.push({ kind: "Extra turns", text: et.length >= 3 ? `${et.length} extra-turn cards. Bracket 1 allows none, and brackets 2 and 3 allow them only if they aren't chained together.` : "Bracket 1 allows no extra turns. Brackets 2 and 3 allow them as long as they aren't chained together.", cards: et });
  return { lo, label: lo === 1 ? "1–2" : lo === 4 ? "4+" : String(lo), name: lo === 1 ? "Exhibition or Core" : BRACKET_NAMES[lo], gc, mld, et, two, combosChecked: !!combos, reasons };
}
function renderBracket(b) {
  if (!S.showBracket) return "";
  return `<div class="checks bracket-why" id="deck-bracket"><p class="bracket-head"><b>Bracket ${esc(b.label)}</b> · ${esc(b.name)}</p><ul>${b.reasons.map(x => `<li><span class="flag ${x.cards ? "warn" : "good"}">${esc(x.kind)}</span><span>${esc(x.text)}${x.cards ? `<small>${x.cards.map(esc).join(", ")}</small>` : ""}</span></li>`).join("")}</ul>
    <p class="muted bracket-note">This is the lowest bracket the cards allow. ${b.combosChecked ? "Two-card combos are counted from the deck's last combo check." : `Two-card combos aren't counted yet: press <b>Combos</b> to check this deck.`} How fast the deck wins can push it higher, so settle the final number with your table.${hasTextFlags() ? "" : " Mass land denial and extra turns will be checked once the card list finishes updating."}</p></div>`;
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
      h += `<div class="row"><span class="q">${c.q}</span><span class="nm"><span>${cardLink(c.n)}</span>${fl}</span>${r ? pipsFor(r[1]) : "<span></span>"}<span class="acts"></span></div>`;
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
  const issues = legality(d); const br = bracketOf(d.cur, deckCombos(d));
  const net = incomingNet(d); const incN = incomingOf(d).reduce((a, b) => a + qsum(b.in), 0);
  const cmd = (d.commanders && d.commanders.length) ? d.commanders.join(" & ") : "No commander set";
  let h = `<button class="crumb" data-act="home">${ICONS.back}All decks</button>
  <div class="dhead"><div>
    <div class="eyebrow">${ciPips(ci)}${d.example ? '<span class="tag-ex">Example</span>' : ""}</div>
    <h2>${esc(cmd)}</h2>
    <div class="dn">${esc(d.name)} · started ${fmtDate(d.createdAt)}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener">Archidekt ${ICONS.ext}</a>` : ""}</div>
    ${d.desc ? `<p class="ddesc">${esc(d.desc)}</p>` : ""}
  </div><div class="actions">
    <button class="btn" data-act="update">${ICONS.down}Update from Archidekt</button>
    <button class="btn" data-act="combos">${ICONS.combo}Combos${deckCombos(d) ? `<span class="mono cb-count">${deckCombos(d).count}</span>` : ""}</button>
    <button class="btn" data-act="edit">Edit details</button>
  </div></div>
  <div class="summary">
    <div class="k"><span class="label">Cards</span><span class="v ${t === 100 ? "ok" : t + net === 100 ? "" : "warn"}">${t}<span class="muted" style="font-size:13px">/100</span></span>${net ? `<span class="label inc-note">${net > 0 ? "+" : "−"}${Math.abs(net)} incoming</span>` : ""}</div>
    <div class="k"><span class="label">Lands</span><span class="v">${lands}</span></div>
    <div class="k"><span class="label">Owned</span><span class="v">${printedTotal(d)}</span></div>
    ${incN ? `<div class="k"><span class="label">Incoming</span><span class="v inc-v">${incN}</span></div>` : ""}
    <div class="k"><span class="label">Changes</span><span class="v">${changes.length}</span></div>
    <div class="k"><span class="label">Curve</span><div class="curve">${curve.map(v => `<div style="height:${Math.round(v / mx * 100)}%" title="${v}"></div>`).join("")}</div><div class="curve-l">${curve.map((_, i) => `<span>${i === 7 ? "7+" : i}</span>`).join("")}</div></div>
    <div class="k"><span class="label">Rules</span><span class="checkcell">${issues.length ? `<button class="flag bad flagbtn" data-act="toggle-checks" aria-expanded="${!!S.showChecks}" aria-controls="deck-checks">${issues.length} issue${issues.length === 1 ? "" : "s"} ${S.showChecks ? "▴" : "▾"}</button>` : `<span class="flag good" style="margin:0">Legal</span>`}${unknown ? `<span class="flag warn" style="margin:0">${unknown} unrecognized</span>` : ""}</span></div>
    <div class="k"><span class="label">Bracket</span><button class="v bracket-btn" data-act="toggle-bracket" aria-expanded="${!!S.showBracket}" aria-controls="deck-bracket" title="Why this bracket?">${esc(br.label)}<span class="bname">${esc(br.name)} ${S.showBracket ? "▴" : "▾"}</span></button></div>
  </div>${renderChecks(d, issues)}${renderBracket(br)}
  <div class="layout"><div style="min-width:0">
    <div class="tabs" role="tablist">
      ${tabBtn("current", "Current list", t)}
      ${tabBtn("removed", "Removed", removed.reduce((a, r) => a + r.q, 0), true)}
      ${tabBtn("printed", "Owned", printedTotal(d))}
      ${tabBtn("history", "History", histCount)}
      ${tabBtn("stats", "Stats", "")}
    </div>`;
  if (S.tab === "current") h += renderCurrent(d);
  else if (S.tab === "removed") h += renderRemoved(d, removed);
  else if (S.tab === "printed") h += renderPrinted(d);
  else if (S.tab === "stats") h += renderStats(d);
  else h += renderHistory(d);
  h += `</div>${renderBench(d)}</div>`;
  return h;
}
function tabBtn(id, label, n, drop) {
  return `<button class="tab${S.tab === id ? " on" : ""}" role="tab" aria-selected="${S.tab === id}" data-tab="${id}"${drop ? ' data-drop="out"' : ""}>${label}${n === "" ? "" : `<span class="n">${n}</span>`}</button>`;
}

function colorRank(n) { const ci = ciOf(n); if (!ci) return 99; if (ci.length === 1) return MANA_ORDER.indexOf(ci); return 10 + ci.length * 10 + MANA_ORDER.indexOf(ci[0]); }
function cardSorter(mode) {
  const byName = (a, b) => a.n.localeCompare(b.n);
  if (mode === "name") return byName;
  if (mode === "color") return (a, b) => colorRank(a.n) - colorRank(b.n) || (ciOf(a.n) < ciOf(b.n) ? -1 : ciOf(a.n) > ciOf(b.n) ? 1 : 0) || cmcOf(a.n) - cmcOf(b.n) || byName(a, b);
  return (a, b) => cmcOf(a.n) - cmcOf(b.n) || byName(a, b);
}
function renderCurrent(d) {
  const f = norm(S.filter); const staged = new Map(d.bench.out.map(o => [o.n, o.q])); const todo = incomingNeeds(d); const leaving = leavingMap(d);
  const groups = new Map(); const cmds = d.commanders || [];
  for (const c of d.cur) {
    if (f && !norm(c.n).includes(f)) continue;
    if (S.roleFilter && !rolesOf(d, c).includes(S.roleFilter)) continue;
    const g = cmds.includes(c.n) ? "CMD" : typeOf(c.n);
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c);
  }
  let h = `<div class="toolbar"><input class="field" id="f-cur" type="search" placeholder="Find a card in this deck" value="${esc(S.filter)}" aria-label="Find a card in this deck"><label class="sortsel"><span class="label">Sort</span><select class="field" id="s-sort" aria-label="Sort cards within each type">${[["cost", "Cost"], ["name", "Name A–Z"], ["color", "Color"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><div class="menuwrap"><button class="btn sm" data-act="copy-menu" aria-haspopup="menu" aria-expanded="${!!S.menu}">${ICONS.copy}Copy ${ICONS.caret}</button>${S.menu ? `<div class="menu" role="menu"><button role="menuitem" data-act="copy-cur">Whole list<span class="mono muted">${total(d)}</span></button><button role="menuitem" data-act="copy-toprint" ${todo.length ? "" : "disabled"} title="Cards you still need to get for incoming changes">Incoming only<span class="mono muted">${qsum(todo)}</span></button></div>` : ""}</div><span class="muted" style="font-size:12px;flex-basis:100%">${canHover ? "Drag a card onto <b>Removed</b> or the bench, or use the scissors." : "Tap the scissors to cut a card. The swap bench is at the bottom of the screen."}</span></div>`;
  h += renderIncoming(d) + rolesBar(d);
  if (!groups.size) return h + `<p class="muted">${S.roleFilter ? `No cards${S.filter ? ` matching “${esc(S.filter)}”` : ""} have the ${esc(ROLE_NAME[S.roleFilter])} role.` : `No cards match “${esc(S.filter)}”.`}</p>`;
  h += `<div class="groups">`;
  for (const g of ["CMD", ...TYPE_ORDER]) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${g === "CMD" ? "Commander" : TYPE_NAME[g]}<span class="mono">${arr.reduce((a, c) => a + c.q, 0)}</span></h3>`;
    for (const c of arr) {
      const r = rec(c.n); const st = staged.get(c.n);
      const rf = flagsOf(r), lim = limitOf(r);
      const ruleFlags = (rf & F.BANNED ? '<span class="flag bad">Banned</span>' : rf & F.NOT_LEGAL ? '<span class="flag bad">Not legal</span>' : "") + (r && !isBasic(c.n) && lim !== -1 && c.q > (lim > 0 ? lim : 1) ? '<span class="flag bad">Too many copies</span>' : "");
      const lq = leaving.get(c.n) || 0;
      const flags = (lq ? `<span class="flag leaving">Leaving${c.q > 1 ? " " + lq : ""}</span>` : "") + ruleFlags + (!r ? '<span class="flag warn">Unrecognized</span>' : "") + (outsideCI(d, c.n) ? '<span class="flag bad">Outside colors</span>' : "") + (st ? `<span class="flag bad">Cutting${c.q > 1 ? " " + st : ""}</span>` : "");
      const roles = rolesOf(d, c); const editing = S.roleEdit === c.n;
      const rtags = roles.length ? `<span class="rtags">${roles.map(x => `<span class="rtag">${ROLE_NAME[x] || esc(x)}</span>`).join("")}</span>` : "";
      const redit = editing ? `<span class="roleedit" role="group" aria-label="Roles for ${esc(c.n)}">${ROLES.map(([id, l]) => `<button class="chip sm${roles.includes(id) ? " on" : ""}" aria-pressed="${roles.includes(id)}" data-roletoggle="${esc(JSON.stringify([c.n, id]))}">${ROLE_NAME[id]}</button>`).join("")}${d.roles && d.roles[roleKey(c)] ? `<button class="btn sm ghost" data-rolereset="${esc(c.n)}">Use suggested</button>` : ""}<button class="btn sm" data-act="role-done">Done</button></span>` : "";
      h += `<div class="row${st ? " staged-out" : ""}${editing ? " editing" : ""}" ${canHover ? 'draggable="true" ' : ""}data-drag="cur" data-name="${esc(c.n)}">
        <span class="q">${c.q}</span><span class="nm"><span>${cardLink(c.n)}</span>${flags}${rtags}${redit}</span>${r ? pipsFor(r[1]) : "<span></span>"}
        <span class="acts"><button class="iconbtn${editing ? " on" : ""}" title="Roles" aria-label="Set roles for ${esc(c.n)}" aria-expanded="${editing}" data-roleedit="${esc(c.n)}">${ICONS.tag}</button><button class="iconbtn" title="Cut ${esc(c.n)}" aria-label="Cut ${esc(c.n)}" data-cut="${esc(c.n)}">${ICONS.cut}</button></span></div>`;
    }
    h += `</div>`;
  }
  return h + `</div>`;
}

function renderRemoved(d, removed) {
  if (!removed.length) return `<div class="empty"><h2>Nothing removed yet</h2><p>Cards you cut land here. They stay on your owned list, so you can see what's sitting in the box and bring any of them back.</p></div>`;
  const rows = removed.map(r => ({ ...r, e: lastOut(d, r.n) })).sort((a, b) => (b.e ? b.e.t : 0) - (a.e ? a.e.t : 0));
  return `<div class="plist">${rows.map(r => {
    const rc = rec(r.n); const e = r.e;
    const repl = e && e.in && e.in.length ? `replaced by ${e.in.map(i => esc(i.n)).join(", ")}` : "";
    const sub = e ? `Cut ${fmtShort(e.t)}${repl ? " · " + repl : ""}` : "Out of the current list";
    const staged = d.bench.in.some(i => i.n === r.n) ? "Coming back" : incomingOf(d).some(b => b.in.some(i => i.n === r.n)) ? "Incoming" : "";
    return `<div class="row" ${canHover ? 'draggable="true" ' : ""}data-drag="removed" data-name="${esc(r.n)}"><span class="q">${r.q}</span>
      <span class="nm"><span>${cardLink(r.n)}</span>${staged ? `<span class="flag ${staged === "Incoming" ? "leaving" : "good"}">${staged}</span>` : ""}${r.printed ? "" : (() => { for (let i = d.log.length - 1; i >= 0; i--) { const e = d.log[i]; if (e.kind === "unprint" && e.cards.some(c => c.n === r.n)) return e.to ? `<span class="flag plain">Moved to ${esc(e.to.name)}</span>` : '<span class="flag plain">Taken off owned</span>'; } return '<span class="flag plain">Never owned</span>'; })()}<small>${sub}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}
      <span class="acts" style="opacity:1"><button class="iconbtn" title="Bring back" aria-label="Bring ${esc(r.n)} back" data-bringback="${esc(r.n)}">${ICONS.back2}</button></span></div>`;
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
  if (!d.printed.length) return h + `<div class="empty"><h2>Nothing owned yet</h2><p>Cards in the deck list count as owned. Cards saved as incoming join this list when you press <b>Arrived</b>.</p></div>`;
  h += `<div class="plist">${rows.map(p => {
    const have = cm.get(p.n) || 0; const rc = rec(p.n);
    const st = have >= p.q ? '<span class="flag good">In deck</span>' : have > 0 ? `<span class="flag warn">${have} of ${p.q} in deck</span>` : '<span class="flag plain">Removed</span>';
    const sub = p.o ? `Added ${fmtShort(p.at)}` : "Original list";
    return `<div class="row"><span class="q">${p.q}</span><span class="nm"><span>${cardLink(p.n)}</span>${st}<small>${sub}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts">${S.confirm === "unprint|" + p.n ? `<span class="confirm">Remove? <button class="btn sm danger" data-unprint-yes="${esc(p.n)}">Remove</button><button class="btn sm ghost" data-act="unprint-no">Keep</button></span>` : `<button class="iconbtn" title="Remove from owned" aria-label="Remove ${esc(p.n)} from owned" data-unprint="${esc(p.n)}">${ICONS.x}</button>`}</span></div>`;
  }).join("")}</div>`;
  return h;
}

function swapLines(e, inExtra) {
  const o = e.out || [], i = e.in || [];
  const fmt = x => esc(x.n) + (x.q > 1 ? ` ×${x.q}` : "");
  // With extras (the incoming box's Grab controls), each row's extra sits in its own column so they line up.
  const gx = x => inExtra ? `<span class="gx">${x ? inExtra(x) : ""}</span>` : "";
  const cls = "swaps" + (inExtra ? " grabs" : "");
  if (!o.length && i.length) return `<div class="${cls} adds">${i.map(x => `<div class="swap"><span class="i">${fmt(x)}</span>${gx(x)}</div>`).join("")}</div>`;
  const n = Math.max(o.length, i.length); let s = "";
  for (let k = 0; k < n; k++) s += `<div class="swap"><span class="o">${o[k] ? fmt(o[k]) : ""}</span><span class="arr">${o[k] && i[k] ? "→" : ""}</span><span class="i">${i[k] ? fmt(i[k]) : ""}</span>${gx(i[k])}</div>`;
  return `<div class="${cls}">${s}</div>`;
}
function renderHistory(d) {
  const entries = [...d.log].reverse();
  const today = new Date(); const iso = x => { const z = new Date(x); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`; };
  const tools = `<div class="hist-tools"><label class="f"><span class="label">See the deck on a date</span><span class="datego"><input class="field" type="date" id="h-date" min="${iso(d.createdAt)}" max="${iso(today)}" value="${esc(S.histDate || iso(today))}"><button class="btn sm" data-act="view-date">View</button></span></label>${S.cmp ? "" : `<button class="btn sm" data-act="cmp-open">Compare versions</button>`}</div>`;
  return tools + (S.cmp ? renderCompare(d) : "") + `<div class="hist">${entries.map((e, k) => {
    const latest = k === 0 && e.kind !== "create";
    let title;
    const pl = e.cards ? qsum(e.cards) : 0; const s = pl > 1 ? "s" : "";
    if (e.kind === "create") title = `Deck created with ${e.count} card${e.count === 1 ? "" : "s"}`;
    else if (e.kind === "incoming") { const ni = qsum(e.in || []); title = e.fromList ? `Moved ${ni} card${ni === 1 ? "" : "s"} not owned yet to incoming` : `Marked ${ni} card${ni === 1 ? "" : "s"} as incoming`; }
    else if (e.kind === "print" && e.arrival) title = `Arrived: ${pl} card${s} added to owned`;
    else if (e.kind === "print") title = e.from ? `Took ${pl} card${s} from the bin${e.from.names && e.from.names.length ? " (" + e.from.names.map(nm => deckLink({ name: nm })).join(", ") + ")" : ""}` : `Added ${pl} card${s} to owned`;
    else if (e.kind === "unprint") title = e.to ? `Moved ${pl} owned card${s} to ${deckLink(e.to)}` : `Removed ${pl} card${s} from owned`;
    else if (e.fromBin) { const nq = qsum(e.cards || []); const names = [...new Set(e.fromBin.names || [])]; title = `Took ${nq} card${nq === 1 ? "" : "s"} from the card bin${names.length ? " (" + names.map(nm => /\(deleted\)$|^Added directly$/.test(nm) ? esc(nm === "Added directly" ? "added directly" : nm) : deckLink({ name: nm })).join(", ") + ")" : ""}`; }
    else if (e.xfer) { const nq = qsum(e.out || []) + qsum(e.in || []); title = e.xfer.to ? `Moved ${nq} card${nq === 1 ? "" : "s"} to ${deckLink(e.xfer.to)}` : `Took ${nq} card${nq === 1 ? "" : "s"} from ${deckLink(e.xfer.from)}`; }
    else title = changeTitle(e) + (e.inc ? `<span class="flag plain">Incoming since ${fmtShort(e.inc.t)}</span>` : "");
    const pt = latest && e.xfer ? xferPartner(e) : latest && (e.fromBin || e.pair) ? binPartner(d, e) : null;
    const undo = latest ? (S.confirm === "undo" ? `<span class="confirm">${pt ? `Undo this move? It's also undone in ${esc(pt.deck.name)}.` : "Undo this change?"} <button class="btn sm danger" data-act="undo-yes">Undo</button><button class="btn sm ghost" data-act="undo-no">Keep</button></span>` : `<button class="btn sm ghost" data-act="undo">Undo</button>`) : "";
    const view = e.kind === "create" || isChange(e) ? `<button class="btn sm ghost" data-snap="${e.kind === "create" ? "start" : esc(e.id)}">${e.kind === "create" ? "View original list" : "View deck after this"}</button>` : "";
    return `<div class="entry"><div class="when">${fmtDate(e.t)}</div><div class="what"><div class="kind">${title}${undo}${view}</div>${e.kind === "create" ? "" : e.cards ? `<div class="plines ${e.kind}">${e.cards.map(c => `<span>${c.q}x ${esc(c.n)}</span>`).join("")}</div>` : swapLines(e)}${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}</div></div>`;
  }).join("")}</div>`;
}

function renderBench(d) {
  const b = d.bench; const cm = curMap(d);
  const row = (x, side) => {
    const max = side === "out" ? (cm.get(x.n) || 1) : 99;
    return `<div class="brow"><span class="nm">${esc(x.n)}${side === "in" && outsideCI(d, x.n) ? '<span class="flag bad">Outside colors</span>' : ""}${side === "in" && !rec(x.n) ? '<span class="flag warn">Unrecognized</span>' : ""}${side === "in" && (printedMap(d).get(x.n) || 0) > (curMap(d).get(x.n) || 0) ? '<span class="flag good">Owned</span>' : ""}</span>
      <span class="qty">${max > 1 || x.q > 1 ? `<button aria-label="Fewer" data-qty="${side}|${esc(x.n)}|-1">−</button>${x.q}<button aria-label="More" data-qty="${side}|${esc(x.n)}|1">+</button>` : ""}</span>
      <button class="iconbtn" aria-label="Unstage ${esc(x.n)}" data-unstage="${side}|${esc(x.n)}">${ICONS.x}</button></div>`;
  };
  const n = b.out.length + b.in.length;
  const pair = b.out.length && b.in.length ? (b.out.length === b.in.length ? `Saves as ${b.out.length} swap${b.out.length > 1 ? "s" : ""}, matched in order.` : `${b.out.length} out, ${b.in.length} in.`) : b.out.length ? "Cuts only. Add replacements below if you have them." : b.in.length ? "Adds only." : "";
  const nOut = b.out.reduce((a, x) => a + x.q, 0), nIn = b.in.reduce((a, x) => a + x.q, 0);
  const bar = `<button class="sheet-bar" data-act="bench-toggle" aria-expanded="${!!S.benchOpen}" aria-controls="bench-body"><span class="sb-t">Swap bench</span><span class="sb-n">${nOut || nIn ? `<b class="out">${nOut} out</b><b class="in">${nIn} in</b>` : "Cut or add cards"}</span><span class="sb-c">${S.benchOpen ? "Close ▾" : "Open ▴"}</span></button>`;
  return `<aside class="bench${S.benchOpen ? " open" : ""}" aria-label="Swap bench">${bar}<header><h3>Swap bench</h3><p>Stage cuts and adds, then save them as one change.</p></header>
    <div class="zone"><div class="zt"><span class="label out">Taking out</span><span class="mono muted" style="font-size:12px">${b.out.reduce((a, x) => a + x.q, 0)}</span></div>
      <div class="dropbox" data-drop="out">${b.out.length ? b.out.map(x => row(x, "out")).join("") : (canHover ? '<div class="hint">Drag cards here from the current list</div>' : '<div class="hint">Tap the scissors on a card, or search below</div>')}</div>
      <div class="search"><input class="field" id="s-out" placeholder="Search this deck to cut…" autocomplete="off" aria-label="Search this deck to cut"><div class="sugg" id="g-out" hidden></div></div>
    </div>
    <div class="zone"><div class="zt"><span class="label in">Putting in</span><span class="mono muted" style="font-size:12px">${b.in.reduce((a, x) => a + x.q, 0)}</span></div>
      <div class="dropbox" data-drop="in">${b.in.length ? b.in.map(x => row(x, "in")).join("") : (canHover ? '<div class="hint">Drag removed cards here, or search any card</div>' : '<div class="hint">Bring back a removed card, or search any card</div>')}</div>
      <div class="search"><input class="field" id="s-in" placeholder="Search all cards to add…" autocomplete="off" aria-label="Search all cards to add"><div class="sugg" id="g-in" hidden></div></div>
    </div>
    <div class="foot">
      <textarea class="field" id="b-note" placeholder="Why the change? (optional)" aria-label="Note for this change">${esc(b.note || "")}</textarea>
      ${pair ? `<div class="pairhint">${pair}</div>` : ""}
      <div class="row2"><button class="btn ghost sm" data-act="clear-bench" ${n ? "" : "disabled"}>Clear</button><button class="btn" data-act="save-incoming" ${n ? "" : "disabled"} title="Keep the deck list as it is until the new cards arrive">${ICONS.inbox}Save as incoming</button><button class="btn primary" data-act="commit" ${n ? "" : "disabled"}>Save change</button></div>
      <p class="benchhint">Waiting on cards? <b>Save as incoming</b> keeps the deck list matching your box until they arrive.</p>
    </div></aside>`;
}
