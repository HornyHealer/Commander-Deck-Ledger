// Lets the installed app open without a connection. Always tries the network first so updates show up
// right away, and falls back to the last copy it saved. Firebase's code is kept too; Scryfall and fonts aren't touched.
const CACHE = "cdl-__VERSION__";
const FB_FILES = ["firebase-app.js", "firebase-app-check.js", "firebase-auth.js", "firebase-firestore.js"].map(f => "https://www.gstatic.com/firebasejs/12.19.0/" + f);
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "js/card-rules.js", "js/firebase-config.js", "data/cards.json", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([...SHELL, ...FB_FILES].map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("cdl-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
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
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html", { ignoreSearch: true }) : Response.error()))));
});
