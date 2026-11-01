// Servidor estático mínimo (sem dependências). Uso: node server.js  → http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.fbx': 'application/octet-stream', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.ktx2': 'application/octet-stream' };

http.createServer((req, res) => {
  // utilitário de desenvolvimento (só local): grava arquivos gerados em assets/ — usado por tools/fbx2glb.html
  if (req.method === 'POST' && req.url.startsWith('/__save?')) {
    const rel = decodeURIComponent(new URLSearchParams(req.url.split('?')[1]).get('path') || '');
    const ok = /^assets\/[\w./-]+$/.test(rel) && !rel.includes('..') && /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
    if (!ok) { res.writeHead(403); return res.end('proibido'); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks)); res.writeHead(200); res.end('ok ' + rel); });
    return;
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log(`Ponto de Ruptura rodando em http://localhost:${port}`));
