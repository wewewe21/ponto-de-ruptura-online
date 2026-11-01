// Imagem → modelo 3D com o Trellis 2 (workflow "3d_pixal3d_trellis2_image_to_model"), já com malha de jogo:
// a malha de alta resolução serve só de referência para assar normal/AO; o que sai é uma malha reduzida com UV e PBR.
// Uso: node tools/gen_models.js [prefixo ...]   → game/tools/_gen/models/<nome>.glb
const c = require('./comfy'); const fs = require('fs'); const path = require('path');
const { REFS } = require('./image_list');
const IN = path.join(__dirname, '_gen', 'refs'), OUT = path.join(__dirname, '_gen', 'models');
const only = process.argv.slice(2);

// faces da malha final / tamanho das texturas por tipo
const SPEC = (name) => {
  if (name.startsWith('sol_')) return { faces: 16000, tex: 2048, nrm: 2048 };
  if (name === 'heli') return { faces: 26000, tex: 2048, nrm: 2048 };
  if (name === 'truck' || name === 'truck_cargo') return { faces: 20000, tex: 2048, nrm: 2048 };
  if (name.startsWith('tree_') || name.startsWith('rock_')) return { faces: 9000, tex: 1024, nrm: 1024 };
  return { faces: 9000, tex: 1024, nrm: 1024 };
};

(async () => {
  let done = 0;
  for (const name of Object.keys(REFS)) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    const src = path.join(IN, name + '.png'), dest = path.join(OUT, name + '.glb');
    if (fs.existsSync(dest) || !fs.existsSync(src)) continue;
    const sp = SPEC(name);
    const wf = c.loadWorkflow('3d_pixal3d_trellis2_image_to_model.json');
    wf['122'].inputs.image = await c.upload(src, 'game_' + name + '.png');
    wf['186'].inputs.target_face_count = sp.faces;
    wf['288'].inputs.value = sp.tex;
    wf['224'].inputs.resolution = sp.nrm;
    wf['322'].inputs.filename_prefix = 'game_3d/' + name;
    if (!name.startsWith('sol_') && name !== 'heli' && !name.startsWith('truck')) wf['241'].inputs.resolution = 512;   // cenário: remesh de referência mais leve (3x mais rápido)
    const seed = 100 + [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    for (const k of ['3', '12', '18', '23']) wf[k].inputs.seed = seed;
    try {
      const t0 = Date.now();
      const out = await c.run(wf, { timeout: 3600000 });
      const f = out.find((x) => x.subfolder === 'game_3d' && /.glb$/i.test(x.filename)); // saída do Save3D (as demais são prévias temporárias)
      if (!f) throw new Error('sem glb nas saídas: ' + JSON.stringify(out));
      await c.download(f, dest);
      console.log(`[${++done}] ${name} ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${fs.statSync(dest).size} bytes`);
    } catch (e) { console.error('FALHOU', name, e.message.slice(0, 600)); }
  }
  console.log('fim');
})();
