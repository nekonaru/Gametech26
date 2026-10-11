/**
 * Penyelesaian path aset relatif terhadap base deployment.
 *
 * Vite menyetel `import.meta.env.BASE_URL` sesuai opsi `--base`:
 * `'/'` untuk build lokal/dev, `'/<nama-repo>/'` untuk build GitHub Pages
 * (mis. `'/gametech26/'`; workflow membaca nama repo secara dinamis).
 * Semua fetch data & referensi aset publik harus melewati helper ini agar
 * game tetap jalan di subpath (bukan hanya di root domain).
 */

const base = (): string => {
  const url = import.meta.env.BASE_URL ?? '/';
  return url.endsWith('/') ? url : `${url}/`;
};

/** Contoh: assetUrl('data/clues.json') -> '/data/clues.json' (atau '/Gametech26/data/clues.json'). */
export function assetUrl(path: string): string {
  return base() + path.replace(/^\/+/, '');
}
