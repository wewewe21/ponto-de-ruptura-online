// PONTO DE RUPTURA — Operação MURALHA. Bootstrap, loop principal, estados, menus e configurações.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { GameAudio } from './core/audio.js';
import { clamp, lerp, rand } from './core/utils.js';
import { Physics } from './world/physics.js';
import { buildLevel, applyWorldFlags } from './world/level.js';
import { loadPBR } from './world/pbr.js';
import { loadEnvModels } from './world/env3d.js';
import { loadSoldierAssets, meshSoldiers } from './actors/meshsoldier.js';
import { NavGrid } from './world/nav.js';
import { Weather } from './world/weather.js';
import { LightManager } from './world/lights.js';
import { Post } from './render/post.js';
import { FX } from './game/fx.js';
import { ViewModel } from './actors/viewmodel.js';
import { Boss, loadBossAssets } from './ai/boss.js';
import { Weapons } from './actors/weapons.js';
import { Player } from './actors/player.js';
import { Director } from './ai/director.js';
import { Allies } from './ai/ally.js';
import { Support } from './game/support.js';
import { HUD, Dialog } from './game/hud.js';
import { Mission } from './game/mission.js';
import { Multiplayer } from './multiplayer/client.js';

const $ = (id) => document.getElementById(id);
const DIFF = {
  recruta: { acc: 0.65, dmg: 0.6, detect: 0.7, dmgTaken: 1, tokens: 2 },
  regular: { acc: 1.0, dmg: 1.0, detect: 1.0, dmgTaken: 1, tokens: 3 },
  veterano: { acc: 1.25, dmg: 1.55, detect: 1.3, dmgTaken: 1, tokens: 4 },
};
const DEFAULTS = { sens: 1.0, fov: 74, master: 0.85, music: 0.55, tts: false, diff: 'regular', scale: 1, shadows: true, invertY: false, quality: 'alta' };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pdr-settings') || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
function saveSettings() { try { localStorage.setItem('pdr-settings', JSON.stringify(G.settings)); } catch (e) {} }

const G = (window.G = { time: 0, state: 'loading', settings: loadSettings(), nvg: false, cinematic: false });
G.diff = DIFF[G.settings.diff];
const OUTDOOR = { name: 'outdoor', ambient: 0.22, indoor: false, reverb: 'outdoor' };
G.zoneAt = (p) => {
  for (const z of G.level.zones) if (p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ && p.y >= z.minY && p.y <= z.maxY) return z;
  return OUTDOOR;
};
function resetStats() {
  G.stats = { time: 0, kills: 0, headshots: 0, stealthKills: 0, shots: 0, hits: 0, deaths: 0, supportUsed: 0, supportKills: 0, allyKills: 0, intel: 0, alarms: 0, damageTaken: 0, grenades: 0, jammers: 0, vehicles: 0 };
}
resetStats();

const tick = () => new Promise((r) => setTimeout(r, 16));
function progress(t, p) { $('load-text').textContent = t; $('load-bar').style.width = `${p}%`; }
const TIPS = ['Chuva esconde o seu passo. Aproveite o barulho para avançar.', 'Holofotes cegam a visão noturna; relâmpagos revelam tudo por um instante.', 'O corpo do Colosso quase não sente balas — mire no visor vermelho.', 'Inimigos presos por supressão revidam mal. Atire na cobertura e avance.', 'Execução pelas costas (V) é silenciosa. Granada de fumaça corta a linha de visão.', 'Cada bloqueador desativado devolve um nível de apoio tático.'];
{ const t = document.getElementById('load-tip'); if (t) t.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }

