// IA de inimigo: máquina de estados (patrulha, suspeita, combate em cobertura, flanco, supressão,
// recuo, busca), percepção por visão (luz do jogador), audição e supressão. Tipos especiais.
import * as THREE from 'three';
import { createSoldier } from '../actors/soldier.js';
import { clamp, lerp, rand, randInt, pick, angleWrap, dampAngle, raySphere, rayCylinder } from '../core/utils.js';

export const ETYPES = {
  rifleman: { hp: 100, style: 'enemy', gun: 'AK', dmg: 9, rpm: 520, burst: [3, 6], pause: [0.45, 1.1], acc: 0.24, sight: 70, run: 4.3, walk: 1.5, pref: [10, 32], mag: 30, reloadT: 2.4, drop: 'KR7' },
  rifleman2: { hp: 100, style: 'enemy2', gun: 'AK', dmg: 9, rpm: 520, burst: [3, 7], pause: [0.45, 1.1], acc: 0.22, sight: 70, run: 4.3, walk: 1.5, pref: [10, 32], mag: 30, reloadT: 2.4, drop: 'KR7' },
  sniper: { hp: 90, style: 'sniper', gun: 'SNIPER', dmg: 35, rpm: 30, burst: [1, 1], pause: [3.0, 4.0], acc: 0.8, sight: 150, run: 3.5, walk: 1.4, pref: [40, 120], mag: 5, reloadT: 3, static: true, aimTime: 3.0, drop: 'VK12' },
  heavy: { hp: 300, armor: 0.5, style: 'heavy', gun: 'LMG', dmg: 7, rpm: 640, burst: [8, 16], pause: [0.7, 1.4], acc: 0.2, sight: 60, run: 1.9, walk: 1.25, pref: [8, 18], mag: 80, reloadT: 3.5, push: true, drop: 'ammo' },
  shield: { hp: 120, style: 'shield', gun: 'PISTOL', dmg: 9, rpm: 260, burst: [2, 3], pause: [0.6, 1.2], acc: 0.28, sight: 45, run: 2.0, walk: 1.2, pref: [6, 10], mag: 15, reloadT: 2.0, shield: true, drop: 'MK5' },
  gunner: { hp: 100, style: 'enemy', gun: 'MG', dmg: 9, rpm: 600, burst: [10, 20], pause: [0.8, 1.5], acc: 0.22, sight: 90, run: 4, walk: 1.5, pref: [10, 80], mag: 100, reloadT: 4, static: true, turret: true, drop: 'ammo' },
};

const CHATTER = [
  'Essa chuva não para...', 'Dizem que o Barqueiro nasceu lá embaixo, na vila que afundou.', 'Se abrirem as comportas, Sarnov some do mapa em uma hora.',
  'Meu turno acaba às quatro. Se a represa ainda existir.', 'Alguém viu o helicóptero cair? Que estrondo.', 'Pagam bem. Mas não pagam pra morrer afogado.',
  'O vale lembra, irmão. O vale lembra.', 'Liga o gerador de novo, tá um breu aqui.',
];
const CALL = {
  contact: ['Contato!', 'Ali! Ele tá ali!', 'Inimigo! Atirem!'], grenade: ['Granada saindo!', 'Granada!'],
  flank: ['Vou pelo flanco!', 'Flanqueando!'], retreat: ['Recuar! Recuar!', 'Tô ferido, recuando!'], down: ['Homem abatido!', 'Perdemos um!'],
  heard: ['Ouviu isso?', 'Que barulho foi esse?'], calm: ['Deve ter sido o vento.', 'Nada aqui.'], search: ['Onde ele foi?', 'Procurem! Ele tá por aqui!'],
  body: ['Corpo! Temos um corpo aqui!', 'Alarme! Mataram um dos nossos!'], blind: ['Não enxergo!', 'Meus olhos!'],
};

const _e = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
let UID = 1;

