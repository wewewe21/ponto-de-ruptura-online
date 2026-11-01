// Animações dos soldados (inimigos e aliados) com o Kimodo → assets/anims/soldier_kimodo.json.
// Uso: 1) cd "<kimodo-ai>" && go run ./demo -addr 127.0.0.1:8094    2) node tools/kimodo_soldier_anims.js
const fs = require('fs'); const path = require('path');
const API = 'http://127.0.0.1:8094';
const KIMODO = process.argv[2] || 'C:/Users/WillianIA/Documents/1. IA Local/kimodo-ai';
const OUT = path.join(__dirname, '..', 'assets', 'anims', 'soldier_kimodo.json');
const JOBS = [
  ['idle', 'A soldier stands alert holding a rifle at the ready, slightly shifting weight and looking around', 120],
  ['walk', 'A soldier walks forward carefully holding a rifle at the chest', 120],
  ['run', 'A soldier runs forward fast holding a rifle', 90],
  ['crouch', 'A soldier crouches low behind cover holding a rifle, staying almost still and watching', 90],
  ['crouch_walk', 'A soldier moves forward in a low crouch holding a rifle with careful sneaking steps', 120],
  ['look', 'A soldier looks left and right suspiciously, searching the area while holding a rifle', 120],
  ['hit', 'A soldier is hit in the body and flinches, stumbling', 60],
  ['die1', 'A soldier is shot in the chest and falls backward to the ground dead', 90],
  ['die2', 'A soldier is shot, drops to his knees and falls forward face down', 120],
  ['die3', 'A soldier is shot in the head and collapses straight down limp', 90],
  ['throw', 'A soldier pulls a grenade and throws it overhand forward', 90],
  ['flinch', 'A soldier ducks quickly covering his head with his arm', 60],
  ['grabbed', 'A soldier is grabbed from behind, struggles briefly then goes limp and drops', 90],
  ['stagger', 'A soldier is blinded by a bright flash, covers his eyes and stumbles around', 90],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const ids = {};
  for (const [n, prompt, frames] of JOBS) {
    const r = await fetch(API + '/api/generate', { method: 'POST', body: JSON.stringify({ prompt, frames, model: 'soma-rp-v1.1', steps: 100, seed: 21 }) });
    ids[n] = (await r.json()).id; console.log('fila', n, ids[n]);
  }
  const base = path.join(KIMODO, 'demo-output');
  const out = { fps: 30, joints: 30, clips: {} };
  for (const [n, id] of Object.entries(ids)) {
    const meta = path.join(base, id + '.json');
    for (;;) { const s = JSON.parse(fs.readFileSync(meta, 'utf8')).status; if (s === 'ready') break; if (s === 'failed') throw new Error('falhou: ' + n); await sleep(2000); }
    const rot = fs.readFileSync(path.join(base, id, 'local_rotations_xyzw.f32')), root = fs.readFileSync(path.join(base, id, 'root_positions.f32'));
    out.clips[n] = { frames: root.length / 12, rot: rot.toString('base64'), root: root.toString('base64'), prompt: fs.readFileSync(path.join(base, id, 'prompt.txt'), 'utf8') };
    console.log('pronto', n);
  }
  fs.writeFileSync(OUT, JSON.stringify(out)); console.log('gravado', OUT);
})();
