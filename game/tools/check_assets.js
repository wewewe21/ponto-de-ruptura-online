// Confere os assets referenciados no código e no manifest de áudio; imprime o tamanho total por pasta.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const missing = [];
for (const f of walk(path.join(root, 'src')).concat([path.join(root, 'index.html'), path.join(root, 'ui.css')])) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/\.\/assets\/[\w./${}-]+/g)) {
    if (m[0].includes('$')) continue;
    if (!fs.existsSync(path.join(root, m[0]))) missing.push(m[0] + '  (em ' + path.relative(root, f) + ')');
  }
}
const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/manifest.json'), 'utf8'));
for (const v of Object.values(man)) for (const f of v.files) if (!fs.existsSync(path.join(root, f))) missing.push(f);
const sizes = {};
for (const f of walk(path.join(root, 'assets'))) { const k = path.relative(path.join(root, 'assets'), f).split(path.sep).slice(0, 2).join('/'); sizes[k] = (sizes[k] || 0) + fs.statSync(f).size; }
console.log(missing.length ? 'FALTANDO:\n' + missing.join('\n') : 'todas as referências existem');
console.log(Object.entries(sizes).map(([k, v]) => k.padEnd(24) + (v / 1048576).toFixed(1) + ' MB').join('\n'));
console.log('total', (Object.values(sizes).reduce((a, b) => a + b, 0) / 1048576).toFixed(1), 'MB');
