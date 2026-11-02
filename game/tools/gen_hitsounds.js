// Sons de confirmação de acerto do multiplayer (Stable Audio 3 via ComfyUI). Retomável; acrescenta ao manifest.
// Uso: node tools/gen_hitsounds.js
const c = require('./comfy'); const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'audio');
const SET = {
  hit_confirm: [3, 0.5, 'First-person shooter hit marker confirmation: a short crisp punchy tick with a solid low thump underneath, loud, dry, no reverb, no music'],
  hit_headshot: [3, 1.0, 'Classic first-person shooter headshot sound effect: a heavy skull-smashing crunch with a sharp bone crack and a bright metallic ping on top, powerful, punchy, dry, no reverb, no music'],
  hit_killshot: [2, 0.9, 'First-person shooter kill confirmation sound: a deep heavy bass thud with a sharp snap and a short metallic ring, powerful, dry, no reverb, no music'],
};
(async () => {
  const manPath = path.join(OUT, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  for (const [name, [n, dur, prompt]] of Object.entries(SET)) {
    manifest[name] = { group: 'sfx', dur, files: [] };
    for (let i = 0; i < n; i++) {
      const file = `${name}_${i + 1}.mp3`, dest = path.join(OUT, 'sfx', file);
      manifest[name].files.push(`assets/audio/sfx/${file}`);
      if (fs.existsSync(dest)) continue;
      const wf = c.loadWorkflow('audio_stable_audio_3_medium.json');
      wf['52:31'].inputs.value = prompt; wf['52:36'].inputs.value = dur; wf['52:43'].inputs.choice = 'SFX'; wf['52:35'].inputs.value = false;
      wf['52:3'].inputs.seed = 4242 + i * 7919 + name.length * 131; wf['57'].inputs.filename_prefix = 'game_audio/' + name;
      const t0 = Date.now();
      const f = (await c.run(wf, { timeout: 900000 })).find((x) => x.kind === 'audio');
      await c.download(f, dest); console.log(file, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }
  fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1)); console.log('ok');
})();
