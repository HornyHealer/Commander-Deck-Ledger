// js/src/09-render.js: routing, the main render, and light/dark.
// Joined with the other js/src files, in name order, into js/app.js by scripts/build-app.mjs; they share one scope.
// ---------- routing ----------
function go(view, deckId) {
  if (deckId !== S.deckId) { S.benchOpen = false; S.snap = null; S.cmp = null; S.roleFilter = null; S.roleEdit = null; S.showBracket = false; }
  S.view = view; S.deckId = deckId || null; S.filter = ""; S.confirm = null;
  try { history.replaceState(null, "", view === "deck" ? deckHash(S.decks.get(deckId)) : view === "share" ? "#share-" + S.shareId : view === "all" ? "#all-cards" : view === "check" ? "#check" : location.pathname + location.search); } catch {}
  render(); window.scrollTo(0, 0);
}
function fromHash() { const sh = shareIdOf(location.hash); if (sh) { S.view = "share"; S.shareId = sh; return; } if (location.hash === "#all-cards") { S.view = "all"; return; } if (location.hash === "#check") { S.view = "check"; return; } const m = (location.hash || "").match(/^#deck-([A-Za-z0-9_-]+)$/); if (m) { S.view = "deck"; S.deckId = m[1]; } }

// ---------- render ----------
function render() {
  const app = $("#app");
  // Your own deck's link opens it as your deck, and a deck's address follows its link (which may be made after it opened).
  if (S.view === "share" && CLOUD.user && CLOUD.loaded) { const mine = [...S.decks.values()].find(x => x.shareId === S.shareId); if (mine) { S.view = "deck"; S.deckId = mine.id; } }
  if (S.view === "deck" && S.decks.has(S.deckId)) { const h = deckHash(S.decks.get(S.deckId)); if (location.hash !== h) try { history.replaceState(null, "", h); } catch { /* sandboxed */ } }
  let html = `<div class="top"><div class="brand"><h1>Commander Deck Ledger</h1><span class="barcode" aria-hidden="true"></span></div>`;
  const lbl = (long, short) => `<span class="lbl">${long}</span><span class="lbl-s">${short}</span>`;
  const dark = themeNow() === "dark";
  html += `<div class="topacts">${accountHtml()}`
    + `<button class="btn tb${S.view === "all" ? " on" : ""}" data-act="${S.view === "all" ? "home" : "all"}" aria-pressed="${S.view === "all"}">${ICONS.stack}${lbl("All cards", "Cards")}</button>`
    + `<button class="btn tb${S.view === "check" ? " on" : ""}" data-act="${S.view === "check" ? "home" : "check"}" aria-pressed="${S.view === "check"}">${ICONS.list}${lbl("Check a list", "Check")}</button>`
    + `<button class="btn tb theme" data-act="theme" aria-label="Switch to ${dark ? "light" : "dark"} mode" title="Switch to ${dark ? "light" : "dark"} mode">${dark ? ICONS.sun : ICONS.moon}${lbl(dark ? "Light" : "Dark", dark ? "Light" : "Dark")}</button>`
    + (S.view === "library" ? `<button class="btn tb primary" data-act="new">${ICONS.plus}${lbl("New deck", "New")}</button>` : "")
    + `</div>`;
  html += `</div>`;
  if (S.cardsFailed) html += `<div class="notice">The card list didn't load, so mana costs, types and colors are missing. Check your connection and reload the page.</div>`;
  if (CLOUD.user) for (const why of blocked.values()) html += `<div class="backup-warn limit-warn" role="alert"><span><b>Not saved to your account.</b> ${why} Until then, changes to it are only on this screen and are lost if you close the site.</span></div>`;
  if (CLOUD.enabled && CLOUD.authReady && !CLOUD.user && !CLOUD.failed && S.view === "library") html += `<div class="signin-note"><div><b>Sync your decks</b> Sign in with Google to keep your decks in step between your phone and computer.${S.decks.size || (S.loose.cards || []).length ? " The decks saved in this browser move into your account the first time you sign in." : ""}</div><button class="btn primary" data-act="signin">${ICONS.user}Sign in with Google</button></div>`;
  if (S.ready && !S.live && !CLOUD.user) html += `<div class="notice">Your browser is blocking storage for this site, so changes last only until you close the page. Export a backup before you leave, or allow site data for this page in your browser settings.</div>`;
  const d = S.deckId && S.decks.get(S.deckId);
  // Everything below the header sits in .view, which plays a short glitch when the view changes.
  const viewKey = S.view + (S.view === "deck" ? ":" + S.deckId : S.view === "share" ? ":" + S.shareId : "");
  const glitch = S.ready && lastViewKey !== null && viewKey !== lastViewKey && !reduceMotion();
  lastViewKey = S.ready ? viewKey : null;
  html += `<div class="view">`;
  if (S.view === "share" && S.shareId && !(CLOUD.user && !CLOUD.loaded)) html += renderShare(); // someone else's deck
  else if (CLOUD.user && !CLOUD.loaded) html += `<div class="empty"><h2>Loading your decks…</h2><p>Getting your library from your account.</p></div>`;
  else if (S.view === "all") html += renderAll();
  else if (S.view === "check") html += renderCheck();
  else if (S.view === "deck" && d) html += historyReady(d.id) ? renderDeck(d) : deckOpening(d);
  else if (S.view === "deck" && S.ready) { S.view = "library"; html += renderLibrary(); }
  else html += renderLibrary();
  html += `</div><footer class="site-foot">${installHtml()}<p>${CLOUD.user ? "Your decks are saved to your account and sync across your devices." : "Your decks are saved in this browser only. Use <b>Export backup</b> to keep a copy or move them to another device."}</p><p>Card data and images from <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>. Commander Deck Ledger is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p></footer>`;
  app.innerHTML = html;
  if (S.ready && window.LedgerBackdrop) window.LedgerBackdrop.setDecks([...S.decks.values()].map(x => x.name));
  if (S.ready && (!CLOUD.user || CLOUD.loaded)) revealBoot();
  if (glitch) queueMicrotask(() => playGlitch($(".view"))); // after go() has scrolled back to the top
  else if (glitchTarget) { const sel = glitchTarget; queueMicrotask(() => { if (!reduceMotion()) playGlitch($(sel), "pop"); }); }
  glitchTarget = null;
  if (S.dialog) renderDialog();
}
// ---------- light and dark ----------
// Follows the device until the switch in the top bar is used; then the choice is remembered in this browser.
// (index.html applies a saved choice before the page draws, so it never flashes the other theme.)
function themeNow() { const t = document.documentElement.dataset.theme; return t === "dark" || t === "light" ? t : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("cdl-theme", t); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === "dark" ? "#0b0b0a" : "#efeef7";
  if (window.LedgerBackdrop) window.LedgerBackdrop.refresh();
  render();
  if (!reduceMotion()) playGlitch($(".view"));
}
