// js/src/03-archidekt-combos.js: Archidekt link import and the combo finder (both through the Cloudflare Worker).
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- Archidekt link import (through the Cloudflare Worker in worker/) ----------
const ARCH_PROXY = "https://cdl-archidekt.deckledger.workers.dev/";
const archId = s => { const t = String(s || "").trim(); const m = t.match(/archidekt\.com\/(?:api\/)?decks\/(\d+)/i); return m ? m[1] : /^\d{1,12}$/.test(t) ? t : ""; };
const ARCH_MSG = {
  "bad-link": "That doesn't look like an Archidekt or shared deck link. It should look like archidekt.com/decks/12345/deck-name, or a shared deck link from this site.",
  "share-missing": "That shared deck isn't there. The link may be mistyped, or its owner stopped sharing it.",
  "share-off": "Couldn't reach shared decks just now. Check your connection, or paste the list instead.",
  "share-none": "Shared decks aren't set up on this copy of the site. Paste the list instead.",
  "share-err": "Couldn't open that shared deck. Try again in a minute, or paste the list instead.",
  "not-found": "Archidekt couldn't find that deck. If it's private, set it to public or unlisted on Archidekt, or paste the list instead.",
  private: "That deck is private on Archidekt. Set it to public or unlisted there, or paste the list instead.",
  empty: "That deck has no cards in it yet.",
  network: "Couldn't reach the import service. Check your connection, or paste the list instead.",
};
async function fetchArchidekt(link) {
  const sid = shareIdOf(link); if (sid) return fetchShare(sid); // a shared deck link from this site
  const id = archId(link); if (!id) throw new Error("bad-link");
  let res; try { res = await fetch(ARCH_PROXY + "?deck=" + encodeURIComponent(id)); } catch { throw new Error("network"); }
  let body = {}; try { body = await res.json(); } catch {}
  if (!res.ok || !body.text) throw new Error(body.error || "upstream");
  return body;
}
const archMsg = err => ARCH_MSG[err && err.message] || "Archidekt didn't answer properly. Try again in a minute, or paste the list instead.";
// Fetch button: fills the deck list box ("n" = New deck popup, "chk" = Deck check).
async function archFetch(where, btn) {
  const ids = { n: ["#n-link", "#n-fetch-msg"], chk: ["#chk-link", "#chk-fetch-msg"], u: ["#u-link", "#u-fetch-msg"] }[where];
  const linkEl = $(ids[0]);
  const link = linkEl ? linkEl.value : "";
  const say = (t, bad) => { const msg = $(ids[1]); if (msg) { msg.textContent = t; msg.className = "fetch-msg" + (bad ? " bad" : ""); msg.hidden = !t; } };
  if (btn) { btn.disabled = true; btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.innerHTML = "Fetching…"; }
  say("");
  try {
    const deck = await fetchArchidekt(link);
    if (where === "n" && S.dialog && S.dialog.kind === "new") {
      const dl = S.dialog; dl.text = deck.text; dl.link = link.trim(); dl.cmdTouched = false;
      const nm = $("#n-name"); if (nm && !nm.value.trim() && deck.name) dl.name = deck.name; else if (nm) dl.name = nm.value;
      const ds = $("#n-desc"); if (ds) dl.desc = ds.value.trim() ? ds.value : String(deck.desc || "").slice(0, 280);
      renderDialog();
    } else if (where === "u" && S.dialog && S.dialog.kind === "update") {
      const dl = S.dialog; const full = /^https?:\/\//i.test(link.trim()) ? link.trim() : "https://archidekt.com/decks/" + deck.id; dl.text = deck.text; dl.link = full; dl.fetchedLink = full; dl.fetchedName = deck.name; dl.paste = false;
      renderDialog();
    } else if (where === "chk") {
      CHECK_TEXT = deck.text; CHECK_LINK = link.trim();
      try { localStorage.setItem("cdl-check-text", CHECK_TEXT); localStorage.setItem("cdl-check-link", CHECK_LINK); } catch {}
      const ta = $("#chk-list"); if (ta) ta.value = CHECK_TEXT; updateCheck();
    }
    say(`Fetched ${deck.count} cards from “${deck.name || "your deck"}”.`);
  } catch (err) { say(archMsg(err), true); if (!["bad-link", "not-found", "private", "empty", "network", "share-missing", "share-off", "share-none", "share-err"].includes(err && err.message)) reportError("archidekt", "Archidekt import: " + (err && err.message), where); }
  finally { const b = $(`[data-arch="${where}"]`); if (b) { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; } }
}

