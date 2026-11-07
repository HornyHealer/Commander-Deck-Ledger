// js/src/14-share.js: read-only links to a deck.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- sharing ----------
// Sharing a deck saves a copy of its list, description and combos at shares/{id} in the database. Anyone with the
// link can read it; only the deck's owner can change or remove it (firestore.rules). The id is 22 random
// characters, so a link can't be guessed, and the database refuses to list shares, so they can't be browsed.
// The copy is updated each time the deck is saved to the account. History, owned cards and the bin stay private.
// Signed in, a deck's address is its share link (deckHash), and render() sends its owner to their own deck.
const SHARE_RE = /#share-([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/;
const shareIdOf = s => { const m = String(s || "").match(SHARE_RE); return m ? m[1] : ""; };
const shareUrl = id => location.origin + location.pathname + "#share-" + id;
const linkName = link => shareIdOf(link) ? "Shared deck" : "Archidekt";
function newShareId() {
  const b = new Uint8Array(16); crypto.getRandomValues(b); // 128 random bits
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- the owner's side ----
// Signed in, every deck has a link unless its owner made it private (d.noShare), and the deck's own address
// is that link: you open it as your deck, anyone else sees it read-only. d.shareSig fingerprints what was last
// saved to the shared copy, so it's only rewritten when the list, name, description or combos change.
const shareFailed = new Set(); // links whose copy couldn't be saved on this visit; tried again next visit
let shareWarned = false;
function shareBody(d) {
  const cb = deckCombos(d);
  return {
    owner: CLOUD.user.uid, v: 1,
    name: String(d.name || "").slice(0, 200), commanders: (d.commanders || []).slice(0, 4), desc: String(d.desc || "").slice(0, 4000),
    cur: d.cur.map(c => ({ n: c.n, q: c.q })),
    combos: cb ? { count: cb.count, at: cb.at, two: (cb.two || []).slice(0, 100) } : undefined,
  };
}
const shareSigOf = d => strHash(stableStr(shareBody(d)));
function shareWrite(promise, what, onFail) {
  CLOUD.pending++; updateSyncChip();
  promise.catch(err => {
    if (onFail) onFail(err);
    if (!shareWarned) { shareWarned = true; toast(`Couldn't ${what} a deck's shared link (${String(err && (err.code || err.message) || err).slice(0, 80)}). Your decks still saved; the link will try again next visit.`); }
  }).finally(() => { CLOUD.pending = Math.max(0, CLOUD.pending - 1); updateSyncChip(); });
}
// cloudFlush calls this just before it saves a deck: gives the deck a link if it should have one, and says
// whether the shared copy needs saving too (writeShare, after the deck itself).
function prepShare(d) {
  if (!d.shareId && !d.noShare) d.shareId = newShareId();
  if (!d.shareId || shareFailed.has(d.shareId)) return false;
  const sig = shareSigOf(d); if (d.shareSig === sig) return false;
  d.shareSig = sig; return true;
}
// Saved apart from the deck, so a problem with the shared copy never stops the deck itself saving.
function writeShare(d) {
  const id = d.shareId, { fsM, db } = CLOUD.api, ref = fsM.doc(db, "shares", id);
  shareWrite(fsM.setDoc(ref, forCloud(Object.assign(shareBody(d), { at: Date.now() }))), "save", async err => {
    shareFailed.add(id);
    if (d.shareId !== id) return;
    d.shareSig = ""; saveSoon(d); // so the next visit tries again
    // A deck restored from someone else's backup still points at their link: give it its own.
    if (err && err.code === "permission-denied") try {
      const snap = await fsM.getDoc(ref);
      if (snap.exists() && snap.data().owner !== CLOUD.user.uid && d.shareId === id) { d.shareId = newShareId(); save(d); }
    } catch { /* the rules may not allow shares yet */ }
  });
}
// Once your decks have loaded from the account: links for decks that don't have one yet, and copies that
// didn't save last time.
let shareChecked = false;
function shareCheck() {
  if (shareChecked || !CLOUD.user) return; shareChecked = true;
  for (const d of S.decks.values()) if ((!d.shareId && !d.noShare) || (d.shareId && d.shareSig !== shareSigOf(d))) save(d);
}
function dropShare(id) {
  if (!id || !CLOUD.user || !CLOUD.api) return;
  const { fsM, db } = CLOUD.api;
  shareWrite(fsM.deleteDoc(fsM.doc(db, "shares", id)), "remove");
}
function startSharing(d) { delete d.noShare; delete d.shareSig; d.shareId = newShareId(); save(d); }
function stopSharing(d) { const id = d.shareId; d.noShare = true; delete d.shareId; delete d.shareSig; save(d); dropShare(id); }
// This deck's address: its link when it has one, so the address bar is always what to send.
const deckHash = d => d && d.shareId && CLOUD.user ? "#share-" + d.shareId : "#deck-" + (d ? d.id : S.deckId);

function shareDialogHtml(dl) {
  const d = S.decks.get(dl.id); if (!d) return "";
  let body;
  if (!CLOUD.enabled) body = `<p class="muted">Sharing needs the site's account features, which aren't set up on this copy of the site.</p>`;
  else if (!CLOUD.user) body = `<p>Sign in to share. Signed in, every deck gets a link that only you can change.</p><div><button class="btn primary" data-act="signin">${ICONS.user}Sign in</button></div>`;
  else if (d.shareId) {
    body = `<div class="f"><label class="label" for="sh-link">Link to this deck</label><div class="linkrow"><input class="field mono" id="sh-link" readonly value="${esc(shareUrl(d.shareId))}"><button class="btn sm primary" data-dlg="sh-copy">${ICONS.copy}Copy link</button></div></div>
      <p class="muted sh-note">It's the address of this page, so you can copy it from the address bar too. Opening it shows you your deck as usual. Changes show up for everyone a moment after they're saved.</p>
      ${dl.stop ? `<div class="delbox"><span>Make ${esc(d.name)} private? The link stops working for everyone who has it. Sharing again later makes a new link.</span><span class="confirm"><button class="btn sm danger" data-dlg="sh-stop-yes">Make private</button><button class="btn sm ghost" data-dlg="sh-stop-no">Keep sharing</button></span></div>`
        : `<div><button class="btn sm ghost" data-dlg="sh-stop">Make private</button></div>`}`;
  } else body = `<p>This deck is private: nobody else can see it.</p><div><button class="btn primary" data-dlg="sh-make">${ICONS.share}Share it again</button></div>`;
  return `<div class="dialog sh-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><header><div><h2 id="dlg-t">Share ${esc(d.name)}</h2><p class="muted" style="margin:4px 0 0;font-size:13px">People with the link see the list, stats and combos, and can copy the list or add it to their own decks. They can't change yours. History, owned cards and your card bin stay private.</p></div><button class="iconbtn" data-dlg="close" aria-label="Close">${ICONS.x}</button></header>
    <div class="db">${body}</div>
    <footer><button class="btn" data-dlg="close">Done</button></footer></div>`;
}
// Buttons in the share popup (data-dlg="sh-…").
function shareDlg(dlg) {
  const dl = S.dialog, d = dl && S.decks.get(dl.id); if (!d) return;
  if (dlg === "sh-make") { if (!CLOUD.user) return; startSharing(d); render(); renderDialog(); return toast("Shared again, with a new link."); }
  if (dlg === "sh-copy" && d.shareId) return copyText(shareUrl(d.shareId), "Link");
  if (dlg === "sh-stop") { dl.stop = true; return renderDialog(); }
  if (dlg === "sh-stop-no") { dl.stop = false; return renderDialog(); }
  if (dlg === "sh-stop-yes") { dl.stop = false; stopSharing(d); render(); renderDialog(); return toast("This deck is private now. Its old link no longer works."); }
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
  const tab = ["list", "stats", "combos"].includes(S.shareTab) ? S.shareTab : "list";
  const tb = (id, label, n) => `<button class="tab${tab === id ? " on" : ""}" role="tab" aria-selected="${tab === id}" data-sharetab="${id}">${label}${n === "" ? "" : `<span class="n">${n}</span>`}</button>`;
  let h = `${back}<div class="dhead"><div>
    <div class="eyebrow">${ciPips(deckCI(sd))}<span class="tag-ex tag-share">Shared · read only</span></div>
    <h2>${esc(cmd)}</h2>
    <div class="dn">${esc(sd.name)} · ${t} card${t === 1 ? "" : "s"}${sd.at ? ` · updated ${fmtDate(sd.at)}` : ""}</div>
    ${sd.desc ? `<p class="ddesc">${esc(sd.desc)}</p>` : ""}
  </div><div class="actions">
    <button class="btn" data-act="share-copy">${ICONS.copy}Copy deck list</button>
    <button class="btn primary" data-act="share-add">${ICONS.plus}Add to my decks</button>
  </div></div>
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
