// Cliente mínimo da API do ComfyUI (http://127.0.0.1:8188) para os workflows em "Workflows api/".
// Uso (módulo): const c = require('./comfy'); const out = await c.run(workflow, { timeout });
const fs = require('fs');
const path = require('path');
const HOST = process.env.COMFY || 'http://127.0.0.1:8188';
const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadWorkflow(name) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Workflows api', name), 'utf8')); }

async function upload(file, name = path.basename(file)) {
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(file)]), name);
  fd.append('overwrite', 'true');
  const r = await fetch(HOST + '/upload/image', { method: 'POST', body: fd });
  const j = await r.json(); return j.name;
}

async function queue(workflow) {
  const r = await fetch(HOST + '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: 'jogo-tools' }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('prompt recusado: ' + JSON.stringify(j).slice(0, 1500));
  return j.prompt_id;
}

// espera terminar; devolve o objeto de saídas do histórico
async function wait(id, timeout = 1800000) {
  const t0 = Date.now();
  for (;;) {
    const r = await fetch(HOST + '/history/' + id); const j = await r.json();
    if (j[id]) {
      const st = j[id].status || {};
      if (st.status_str === 'error') throw new Error('execução falhou: ' + JSON.stringify(st.messages).slice(0, 2000));
      if (st.completed || Object.keys(j[id].outputs || {}).length) return j[id].outputs;
    }
    if (Date.now() - t0 > timeout) throw new Error('timeout ' + id);
    await sleep(1500);
  }
}

async function download(file, dest) {
  const q = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' });
  const r = await fetch(HOST + '/view?' + q);
  if (!r.ok) throw new Error('download falhou ' + file.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

// todos os arquivos de saída (qualquer chave) de um resultado
function files(outputs) {
  const out = [];
  for (const node of Object.values(outputs)) for (const [k, v] of Object.entries(node)) if (Array.isArray(v)) for (const f of v) if (f && f.filename) out.push({ ...f, kind: k });
  return out;
}

async function run(workflow, { timeout } = {}) { const id = await queue(workflow); return files(await wait(id, timeout)); }

module.exports = { HOST, ROOT, loadWorkflow, upload, queue, wait, download, files, run, sleep };