// ---------- combos, from Commander Spellbook (through the same Cloudflare Worker) ----------
// A short fingerprint of the deck list, so a combo check is only trusted until the list changes.
function deckSig(d) { let h = 5381; const s = d.cur.map(c => c.n + ":" + c.q).sort().join("|"); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
// The deck's last combo check, if the list hasn't changed since.
const deckCombos = d => d && d.combos && d.combos.sig === deckSig(d) ? d.combos : null;
async function fetchCombos(d) {
  const cmds = (d.commanders || []).filter(n => d.cur.some(c => c.n === n));
  const body = { commanders: cmds, main: d.cur.filter(c => !cmds.includes(c.n)).map(c => ({ card: c.n, quantity: c.q })) };
  let res; try { res = await fetch(ARCH_PROXY + "combos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch { throw new Error("network"); }
  let out = {}; try { out = await res.json(); } catch {}
  if (!res.ok || !Array.isArray(out.included)) throw new Error(out.error || "upstream");
  return out;
}
const COMBO_MSG = { network: "Couldn't reach the combo service. Check your connection and try again.", busy: "Commander Spellbook is busy right now. Try again in a minute." };
async function openCombos(d) {
  openDialog({ kind: "combos", id: d.id, state: "loading" });
  try {
    const data = await fetchCombos(d);
    d.combos = { at: Date.now(), sig: deckSig(d), count: data.included.length, two: data.included.filter(c => c.twoCard).map(c => ({ cards: c.cards, produces: c.produces.slice(0, 3) })) };
    save(d);
    if (S.dialog && S.dialog.kind === "combos" && S.dialog.id === d.id) { S.dialog.state = "ok"; S.dialog.data = data; renderDialog(); }
    render();
  } catch (err) {
    if (!["network", "busy"].includes(err && err.message)) reportError("combos", "Combo finder: " + (err && err.message), "combos");
    if (S.dialog && S.dialog.kind === "combos" && S.dialog.id === d.id) { S.dialog.state = "err"; S.dialog.err = COMBO_MSG[err.message] || "Commander Spellbook didn't answer properly. Try again in a minute."; renderDialog(); }
  }
}
const CSB = "https://commanderspellbook.com";
function comboHtml(c, missing) {
  // Each card: its name, with its picture underneath.
  const card = n => { const miss = missing && missing.includes(n); return `<span class="cb-card${miss ? " miss" : ""}"><span class="cb-name">${cardLink(n)}${miss ? "<em>missing</em>" : ""}</span><button type="button" class="cb-zoom" data-card="${esc(n)}" aria-label="Show ${esc(n)} bigger"><img class="cb-img" src="${esc(imgUrl(n))}" alt="" loading="lazy" onerror="this.parentElement.remove()"></button></span>`; };
  const cards = c.cards.map(card).join('<span class="cb-plus" aria-hidden="true">+</span>');
  const extra = c.templates.length ? `<span class="cb-plus" aria-hidden="true">+</span><span class="cb-card tmpl"><span class="cb-name">${c.templates.map(esc).join(", ")}</span></span>` : "";
  const prod = c.produces.slice(0, 4).map(p => `<span class="cb-prod">${esc(p)}</span>`).join("") + (c.produces.length > 4 ? `<span class="cb-prod more">+${c.produces.length - 4} more</span>` : "");
  const steps = c.steps ? c.steps.split(/\n+/).filter(Boolean) : [];
  return `<li class="combo"><div class="cb-cards">${cards}${extra}</div><div class="cb-prods">${c.twoCard ? '<span class="flag warn cb-two">Two-card</span>' : ""}${prod}</div>
    ${steps.length || c.prereq ? `<details class="cb-more"><summary>How it works</summary>${c.prereq ? `<p class="cb-pre"><b>Setup:</b> ${esc(c.prereq).replace(/\n/g, " ")}</p>` : ""}${c.mana ? `<p class="cb-pre"><b>Mana:</b> ${esc(c.mana)}</p>` : ""}${steps.length ? `<ol>${steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}</details>` : ""}
    ${c.id ? `<a class="cb-link" href="${CSB}/combo/${encodeURIComponent(c.id)}/" target="_blank" rel="noopener">View on Commander Spellbook ${ICONS.ext}</a>` : ""}</li>`;
}
function combosDialogHtml(dl) {
  const d = S.decks.get(dl.id); let body;
  if (dl.state === "loading") body = `<p class="muted">Checking ${esc(d.name)} with Commander Spellbook…</p>`;
  else if (dl.state === "err") body = `<p class="fetch-msg bad">${esc(dl.err)}</p><button class="btn sm" data-act="combos-retry">Try again</button>`;
  else {
    const inc = dl.data.included, almost = dl.data.almost; const shown = dl.showAll ? almost : almost.slice(0, 10);
    body = `<section class="cb-sec"><h3>In this deck <span class="mono">${inc.length}</span></h3>${inc.length ? `<ul class="combos">${inc.map(c => comboHtml(c)).join("")}</ul>` : `<p class="muted">No known combos in this deck.</p>`}</section>`;
    // Combos one card away stay tucked away until asked for.
    if (almost.length) body += dl.showPossible
      ? `<section class="cb-sec" id="cb-possible"><h3>One card away <span class="mono">${dl.data.almostTotal}</span><button class="btn sm ghost cb-hide" data-act="combos-possible">Hide</button></h3><ul class="combos">${shown.map(c => comboHtml(c, c.missing)).join("")}</ul>${almost.length > shown.length ? `<button class="btn sm ghost" data-act="combos-more">Show ${almost.length - shown.length} more</button>` : ""}${dl.data.almostTotal > almost.length && dl.showAll ? `<p class="muted cb-note">Showing the ${almost.length} most popular.</p>` : ""}</section>`
      : `<button class="btn cb-possible" data-act="combos-possible" aria-expanded="false">${ICONS.caret}Show possible combos<span class="mono muted">${dl.data.almostTotal}</span></button><p class="muted cb-note">Combos this deck is one card away from.</p>`;
  }
  return `<div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Combos</h2><p class="muted" style="margin:4px 0 0;font-size:13px">${esc(d.name)}: combos the deck already has, and ones it's one card away from.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">${body}</div>
    <footer><span class="grow cb-credit">Combo data from <a href="${CSB}" target="_blank" rel="noopener">Commander Spellbook</a></span><button class="btn primary" data-dlg="close">Done</button></footer></div>`;
}
