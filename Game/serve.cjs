#!/usr/bin/env node
/**
 * Server statis tanpa dependensi untuk menjalankan versi build di folder dist.
 * Pemakaian: node serve.cjs  (lalu buka http://localhost:8000)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname);
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const NO_OPEN = process.argv.includes('--no-open') || process.env.NO_OPEN === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function resolveTarget(urlPath) {
  // Prefer the build output, fall back to the project root for missing files.
  const rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidates = [];
  if (rel === '/' || rel === '') {
    candidates.push(path.join(ROOT, 'dist', 'index.html'));
    candidates.push(path.join(ROOT, 'index.html'));
  } else {
    const clean = rel.replace(/^\/+/, '');
    candidates.push(path.join(ROOT, 'dist', clean));
    candidates.push(path.join(ROOT, clean));
    if (!path.extname(clean)) {
      candidates.push(path.join(ROOT, 'dist', clean, 'index.html'));
      candidates.push(path.join(ROOT, clean, 'index.html'));
    }
  }
  return candidates;
}

function findFile(urlPath) {
  for (const candidate of resolveTarget(urlPath)) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // keep looking through the candidates
    }
  }
  return null;
}

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain' });
  }

  const file = findFile(req.url || '/');

  if (!file) {
    const msg = [
      '<!DOCTYPE html><html lang="id"><meta charset="utf-8">',
      '<title>404</title><body style="background:#0a0a0a;color:#e0ddd5;font-family:monospace;padding:40px">',
      '<h1>404</h1><p>' + (req.url || '/') + ' tidak ditemukan.</p>',
      '<p>Pastikan folder <code>dist</code> sudah ada (jalankan <code>npm run build</code>).</p>',
      '</body></html>'
    ].join('');
    return send(res, 404, msg, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const rangeRoot = file.startsWith(path.join(ROOT, 'dist')) ? 'dist' : 'project';

  fs.readFile(file, (err, data) => {
    if (err) {
      return send(res, 500, 'Gagal membaca file', { 'Content-Type': 'text/plain' });
    }
    const headers = {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': rangeRoot === 'dist' && ext !== '.html' ? 'no-cache' : 'no-store'
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      return res.end();
    }
    send(res, 200, data, headers);
  });
});

server.listen(PORT, HOST, () => {
  const url = 'http://' + HOST + ':' + PORT + '/';
  console.log('Asap yang Tak Padam berjalan di ' + url);
  console.log('Sumber: ' + (fs.existsSync(path.join(ROOT, 'dist')) ? 'folder dist' : 'folder proyek (dist belum dibuat)'));
  console.log('Tekan Ctrl+C untuk berhenti.');
  if (!NO_OPEN) {
    const cmd = process.platform === 'win32'
      ? 'start "" "' + url + '"'
      : (process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"');
    setTimeout(() => exec(cmd, () => {}), 400);
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' sudah dipakai. Coba: set PORT=8080 lalu jalankan lagi, atau tutup program lain.');
  } else {
    console.error('Server gagal dimulai:', err && err.message ? err.message : err);
  }
  process.exit(1);
});
