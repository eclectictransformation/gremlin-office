const CACHE = "et-preview-v2";
const FONTS = "et-fonts-v1";
const SHELL = ["./","index.html","styles.css","app.js","config.js","data.json","manifest.json","icons/icon-192.png","icons/icon-512.png",
  "assets/mist-background.svg","assets/sauna-scene.svg","assets/meditation-room.svg","assets/mist-background-portrait.svg","assets/sauna-scene-portrait.svg","assets/meditation-room-portrait.svg","audio/calm.wav","audio/music1.wav","audio/sauna.wav","audio/rage.wav","audio/sleep.wav","audio/ground.wav"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(FONTS).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && url.pathname.endsWith("data.json")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match("index.html"))));
});
self.addEventListener("message", e => {
  if (e.data && e.data.type === "save") caches.open(CACHE).then(c => c.add(e.data.url)).then(() => e.source && e.source.postMessage({type:"saved", url:e.data.url}));
});
