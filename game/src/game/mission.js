// Operação MURALHA: roteiro completo, objetivos, encontros, set pieces, reviravolta, inundação,
// defesa em ondas, extração, interações e checkpoints.
import * as THREE from 'three';
import { applyWorldFlags, setFlood, makeBeamMaterial } from '../world/level.js';
import { blobShadow } from '../world/env3d.js';
import { WEAPONS } from '../actors/weapons.js';
import { clamp, lerp, rand, smoothstep } from '../core/utils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- helicóptero procedural ----------
const TRUCK_FIX = { ry: 0, y: 0, z: 0 };
const HELI_FIX = { ry: 0, x: 0, y: -1.9, z: 0 };
function makeHeli(G, opts = {}) {
  const g = new THREE.Group();
  const M = G.level.M;
  const body = new THREE.MeshStandardMaterial({ color: opts.color || 0x2c3126, roughness: 0.55, metalness: 0.3 });
  const GLBH = G.env && G.env.heli;
  const add0 = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const add = (geo, mat, x, y, z) => { const m = add0(geo, mat, x, y, z); if (GLBH) m.visible = false; return m; };   // com o modelo 3D, as peças de caixa ficam ocultas
  if (GLBH) {
    // fuselagem 3D: nariz em -Z como o modelo procedural; ajuste fino de orientação/posição em HELI_FIX
    const hm = new THREE.Mesh(GLBH.geo, GLBH.mat.clone());
    hm.castShadow = true; hm.receiveShadow = true;
    const fix = new THREE.Group(); fix.rotation.y = HELI_FIX.ry; fix.position.set(HELI_FIX.x, HELI_FIX.y, HELI_FIX.z); fix.add(hm); g.add(fix);
    if (opts.color) hm.material.color.setHex(0x9aa090);
  }
  add(new THREE.BoxGeometry(2.4, 2.2, 6), body, 0, 0, 0);
  add(new THREE.BoxGeometry(2.2, 1.6, 2), body, 0, -0.1, -3.6);
  add(new THREE.BoxGeometry(2.0, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x223340, roughness: 0.05, metalness: 0.6, emissive: 0x0a1418 }), 0, 0.3, -4.62);
  const tail = add(new THREE.CylinderGeometry(0.3, 0.5, 7, 8), body, 0, 0.5, 6); tail.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.15, 2, 1.2), body, 0, 1.3, 9.2);
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.12, 0.12, 5), M.metalDark, s * 1.2, -1.6, -0.5); add(new THREE.BoxGeometry(0.1, 0.6, 0.1), M.metalDark, s * 1.2, -1.3, -2); add(new THREE.BoxGeometry(0.1, 0.6, 0.1), M.metalDark, s * 1.2, -1.3, 1); }
  const rotor = new THREE.Group(); rotor.position.set(0, 1.4, 0);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 8), M.black); b.rotation.y = (i * Math.PI) / 2; b.position.set(0, 0, 0); const pivot = new THREE.Group(); pivot.rotation.y = (i * Math.PI) / 2; b.position.z = 4; b.rotation.y = 0; pivot.add(b); rotor.add(pivot); }
  g.add(rotor);
  if (GLBH) {
    rotor.children.forEach((c) => (c.visible = false));       // pás procedurais somem; entra o rotor do modelo (gira com rotor.rotation.y)
    rotor.position.set(0, HELI_FIX.y, 0);
    if (GLBH.rotorGeo) { const rm = new THREE.Mesh(GLBH.rotorGeo, GLBH.mat.clone()); rm.castShadow = true; rotor.add(rm); }
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = GLBH ? HELI_FIX.y + (GLBH.size.y * 0.9) : 1.42; g.add(disc);
  const trotor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.2), M.black); trotor.position.set(0.15, 1.3, 9.4); trotor.visible = !GLBH; g.add(trotor);
  const nav = [];
  for (const [c, x] of [[0xff2010, -1.25], [0x20ff40, 1.25]]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.level.T.soft, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); s.scale.setScalar(0.8); s.position.set(x, 0, -1); g.add(s); nav.push(s); }
  G.scene.add(g);
  return { group: g, rotor, trotor, nav, spin: 1 };
}

export class Mission {
  constructor(G) {
    this.G = G;
    this.flags = {};
    this.timers = [];
    this.stepIdx = 0;
    this.stealth = true;
    this.checkpoint = null;
    this.interactHold = 0;
    this.heli = null;
    this.vehicles = [];
    this.buildSteps();
  }
  // ---------- utilidades ----------
  after(sec, fn) { this.timers.push({ t: this.G.time + sec, fn }); }
  seq(list) { let t = 0; for (const [d, a] of list) { t += d; this.after(t, typeof a === 'function' ? a : () => this.G.dialog.say(a[0], a[1], { priority: a[2] ?? 1 })); } }
  say(s, t, p = 1) { this.G.dialog.say(s, t, { priority: p }); }
  obj(title, text, marker, label) { this.G.hud.setObjective(title, text, marker, label); }
  get step() { return this.steps[this.stepIdx]; }
  spawn(type, pos, o = {}) { return this.G.director.spawn(type, pos, o); }
  next() {
    const s = this.step;
    s.exit && s.exit();
    this.stepIdx++;
    this.stepT = 0;
    const n = this.step;
    if (n.checkpoint) this.saveCheckpoint();
    n.enter && n.enter(false);
  }
  start() {
    this.stepIdx = 0; this.stepT = 0;
    this.flags = {};
    applyWorldFlags(this.G, this.flags);
    this.step.enter(false);
  }
  saveCheckpoint() {
    const G = this.G, p = G.player;
    this.checkpoint = {
      step: this.stepIdx, pos: p.pos.clone(), yaw: p.yaw,
      weapons: G.weapons.snapshot(), support: G.support.snapshot(), flags: JSON.parse(JSON.stringify(this.flags)),
      storm: G.weather.intensity, intel: G.level.intel.map((i) => i.taken), crates: G.level.ammoCrates.map((c) => c.used),
    };
    if (this.stepIdx > 1) G.hud.banner('CHECKPOINT', '', 'cp');
  }
  restore() {
    const G = this.G, cp = this.checkpoint;
    if (!cp) return this.start();
    this.timers = [];
    this.rpgFx = null;
    G.dialog.clear();
    G.director.clearAll();
    G.fx.clear();
    for (const pr of G.weapons.projectiles) G.scene.remove(pr.mesh);
    G.weapons.projectiles = [];
    for (const v of this.vehicles) v.dispose();
    this.vehicles = [];
    if (this.heli && this.stepIdx < 12) { this.heli.group.visible = false; G.audio.stopLoop('heli'); }
    this.flags = JSON.parse(JSON.stringify(cp.flags));
    applyWorldFlags(G, this.flags);
    G.level.intel.forEach((it, i) => { it.taken = cp.intel[i]; it.mesh.visible = !it.taken; });
    G.level.ammoCrates.forEach((c, i) => { c.used = cp.crates[i]; });
    for (const s of G.level.searchlights) s.target = null;
    G.player.reset(cp.pos, cp.yaw);
    G.weapons.reset(cp.weapons); G.vm.set(G.weapons.id);
    G.support.reset(cp.support);
    G.weather.intensity = cp.storm;
    G.allies.placeNear(cp.pos, cp.yaw);
    G.allies.list.forEach((a) => (a.script = null));
    this.stepIdx = cp.step; this.stepT = 0;
    this.interactHold = 0;
    this.step.enter(true);
  }
  onEnemyKilled(e) {}
  // ---------- chefe ----------
  get bossActive() { const b = this.G.boss; return !!(b && b.alive && !b.dead); }
  spawnBoss() {
    const G = this.G;
    if (this.flags.bossDead) return;
    if (!G.boss) { this.after(0.5, () => { if (this.step.id === 'yard') this.spawnBoss(); }); return; }
    this.stealth = false;
    G.boss.startIntro();
    this.obj('COLOSSO MX-9', 'Destrua o robô gigante — mire na cabeça', G.boss.pos, 'ALVO');
  }
  onBossKilled(b) {
    const G = this.G;
    this.flags.bossDead = true;
    this.after(3.5, () => {
      this.say('TROVÃO', 'Caiu! Aquilo era um tanque com pernas... Eco, fôlego e vamos. O bloqueador.', 3);
      this.obj('BLOQUEADOR 1', 'Desative o bloqueador da subestação', G.level.jammers[0].pos, 'J1');
      if (this.step.id === 'yard') this.saveCheckpoint();
    });
  }

