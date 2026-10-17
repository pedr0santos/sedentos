// Service worker do Sedentos: notificações push e funcionamento básico offline.
const CACHE = 'sedentos-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icone-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Páginas: tenta a rede; sem internet, usa a última versão guardada.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put('/', copia)); return r; }).catch(() => caches.match('/')));
    return;
  }
  if (/\/assets\//.test(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return r; })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Sedentos', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Sedentos', {
    body: d.body || 'Você tem avisos novos.',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    data: { url: d.url || '/minha-rede/avisos' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
    for (const a of abas) { if ('focus' in a) { a.navigate(url); return a.focus(); } }
    return self.clients.openWindow(url);
  }));
});
