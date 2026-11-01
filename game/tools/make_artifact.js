// Monta a pasta do artifact (sem ferramentas, sem _gen, sem o FBX de 27 MB) e escreve a lista de arquivos.
// Uso: node tools/make_artifact.js <pasta-de-saida>
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '_artifact'));
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'assets')), path.join(root, 'ui.css')]
  .filter((f) => !/robot_rigged\.fbx$/.test(f));
let list = [];
for (const f of files) { const r = rel(f); const d = path.join(out, r); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(f, d); list.push(r); }
// página principal: sem doctype/html/head/body (o artifact os adiciona)
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body[^>]*>/gi, '').replace(/<meta charset[^>]*>/gi, '').replace(/<meta name="viewport"[^>]*>/gi, '');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '_files.json'), JSON.stringify(list));
const bytes = list.reduce((a, r) => a + fs.statSync(path.join(out, r)).size, 0);
console.log('arquivos:', list.length, 'tamanho:', (bytes / 1048576).toFixed(1), 'MB ->', out);