  // ---------- interações ----------
  interactables() {
    const G = this.G, L = G.level, out = [];
    const s = this.step;
    for (const j of L.jammers) if (!j.disabled && s.jammer === j.id && !this.bossActive) out.push({ pos: j.pos, r: 2.8, dy: 3.2, label: 'Segure <b>F</b> para desativar o bloqueador', hold: 4, act: () => s.onJammer() });
    for (const it of L.intel) if (!it.taken) out.push({ pos: it.pos, r: 1.6, dy: 1.8, label: `<b>F</b> Recolher intel`, act: () => { it.taken = true; it.mesh.visible = false; G.stats.intel++; G.hud.banner('INTEL RECOLHIDA', it.title, 'intel'); this.showIntel(it); G.audio.mech('pickup'); } });
    for (const c of L.ammoCrates) if (!c.used) out.push({ pos: c.pos, r: 1.6, dy: 1.8, label: '<b>F</b> Reabastecer munição', act: () => { c.used = true; G.weapons.refill(); G.hud.toast('MUNIÇÃO E GRANADAS REABASTECIDAS'); G.audio.mech('pickup'); } });
    for (const p of G.director.pickups) if (p.kind === 'weapon' && p.id !== G.weapons.slots.primary) out.push({ pos: p.pos, r: 1.6, dy: 1.8, label: `<b>F</b> Pegar ${WEAPONS[p.id].name}`, act: () => { const old = G.weapons.slots.primary; G.weapons.pickup(p.id); G.scene.remove(p.mesh); G.director.pickups.splice(G.director.pickups.indexOf(p), 1); G.director.dropWeapon(old, G.player.pos); } });
    if (s.interact) out.push(...s.interact());
    return out;
  }
  updateInteract(dt, input) {
    const G = this.G, p = G.player;
    if (p.dead || p.locked) { G.hud.prompt(null); return; }
    const fwd = G.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bs = 1e9;
    for (const it of this.interactables()) {
      const dh = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
      if (dh > it.r || Math.abs(it.pos.y - p.pos.y) > (it.dy || 2)) continue;
      const to = it.pos.clone().sub(p.eye).normalize();
      const s = dh - to.dot(fwd) * 1.2;
      if (s < bs) { bs = s; best = it; }
    }
    if (!best) { this.interactHold = 0; G.hud.prompt(null); return; }
    if (best.hold) {
      if (input.down('KeyF')) {
        this.interactHold += dt;
        if (this.interactHold >= best.hold) { this.interactHold = 0; best.act(); G.audio.mech('interact'); G.hud.prompt(null); return; }
        if (Math.floor(this.interactHold * 4) !== Math.floor((this.interactHold - dt) * 4)) G.audio.mech('beep');
      } else this.interactHold = Math.max(0, this.interactHold - dt * 2);
      G.hud.prompt(best.label, this.interactHold / best.hold);
    } else {
      G.hud.prompt(best.label);
      if (input.pressed('KeyF')) { best.act(); G.audio.mech('interact'); }
    }
  }
  showIntel(it) {
    const el = document.getElementById('intel');
    el.querySelector('h3').textContent = it.title;
    el.querySelector('p').textContent = it.text;
    el.classList.add('on');
    clearTimeout(this._intelT);
    this._intelT = setTimeout(() => el.classList.remove('on'), 7000);
  }
  disableJammer(id) {
    const G = this.G, j = G.level.jammers.find((x) => x.id === id);
    j.disabled = true; j.light.enabled = false;
    this.flags['jammer' + id] = true;
    G.audio.ui && G.audio.ui('jammer_off');
    G.fx.sparks(j.pos.clone().add(V(0, 0.8, 0)), 40, 1);
    G.audio.stopLoop('jammer' + id);
    G.audio.stinger('good');
    G.stats.jammers++;
    G.hud.setObjectiveSub(`Bloqueadores ${G.stats.jammers}/3`);
  }
  // ---------- passos ----------
  buildSteps() {
    const G = this.G, M = this;
    const L = () => G.level, P = () => G.level.points;
    const pl = () => G.player;
    const allies = () => G.allies;
    const D = () => G.director;
    const inRect = (p, x0, x1, z0, z1) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;

    this.steps = [
      // 0 ---------- INSERÇÃO ----------
      {
        id: 'intro',
        enter() {
          M.stealth = true;
          G.weather.intensity = 0.6;
          const lz = P().lz;
          pl().reset(lz, 0.25);
          G.allies.placeNear(lz, 0.25);
          G.hud.setObjectiveSub('Bloqueadores 0/3');
          M.obj('INSERÇÃO', 'Siga o Trovão até a borda da mata', null);
          // helicópteros (limpa os de uma partida anterior)
          for (const h of [M.h1, M.h2]) if (h) G.scene.remove(h.group);
          if (M.crashSite) { M.crashSite.disabled = true; M.crashLight.enabled = false; M.crashSite = null; }
          M.rocketFx = null;
          G.boss && G.boss.reset();
          M.h1 = makeHeli(G); M.h1.group.position.set(-190, 22, 205); M.h1.group.rotation.y = 0.4;
          M.h2 = makeHeli(G); M.h2.group.position.set(-80, 55, 260);
          M.h2.path = { t: 0, hit: false, crashed: false };
          G.audio.positionalLoop('heli1', M.h1.group.position, 'heli', 1.2);
          G.audio.positionalLoop('heli2', M.h2.group.position, 'heli', 0.8);
          M.seq([
            [1.0, ['CORVO-1', 'Martelo-1 em solo. Boa caçada, pessoal.']],
            [3.0, ['TROVÃO', 'Recebido, Corvo. Martelo-2, posição?']],
            [3.4, () => M.fireRocket()],
            [2.0, ['FAÍSCA', 'Martelo-2 foi atingido! Tá caindo!', 3]],
            [3.2, ['TROVÃO', 'Atalaia, Martelo-2 abatido. Repito, Martelo-2 abatido.', 2]],
            [4.4, ['ATALAIA', '...Ouvido, Martelo. Vocês são tudo o que eu tenho.', 2]],
            [3.6, ['TROVÃO', 'Então vamos fazer valer. Eco, Faísca, comigo. Silêncio até a cerca.', 2]],
            [4.5, ['TROVÃO', 'Chuva é amiga. Esconde passo e engole tiro.', 1]],
            [3.4, () => M.next()],
          ]);
          G.hud.toast('WASD mover · SHIFT correr · C agachar · Z deitar');
        },
        update(dt) {
          // Martelo-1 vai embora
          const h1 = M.h1.group;
          if (M.stepT > 2) { h1.position.addScaledVector(V(0.35, 0.12, 1).normalize(), dt * Math.min(30, (M.stepT - 2) * 10)); }
          if (M.stepT > 14) { h1.visible = false; G.audio.stopLoop('heli1'); }
          G.audio.loops.heli1 && G.audio.loops.heli1.setPos(h1.position);
          M.updateCrashHeli(dt);
        },
      },
      // 1 ---------- PERÍMETRO ----------
      {
        id: 'perimeter', checkpoint: true,
        enter(restored) {
          M.stealth = true;
          if (restored) M.ensureCrashSite();
          M.obj('INFILTRAÇÃO', 'Infiltre o perímetro da usina', P().breach, 'BRECHA');
          D().defineSector('perimeter', { delay: 5, alarmPos: V(-153, 6, 100), onAlarm: () => {
            M.say('TROVÃO', 'Alarme! Fomos vistos! Pro pátio, rápido!', 2);
            D().spawnGroup([{ pos: V(-185, 0, 82) }, { pos: V(-180, 0, 78) }, { pos: V(-190, 0, 84), type: 'rifleman2' }, { pos: V(-175, 0, 85), type: 'rifleman2' }], { squad: 'perimR', sector: 'perimeter', alerted: true, knowPos: pl().pos });
            for (const s of [L().slTowerW, L().slTowerE]) s.target = pl().pos;
          } });
          const sq = { squad: 'per', sector: 'perimeter' };
          M.spawn('rifleman', V(-205, 0, 150), { ...sq, patrol: [V(-205, 0, 150), V(-182, 0, 140), V(-172, 0, 124), V(-195, 0, 127)], flashlight: true });
          M.spawn('rifleman2', V(-210, 0, 154), { ...sq, patrol: [V(-210, 0, 153), V(-187, 0, 143), V(-176, 0, 127), V(-199, 0, 130)] });
          M.spawn('rifleman', V(-212, 6.25, 96), { ...sq, squad: 'perT', perch: true, yaw: 0, searchlight: L().slTowerW, flares: 1 });
          M.spawn('rifleman2', V(-133, 6.25, 96), { ...sq, squad: 'perT', perch: true, yaw: 0, searchlight: L().slTowerE });
          M.spawn('rifleman', V(-150, 0, 103.6), { ...sq, squad: 'gate', yaw: 0.1 });
          M.spawn('rifleman2', V(-157, 0, 103.6), { ...sq, squad: 'gate', yaw: -0.2 });
          M.spawn('rifleman', V(-160, 0, 112), { ...sq, squad: 'gate', patrol: [V(-160, 0, 112), V(-146, 0, 113), V(-147, 0, 120)], flashlight: true });
          M.seq([[4, ['FAÍSCA', 'Brecha na cerca a oeste, perto da mata. Ou a gente bate na porta da frente.']], [5, ['TROVÃO', 'Holofotes nas torres. Fiquem no escuro, abaixados.']]]);
          M.hintT = 0;
        },
        update(dt) {
          if (M.h2 && !M.h2.path.crashed) M.updateCrashHeli(dt);
          M.hintT += dt;
          if (M.hintT > 14 && !M.hint1) { M.hint1 = true; G.hud.toast('Q/E inclinar · V pelas costas = execução silenciosa'); }
          if (pl().pos.z < 98.5 && pl().pos.x > -258) M.next();
        },
      },
      // 2 ---------- SUBESTAÇÃO / J1 ----------
      {
        id: 'yard', checkpoint: true, jammer: 1,
        enter(restored) {
          M.stealth = true;
          if (restored) M.ensureCrashSite();
          M.obj('BLOQUEADOR 1', 'Desative o bloqueador da subestação', L().jammers[0].pos, 'J1');
          G.audio.positionalLoop('jammer1', L().jammers[0].pos, 'jammer', 0.6);
          if (!restored && D().alarmActive('perimeter')) {/* reforços já no pátio */}
          D().defineSector('yard', { delay: 5, alarmPos: V(-179, 3, 72), onAlarm: () => {
            M.say('ATALAIA', 'Martelo, estou captando tráfego de rádio deles. Reforços saindo da casa de máquinas.', 2);
            D().spawnGroup([{ pos: V(-130, 0, 28) }, { pos: V(-133, 0, 29), type: 'rifleman2' }], { squad: 'yardR', sector: 'yard', alerted: true, knowPos: pl().pos });
          } });
          const s = { sector: 'yard' };
          M.spawn('rifleman', V(-235, 0, 57), { ...s, squad: 'ya', patrol: [V(-235, 0, 56), V(-195, 0, 56.5), V(-195, 0, 77), V(-235, 0, 78)], flashlight: true });
          M.spawn('rifleman', V(-178, 0, 92), { ...s, squad: 'yb', patrol: [V(-178, 0, 92), V(-178, 0, 40), V(-158, 0, 38), V(-158, 0, 62)], flashlight: true });
          M.spawn('rifleman', V(-197.5, 0, 64), { ...s, squad: 'yj', yaw: Math.PI / 2 });
          M.spawn('rifleman', V(-244, 5.2, 60), { ...s, squad: 'yh', perch: true, yaw: Math.PI / 2, flares: 2 });
          M.nvgHint = false;
          if (!M.flags.bossDead) M.after(restored ? 0.6 : 1.4, () => { if (M.step.id === 'yard') M.spawnBoss(); });
        },
        update() {
          const z = G.zoneAt(pl().pos);
          if (!M.nvgHint && z && z.dark && !G.nvg) { M.nvgHint = true; M.say('TROVÃO', 'Sem energia no pátio. Óculos, Eco.'); G.hud.toast('N — visão noturna'); }
        },
        onJammer() {
          M.disableJammer(1);
          G.support.unlock('drone');
          G.hud.banner('SUPORTE LIBERADO', 'DRONE DE RECONHECIMENTO — tecla 4, mire e clique', 'sup');
          M.seq([
            [0.8, ['ATALAIA', '...Martelo, estou recebendo vocês. Fraco, mas estou. Drone de reconhecimento disponível.', 2]],
            [5.5, ['FAÍSCA', 'Um já foi. Faltam dois e um banho quente.']],
            [3.5, ['TROVÃO', 'Casa de máquinas, ao norte. A crista fica do outro lado.']],
            [0.5, () => M.next()],
          ]);
        },
      },
      // 3 ---------- CASA DE MÁQUINAS ----------
      {
        id: 'powerhouse', checkpoint: true,
        enter(restored) {
          M.stealth = !M.flags.phAlarm;
          M.obj('CASA DE MÁQUINAS', 'Atravesse a casa de máquinas até a crista', P().phSouthDoor, 'ENTRADA');
          G.audio.positionalLoop('turbine', V(-130, 3, -2), 'turbine', 0.7);
          M.phStage = M.flags.phAlarm ? 1 : 0;
          M.phT = 0;
          const s = { sector: 'ph', squad: 'ph' };
          const al = !!M.flags.phAlarm;
          const k = al ? { alerted: true, knowPos: pl().pos } : {};
          M.spawn('rifleman', V(-140, 0, 11), { ...s, ...k, yaw: Math.PI });
          M.spawn('rifleman2', V(-120, 0, 5), { ...s, ...k, patrol: [V(-120, 0, 5), V(-120, 0, -12)] });
          M.spawn('rifleman', V(-138, 0, -10), { ...s, ...k, yaw: Math.PI });
          M.spawn('rifleman2', V(-122, 0, -15), { ...s, ...k, yaw: 0 });
          M.spawn('rifleman', V(-116, 0, -23), { ...s, ...k, yaw: 0 });
          M.spawn('rifleman2', V(-142, 0, -24), { ...s, ...k, yaw: 0.4 });
          M.spawn('rifleman', V(-148, 6, -2), { ...s, ...k, perch: true, yaw: Math.PI });
          M.spawn('rifleman2', V(-131, 6, -28), { ...s, ...k, perch: true, yaw: 0 });
          M.rpg = M.spawn('rifleman', P().rpgSpot.clone(), { ...s, ...k, perch: true, yaw: Math.PI / 2, tag: 'rpg' });
          M.spawn('heavy', V(-128, 0, -25), { ...s, ...k, yaw: 0 });
          if (M.flags.phDoorOpen) M.phStage = 3;
        },
        update(dt) {
          const p = pl().pos;
          const inside = inRect(p, -150, -110, -30, 25.5);
          if (M.phStage === 0 && (inside || D().alarmActive('ph') || D().aliveIn('ph') < 10)) {
            M.phStage = 1; M.flags.phAlarm = true; M.stealth = false;
            applyWorldFlags(G, M.flags);
            G.audio.positionalLoop('alarm', V(-130, 10, 0), 'alarm', 0.6);
            M.obj('CASA DE MÁQUINAS', 'Abra caminho até a porta leste', P().phExit, 'SAÍDA LESTE');
            M.seq([
              [0.2, ['BARQUEIRO', 'Visitantes. Bem-vindos à minha represa. Meu pai ajudou a levantar estas paredes.', 3]],
              [5.2, ['BARQUEIRO', 'A vila dele está sessenta metros abaixo da água que vocês vieram proteger.', 3]],
              [4.6, ['TROVÃO', 'Ele sabe que a gente está aqui. Acabou o silêncio!', 2]],
            ]);
            for (const e of D().alive((e) => e.squad && e.squad.name === 'ph')) if (!e.inCombat) e.engage(p.clone(), 'heard', true);
            M.after(15, () => { if (M.step.id === 'powerhouse') D().spawnGroup([{ pos: V(-123, 0, -36) }, { pos: V(-120, 0, -38), type: 'rifleman2' }, { pos: V(-126, 0, -38) }, { pos: V(-118, 0, -40), type: 'shield' }], { squad: 'phR', sector: 'ph', alerted: true, knowPos: pl().pos }); });
          }
          if (M.phStage >= 1) M.phT += dt;
          // set piece: RPG na turbina + queda da ponte rolante
          if (M.phStage === 1 && !M.flags.craneFallen && (p.z < 8 && inside || M.phT > 22)) {
            M.phStage = 2;
            M.turbineExplosion();
          }
          // breach
          const nearDoor = p.distanceTo(P().phExit) < 22;
          if (M.phStage >= 1 && M.phStage < 3 && !M.breaching && (D().aliveIn('ph') + D().aliveIn('phR') <= 3 || M.phT > 75) && nearDoor) {
            M.breaching = true;
            M.say('TROVÃO', 'Porta trancada. Faísca!', 2);
            const f = allies().byName['FAÍSCA'];
            f.script = { pos: V(-112, 0, -20), run: true, status: 'Breach', holdFire: true };
            M.after(4.5, () => M.say('FAÍSCA', 'Carga posicionada. Três, dois...', 2));
            M.after(7.5, () => {
              const d = L().doors.powerhouseEast;
              G.weapons.explode(V(-109.5, 1, -20), 'barrel', 'ally');
              M.flags.phDoorOpen = true; applyWorldFlags(G, M.flags);
              f.script = null; M.breaching = false; M.phStage = 3;
              M.obj('CASA DE MÁQUINAS', 'Saia para a crista', P().crestWest, 'CRISTA');
            });
          }
          if (M.phStage === 3 && p.x > -108.5) M.next();
        },
        exit() { G.audio.stopLoop('alarm'); M.breaching = false; },
      },
      // 4 ---------- CRISTA / J2 ----------
      {
        id: 'crest', checkpoint: true, jammer: 2,
        enter(restored) {
          M.stealth = false;
          G.weather.intensity = 0.75;
          M.obj('BLOQUEADOR 2', 'Desative o bloqueador no caminhão da crista', L().jammers[1].pos, 'J2');
          G.audio.positionalLoop('jammer2', L().jammers[1].pos, 'jammer', 0.6);
          const s = { sector: 'crest', alerted: true, knowPos: V(-100, 0, 0) };
          D().spawnGroup([
            { pos: V(-84, 0, -6), squad: 'c1' }, { pos: V(-83, 0, 6.5), squad: 'c1', type: 'rifleman2' }, { pos: V(-70, 0, -2.6), squad: 'c1' },
            { pos: V(-54, 0, 7.6), squad: 'c2', type: 'rifleman2' }, { pos: V(-48, 0, -7), squad: 'c2' }, { pos: V(-40, 0, 4), squad: 'c2', type: 'rifleman2' },
            { pos: V(-12, 0, -4.5), squad: 'c3' }, { pos: V(7, 0, -5.5), squad: 'c3', type: 'rifleman2' }, { pos: V(14, 0, 7), squad: 'c3' }, { pos: V(28, 0, -6), squad: 'c3', type: 'rifleman2' },
            { pos: V(-20.5, 0, 2), type: 'gunner', squad: 'mg', yaw: -Math.PI / 2 },
          ], s);
          L().slCrest.target = null;
          M.crestStage = 0;
          M.seq([[1, ['TROVÃO', 'Crista aberta, cento e quarenta metros de nada. De cobertura em cobertura!', 2]], [5, ['FAÍSCA', 'Ninho de metralhadora no meio! Flanqueia ou explode!']]]);
          G.hud.toast('Drone: tecla 4 → mire (botão direito) → clique');
        },
        update() {
          const p = pl().pos;
          if (M.crestStage === 0 && p.x > -72) {
            M.crestStage = 1;
            D().spawnGroup([{ pos: V(-28, 0, -2), type: 'shield' }, { pos: V(-26, 0, 3.5), type: 'shield' }], { squad: 'csh', sector: 'crest', alerted: true, knowPos: p });
            D().spawnGroup([{ pos: V(-50, 10.4, -37), type: 'sniper', yaw: 2.6 }, { pos: V(20, 10.4, -42), type: 'sniper', yaw: -2.4 }], { squad: 'sn', sector: 'crest', alerted: true, knowPos: p });
          }
          if (M.crestStage === 1 && p.x > -45) {
            M.crestStage = 2;
            D().spawnGroup([{ pos: V(46, 0, 0) }, { pos: V(47, 0, -3), type: 'rifleman2' }, { pos: V(46, 0, 3) }, { pos: V(34, 0, 0), type: 'heavy' }], { squad: 'cR', sector: 'crest', alerted: true, knowPos: p });
            M.say('ATALAIA', 'Movimento a leste da crista. Reforços a caminho de vocês.', 2);
          }
        },
        onJammer() {
          M.disableJammer(2);
          G.support.unlock('mortar');
          G.hud.banner('SUPORTE LIBERADO', 'MORTEIRO — R/roda alterna o suporte no designador', 'sup');
          M.seq([[0.8, ['ATALAIA', 'Dois de três. Morteiros em posição, aguardando suas coordenadas.', 2]], [4.5, ['TROVÃO', 'Último bloqueador no topo da torre das comportas.']], [0.5, () => M.next()]]);
        },
      },
      // 5 ---------- TORRE / J3 ----------
      {
        id: 'tower', checkpoint: true, jammer: 3,
        enter(restored) {
          M.stealth = false;
          M.obj('BLOQUEADOR 3', 'Suba a torre das comportas e desative o bloqueador', L().jammers[2].pos, 'J3');
          G.audio.positionalLoop('jammer3', L().jammers[2].pos, 'jammer', 0.6);
          const k = { sector: 'tower', alerted: true, knowPos: pl().pos };
          D().spawnGroup([
            { pos: V(33, 0, -6), squad: 't1' }, { pos: V(33.5, 0, 6.5), squad: 't1', type: 'rifleman2' },
            { pos: V(40, 12.5, 6), squad: 't2' }, { pos: V(37, 12.5, -1), squad: 't2', type: 'rifleman2' },
            { pos: V(42, 18, -4), squad: 't2', perch: true },
            { pos: V(65, 0, -3), squad: 't3', type: 'rifleman2' }, { pos: V(75, 0, 3), squad: 't3' },
            { pos: V(120, 6.4, -20), type: 'sniper', squad: 'tsn', yaw: -1.7 }, { pos: V(140, 6.4, -18), type: 'sniper', squad: 'tsn', yaw: -1.6 },
          ], k);
          // aliados seguram a base
          allies().byName['TROVÃO'].script = { pos: V(34, 0, 7.5), status: 'Cobrindo a base' };
          allies().byName['FAÍSCA'].script = { pos: V(34, 0, -7.5), status: 'Cobrindo a base' };
          M.say('TROVÃO', 'A gente segura aqui embaixo. Sobe, Eco!', 2);
        },
        update() { if (pl().pos.y > 11) M.atTop = true; },
        onJammer() {
          M.disableJammer(3);
          M.twist();
        },
        exit() { allies().list.forEach((a) => (a.script = null)); },
      },
      // 6 ---------- ELEVADOR ----------
      {
        id: 'elevator', checkpoint: true,
        enter(restored) {
          M.stealth = false;
          G.weather.intensity = 0.9;
          M.obj('REVIRAVOLTA', 'Desça pelo elevador de serviço da torre', P().elevator, 'ELEVADOR');
          allies().list.forEach((a) => (a.script = null));
          if (restored) { M.flags.gatesOpen = true; applyWorldFlags(G, M.flags); M.startSpill(); }
          M.elevStarted = false;
        },
        interact() {
          if (M.elevStarted) return [];
          return [{ pos: P().elevatorPanel, r: 2.6, dy: 2, label: '<b>F</b> Acionar elevador', act: () => M.startElevator() }];
        },
        update() {},
      },
      // 7 ---------- GALERIA INUNDANDO ----------
      {
        id: 'gallery', checkpoint: true,
        enter(restored) {
          M.stealth = false;
          if (restored) { M.startSpill(); }
          M.obj('GALERIA G-2', 'Atravesse a galeria antes que inunde', P().galleryExit, 'SAÍDA');
          M.flood = -22.35;
          setFlood(L(), M.flood);
          const k = { sector: 'gallery', alerted: true, knowPos: V(42, -22, -5) };
          D().spawnGroup([
            { pos: V(55, -22, -4.4), squad: 'g1' }, { pos: V(62.5, -22, -8), squad: 'g1', type: 'rifleman2' }, { pos: V(72, -22, -5.5), squad: 'g1' },
            { pos: V(77.5, -22, -2), squad: 'g2', type: 'shield' }, { pos: V(88, -22, -5), squad: 'g2', type: 'rifleman2' }, { pos: V(96, -22, 3), squad: 'g2' },
          ], k);
          if (!D().pickups.some((p) => p.id === 'MK5') && G.weapons.slots.primary !== 'MK5') D().dropWeapon('MK5', V(46, -22, -5.6));
          M.seq([[0.5, ['ATALAIA', 'Comportas de fundo abertas. A galeria vai inundar. Corram!', 3]], [4, ['FAÍSCA', 'Escopeta no chão! Pega, aqui embaixo é corpo a corpo!']]]);
          G.audio.setEnv('tunnel');
        },
        update(dt) {
          M.flood = Math.min(-19.6, M.flood + dt * 0.034);
          setFlood(L(), M.flood);
          if (Math.random() < dt * 3) G.fx.splash(V(rand(40, 96), M.flood, rand(-6.5, -3.5)), 0.8);
          if (M.flood > -21.3 && !M.floodWarn) { M.floodWarn = true; M.say('FAÍSCA', 'Tá subindo! Tá subindo!', 2); }
          const p = pl().pos;
          if (p.z > 9.5 && p.x > 90 && p.y < -19) M.next();
        },
        exit() { M.floodWarn = false; },
      },
      // 8 ---------- ESCADARIA JUSANTE ----------
      {
        id: 'climb', checkpoint: true,
        enter(restored) {
          M.stealth = false;
          M.flags.floodLevel = -19.6; setFlood(L(), -19.6);
          M.obj('FACE JUSANTE', 'Suba a escadaria até a margem leste', P().stairsTop, 'TOPO');
          D().spawnGroup([{ pos: V(97, 0, -4) }, { pos: V(104, 0, 6), type: 'rifleman2' }, { pos: V(108, 0, -8) }, { pos: V(93, 0, -8), type: 'rifleman2' }], { squad: 'cl', sector: 'east', alerted: true, knowPos: V(97, -22, 20) });
          M.seq([[1, ['CORUJA', 'Três hostis no topo da escada. Mantenham a cabeça baixa. Eu cuido do que der.', 2]], [5, ['TROVÃO', 'Alojamentos à direita, sala de controle depois do pátio.']]]);
        },
        update() { const p = pl().pos; if (p.y > -1.5 && p.z < 12.5 && p.x > 90) M.next(); },
      },
      // 9 ---------- ALOJAMENTOS ----------
      {
        id: 'barracks', checkpoint: true,
        enter() {
          M.stealth = false;
          M.obj('MARGEM LESTE', 'Abra caminho pelos alojamentos', V(112, 0, 27.5), 'ALOJAMENTOS');
          D().spawnGroup([
            { pos: V(118, 0, 22) }, { pos: V(115, 0, 30.5), type: 'rifleman2' }, { pos: V(128, 0, 24.2) },
            { pos: V(134, 0, 30.2), type: 'rifleman2' }, { pos: V(137, 0, 18.5) }, { pos: V(130, 0, 38.5), type: 'shield' },
          ], { squad: 'bar', sector: 'east' });
          M.barStage = 0;
        },
        update() {
          const p = pl().pos;
          if (M.barStage === 0 && p.x > 108) { M.barStage = 1; for (const e of D().alive((e) => e.squad?.name === 'bar')) e.engage(p.clone(), 'heard', true); }
          if ((D().aliveIn('bar') === 0 && M.barStage === 1) || (p.z < 15 && p.x > 113 && M.barStage === 1)) M.next();
        },
      },
      // 10 ---------- SALA DE CONTROLE ----------
      {
        id: 'control', checkpoint: true,
        enter() {
          M.stealth = false;
          M.obj('SALA DE CONTROLE', 'Tome a sala de controle', P().controlDoor, 'SALA');
          D().spawnGroup([
            { pos: V(121, 0, -12) }, { pos: V(126, 0, -6.6), type: 'rifleman2' }, { pos: V(135, 0, -12.6) },
            { pos: V(140, 0, -1.5), type: 'rifleman2' }, { pos: V(137, 0, -18.5) }, { pos: V(124, 0, -18.5), type: 'heavy' },
          ], { squad: 'ctrl', sector: 'east' });
          M.seq([[1.5, ['FAÍSCA', 'Joga uma flash antes de entrar. Eu gosto de surpresa.']]]);
        },
        update() {
          const p = pl().pos;
          if (inRect(p, 105, 160, -30, 16) && !M.ctrlAlert) { M.ctrlAlert = true; for (const e of D().alive((e) => e.squad?.name === 'ctrl')) e.engage(p.clone(), 'heard', true); }
          if (D().aliveIn('ctrl') === 0) { M.ctrlAlert = false; M.next(); }
        },
      },
      // 11 ---------- DEFESA ----------
      {
        id: 'defense', checkpoint: true,
        enter() {
          M.stealth = false;
          G.weather.intensity = 1.0;
          M.obj('SALA DE CONTROLE', 'Conecte o equipamento da Faísca ao console mestre', P().masterConsole, 'CONSOLE');
          M.override = -1; M.defT = 0; M.waveIdx = 0;
          allies().byName['FAÍSCA'].script = null;
          M.say('TROVÃO', 'Sala limpa. Eco, pluga o equipamento da Faísca no console mestre.', 2);
        },
        interact() {
          const out = [];
          if (M.override < 0) out.push({ pos: P().masterConsole, r: 2.4, dy: 2, label: 'Segure <b>F</b> para conectar o override', hold: 2, act: () => M.startOverride() });
          return out;
        },
        update(dt) {
          if (M.override < 0) return;
          M.defT += dt;
          M.override = Math.min(100, M.override + dt * (100 / 150));
          G.hud.setObjectiveSub(`Override das comportas: ${Math.floor(M.override)}%`);
          const waves = M.waves;
          while (M.waveIdx < waves.length && M.defT >= waves[M.waveIdx][0]) { waves[M.waveIdx][1](); M.waveIdx++; }
          if (M.override >= 100 && !M.flags.gatesLocked) {
            M.flags.gatesLocked = true; M.flags.gatesOpen = false;
            for (const g of L().dyn.gates) g.open = 0;
            L().dyn.spill.on = 0;
            G.audio.stopLoop('spill');
            G.audio.stinger('good');
            G.hud.setObjectiveSub('Comportas travadas');
            M.seq([[0.3, ['FAÍSCA', 'Comportas... travadas! TRAVADAS!', 3]], [3, ['ATALAIA', 'Confirmo, comportas fechando. Corvo-1, buscar Martelo no heliponto.', 3]], [4.5, () => M.next()]]);
          }
        },
        exit() { allies().list.forEach((a) => (a.script = null)); },
      },
      // 12 ---------- EXTRAÇÃO ----------
      {
        id: 'extract', checkpoint: true,
        enter() {
          M.stealth = false;
          M.obj('EXTRAÇÃO', 'Vá para o heliponto e embarque no Corvo-1', P().helipad, 'CORVO-1');
          M.flags.gatesLocked = true;
          M.startExtraction();
        },
        interact() {
          if (!M.heliLanded) return [];
          const door = M.heli.group.position.clone().add(V(0, -1.5, 0));
          return [{ pos: door, r: 4.5, dy: 3, label: '<b>F</b> Embarcar', act: () => M.ending() }];
        },
        update(dt) { M.updateExtraction(dt); },
      },
      // 13 ---------- FINAL ----------
      { id: 'ending', enter() {}, update(dt) { M.updateEnding(dt); } },
    ];
    this.waves = [
      [4, () => {
        M.say('TROVÃO', 'Contato ao sul! Eles vêm com tudo!', 2);
        D().spawnGroup([{ pos: V(155, 0, 95) }, { pos: V(152, 0, 100), type: 'rifleman2' }, { pos: V(158, 0, 104) }], { squad: 'w1a', alerted: true, goal: V(130, 0, 10), state: 'assault' });
        D().spawnGroup([{ pos: V(100, 0, -6) }, { pos: V(99, 0, -2), type: 'rifleman2' }, { pos: V(101, 0, 2) }], { squad: 'w1b', alerted: true, goal: V(110, 0, -10) });
        M.makeAssault(['w1a', 'w1b']);
      }],
      [45, () => {
        M.say('FAÍSCA', 'Barcos no cais norte! Escudos! Usa a flash!', 2);
        D().spawnGroup([{ pos: V(124, 0, -50), type: 'shield' }, { pos: V(128, 0, -52), type: 'shield' }, { pos: V(122, 0, -54) }, { pos: V(130, 0, -55), type: 'rifleman2' }, { pos: V(126, 0, -57) }], { squad: 'w2a', alerted: true, goal: V(130, 0, -30) });
        D().spawnGroup([{ pos: V(154, 0, 110), type: 'heavy' }, { pos: V(150, 0, 112) }], { squad: 'w2b', alerted: true, goal: V(135, 0, 8) });
        M.makeAssault(['w2a', 'w2b']);
      }],
      [80, () => {
        M.flags.blackout = true; applyWorldFlags(G, M.flags);
        M.say('FAÍSCA', 'Cortaram a energia! NVG! O override tá na bateria!', 3);
        G.hud.toast('N — visão noturna');
      }],
      [92, () => {
        M.say('TROVÃO', 'Técnica entrando pela estrada sul! Tem um lança-foguetes no armário, derruba!', 3);
        M.spawnTechnical();
        D().spawnGroup([{ pos: V(158, 0, 118) }, { pos: V(152, 0, 122), type: 'rifleman2' }, { pos: V(156, 0, 126) }, { pos: V(102, 0, -4), type: 'rifleman2' }, { pos: V(100, 0, 3) }, { pos: V(150, 0, 128), type: 'heavy' }], { squad: 'w3', alerted: true, goal: V(130, 0, 10) });
        M.makeAssault(['w3']);
      }],
      [125, () => {
        D().spawnGroup([{ pos: V(125, 0, -54), type: 'rifleman2' }, { pos: V(122, 0, -56) }, { pos: V(156, 0, 110), type: 'shield' }, { pos: V(152, 0, 115) }], { squad: 'w4', alerted: true, goal: V(130, 0, -5) });
        M.makeAssault(['w4']);
        M.say('ATALAIA', 'Corvo-1 a três minutos. Segurem!', 2);
      }],
    ];
  }
  makeAssault(squads) {
    const G = this.G;
    for (const e of G.director.enemies) if (!e.dead && squads.includes(e.squad?.name) && e.goal) { e.state = 'assault'; e.lastKnown.copy(G.player.pos); }
  }

