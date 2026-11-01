// Gera as animações do chefe com o Kimodo (texto→movimento) e empacota em assets/anims/boss_kimodo.json.
// Uso:  1) em outro terminal:  cd "<pasta do kimodo-ai>" && go run ./demo -addr 127.0.0.1:8094
//       2) node tools/kimodo_boss_anims.js [pasta-do-kimodo-ai]
// Saída: assets/anims/boss_kimodo.json  (rotações locais XYZW de 30 juntas SOMA a 30 fps + posição da raiz por quadro).
// O retarget para o esqueleto Mixamo do robô é feito em tempo real em src/actors/bossanim.js.
const fs = require('fs');
const path = require('path');
const API = 'http://127.0.0.1:8094';
const KIMODO = process.argv[2] || 'C:/Users/WillianIA/Documents/1. IA Local/kimodo-ai';
const OUT = path.join(__dirname, '..', 'assets', 'anims', 'boss_kimodo.json');
const JOBS = [
  ['idle', 'A massive heavy armored soldier stands in a battle ready stance holding a rifle, breathing slowly and shifting weight', 120],
  ['walk', 'A heavy armored soldier walks forward slowly and menacingly with a rifle held at the chest', 120],
  ['run', 'A heavy armored soldier runs forward fast carrying a rifle', 90],
  ['fall', 'A person falls from the sky with arms and legs spread out', 60],
  ['land', 'A person lands hard from a very high jump in a deep crouch, then slowly stands up straight and looks around', 150],
  ['roar', 'A person roars angrily and beats their chest with both fists', 120],
  ['aim', 'A soldier stands aiming a rifle forward with both hands and fires several shots', 120],
  ['stomp', 'A person raises one foot high and slams it hard onto the ground', 90],
  ['slam', 'A person raises both fists above the head and smashes them down onto the ground', 90],
  ['hit', 'A person is hit by a heavy impact and staggers backward', 60],
  ['die', 'A person is shot, staggers and collapses to the ground dead', 150],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const ids = {};
  for (const [n, prompt, frames] of JOBS) {
    const r = await fetch(API + '/api/generate', { method: 'POST', body: JSON.stringify({ prompt, frames, model: 'soma-rp-v1.1', steps: 100, seed: 7 }) });
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
