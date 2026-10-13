/**
 * Audit Lighthouse dengan budget performa.
 *
 * Menyajikan folder `dist` lewat server statis internal, menjalankan Lighthouse
 * (Chrome headless, form factor desktop) terhadapnya, lalu MENGUJI hasilnya
 * terhadap ambang:
 *
 *   1. Skor kategori (performance / accessibility / best-practices / seo)
 *   2. Bobot byte total (deterministik - inilah penjaga utama agar bundle tidak
 *      membengkak diam-diam; skor simulated bisa berfluktuasi di runner)
 *
 * Exit code 0 hanya jika SEMUA ambang terpenuhi. Angka ambang diturunkan dari
 * hasil lokal dengan kepala ~25% ruang untuk noise CI.
 *
 * Syarat: build sudah ada (`npm run build`), `lighthouse` tersedia (devDep),
 * dan Chrome/Chromium terpasang di mesin (CI ubuntu-latest: sudah bawaan).
 *
 *   node tools/lighthouse-audit.mjs
 *   LH_RUNS=3 node tools/lighthouse-audit.mjs   # median beberapa run
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RUNS = Number(process.env.LH_RUNS || 1);

// --- Ambang (diturunkan dari hasil pengukuran nyata, kepala ruang noise) ----
// Temuan pengukuran pertama: bobot 4,49 MB didominasi aset media (audio/tekstur
// dikirim penuh), performance 0,47-0,54 (LCP simulasi ~26 dtk karena 4,49 MB;
// skor berfluktuasi mengikuti kecepatan runner bersama - lokal 0,54, CI 0,47),
// dan accessibility 0,75 (viewport dikunci zoom demi kontrol permainan + kontras
// gaya PS1). Ambang dijaga sebagai PENJAGA REGRESI: boleh naik bila aset
// dioptimasi, tak boleh turun diam-diam. Bobot byte adalah pengukur utama
// karena deterministik; skor performance hanya penangkap ledakan besar.
const BUDGET = {
  /** Bobot total transfer semua aset (byte). */
  totalBytes: 4_750_000,
  minScore: {
    performance: 0.4,
    accessibility: 0.7,
    'best-practices': 0.9,
    seo: 0.9
  }
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function fail(msg) {
  console.error('GAGAL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  fail('dist/index.html tidak ada - jalankan `npm run build` dulu.');
}

let lighthouse, launchChrome;
try {
  ({ default: lighthouse } = await import('lighthouse'));
  ({ launch: launchChrome } = await import('chrome-launcher'));
} catch {
  fail('lighthouse/chrome-launcher belum terpasang. Jalankan: npm install -D lighthouse');
}

// --- Server statis untuk dist ------------------------------------------------
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

// --- Jalankan Lighthouse -----------------------------------------------------
const chrome = await launchChrome({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu-sandbox']
});

const config = {
  extends: 'lighthouse:default',
  settings: {
    // Desktop adalah target utama permainan (pointer lock + WASD). Simulasi
    // throttling tetap dipakai Lighthouse supaya skor tidak melompat-lompat
    // mengikuti kecepatan fisik runner.
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false, width: 1280, height: 720, deviceScaleFactor: 1, disabled: false
    },
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    // SW tidak diukur di sini (registrasi PROD-only, dipakai main.ts).
    skipAudits: ['installable-manifest']
  }
};

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const result = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' }, config);
  runs.push(result.lhr);
  console.log(`Run #${i + 1} selesai.`);
}
await chrome.kill();
server.close();

// Ambil median per kategori & audit kunci antar-run.
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
const scores = {};
for (const cat of Object.keys(BUDGET.minScore)) {
  scores[cat] = median(runs.map(r => r.categories[cat].score ?? 0));
}
const medianLhr = runs[runs.length - 1];
const totalBytes = median(runs.map(r => r.audits['total-byte-weight'].numericValue || 0));
const fcp = median(runs.map(r => r.audits['first-contentful-paint'].numericValue || 0));
const lcp = median(runs.map(r => r.audits['largest-contentful-paint'].numericValue || 0));
const tbt = median(runs.map(r => r.audits['total-blocking-time'].numericValue || 0));
void medianLhr;

// --- Uji ambang --------------------------------------------------------------
const violations = [];
for (const [cat, min] of Object.entries(BUDGET.minScore)) {
  if (scores[cat] < min) {
    violations.push(`skor ${cat} ${scores[cat].toFixed(2)} < ${min}`);
  }
}
if (totalBytes > BUDGET.totalBytes) {
  violations.push(`bobot total ${Math.round(totalBytes)} byte > ${BUDGET.totalBytes} byte`);
}

console.log('--- Ringkasan Lighthouse (median) ---');
for (const [cat, score] of Object.entries(scores)) {
  console.log(`  ${cat.padEnd(16)} ${score.toFixed(2)} (min ${BUDGET.minScore[cat]})`);
}
console.log(`  bobot total     ${Math.round(totalBytes)} byte (budget ${BUDGET.totalBytes})`);
console.log(`  FCP ${Math.round(fcp)} ms | LCP ${Math.round(lcp)} ms | TBT ${Math.round(tbt)} ms`);

// Visibilitas: aset terbesar & audit yang belum sempurna supaya penyebab
// skor langsung terbaca dari log CI tanpa membuka laporan.
const ref = runs[runs.length - 1];
const top = (ref.audits['total-byte-weight']?.details?.items || [])
  .slice(0, 5);
if (top.length) {
  console.log('--- 5 aset terbesar ---');
  for (const item of top) {
    const label = (item.url || '').replace(/^https?:\/\/[^/]+/, '');
    console.log(`  ${String(Math.round(item.totalBytes / 1024)).padStart(6)} KB  ${label}`);
  }
}
for (const cat of ['accessibility', 'best-practices', 'seo']) {
  const failing = (ref.categories[cat]?.auditRefs || [])
    .map(a => ref.audits[a.id])
    .filter(a => a && a.score !== null && a.score < 1)
    .map(a => `${a.id}(${a.score})`);
  if (failing.length) console.log(`  audit ${cat} belum sempurna: ${failing.join(', ')}`);
}

if (violations.length) {
  console.error('GAGAL: ' + violations.join('; '));
  process.exit(1);
}
console.log('Audit Lighthouse LULUS: semua ambang terpenuhi.');
