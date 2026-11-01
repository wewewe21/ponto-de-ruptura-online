// Gera imagens com o Krea 2 Turbo (ComfyUI). Retomável. Uso: node tools/gen_images.js [grupo|prefixo ...]
// Saída: PNG em game/tools/_gen/<dir>/<nome>.png (convertido depois por tools/process_images.py)
const c = require('./comfy'); const fs = require('fs'); const path = require('path');
const L = require('./image_list');
const OUT = path.join(__dirname, '_gen');
const only = process.argv.slice(2);
(async () => {
  const all = { ...L.UI, ...L.REFS, ...L.TEXTURES };
  let done = 0;
  for (const [name, j] of Object.entries(all)) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    const dest = path.join(OUT, j.dir, name + '.png');
    if (fs.existsSync(dest)) continue;
    const wf = c.loadWorkflow('image_krea2_turbo_t2i.json');
    wf['30:19'].inputs.value = j.prompt;
    wf['30:24'].inputs.value = false;     // usa o prompt como está (sem o LLM de expansão)
    wf['30:23'].inputs.value = false;     // sem LoRA
    wf['49'].inputs.aspect_ratio = j.ar; wf['49'].inputs.megapixels = j.mp;
    wf['30:3'].inputs.seed = 7000 + [...name].reduce((a, ch) => a + ch.charCodeAt(0) * 31, 0);
    wf['29'].inputs.filename_prefix = 'game_img/' + name;
    try {
      const t0 = Date.now();
      const f = (await c.run(wf, { timeout: 900000 })).find((x) => x.kind === 'images');
      await c.download(f, dest);
      console.log(`[${++done}] ${name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) { console.error('FALHOU', name, e.message.slice(0, 300)); }
  }
  console.log('fim');
})();
