/**
 * Penerima screenshot dari dalam halaman game.
 *
 * Tab game kadang berada di jendela yang tidak terlihat, sehingga
 * `browser.screenshot` menolak. Halaman mengirim data: URL PNG hasil render
 * sendiri lewat POST sederhana ke server ini, lalu file disimpan di `shots/`.
 *
 * Pakai: node tools/screenshot-sink.cjs   (port 8099)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'shots');
fs.mkdirSync(outDir, { recursive: true });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const comma = body.indexOf(',');
        const b64 = comma >= 0 ? body.slice(comma + 1) : body;
        const buf = Buffer.from(b64, 'base64');
        const name = `shot-${Date.now()}.png`;
        fs.writeFileSync(path.join(outDir, name), buf);
        res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' });
        res.end(name);
        console.log('[sink] saved', name, buf.length, 'bytes');
      } catch (err) {
        res.writeHead(500, cors);
        res.end(String(err));
      }
    });
  })
  .listen(8099, () => console.log('[sink] listening on http://localhost:8099'));
