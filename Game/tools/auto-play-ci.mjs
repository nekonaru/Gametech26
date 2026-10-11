/**
 * Runner CI untuk harness auto-play.
 *
 * Menjalankan smoke-test end-to-end tanpa pointer: menyajikan folder `dist`
 * lewat server statis internal, membuka halaman di Chromium headless, lalu
 * menyuntik `tools/auto-play.js` yang sama persis dengan yang dipakai manual.
 *
 * Syarat: build sudah ada (`npm run build`) dan `playwright` tersedia
 * (di CI: `npm install --no-save playwright`; lokal: sama, atau lewati).
 *
 * Keluaran: ringkasan ticks/bab/ending; exit code 0 hanya jika auto-play
 * SELESAI (ending) tanpa error dan tanpa stall.
 *
 *   node tools/auto-play-ci.mjs
 *   AUTOPLAY_TIMEOUT_MS=900000 node tools/auto-play-ci.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const HARNESS = path.join(ROOT, 'tools', 'auto-play.js');
const TIMEOUT_MS = Number(process.env.AUTOPLAY_TIMEOUT_MS || 20 * 60 * 1000);

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
if (!fs.existsSync(HARNESS)) {
  fail('tools/auto-play.js tidak ada.');
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  fail('playwright belum terpasang. Jalankan: npm install --no-save playwright && npx playwright install chromium');
}

// --- Server statis untuk dist + jalur khusus harness ------------------------
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = urlPath === '/tools/auto-play.js'
    ? HARNESS
    : path.join(DIST, urlPath.replace(/^\/+/, '') || 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port + '/';
console.log('Menyajikan dist di ' + base);

// --- Buka halaman, lewati layar awal, jalankan harness ----------------------
const browser = await chromium.launch({
  headless: true,
  // SwiftShader: WebGL software supaya renderer Three.js tetap jalan di
  // runner tanpa GPU.
  args: ['--enable-unsafe-swiftshader']
});
try {
  const page = await browser.newPage();
  // Debug flag harus sudah ada sebelum game boot (window.__asap).
  await page.addInitScript(() => {
    try { localStorage.setItem('asap-debug', '1'); } catch { /* ignore */ }
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__asap, null, { timeout: 60000 });

  // Lewati logo/prolog sampai bab pertama, sama seperti jalur manual.
  await page.evaluate(() => window.__asap.game.newGame());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__asap.game.endPrologue());
  await page.waitForFunction(
    () => window.__asap.gameState.get('currentChapter') !== null,
    null,
    { timeout: 60000 }
  );

  const chapterAwal = await page.evaluate(() => window.__asap.gameState.get('currentChapter'));
  console.log('Masuk bab: ' + chapterAwal + ' - menjalankan auto-play...');

  // Headless selalu dianggap "visible", jadi rAF loop engine terus
  // me-render lewat SwiftShader (software) dan memonopoli CPU runner:
  // interval 25 ms harness melambat 4x sehingga auto-play penuh bisa
  // melebihi 40 menit. Smoke test ini menguji logika permainan (bab,
  // objektif, dialog, ending), bukan kebenaran piksel - jadi render
  // dimatikan. Logika tetap utuh: engine.update() tidak menyentuh
  // renderer, dan harness menggerakkannya sendiri per tick.
  await page.evaluate(() => {
    window.__asap.game.engine.render = () => {};
  });

  await page.evaluate(async () => {
    const src = await (await fetch('/tools/auto-play.js')).text();
    eval(src);
    window.__play.reset();
    window.__play.start();
  });

  // Poll status sampai selesai, stall, error, atau kehabisan waktu.
  const startedAt = Date.now();
  let status;
  for (;;) {
    await page.waitForTimeout(5000);
    status = await page.evaluate(() => {
      const p = window.__play;
      return {
        running: p.running, done: p.done, ticks: p.ticks,
        chapter: p.chapter, stall: p.stall,
        errors: p.errors.slice(0, 5), log: p.log.slice(-10)
      };
    });
    const detik = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[+${detik}s] ticks=${status.ticks} bab=${status.chapter}` +
      (status.done ? ' SELESAI' : status.stall ? ' STALL' : ''));
    if (status.done || status.stall || status.errors.length > 0) break;
    if (Date.now() - startedAt > TIMEOUT_MS) {
      fail('timeout setelah ' + Math.round(TIMEOUT_MS / 1000) + 's (ticks=' + status.ticks +
        ', bab=' + status.chapter + ')');
    }
  }

  console.log('--- Ringkasan ---');
  console.log('ticks  : ' + status.ticks);
  console.log('bab    : ' + status.chapter);
  console.log('log    : ' + status.log.join(' | '));
  if (status.errors.length > 0) {
    for (const e of status.errors) console.error('error  : ' + e);
    fail(status.errors.length + ' error tak tertangkap selama auto-play.');
  }
  if (status.stall) {
    fail('stall di bab ' + status.stall + ' (tidak maju selama 400 tick).');
  }
  if (!status.done) {
    fail('auto-play berhenti tanpa ending (done=false).');
  }
  console.log('Auto-play LULUS: ending tercapai tanpa error dan tanpa stall.');
} finally {
  await browser.close();
  server.close();
}
