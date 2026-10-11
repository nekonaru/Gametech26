/**
 * Pendaftaran service worker, hanya untuk build produksi.
 *
 * Di `vite dev` pendaftaran dimatikan: cache akan menyimpan hasil dev-server
 * (module esm mentah, HMR) yang bisa membingungkan pada sesi berikutnya.
 *
 * Path memakai assetUrl sehingga scope SW ikut base deployment: root saat
 * build lokal, /<nama-repo>/ di GitHub Pages.
 */
import { assetUrl } from './paths.js';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(assetUrl('sw.js'))
      .catch((err: unknown) => {
        // Bukan fatal: game tetap jalan penuh tanpa dukungan offline.
        console.warn('Service worker gagal didaftarkan:', err);
      });
  });
}
