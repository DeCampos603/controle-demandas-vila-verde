/* Service worker: rede primeiro, cache como reserva (mesma estratégia dos outros sites do repo).
   Só guarda os arquivos do próprio site — as chamadas à planilha nunca passam pelo cache. */
const VERSAO = "vv-demandas-v2";
const CASCA = ["./", "./index.html", "./manifest.webmanifest", "./css/tema.css", "./js/app.js", "./js/api.js", "./js/config.js", "./assets/vila-verde.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => Promise.allSettled(CASCA.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
