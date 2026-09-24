// Minimal static server with SPA fallback, used to reproduce the widget's
// behaviour under client-side routing.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HARNESS = __dirname;

const TYPES = { '.js': 'application/javascript', '.html': 'text/html', '.map': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file;

  if (url.pathname.startsWith('/dist/')) {
    file = path.join(ROOT, url.pathname);
  } else if (url.pathname.startsWith('/spa/')) {
    file = path.join(HARNESS, 'spa.html');          // SPA fallback: every route -> same shell
  } else if (url.pathname.startsWith('/mpa/')) {
    file = path.join(HARNESS, path.basename(url.pathname));
  } else {
    file = path.join(HARNESS, 'spa.html');
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/html' });
    res.end(data);
  });
}).listen(8099, () => console.log('harness on 8099'));
