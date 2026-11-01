// Controlador do jogador: olhar, andar/correr/agachar/deitar/deslizar, pular, mantle, inclinar,
// água/afogamento, queda, vida com regeneração, visibilidade para a IA, câmera.
import * as THREE from 'three';
import { clamp, lerp, damp, rand } from '../core/utils.js';

const EYE = { stand: 1.65, crouch: 0.98, prone: 0.38 };
const HEIGHT = { stand: 1.8, crouch: 1.2, prone: 0.6 };
const SPEED = { stand: 4.2, crouch: 2.2, prone: 1.0 };

export class Player {
  constructor(G) {
    this.G = G;
    this.body = { x: 0, y: 0, z: 0, vy: 0, r: 0.32, h: 1.8, onGround: true, step: 0.5 };
    this.pos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset(new THREE.Vector3(), 0);
  }
  reset(p, yaw) {
    const b = this.body;
    b.x = p.x; b.y = p.y; b.z = p.z; b.vy = 0; b.onGround = true; b.h = 1.8;
    this.pos.set(p.x, p.y, p.z);
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.stance = 'stand'; this.eyeH = EYE.stand;
    this.vel.set(0, 0, 0); this.hSpeed = 0;
    this.hp = 100; this.regenT = 0; this.dead = false; this.locked = false;
    this.sprinting = false; this.sprintT = 0; this.slide = 0; this.slideDir = new THREE.Vector3();
    this.lean = 0; this.leanT = 0;
    this.mantle = null;
    this.stepDist = 0; this.muzzleT = 0; this.muzzleLight = 0;
    this.flash = 0; this.damagePulse = 0; this.suppress = 0;
    this.shakeAmt = 0; this.shakeOff = new THREE.Vector2();
    this.breath = 8; this.underwater = 0;
    this.visibility = 0.3; this.light = 0.2;
    this.lookLock = null;
    this.fallStartY = p.y;
    this.zone = null;
    this.heartT = 0;
    this.stationaryT = 0;
    this.updateEye();
  }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  chestPos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH - 0.35, this.pos.z); }
  updateEye() { this.eye.set(this.body.x, this.body.y + this.eyeH, this.body.z); }
  shake(a) { this.shakeAmt = Math.min(1.5, this.shakeAmt + a); }
  lockLook(t, target) { this.lookLock = { t, target: target.clone() }; }
  setStance(s) {
    if (s === this.stance) return true;
    const P = this.G.physics, b = this.body;
    if (HEIGHT[s] > b.h && P.boxBlocked(b.x - 0.28, b.y + b.h, b.z - 0.28, b.x + 0.28, b.y + HEIGHT[s], b.z + 0.28)) return false;
    this.stance = s; b.h = HEIGHT[s];
    return true;
  }
  takeDamage(amount, fromPos, kind = 'bullet') {
    if (this.dead || this.G.godMode) return;
    const G = this.G;
    const dmg = amount * (kind === 'bullet' ? G.diff.dmgTaken : 1);
    this.hp -= dmg;
    this.regenT = 4.5;
    this.damagePulse = Math.min(1, this.damagePulse + dmg / 40);
    if (fromPos) G.hud.damageFrom(fromPos);
    this.shake(Math.min(0.4, dmg / 60));
    G.stats.damageTaken += dmg;
    if (this.hp <= 0) { this.hp = 0; this.die(kind); }
  }
  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = cause;
    this.G.onPlayerDeath(cause);
  }
  // supressão (balas passando perto)
  suppressHit(amount) { this.suppress = Math.min(1, this.suppress + amount); }

  update(dt, input) {
    const G = this.G, P = G.physics, b = this.body, W = G.weapons;
    const can = !this.dead && !this.locked;
    // ---------- olhar ----------
    const sens = G.settings.sens * 0.0022 * (W.adsT > 0 ? lerp(1, 1 / (W.def.zoom || 1) * 1.15, W.adsT) : 1);
    if (can) { this.yaw -= input.mouseDX * sens; this.pitch -= input.mouseDY * sens * (G.settings.invertY ? -1 : 1); }
    if (this.lookLock) {
      this.lookLock.t -= dt;
      const d = this.lookLock.target.clone().sub(this.eye);
      const ty = Math.atan2(-d.x, -d.z), tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      this.yaw += Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw)) * Math.min(1, dt * 10);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 10);
      if (this.lookLock.t <= 0) this.lookLock = null;
    }
    // respiração segurada na luneta
    if (W.def.scope && W.adsT > 0.9) {
      const steady = input.down('ShiftLeft') && this.breath > 0;
      if (steady) this.breath -= dt; else this.breath = Math.min(8, this.breath + dt * 0.8);
      const sw = steady ? 0.0002 : 0.0016;
      this.yaw += Math.sin(G.time * 0.9) * sw * 0.5; this.pitch += Math.sin(G.time * 1.3) * sw * 0.4;
    }
    this.pitch = clamp(this.pitch, -1.5, 1.5);

    // ---------- postura ----------
    if (can && (input.pressed('KeyC') || input.pressed('ControlLeft'))) {
      if (this.sprinting && b.onGround && this.slide <= 0) {
        this.slide = 0.8; this.slideDir.copy(this.forward); this.setStance('crouch'); G.audio.footstep('grass', 1.5);
      } else this.setStance(this.stance === 'crouch' ? 'stand' : 'crouch');
    }
    if (can && input.pressed('KeyZ')) this.setStance(this.stance === 'prone' ? 'crouch' : 'prone');

    // ---------- movimento ----------
    let fx = 0, fz = 0;
    if (can) {
      if (input.down('KeyW')) fz += 1; if (input.down('KeyS')) fz -= 1;
      if (input.down('KeyD')) fx += 1; if (input.down('KeyA')) fx -= 1;
    }
    const fwd = this.forward, rgt = this.right;
    const wish = new THREE.Vector3().addScaledVector(fwd, fz).addScaledVector(rgt, fx);
    if (wish.lengthSq() > 1) wish.normalize();
    const wantSprint = can && input.down('ShiftLeft') && fz > 0 && W.adsT < 0.3 && !(W.def.scope && W.adsT > 0) && this.stance !== 'prone' && this.slide <= 0;
    if (wantSprint && this.stance === 'crouch') this.setStance('stand');
    this.sprinting = wantSprint && this.stance === 'stand' && b.onGround && !W.cooking;
    this.sprintT = damp(this.sprintT, this.sprinting ? 1 : 0, 10, dt);
    // água
    const wl = P.waterLevel(b.x, b.z);
    const depth = wl - b.y;
    this.inWater = depth > 0.05;
    const waterSlow = depth > 0 ? clamp(1 - depth * 0.45, 0.45, 1) : 1;
    let speed = (this.sprinting ? 6.8 : SPEED[this.stance]) * (1 - W.adsT * 0.4) * (W.def.move || 1) * waterSlow;
    if (this.slide > 0) {
      this.slide -= dt;
      const s = 9 * Math.max(0, this.slide / 0.8);
      this.vel.x = this.slideDir.x * s; this.vel.z = this.slideDir.z * s;
      if (this.slide <= 0) this.slide = 0;
    } else if (b.onGround) {
      const accel = 40;
      this.vel.x = damp(this.vel.x, wish.x * speed, accel / speed, dt);
      this.vel.z = damp(this.vel.z, wish.z * speed, accel / speed, dt);
    } else {
      this.vel.x += wish.x * 6 * dt; this.vel.z += wish.z * 6 * dt;
      const hs = Math.hypot(this.vel.x, this.vel.z), lim = Math.max(speed, 4.5);
      if (hs > lim) { this.vel.x *= lim / hs; this.vel.z *= lim / hs; }
    }
    // pulo / mantle
    if (can && input.pressed('Space')) {
      if (!this.tryMantle() && b.onGround && this.stance !== 'prone') {
        if (this.stance === 'crouch') this.setStance('stand');
        else { b.vy = 4.6; b.onGround = false; }
      } else if (this.stance === 'prone') this.setStance('crouch');
    }
    if (this.mantle) {
      const m = this.mantle;
      m.t += dt / m.dur;
      const t = Math.min(1, m.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      b.x = lerp(m.from.x, m.to.x, e); b.z = lerp(m.from.z, m.to.z, e);
      b.y = lerp(m.from.y, m.to.y, Math.min(1, t * 1.6));
      b.vy = 0;
      if (t >= 1) { this.mantle = null; b.onGround = true; }
    } else {
      const prevY = b.y;
      const wasGround = b.onGround;
      P.moveBody(b, this.vel.x * dt, this.vel.z * dt, dt, true);
      if (b.onGround && !wasGround) {
        const fall = this.fallStartY - b.y;
        if (fall > 4.2) { this.takeDamage((fall - 4) * 14, null, 'fall'); }
        G.vm.land(b.landSpeed || 0);
        if ((b.landSpeed || 0) > 3) G.audio.footstep(this.surface(), 1.4);
      }
      if (b.onGround) this.fallStartY = b.y; else this.fallStartY = Math.max(this.fallStartY, b.y);
      if (this.inWater && b.vy < -2) { b.vy *= 0.9; }
    }
    this.pos.set(b.x, b.y, b.z);
    this.hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (b.onGround && this.hSpeed > 0.3 && !this.mantle) {
      const moved = this.hSpeed * dt;
      this.stepDist += moved;
      const stride = this.sprinting ? 2.4 : this.stance === 'crouch' ? 1.6 : 2.0;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const s = this.inWater ? 'water' : this.surface();
        const vol = this.sprinting ? 1.1 : this.stance === 'stand' ? 0.7 : 0.35;
        G.audio.footstep(s, vol);
        const rainMask = this.zone && !this.zone.indoor ? 0.7 : 1;
        const rad = (this.sprinting ? 14 : this.stance === 'stand' ? 6 : this.stance === 'crouch' ? 2 : 1) * rainMask * (this.inWater ? 1.6 : 1);
        G.director.noise(this.pos, rad, 'step', 'player');
        if (this.inWater) G.fx.splash(this.pos.clone().setY(wl), 0.6);
      }
    }
    this.stationaryT = this.hSpeed < 0.5 ? this.stationaryT + dt : 0;
    // ---------- inclinação ----------
    let leanTarget = 0;
    if (can && this.slide <= 0 && !this.sprinting) { if (input.down('KeyQ')) leanTarget -= 1; if (input.down('KeyE')) leanTarget += 1; }
    if (leanTarget !== 0) {
      // não atravessar paredes
      const side = this.right.multiplyScalar(leanTarget * 0.62);
      const h = P.raycast(this.eye.x, this.eye.y, this.eye.z, side.x / 0.62 * Math.sign(leanTarget) * Math.sign(leanTarget), 0, side.z / 0.62, 0.75, {});
      if (h) leanTarget *= clamp((h.t - 0.2) / 0.62, 0, 1);
    }
    this.leanT = damp(this.leanT, leanTarget, 9, dt);
    // altura dos olhos
    this.eyeH = damp(this.eyeH, EYE[this.stance] - (this.slide > 0 ? 0.25 : 0), 12, dt);
    this.updateEye();
    // ---------- água / ar ----------
    const eyeUnder = wl > this.eye.y - 0.05;
    this.underwater = damp(this.underwater, eyeUnder ? 1 : 0, 8, dt);
    if (eyeUnder) {
      this.breath -= dt;
      if (this.breath < 0) { this.takeDamage(20 * dt, null, 'drown'); }
    } else if (!(W.def.scope && W.adsT > 0.9)) this.breath = Math.min(8, this.breath + dt * 2);
    if (b.y < -60) this.die('fall');
    // ---------- vida ----------
    if (!this.dead) {
      this.regenT -= dt;
      if (this.regenT <= 0 && this.hp < 100) this.hp = Math.min(100, this.hp + 25 * dt);
      if (this.hp < 40) { this.heartT -= dt; if (this.heartT <= 0) { G.audio.heartbeat(); this.heartT = 0.75 + this.hp / 80; } }
    }
    this.damagePulse = damp(this.damagePulse, 0, 2.2, dt);
    this.suppress = damp(this.suppress, 0, 1.6, dt);
    this.flash = Math.max(0, this.flash - dt);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    // ---------- visibilidade para a IA ----------
    this.zone = G.zoneAt(this.pos);
    this.light = G.lights.lightAt(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z), this.zone);
    const stanceK = this.stance === 'stand' ? 1 : this.stance === 'crouch' ? 0.7 : 0.45;
    const moveK = this.sprinting ? 1.3 : this.hSpeed > 0.5 ? 1.0 : 0.85;
    const muzzle = this.muzzleT > 0 ? this.muzzleLight : 0;
    const motion = (this.stance === 'stand' && this.hSpeed > 0.5 ? 0.12 : 0) + (this.sprinting ? 0.15 : 0);
    this.visibility = clamp((this.light + muzzle) * stanceK * moveK + motion, 0.05, 1.5);
    // ---------- câmera ----------
    this.shakeAmt = damp(this.shakeAmt, 0, 5, dt);
    const sh = this.shakeAmt * this.shakeAmt;
    const cam = G.camera;
    const leanOff = this.right.multiplyScalar(this.leanT * 0.6);
    cam.position.set(this.eye.x + leanOff.x, this.eye.y - Math.abs(this.leanT) * 0.08, this.eye.z + leanOff.z);
    const bobK = b.onGround && !this.mantle ? clamp(this.hSpeed / 6, 0, 1) * (1 - W.adsT * 0.8) : 0;
    this._bob = (this._bob || 0) + dt * (5 + this.hSpeed * 1.2);
    cam.position.y += Math.sin(this._bob * 2) * 0.025 * bobK;
    if (this.mantle) cam.position.y -= Math.sin(this.mantle.t * Math.PI) * 0.15;
    this.roll = damp(this.roll, -this.leanT * 0.17 + (this.slide > 0 ? 0.05 : 0), 10, dt);
    cam.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.05, this.yaw + (Math.random() - 0.5) * sh * 0.05, this.roll + (Math.random() - 0.5) * sh * 0.02, 'YXZ');
    const baseFov = G.settings.fov;
    const zoom = lerp(1, W.def.zoom || 1, W.adsT);
    const fov = baseFov / zoom + this.sprintT * 4 + (this.slide > 0 ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = damp(cam.fov, fov, 18, dt); cam.updateProjectionMatrix(); }
  }
  surface() {
    const z = this.zone;
    const P = this.G.physics;
    let mat = null;
    P.forEachInRect(this.pos.x - 0.1, this.pos.z - 0.1, this.pos.x + 0.1, this.pos.z + 0.1, (c) => { if (Math.abs(c.maxY - this.pos.y) < 0.1) mat = c.mat; });
    if (mat === 'metal') return 'metal';
    if (!mat) return P.terrainH(this.pos.x, this.pos.z) > this.pos.y - 0.2 && (!z || !z.indoor) ? 'grass' : 'concrete';
    return 'concrete';
  }
  tryMantle() {
    const P = this.G.physics, b = this.body;
    const f = this.forward;
    const px = b.x + f.x * 0.75, pz = b.z + f.z * 0.75;
    let top = -1e9, bad = false;
    P.forEachInRect(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, (c) => {
      if (c.noCollide || c.invisible) return;
      if (c.maxY > b.y + 0.45 && c.maxY <= b.y + 1.5) { if (c.noMantle) bad = true; if (c.maxY > top) top = c.maxY; }
      else if (c.maxY > b.y + 1.5 && c.minY < b.y + 1.5) bad = true;
    });
    if (bad || top < -1e8) return false;
    const tx = b.x + f.x * 1.0, tz = b.z + f.z * 1.0;
    if (P.boxBlocked(tx - 0.3, top + 0.05, tz - 0.3, tx + 0.3, top + 1.15, tz + 0.3)) return false;
    if (P.boxBlocked(b.x - 0.3, b.y + 1.0, b.z - 0.3, b.x + 0.3, top + 1.2, b.z + 0.3)) return false;
    this.mantle = { t: 0, dur: 0.42, from: new THREE.Vector3(b.x, b.y, b.z), to: new THREE.Vector3(tx, top, tz) };
    if (this.stance === 'prone') this.setStance('crouch');
    this.G.audio.footstep('metal', 0.6);
    return true;
  }
}
