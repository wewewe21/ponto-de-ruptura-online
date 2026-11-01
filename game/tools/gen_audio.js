// Gera todos os sons com o Stable Audio 3 via ComfyUI. Retomável: pula o que já existe em game/assets/audio/.
// Uso: node tools/gen_audio.js [prefixo ...]   (sem argumentos gera tudo)
const c = require('./comfy'); const fs = require('fs'); const path = require('path');
const { SFX, LOOPS, MUSIC } = require('./audio_list');
const OUT = path.join(__dirname, '..', 'assets', 'audio');
const only = process.argv.slice(2);
(async () => {
  const jobs = [];
  for (const [group, set] of [['sfx', SFX], ['loop', LOOPS], ['music', MUSIC]]) for (const [name, [n, dur, prompt]] of Object.entries(set)) for (let i = 0; i < n; i++) jobs.push({ group, name, i, dur, prompt });
  const manifest = {};
  let done = 0;
  for (const j of jobs) {
    const file = `${j.name}_${j.i + 1}.mp3`;
    const dest = path.join(OUT, j.group === 'music' ? 'music' : j.group === 'loop' ? 'loops' : 'sfx', file);
    (manifest[j.name] = manifest[j.name] || { group: j.group, dur: j.dur, files: [] }).files.push(path.relative(path.join(__dirname, '..'), dest).replace(/\\/g, '/'));
    if (only.length && !only.some((o) => j.name.startsWith(o))) continue;
    if (fs.existsSync(dest)) continue;
    const wf = c.loadWorkflow('audio_stable_audio_3_medium.json');
    wf['52:31'].inputs.value = j.prompt;
    wf['52:36'].inputs.value = j.dur;
    wf['52:43'].inputs.choice = j.group === 'music' ? 'Music' : 'SFX';
    wf['52:35'].inputs.value = false;
    wf['52:3'].inputs.seed = 1000 + j.i * 7919 + j.name.length * 131;
    wf['57'].inputs.filename_prefix = 'game_audio/' + j.name;
    try {
      const t0 = Date.now();
      const f = (await c.run(wf, { timeout: 900000 })).find((x) => x.kind === 'audio');
      await c.download(f, dest);
      console.log(`[${++done}] ${file} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) { console.error('FALHOU', file, e.message.slice(0, 300)); }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('fim; manifest com', Object.keys(manifest).length, 'sons');
})();
