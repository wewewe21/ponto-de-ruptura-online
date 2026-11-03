// Alvo de treino para testar o multiplayer sozinho: cria uma sala, entra como "Alvo" e fica no time INIMIGO do primeiro jogador
// que entrar (se cair no mesmo time, sai e entra de novo). Anda em direção ao jogador, para a ~10 m e fica se movendo de lado.
// Não atira. Uso: node tools/test-bot.cjs [http://localhost:8080] [nome-da-sala]
const path = require('path');
const { WebSocket } = require(path.join(__dirname, '..', '..', 'node_modules', 'ws'));
const base = process.argv[2] || 'http://localhost:8080', roomName = process.argv[3] || 'Teste de combate', NAME = 'Alvo';
let roomId = null, ws = null, seq = 0, timer = null, me = null, tries = 0;

async function createRoom() {
  const r = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roomName, maxPlayers: 12 }) });
  roomId = (await r.json()).room.id;
  console.log('SALA ' + roomId + '  ->  ' + base + '/?sala=' + roomId);
}
function connect() {
  ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws', { origin: base });
  let target = null, t0 = Date.now();
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', roomId, name: NAME })));
  ws.on('error', (e) => console.log('ERRO', e.message));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') { me = m.id || m.player?.id || m.playerId || me; console.log('Alvo entrou'); }
    if (m.t !== 'state') return;
    const self = m.players.find((p) => p.name === NAME && (!me || p.id === me)); if (!self) return; me = self.id;
    const humans = m.players.filter((p) => p.id !== me);
    if (humans.some((p) => p.team === self.team) && tries < 6) {   // mesmo time que um jogador: sai e entra de novo para cair no outro
      tries++; console.log('Mesmo time que ' + humans.find((p) => p.team === self.team).name + ' — reentrando (' + tries + ')');
      clearInterval(timer); ws.close(); me = null; setTimeout(connect, 400); return;
    }
    const enemies = humans.filter((p) => p.team !== self.team && !p.dead);
    target = enemies.sort((a, b) => Math.hypot(a.x - self.x, a.z - self.z) - Math.hypot(b.x - self.x, b.z - self.z))[0] || null;
    ws.__self = self; ws.__target = target;
  });
  clearInterval(timer);
  timer = setInterval(() => {
    if (ws.readyState !== 1) return;
    const s = ws.__self, t = ws.__target; let forward = 0, right = 0, yaw = 0;
    if (s && t) {
      const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
      yaw = Math.atan2(-dx, -dz); forward = d > 11 ? 1 : d < 7 ? -1 : 0; right = d < 40 ? Math.sign(Math.sin((Date.now() - t0) / 1500)) : 0;
    }
    ws.send(JSON.stringify({ t: 'input', seq: ++seq, forward, right, yaw, pitch: 0, shoot: false, weapon: 'SD9' }));
  }, 34);
}
(async () => { await createRoom(); connect(); setTimeout(() => process.exit(0), 3 * 3600 * 1000); })();