async function boot() {
  const canvas = $('game');
  progress('Iniciando renderizador', 5); await tick();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = G.settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.scene.fog = new THREE.FogExp2(0x070a0d, 0.0115);
  G.lightBase = { hemi: 2.0, moon: 0.58 };   // ambiente um pouco mais legível (as texturas PBR são mais escuras no escuro)
  G.camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.05, 2500);
  G.camera.rotation.order = 'YXZ';
  G.hemi = new THREE.HemisphereLight(0x3d4c63, 0x1a1b1d, 0.55);
  // mapa de ambiente noturno: céu carregado + brilho de sódio no horizonte (reflexos no concreto molhado)
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; void main(){ float h = vD.y;
        vec3 c = mix(vec3(0.03, 0.032, 0.036), vec3(0.11, 0.13, 0.17), smoothstep(-0.3, 0.7, h));
        float band = exp(-abs(h - 0.04) * 18.0);
        c += vec3(0.35, 0.2, 0.08) * band * (0.5 + 0.5 * sin(atan(vD.z, vD.x) * 7.0));
        gl_FragColor = vec4(c, 1.0); }`,
    })));
    G.scene.environment = pm.fromScene(envScene, 0.04).texture;
    G.scene.environmentIntensity = 0.7;
    pm.dispose();
  }
  G.moon = new THREE.DirectionalLight(0xb8c8ff, 0.12);
  G.moon.castShadow = true;
  G.moon.shadow.mapSize.set(2048, 2048);
  const sc = G.moon.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
  G.moon.shadow.bias = -0.0006; G.moon.shadow.normalBias = 0.04;
  G.scene.add(G.hemi, G.moon, G.moon.target);
  G.physics = new Physics();
  G.audio = new GameAudio();
  meshSoldiers.camera = G.camera;
  meshSoldiers.audio = G.audio;
  progress('Erguendo a barragem', 15); await tick();
  G.pbr = await loadPBR(renderer);
  G.env = await loadEnvModels();
  buildLevel(G);
  G.level.roads = [[-172, -46, -160, 30], [-172, -46, -112, -36], [-160, 96, -146, 236], [-100, -6, 50, 6], [90, -6, 160, 6], [150, 6, 160, 150], [140, -60, 150, -24]];
  progress('Gerando navegação da IA', 45); await tick();
  G.nav = new NavGrid(G.physics);
  G.nav.build([
    { minX: -258, maxX: -96, minZ: -54, maxZ: 232, minY: -1, maxY: 9 },
    { minX: -100, maxX: 100, minZ: -10, maxZ: 10, minY: -0.5, maxY: 19 },
    { minX: 34, maxX: 49, minZ: -12, maxZ: 10, minY: 11, maxY: 19 },
    { minX: 36, maxX: 100, minZ: -8, maxZ: 38, minY: -23, maxY: 1 },
    { minX: 94, maxX: 214, minZ: -60, maxZ: 150, minY: -1.5, maxY: 2 },
  ]);
  progress('Tempestade e luzes', 70); await tick();
  G.weather = new Weather(G);
  G.lights = new LightManager(G);
  G.post = new Post(renderer);
  G.fx = new FX(G);
  G.vm = new ViewModel(G.level.T);
  G.vm.scene.environment = G.scene.environment; G.vm.scene.environmentIntensity = 0.9;
  progress('Carregando armas', 78); await G.vm.useRifleModel(); await G.vm.useWeaponModels();
  progress('Carregando soldados', 82); try { await loadSoldierAssets(); } catch (e) { console.warn('Soldados 3D indisponíveis, usando o modelo simples.', e); }
  await G.vm.useFPSArms();
  G.director = new Director(G);
  // o chefe carrega em segundo plano (FBX grande); a missão espera por ele se precisar
  G.bossReady = loadBossAssets().then((a) => { G.boss = new Boss(G, a); G.director.boss = G.boss; return G.boss; }).catch((e) => { console.warn('Chefe indisponível:', e); return null; });
  G.director.buildCover();
  G.player = new Player(G);
  G.weapons = new Weapons(G);
  G.allies = new Allies(G);
  G.support = new Support(G);
  progress('Interface', 85); await tick();
  G.hud = new HUD(G);
  G.dialog = new Dialog(G);
  G.mission = new Mission(G);
  G.input = new Input(canvas);
  G.input.onUnlock = () => { if (G.multiplayer?.active) G.multiplayer.menu = true; else if (G.state === 'playing') pause(); };
  G.vm.set('SD9');
  applyWorldFlags(G, {});
  resize();
  addEventListener('resize', resize);
  progress('Compilando shaders', 95); await tick();
  G.camera.position.set(-60, 30, 90); G.camera.lookAt(0, 0, 0);
  try { renderer.compile(G.scene, G.camera); renderer.compile(G.vm.scene, G.vm.camera); } catch (e) {}
  G.hud.show(false);
  setupMenus();
  G.multiplayer = new Multiplayer(G);
  await G.multiplayer.init();
  applyQuality();
  G.state = 'title';
  $('loading').hidden = true;
  $('title').hidden = !$('mp-lobby').hidden;
  G.audio.musicMode = 'menu';
  const wake = () => { G.audio.init(); G.audio.setVolumes(); G.audio.setMusic(G.audio.musicMode || 'menu', true); };
  addEventListener('pointerdown', wake, { once: true }); addEventListener('keydown', wake, { once: true });
  last = performance.now();
  requestAnimationFrame(loop);
}

function resize() {
  const r = G.renderer;
  const pr = Math.min(devicePixelRatio, 1.5) * G.settings.scale;
  r.setPixelRatio(pr);
  r.setSize(innerWidth, innerHeight);
  G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
  G.vm.aspect(innerWidth / innerHeight);
  G.post.scale = 1;
  G.post.resize(innerWidth, innerHeight, pr);
  G.fx.resize(innerHeight * pr, G.camera.fov);
  G.hud && G.hud.resize();
  G.multiplayer?.resize();
}

// ---------- estados ----------
function show(id) { for (const s of ['title', 'briefing', 'pause', 'death', 'victory', 'settings', 'controls', 'chapters']) $(s).hidden = s !== id; }
function startMission(stepId) {
  G.weather.clearMatchWeather();
  G.audio.init(); G.audio.setVolumes(); G.audio.tts = G.settings.tts;
  resetStats();
  G.mission.timers = [];
  G.dialog.clear();
  G.director.clearAll();
  G.director.ignorePlayer = false;
  G.cinematic = false;
  G.weapons.reset(); G.vm.set('SD9');
  G.support.reset();
  G.post.uniforms.uFade.value = 0;
  G.nvg = false;
  if (stepId) jumpTo(stepId); else G.mission.start();
  G.state = 'playing';
  show(null);
  G.hud.show(true);
  G.input.lock();
}
function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  show('pause');
  G.audio.ctx && G.audio.ctx.suspend();
}
function resume() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  show(null);
  G.audio.ctx && G.audio.ctx.resume();
  G.input.lock();
}
G.onPlayerDeath = (cause) => {
  G.audio.setMusic('death');
  G.stats.deaths++;
  G.state = 'dead';
  G.deadT = 0;
  const tips = {
    drown: 'A galeria inunda rápido. Corra e não pare para lutar dentro da água.',
    fall: 'Cuidado com as bordas. A barragem tem setenta metros de altura.',
    frag: 'Granadas mostram um ícone na tela. Saia do raio assim que ele aparecer.',
    mortar: 'O morteiro não diferencia amigos. Designe longe de você.',
    rocket: 'Explosivos ignoram cobertura fina. Mude de posição.',
    bullet: ['Abaixe-se atrás de cobertura baixa e espere a vida regenerar.', 'Use a fumaça para atravessar áreas abertas.', 'O Coruja elimina atiradores: marque-os com o designador.', 'Inimigos presos por supressão não revidam bem. Atire na cobertura deles e avance.', 'O ninho de MG não gira para trás. Flanqueie.'],
  };
  const t = tips[cause] || tips.bullet;
  $('death-tip').textContent = Array.isArray(t) ? t[Math.floor(Math.random() * t.length)] : t;
  const quotes = ['"A água sempre encontra um caminho." — provérbio do vale do Sarn', '"Toda barragem é uma promessa contra a gravidade." — engenharia hidráulica, aula 1', '"Ninguém se banha duas vezes no mesmo rio." — Heráclito'];
  $('death-quote').textContent = quotes[Math.floor(Math.random() * quotes.length)];
};
function respawn() {
  show(null);
  G.hud.show(true);
  G.state = 'playing';
  G.mission.restore();
  G.post.uniforms.uFade.value = 0;
  G.nvg = false;
  G.input.lock();
}
G.onVictory = () => {
  G.state = 'victory';
  G.input.unlock();
  G.hud.show(false);
  const s = G.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
  const rows = [
    ['Tempo', `${mm}:${String(ss).padStart(2, '0')}`], ['Abates', s.kills], ['Headshots', s.headshots], ['Execuções furtivas', s.stealthKills],
    ['Precisão', `${acc}%`], ['Suporte chamado', s.supportUsed], ['Abates do suporte', s.supportKills], ['Abates dos aliados', s.allyKills],
    ['Alarmes acionados', s.alarms], ['Intel', `${s.intel}/3`], ['Mortes', s.deaths], ['Dificuldade', G.settings.diff.toUpperCase()],
  ];
  $('victory-stats').innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  show('victory');
};

// ---------- capítulos (pular para trechos) ----------
const CHAPTERS = [
  ['perimeter', 'Perímetro', 'Infiltração noturna, holofotes', V3(-200, 40, 186), 0, {}],
  ['yard', 'Subestação — J1', 'Furtividade no escuro, NVG', V3(-236, 0, 97), 0.1, {}],
  ['powerhouse', 'Casa de máquinas', 'Alarme, turbina, desabamento', V3(-160, 0, 40), 0.6, { jammer1: true }],
  ['crest', 'Crista — J2', 'Combate aberto, MG, escudos', V3(-104, 0, -18), -Math.PI / 2, { jammer1: true, phAlarm: true, phDoorOpen: true, craneFallen: true }],
  ['tower', 'Torre das comportas — J3', 'Vertical, atiradores', V3(-4, 0, -2), -Math.PI / 2, { jammer1: true, jammer2: true, phAlarm: true, phDoorOpen: true, craneFallen: true }],
  ['gallery', 'Galeria inundando', 'Elevador, água subindo, CQB', V3(40, -22, -5), -Math.PI / 2, { jammer1: true, jammer2: true, jammer3: true, phAlarm: true, phDoorOpen: true, craneFallen: true, bridgeBroken: true, gatesOpen: true, elevatorDown: true }],
  ['barracks', 'Alojamentos', 'Margem leste', V3(97, 0, 8), -Math.PI / 2, { jammer1: true, jammer2: true, jammer3: true, phAlarm: true, phDoorOpen: true, craneFallen: true, bridgeBroken: true, gatesOpen: true, elevatorDown: true, floodLevel: -19.6 }],
  ['defense', 'Defesa da sala de controle', 'Ondas, apagão, técnica', V3(130, 0, -10), Math.PI, { jammer1: true, jammer2: true, jammer3: true, phAlarm: true, phDoorOpen: true, craneFallen: true, bridgeBroken: true, gatesOpen: true, elevatorDown: true, floodLevel: -19.6 }],
  ['extract', 'Extração', 'Corrida até o Corvo-1', V3(132, 0, -6), -Math.PI / 2, { jammer1: true, jammer2: true, jammer3: true, phAlarm: true, phDoorOpen: true, craneFallen: true, bridgeBroken: true, gatesLocked: true, elevatorDown: true, floodLevel: -19.6 }],
];
function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
G.startMission = (id) => startMission(id);
// depuração: avança a simulação sem depender do requestAnimationFrame
G.simulate = (seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) { if (G.state === 'playing' || G.state === 'dead') update(dt); G.input.endFrame(); } render(); };
function jumpTo(id) {
  const c = CHAPTERS.find((c) => c[0] === id);
  const M = G.mission;
  const idx = M.steps.findIndex((s) => s.id === id);
  const flags = c[5];
  const W = G.weapons, S = G.support;
  W.reset();
  if (idx >= 3) { W.slots.primary = 'KR7'; }
  if (flags.jammer1) S.unlock('drone');
  if (flags.jammer2) S.unlock('mortar');
  if (flags.jammer3) S.unlock('sniper');
  S.selected = 'drone';
  G.vm.set(W.id);
  const p = c[3].clone();
  p.y = G.physics.groundHeight(p.x, p.z, p.y + 2, 0.2);
  G.stats.jammers = [flags.jammer1, flags.jammer2, flags.jammer3].filter(Boolean).length;
  M.checkpoint = { step: idx, pos: p, yaw: c[4], weapons: W.snapshot(), support: S.snapshot(), flags, storm: idx >= 5 ? 0.9 : idx >= 3 ? 0.75 : 0.6, intel: G.level.intel.map(() => false), crates: G.level.ammoCrates.map(() => false) };
  if (idx >= 2) M.ensureCrashSite();
  M.restore();
  G.hud.setObjectiveSub(`Bloqueadores ${G.stats.jammers}/3`);
}

// ---------- menus ----------
function setupUiSounds() {
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && G.audio.ctx) G.audio.ui(b.id === 'btn-go' ? 'ui_start' : 'ui_click'); }, true);
  document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && b !== G._hoverBtn) { G._hoverBtn = b; G.audio.ctx && G.audio.ui('ui_hover'); } else if (!b) G._hoverBtn = null; });
}
function setupMenus() {
  setupUiSounds();
  $('btn-start').onclick = () => { show('briefing'); drawBriefingMap(); };
  $('btn-go').onclick = () => startMission();
  $('btn-chapters').onclick = () => { renderChapters(); show('chapters'); };
  $('btn-controls').onclick = () => show('controls');
  $('btn-settings').onclick = () => { fillSettings(); show('settings'); G._settingsFrom = 'title'; };
  $('btn-resume').onclick = resume;
  $('btn-p-settings').onclick = () => { fillSettings(); show('settings'); G._settingsFrom = 'pause'; };
  $('btn-p-controls').onclick = () => { show('controls'); G._controlsFrom = 'pause'; };
  $('btn-p-restart').onclick = () => { show(null); G.state = 'playing'; G.audio.ctx && G.audio.ctx.resume(); G.mission.restore(); G.input.lock(); };
  $('btn-p-quit').onclick = () => { G.state = 'title'; G.hud.show(false); G.director.clearAll(); G.dialog.clear(); show('title'); };
  $('btn-respawn').onclick = respawn;
  $('btn-again').onclick = () => { show('title'); G.state = 'title'; };
  for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => {
    const from = b.closest('section').id === 'settings' ? G._settingsFrom : G._controlsFrom;
    if (G.state === 'paused' && from === 'pause') show('pause'); else show('title');
    G._controlsFrom = null;
  };
  $('settings-form').addEventListener('input', readSettings);
  addEventListener('keydown', (e) => {
    if (G.state === 'dead' && G.deadT > 1.2 && (e.code === 'Space' || e.code === 'Enter')) respawn();
    if (G.state === 'paused' && e.code === 'Escape') { /* o navegador já soltou o ponteiro */ }
  });
}
function renderChapters() {
  $('chapter-list').innerHTML = CHAPTERS.map((c, i) => `<button class="chapter" data-ch="${c[0]}" style="--img:url(./assets/ui/ch/ch_${c[0]}.jpg)"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="t">${c[1]}</span><span class="d">${c[2]}</span></button>`).join('');
  for (const b of document.querySelectorAll('.chapter')) b.onclick = () => startMission(b.dataset.ch);
}
// qualidade gráfica: alta = bloom + SSAO; média = bloom; baixa = sem pós-efeitos pesados
function applyQuality() {
  if (!G.post) return;
  const q = G.settings.quality || 'alta';
  G.post.aoEnabled = q === 'alta'; G.post.bloomEnabled = q !== 'baixa';
}
function fillSettings() {
  const s = G.settings;
  $('set-sens').value = s.sens; $('set-fov').value = s.fov; $('set-master').value = s.master; $('set-music').value = s.music;
  $('set-tts').checked = s.tts; $('set-diff').value = s.diff; $('set-scale').value = s.scale; $('set-shadows').checked = s.shadows; $('set-invert').checked = s.invertY; $('set-quality').value = s.quality || 'alta';
  updateSettingLabels();
}
function updateSettingLabels() {
  $('lbl-sens').textContent = Number(G.settings.sens).toFixed(2); $('lbl-fov').textContent = G.settings.fov;
  $('lbl-master').textContent = Math.round(G.settings.master * 100) + '%'; $('lbl-music').textContent = Math.round(G.settings.music * 100) + '%';
  $('lbl-scale').textContent = Math.round(G.settings.scale * 100) + '%';
}
function readSettings() {
  const s = G.settings;
  s.sens = +$('set-sens').value; s.fov = +$('set-fov').value; s.master = +$('set-master').value; s.music = +$('set-music').value;
  s.tts = $('set-tts').checked; s.diff = $('set-diff').value; s.invertY = $('set-invert').checked; s.quality = $('set-quality').value;
  applyQuality();
  const sc = +$('set-scale').value, sh = $('set-shadows').checked;
  const needResize = sc !== s.scale;
  s.scale = sc;
  if (sh !== s.shadows) { s.shadows = sh; G.renderer.shadowMap.enabled = sh; G.moon.castShadow = sh; G.scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; }); }
  G.diff = DIFF[s.diff];
  G.audio.vol.master = s.master; G.audio.vol.music = s.music; G.audio.setVolumes(); G.audio.tts = s.tts;
  if (needResize) resize();
  updateSettingLabels();
  saveSettings();
}
function drawBriefingMap() {
  const c = $('brief-map'), g = c.getContext('2d');
  c.width = 560; c.height = 345;
  g.drawImage(G.hud.mapImg, 0, 0, c.width, c.height);
  const s = c.width / 560, tm = (x, z) => [(x + 285) * s, (z + 95) * s];
  g.font = '700 13px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
  for (const j of G.level.jammers) { const [x, y] = tm(j.pos.x, j.pos.z); g.fillStyle = '#ff4a3a'; g.fillRect(x - 4, y - 4, 8, 8); g.fillStyle = '#fff'; g.fillText('J' + j.id, x, y - 8); }
  const lz = G.level.points.lz; const [lx, ly] = tm(lz.x, lz.z); g.fillStyle = '#7fe08a'; g.beginPath(); g.arc(lx, ly, 5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText('LZ', lx, ly - 8);
  const hp = G.level.points.helipad; const [hx, hy] = tm(hp.x, hp.z); g.strokeStyle = '#7fe3e0'; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, 6, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.fillText('EXTRAÇÃO', hx, hy - 10);
  const [cx, cy] = tm(130, -10); g.strokeStyle = '#ffd27a'; g.strokeRect(cx - 9, cy - 7, 18, 14); g.fillStyle = '#ffd27a'; g.fillText('SALA DE CONTROLE', cx, cy + 22);
}

// ---------- loop ----------
let last = 0, fpsAcc = 0, fpsN = 0;
const _v = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
  if (G.multiplayer?.active) G.multiplayer.update(dt);
  else if (G.state === 'title' || G.state === 'briefing' || G.state === 'victory') { attract(dt); G.audio.ctx && G.audio.setMusic(G.state === 'victory' ? 'victory' : 'menu'); }
  else if (G.state === 'playing' || G.state === 'dead') update(dt);
  else if (G.state === 'paused') { /* congelado */ }
  render();
  G.input.endFrame();
}
function attract(dt) {
  G.time += dt;
  const t = G.time * 0.03;
  G.camera.position.set(Math.sin(t) * 40 - 20, 26 + Math.sin(t * 1.7) * 4, 70 + Math.cos(t) * 20);
  G.camera.lookAt(10, -8, -10);
  G.weather.indoor = false;
  G.weather.update(dt);
  G.lights.update(dt, G.time);
  G.level.update(dt, G.time);
  G.fx.update(dt);
  G.post.uniforms.uNVG.value = 0;
  G.post.uniforms.uTime.value = G.time;
}
// escolhe a trilha pelo estado (histerese: combate segura 12 s, tensão 10 s)
function musicMode() {
  const D = G.director, M = G.mission, boss = G.boss;
  if (G.state === 'victory') return 'victory';
  if (G.state === 'dead' && G.deadT > 0.4) return 'death';
  if (G.state === 'title' || G.state === 'briefing' || G.state === 'loading') return 'menu';
  if (boss && boss.alive && !boss.dead && (!boss.intro || boss.intro.impact)) return 'boss';
  const sid = M.step && M.step.id;
  if (sid === 'defense') return 'defense';
  if (sid === 'extract' || sid === 'ending') return 'extract';
  const combat = D.combatLevel;
  if (combat > 0.5) G._combatT = G.time;
  if (G.time - (G._combatT ?? -99) < 12) return 'combat';
  if (combat > 0 || D.anyAware() || D.enemies.some((e) => !e.dead && e.state === 'suspicious')) G._tensionT = G.time;
  if (G.time - (G._tensionT ?? -99) < 10) return 'tension';
  return 'stealth';
}
function update(dt) {
  const I = G.input, P = G.player, W = G.weapons, U = G.post.uniforms;
  G.time += dt;
  if (!G.cinematic && G.state === 'playing') G.stats.time += dt;
  if (G.state === 'dead') {
    G.deadT += dt;
    P.locked = true;
    U.uFade.value = clamp(G.deadT / 1.6, 0, 0.85);
    G.camera.position.y = lerp(G.camera.position.y, P.pos.y + 0.3, dt * 3);
    G.camera.rotation.z = lerp(G.camera.rotation.z, 0.6, dt * 2);
    if (G.deadT > 1.2 && $('death').hidden) { show('death'); G.input.unlock(); G.hud.show(false); }
  }
  // atalhos
  if (I.pressed('KeyN') && !P.dead) { G.nvg = !G.nvg; G.audio.mech(G.nvg ? 'nvgOn' : 'nvgOff'); G.nvgT = 0; }
  if (I.pressed('KeyM')) { $('fullmap').hidden = !$('fullmap').hidden; if (!$('fullmap').hidden) G.hud.drawFullMap(); }
  if (I.released('KeyM') && false) $('fullmap').hidden = true;
  if (!G.cinematic) P.update(dt, I);
  W.update(dt, I);
  G.director.update(dt);
  G.allies.update(dt);
  G.support.update(dt);
  G.mission.update(dt, I);
  G.level.update(dt, G.time);
  const zone = G.zoneAt(P.pos);
  G.weather.indoor = zone.indoor;
  G.weather.update(dt);
  G.lights.update(dt, G.time);
  G.fx.update(dt);
  G.dialog.update(dt);
  // sombra segue o jogador
  G.moon.position.set(P.pos.x - 50, P.pos.y + 110, P.pos.z - 35);
  G.moon.target.position.set(P.pos.x, P.pos.y, P.pos.z);
  // respingos de chuva
  if (!zone.indoor) {
    const n = Math.floor(30 * G.weather.intensity * dt * 60 / 10);
    for (let i = 0; i < n; i++) {
      const x = P.pos.x + rand(-12, 12), z = P.pos.z + rand(-12, 12);
      const y = G.physics.groundHeight(x, z, P.pos.y + 6, 0.05);
      if (y > -1e8 && Math.abs(y - P.pos.y) < 6) G.fx.rainSplash(x, y, z);
    }
  }
  // áudio
  G.audio.listener(G.camera);
  G.audio.setEnv(zone.reverb || 'outdoor');
  G.audio.setRain(G.weather.intensity, zone.indoor);
  const aware = G.director.enemies.some((e) => !e.dead && e.state === 'suspicious');
  const combat = G.director.combatLevel;
  G.audio.setMusic(musicMode());
  G.audio.music.target = G.cinematic ? 0.3 : combat > 0 ? 0.6 + combat * 0.4 : aware ? 0.35 : G.mission.stealth ? 0.08 : 0.2;
  // viewmodel
  G.vm.update(dt, W.vmState(I, G.time));
  const vmL = clamp(P.light * 0.6, 0.3, 1.4) + G.weather.flash * (zone.indoor ? 0.2 : 2.5);
  G.vm.hemi.intensity = (G.vmLight ?? 1.6) * vmL; G.vm.dir.intensity = (G.vmLight ?? 1.6) * 1.4 * vmL;
  // pós-processamento
  G.nvgT = Math.min(1, (G.nvgT || 0) + dt * 3);
  U.uTime.value = G.time;
  U.uNVG.value = G.nvg ? 1 : 0;
  let glare = 0;
  if (G.nvg) {
    glare = G.lights.glareFor(G.camera) + (zone.indoor ? 0 : G.weather.flash * 2.5) + (P.muzzleT > 0 ? P.muzzleLight * 0.8 : 0) + (1 - G.nvgT) * 2;
    for (const fl of G.fx.fxLights) glare += fl.l.intensity / 400;
  }
  U.uGlare.value = lerp(U.uGlare.value, glare, 0.35);
  U.uDamage.value = P.damagePulse;
  U.uLowHealth.value = P.dead ? 0 : clamp((45 - P.hp) / 45, 0, 1);
  U.uSuppress.value = P.suppress;
  U.uFlash.value = clamp(P.flash, 0, 1);
  U.uUnder.value = P.underwater;
  U.uScope.value = W.def.scope && W.adsT > 0.92 ? 1 : 0;
  U.uFocus.value = W.def.scope ? 0 : W.adsT;
  U.uExposure.value = 1.2;
  G.hud.update(dt);
  if (!$('fullmap').hidden) G.hud.drawFullMap();
}
function render() {
  if (G.multiplayer?.active) { G.multiplayer.render(); return; }
  const showVM = (G.state === 'playing' || G.state === 'paused') && !G.cinematic && !G.player.dead;
  G.post.render(G.scene, G.camera, showVM ? G.vm.scene : null, G.vm.camera);
}

boot().catch((e) => { console.error(e); $('load-text').textContent = 'Erro ao iniciar: ' + e.message; });
