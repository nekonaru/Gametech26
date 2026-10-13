/**
 * Regresi visual: foto 3 view kunci lalu bandingkan dengan baseline.
 *
 * Menangkap error yang tidak terlihat auto-play: perubahan rendering
 * (mis. bump three.js), marker hilang/bergeser, tekstur rusak, figur lenyap.
 * Dijalankan di CI sesudah auto-play (Playwright + Chromium sudah terpasang
 * oleh step sebelumnya); SwiftShader software-render deterministik.
 *
 *   node tools/visual-regression.mjs            # bandingkan vs baseline
 *   UPDATE_BASELINE=1 node tools/visual-regression.mjs   # tulis ulang baseline
 *
 * View dibidik deterministik (posisi collider + yaw/pitch tetap, dialog
 * ditutup, screenshot kanvas saja tanpa HUD DOM). Noise antar-run sehat
 * (±0,09% piksel: denyut marker, debu, ayun figur) jauh di bawah ambang
 * 1,5% per view; pixelmatch threshold 0,15 menoleransi dithering PSX.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const { createRequire } = await import('node:module');
const require = createRequire(path.join(ROOT, 'package.json'));
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch').default ?? require('pixelmatch');

const BASELINE_DIR = path.join(HERE, 'visual-regression', 'baseline');
const UPDATE = process.env.UPDATE_BASELINE === '1';

/** Ambang lolos default per view (% piksel beda). */
const MAX_DIFF_PCT = 1.5;

/**
 * View yang difoto: bab, penanda bidik, jarak kamera mendatar (m).
 * `max` opsional: dapur memuat penanda primer yang berdenyut (beam + label
 * emas berubah tiap frame) sehingga noise-nya ±2,2% - ambangnya 4%, masih
 * jauh di bawah sinyal regresi beam (terukur 6,1% saat beam dipendekkan).
 */
const VIEWS = [
  { file: 'b01-kasur.jpg', chapter: 'b01', marker: 'kasur', dist: 1.9 },
  { file: 'b01-dapur.jpg', chapter: 'b01', marker: 'dapur', dist: 1.9, max: 4.0 },
  { file: 'b01-sekring.jpg', chapter: 'b01', marker: 'kotak_sekring', dist: 1.9 },
  { file: 'b03-sopir.jpg', chapter: 'b03', marker: 'sopir', dist: 1.9 }
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg'
};