export class Enemy {
  constructor(G, type, pos, o = {}) {
    this.G = G; this.id = UID++;
    this.type = type; this.def = ETYPES[type];
    this.hp = this.def.hp * (o.hpMult || 1); this.maxHp = this.hp;
    this.armored = !!this.def.armor;
    this.body = { x: pos.x, y: pos.y, z: pos.z, vy: 0, r: 0.32, h: 1.75, onGround: true, step: 0.55 };
    this.pos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.yaw = o.yaw ?? 0; this.baseYaw = this.yaw;
    this.model = createSoldier(G.scene, this.def.style, G.level.T);
    if (this.def.shield) this.model.addShield(G.level.T);
    if (o.flashlight) { this.model.addFlashlight(G.level.T); this.flashlight = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), range: 16, cos: Math.cos(0.3) }; G.lights.flashlights.push(this.flashlight); }
    if (type === 'sniper') this.model.addGlint(G.level.T);
    this.sector = o.sector || null;
    this.patrol = o.patrol || null; this.patrolIdx = 0; this.waitT = rand(0, 2);
    this.guard = !!o.guard || (!this.patrol && !o.goal);
    this.static = !!this.def.static || !!o.perch;
    this.searchlight = o.searchlight || null;
    this.flares = o.flares ?? (Math.random() < 0.35 ? 1 : 0);
    this.state = 'patrol'; this.stateT = 0;
    this.aware = 0; this.alertBoost = false;
    this.lastKnown = new THREE.Vector3(); this.lastSeenT = -99; this.canSee = false; this.target = null;
    this.suppression = 0; this.blind = 0; this.stagger = 0;
    this.ammo = this.def.mag; this.reloading = 0; this.fireCd = rand(0.3, 1); this.burstLeft = 0; this.acquireT = 0;
    this.path = null; this.pathIdx = 0; this.moveTarget = null; this.moveSpeed = 0; this.repathT = 0; this.stuckT = 0; this.lastPos = this.pos.clone();
    this.cover = null; this.coverPhase = 'hide'; this.coverT = 0; this.coverRepickT = 0;
    this.thinkT = rand(0, 0.25); this.percT = rand(0, 0.1); this.voiceT = rand(2, 5); this.chatted = false;
    this.crouchT = 0; this.wantShoot = false; this.aimT = 0; this.firedT = -99; this.markedT = 0;
    this.goal = o.goal ? o.goal.clone() : null;
    this.dead = false; this.deadT = 0; this.bodyFound = false;
    this.speedNow = 0; this.retreated = false; this.investigatePos = null;
    this.squad = null;
    if (o.alerted) { this.engage(o.knowPos || G.player.pos, 'heard', true); }
    this.sync();
  }
  sync() { this.pos.set(this.body.x, this.body.y, this.body.z); this.model.setPose(this.pos, this.yaw); }
  hipsY() { return this.model.hips.position.y; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.hipsY() + 0.7, this.pos.z); }
  chestPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.hipsY() + 0.35, this.pos.z); }
  headPos(out = new THREE.Vector3()) { return out.set(this.pos.x + Math.sin(this.yaw) * 0.02, this.pos.y + this.hipsY() + 0.73, this.pos.z + Math.cos(this.yaw) * 0.02); }
  get inCombat() { return this.state === 'combat' || this.state === 'search' || this.state === 'retreat' || this.state === 'assault'; }
  get unaware() { return this.state === 'patrol' || this.state === 'suspicious'; }

  say(kind, force = false) {
    if (this.dead) return;
    const G = this.G;
    if (!force && (this.voiceT > 0 || G.director.voiceCd > 0)) return;
    const d = this.pos.distanceTo(G.player.pos);
    if (d > 32) return;
    this.voiceT = rand(4, 7); G.director.voiceCd = 1.8;
    const text=pick(CALL[kind] || [kind]);
    G.hud.subtitle('HOSTIL',text,Math.max(1.8,G.audio.speechDuration(text,'HOSTIL')),true);
    G.audio.speak(text,'HOSTIL',{radio:false,pos:this.pos,channel:'hostile',maxDelay:1000});
  }
  // ---------- entradas de estímulo ----------
  engage(pos, reason, silent = false) {
    const G = this.G;
    const was = this.inCombat;
    this.lastKnown.copy(pos);
    if (reason === 'spotted') this.lastSeenT = G.time;
    else if (!was) this.lastSeenT = G.time - 2.5;
    this.aware = 1;
    if (!was) {
      this.state = 'combat'; this.stateT = 0; this.cover = null; this.acquireT = 0;
      if (!silent) this.say(reason === 'spotted' ? 'contact' : 'search', true);
      G.director.onEnemyCombat(this);
      if (this.squad) this.squad.alert(pos, this);
    }
    if (this.searchlight) this.searchlight.target = this.lastKnown;
  }
  investigate(pos, reason) {
    if (this.inCombat || this.static && this.type !== 'rifleman') { if (this.static) this.faceTo(pos); return; }
    if (this.state !== 'suspicious') { this.state = 'suspicious'; this.stateT = 0; this.susPhase = 'look'; this.say('heard'); }
    this.investigatePos = pos.clone();
    this.aware = Math.max(this.aware, 0.4);
  }
  hear(pos, kind, src) {
    if (this.dead) return;
    const G = this.G;
    const fromPlayer = src === 'player';
    if (kind === 'shot' || kind === 'explosion') {
      const approx = fromPlayer ? G.player.pos.clone().add(new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5))) : (src && src.lastKnown ? src.lastKnown.clone() : pos.clone());
      if (!this.inCombat) this.engage(approx, 'heard');
      else if (!this.canSee && G.time - this.lastSeenT > 1.5) this.lastKnown.lerp(approx, 0.5);
    } else if (kind === 'impact') {
      const d = this.pos.distanceTo(pos);
      if (d < 3.5) { this.suppression = Math.min(1, this.suppression + 0.12); if (!this.inCombat) this.engage(G.player.pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), 'heard'); }
      else if (this.unaware) this.investigate(pos, 'noise');
    } else if (kind === 'enemyshot') {
      if (!this.inCombat && src && src.lastKnown) this.engage(src.lastKnown.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))), 'heard');
    } else {
      if (this.unaware) { this.aware = Math.min(0.95, this.aware + (kind === 'step' ? 0.2 : 0.35)); this.investigate(pos, kind); }
    }
  }
  faceTo(p) { this.wantYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  // ---------- dano ----------
  takeDamage(amount, part, dir, source, point, silent = false) {
    if (this.dead) return false;
    const G = this.G;
    let a = amount;
    if (this.armored && part !== 'head') a *= this.def.armor;
    if (this.type === 'heavy' && part === 'head') a *= 0.85;
    this.hp -= a;
    this.model.hitFlash();
    if (this.type !== 'heavy') this.stagger = 0.18;
    if (this.hp <= 0) { this.die(dir, silent); return true; }
    if (source === 'player' && !this.inCombat) this.engage(G.player.pos, 'spotted');
    this.suppression = Math.min(1, this.suppression + 0.25);
    return false;
  }
  die(dir, silent) {
    const G = this.G;
    this.dead = true; this.state = 'dead'; this.deadT = 0;
    this.model.die(dir ? dir.x : 0, dir ? dir.z : 1, silent);
    if (this.flashlight) { const i = G.lights.flashlights.indexOf(this.flashlight); if (i >= 0) G.lights.flashlights.splice(i, 1); }
    if (this.cover) { this.cover.occ = null; this.cover = null; }
    if (this.searchlight) this.searchlight.target = null;
    if (this.squad) this.squad.onDeath(this, silent);
    G.director.onEnemyDeath(this, silent);
  }
  onShieldHit() { this.suppression = Math.min(1, this.suppression + 0.08); }

  // ---------- hitboxes ----------
  raycast(o, d, maxT) {
    if (this.dead) return null;
    const hy = this.hipsY(), p = this.pos;
    let best = null;
    const test = (t, part) => { if (t >= 0 && t < maxT && (!best || t < best.t)) best = { t, part }; };
    // escudo (OBB local)
    if ((this.def.shield && this.blind <= 0) || this.def.turret) {
      const ox = o.x - p.x, oz = o.z - p.z;
      const lox = ox * Math.cos(this.yaw) - oz * Math.sin(this.yaw), loz = ox * Math.sin(this.yaw) + oz * Math.cos(this.yaw);
      const ldx = d.x * Math.cos(this.yaw) - d.z * Math.sin(this.yaw), ldz = d.x * Math.sin(this.yaw) + d.z * Math.cos(this.yaw);
      const loy = o.y - p.y;
      const sh = this.def.turret ? { cx: 0, cy: 0.9, cz: 0.55, hx: 0.4, hy: 0.28, hz: 0.05 } : { cx: -0.08, cy: hy + 0.15, cz: 0.5, hx: 0.31, hy: 0.58, hz: 0.05 };
      const slab = (o0, dd, mn, mx) => { if (Math.abs(dd) < 1e-9) return o0 >= mn && o0 <= mx ? [-Infinity, Infinity] : null; let a = (mn - o0) / dd, b = (mx - o0) / dd; return a < b ? [a, b] : [b, a]; };
      const sx = slab(lox, ldx, sh.cx - sh.hx, sh.cx + sh.hx), sy = slab(loy, d.y, sh.cy - sh.hy, sh.cy + sh.hy), sz = slab(loz, ldz, sh.cz - sh.hz, sh.cz + sh.hz);
      if (sx && sy && sz) { const tn = Math.max(sx[0], sy[0], sz[0]), tf = Math.min(sx[1], sy[1], sz[1]); if (tn <= tf && tn > 0) test(tn, 'shield'); }
    }
    const h = this.headPos(_m);
    test(raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.x, h.y, h.z, 0.15, maxT), 'head');
    test(rayCylinder(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.z, this.armored ? 0.32 : 0.27, p.y + hy - 0.08, p.y + hy + 0.56, maxT), 'body');
    test(rayCylinder(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.z, 0.22, p.y, p.y + hy - 0.08, maxT), 'legs');
    return best;
  }

  // ---------- percepção ----------
  perceive(dtp) {
    const G = this.G, pl = G.player;
    this.canSee = false;
    if (pl.dead || G.director.ignorePlayer) return;
    const eye = this.eyePos(_e);
    const tgt = pl.eye;
    const dx = tgt.x - eye.x, dy = tgt.y - eye.y, dz = tgt.z - eye.z;
    const d = Math.hypot(dx, dy, dz), dh = Math.hypot(dx, dz) || 0.01;
    const cosA = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / dh;
    const combat = this.inCombat;
    const fov = combat ? 0.2 : 0.5;
    const vis = pl.visibility;
    const blind = this.blind > 0;
    let range = this.def.sight * (combat ? 1 : clamp(vis, 0.1, 1.1) * (this.alertBoost ? 1.35 : 1));
    if (G.weather.flash > 0.3 && !(pl.zone && pl.zone.indoor)) range = Math.max(range, this.def.sight * 0.9);
    let seen = false;
    if (!blind && d < range && (cosA > fov || (d < 2.5 && pl.hSpeed > 2.5))) {
      if (!G.director.smokeBlocks(eye, tgt)) {
        if (G.physics.los(eye.x, eye.y, eye.z, tgt.x, tgt.y, tgt.z)) seen = true;
        else { const c = pl.chestPos(); if (G.physics.los(eye.x, eye.y, eye.z, c.x, c.y, c.z)) seen = true; }
      }
    }
    if (seen) {
      this.canSee = true;
      if (combat) {
        this.lastKnown.copy(pl.pos); this.lastSeenT = G.time;
        this.squad && this.squad.report(pl.pos);
        this.target = 'player';
      } else {
        const centerK = lerp(0.5, 1, clamp((cosA - fov) / (1 - fov), 0, 1));
        const distK = Math.pow(clamp(1 - d / range, 0, 1), 0.6);
        let rate = 2.4 * vis * distK * centerK * (this.state === 'suspicious' ? 1.6 : 1) * (this.alertBoost ? 1.5 : 1) * G.diff.detect;
        if (d < 7) rate *= 2.5;
        this.aware = Math.min(1, this.aware + rate * dtp);
        if (this.aware >= 1) this.engage(pl.pos, 'spotted');
        else if (this.aware > 0.35 && this.state === 'patrol') this.investigate(pl.pos, 'glimpse');
        else if (this.aware > 0.35 && this.state === 'suspicious') this.investigatePos = pl.pos.clone();
      }
    } else if (!combat) this.aware = Math.max(0, this.aware - 0.12 * dtp);
    // corpos
    if (!combat && !this.static) {
      const body = G.director.visibleBody(this);
      if (body) { body.bodyFound = true; this.say('body', true); this.engage(body.pos.clone().add(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8))), 'heard', true); G.director.raiseAlarm(this.sector, this.pos); }
    }
    // aliados como alvo (de vez em quando)
    if (combat && !seen && Math.random() < 0.25) {
      for (const al of G.allies.list) {
        const ap = al.chestPos();
        if (ap.distanceTo(eye) < this.def.sight * 0.8 && G.physics.los(eye.x, eye.y, eye.z, ap.x, ap.y, ap.z)) { this.target = al; this.allyTarget = al; break; }
      }
    } else if (seen) this.allyTarget = null;
  }

  // ---------- movimento ----------
  setMove(target, speed) {
    if (!target) { this.moveTarget = null; this.path = null; return; }
    if (this.moveTarget && this.moveTarget.distanceTo(target) < 0.8 && this.path) { this.moveSpeed = speed; return; }
    this.moveTarget = target.clone(); this.moveSpeed = speed;
    this.path = null; this.pathIdx = 0;
    this.G.director.requestPath(this);
  }
  arrived(r = 0.7) { return !this.moveTarget || Math.hypot(this.moveTarget.x - this.pos.x, this.moveTarget.z - this.pos.z) < r; }
  _move(dt) {
    const G = this.G, b = this.body;
    let vx = 0, vz = 0;
    if (this.moveTarget && !this.arrived(0.45) && this.stagger <= 0) {
      let wp = this.moveTarget;
      if (this.path && this.path.length) {
        while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - this.pos.x, this.path[this.pathIdx].z - this.pos.z) < 0.7) this.pathIdx++;
        wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
      }
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      let sp = this.moveSpeed * (this.blind > 0 ? 0.3 : 1) * (this.suppression > 0.6 ? 0.8 : 1);
      vx = (dx / d) * sp; vz = (dz / d) * sp;
      this.moveYaw = Math.atan2(dx, dz);
    }
    // separação
    for (const o of G.director.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.1 && d2 > 1e-4) { const d = Math.sqrt(d2); vx += (dx / d) * (1.05 - d) * 3; vz += (dz / d) * (1.05 - d) * 3; }
    }
    const before = this.pos.clone();
    G.physics.moveBody(b, vx * dt, vz * dt, dt, true);
    this.pos.set(b.x, b.y, b.z);
    this.speedNow = before.distanceTo(this.pos) / Math.max(dt, 1e-4);
    // travado?
    if (this.moveTarget && !this.arrived(0.8) && this.moveSpeed > 0.5) {
      if (this.speedNow < 0.15) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; G.director.requestPath(this); if (Math.random() < 0.5) { b.x += rand(-0.4, 0.4); b.z += rand(-0.4, 0.4); } }
    }
    if (b.y < -60) { this.hp = 0; this.die(null, true); }
  }

  // ---------- disparo ----------
  _fire(dt) {
    const G = this.G, def = this.def;
    this.fireCd -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = def.mag;
      return;
    }
    if (!this.wantShoot || this.fireCd > 0 || this.stagger > 0) return;
    if (this.ammo <= 0) { this.reloading = def.reloadT; return; }
    if (this.burstLeft <= 0) { this.burstLeft = randInt(def.burst[0], def.burst[1]); }
    this.burstLeft--; this.ammo--;
    this.fireCd = this.burstLeft > 0 ? 60 / def.rpm : rand(def.pause[0], def.pause[1]);
    // alvo
    const pl = G.player;
    const targetAlly = this.target && this.target !== 'player' ? this.target : null;
    const tPos = targetAlly ? targetAlly.chestPos() : pl.chestPos();
    const muzzle = this.model.muzzleWorld(new THREE.Vector3());
    const dist = muzzle.distanceTo(tPos);
    // chance de acerto
    let p = def.acc * G.diff.acc;
    p *= clamp(1.25 - dist / (def.sight * 1.1), 0.25, 1.1);
    if (!targetAlly) {
      if (pl.hSpeed > 3) p *= 0.75;
      if (pl.stance === 'crouch') p *= 0.85; else if (pl.stance === 'prone') p *= 0.6;
      if (pl.slide > 0) p *= 0.5;
      p *= clamp(0.25 + pl.visibility * 0.75, 0.3, 1);
      if (G.director.smokeBlocks(muzzle, tPos)) p *= 0.15;
    } else p *= 0.5;
    p *= 1 - this.suppression * 0.6;
    if (this.blind > 0) p *= 0.05;
    // tempo de reação: os primeiros tiros após adquirir o alvo são de aviso
    p *= this.acquireT < 0.4 ? 0.05 : clamp(0.25 + ((this.acquireT - 0.4) / 1.2) * 0.75, 0.25, 1);
    if (!this.canSee) p *= 0.12;
    if (this.speedNow > 1) p *= 0.6;
    // tokens de ataque: só alguns inimigos atiram "pra valer" ao mesmo tempo
    if (!targetAlly && !G.director.attackToken(this)) p *= 0.15;
    if (this.type === 'sniper') {
      p = this.canSee && G.director.attackToken(this) ? clamp(0.8 * G.diff.acc - (pl.hSpeed > 2.5 ? 0.45 : 0) - (pl.stance !== 'stand' ? 0.15 : 0), 0.1, 0.9) : 0;
      if (!this.warned) { p = 0; this.warned = true; }
    }
    const hit = Math.random() < p;
    const aim = tPos.clone();
    if (!hit) {
      const off = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.5, 2.0));
      aim.add(off);
      if (!this.canSee && !targetAlly) aim.copy(this.lastKnown).add(new THREE.Vector3(rand(-2, 2), rand(0.5, 1.8), rand(-2, 2)));
    }
    const dir = aim.clone().sub(muzzle).normalize();
    const maxD = muzzle.distanceTo(aim) + (hit ? 0 : 30);
    const wh = G.physics.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, hit ? Math.max(0.1, maxD - 0.3) : maxD, {});
    let end;
    if (wh) {
      end = new THREE.Vector3(wh.x, wh.y, wh.z);
      G.fx.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), wh.water ? 'water' : wh.terrain ? 'concrete' : wh.col.mat);
      if (end.distanceTo(pl.eye) < 8) G.audio.impact(end, wh.col ? wh.col.mat : 'concrete');
      if (wh.col && wh.col.hp !== undefined) G.level.damageDestructible(wh.col, def.dmg * 1.5, end);
    } else {
      end = muzzle.clone().addScaledVector(dir, maxD);
      if (hit) {
        if (targetAlly) targetAlly.onHit && targetAlly.onHit(this);
        else pl.takeDamage(def.dmg * G.diff.dmg, this.pos, 'bullet');
      }
    }
    // quase-acerto: estalo e supressão no jogador
    if (!targetAlly) {
      const seg = end.clone().sub(muzzle);
      const L = seg.length(); seg.divideScalar(L || 1);
      const rel = pl.eye.clone().sub(muzzle);
      const t = clamp(rel.dot(seg), 0, L);
      const closest = muzzle.clone().addScaledVector(seg, t);
      const md = closest.distanceTo(pl.eye);
      if (md < 2.2 && !(hit && !wh)) { pl.suppressHit(0.12 + (this.type === 'gunner' || this.type === 'heavy' ? 0.08 : 0)); if (Math.random() < 0.6) G.audio.whiz(closest); }
    }
    // efeitos
    this.model.muzzleFlash();
    G.audio.shot(def.gun, muzzle);
    if (Math.random() < 0.5 || this.type === 'gunner') G.fx.tracer(muzzle, end, 0xffa040, 300, 5);
    this.firedT = G.time;
    G.director.noise(muzzle, 70, 'enemyshot', this);
    if (G.director.muzzleLightCd <= 0 && muzzle.distanceTo(pl.eye) < 50) { G.fx.flashLight(muzzle, 0xffb060, 120, 0.05); G.director.muzzleLightCd = 0.06; }
  }

  // ---------- cérebro ----------
  update(dt) {
    const G = this.G;
    if (this.dead) {
      this.deadT += dt;
      this.model.animate(dt, 0, 0, G.time);
      return;
    }
    this.stateT += dt; this.voiceT -= dt; this.thinkT -= dt; this.percT -= dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    this.blind = Math.max(0, this.blind - dt); this.stagger = Math.max(0, this.stagger - dt);
    this.markedT = Math.max(0, this.markedT - dt);
    if (this.canSee) this.acquireT += dt; else this.acquireT = Math.max(0, this.acquireT - dt * 0.5);
    if (this.percT <= 0) { this.percT = 0.1; this.perceive(0.1); }
    if (this.thinkT <= 0) { this.thinkT = 0.22; this.think(); }
    this.wantShoot = false;
    this.behave(dt);
    if (!this.static) this._move(dt);
    // giro
    let wy = this.wantYaw;
    if (this.inCombat && this.lookAtTarget) { const tp = this.target && this.target !== 'player' ? this.target.pos : (this.canSee ? G.player.pos : this.lastKnown); wy = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z); }
    else if (this.moveTarget && !this.arrived(0.6) && this.moveYaw !== undefined) wy = this.moveYaw;
    if (wy !== undefined) {
      if (this.def.turret) wy = this.baseYaw + clamp(angleWrap(wy - this.baseYaw), -1.2, 1.2);
      this.yaw = dampAngle(this.yaw, wy, this.inCombat ? 7 : 3, dt);
    }
    // facing ok para atirar?
    if (this.wantShoot) {
      const tp = this.target && this.target !== 'player' ? this.target.pos : (this.canSee ? G.player.pos : this.lastKnown);
      const ty = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z);
      if (Math.abs(angleWrap(ty - this.yaw)) > 0.35) this.wantShoot = false;
      const dy = (tp.y + 1.2) - (this.pos.y + this.hipsY() + 0.35);
      this.model.aimPitch = clamp(Math.atan2(dy, Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z)), -0.6, 0.6);
    }
    this._fire(dt);
    // lanterna e reflexo
    if (this.flashlight) { this.model.flashlight.cone.getWorldPosition(this.flashlight.pos); this.flashlight.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    if (this.model.glint) {
      const toP = G.player.eye.clone().sub(this.eyePos(_e)).normalize();
      const facing = toP.x * Math.sin(this.yaw) + toP.z * Math.cos(this.yaw);
      const k = this.inCombat ? clamp((facing - 0.85) / 0.15, 0, 1) * (0.4 + clamp(this.aimT / this.def.aimTime, 0, 1) * 0.6) : 0.15 * clamp((facing - 0.7) / 0.3, 0, 1);
      this.model.glint.material.opacity = k * (0.7 + Math.random() * 0.3);
      this.model.glint.scale.setScalar(0.8 + k * 1.6);
    }
    this.sync();
    this.model.animate(dt, this.static ? 0 : this.speedNow, this.crouchT, G.time);
  }
  think() {
    const G = this.G;
    if (this.state === 'patrol' && !this.chatted && this.guard === false && Math.random() < 0.05) {
      const d = this.pos.distanceTo(G.player.pos);
      if (d < 16 && d > 5) { this.chatted = true; if (G.director.voiceCd <= 0) { const text=pick(CHATTER);G.hud.subtitle('HOSTIL',text,Math.max(3.2,G.audio.speechDuration(text,'HOSTIL')),true);G.audio.speak(text,'HOSTIL',{radio:false,pos:this.pos,channel:'hostile',maxDelay:1000});G.director.voiceCd=Math.max(4,G.audio.speechDuration(text,'HOSTIL')); } }
    }
    if (this.state === 'combat') this.combatThink();
  }
  behave(dt) {
    const G = this.G, def = this.def;
    this.lookAtTarget = false;
    switch (this.state) {
      case 'patrol': {
        this.crouchT = 0;
        if (this.patrol && !this.static) {
          const wp = this.patrol[this.patrolIdx];
          if (this.waitT > 0) { this.waitT -= dt; this.setMove(null); this.wantYaw = this.baseYaw + Math.sin(G.time * 0.5 + this.id) * 0.9; }
          else {
            this.setMove(wp, def.walk);
            if (this.arrived(0.8)) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.waitT = rand(1.5, 4); this.baseYaw = this.yaw; }
          }
        } else {
          this.setMove(null);
          this.wantYaw = this.baseYaw + Math.sin(G.time * 0.35 + this.id * 1.7) * (this.static ? 0.6 : 0.9);
        }
        break;
      }
      case 'suspicious': {
        this.crouchT = 0.2;
        if (this.susPhase === 'look') {
          this.setMove(null); this.faceTo(this.investigatePos);
          if (this.stateT > 1.2) {
            this.susPhase = this.static ? 'scan' : 'move'; this.stateT = 0;
            if (this.flares > 0 && G.zoneAt(this.pos)?.dark !== undefined && (G.zoneAt(this.investigatePos)?.dark)) { this.flares--; G.director.fireFlare(this, this.investigatePos); }
          }
        } else if (this.susPhase === 'move') {
          this.setMove(this.investigatePos, def.walk * 1.2);
          if (this.arrived(1.5) || this.stateT > 14) { this.susPhase = 'scan'; this.stateT = 0; }
        } else {
          this.setMove(null);
          this.wantYaw = this.yaw + Math.sin(this.stateT * 1.5) * 0.08;
          if (this.stateT > 4) { this.state = 'patrol'; this.stateT = 0; this.alertBoost = true; this.aware = 0.1; this.say('calm'); if (this.patrol) this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; }
        }
        break;
      }
      case 'combat': this.combatBehave(dt); break;
      case 'assault': {
        this.crouchT = 0;
        this.setMove(this.goal, def.run * 0.9);
        this.lookAtTarget = this.canSee;
        this.wantShoot = this.canSee;
        if (this.arrived(3) || this.canSee && this.pos.distanceTo(G.player.pos) < 25) { this.state = 'combat'; this.stateT = 0; this.lastKnown.copy(G.player.pos); this.lastSeenT = G.time; }
        break;
      }
      case 'search': {
        this.crouchT = 0.3;
        if (this.canSee) { this.engage(G.player.pos, 'spotted'); this.state = 'combat'; break; }
        if (!this.searchPt || this.arrived(1.2)) {
          this.searchPt = G.nav.randomNear(this.lastKnown.x, this.lastKnown.y, this.lastKnown.z, 14) || this.lastKnown;
          this.searchPt = new THREE.Vector3(this.searchPt.x, this.searchPt.y, this.searchPt.z);
        }
        this.setMove(this.searchPt, this.stateT < 4 ? def.run * 0.7 : def.walk * 1.3);
        if (this.stateT > 25) {
          if (G.director.alarmActive(this.sector)) { this.stateT = 0; }
          else { this.state = 'patrol'; this.stateT = 0; this.alertBoost = true; this.aware = 0.2; this.setMove(null); }
        }
        break;
      }
      case 'retreat': {
        this.crouchT = 0;
        if (!this.cover) { this.state = 'combat'; break; }
        this.setMove(this.cover.pos, def.run);
        this.lookAtTarget = false;
        if (this.arrived(0.6)) { this.state = 'combat'; this.stateT = 0; this.coverPhase = 'hide'; this.coverT = 0; }
        break;
      }
    }
  }
  combatThink() {
    const G = this.G, def = this.def;
    const tSince = G.time - this.lastSeenT;
    if (!this.static && !def.push && tSince > 8 && !this.canSee) { this.state = 'search'; this.stateT = 0; this.searchPt = this.lastKnown.clone(); this.say('search'); if (this.cover) { this.cover.occ = null; this.cover = null; } return; }
    if (!this.static && !def.push && !this.retreated && this.hp < this.maxHp * 0.35) {
      const c = G.director.findCover(this, this.lastKnown, { retreat: true });
      if (c) { this.retreated = true; this.takeCover(c); this.state = 'retreat'; this.stateT = 0; this.say('retreat'); return; }
    }
    if (this.static || def.push || def.shield) return;
    this.coverRepickT -= 0.22;
    const role = this.squad ? this.squad.roleOf(this) : 'assault';
    let need = !this.cover;
    if (this.cover && this.coverRepickT <= 0) {
      // cobertura comprometida? (jogador vê a posição escondida)
      const pe = G.player.eye, cp = this.cover.pos;
      const hideH = this.cover.low ? 0.95 : 1.5;
      if (G.physics.los(pe.x, pe.y, pe.z, cp.x, cp.y + hideH, cp.z)) need = true;
      if (role === 'flank' && !this.cover.flank) need = true;
      if (cp.distanceTo(this.lastKnown) > def.pref[1] + 15) need = true;
    }
    if (need && this.coverRepickT <= 0) {
      const c = G.director.findCover(this, this.lastKnown, { flank: role === 'flank' });
      this.coverRepickT = 2.5;
      if (c) { this.takeCover(c); if (role === 'flank') { this.cover.flank = true; this.say('flank'); } }
      else if (this.pos.distanceTo(this.lastKnown) > def.pref[1]) this.setMove(this.lastKnown, def.run);
    }
    // granada
    if (this.squad && !this.canSee && tSince < 6 && tSince > 1.5 && G.player.stationaryT > 3 && this.squad.canGrenade(G.time) && this.cover && this.arrived(1)) {
      const d = this.pos.distanceTo(this.lastKnown);
      if (d > 8 && d < 30) { this.squad.usedGrenade(G.time); this.throwGrenade(this.lastKnown); }
    }
  }
  takeCover(c) {
    if (this.cover) this.cover.occ = null;
    this.cover = c; c.occ = this;
    this.coverPhase = 'move'; this.coverT = 0;
    this.setMove(c.pos, this.def.run);
  }
  combatBehave(dt) {
    const G = this.G, def = this.def;
    const pl = G.player;
    this.lookAtTarget = true;
    const dist = this.pos.distanceTo(this.lastKnown);
    if (this.type === 'sniper') {
      this.crouchT = this.suppression > 0.5 ? 0.9 : 0;
      if (this.canSee && this.suppression < 0.5) { this.aimT += dt; if (this.aimT >= def.aimTime) { this.wantShoot = true; if (this.fireCd <= 0) this.aimT = 0; } }
      else this.aimT = Math.max(0, this.aimT - dt * 2);
      return;
    }
    if (def.turret) { this.crouchT = 0.35; this.wantShoot = this.canSee || G.time - this.lastSeenT < 3; return; }
    if (def.push) {
      this.crouchT = 0;
      if (dist > def.pref[0]) this.setMove(this.lastKnown, def.walk); else this.setMove(null);
      this.wantShoot = this.canSee || G.time - this.lastSeenT < 2.5;
      return;
    }
    if (def.shield) {
      this.crouchT = 0.25;
      if (this.blind > 0) { this.setMove(null); return; }
      if (dist > def.pref[1]) this.setMove(this.lastKnown, def.walk * 1.3); else this.setMove(null);
      this.wantShoot = this.canSee;
      return;
    }
    // cobertura
    if (!this.cover) {
      this.crouchT = 0.2;
      this.wantShoot = this.canSee && this.stateT > 0.4;
      return;
    }
    if (this.coverPhase === 'move') {
      this.crouchT = 0.15;
      this.wantShoot = this.canSee && Math.random() < 0.6;
      this.lookAtTarget = this.canSee && dist < 30;
      if (this.arrived(0.6)) { this.coverPhase = 'hide'; this.coverT = rand(0.6, 1.4); }
      return;
    }
    this.coverT -= dt;
    const pinned = this.suppression > 0.6;
    if (this.coverPhase === 'hide') {
      this.crouchT = this.cover.low ? 1 : 0.2;
      this.setMove(this.cover.pos, def.run);
      if (this.ammo < def.mag * 0.4 && this.reloading <= 0) { this.reloading = def.reloadT; }
      // fogo às cegas quando preso
      if (pinned && Math.random() < 0.02) { this.wantShoot = true; }
      if (this.coverT <= 0 && !pinned && this.reloading <= 0) { this.coverPhase = 'peek'; this.coverT = rand(1.5, 3.0); }
    } else {
      // espiar
      if (this.cover.low) { this.crouchT = 0; this.setMove(this.cover.pos, def.run); }
      else { this.crouchT = 0.1; this.setMove(this.cover.peek || this.cover.pos, def.run * 0.6); }
      this.wantShoot = this.canSee || (G.time - this.lastSeenT < 2.5 && Math.random() < 0.5);
      if (this.coverT <= 0 || this.suppression > 0.75) { this.coverPhase = 'hide'; this.coverT = rand(1.2, 2.6) * (1 + this.suppression * 1.5); }
    }
  }
  throwGrenade(at) {
    const G = this.G;
    this.say('grenade', true);
    const from = this.eyePos(new THREE.Vector3());
    const to = at.clone().add(new THREE.Vector3(rand(-2, 2), 0.2, rand(-2, 2)));
    const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const dist = d.length(); d.normalize();
    const T = clamp(dist / 14, 0.6, 1.6);
    const vy = (to.y - from.y + 0.5 * 18 * T * T) / T;
    const vel = d.multiplyScalar(dist / T).setY(vy);
    G.weapons.spawnNade(from, vel, 'frag', 3.2, 'enemy');
  }
  dispose() { this.model.dispose(this.G.scene); if (this.flashlight) { const i = this.G.lights.flashlights.indexOf(this.flashlight); if (i >= 0) this.G.lights.flashlights.splice(i, 1); } if (this.cover) this.cover.occ = null; }
}
