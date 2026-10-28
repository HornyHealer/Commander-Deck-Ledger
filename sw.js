// Lets the installed app open without a connection. Always tries the network first so updates show up
// right away, and falls back to the last copy it saved. Other sites (Firebase, Scryfall, fonts) aren't touched.
const CACHE = "cdl-__VERSION__";
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "js/card-rules.js", "js/firebase-config.js", "data/cards.json", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("cdl-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html", { ignoreSearch: true }) : Response.error()))));
});
