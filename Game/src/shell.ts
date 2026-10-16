import { registerServiceWorker } from './core/sw.js';

/**
 * Cangkang boot ringan: satu-satunya modul yang dimuat saat halaman dibuka.
 *
 * Game penuh (three.js + seluruh logika, ±940 KB) TIDAK ikut bundle awal:
 * ia diimpor dinamis hanya setelah pemain menekan MULAI, sehingga first
 * paint dan LCP hanya menunggu HTML + cangkang ±3 KB ini. Vite memisahkan
 * hasil import() dinamis ke chunk sendiri secara otomatis.
 *
 * Pra-unduh saat hover/fokus tombol (niat main sudah jelas, sesudah load)
 * supaya klik terasa instan; Lighthouse tidak hover sehingga angkanya tetap
 * mengukur beban awal yang sebenarnya.
 */
registerServiceWorker();

const gateway = document.getElementById('gateway') as HTMLDivElement | null;
const startButton = document.getElementById('gateway-start') as HTMLButtonElement | null;
const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement | null;
const loadingStatus = document.getElementById('loading-status') as HTMLDivElement | null;

let gameImport: Promise<unknown> | null = null;

function prefetchGame(): void {
  if (gameImport) return;
  gameImport = import('./main.js').catch((error: unknown) => {
    gameImport = null;
    throw error;
  });
}

if (startButton && gateway && loadingScreen && loadingStatus) {
  startButton.addEventListener('pointerenter', prefetchGame);
  startButton.addEventListener('focus', prefetchGame);
  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    gateway.classList.add('hidden');
    loadingScreen.classList.remove('hidden');
    loadingStatus.textContent = 'Memuat game...';
    loadingStatus.style.color = '';
    prefetchGame();
    // Impor yang tak kunjung selesai (chunk ditahan ekstensi/pemblokir,
    // bukan gagal total) tidak memicu catch di atas: beri tahu pemain cara
    // keluar setelah 45 detik, bukan diam selamanya seperti laporan pemain.
    window.setTimeout(() => {
      if (loadingScreen.classList.contains('hidden')) return;
      if (loadingStatus.textContent !== 'Memuat game...') return;
      loadingStatus.textContent = 'Masih memuat. Coba refresh paksa (Ctrl+Shift+R) atau matikan ekstensi pemblokir lalu ulangi.';
    }, 45000);
    (gameImport as Promise<unknown>).catch((error: unknown) => {
      // Chunk game gagal diunduh (offline/koneksi putus): kembalikan gerbang
      // supaya pemain bisa mencoba lagi, bukan terjebak di layar muat.
      loadingStatus.textContent = 'Gagal memuat: ' + (error as Error).message;
      loadingStatus.style.color = '#ff4444';
      loadingScreen.classList.add('hidden');
      gateway.classList.remove('hidden');
      startButton.disabled = false;
    });
  });
}
