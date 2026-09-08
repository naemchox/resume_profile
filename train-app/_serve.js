const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PORT = process.env.PORT || 8000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
};
http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let p = path.normalize(path.join(ROOT, u === '/' ? '/train.html' : u));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    if (fs.statSync(p).isDirectory()) p = path.join(p, 'train.html');
    const ext = path.extname(p).toLowerCase();
    // Dev server: never let the browser HTTP-cache files. Without this there are no
    // cache headers, so the browser heuristically caches train.html and can serve the
    // service worker a STALE copy even on reload — i.e. "I don't see my change."
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`serving ${ROOT} at http://0.0.0.0:${PORT}`);
});
