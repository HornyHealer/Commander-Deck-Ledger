// Lets the installed app open without a connection, and quickly on a weak one. Each file is fetched from the
// network so updates show up right away, but if the network takes more than a few seconds the last saved copy is
// used instead (the download carries on and replaces it for next time). The card list is big and changes by a
// few cards every few days, so the saved copy is used straight away and refreshed in the background.
// Firebase's code is kept too; Scryfall and fonts aren't touched.
const CACHE = "cdl-__VERSION__";
const FB_FILES = ["firebase-app.js", "firebase-app-check.js", "firebase-auth.js", "firebase-firestore.js"].map(f => "https://www.gstatic.com/firebasejs/12.19.0/" + f);
const SHELL = ["./", "index.html", "css/style.css", "css/starlight.css", "js/app.js", "js/backdrop.js", "js/card-rules.js", "js/firebase-config.js", "data/cards.json", "data/example-deck.json", "manifest.webmanifest", "icons/icon-192.png"];
const CARD_LIST = "data/cards.json";
const SLOW = 3500; // ms to wait for the network before using the saved copy

// A new version saves a fresh copy of each file. If one doesn't download, the copy from the version before is
// carried over, so updating never leaves the app without a file it had (the old copies are deleted next).
// The card list is carried over rather than downloaded again: the page refreshes it in the background anyway.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([...SHELL, ...FB_FILES].map(async u => {
    const old = await caches.match(u, { ignoreSearch: true });
    if (u === CARD_LIST && old) return c.put(u, old);
    try { await c.add(u); } catch { if (old) await c.put(u, old); }
  }))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("cdl-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Saves a good response for next time.
function keep(req, res) {
  if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
}
const saved = req => caches.match(req, { ignoreSearch: true });

// Firebase's sign-in and sync code: versioned files that never change, so keep a copy and use it first.
// That way the installed app doesn't depend on Google's servers answering the moment it opens.
const FIREBASE = "https://www.gstatic.com/firebasejs/";
self.addEventListener("fetch", e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method === "GET" && req.url.startsWith(FIREBASE)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const net = fetch(req).then(res => keep(req, res));
  // The card list: the saved copy now, a fresh one saved for next time.
  if (url.pathname.endsWith("/" + CARD_LIST)) {
    e.waitUntil(net.catch(() => {}));
    e.respondWith(saved(req).then(hit => hit || net));
    return;
  }
  // Everything else: the network, unless it's slow or down and there's a saved copy.
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fallback = () => saved(req).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html", { ignoreSearch: true }) : null));
    const timer = setTimeout(() => fallback().then(hit => { if (hit && !done) { done = true; resolve(hit); } }), SLOW);
    net.then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); if (!done) fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
  }));
});
