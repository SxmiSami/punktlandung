/* Service Worker: macht die App offline-fähig */
const VERSION = 'pl-0.16.3'; // gleich wie PL.VERSION in js/data.js
const SHELL = [
  './', 'index.html', 'css/styles.css', 'manifest.webmanifest',
  'js/config.js', 'js/data.js', 'js/store.js', 'js/calc.js', 'js/ui.js', 'js/views.js', 'js/sheets.js', 'js/plan.js', 'js/termine.js', 'js/untis.js', 'js/merge.js', 'js/sync.js', 'js/files.js', 'js/notes.js', 'js/feed.js', 'js/chat.js', 'js/chatui.js', 'js/whatsnew.js', 'js/admin.js', 'js/shell.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' – nicht aus dem Browser-Cache, sondern frisch vom Server holen
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Eigene Dateien, Schriften und die Supabase-Bibliothek cachen – Datenbank-Anfragen nie
  const cacheable = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !cacheable) return;

  // Netzwerk zuerst (damit Updates sofort ankommen), sonst Cache.
  // Eigene Dateien mit 'no-cache': GitHub Pages erlaubt 10 Min. Browser-Cache –
  // so fragt der Browser trotzdem jedes Mal kurz nach, ob sich etwas geändert hat.
  const net = url.origin === location.origin && req.mode !== 'navigate' ? new Request(req, { cache: 'no-cache' }) : req;
  e.respondWith(
    fetch(net).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
