/**
 * Service worker offline-first untuk build produksi.
 *
 * Strategi sengaja tanpa daftar precache supaya tidak ada duplikasi
 * pengetahuan tentang nama file build (semua aset sudah di-hash Vite):
 *
 * - Navigasi (index.html): network-first. Reload selalu mencoba versi
 *   terbaru lebih dulu sehingga build baru langsung terdeteksi; fallback ke
 *   cache saat offline atau server tidak terjangkau.
 * - Aset sama-origin lain (JS, CSS, locale, data, audio): stale-while-
 *   revalidate. Respons instan dari cache bila ada, pembaruan berjalan di
 *   belakang layar tanpa memblokir permainan.
 * - Cache diisi on-demand saat pemain benar-benar memakainya, jadi audio
 *   tidak ikut terunduh sebelum dibutuhkan.
 *
 * Scope mengikuti lokasi sw.js (root deployment, mis. /gametech26/ di
 * GitHub Pages) sehingga berlaku sama di build lokal dan Pages.
 */
const CACHE = 'asap-cache-v1';
const PREFIX = 'asap-';

self.addEventListener('install', () => {
  // Versi baru langsung mengambil alih; aman karena strategi di atas tidak
  // menyimpan format data yang bisa diubah antar versi.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Buang cache lama dengan prefix sama milik versi SW sebelumnya.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigationFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

/** Network-first untuk halaman: update build terdeteksi saat online. */
async function navigationFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // URL persis tidak ada (mis. deep-link berbeda): pakai dokumen
    // terakhir yang tersimpan - cukup karena game ini satu halaman.
    const keys = await cache.keys();
    for (const key of keys) {
      if (key.mode === 'navigate') {
        const shell = await cache.match(key);
        if (shell) return shell;
      }
    }
    return new Response('Offline dan belum ada cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/** Stale-while-revalidate untuk aset: cepat dari cache, segar di latar. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const res = await refresh;
  if (res) return res;
  return Response.error();
}
