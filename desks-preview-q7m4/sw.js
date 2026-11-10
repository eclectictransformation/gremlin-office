// Desks service worker: caches the app shell ONLY.
// Never caches Supabase (API, auth, storage/signed photo URLs) or any other cross-origin request.
const CACHE = "desks-shell-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "office3d.js", "vendor/three.module.min.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "assets/bryan-avatar.webp",
  "assets/gallery/tea-under-the-old-oak.webp", "assets/gallery/still-life-with-tea-and-small-visitors.webp",
  "assets/gallery/healing-herbs-plate.webp", "assets/gallery/morning-check-in-highlands.webp", "assets/gallery/slow-hands.webp",
  "assets/gallery/three-stones.webp", "assets/gallery/desks-floor-plan-gremlin-edition.webp"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Supabase & CDNs: straight to network
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isHTML || /\.(js|css|webmanifest)$/.test(url.pathname)) {
    // network-first so updates show up; cache only as offline fallback
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req).then((m) => m || caches.match("index.html"))));
    return;
  }
  if (SHELL.some((s) => url.pathname.endsWith(s.replace("./", "")) && s !== "./")) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req)));
  }
});
