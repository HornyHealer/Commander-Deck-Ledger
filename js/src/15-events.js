// js/src/15-events.js: taps, typing and drag-and-drop, then startup.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
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
  if (t.dataset.tab) { if (S.tab !== t.dataset.tab) glitchNext(".tabpanel"); S.tab = t.dataset.tab; S.filter = ""; S.confirm = null; return render(); }
  if (t.dataset.alltype) { const s = S.allTypes || (S.allTypes = new Set()); const g = t.dataset.alltype; s.has(g) ? s.delete(g) : s.add(g); return render(); }
  if (t.dataset.allcolor) { const s = S.allColors || (S.allColors = new Set()); const c = t.dataset.allcolor; s.has(c) ? s.delete(c) : s.add(c); return render(); }
  if (t.dataset.colormode) { S.colorMode = t.dataset.colormode; return render(); }
  if (t.dataset.allchip) { S.allChip = t.dataset.allchip; return render(); }
  if (t.dataset.pf) { S.printedFilter = t.dataset.pf; return render(); }
  if (t.dataset.cut && d) return stage(d, "out", t.dataset.cut);
  if (t.dataset.ruleOpen && S.dialog && S.dialog.rules) { const g = t.dataset.ruleOpen; S.dialog.open = S.dialog.open || {}; S.dialog.open[g] = !S.dialog.open[g]; return renderRules(); }
  if (t.dataset.rule && S.dialog && S.dialog.rules) { const [g, v] = t.dataset.rule.split("|"); S.dialog.rules[g] = v; return renderRules(); }
  if (t.dataset.arrive && d) return arrive(d, t.dataset.arrive);
  if (t.dataset.incCopy && d) { const b = incomingOf(d).find(x => x.id === t.dataset.incCopy); if (b) copyText(toGet(d, b).filter(x => x.q > 0).map(x => `${x.q}x ${x.n}`).join("\n"), "Incoming list"); return; }
  if (t.dataset.incBench && d) return dropIncoming(d, t.dataset.incBench, true);
  if (t.dataset.incCancel && d) { S.confirm = "inc-cancel|" + t.dataset.incCancel; return render(); }
  if (t.dataset.incCancelYes && d) { S.confirm = null; return dropIncoming(d, t.dataset.incCancelYes, false); }
  if (t.dataset.rolefilter) { S.roleFilter = S.roleFilter === t.dataset.rolefilter ? null : t.dataset.rolefilter; return render(); }
  if (t.dataset.roleedit) { S.roleEdit = S.roleEdit === t.dataset.roleedit ? null : t.dataset.roleedit; return render(); }
  if (t.dataset.roletoggle && d) { const [n, role] = JSON.parse(t.dataset.roletoggle); const c = d.cur.find(x => x.n === n); if (c) { const now = rolesOf(d, c); setRoles(d, n, now.includes(role) ? now.filter(x => x !== role) : [...now, role]); save(d); render(); } return; }
  if (t.dataset.rolereset && d) { const c = d.cur.find(x => x.n === t.dataset.rolereset); if (c && d.roles) { delete d.roles[roleKey(c)]; if (!Object.keys(d.roles).length) delete d.roles; save(d); render(); } return; }
  if (t.dataset.snap && d) { S.snap = { id: d.id, key: t.dataset.snap }; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.printArt !== undefined && S.dialog && S.dialog.kind === "edit") {
    const dd = S.decks.get(S.dialog.id); keepDialogFields(); const art = artNameOf(dd); const id = t.dataset.printArt;
    if (!id) { delete dd.artUrl; delete dd.artId; delete dd.artFor; }
    else { const x = ((PRINTS.get(art) || {}).list || []).find(y => y.id === id); if (x) { dd.artUrl = x.url; dd.artId = x.id; dd.artFor = art; } }
    save(dd); render(); renderDialog(); return;
  }
  if (t.dataset.binrm) { S.confirm = "binrm|" + t.dataset.binrm; return render(); }
  if (t.dataset.binrmYes) { S.loose.cards = S.loose.cards.filter(c => c.n !== t.dataset.binrmYes); S.confirm = null; saveLoose(); render(); return toast("Removed from the bin."); }
  if (t.dataset.grab) {
    const [n, id] = JSON.parse(t.dataset.grab); const sel = t.parentElement && t.parentElement.querySelector(".grab-src"); const from = sel ? sel.value : "_bin";
    const got = from === "_bin" ? moveFromBin(n, id) : grabFromDeck(n, from, id); render();
    const where = from === "_bin" ? "the card bin" : (S.decks.get(from) || {}).name;
    return toast(got ? `Grabbed ${got}x ${n} from ${where}. Undo it from History if needed.` : "Nothing to grab.");
  }
  if (t.dataset.binmove) { const [n, id] = JSON.parse(t.dataset.binmove); const got = moveFromBin(n, id); render(); return toast(got ? `Moved ${got}x ${n} from the card bin into ${S.decks.get(id).name}. Undo it from History if needed.` : "Nothing to move."); }
  if (t.dataset.unprint) { S.confirm = "unprint|" + t.dataset.unprint; return render(); }
  if (t.dataset.unprintYes && d) { const pp = d.printed.find(p => p.n === t.dataset.unprintYes); if (pp) unprintCards(d, [{ n: pp.n, q: pp.q }]); S.confirm = null; save(d); render(); return toast("Removed from owned."); }
  if (t.dataset.bringback && d) return stage(d, "in", t.dataset.bringback);
  if (t.dataset.unstage && d) { const [side, ...n] = t.dataset.unstage.split("|"); return unstage(d, side, n.join("|")); }
  if (t.dataset.qty && d) { const p = t.dataset.qty.split("|"); return bumpQty(d, p[0], p.slice(1, -1).join("|"), +p[p.length - 1]); }
  if (t.dataset.bapick) return baPick(+t.dataset.bapick);
  if (t.dataset.pick) { const [side, i] = t.dataset.pick.split("|"); return pick(side, +i); }
  const act = t.dataset.act;
  if (act === "export") return exportBackup();
  if (act === "signin") return signIn();
  if (act === "acct-menu") { CLOUD.menu = !CLOUD.menu; return render(); }
  if (act === "signout") { CLOUD.menu = false; return signOutNow(); }
  if (act === "toggle-checks") { S.showChecks = !S.showChecks; glitchNext(S.showChecks ? "#deck-checks" : ".summary"); return render(); }
  if (act === "toggle-bracket") { S.showBracket = !S.showBracket; glitchNext(S.showBracket ? "#deck-bracket" : ".summary"); return render(); }
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
      ex.id = "example-" + uid(); ex.example = true; convertUnowned(ex); touch(ex); S.decks.set(ex.id, ex); persist(); go("deck", ex.id);
      toast("Example deck added. Delete it from Edit details when you're done.");
    }).catch(() => toast("Couldn't load the example deck. Check your connection and try again."));
    return;
  }
  if (act === "all") { S.allFilter = ""; return go("all"); }
  // Pinning isn't a change to the deck: it syncs, but doesn't move "last change" or add to the history.
  if (act === "pin") { const pd = S.decks.get(t.dataset.id); if (pd) { pd.pinned = !pd.pinned; save(pd); toast(pd.pinned ? `Pinned ${pd.name} to the top.` : `Unpinned ${pd.name}.`); render(); } return; }
  if (act === "hand-new" && d) { newHand(d, 0); return render(); }
  if (act === "hand-mull" && d) { newHand(d, (S.hand && S.hand.id === d.id ? S.hand.mull : 0) + 1); return render(); }
  if (act === "hand-draw" && d && S.hand && S.hand.id === d.id) { S.hand.shown = Math.min(S.hand.lib.length, S.hand.shown + 1); return render(); }
  if (act === "theme") return setTheme(themeNow() === "dark" ? "light" : "dark");
  if (act === "bin-fold") { S.binOpen = !S.binOpen; glitchNext(".bin"); try { localStorage.setItem("cdl-bin-open", S.binOpen ? "1" : "0"); } catch {} return render(); }
  if (act === "check") return go("check");
  if (act === "chk-copy-need") return copyText((S.checkRows || []).filter(r => r.need).map(r => `${r.need}x ${r.n}`).join("\n"), "Need-to-get list");
  if (act === "chk-copy-owned") return copyText((S.checkRows || []).filter(r => r.fromBin || r.fromDecks).map(r => `${r.fromBin + r.fromDecks}x ${r.n}`).join("\n"), "Owned list");
  if (act === "chk-create") return openDialog({ kind: "new", cmds: [], text: CHECK_TEXT, link: CHECK_LINK, rules: RULE_DEFAULTS() });

  if (act === "facet-clear") { S.allTypes = new Set(); S.allColors = new Set(); return render(); }
  if (act === "copy-all") { if ($(".menu")) render(); return copyText((S.allShown || []).filter(x => x.q > 0).sort((a, b) => a.n.localeCompare(b.n)).map(x => `${x.q}x ${x.n}`).join("\n"), "Card list"); }
  if (act === "copy-all-unp") { if ($(".menu")) render(); return copyText((S.allUnprinted || []).sort((a, b) => a.n.localeCompare(b.n)).map(x => `${x.q}x ${x.n}`).join("\n"), "Incoming cards"); }
  if (act === "bin-add") return openDialog({ kind: "binadd" });
  if (act === "copy-bin") return copyText(binRows().map(r => `${r.total}x ${r.n}`).join("\n"), "Bin list");
  if (act === "copy-menu") { S.menu = !S.menu; return render(); }
  if (act === "new") return openDialog({ kind: "new", cmds: [], rules: RULE_DEFAULTS() });
  if (act === "arch-fetch") return archFetch(t.dataset.arch, t);
  if (act === "home") return go("library");
  if (act === "edit" && d) return openDialog({ kind: "edit", id: d.id });
  if (act === "update" && d) { openDialog({ kind: "update", id: d.id }); if (d.link && archId(d.link)) archFetch("u", $('[data-arch="u"]')); return; }
  if (act === "copy-cur" && d) { if (S.menu === false && $(".menu")) render(); return copyText(listText(d, d.cur, true), "Current list"); }
  if (act === "copy-printed" && d) return copyText(listText(d, d.printed.filter(p => S.printedFilter === "all" || (S.printedFilter === "orig" ? p.o === 0 : p.o === 1)), false), "Owned list");
  if (act === "clear-bench" && d) { d.bench = { out: [], in: [], note: "" }; render(); return save(d); }
  if (act === "commit" && d) return commit(d);
  if (act === "combos" && d) return openCombos(d);
  if (act === "combos-retry" && S.dialog) { const dd = S.decks.get(S.dialog.id); if (dd) openCombos(dd); return; }
  if (act === "combos-more" && S.dialog) { S.dialog.showAll = true; return renderDialog(); }
  if (act === "combos-possible" && S.dialog) { S.dialog.showPossible = !S.dialog.showPossible; renderDialog(); if (S.dialog.showPossible) { const el = $("#cb-possible"); if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); if (!reduceMotion()) setTimeout(() => playGlitch(el, "pop"), 260); } } return; }
  if (act === "sync-retry") {
    t.disabled = true; t.textContent = "Connecting…";
    cloudInit().then(() => { if (CLOUD.failed) toast("Sync still couldn't load (" + (CLOUD.err || "unknown error") + "). Check your connection, or try in the browser."); else { toast("Sync is back."); if (S.ready && !CLOUD.user) render(); } safeRender(); });
    return;
  }
  if (act === "bench-toggle") { S.benchOpen = !S.benchOpen; glitchNext(".bench"); const tt = $(".toast"); if (tt) tt.hidden = true; render(); if (S.benchOpen) { const el = $(".bench.open"); if (el) el.scrollTop = 0; } return; }
  if (act === "install" && installEvt) { const ev = installEvt; ev.prompt(); ev.userChoice.finally(() => { installEvt = null; render(); }); return; }
  if (act === "save-incoming" && d) return saveIncoming(d);
  if (act === "inc-cancel-no") { S.confirm = null; return render(); }
  if (act === "undo") {
    S.confirm = "undo";
    // Read the other deck's history now, so the question can name it.
    const others = d ? unreadPartners(d.log[d.log.length - 1]) : [];
    if (others.length) Promise.all(others.map(ensureHistory)).then(() => safeRender());
    return render();
  }
  if (act === "unprint-no" || act === "binrm-no") { S.confirm = null; return render(); }
  if (act === "copy-toprint" && d) { if ($(".menu")) render(); return copyText(incomingNeeds(d).map(x => `${x.q}x ${x.n}`).join("\n"), "Incoming cards"); }
  if (act === "undo-no") { S.confirm = null; return render(); }
  if (act === "undo-yes" && d) return undoNow(d);
  const dlg = t.dataset.dlg; if (!dlg) return;
  if (dlg === "close") return closeDialog();
  if (dlg === "create") {
    const p = parseList(($("#n-list") || {}).value || "");
    if (!p.cards.length) { toast("Paste a list first, one card per line."); return; }
    const cmds = [...document.querySelectorAll('input[name="n-cmd"]:checked')].map(i => i.value);
    const name = ($("#n-name").value || "").trim();
    const plan = planFromCheck(p.cards, S.dialog.rules || RULE_DEFAULTS(), S.dialog.src);
    const wait = plan.wait;
    const steal = plan ? plan.steal : [];
    const left = new Map(p.cards.map(c => [c.n, c.q])); for (const w of [...wait, ...steal]) { const v = (left.get(w.n) || 0) - w.q; if (v > 0) left.set(w.n, v); else left.delete(w.n); }
    const deck = newDeck({ name, cards: p.cards.filter(c => left.has(c.n)).map(c => ({ n: c.n, q: left.get(c.n) })), commanders: cmds });
    if (wait.length) { const now = Date.now() + 1, id = uid(); deck.incoming = [{ id, t: now, out: [], in: wait }]; deck.log.push({ id, t: now, kind: "incoming", out: [], in: wait }); }
    const link = ($("#n-link").value || "").trim(); if (/^https?:\/\//i.test(link)) deck.link = link;
    const desc = (($("#n-desc") || {}).value || "").trim(); if (desc) deck.desc = desc;
    let fromBin = 0, moved = 0;
    if (steal.length) {
      S.decks.set(deck.id, deck); const bySrc = new Map();
      for (const x of steal) { if (!bySrc.has(x.id)) bySrc.set(x.id, []); bySrc.get(x.id).push({ n: x.n, q: x.q }); }
      for (const [id, items] of bySrc) { const src = S.decks.get(id); if (src) { const have = curMap(src); moved += transferCards(src, deck, items.map(x => ({ n: x.n, q: Math.min(x.q, have.get(x.n) || 0) }))); } }
      deck.commanders = cmds.filter(n => curMap(deck).has(n) || p.cards.some(c => c.n === n));
    }
    if (plan && plan.bin.length) {
      const owned = curMap(deck); S.decks.set(deck.id, deck);
      for (const x of plan.bin) { const q = Math.min(x.q, owned.get(x.n) || 0); if (q) fromBin += pullFromBin(x.n, q, deck).got; }
    }
    save(deck); closeDialog(); S.tab = "current"; go("deck", deck.id); if (fromBin || moved) { const parts = [fromBin ? `${fromBin} from the card bin` : "", moved ? `${moved} from other decks` : ""].filter(Boolean).join(" and "); toast(`Deck created with ${parts}${wait.length ? `; ${qsum(wait)} waiting as incoming` : ""}.`); return; } toast(wait.length ? `Deck created. ${qsum(wait)} card${qsum(wait) > 1 ? "s are" : " is"} waiting as incoming; press Arrived when they're in hand.` : "Deck created.");
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
  if (dlg === "del") { S.dialog.del = true; return renderDialog(); }
  if (dlg === "del-no") { S.dialog.del = false; return renderDialog(); }
  if (dlg === "del-yes") {
    const id = S.dialog.id; const dd = S.decks.get(id); const keepEl = $("#del-keep"); const keep = !!(keepEl && keepEl.checked);
    let kept = 0;
    if (dd && keep) { const now = Date.now(); for (const p of dd.printed) if (p.q > 0) { S.loose.cards.push({ n: p.n, q: p.q, from: dd.name, at: now }); kept += p.q; } saveLoose(); }
    closeDialog(); removeDeck(id); go("library"); return toast(kept ? `Deck deleted. ${kept} owned cards moved to the card bin.` : "Deck deleted.");
  }
  if (dlg === "to-bench" || dlg === "to-bench-save") {
    const dd = S.decks.get(S.dialog.id); const df = S.dialog.diff; if (!df) return;
    if (dlg === "to-bench-save" && /^https?:\/\//i.test(S.dialog.fetchedLink || "")) dd.link = S.dialog.fetchedLink;
    dd.bench = { out: df.out, in: df.ins, note: dd.bench.note || "", kind: "import" };
    closeDialog(); S.tab = "current"; S.benchOpen = true; render(); save(dd); toast(dlg === "to-bench-save" ? "Link saved. Changes are on the swap bench; review, then save." : "Changes are on the swap bench. Review, then save."); return;
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "s-lib") { S.libSort = e.target.value; try { localStorage.setItem("cdl-lib-sort", S.libSort); } catch {} render(); const el = $("#s-lib"); if (el) el.focus(); return; }
  if (e.target.id === "s-sort") { S.sort = e.target.value; try { localStorage.setItem("ledger-sort", S.sort); } catch {} render(); const el = $("#s-sort"); if (el) el.focus(); return; }
  if (e.target.id === "imp-file" && e.target.files && e.target.files[0]) { readBackup(e.target.files[0]); e.target.value = ""; return; }
  if (e.target.id === "e-artcard" && S.dialog) { const dd = S.decks.get(S.dialog.id); keepDialogFields(); if (e.target.value === "__none") dd.artOff = true; else { dd.artOff = false; dd.artCard = e.target.value; } save(dd); render(); renderDialog(); return; }
  if (e.target.id === "e-artpos" && S.dialog) { const dd = S.decks.get(S.dialog.id); keepDialogFields(); dd.artPos = e.target.value; save(dd); render(); renderDialog(); return; }
  if (e.target.id === "del-keep" && S.dialog) S.dialog.keep = e.target.checked;
  if (e.target.classList && e.target.classList.contains("src-pick") && S.dialog) { S.dialog.src = S.dialog.src || {}; S.dialog.src[e.target.dataset.card] = e.target.value; return renderRules(); }
  if ((e.target.id === "cmp-a" || e.target.id === "cmp-b") && S.cmp) { S.cmp[e.target.id.slice(4)] = e.target.value; const id = e.target.id; render(); const el = $("#" + id); if (el) el.focus(); return; }
  if (e.target.id === "h-date") S.histDate = e.target.value;
  if (e.target.name === "n-cmd" && S.dialog) { S.dialog.cmdTouched = true; S.dialog.cmds = [...document.querySelectorAll('input[name="n-cmd"]:checked')].map(i => i.value); }
});
document.addEventListener("input", e => {
  const id = e.target.id; const d = S.deckId && S.decks.get(S.deckId);
  if (id === "f-lib") { S.libQ = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-lib"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (id === "f-all") { S.allFilter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-all"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (id === "f-bin") { S.binFilter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-bin"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (id === "f-cur") { S.filter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#f-cur"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } return; }
  if ((id === "s-out" || id === "s-in") && d) return showSugg(id.slice(2), e.target.value, d);
  if (id === "b-note" && d) { d.bench.note = e.target.value; saveSoon(d); return; }
  if (id === "n-list" && S.dialog) { S.dialog.text = e.target.value; return updateNewParse(); }
  if (id === "n-name" && S.dialog) S.dialog.name = e.target.value;
  if (id === "n-link" && S.dialog) S.dialog.link = e.target.value;
  if (id === "n-desc" && S.dialog) S.dialog.desc = e.target.value;
  if (id === "chk-link") { CHECK_LINK = e.target.value; try { localStorage.setItem("cdl-check-link", CHECK_LINK); } catch {} return; }
  if (id === "chk-list") { CHECK_TEXT = e.target.value; try { localStorage.setItem("cdl-check-text", CHECK_TEXT); } catch {} return updateCheck(); }
  if (id === "ba-list" && S.dialog) { S.dialog.text = e.target.value; return updateBinAdd(); }
  if (id === "ba-search") return showBaSugg(e.target.value);
  if (id === "u-list" && S.dialog) { S.dialog.text = e.target.value; S.dialog.paste = true; return updateDiff(); }
  if (id === "u-link" && S.dialog) { S.dialog.link = e.target.value; return; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && e.target.id === "f-lib" && e.target.value) { e.preventDefault(); S.libQ = ""; render(); const el = $("#f-lib"); if (el) el.focus(); return; }
  if (e.key === "Enter" && ["n-link", "chk-link", "u-link"].includes(e.target.id)) { e.preventDefault(); const w = e.target.id.split("-")[0]; const b = $(`[data-arch="${w}"]`); if (b && !b.disabled) archFetch(w, b); return; }
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
