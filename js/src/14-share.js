// js/src/14-share.js: read-only links to a deck.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- sharing ----------
// Sharing a deck saves a copy of its list, description and combos at shares/{id} in the database. Anyone with the
// link can read it; only the deck's owner can change or remove it (firestore.rules). The id is 22 random
// characters, so a link can't be guessed, and the database refuses to list shares, so they can't be browsed.
// The copy is updated each time the deck is saved to the account. History, owned cards and the bin stay private.
const SHARE_RE = /#share-([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/;
const shareIdOf = s => { const m = String(s || "").match(SHARE_RE); return m ? m[1] : ""; };
const shareUrl = id => location.origin + location.pathname + "#share-" + id;
const linkName = link => shareIdOf(link) ? "Shared deck" : "Archidekt";
function newShareId() {
  const b = new Uint8Array(16); crypto.getRandomValues(b); // 128 random bits
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- the owner's side ----
const shareSent = new Map(); // share id -> fingerprint of what was last saved there from this page
function shareBody(d) {
  const cb = deckCombos(d);
  return {
    owner: CLOUD.user.uid, v: 1,
    name: String(d.name || "").slice(0, 200), commanders: (d.commanders || []).slice(0, 4), desc: String(d.desc || "").slice(0, 4000),
    cur: d.cur.map(c => ({ n: c.n, q: c.q })),
    combos: cb ? { count: cb.count, at: cb.at, two: (cb.two || []).slice(0, 100) } : undefined,
  };
}
function shareWrite(promise, id, what) {
  CLOUD.pending++; updateSyncChip();
  promise.catch(err => {
    shareSent.delete(id);
    toast(`Couldn't ${what} the shared link (${String(err && (err.code || err.message) || err).slice(0, 80)}). It will try again on the next change.`);
  }).finally(() => { CLOUD.pending = Math.max(0, CLOUD.pending - 1); updateSyncChip(); });
}
// Called by cloudFlush after it saves a deck. Kept apart from the deck's own save, so a problem with the
// shared copy never stops the deck itself saving.
function writeShare(d) {
  if (!d.shareId || !CLOUD.user || !CLOUD.api) return;
  const body = shareBody(d), sig = strHash(stableStr(body));
  if (shareSent.get(d.shareId) === sig) return;
  shareSent.set(d.shareId, sig);
  const { fsM, db } = CLOUD.api;
  shareWrite(fsM.setDoc(fsM.doc(db, "shares", d.shareId), forCloud(Object.assign(body, { at: Date.now() }))), d.shareId, "update");
}
function dropShare(id) {
  shareSent.delete(id);
  if (!id || !CLOUD.user || !CLOUD.api) return;
  const { fsM, db } = CLOUD.api;
  shareWrite(fsM.deleteDoc(fsM.doc(db, "shares", id)), id, "remove");
}
function startSharing(d) { d.shareId = newShareId(); save(d); } // the next save to the account writes the copy too
function stopSharing(d) { const id = d.shareId; if (!id) return; delete d.shareId; save(d); dropShare(id); }

function shareDialogHtml(dl) {
  const d = S.decks.get(dl.id); if (!d) return "";
  let body;
  if (!CLOUD.enabled) body = `<p class="muted">Sharing needs the site's account features, which aren't set up on this copy of the site.</p>`;
  else if (!CLOUD.user) body = `<p>Sign in to share. The shared copy is kept with your account, so only you can change it.</p><div><button class="btn primary" data-act="signin">${ICONS.user}Sign in</button></div>`;
  else if (d.shareId) {
    body = `<div class="f"><label class="label" for="sh-link">Link to this deck</label><div class="linkrow"><input class="field mono" id="sh-link" readonly value="${esc(shareUrl(d.shareId))}"><button class="btn sm primary" data-dlg="sh-copy">${ICONS.copy}Copy link</button></div></div>
      <p class="muted sh-note">Changes you make to the deck show up at this link a moment after they're saved.</p>
      ${dl.stop ? `<div class="delbox"><span>Stop sharing ${esc(d.name)}? The link stops working for everyone who has it. Sharing again makes a new link.</span><span class="confirm"><button class="btn sm danger" data-dlg="sh-stop-yes">Stop sharing</button><button class="btn sm ghost" data-dlg="sh-stop-no">Keep sharing</button></span></div>`
        : `<div><button class="btn sm ghost" data-dlg="sh-stop">Stop sharing</button></div>`}`;
  } else body = `<p>Not shared yet. Making a link puts a read-only copy of this deck where anyone with the link can see it.</p><div><button class="btn primary" data-dlg="sh-make">${ICONS.share}Make a link</button></div>`;
  return `<div class="dialog sh-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Share ${esc(d.name)}</h2><p class="muted" style="margin:4px 0 0;font-size:13px">People with the link see the list, stats and combos, and can copy the list or add it to their own decks. They can't change yours. History, owned cards and your card bin stay private.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">${body}</div>
    <footer><button class="btn" data-dlg="close">Done</button></footer></div>`;
}
// Buttons in the share popup (data-dlg="sh-…").
function shareDlg(dlg) {
  const dl = S.dialog, d = dl && S.decks.get(dl.id); if (!d) return;
  if (dlg === "sh-make") { if (!CLOUD.user) return; startSharing(d); renderDialog(); return toast("Link made. Copy it and send it to anyone you want to see this deck."); }
  if (dlg === "sh-copy" && d.shareId) return copyText(shareUrl(d.shareId), "Link");
  if (dlg === "sh-stop") { dl.stop = true; return renderDialog(); }
  if (dlg === "sh-stop-no") { dl.stop = false; return renderDialog(); }
  if (dlg === "sh-stop-yes") { dl.stop = false; stopSharing(d); render(); renderDialog(); return toast("Stopped sharing. The old link no longer works."); }
}

// ---- reading a shared deck (works signed out) ----
const SHARE = { id: "", state: "", data: null, at: 0 }; // state: loading | ok | missing | off | err
// Waits for Firebase to load (or fail); true if it can be used.
function whenCloud(ms) {
  const t0 = Date.now(), limit = ms || 15000;
  return new Promise(res => { (function wait() { if (CLOUD.api || CLOUD.failed || !CLOUD.enabled || Date.now() - t0 > limit) return res(!!CLOUD.api); setTimeout(wait, 150); })(); });
}
// Reads shares/{id}; rejects with "share-off", "share-missing" or the database's error.
async function readShare(id) {
  if (!(await whenCloud())) throw new Error(CLOUD.enabled ? "share-off" : "share-none");
  const { fsM, db } = CLOUD.api;
  const snap = await fsM.getDoc(fsM.doc(db, "shares", id));
  if (!snap.exists()) throw new Error("share-missing");
  const x = snap.data() || {};
  const cur = (Array.isArray(x.cur) ? x.cur : []).filter(c => c && typeof c.n === "string" && c.q > 0).map(c => ({ n: c.n, q: Math.floor(c.q) }));
  const strs = a => (Array.isArray(a) ? a : []).filter(s => typeof s === "string");
  const cb = x.combos && typeof x.combos === "object" ? { count: +x.combos.count || 0, at: +x.combos.at || 0, two: (Array.isArray(x.combos.two) ? x.combos.two : []).filter(c => c && Array.isArray(c.cards)).map(c => ({ cards: strs(c.cards), produces: strs(c.produces) })) } : null;
  return { id: "share:" + id, owner: String(x.owner || ""), name: String(x.name || "Shared deck"), commanders: strs(x.commanders), desc: String(x.desc || ""), cur, combos: cb, at: +x.at || 0 };
}
function loadShare(id) {
  SHARE.id = id; SHARE.state = "loading"; SHARE.data = null;
  readShare(id).then(data => { if (SHARE.id !== id) return; SHARE.data = data; SHARE.state = "ok"; safeRender(); })
    .catch(err => {
      if (SHARE.id !== id) return;
      const m = err && err.message; SHARE.state = m === "share-missing" ? "missing" : m === "share-none" ? "off" : "err";
      if (SHARE.state === "err") reportError("share", "Shared deck: " + String(err && (err.code || err.message) || err).slice(0, 200), "view");
      safeRender();
    });
}
// The shared deck as the import boxes want it (see fetchArchidekt).
async function fetchShare(id) {
  const sd = await readShare(id).catch(err => { throw new Error(["share-missing", "share-off", "share-none"].includes(err && err.message) ? err.message : "share-err"); });
  if (!sd.cur.length) throw new Error("empty");
  return { id, name: sd.name, desc: sd.desc, text: listText(sd, sd.cur, true), count: total(sd) };
}
const shareDeck = () => S.view === "share" && SHARE.state === "ok" && SHARE.id === S.shareId ? SHARE.data : null;

function renderShare() {
  if (SHARE.id !== S.shareId) loadShare(S.shareId);
  const back = `<button class="crumb" data-act="home">${ICONS.back}${S.decks.size ? "Your decks" : "Deck Ledger"}</button>`;
  const stop = (title, text, retry) => `${back}<div class="empty"><h2>${title}</h2><p>${text}</p>${retry ? `<button class="btn" data-act="share-retry">Try again</button>` : ""}</div>`;
  if (SHARE.state === "loading") return stop("Opening shared deck…", "Getting the list from its owner's account.");
  if (SHARE.state === "missing") return stop("This shared deck isn't here", "The link may be mistyped, or its owner stopped sharing it.");
  if (SHARE.state === "off") return stop("Shared decks aren't set up here", "This copy of the site doesn't have the account features that shared decks use.");
  if (SHARE.state !== "ok") return stop("Couldn't open this shared deck", "Check your connection and try again.", true);
  const sd = SHARE.data, t = total(sd), cmd = sd.commanders.length ? sd.commanders.join(" & ") : sd.name;
  const mine = CLOUD.user && CLOUD.user.uid === sd.owner && [...S.decks.values()].find(x => x.shareId === S.shareId);
  const tab = ["list", "stats", "combos"].includes(S.shareTab) ? S.shareTab : "list";
  const tb = (id, label, n) => `<button class="tab${tab === id ? " on" : ""}" role="tab" aria-selected="${tab === id}" data-sharetab="${id}">${label}${n === "" ? "" : `<span class="n">${n}</span>`}</button>`;
  let h = `${back}<div class="dhead"><div>
    <div class="eyebrow">${ciPips(deckCI(sd))}<span class="tag-ex tag-share">Shared · read only</span></div>
    <h2>${esc(cmd)}</h2>
    <div class="dn">${esc(sd.name)} · ${t} card${t === 1 ? "" : "s"}${sd.at ? ` · updated ${fmtDate(sd.at)}` : ""}</div>
    ${sd.desc ? `<p class="ddesc">${esc(sd.desc)}</p>` : ""}
  </div><div class="actions">
    <button class="btn" data-act="share-copy">${ICONS.copy}Copy deck list</button>
    ${mine ? `<button class="btn primary" data-open="${esc(mine.id)}">Open your deck</button>` : `<button class="btn primary" data-act="share-add">${ICONS.plus}Add to my decks</button>`}
  </div></div>
  ${mine ? `<p class="muted sh-mine">This is the link to one of your decks. It shows what other people see.</p>` : ""}
  <div class="tabs" role="tablist">${tb("list", "Deck list", t)}${tb("stats", "Stats", "")}${tb("combos", "Combos", sd.combos ? sd.combos.count : "")}</div>
  <div class="tabpanel" role="tabpanel">`;
  if (tab === "stats") h += renderStats(sd);
  else if (tab === "combos") h += shareCombos(sd);
  else h += shareList(sd);
  return h + `</div>`;
}
function shareList(sd) {
  const groups = new Map(), cmds = sd.commanders;
  for (const c of sd.cur) { const g = cmds.includes(c.n) ? "CMD" : TYPE_ORDER.includes(typeOf(c.n)) ? typeOf(c.n) : "O"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  let h = `<div class="groups">`;
  for (const g of ["CMD", ...TYPE_ORDER]) {
    const arr = groups.get(g); if (!arr) continue;
    arr.sort(cardSorter(S.sort));
    h += `<div class="group"><h3>${g === "CMD" ? "Commander" : TYPE_NAME[g]}<span class="mono">${arr.reduce((a, c) => a + c.q, 0)}</span></h3>`;
    for (const c of arr) { const r = rec(c.n); h += `<div class="row"><span class="q">${c.q}</span><span class="nm"><span>${cardLink(c.n)}</span></span>${r ? pipsFor(r[1]) : "<span></span>"}<span class="acts"></span></div>`; }
    h += `</div>`;
  }
  return h + `</div>`;
}
function shareCombos(sd) {
  const cb = sd.combos;
  if (!cb) return `<p class="muted">Its owner hasn't checked this deck for combos yet.</p>`;
  const two = cb.two.map(c => comboHtml({ cards: c.cards, produces: c.produces, templates: [], twoCard: true })).join("");
  return `<section class="cb-sec"><p class="muted">Commander Spellbook found ${cb.count} combo${cb.count === 1 ? "" : "s"} in this deck${cb.at ? ` when its owner checked on ${fmtDate(cb.at)}` : ""}.</p>
    <h3>Two-card combos <span class="mono">${cb.two.length}</span></h3>${two ? `<ul class="combos">${two}</ul>` : `<p class="muted">None.</p>`}</section>`;
}
// Buttons on a shared deck's page (data-act="share-…").
function shareAct(act) {
  const sd = shareDeck();
  if (act === "share-retry") { SHARE.id = ""; return render(); }
  if (!sd) return;
  if (act === "share-copy") return copyText(listText(sd, sd.cur, true), "Deck list");
  if (act === "share-add") return openDialog({ kind: "new", cmds: [], name: sd.name, desc: sd.desc.slice(0, 280), text: listText(sd, sd.cur, true), link: shareUrl(S.shareId), rules: RULE_DEFAULTS() });
}
