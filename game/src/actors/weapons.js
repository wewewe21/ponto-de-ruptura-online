// Arsenal do jogador: definições, disparo hitscan com penetração, recuo com padrão, spread,
// recarga tática/vazia, troca, ADS, granadas (frag/flash/fumaça), foguete, faca e designador.
import * as THREE from 'three';
import { clamp, lerp, rand, damp, pointSegDist } from '../core/utils.js';

export const WEAPONS = {
  SD9: { id: 'SD9', name: 'CARABINA SD-9', short: 'SD-9', slot: 'primary', auto: true, rpm: 800, dmg: 26, dmgFar: 20, r0: 25, r1: 50, head: 3.0, limb: 0.8, mag: 30, reserve: 150, hip: 3.0, ads: 0.15, adsTime: 0.2, zoom: 1.35, reloadT: 2.0, reloadE: 2.6, pen: 0.5, sup: true, recoil: { up: 0.32, side: 0.12, freq: 0.5, phase: 0.3, rand: 0.25 }, sound: 'SD9', tracer: 0, range: 200, move: 1.0 },
  KR7: { id: 'KR7', name: 'FUZIL KR-7', short: 'KR-7', slot: 'primary', auto: true, rpm: 680, dmg: 34, dmgFar: 26, r0: 35, r1: 70, head: 3.0, limb: 0.8, mag: 30, reserve: 180, hip: 3.5, ads: 0.2, adsTime: 0.24, zoom: 1.4, reloadT: 2.2, reloadE: 2.8, pen: 1.0, recoil: { up: 0.5, side: 0.26, freq: 0.42, phase: 1.3, rand: 0.25 }, sound: 'KR7', tracer: 3, range: 250, move: 0.97 },
  VK12: { id: 'VK12', name: 'DMR VK-12', short: 'VK-12', slot: 'primary', auto: false, rpm: 300, dmg: 70, dmgFar: 62, r0: 60, r1: 120, head: 2.5, limb: 0.85, mag: 10, reserve: 50, hip: 6, ads: 0.04, adsTime: 0.3, zoom: 4.2, scope: true, reloadT: 2.4, reloadE: 3.0, pen: 1.5, recoil: { up: 1.7, side: 0.35, freq: 1.1, phase: 0.2, rand: 0.4 }, sound: 'VK12', tracer: 1, range: 400, move: 0.92 },
  P19: { id: 'P19', name: 'PISTOLA P-19', short: 'P-19', slot: 'secondary', auto: false, rpm: 450, dmg: 30, dmgFar: 22, r0: 15, r1: 35, head: 2.5, limb: 0.8, mag: 15, reserve: 60, hip: 2.5, ads: 0.3, adsTime: 0.15, zoom: 1.2, reloadT: 1.4, reloadE: 1.8, pen: 0.3, recoil: { up: 1.0, side: 0.3, freq: 1.3, phase: 0.8, rand: 0.4 }, sound: 'P19', tracer: 0, range: 120, move: 1.05 },
  MK5: { id: 'MK5', name: 'SUBMETRALHADORA MK-5', short: 'MK-5', slot: 'primary', auto: true, rpm: 900, dmg: 21, dmgFar: 12, r0: 12, r1: 32, head: 2.6, limb: 0.8, mag: 32, reserve: 192, hip: 2.4, ads: 0.5, adsTime: 0.14, zoom: 1.25, reloadT: 1.8, reloadE: 2.3, pen: 0.2, sup: true, recoil: { up: 0.26, side: 0.2, freq: 0.7, phase: 0.4, rand: 0.3 }, sound: 'SD9', tracer: 0, range: 120, move: 1.05 },
  AX50: { id: 'AX50', name: 'SNIPER AX-50', short: 'AX-50', slot: 'primary', auto: false, rpm: 46, dmg: 135, dmgFar: 120, r0: 120, r1: 300, head: 2.5, limb: 0.9, mag: 5, reserve: 25, hip: 9, ads: 0.0, adsTime: 0.38, zoom: 8, scope: true, reloadT: 2.8, reloadE: 3.4, pen: 2.5, recoil: { up: 2.4, side: 0.4, freq: 1, phase: 0.2, rand: 0.3 }, sound: 'VK12', tracer: 1, range: 600, move: 0.88, bolt: true },
  KNIFE: { id: 'KNIFE', name: 'FACA TÁTICA', short: 'FACA', slot: 'melee', melee: true, adsTime: 0.2, zoom: 1, move: 1.08, mag: 0, reserve: 0 },
};
// primárias que o jogador pode alternar (Digit1 repetido); o lança-foguetes é item de missão
export const ARSENAL = ['SD9', 'MK5', 'KR7', 'VK12'];   // a sniper fica no slot 4
const RES = { wood: 0.5, metal: 0.8, glass: 0.1, sand: 1.4, concrete: 9 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Weapons {
  constructor(G) {
    this.G = G;
    this.reset();
    this.projectiles = [];
  }
  reset(state) {
    this.slots = state ? { melee: 'KNIFE', special: 'AX50', ...state.slots } : { primary: 'SD9', secondary: 'P19', melee: 'KNIFE', special: 'AX50' };
    this.ammo = state ? JSON.parse(JSON.stringify(state.ammo)) : {
      SD9: { mag: 30, reserve: 150 }, MK5: { mag: 32, reserve: 160 }, AX50: { mag: 5, reserve: 20 }, P19: { mag: 15, reserve: 60 }, KR7: { mag: 30, reserve: 90 }, VK12: { mag: 10, reserve: 30 },
    };
    this.nades = state ? { ...state.nades } : { frag: 3, flash: 2, smoke: 2 };
    this.tactical = state ? state.tactical : 'flash';
    this.cur = state ? state.cur : 'primary';
    this.adsT = 0; this.fireCd = 0; this.shotIdx = 0; this.bloom = 0; this.reload = null; this.swap = 0; this.swapTo = null;
    this.melee = 0; this.meleeSeq = 0; this.grenade = 0; this.cooking = null; this.sprintFireDelay = 0; this.triggerHeld = false;
    this.pumpT = 0; this.slideT = 0; this.recoilAccum = 0; this.recoilYawAccum = 0; this.lastShot = -9;
    this.laserBeam = 0;
  }
  snapshot() { return { slots: { ...this.slots }, ammo: JSON.parse(JSON.stringify(this.ammo)), nades: { ...this.nades }, tactical: this.tactical, cur: this.cur }; }
  get id() { return this.slots[this.cur]; }
  get def() { return WEAPONS[this.id]; }
  get A() { return this.ammo[this.id] || (this.ammo[this.id] = { mag: WEAPONS[this.id].mag, reserve: WEAPONS[this.id].reserve }); }
  get busy() { return this.reload || this.swap > 0 || this.melee > 0 || this.grenade > 0; }

  equip(slot) {
    if (slot === this.cur && !this.swapTo) return;
    if (!this.slots[slot]) return;
    this.reload = null; this.swapTo = slot; this.swap = 0.0001; this.G.audio.mech('swap');
  }
  // alterna entre as primárias do arsenal (Digit1 repetido)
  cyclePrimary() {
    const list = ARSENAL, i = list.indexOf(this.slots.primary), next = list[(i + 1) % list.length];
    if (next === this.slots.primary) return;
    this.slots.primary = next;
    if (!this.ammo[next]) this.ammo[next] = { mag: WEAPONS[next].mag, reserve: WEAPONS[next].reserve };
    this.reload = null; this.swapTo = 'primary'; this.swap = 0.0001; this.G.audio.mech('swap');
    this.G.hud.toast(WEAPONS[next].name);
  }
  pickup(id) {
    const def = WEAPONS[id];
    if (this.slots.primary === id) return false;
    this.slots.primary = id;
    if (!this.ammo[id]) this.ammo[id] = { mag: def.mag, reserve: def.reserve };
    this.cur = 'primary'; this.G.vm.set(id); this.swap = 0.5; this.swapTo = null; this.reload = null;
    this.G.audio.mech('pickup');
    return true;
  }
  addAmmo(id, n) { const a = this.ammo[id]; if (a) a.reserve = Math.min(WEAPONS[id].reserve * 1.6, a.reserve + n); }
  refill() {
    for (const k in this.ammo) { const d = WEAPONS[k]; if (d.mag) { this.ammo[k].reserve = Math.max(this.ammo[k].reserve, d.reserve); } }
    this.nades.frag = Math.max(this.nades.frag, 3); this.nades.flash = Math.max(this.nades.flash, 2); this.nades.smoke = Math.max(this.nades.smoke, 2);
  }
  spreadDeg() {
    const d = this.def, p = this.G.player;
    if (!d.hip) return 0;
    let s = lerp(d.hip, d.ads, this.adsT);
    const mv = clamp(p.hSpeed / 4.2, 0, 1.5);
    s *= 1 + mv * 0.6 * (1 - this.adsT * 0.6);
    if (!p.body.onGround) s *= 2.5;
    if (p.stance === 'crouch') s *= 0.8; else if (p.stance === 'prone') s *= 0.6;
    if (!d.pelletSpread) s += this.bloom * (1 - this.adsT * 0.7);
    return s;
  }
  update(dt, input) {
    const G = this.G, p = G.player;
    this.fireCd -= dt;
    this.bloom = damp(this.bloom, 0, 3.5, dt);
    this.pumpT = damp(this.pumpT, 0, 10, dt); this.slideT = damp(this.slideT, 0, 25, dt);
    this.laserBeam = Math.max(0, this.laserBeam - dt);
    if (this.melee > 0) this.melee = Math.max(0, this.melee - dt / 0.55);
    if (this.grenade > 0 && !this.cooking) this.grenade = Math.max(0, this.grenade - dt / 0.6);
    const canAct = !p.dead && !p.locked && input.enabled;
    // recuperação parcial do recuo
    if (G.time - this.lastShot > 0.1 && this.recoilAccum > 0) {
      const rec = Math.min(this.recoilAccum, this.recoilAccum * dt * 5.5);
      this.recoilAccum -= rec; p.pitch -= rec * 0.55;
    }
    // troca de arma
    if (this.swap > 0) {
      if (this.swapTo) {
        this.swap += dt / 0.18;
        if (this.swap >= 1) { this.cur = this.swapTo; this.swapTo = null; G.vm.set(this.id); this.swap = 1; }
      } else {
        this.swap -= dt / 0.18;
        if (this.swap <= 0) this.swap = 0;
      }
    }
    // ADS
    const wantAds = canAct && input.mouse(2) && !p.sprinting && this.melee <= 0 && !(this.reload && this.def.id !== 'BRK8') && this.grenade <= 0 && !this.def.melee;
    const prevAds = this.adsT;
    this.adsT = clamp(this.adsT + (wantAds ? 1 : -1) * dt / (this.def.adsTime || 0.2), 0, 1);
    if (prevAds === 0 && this.adsT > 0) G.audio.mech('ads');
    if (p.sprinting) this.sprintFireDelay = 0.18; else this.sprintFireDelay = Math.max(0, this.sprintFireDelay - dt);
    if (!canAct) { this.triggerHeld = false; return; }
    // entradas
    if (input.pressed('Digit1')) { if (this.cur === 'primary' && !this.busy && this.swapTo === null) this.cyclePrimary(); else this.equip('primary'); }
    if (input.pressed('Digit2')) this.equip('secondary');
    if (input.pressed('Digit3')) this.equip('melee');
    if (input.pressed('Digit4')) this.equip('special');
    if (input.wheel && !this.busy && !(this.def.laser)) this.equip(this.cur === 'primary' ? 'secondary' : 'primary');
    else if (input.wheel && this.def.laser) G.support.cycle(input.wheel);
    if (input.pressed('KeyX')) { this.tactical = this.tactical === 'flash' ? 'smoke' : 'flash'; G.hud.toast(this.tactical === 'flash' ? 'Tática: ATORDOANTE' : 'Tática: FUMAÇA'); G.audio.mech('beep'); }
    // recarga
    if (input.pressed('KeyR')) {
      if (this.def.laser) G.support.cycle(1);
      else this.startReload();
    }
    this._updateReload(dt);
    // faca
    if (input.pressed('KeyV') && this.melee <= 0 && this.grenade <= 0) this.knife();
    // granadas
    if (input.pressed('KeyG') && this.nades.frag > 0 && this.grenade <= 0 && !this.cooking) { this.cooking = { t: 0, kind: 'frag' }; this.grenade = 1; G.audio.mech('pin'); this.reload = null; }
    if (input.pressed('KeyT') && this.nades[this.tactical] > 0 && this.grenade <= 0 && !this.cooking) { this.throwNade(this.tactical, 0); this.grenade = 1; }
    if (this.cooking) {
      this.cooking.t += dt;
      if (Math.floor(this.cooking.t) !== Math.floor(this.cooking.t - dt)) G.audio.mech('beep');
      if (this.cooking.t >= 3.5) { this.nades.frag--; this.explode(p.eye.clone(), 'frag', 'player'); this.cooking = null; this.grenade = 0.5; }
      else if (!input.down('KeyG')) { this.throwNade('frag', this.cooking.t); this.cooking = null; }
    }
    // disparo
    const d = this.def;
    const trig = input.mouse(0);
    if (d.laser) {
      if (input.mousePressed(0)) this.designate();
    } else if (d.melee) {
      if (input.mousePressed(0) && this.melee <= 0 && this.swap <= 0 && this.grenade <= 0) this.knife();
    } else if (trig && this.swap <= 0 && this.melee <= 0 && this.grenade <= 0 && this.sprintFireDelay <= 0) {
      if (this.reload && d.id === 'BRK8' && this.A.mag > 0) this.reload = null; // escopeta: interrompe recarga
      if (!this.reload && this.fireCd <= 0 && (d.auto || !this.triggerHeld)) {
        if (this.A.mag > 0) this.fire();
        else if (!this.triggerHeld) { G.audio.dryFire(); this.startReload(); }
      }
    }
    if (!trig) { if (this.triggerHeld) this.shotIdx = Math.max(0, this.shotIdx - 0); this.triggerHeld = false; }
    if (!trig && G.time - this.lastShot > 0.35) this.shotIdx = 0;
    if (trig) this.triggerHeld = true;
    // trocar de pente cancela corrida e vice-versa
    if (p.sprinting && this.reload && d.id !== 'BRK8') this.reload = null;
    this._updateProjectiles(dt);
  }
  startReload() {
    const d = this.def, A = this.A;
    if (this.reload || !d.mag || A.reserve <= 0 || this.swap > 0) return;
    if (d.id === 'BRK8') { if (A.mag >= d.mag) return; this.reload = { t: 0, shell: true, timer: d.reloadStart, shellPhase: 0, empty: A.mag === 0 }; return; }
    if (A.mag >= d.mag) return;
    const empty = A.mag === 0;
    this.reload = { t: 0, dur: empty ? d.reloadE : d.reloadT, empty, magOut: false, magIn: false, bolt: false };
    this.G.audio.mech('magOut');
    this.G.allies && this.G.allies.onPlayerReload();
  }
  _updateReload(dt) {
    const r = this.reload, d = this.def, A = this.A, G = this.G;
    if (!r) return;
    if (r.shell) {
      r.timer -= dt; r.t = Math.min(0.5, r.t + dt * 2);
      r.shellPhase = Math.max(0, r.shellPhase - dt / d.shell);
      if (r.timer <= 0) {
        if (A.mag < d.mag && A.reserve > 0) { A.mag++; A.reserve--; G.audio.mech('shell'); r.shellPhase = 1; r.timer = d.shell; }
        else { if (r.empty) { G.audio.mech('pump'); this.pumpT = 1; } r.t = 1; this.reload = null; }
      }
      return;
    }
    r.t += dt / r.dur;
    if (r.t > 0.55 && !r.magIn) { r.magIn = true; G.audio.mech('magIn'); }
    if (r.empty && r.t > 0.75 && !r.bolt) { r.bolt = true; G.audio.mech('bolt'); }
    if (r.t >= 1) {
      const cap = d.mag + (r.empty || d.rocket ? 0 : 1);
      const need = Math.min(cap - A.mag, A.reserve);
      A.mag += need; A.reserve -= need;
      this.reload = null;
    }
  }
  currentDamage(d, dist) {
    const t = clamp((dist - d.r0) / (d.r1 - d.r0), 0, 1);
    return lerp(d.dmg, d.dmgFar, t);
  }
  fire() {
    const G = this.G, d = this.def, A = this.A, p = G.player, cam = G.camera;
    A.mag--;
    this.fireCd = 60 / d.rpm;
    this.lastShot = G.time;
    G.stats.shots++;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    if (d.rocket) {
      this.launchRocket(origin.clone().addScaledVector(fwd, 0.8), fwd.clone());
    } else {
      const spreadRad = (this.spreadDeg() * Math.PI) / 180;
      const n = d.pellets || 1;
      let anyHit = null;
      for (let i = 0; i < n; i++) {
        const dir = fwd.clone();
        if (spreadRad > 0) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadRad;
          const right = _v.set(1, 0, 0).applyQuaternion(cam.quaternion), up = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
          dir.addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();
        }
        const res = this.hitscan(origin, dir, d, i === 0);
        if (res && res.actor) anyHit = res;
      }
      // traçante
      if (d.tracer && G.stats.shots % d.tracer === 0) {
        const m = G.vm.muzzleCam(new THREE.Vector3());
        const mw = cam.localToWorld(m.clone());
        G.fx.tracer(mw, origin.clone().addScaledVector(fwd, 120), 0xffb060, 420, 6);
      }
    }
    // recuo
    const r = d.recoil, i = this.shotIdx++;
    const up = r.up * (i < 6 ? 1.15 : 0.85) * (1 + (Math.random() - 0.5) * r.rand);
    const side = r.side * Math.sin(i * r.freq + r.phase) + (Math.random() - 0.5) * r.rand * r.up * 0.5;
    const mult = (1 - this.adsT * 0.4) * (p.stance === 'crouch' ? 0.85 : p.stance === 'prone' ? 0.65 : 1);
    const upRad = (up * mult * Math.PI) / 180, sideRad = (side * mult * Math.PI) / 180;
    p.pitch += upRad; p.yaw -= sideRad;
    this.recoilAccum += upRad;
    this.bloom = Math.min(3, this.bloom + 0.3);
    G.vm.kick(d.rocket ? 3 : d.id === 'BRK8' ? 2.2 : d.id === 'VK12' ? 1.8 : 1);
    p.shake(d.rocket ? 0.5 : d.id === 'BRK8' ? 0.18 : 0.05);
    if (d.pump) { setTimeout(() => { if (this.def.id === 'BRK8') { this.pumpT = 1; G.audio.mech('pump'); } }, 260); }
    if (d.id === 'P19') this.slideT = 1;
    // som, ruído, luz, fumaça, cápsula
    G.audio.shot(d.sound);
    G.director.noise(p.eye, d.sup ? 12 : 95, d.sup ? 'supshot' : 'shot', 'player');
    p.muzzleT = d.sup ? 0.05 : 0.15; p.muzzleLight = d.sup ? 0.3 : 1;
    const mc = G.vm.muzzleCam(new THREE.Vector3());
    const mw = cam.localToWorld(mc.clone());
    if (!d.sup) G.fx.muzzleFlash(mw, d.rocket ? 3 : 1); else G.fx.muzzleFlash(mw, 0.15);
    G.fx.muzzleSmoke(mw, fwd);
    if (!d.rocket && d.id !== 'BRK8') {
      const right = _v.set(1, 0, 0).applyQuaternion(cam.quaternion).clone(), upv = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion).clone();
      G.fx.shell(cam.localToWorld(new THREE.Vector3(0.12, -0.1, -0.35)), right, upv);
    }
    if (A.mag === 0 && A.reserve > 0 && !d.rocket) setTimeout(() => { if (this.A.mag === 0) this.startReload(); }, 250);
    if (d.rocket && A.reserve > 0) setTimeout(() => this.startReload(), 400);
  }
  // disparo hitscan com penetração. Retorna {actor} ou null
  hitscan(origin, dir, d, primary) {
    const G = this.G, P = G.physics;
    let pen = d.pen || 0, mult = 1;
    const ignored = new Set();
    let o = origin.clone();
    let travelled = 0;
    let endPoint = null, result = null;
    for (let iter = 0; iter < 4; iter++) {
      const range = d.range - travelled;
      const wh = P.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, range, { ignore: (c) => ignored.has(c) });
      const ah = G.director.raycastActors(o, dir, wh ? wh.t : range, 'player');
      if (ah && (!wh || ah.t < wh.t)) {
        const dist = travelled + ah.t;
        if (ah.part === 'shield') {
          const hp = o.clone().addScaledVector(dir, ah.t);
          G.fx.impact(hp, dir.clone().negate(), 'metal'); G.audio.impact(hp, 'metal');
          G.hud.hitmarker('armor'); G.audio.hit('armor');
          ah.actor.onShieldHit && ah.actor.onShieldHit();
          endPoint = hp; break;
        }
        const base = this.currentDamage(d, dist) * mult;
        const k = ah.part === 'head' ? d.head : ah.part === 'legs' ? d.limb : 1;
        const hp = o.clone().addScaledVector(dir, ah.t);
        const killed = ah.actor.takeDamage(base * k, ah.part, dir, 'player', hp);
        if (ah.actor.isBoss) { G.fx.sparks(hp, ah.part === 'head' ? 14 : 6, 0.6); G.audio.impact(hp, 'metal'); }
        else { G.fx.blood(hp, dir, ah.part === 'head'); G.audio.impact(hp, 'flesh'); }
        G.stats.hits++;
        if (ah.actor.armored && ah.part !== 'head') G.audio.hit('armor');
        G.hud.hitmarker(killed ? 'kill' : ah.part === 'head' ? 'head' : 'hit');
        G.audio.hit(killed ? 'kill' : ah.part === 'head' ? 'head' : 'hit');
        if (killed) { G.stats.kills++; if (ah.part === 'head') G.stats.headshots++; G.director.onPlayerKill(ah.actor, dist, false); }
        result = { actor: ah.actor };
        endPoint = hp; break;
      }
      if (!wh) { endPoint = o.clone().addScaledVector(dir, range); break; }
      const hp = new THREE.Vector3(wh.x, wh.y, wh.z), n = new THREE.Vector3(wh.nx, wh.ny, wh.nz);
      const mat = wh.water ? 'water' : wh.terrain ? 'concrete' : wh.col.mat;
      G.fx.impact(hp, n, mat);
      if (primary || Math.random() < 0.3) G.audio.impact(hp, mat);
      G.director.noise(hp, 3.5, 'impact', 'player');
      if (wh.col && wh.col.hp !== undefined) G.level.damageDestructible(wh.col, this.currentDamage(d, travelled + wh.t) * mult, hp);
      endPoint = hp;
      if (wh.col && (wh.col.thin || RES[wh.col.mat] < 1) && pen >= (RES[wh.col.mat] ?? 9)) {
        pen -= RES[wh.col.mat]; mult *= 0.6;
        ignored.add(wh.col);
        travelled += wh.t;
        o = hp.clone().addScaledVector(dir, 0.02);
        continue;
      }
      break;
    }
    // supressão nos inimigos próximos da trajetória
    if (endPoint) G.director.suppressAlong(origin, endPoint, d.id === 'VK12' ? 0.45 : d.id === 'BRK8' ? 0.3 : 0.22, result && result.actor);
    return result;
  }
  throwNade(kind, cooked) {
    const G = this.G, cam = G.camera;
    this.nades[kind]--;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const o = cam.localToWorld(new THREE.Vector3(-0.15, -0.05, -0.4));
    const vel = fwd.clone().multiplyScalar(kind === 'frag' ? 17 : 16).add(new THREE.Vector3(0, 3.2, 0)).add(G.player.vel.clone().multiplyScalar(0.5));
    const fuse = kind === 'frag' ? 3.5 - cooked : kind === 'flash' ? 1.5 : 1.2;
    this.spawnNade(o, vel, kind, fuse, 'player');
    this.G.audio.mech('swap');
    this.G.stats.grenades++;
  }
  spawnNade(pos, vel, kind, fuse, owner) {
    const G = this.G;
    const col = kind === 'frag' ? 0x3d4232 : kind === 'flash' ? 0x555a60 : 0x6a6a5a;
    const mesh = new THREE.Mesh(kind === 'frag' ? new THREE.SphereGeometry(0.05, 8, 6) : new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    mesh.position.copy(pos); mesh.castShadow = true;
    G.scene.add(mesh);
    const pr = { type: 'nade', kind, pos: pos.clone(), vel: vel.clone(), fuse, owner, mesh, rest: false, warned: false };
    this.projectiles.push(pr);
    return pr;
  }
  launchRocket(pos, dir) {
    const G = this.G;
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x3d4232 }));
    mesh.position.copy(pos); G.scene.add(mesh);
    this.projectiles.push({ type: 'rocket', pos: pos.clone(), vel: dir.clone().multiplyScalar(65), life: 6, owner: 'player', mesh });
    G.director.noise(pos, 90, 'shot', 'player');
  }
  _updateProjectiles(dt) {
    const G = this.G, P = G.physics;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.type === 'rocket') {
        pr.life -= dt;
        const step = pr.vel.length() * dt;
        const dir = pr.vel.clone().normalize();
        const wh = P.raycast(pr.pos.x, pr.pos.y, pr.pos.z, dir.x, dir.y, dir.z, step, {});
        const ah = G.director.raycastActors(pr.pos, dir, wh ? wh.t : step, pr.owner, true);
        let hitPos = null;
        if (ah && (!wh || ah.t < wh.t)) hitPos = pr.pos.clone().addScaledVector(dir, ah.t);
        else if (wh) hitPos = new THREE.Vector3(wh.x, wh.y, wh.z).addScaledVector(dir, -0.2);
        if (hitPos || pr.life <= 0) {
          this.explode(hitPos || pr.pos, 'rocket', pr.owner);
          G.scene.remove(pr.mesh); this.projectiles.splice(i, 1); continue;
        }
        pr.pos.addScaledVector(pr.vel, dt); pr.vel.y -= 1.5 * dt;
        pr.mesh.position.copy(pr.pos); pr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        G.fx.add.spawn(pr.pos.x, pr.pos.y, pr.pos.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), 0.15, 0.5, 1, 0.6, 0.25, 1, 0, 2, 2);
        G.fx.norm.spawn(pr.pos.x, pr.pos.y, pr.pos.z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), rand(1.5, 3), 0.5, 0.5, 0.5, 0.5, 0.5, -0.1, 0.5, 0.8);
        continue;
      }
      // granada
      pr.fuse -= dt;
      if (!pr.rest) {
        pr.vel.y -= 18 * dt;
        const sp = pr.vel.length();
        const dir = pr.vel.clone().divideScalar(sp || 1);
        const wh = P.raycast(pr.pos.x, pr.pos.y, pr.pos.z, dir.x, dir.y, dir.z, sp * dt + 0.06, { noWater: false });
        if (wh) {
          pr.pos.set(wh.x, wh.y, wh.z).addScaledVector(new THREE.Vector3(wh.nx, wh.ny, wh.nz), 0.06);
          const n = new THREE.Vector3(wh.nx, wh.ny, wh.nz);
          pr.vel.reflect(n).multiplyScalar(0.35);
          if (wh.ny > 0.5) { pr.vel.x *= 0.7; pr.vel.z *= 0.7; }
          if (sp > 2) G.audio.grenadeBounce(pr.pos);
          if (pr.vel.length() < 1.2 && wh.ny > 0.5) { pr.rest = true; pr.vel.set(0, 0, 0); }
          if (wh.water) { pr.rest = true; }
        } else pr.pos.addScaledVector(pr.vel, dt);
        pr.mesh.position.copy(pr.pos);
        pr.mesh.rotation.x += dt * 8; pr.mesh.rotation.z += dt * 5;
      }
      // aviso de granada (inimigos e jogador)
      if (pr.kind === 'frag' && !pr.warned && pr.pos.distanceTo(G.player.pos) < 9 && pr.owner !== 'player') { pr.warned = true; G.allies && G.allies.callout('grenade'); }
      if (pr.kind === 'frag' && pr.owner === 'player') G.director.grenadeDanger(pr.pos, pr.fuse);
      if (pr.fuse <= 0) {
        G.scene.remove(pr.mesh); this.projectiles.splice(i, 1);
        this.explode(pr.pos, pr.kind, pr.owner);
      }
    }
  }
  // explosões de todos os tipos
  explode(pos, kind, owner) {
    const G = this.G, P = G.physics, p = G.player;
    if (kind === 'flash') {
      G.fx.flashLight(pos, 0xffffff, 3000, 0.25);
      G.fx.sparks(pos, 30, 1.2);
      G.audio.flashbang(pos);
      G.director.flashbang(pos);
      // jogador
      const d = pos.distanceTo(p.eye);
      if (d < 20 && P.los(pos.x, pos.y + 0.2, pos.z, p.eye.x, p.eye.y, p.eye.z)) {
        const fwd = G.camera.getWorldDirection(new THREE.Vector3());
        const look = clamp(fwd.dot(pos.clone().sub(p.eye).normalize()), 0, 1);
        const k = clamp((1 - d / 20) * (0.35 + look * 0.9), 0, 1);
        p.flash = Math.max(p.flash, k * 3.5);
        if (k > 0.3) G.audio.ring(k * 3);
      }
      G.director.noise(pos, 40, 'explosion', owner);
      return;
    }
    if (kind === 'smoke') {
      G.fx.smokeCloud(pos, 18);
      G.director.addSmoke(pos, 18);
      G.audio.mech('pin');
      return;
    }
    const big = kind === 'mortar' || kind === 'rocket' || kind === 'barrel';
    const radius = kind === 'mortar' ? 9 : kind === 'rocket' ? 6.5 : kind === 'barrel' ? 6 : 7;
    const maxDmg = kind === 'mortar' ? 260 : kind === 'rocket' ? 400 : kind === 'barrel' ? 180 : 210;
    G.fx.explosion(pos, big ? 1.4 : 1);
    G.audio.explosion(pos, big ? 1.4 : 1);
    G.director.noise(pos, 130, 'explosion', owner);
    G.director.explosionDamage(pos, radius, maxDmg, owner, kind);
    // jogador
    const d = pos.distanceTo(p.eye);
    if (d < radius * 1.1 && P.los(pos.x, pos.y + 0.3, pos.z, p.eye.x, p.eye.y - 0.6, p.eye.z)) {
      const dmg = maxDmg * Math.pow(1 - d / (radius * 1.1), 1.3) * (owner === 'player' ? 0.75 : 1) * (kind === 'mortar' ? 0.6 : 1);
      p.takeDamage(dmg, pos, kind);
    }
    p.shake(clamp(1.2 - d / 40, 0, 1) * (big ? 1.3 : 0.9));
    // destrutíveis
    P.forEachInRect(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, (c) => { if (c.hp !== undefined && c.active) (this._dq || (this._dq = [])).push(c); });
    if (this._dq) { for (const c of this._dq) { const cc = new THREE.Vector3((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2); const dd = cc.distanceTo(pos); if (dd < radius) G.level.damageDestructible(c, maxDmg * (1 - dd / radius), cc); } this._dq = null; }
    if (kind === 'frag' || kind === 'mortar') G.fx.addEmitter({ kind: 'fire', pos: pos.clone(), t: 1.2, scale: 0.4 });
  }
  knife() {
    const G = this.G, p = G.player;
    this.melee = 1; this.meleeSeq++; this.reload = null;
    const t = G.director.meleeTarget(p.pos, G.camera.getWorldDirection(new THREE.Vector3()));
    if (t && t.unaware) {
      G.audio.mech('knife');
      t.enemy.takeDamage(999, 'body', new THREE.Vector3(), 'player', t.enemy.chestPos(), true);
      G.stats.kills++; G.stats.stealthKills++;
      G.director.onPlayerKill(t.enemy, 1, true);
      G.director.noise(p.pos, 2.5, 'takedown', 'player');
      G.hud.hitmarker('kill');
      p.lockLook(0.5, t.enemy.chestPos());
    } else if (t) {
      G.audio.mech('melee');
      const killed = t.enemy.takeDamage(55, 'body', G.camera.getWorldDirection(new THREE.Vector3()), 'player', t.enemy.chestPos());
      G.hud.hitmarker(killed ? 'kill' : 'hit');
      if (killed) { G.stats.kills++; G.director.onPlayerKill(t.enemy, 1, false); }
      t.enemy.stagger = 0.8;
    } else G.audio.mech('knife');
  }
  designate() {
    const G = this.G, cam = G.camera;
    if (this.adsT < 0.5) { G.hud.toast('Mire (botão direito) para designar'); return; }
    const o = cam.getWorldPosition(new THREE.Vector3()), dir = cam.getWorldDirection(new THREE.Vector3());
    const wh = G.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 400, {});
    const ah = G.director.raycastActors(o, dir, wh ? wh.t : 400, 'player');
    let point, actor = null;
    if (ah && (!wh || ah.t < wh.t)) { point = o.clone().addScaledVector(dir, ah.t); actor = ah.actor; }
    else if (wh) point = new THREE.Vector3(wh.x, wh.y, wh.z);
    else { G.hud.toast('Sem retorno do laser'); return; }
    this.laserBeam = 1.2; this.laserPoint = point.clone();
    G.audio.mech('laser');
    G.support.designate(point, actor);
  }
  vmState(input, time) {
    const p = this.G.player, d = this.def;
    return {
      id: d.id, adsT: this.adsT, sprintT: p.sprintT, crouch: p.stance !== 'stand' ? 1 : 0, speed: p.hSpeed, onGround: p.body.onGround,
      mouseDX: input.mouseDX, mouseDY: input.mouseDY, lean: p.leanT, time,
      reload: this.reload ? { t: this.reload.t, empty: this.reload.empty, shellPhase: this.reload.shellPhase } : null,
      swap: this.swap, melee: this.melee, meleeSeq: this.meleeSeq, grenade: this.grenade, grenadeHold: !!this.cooking,
      pumpT: this.pumpT, slideT: this.slideT, scoped: d.scope && this.adsT > 0.92, loaded: d.rocket ? this.A.mag > 0 : true,
    };
  }
}
