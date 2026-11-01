// Orquestra a geração pesada em sequência (uma GPU): imagens → animações Kimodo (soldados) → modelos 3D (Trellis 2).
// Uso: node tools/pipeline.js     (ComfyUI já deve estar rodando em :8188)
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const c = require('./comfy');
const KIMODO = 'C:/Users/WillianIA/Documents/1. IA Local/kimodo-ai';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const run = (file, args = []) => new Promise((res) => { const p = spawn('node', [path.join(__dirname, file), ...args], { stdio: 'inherit' }); p.on('exit', res); });

async function queueIdle() { const q = await (await fetch(c.HOST + '/queue')).json(); return !q.queue_running.length && !q.queue_pending.length; }
async function freeComfy() { try { await fetch(c.HOST + '/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch (e) {} }

(async () => {
  log('1/3 imagens');
  await run('gen_images.js');
  while (!(await queueIdle())) await c.sleep(2000);

  log('2/3 Kimodo (soldados)');
  if (!fs.existsSync(path.join(__dirname, '..', 'assets', 'anims', 'soldier_kimodo.json'))) {
    await freeComfy(); await c.sleep(4000);
    const srv = spawn('go', ['run', './demo', '-addr', '127.0.0.1:8094'], { cwd: KIMODO, stdio: 'ignore', windowsHide: true });
    for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:8094/api/models'); if (r.ok) break; } catch (e) {} await c.sleep(2000); }
    await run('kimodo_soldier_anims.js');
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(srv.pid)], { stdio: 'ignore' }); } catch (e) {}
    try { execFileSync('taskkill', ['/F', '/IM', 'demo.exe'], { stdio: 'ignore' }); } catch (e) {}
    await c.sleep(4000);
  }

  log('3/3 modelos 3D');
  await run('gen_models.js');
  log('pipeline concluída');
})().catch((e) => { console.error('pipeline falhou', e); process.exit(1); });
