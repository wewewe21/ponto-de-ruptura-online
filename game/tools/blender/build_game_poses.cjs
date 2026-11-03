// Converte o JSON exportado do Blender (export_poses.py) no arquivo que o jogo carrega: game/assets/poses/fps_poses.json
// Uso: node build_game_poses.cjs <poses_user.json> <saida.json>
const fs = require('fs');
const [, , src, dst] = process.argv;
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
const WEAPONS = ['SD9', 'MK5', 'P19', 'VK12', 'AX50', 'KNIFE'];     // armas com modelo 3D
const first = d.stations[WEAPONS[0]];
const bones = Object.keys(first.bones).map((name) => ({ name, parent: first.bones[name].parent }));
const rest = Object.fromEntries(bones.map((b) => [b.name, first.bones[b.name].rest]));
const weapons = {};
for (const id of WEAPONS) {
  const st = d.stations[id];
  weapons[id] = { gun: st.gun, pose: Object.fromEntries(bones.map((b) => [b.name, st.bones[b.name].pose])) };
  if (st.model) weapons[id].model = st.model;   // posição/giro/escala do modelo dentro da arma, como deixado no Blender
}
fs.writeFileSync(dst, JSON.stringify({ version: 1, bones, rest, weapons }));
console.log('ok', dst, fs.statSync(dst).size, 'bytes', bones.length, 'ossos', WEAPONS.join(','));
