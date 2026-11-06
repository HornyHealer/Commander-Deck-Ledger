// js/src/14-dialogs.js: popups.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- dialogs ----------
function openDialog(dl) { S.dialog = dl; renderDialog(); }
function closeDialog() { S.dialog = null; lastDialogKey = null; const s = $(".scrim"); if (s) s.remove(); document.querySelectorAll(".vfx.p, .vfx-ghosts.p").forEach(el => el.remove()); }
function renderDialog() {
  let s = $(".scrim"); if (!s) { s = document.createElement("div"); s.className = "scrim"; document.body.appendChild(s); }
  const dl = S.dialog; let h = "";
  if (dl.kind === "new") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><h2 id="dlg-t">New deck</h2><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">
      <label class="f"><span class="label">Deck name</span><input class="field" id="n-name" placeholder="Flaming Cobra Chickens" value="${esc(dl.name || "")}"></label>
      <div class="f"><label class="label" for="n-link">Archidekt link (optional)</label><div class="linkrow"><input class="field" id="n-link" placeholder="https://archidekt.com/decks/…" value="${esc(dl.link || "")}" autocomplete="off"><button class="btn sm" data-arch="n" data-act="arch-fetch">${ICONS.down}Fetch</button></div><p class="fetch-msg" id="n-fetch-msg" hidden></p></div>
      <label class="f"><span class="label">Short description (optional)</span><textarea class="field short" id="n-desc" maxlength="280" placeholder="What the deck does and how it wins">${esc(dl.desc || "")}</textarea></label>
      <label class="f"><span class="label">Deck list</span><textarea class="field" id="n-list" placeholder="1 Zagras, Thief of Heartbeats [Commander]&#10;1 Sol Ring&#10;1 Arcane Signet&#10;30 Mountain">${esc(dl.text || "")}</textarea></label>
      <div id="n-parse"></div>
      <div class="f"><span class="label">Your collection</span><div id="n-rules" class="rules"></div></div>
    </div>
    <footer><span class="grow">The cards you have are saved as the deck's original list.</span><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="create">Create deck</button></footer></div>`;
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
      <div class="f"><span class="label">Delete</span><div style="margin-top:5px">${dl.del ? `<div class="delbox"><span>Delete ${esc(d.name)} and all of its history?</span>${printedTotal(d) ? `<label class="checkline"><input type="checkbox" id="del-keep" ${dl.keep === false ? "" : "checked"}> Keep its ${printedTotal(d)} owned card${printedTotal(d) > 1 ? "s" : ""} in the card bin</label>` : ""}<span class="confirm"><button class="btn sm danger" data-dlg="del-yes">Delete deck</button><button class="btn sm ghost" data-dlg="del-no">Keep it</button></span></div>` : `<button class="btn sm danger" data-dlg="del">Delete this deck</button>`}</div></div>
    </div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button><button class="btn primary" data-dlg="save-edit">Save</button></footer></div>`;
  } else if (dl.kind === "update") {
    const d = S.decks.get(dl.id); const saveLink = dl.fetchedLink && dl.fetchedLink !== (d.link || "");
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Update from Archidekt</h2><p class="muted" style="margin:4px 0 0;font-size:13px">Compares this deck with its Archidekt list. The differences go onto the swap bench, where you decide what to keep before saving.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db"><div class="f"><label class="label" for="u-link">${d.link ? "Archidekt link saved with this deck" : "Archidekt link for this deck"}</label><div class="linkrow"><input class="field" id="u-link" placeholder="https://archidekt.com/decks/…" value="${esc(dl.link ?? d.link ?? "")}" autocomplete="off"><button class="btn sm" data-arch="u" data-act="arch-fetch">${ICONS.down}Fetch</button></div><p class="fetch-msg" id="u-fetch-msg" hidden></p></div>
      <details class="u-paste"${dl.paste ? " open" : ""}><summary>Or paste a list instead</summary><textarea class="field" id="u-list" placeholder="Paste the full current list">${esc(dl.text || "")}</textarea></details>
      <div id="u-diff"></div></div>
    <footer><button class="btn ghost" data-dlg="close">Cancel</button>${saveLink ? `<button class="btn" data-dlg="to-bench-save" id="u-go-save" disabled>Save link &amp; put changes on the bench</button>` : ""}<button class="btn primary" data-dlg="to-bench" id="u-go" disabled>Put changes on the bench</button></footer></div>`;
  } else if (dl.kind === "combos") {
    h = combosDialogHtml(dl);
  } else if (dl.kind === "binadd") {
    h = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Add to card bin</h2><p class="muted" style="margin:6px 0 0;font-size:13px">For cards you already own that aren't in a deck. Search for a card, or paste a list with one card per line like <span class="mono">2x Sol Ring</span>.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
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
  const dlgKey = dl.kind + ":" + (dl.state || "");
  if (dlgKey !== lastDialogKey && !reduceMotion()) playGlitch(s.querySelector(".dialog"), "pop");
  lastDialogKey = dlgKey;
  if (dl.kind === "new") { updateNewParse(); setTimeout(() => $("#n-name") && !dl.text && $("#n-name").focus(), 0); }
  if (dl.kind === "update") { updateDiff(); if (!dl.fetchedLink && !$("#u-link").value) setTimeout(() => $("#u-link") && $("#u-link").focus(), 0); }
  if (dl.kind === "binadd") { updateBinAdd(); setTimeout(() => $("#ba-search") && $("#ba-search").focus(), 0); }
  if (dl.kind === "copy") setTimeout(() => { const t = $("#c-text"); if (t) { t.focus(); t.select(); } }, 0);
}
function keepDialogFields() { const n = $("#e-name"), l = $("#e-link"), ds = $("#e-desc"); if (S.dialog && n) { S.dialog.name = n.value; S.dialog.link = l ? l.value : S.dialog.link; if (ds) S.dialog.desc = ds.value; S.dialog.cmds = [...document.querySelectorAll('input[name="e-cmd"]:checked')].map(i => i.value); } }
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
// Where each card of a checked list goes when creating a deck from it, by group:
// bin: owned (taken out of the bin) or incoming; decks: swap (moved from that deck), owned or incoming;
// need: incoming or owned.
const RULE_OPTS = {
  bin: { title: "In the card bin", opts: [["incoming", "New Incoming", "Wait for a new copy; the bin keeps its copy"], ["owned", "Use Owned", "Taken out of the bin and into this deck"]] },
  decks: { title: "In other decks", opts: [["swap", "Swap from Decks", "Moved out of the other deck; undo from either deck"], ["incoming", "New Incoming", "Wait for a new copy; the other deck keeps its copy"], ["owned", "Add to Collection", "Counted as owned here too; the other deck keeps its copy"]] },
  need: { title: "Not owned", opts: [["incoming", "New Incoming", "Kept out of the deck until it arrives"], ["owned", "Add to Collection", "You have it already; added as owned"]] },
};
// "Not owned" starts as Owned for someone's first deck (so an existing deck goes straight in), Incoming after that.
const firstDeck = () => ![...S.decks.values()].some(d => !d.example);
const RULE_DEFAULTS = () => ({ bin: "incoming", decks: "incoming", need: firstDeck() ? "owned" : "incoming" });
// src: { cardName: deckId } picks which deck a card comes from when it's in more than one.
function planFromCheck(cards, rules, src = {}) {
  const plan = { wait: [], steal: [], bin: [], groups: { bin: [], decks: [], need: [] } };
  for (const r of collectionCheck(cards)) {
    if (r.basic) continue;
    if (r.fromBin) { plan.groups.bin.push({ n: r.n, q: r.fromBin }); (rules.bin === "owned" ? plan.bin : plan.wait).push({ n: r.n, q: r.fromBin }); }
    if (r.fromDecks) {
      const pick = src[r.n]; const decks = [...r.decks].sort((a, b) => (b.id === pick) - (a.id === pick));
      const from = []; let left = r.fromDecks;
      for (const x of decks) { if (!left) break; const q = Math.min(x.q, left); left -= q; from.push({ n: r.n, q, id: x.id, name: x.name }); }
      plan.groups.decks.push({ n: r.n, q: r.fromDecks, decks: r.decks, from });
      if (rules.decks === "swap") plan.steal.push(...from);
      else if (rules.decks !== "owned") plan.wait.push({ n: r.n, q: r.fromDecks });
    }
    if (r.need) { plan.groups.need.push({ n: r.n, q: r.need }); if (rules.need !== "owned") plan.wait.push({ n: r.n, q: r.need }); }
  }
  return plan;
}
function renderRules() {
  const el = $("#n-rules"); const dl = S.dialog; if (!el || !dl || dl.kind !== "new") return;
  dl.rules = dl.rules || RULE_DEFAULTS();
  if (!((dl.parsed || {}).cards || []).length) { el.innerHTML = `<p class="muted rules-empty">Paste a list or fetch one from Archidekt to see which cards you already own.</p>`; return; }
  dl.open = dl.open || {}; dl.src = dl.src || {};
  const plan = planFromCheck((dl.parsed || { cards: [] }).cards, dl.rules, dl.src); dl.plan = plan;
  const cardList = (g, arr) => `<ul class="rule-list">${arr.map(x => {
    let right = "";
    if (g === "decks" && dl.rules.decks !== "swap") right = `<span class="src">In ${x.decks.map(dk => esc(dk.name)).join(", ")}</span>`;
    else if (g === "decks") {
      right = x.decks.length > 1
        ? `<label class="src"><span>From</span><select class="field src-pick" data-card="${esc(x.n)}" aria-label="Which deck ${esc(x.n)} comes from">${x.decks.map(dk => `<option value="${esc(dk.id)}" ${x.from[0] && x.from[0].id === dk.id ? "selected" : ""}>${esc(dk.name)}${dk.q > 1 ? ` (${dk.q})` : ""}</option>`).join("")}</select></label>`
        : `<span class="src">From ${esc(x.decks[0].name)}</span>`;
    }
    return `<li><span class="q mono">${x.q}</span><span class="rn">${esc(x.n)}</span>${right}</li>`;
  }).join("")}</ul>`;
  const rows = Object.entries(RULE_OPTS).filter(([g]) => plan.groups[g].length).map(([g, o]) => {
    const cur = dl.rules[g]; const arr = plan.groups[g]; const n = qsum(arr); const tip = (o.opts.find(x => x[0] === cur) || [])[2] || "";
    const multi = g === "decks" && cur === "swap" ? arr.filter(x => x.decks.length > 1).length : 0; const open = !!dl.open[g];
    return `<div class="rule"><div class="rule-head"><span class="rule-t">${o.title}<b class="mono">${n}</b></span><div class="chips seg" role="group" aria-label="${o.title}">${o.opts.map(([v, l]) => `<button type="button" class="chip${cur === v ? " on" : ""}" aria-pressed="${cur === v}" data-rule="${g}|${v}">${l}</button>`).join("")}</div></div>
      <div class="rule-sub"><button type="button" class="rule-toggle" data-rule-open="${g}" aria-expanded="${open}">${open ? "Hide" : "Show"} ${arr.length} card${arr.length === 1 ? "" : "s"} ${open ? "▴" : "▾"}</button><span class="rule-tip">${tip}</span>${multi ? `<span class="rule-multi">${multi} in more than one deck${open ? "" : ", pick which"}</span>` : ""}</div>
      ${open ? cardList(g, arr) : ""}</div>`;
  });
  el.innerHTML = rows.length ? rows.join("") : `<p class="muted" style="margin:4px 0 0;font-size:13px">Every card in this list is a basic land, so there's nothing to sort.</p>`;
}
function updateNewParse() {
  const el = $("#n-parse"); const ta = $("#n-list"); if (!el || !ta) return;
  const p = parseList(ta.value); const dl = S.dialog; dl.parsed = p;
  if (!p.cards.length) { el.innerHTML = ""; renderRules(); return; }
  const t = p.cards.reduce((a, c) => a + c.q, 0);
  const leg = p.cards.filter(c => isCmdrPick(rec(c.n))).map(c => c.n);
  if (!dl.cmdTouched) dl.cmds = p.commanders.length ? p.commanders : (leg.length === 1 ? leg : []);
  const opts = [...new Set([...p.commanders, ...leg])];
  el.innerHTML = `<div class="parse-sum"><span><b class="mono">${t}</b> cards</span><span><b class="mono">${p.cards.length}</b> unique</span>${p.unknown.length ? `<span class="unk">${p.unknown.length} not recognized: ${p.unknown.slice(0, 6).map(esc).join(", ")}${p.unknown.length > 6 ? "…" : ""}</span>` : '<span style="color:var(--good)">All names recognized</span>'}</div>
  <div class="f" style="margin-top:10px"><span class="label">Commander</span><div class="cmdpick" style="margin-top:5px">${opts.length ? opts.map(n => `<label><input type="checkbox" name="n-cmd" value="${esc(n)}" ${dl.cmds.includes(n) ? "checked" : ""}>${esc(n)}</label>`).join("") : '<span class="muted" style="font-size:13px">No legendary creatures found. You can set it later.</span>'}</div></div>`;
  renderRules();
}
// Compares a list with the deck as it will be once its incoming changes arrive, so cards already on their way
// aren't added twice. Cuts only come from cards actually in the deck list.
function diffLists(d, p) {
  const cm = curMap(d); const will = new Map(cm);
  for (const b of incomingOf(d)) { for (const o of b.out) { const v = (will.get(o.n) || 0) - o.q; if (v > 0) will.set(o.n, v); else will.delete(o.n); } for (const i of b.in) will.set(i.n, (will.get(i.n) || 0) + i.q); }
  const nm = new Map(p.cards.map(c => [c.n, c.q])); const out = [], ins = [], dropInc = [];
  for (const [n, q] of will) { const v = nm.get(n) || 0; if (v < q) { const cut = Math.min(q - v, cm.get(n) || 0); if (cut) out.push({ n, q: cut }); if (q - v > cut) dropInc.push({ n, q: q - v - cut }); } }
  for (const [n, q] of nm) { const v = will.get(n) || 0; if (q > v) ins.push({ n, q: q - v }); }
  return { out, ins, dropInc };
}
function updateDiff() {
  const el = $("#u-diff"); const ta = $("#u-list"); if (!el || !ta) return;
  const d = S.decks.get(S.dialog.id); const p = parseList(ta.value); const go = $("#u-go");
  if (!p.cards.length) { el.innerHTML = ""; if (go) go.disabled = true; const gs = $("#u-go-save"); if (gs) gs.disabled = true; return; }
  const { out, ins, dropInc } = diffLists(d, p); S.dialog.diff = { out, ins };
  if (go) go.disabled = !(out.length || ins.length); const gs = $("#u-go-save"); if (gs) gs.disabled = !(out.length || ins.length);
  const li = (a, cls) => a.length ? a.map(x => `<li class="${cls}">${x.q > 1 ? x.q + " " : ""}${esc(x.n)}</li>`).join("") : '<li class="muted">None</li>';
  el.innerHTML = (out.length || ins.length) ? `<div class="diffcols"><div><span class="label" style="color:var(--bad)">Coming out · ${out.reduce((a, x) => a + x.q, 0)}</span><ul>${li(out, "")}</ul></div><div><span class="label" style="color:var(--good)">Going in · ${ins.reduce((a, x) => a + x.q, 0)}</span><ul>${li(ins, "")}</ul></div></div>${p.unknown.length ? `<p class="unk">${p.unknown.length} names not recognized: ${p.unknown.slice(0, 6).map(esc).join(", ")}</p>` : ""}${dropInc.length ? `<p class="muted u-note">Still incoming but no longer on the list: ${dropInc.map(x => esc(x.n)).join(", ")}. Cancel ${dropInc.length > 1 ? "them" : "it"} from the Incoming box if you don't need ${dropInc.length > 1 ? "them" : "it"}.</p>` : ""}` : `<p class="muted">This list matches the deck${incomingOf(d).length ? " (counting its incoming cards)" : ""} exactly.</p>`;
}