function fail(msg) {
  console.error('GAGAL visual: ' + msg);
  process.exitCode = 1;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  fail('dist/index.html tidak ada - jalankan `npm run build` dulu.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return res.writeHead(404).end('x');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/';

const { chromium } = await import('playwright').catch(() => fail('playwright belum terpasang'));
if (process.exitCode) {
  server.close();
  process.exit(1);
}

/** Majukan satu langkah dialog/pilihan/ringkasan bila ada yang terbuka. */
async function stepDialog(page) {
  return page.evaluate(() => {
    const A = window.__asap;
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.getClientRects().length > 0; };
    if (A.game.currentScreen === 'DaySummaryScreen' || vis('summary-continue')) {
      document.getElementById('summary-continue').click();
      return true;
    }
    const ds = A.game.dialogScreen;
    const dialogOpen = A.gameState.get('inDialog') || (ds && ds.element && ds.element.getClientRects().length > 0);
    if (dialogOpen) {
      if (ds.waitingForChoice && ds.element) {
        const btns = [...ds.element.querySelectorAll('.choice-btn')];
        if (btns.length) btns[btns.length - 1].click();
      } else {
        A.scriptRunner.handleDialogContinue();
      }
      return true;
    }
    return false;
  });
}

/** Ada dialog/overlay yang menutupi kanvas saat ini? */
async function isDirty(page) {
  return page.evaluate(() => {
    const A = window.__asap;
    const ds = A.game.dialogScreen;
    return !!(A.gameState.get('inDialog') || (ds && ds.element && ds.element.getClientRects().length > 0));
  });
}

/**
 * Tenangkan layar sampai rantai spawn/dialog benar-benar habis.
 *
 * advance() lama hanya butuh 2x cek hening: rantai `onSpawn` (animasi bangun
 * + dialog pembuka) bisa MULAI sesudah cek itu lolos, sehingga dialog muncul
 * telat tepat saat shutter. Di sini hening (±2 detik: tak ada op berjalan,
 * tak ada op menunggu, tak ada dialog) disyaratkan, sambil dialog yang
 * menunggu input terus dimajukan.
 */
async function settle(page) {
  let quiet = 0;
  for (let i = 0; i < 150; i++) {
    const busy = await page.evaluate(() => {
      const A = window.__asap;
      const sr = A.scriptRunner;
      const opsBusy = typeof sr.isOpsBusy === 'function' ? sr.isOpsBusy() : false;
      const pending = Array.isArray(sr.pendingSpawnOps) ? sr.pendingSpawnOps.length : 0;
      return opsBusy || pending > 0;
    });
    const dialogOpen = await stepDialog(page);
    if (!busy && !dialogOpen) {
      quiet++;
      if (quiet >= 7) return true;
    } else {
      quiet = 0;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

/** Posisikan kamera FPS tepat menghadap penanda (lewat collider). */
async function aim(page, markerId, dist) {
  const found = await page.evaluate(({ mid, dist }) => {
    const A = window.__asap;
    const g = A.game;
    const m = g.propMeshes.find((x) => x.userData.interactableId === mid);
    if (!m) return false;
    const mp = m.getWorldPosition(m.position.clone());
    const loc = A.gameState.get('location') || { pos: [0, 0, 0] };
    let dx = loc.pos[0] - mp.x, dz = loc.pos[2] - mp.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const px = mp.x + dx * dist, pz = mp.z + dz * dist;
    const fps = g.fpsController;
    const pc = fps.playerCollider;
    const h = pc.end.y - pc.start.y + pc.radius * 2;
    pc.start.set(px, pc.radius, pz);
    pc.end.set(px, h - pc.radius, pz);
    if (fps.velocity && fps.velocity.set) fps.velocity.set(0, 0, 0);
    fps.viewAnim = null;
    const yawObj = fps.getYawObject();
    yawObj.position.set(px, 0, pz);
    const fx = mp.x - px, fz = mp.z - pz;
    yawObj.rotation.y = Math.atan2(-fx, -fz);
    const cam = g.engine.camera;
    const pitchObj = yawObj.children.find((c) => c.children.includes(cam)) || yawObj.children[0];
    pitchObj.rotation.x = Math.atan2(mp.y + 0.58 - 1.6, Math.hypot(fx, fz));
    return true;
  }, { mid: markerId, dist });
  if (!found) fail(`penanda ${markerId} tidak ada di scene aktif`);
  await page.waitForTimeout(800);
}

async function enterChapter(page, chapter) {
  if (chapter === 'b01') {
    await page.evaluate(() => window.__asap.game.newGame());
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__asap.game.endPrologue());
  } else {
    await page.evaluate((ch) => window.__asap.game.startChapter(ch), chapter);
    await page.waitForTimeout(2600);
  }
  await page.waitForFunction(
    (ch) => window.__asap.gameState.get('currentChapter') === ch,
    chapter, { timeout: 90000 }
  );
  if (!await settle(page)) fail(`layar ${chapter} tak kunjung tenang`);
  await page.waitForFunction(
    () => (window.__asap.game.propMeshes?.length ?? 0) > 0 && !window.__asap.gameState.get('inDialog'),
    null, { timeout: 60000, polling: 500 }
  );
}

function decodeShot(buf) {
  // Baseline & jepretan sama-sama JPEG (encoder Chromium deterministik per
  // versi); pngjs dipertahankan untuk snapshot lama bila masih ada.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const d = jpeg.decode(buf, { useTArray: true });
    return { data: Buffer.from(d.data), width: d.width, height: d.height };
  }
  const p = PNG.sync.read(buf);
  return { data: p.data, width: p.width, height: p.height };
}

function diffPct(a, b) {
  const ia = decodeShot(a), ib = decodeShot(b);
  if (ia.width !== ib.width || ia.height !== ib.height) return -1;
  const out = Buffer.alloc(ia.width * ia.height * 4);
  const n = pixelmatch(ia.data, ib.data, out, ia.width, ia.height, { threshold: 0.15 });
  return (n / (ia.width * ia.height)) * 100;
}

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('asap-debug', '1');
      localStorage.setItem('asap_controls_seen', '1');
    } catch { /* abaikan */ }
  });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));

  await page.goto(base, { waitUntil: 'load' });
  // Build lama (sebelum tunda-muat) boot langsung tanpa gerbang: klik MULAI
  // hanya bila tombolnya ada, supaya tool tetap jalan di branch lama.
  const hasGateway = await page.waitForSelector('#gateway-start', { timeout: 15000 })
    .then(() => true).catch(() => false);
  if (hasGateway) await page.click('#gateway-start');
  await page.waitForFunction(() => !!window.__asap, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const l = document.getElementById('loading-screen');
    return l && l.classList.contains('hidden');
  }, null, { timeout: 120000 });

  let entered = '';
  for (const view of VIEWS) {
    if (view.chapter !== entered) {
      await enterChapter(page, view.chapter);
      entered = view.chapter;
    }
    // Dialog bisa menyela lagi (rantai susulan): bidik + jepret sampai
    // shutter jatuh di layar bersih, maksimal 4 percobaan.
    let shot = null;
    for (let attempt = 0; attempt < 4 && !shot; attempt++) {
      await settle(page);
      await aim(page, view.marker, view.dist);
      const candidate = await page.locator('#game-canvas').screenshot({ type: 'jpeg', quality: 85 });
      if (!await isDirty(page)) {
        shot = candidate;
      } else {
        console.log(`  ${view.file}: bingkai kotor (dialog), ulangi bidik...`);
      }
    }
    if (!shot) {
      fail(`${view.file} tak pernah dapat bingkai bersih`);
      continue;
    }
    const target = path.join(BASELINE_DIR, view.file);
    if (UPDATE) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(target, shot);
      console.log(`baseline ditulis: ${view.file} (${(shot.length / 1024).toFixed(0)} KB)`);
      continue;
    }
    if (!fs.existsSync(target)) {
      fail(`baseline ${view.file} tidak ada - bangkitkan dengan UPDATE_BASELINE=1`);
      continue;
    }
    const pct = diffPct(shot, fs.readFileSync(target));
    const limit = view.max ?? MAX_DIFF_PCT;
    const status = pct < 0 ? 'UKURAN BEDA' : pct.toFixed(2) + '%';
    console.log(`view ${view.file}: beda ${status} (batas ${limit}%)`);
    if (pct < 0 || pct > limit) {
      // Simpan jepretan gagal untuk diagnosa (di CI diunggah sebagai artefak).
      const outDir = process.env.RUNNER_TEMP || (await import('node:os')).tmpdir();
      const outPath = path.join(outDir, 'visual-fail-' + view.file);
      fs.writeFileSync(outPath, shot);
      console.log(`  jepretan gagal disimpan: ${outPath}`);
      fail(`${view.file} beda ${status} melebihi batas`);
    }
  }
  if (!UPDATE && !process.exitCode) console.log('Regresi visual LULUS: semua view dalam batas.');
} finally {
  await browser.close();
  server.close();
}
