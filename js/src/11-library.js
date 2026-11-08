// js/src/11-library.js: the library, All cards, deck art, backups, the card bin and legality.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- library tools: search, sort and pins ----------
const LIB_SORTS = [["recent", "Last changed"], ["name", "Deck name"], ["commander", "Commander"], ["bracket", "Bracket, high first"]];
const cmdOf = d => (d.commanders && d.commanders.length) ? d.commanders.join(" & ") : d.name;
// Pinned decks come first, then the chosen order.
function libSorter(mode) {
  const recent = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  const by = { name: (a, b) => a.name.localeCompare(b.name) || recent(a, b), commander: (a, b) => cmdOf(a).localeCompare(cmdOf(b)) || recent(a, b),
    bracket: (a, b) => bracketOf(b.cur, deckCombos(b)).lo - bracketOf(a.cur, deckCombos(a)).lo || recent(a, b) }[mode] || recent;
  return (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b);
}
// Does a deck match the search? Every word has to appear in its name, commander or description, or all of them
// in one card's name (then those cards are listed on the tile).
// Punctuation is ignored, so "nghathrod" finds Captain N'ghathrod.
const plain = s => norm(s || "").replace(/['".,:;!?()\/-]/g, "");
function deckMatch(d, q) {
  const terms = plain(q).split(" ").filter(Boolean); if (!terms.length) return { cards: [] };
  const hay = plain([d.name, ...(d.commanders || []), d.desc || ""].join(" "));
  if (terms.every(t => hay.includes(t))) return { cards: [] };
  const cards = d.cur.filter(c => { const n = plain(c.n); return terms.every(t => n.includes(t)); }).map(c => c.n);
  return cards.length ? { cards } : null;
}
function renderLibrary() {
  if (!S.ready) return `<div class="empty"><h2>Opening your library…</h2><p>Your decks load here in a moment.</p></div>`;
  const all = [...S.decks.values()];
  const matches = new Map(); for (const d of all) { const m = deckMatch(d, S.libQ); if (m) matches.set(d.id, m); }
  const decks = all.filter(d => matches.has(d.id)).sort(libSorter(S.libSort));
  if (!all.length) return `<div class="empty"><h2>No decks yet</h2><p>Paste a list the same way you'd import it into Archidekt, one card per line like <span class="mono">1 Sol Ring</span>. The first list becomes the deck's original list, every swap after that goes into its history, and cards you're still waiting on can be saved as incoming until they arrive.</p><div class="emptybtns"><button class="btn primary" data-act="new">${ICONS.plus}Add your first deck</button><button class="btn" data-act="example">Try an example deck</button></div><div class="emptybtns">${backupBtns(true)}</div></div>${renderBin()}`;
  const searching = !!plain(S.libQ);
  const tools = all.length > 1 ? `<div class="toolbar libbar"><input class="field" id="f-lib" type="search" placeholder="Search decks, commanders or cards" value="${esc(S.libQ || "")}" aria-label="Search decks, commanders or cards"><label class="sortsel"><span class="label">Sort</span><select class="field" id="s-lib" aria-label="Sort decks">${LIB_SORTS.map(([v, l]) => `<option value="${v}" ${S.libSort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>` : "";
  const count = searching ? `<b>${decks.length}</b><span class="of">of ${all.length}</span>` : `<b>${String(decks.length).padStart(2, "0")}</b>`;
  const none = searching && !decks.length ? `<p class="muted lib-none">No decks match “${esc(S.libQ.trim())}”: no deck name, commander, description or card in a deck's current list has that in it.</p>` : "";
  return `<div class="sect"><span>Decks</span>${count}</div><div class="libtools">${backupBtns()}</div>${backupWarning()}<div class="sheet lib-sheet">${tools}${none}<div class="lib-grid">${decks.map((d, i) => {
    const ci = deckCI(d); const changes = changeCount(d); const t = total(d); const incN = incomingOf(d).reduce((a, b) => a + qsum(b.in), 0);
    const cmd = cmdOf(d), hits = (matches.get(d.id) || {}).cards || [];
    const pin = `<button class="pinbtn${d.pinned ? " on" : ""}" data-act="pin" data-id="${esc(d.id)}" aria-pressed="${!!d.pinned}" aria-label="${d.pinned ? "Unpin" : "Pin"} ${esc(d.name)}" title="${d.pinned ? "Unpin from the top" : "Pin to the top"}">${ICONS.pin}</button>`;
    const arch = d.link ? `<a class="arch" href="${esc(d.link)}" target="_blank" rel="noopener">${linkName(d.link)} ${ICONS.ext}</a>` : `<button class="arch add" data-editlink="${esc(d.id)}">${ICONS.plus}Archidekt link</button>`;
    const art = artNameOf(d);
    return `<div class="deckbox${art ? " has-art" : ""}${d.pinned ? " pinned" : ""}" role="link" tabindex="0" aria-label="Open ${esc(d.name)}" data-open="${esc(d.id)}">${art ? `<img class="tile-art" src="${esc(artSrcOf(d))}" alt="" loading="lazy" style="object-position:center ${esc(d.artPos || "center")}">` : ""}${ciBand(ci)}<span class="tile-no">${String(i + 1).padStart(2, "0")}</span><div class="body">
      <div class="cmd">${esc(cmd)}${d.example ? '<span class="tag-ex">Example</span>' : ""}</div>
      <div class="dname">${esc(d.name)}</div>
      ${hits.length ? `<div class="hits">Has ${hits.slice(0, 2).map(esc).join(", ")}${hits.length > 2 ? ` and ${hits.length - 2} more` : ""}</div>` : ""}
      ${d.desc ? `<div class="ddesc">${esc(d.desc)}</div>` : ""}
      <div class="pipline">${ciPips(ci)}<span class="bpill" title="Bracket estimate">Bracket ${esc(bracketOf(d.cur, deckCombos(d)).label)}</span></div>
      <div class="stats"><span><b>${t}</b> in deck</span><span><b>${printedTotal(d)}</b> owned</span><span><b>${changes}</b> changes</span></div>
      ${incN ? `<div class="pills"><div class="tp-pill tp-inc"><b class="mono">${incN}</b> incoming</div></div>` : ""}
      <div class="stats" style="margin-top:0">Last change ${fmtShort(d.updatedAt)}${(() => { const n = legality(d).length; return n ? ` · <span class="rule-issues">${n} rule issue${n === 1 ? "" : "s"}</span>` : ""; })()}</div>
      <div class="tile-foot">${arch}${pin}</div>
    </div></div>`;
  }).join("")}</div></div>${renderBin()}`;
}
function ownedRows() {
  const map = new Map();
  const row = n => { if (!map.has(n)) map.set(n, { n, printed: 0, inDecks: [], deckQ: 0, toPrint: 0, bin: 0 }); return map.get(n); };
  for (const d of S.decks.values()) {
    for (const p of d.printed) if (p.q > 0) row(p.n).printed += p.q;
    for (const c of d.cur) { const r = row(c.n); r.inDecks.push({ id: d.id, name: d.name, q: c.q }); r.deckQ += c.q; }
    for (const u of incomingNeeds(d)) row(u.n).toPrint += u.q;
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
    <div class="k"><span class="label">Owned</span><span class="v">${counts.printed}</span></div>
    <div class="k"><span class="label">In decks</span><span class="v">${sum(r => r.deckQ, all)}</span></div>
    <div class="k"><span class="label">In bin</span><span class="v">${counts.bin}</span></div>
    <div class="k"><span class="label">Incoming</span><span class="v">${counts.toprint}</span></div>
  </div>
  <div class="sheet"><div class="toolbar"><input class="field" id="f-all" type="search" placeholder="Find a card in your collection" value="${esc(S.allFilter || "")}" aria-label="Find a card in your collection"><label class="sortsel"><span class="label">Sort</span><select class="field" id="s-sort" aria-label="Sort cards within each type">${[["cost", "Cost"], ["name", "Name A–Z"], ["color", "Color"]].map(([v, l]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><div class="menuwrap"><button class="btn sm" data-act="copy-menu" aria-haspopup="menu" aria-expanded="${!!S.menu}">${ICONS.copy}Copy ${ICONS.caret}</button>${S.menu ? `<div class="menu" role="menu"><button role="menuitem" data-act="copy-all" ${shownTotal ? "" : "disabled"}>This list<span class="mono muted">${shownTotal}</span></button><button role="menuitem" data-act="copy-all-unp" ${unpTotal ? "" : "disabled"}>Incoming only<span class="mono muted">${unpTotal}</span></button></div>` : ""}</div>
    <div class="chips" style="flex-basis:100%">${chipB("all", "Everything")}${chipB("printed", "Owned")}${chipB("toprint", "Incoming")}${chipB("bin", "In bin")}</div></div>
  <div class="facets">
    <div class="facet"><span class="label">Type</span><div class="chips">${TYPE_ORDER.filter(g => all.some(r => typeOf(r.n) === g)).map(g => `<button class="chip${types.has(g) ? " on" : ""}" data-alltype="${g}" aria-pressed="${types.has(g)}">${TYPE_NAME[g]}</button>`).join("")}</div></div>
    <div class="facet"><span class="label">Color</span><div class="chips">${[..."WUBRG"].map(c => `<button class="chip colorchip${cols.has(c) ? " on" : ""}" data-allcolor="${c}" aria-pressed="${cols.has(c)}" title="${({ W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" })[c]}"><span class="pip ${c}">${c}</span></button>`).join("")}<button class="chip colorchip${cols.has("C") ? " on" : ""}" data-allcolor="C" aria-pressed="${cols.has("C")}"><span class="pip C">C</span>Colorless</button></div><div class="chips modeseg" role="group" aria-label="Color match">${[["incl", "Including"], ["exact", "Exactly"], ["most", "At most"]].map(([v, l]) => `<button class="chip${(S.colorMode || "incl") === v ? " on" : ""}" data-colormode="${v}" aria-pressed="${(S.colorMode || "incl") === v}" title="${v === "incl" ? "Cards that have every selected color, and maybe more" : v === "exact" ? "Cards whose colors are exactly the selected ones" : "Cards that use only the selected colors (colorless included)"}">${l}</button>`).join("")}</div></div>
    ${types.size || cols.size ? `<button class="btn sm ghost" data-act="facet-clear">Clear filters</button>` : ""}
  </div>`;
  if (!all.length) return h + `<div class="empty"><h2>No cards yet</h2><p>Add a deck or put cards you own in the card bin, and they show up here.</p></div></div>`;
  if (!shown.length) return h + `<p class="muted">No cards match${f ? ` “${esc(S.allFilter)}”` : ""} in this view.</p></div>`;
  const groups = new Map();
  for (const r of shown) { const g = typeOf(r.n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  h += `<div class="groups all-list">`;
  for (const g of TYPE_ORDER) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${TYPE_NAME[g]}<span class="mono">${arr.reduce((a, r) => a + qOf(r), 0)}</span></h3>${arr.map(r => {
      const rc = rec(r.n);
      const where = [...r.inDecks.map(x => `<button class="deckref" data-open="${esc(x.id)}">${esc(x.name)}${x.q > 1 ? " ×" + x.q : ""}</button>`), r.bin ? `<span>Bin${r.bin > 1 ? " ×" + r.bin : ""}</span>` : ""].filter(Boolean).join("");
      const flags = (r.toPrint ? `<span class="flag leaving">${r.toPrint} incoming</span>` : "") + (!r.inDecks.length && r.bin ? '<span class="flag plain">Bin only</span>' : "") + (!rc ? '<span class="flag warn">Unrecognized</span>' : "");
      return `<div class="row"><span class="q">${qOf(r)}</span><span class="nm"><span>${cardLink(r.n)}</span>${flags}<small class="where">${r.printed ? `${r.printed} owned` : "Not owned yet"}${where ? " · " : ""}${where}</small></span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts"></span></div>`;
    }).join("")}</div>`;
  }
  return h + `</div></div>`;
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
// Undoes a deck's last change. Undoing a move with another deck changes that deck's history too,
// so it's read first if it hasn't been.
const unreadPartners = e => e ? [e.xfer && (e.xfer.to || e.xfer.from || {}).id, e.pair && e.pair.deck, ...((e.fromBin && e.fromBin.srcs) || []).map(x => x.deck)].filter(id => id && !historyReady(id)) : [];
function undoNow(d) {
  const last = d.log[d.log.length - 1];
  const others = unreadPartners(last);
  if (others.length) return Promise.all(others.map(ensureHistory)).then(ok => ok.every(Boolean) ? undoNow(d) : toast("Couldn't get the other deck's history, so nothing was undone. Check your connection and try again."));
  const pt = last && last.xfer ? xferPartner(last) : last && (last.fromBin || last.pair) ? binPartner(d, last) : null;
  undoLast(d); S.confirm = null; save(d); render();
  return toast(pt ? `Move undone here and in ${pt.deck.name}.` : "Change undone.");
}
// A deck whose history hasn't been read yet: read it, then show the deck.
function deckOpening(d) {
  if (!histWaiters.has(d.id)) ensureHistory(d.id).then(ok => { if (!ok) toast("Couldn't get this deck's history. Check your connection; it will keep trying."); safeRender(); });
  return `<div class="empty"><h2>Opening ${esc(d.name)}…</h2><p>Getting its history from your account.</p></div>`;
}
function exportBackup() {
  const lazy = [...S.decks.keys()].filter(id => !historyReady(id));
  if (lazy.length) {
    toast("Getting every deck's history for the backup…");
    return Promise.all(lazy.map(ensureHistory)).then(ok => ok.every(Boolean) ? exportBackup() : toast("Couldn't get every deck's history, so no backup was made. Check your connection and try again."));
  }
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
    syncDeckIds(d); convertUnowned(d); touch(d); S.decks.set(d.id, d);
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
  // The bin folds away (closed unless opened here before) so the decks stay the focus.
  const open = !!S.binOpen;
  const fold = `<button class="bin-fold" data-act="bin-fold" aria-expanded="${open}"><h2>Card bin <span class="mono muted" style="font-size:15px">${tot}</span></h2><span class="chev">${ICONS.chev}</span></button>`;
  let h = `<section class="bin sheet${open ? "" : " folded"}"><div class="bin-head"><div>${fold}<p class="muted">Cards you own that aren't in any deck's current list.</p></div>`;
  if (!open) {
    const needed = rows.filter(r => r.needs.length).length;
    return h + (needed ? `<span class="flag good bin-needed">${needed} needed by an incoming change</span>` : "") + `</div></section>`;
  }
  if (!rows.length) return h + `<div class="bin-tools">${addBtn}</div></div><p class="muted bin-empty">Empty. When you cut a card you own, it lands here. You can also add cards you have lying around.</p></section>`;
  const needed = rows.filter(r => r.needs.length).length;
  h += `<div class="bin-tools"><input class="field" id="f-bin" type="search" placeholder="Find a card in the bin" value="${esc(S.binFilter || "")}" aria-label="Find a card in the bin"><button class="btn sm" data-act="copy-bin">${ICONS.copy}Copy list</button>${addBtn}</div></div>`;
  if (needed) h += `<div class="toprint" style="margin-bottom:12px"><span><b class="mono">${needed}</b> card${needed > 1 ? "s" : ""} in the bin ${needed > 1 ? "are" : "is"} needed by an incoming change. Move ${needed > 1 ? "them" : "it"} over instead of getting another copy.</span></div>`;
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
    return `<div class="row"><span class="q">${r.total}</span><span class="nm"><span>${cardLink(r.n)}</span>${r.needs.length ? '<span class="flag good">Needed</span>' : ""}${r.inc ? `<span class="flag leaving" title="Part of an incoming change">Incoming for ${esc([...new Set(r.inc)].join(", "))}</span>` : ""}<small>${from}</small>${moves ? `<span class="bin-moves">${moves}</span>` : ""}${rm && S.confirm === "binrm|" + r.n ? rm : ""}</span>${rc ? pipsFor(rc[1]) : "<span></span>"}<span class="acts">${rm && S.confirm !== "binrm|" + r.n ? rm : ""}</span></div>`;
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
  const net = incomingNet(d);
  if (t !== 100 && t + net !== 100) issues.push({ kind: "count", text: (t < 100 ? `${plural(100 - t, "card")} short of 100` : `${plural(t - 100, "card")} over 100`) + (net ? `, or ${t + net} once your incoming cards arrive.` : ".") });
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