  // ---------- set pieces ----------
  fireRocket() {
    const G = this.G, h = this.h2.group;
    const from = V(-60, 3, 5);
    const to = h.position.clone();
    const dir = to.clone().sub(from); const dist = dir.length(); dir.normalize();
    this.rocketFx = { from, dir, dist, t: 0 };
    G.audio.shot('RPL2', from);
  }
  updateCrashHeli(dt) {
    const G = this.G, h = this.h2;
    if (!h) return;
    const g = h.group;
    h.rotor.rotation.y += dt * 30;
    // foguete
    if (this.rocketFx) {
      const r = this.rocketFx;
      r.t += dt;
      const d = r.t * 140;
      const p = r.from.clone().addScaledVector(r.dir, Math.min(d, r.dist));
      for (let i = 0; i < 3; i++) G.fx.add.spawn(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.3, 1.2, 1, 0.6, 0.25, 1, 0, 1, 1);
      G.fx.norm.spawn(p.x, p.y, p.z, 0, 0.5, 0, 4, 1.5, 0.4, 0.4, 0.4, 0.5, -0.1, 0.3, 0.8);
      if (d >= r.dist) { this.rocketFx = null; h.path.hit = true; h.path.hitT = 0; G.fx.explosion(g.position.clone(), 1.6); G.audio.explosion(g.position.clone(), 1.5); this.crashFire = G.fx.addEmitter({ kind: 'fire', pos: g.position, scale: 1.2 }); }
    }
    if (!h.path.hit) {
      g.position.add(V(-0.75, -0.02, -0.66).normalize().multiplyScalar(dt * 28));
      g.rotation.y = Math.atan2(0.75, 0.66);
    } else if (!h.path.crashed) {
      h.path.hitT += dt;
      g.rotation.y += dt * 4;
      g.rotation.z = Math.sin(h.path.hitT * 3) * 0.3;
      const target = this.G.level.points.crash;
      const to = target.clone().sub(g.position);
      g.position.addScaledVector(to.normalize(), dt * 30);
      g.position.y -= dt * 6;
      if (g.position.distanceTo(target) < 6 || g.position.y < target.y + 2) {
        h.path.crashed = true;
        g.position.copy(target).add(V(0, 1, 0));
        g.rotation.set(0.3, 1, 1.2);
        G.fx.explosion(g.position.clone(), 2);
        G.audio.explosion(g.position.clone(), 2);
        G.audio.stopLoop('heli2');
        this.ensureCrashSite();
      }
    }
    G.audio.loops.heli2 && G.audio.loops.heli2.setPos(g.position);
  }
  ensureCrashSite() {
    const G = this.G;
    if (this.crashSite) return;
    const p = G.level.points.crash.clone();
    if (this.crashFire) this.crashFire.disabled = true;
    this.crashSite = G.fx.addEmitter({ kind: 'fire', pos: p.clone().add(V(0, 0.5, 0)), scale: 2.2, persistent: true });
    this.crashLight = { pos: p.clone().add(V(0, 4, 0)), color: new THREE.Color(0xff7a30), intensity: 600, range: 70, enabled: true, flicker: 0.4, pulse: 0, priority: 2, phase: 0, stealth: false, glow: null };
    G.level.vlights.push(this.crashLight);
    if (this.h2) { this.h2.group.position.copy(p).add(V(0, 1, 0)); this.h2.group.rotation.set(0.3, 1, 1.2); this.h2.path = { hit: true, crashed: true }; }
    else { this.h2 = makeHeli(this.G); this.h2.group.position.copy(p).add(V(0, 1, 0)); this.h2.group.rotation.set(0.3, 1, 1.2); this.h2.path = { hit: true, crashed: true }; }
  }
  turbineExplosion() {
    const G = this.G, L = G.level;
    const rpg = this.rpg && !this.rpg.dead ? this.rpg.pos.clone().add(V(0, 1.5, 0)) : V(-147, 7.5, -18);
    const target = V(-130, 4.5, -2);
    this.say('FAÍSCA', 'RPG! Na turbina! Pro chão!', 3);
    const dir = target.clone().sub(rpg); const dist = dir.length(); dir.normalize();
    G.audio.shot('RPL2', rpg);
    // foguete animado no relógio do jogo (pausa junto)
    this.rpgFx = { t: 0, update: (dt) => {
      const r = this.rpgFx;
      r.t += dt;
      const p = rpg.clone().addScaledVector(dir, Math.min(dist, r.t * 70));
      for (let i = 0; i < 2; i++) G.fx.add.spawn(p.x, p.y, p.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), 0.25, 0.8, 1, 0.6, 0.2, 1, 0, 1, 1);
      G.fx.norm.spawn(p.x, p.y, p.z, 0, 0.4, 0, 2.5, 0.8, 0.45, 0.45, 0.45, 0.5, -0.1, 0.5, 0.8);
      if (r.t * 70 < dist) return;
      this.rpgFx = null;
      {
        G.weapons.explode(target, 'rocket', 'enemy');
        G.fx.explosion(target.clone().add(V(0, 1, 0)), 2);
        L.dyn.turbines[1].speed = 0;
        this.turbFire = G.fx.addEmitter({ kind: 'fire', pos: V(-130, 4.2, -2), scale: 1.4 });
        G.fx.addEmitter({ kind: 'steam', pos: V(-127, 5, -2), dx: 1 });
        G.fx.addEmitter({ kind: 'sparkler', pos: V(-130, 6, -2) });
        L.vlights.push({ pos: V(-130, 6, -2), color: new THREE.Color(0xff7a30), intensity: 220, range: 25, enabled: true, flicker: 0.5, pulse: 0, priority: 3, phase: 0, stealth: true, glow: null });
        G.audio.positionalLoop('fireT', V(-130, 4, -2), 'fire', 0.6);
        G.player.shake(1);
        // ponte rolante cede
        this.after(0.9, () => {
          const cb = L.dyn.craneBeam;
          cb.falling = true; cb.t = 0;
          G.audio.sfx('crane_fall', V(-130, 8, -9), { vol: 1.3, ref: 18 });
          cb.onLand = () => {
            this.flags.craneFallen = true;
            if (!cb.col) cb.col = G.physics.add(-148, 0, -10, -112, 1.6, -8, { mat: 'metal', cover: 'low' });
            G.fx.explosion(V(-130, 0.5, -9), 0.8);
            for (let i = 0; i < 40; i++) G.fx.norm.spawn(rand(-148, -112), 0.5, rand(-11, -7), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(2, 4), rand(1, 2.5), 0.35, 0.33, 0.3, 0.6, -0.1, 0.6, 1);
            G.audio.explosion(V(-130, 1, -9), 1.2);
            G.player.shake(1.2);
            for (const e of G.director.enemies) if (!e.dead && e.pos.x > -148 && e.pos.x < -112 && Math.abs(e.pos.z + 9) < 1.6 && e.pos.y < 2) e.takeDamage(999, 'body', V(0, -1, 0), 'other');
            G.director.buildCover();
          };
          G.audio.explosion(V(-130, 15, -9), 0.6);
        });
      }
    } };
  }
  twist() {
    const G = this.G, L = G.level;
    this.seq([
      [0.5, ['ATALAIA', 'Comunicação total. Bom trabalho, Mar... espera. Tem um sinal saindo do bloqueador.', 3]],
      [5.6, ['ATALAIA', 'Era um gatilho!', 3]],
      [1.2, ['BARQUEIRO', 'Vocês desligaram meu bloqueador. Eu desligo a represa.', 3]],
      [3.6, () => {
        // ponte explode
        for (const [x, z, d] of [[63, 0, 0], [68, -3, 0.25], [72, 2, 0.5], [77, 0, 0.8]]) this.after(d, () => { G.fx.explosion(V(x, 0.5, z), 2); G.audio.explosion(V(x, 0, z), 1.8); });
        this.flags.bridgeBroken = true; this.flags.gatesOpen = true;
        applyWorldFlags(G, this.flags);
        for (const e of G.director.enemies) if (!e.dead && e.pos.x > 59 && e.pos.x < 81 && e.pos.y > -2) e.takeDamage(999, 'body', V(0, -1, 0), 'other');
        for (let i = 0; i < 60; i++) G.fx.norm.spawn(rand(60, 80), 0, rand(-6, 6), rand(-3, 3), rand(2, 8), rand(-3, 3), rand(1.5, 3), rand(0.3, 0.9), 0.4, 0.4, 0.38, 1, 12, 0.3);
        G.player.shake(1.5);
        this.startSpill();
        G.weather.intensity = 0.9;
        G.weather.strike(true);
      }],
      [2.5, ['TROVÃO', 'A ponte já era! As comportas estão abrindo!', 3]],
      [3.2, () => { G.support.unlock('sniper'); G.hud.banner('SUPORTE LIBERADO', 'OVERWATCH — CORUJA (marque o alvo com o designador)', 'sup'); }],
      [0.5, ['CORUJA', 'Coruja em posição na crista leste. Overwatch ativo. Me deem alvos.', 2]],
      [4.6, ['TROVÃO', 'Elevador de serviço, dentro da torre. Desce pela galeria, Eco!', 2]],
      [0.5, () => this.next()],
    ]);
  }
  startSpill() {
    const G = this.G, L = G.level;
    L.dyn.spill.on = 1;
    for (const g of L.dyn.gates) g.open = 1;
    G.audio.positionalLoop('spill', V(70, -15, 12), 'spill', 1.5);
    if (!this.mist) { this.mist = G.fx.addEmitter({ kind: 'mist', pos: V(70, -21.5, 30), w: 18, persistent: true }); this.mist2 = G.fx.addEmitter({ kind: 'mist', pos: V(70, -60, 38), w: 18, persistent: true }); }
  }
  startElevator() {
    const G = this.G, L = G.level, el = L.dyn.elevator;
    const p = G.player.pos;
    if (!(p.x > 38.2 && p.x < 41.8 && p.z > -6.8 && p.z < -3.2)) { G.hud.toast('Entre no elevador primeiro'); return; }
    this.elevStarted = true;
    G.allies.list.forEach((a, i) => { const q = V(i ? 41 : 39, el.y, i ? -6.1 : -6.1); a.place(q, 0); a.script = { pos: q, status: 'No elevador', holdFire: true }; });
    el.speed = 3.4; el.moving = true;
    G.audio.sfx('elevator', V(40, 0, -5), { vol: 0.9 });
    G.audio.positionalLoop('elev', V(40, 0, -5), 'engine', 0.5);
    this.say('FAÍSCA', 'Eu odeio elevador. Eu odeio água. Hoje é meu dia.', 2);
    this.after(4.5, () => this.say('TROVÃO', 'Armas prontas. Pode ter comitê de recepção lá embaixo.', 2));
    el.onArrive = () => {
      this.flags.elevatorDown = true;
      G.audio.stopLoop('elev');
      G.allies.list.forEach((a) => (a.script = null));
      this.next();
    };
  }
  startOverride() {
    const G = this.G;
    this.override = 0; this.defT = 0; this.waveIdx = 0;
    const f = G.allies.byName['FAÍSCA'];
    f.script = { pos: V(134, 0, -18.8), status: 'Override', holdFire: false, crouch: true };
    G.allies.byName['TROVÃO'].script = { pos: V(120, 0, 0.5), status: 'Segurando sul' };
    this.obj('DEFESA', 'Defenda a sala enquanto a Faísca trava as comportas', null);
    this.say('FAÍSCA', 'Tô no sistema. Sobrescrevendo... isso leva uns minutos. Me mantém viva!', 3);
    G.hud.toast('Armário de armas: lança-foguetes RPL-2');
  }
  spawnTechnical() {
    const G = this.G, L = G.level;
    const g = new THREE.Group();
    const M = L.M;
    const GLBT = G.env && G.env.truck;
    const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M[mat] || mat); m.position.set(x, y, z); m.castShadow = true; m.visible = !GLBT; g.add(m); return m; };
    if (GLBT) {
      const tm = new THREE.Mesh(GLBT.geo, GLBT.mat.clone()); tm.castShadow = true; tm.receiveShadow = true;
      const fix = new THREE.Group(); fix.rotation.y = TRUCK_FIX.ry; fix.position.set(0, TRUCK_FIX.y, TRUCK_FIX.z); fix.add(tm); g.add(fix); g.add(blobShadow(L.T, 3.0, 6.4, 0.5));
    }
    add(2.1, 0.9, 5, 0, 0.9, 0, 'olive'); add(2.0, 1.2, 1.8, 0, 1.9, 1.3, 'oliveDark'); add(1.9, 0.5, 0.05, 0, 2.1, 2.22, 'glass');
    add(0.15, 0.15, 1.4, 0, 2.6, -1.2, 'black'); add(0.5, 0.5, 0.6, 0, 2.3, -1.6, 'metalDark');
    for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -1.5], [1, -1.5]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), M.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); w.visible = !GLBT; g.add(w); }
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.T.soft, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); head.scale.setScalar(2); head.position.set(0, 1.2, 2.6); g.add(head);
    G.scene.add(g);
    const path = [V(155, 0, 140), V(155, 0, 60), V(150, 0, 30)];
    g.position.copy(path[0]);
    const col = G.physics.add(0, 0, 0, 1, 1, 1, { mat: 'metal', cover: 'high' });
    const gunner = G.director.spawn('gunner', path[0].clone().add(V(0, 1.4, 0)), { squad: 'tech', alerted: true, knowPos: G.player.pos, y: 1.4 });
    gunner.static = true;
    const veh = {
      g, path, idx: 1, hp: 600, dead: false, col, gunner,
      light: { pos: V(), color: new THREE.Color(0xfff0c0), intensity: 200, range: 30, enabled: true, flicker: 0, pulse: 0, priority: 2, phase: 0, stealth: true, glow: null },
      update: (dt) => {
        if (veh.dead) return;
        const tgt = veh.path[veh.idx];
        if (tgt) {
          const d = tgt.clone().sub(g.position); d.y = 0;
          const L2 = d.length();
          if (L2 < 1) veh.idx++;
          else { d.normalize(); g.position.addScaledVector(d, Math.min(L2, dt * 9)); g.rotation.y = Math.atan2(d.x, d.z); }
        }
        const p = g.position;
        G.physics.moveTo(col, p.x - 1.6, 0, p.z - 1.6, p.x + 1.6, 2.2, p.z + 1.6);
        if (!gunner.dead) { gunner.body.x = p.x - Math.sin(g.rotation.y) * 1.4; gunner.body.z = p.z - Math.cos(g.rotation.y) * 1.4; gunner.body.y = 1.4; gunner.body.vy = 0; gunner.baseYaw = g.rotation.y; }
        veh.light.pos.copy(p).add(V(Math.sin(g.rotation.y) * 3, 1.2, Math.cos(g.rotation.y) * 3));
        G.audio.loops.tech && G.audio.loops.tech.setPos(p);
      },
      explosion: (pos, radius, dmg, kind) => {
        if (veh.dead) return;
        const d = pos.distanceTo(g.position);
        if (d > radius + 2) return;
        const k = kind === 'rocket' ? 1 : kind === 'mortar' ? 0.9 : kind === 'barrel' ? 0.6 : 0.35;
        veh.hp -= dmg * k * (1 - d / (radius + 2));
        if (veh.hp <= 0) veh.destroy();
      },
      destroy: () => {
        veh.dead = true;
        const p = g.position.clone();
        G.fx.explosion(p.clone().add(V(0, 1, 0)), 2.2); G.audio.explosion(p, 2);
        g.traverse((m) => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.25); } });
        g.rotation.z = 0.15;
        if (!gunner.dead) gunner.takeDamage(999, 'body', V(0, 1, 0), 'player');
        G.fx.addEmitter({ kind: 'fire', pos: p.clone().add(V(0, 1, 0)), scale: 1.3, t: 60 });
        G.audio.stopLoop('tech');
        veh.light.enabled = false;
        this.say('TROVÃO', 'Técnica destruída! Boa!', 2);
        G.stats.vehicles++;
      },
      dispose: () => { G.scene.remove(g); G.physics.remove(col); veh.light.enabled = false; G.audio.stopLoop('tech'); const i = (G.director.vehicles || []).indexOf(veh); if (i >= 0) G.director.vehicles.splice(i, 1); },
    };
    L.vlights.push(veh.light);
    G.audio.positionalLoop('tech', g.position, 'engine', 0.6);
    this.vehicles.push(veh);
    G.director.vehicles = G.director.vehicles || [];
    G.director.vehicles.push(veh);
  }
  startExtraction() {
    const G = this.G;
    if (!this.heli) this.heli = makeHeli(G, { color: 0x262b22 });
    const h = this.heli;
    h.group.visible = true;
    h.group.position.set(260, 60, 120);
    this.heliLanded = false; this.heliT = 0; this.gunT = 0;
    G.audio.positionalLoop('heli', h.group.position, 'heli', 1.4);
    // holofote do helicóptero
    if (!this.heliSL) {
      const T = G.level.T;
      const len = 50, geo = new THREE.ConeGeometry(Math.tan(0.22) * len, len, 20, 1, true);
      geo.translate(0, -len / 2, 0); geo.rotateX(-Math.PI / 2);
      const cone = new THREE.Mesh(geo, makeBeamMaterial(0xdde8ff, 0.25));
      cone.material.uniforms.uLen.value = len;
      G.scene.add(cone);
      const head = new THREE.Group(); G.scene.add(head);
      const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xeef4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); lens.scale.setScalar(2.5); G.scene.add(lens);
      this.heliSL = { pos: V(), yaw: 0, baseYaw: 0, sweep: 0, pitch: -0.8, basePitch: -0.8, speed: 0, phase: 0, angle: 0.22, range: 50, cone, head, lens, enabled: true, intensity: 1200, target: null, color: 0xdde8ff, dir: V(), owner: null };
      G.level.searchlights.push(this.heliSL);
    }
    this.seq([[1, ['CORVO-1', 'Táxi chegou, quem vai? Heliponto, trinta segundos, não esperem convite!', 3]], [5, ['TROVÃO', 'Vai, vai, vai! Pro heliponto!', 2]]]);
    G.director.spawnGroup([{ pos: V(156, 0, 100) }, { pos: V(152, 0, 104), type: 'rifleman2' }, { pos: V(158, 0, 108), type: 'shield' }, { pos: V(150, 0, 112) }, { pos: V(124, 0, -52), type: 'rifleman2' }, { pos: V(128, 0, -54) }], { squad: 'ex', alerted: true, goal: V(165, 0, 0) });
    this.makeAssault(['ex']);
    G.allies.byName['TROVÃO'].script = { pos: V(168, 0.3, 4), status: 'No heliponto', run: true };
    G.allies.byName['FAÍSCA'].script = { pos: V(176, 0.3, 5), status: 'No heliponto', run: true };
  }
  updateExtraction(dt) {
    const G = this.G, h = this.heli, g = h.group;
    this.heliT += dt;
    h.rotor.rotation.y += dt * 28; h.trotor.rotation.x += dt * 40;
    const land = V(173, 2.6, -3);
    if (!this.heliLanded) {
      const to = land.clone().sub(g.position);
      const d = to.length();
      if (d < 0.5) { this.heliLanded = true; this.say('CORVO-1', 'No chão! Embarquem, embarquem!', 3); }
      else { to.normalize(); g.position.addScaledVector(to, Math.min(d, dt * Math.max(4, Math.min(28, d * 0.6)))); g.rotation.y = Math.atan2(-to.x, -to.z) * 0.0 + Math.PI * 0.75; }
    } else g.position.y = land.y + Math.sin(this.heliT * 2) * 0.12;
    G.audio.loops.heli && G.audio.loops.heli.setPos(g.position);
    // holofote
    const sl = this.heliSL; sl.pos.copy(g.position).add(V(0, -0.8, -4)); sl.target = G.player.pos.distanceTo(g.position) > 15 ? G.player.pos : V(160, 0, 40);
    // metralhadora lateral
    this.gunT -= dt;
    if (this.gunT <= 0) {
      this.gunT = 0.08;
      const mz = g.position.clone().add(V(1.4, -0.6, 0));
      const tgt = G.director.alive((e) => e.inCombat).find((e) => e.pos.distanceTo(mz) < 80 && G.physics.los(mz.x, mz.y, mz.z, e.pos.x, e.pos.y + 1.2, e.pos.z));
      if (tgt) {
        const aim = tgt.chestPos().add(V(rand(-1.5, 1.5), rand(-1, 1), rand(-1.5, 1.5)));
        G.fx.tracer(mz, aim, 0xffa040, 400, 6);
        G.audio.shot('MINIGUN', mz, { vol: 0.6 });
        if (Math.random() < 0.08) { tgt.takeDamage(40, 'body', aim.clone().sub(mz).normalize(), 'other', aim); }
        G.fx.impact(aim, V(0, 1, 0), 'concrete');
      }
    }
  }
  ending() {
    const G = this.G;
    this.next();
    G.cinematic = true;
    G.player.locked = true;
    G.director.ignorePlayer = true;
    this.endT = 0;
    G.hud.setObjective('MISSÃO', 'Extração', null);
    G.allies.list.forEach((a) => { a.model.root.visible = false; });
    this.seq([
      [2.5, ['CORUJA', 'Tenho o Barqueiro. Barco, quinhentos metros, no reservatório.', 3]],
      [4.6, ['ATALAIA', '...Negativo, Coruja. Queremos ele vivo.', 3]],
      [3.4, ['CORUJA', 'Entendido.', 3]],
      [2.2, ['BARQUEIRO', 'Vocês salvaram as cidades esta noite. Mas o vale lembra.', 3]],
      [4.8, ['ECO', '...A gente também.', 3]],
      [3.6, () => G.onVictory()],
    ]);
  }
  updateEnding(dt) {
    const G = this.G, h = this.heli, g = h.group;
    this.endT += dt;
    h.rotor.rotation.y += dt * 30;
    const t = this.endT;
    g.position.y += dt * Math.min(6, t * 2);
    g.position.x -= dt * Math.min(18, t * 3);
    g.rotation.y = Math.PI * 0.75 + Math.min(0.9, t * 0.1);
    const cam = G.camera;
    cam.position.copy(g.position).add(V(1.5, -0.4, 0.5));
    const look = V(20, -10, 0);
    cam.lookAt(look);
    G.player.pitch = cam.rotation.x; G.player.yaw = cam.rotation.y;
    G.audio.loops.heli && G.audio.loops.heli.setPos(g.position);
    G.post.uniforms.uFade.value = clamp((t - 22) / 3, 0, 1);
  }
  update(dt, input) {
    const G = this.G;
    this.stepT = (this.stepT || 0) + dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { if (G.time >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); } }
    this.step.update && this.step.update(dt);
    if (this.rpgFx) this.rpgFx.update(dt);
    for (const v of this.vehicles) v.update(dt);
    if (this.h2 && this.stepIdx <= 1 && !this.h2.path?.crashed) {} // atualizado no passo
    if (this.crashSite) this.crashLight.intensity = 500 + Math.random() * 200;
    this.updateInteract(dt, input);
  }
}
