// Aliados (Trovão e Faísca): seguem em formação, procuram cobertura perto do jogador, atiram com
// dano reduzido (não roubam protagonismo), avisam ameaças, nunca morrem, teletransporte de segurança.
import * as THREE from 'three';
import { createSoldier } from '../actors/soldier.js';
import { clamp, rand, pick, dampAngle, angleWrap } from '../core/utils.js';

const LINES = {
  sniper: { TROVÃO: ['Atirador! No alto, cuidado com o reflexo!', 'Brilho de luneta! Atirador!'], FAÍSCA: ['Atirador lá em cima! Abaixa!'] },
  heavy: { TROVÃO: ['Pesado chegando! Mira na cabeça!', 'Blindado! Explosivo nele!'], FAÍSCA: ['Pesado! Esse aí não cai fácil!'] },
  shield: { TROVÃO: ['Escudo! Flash ou flanco!'], FAÍSCA: ['Escudo balístico! Joga uma flash!'] },
  grenade: { TROVÃO: ['Granada! Sai daí!'], FAÍSCA: ['GRANADA!'] },
  flankL: { TROVÃO: ['Flanqueando pela esquerda!'], FAÍSCA: ['Tem um vindo pela esquerda!'] },
  flankR: { TROVÃO: ['Flanqueando pela direita!'], FAÍSCA: ['Pela direita, pela direita!'] },
  clear: { TROVÃO: ['Limpo.', 'Área limpa. Avança.', 'Limpo. Recarrega enquanto dá.'], FAÍSCA: ['Limpo!', 'Acho que acabou. Por enquanto.'] },
  reload: { TROVÃO: ['Recarregando, cobre!'], FAÍSCA: ['Trocando pente!'] },
  kill: { TROVÃO: ['Abatido.', 'Um a menos.', 'Boa, Eco.'], FAÍSCA: ['Esse já era!', 'Bela!'] },
  enemyReload: { TROVÃO: ['Ele tá recarregando, avança!'], FAÍSCA: ['Tá recarregando! Agora!'] },
  turret: { TROVÃO: ['Metralhadora montada! Não fica na linha dela!'], FAÍSCA: ['Ninho de MG! Flanqueia ou explode!'] },
};

class Ally {
  constructor(G, name, style, offset) {
    this.G = G; this.name = name;
    this.model = createSoldier(G.scene, style, G.level.T);
    this.model.addStrobe(G.level.T);
    this.body = { x: 0, y: 0, z: 0, vy: 0, r: 0.3, h: 1.75, onGround: true, step: 0.55 };
    this.pos = new THREE.Vector3();
    this.offset = offset;
    this.yaw = 0; this.target = null; this.fireCd = 0; this.burst = 0;
    this.path = null; this.pathIdx = 0; this.goal = null; this.repathT = 0;
    this.crouch = 0; this.speedNow = 0; this.stuckT = 0;
    this.script = null; this.cover = null; this.coverT = 0;
    this.status = 'Seguindo';
    this.hitT = 0;
  }
  place(p, yaw = 0) { this.body.x = p.x; this.body.y = p.y; this.body.z = p.z; this.body.vy = 0; this.pos.copy(p); this.yaw = yaw; this.path = null; this.goal = null; }
  chestPos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.model.hips.position.y + 0.35, this.pos.z); }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.model.hips.position.y + 0.7, this.pos.z); }
  onHit() { this.hitT = 0.3; this.model.hitFlash(); }
  setGoal(p) {
    if (this.goal && this.goal.distanceTo(p) < 1.5) return;
    this.goal = p.clone(); this.path = null; this.pathIdx = 0;
    this.path = this.G.nav.findPath(this.pos.x, this.pos.y, this.pos.z, p.x, p.y, p.z, 5000);
  }
  update(dt, mgr) {
    const G = this.G, pl = G.player;
    this.fireCd -= dt; this.hitT -= dt;
    const enemies = G.director.enemies;
    const combat = G.director.anyAware();
    let speed = 0;
    // ---- destino ----
    let dest;
    if (this.script) {
      dest = this.script.pos;
      this.status = this.script.status || 'Em posição';
    } else if (combat) {
      this.status = 'Cobrindo';
      this.coverT -= dt;
      if (!this.cover || this.coverT <= 0 || this.cover.pos.distanceTo(pl.pos) > 14) {
        const near = G.director.alive((e) => e.inCombat).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
        this.coverT = 3;
        if (near) {
          const opts = G.director.coverNear(pl.pos, 12).filter((c) => !c.occ && !mgr.list.some((o) => o !== this && o.cover === c));
          let best = null, bs = -1e9;
          for (const c of opts) {
            const toT = near.pos.clone().sub(c.pos).setY(0).normalize();
            const s = -c.n.dot(toT) * 10 - c.pos.distanceTo(pl.pos) * 0.5 - c.pos.distanceTo(this.pos) * 0.3 + (c.pos.distanceTo(pl.pos) < 3 ? -10 : 0);
            if (s > bs) { bs = s; best = c; }
          }
          this.cover = best;
        }
      }
      dest = this.cover ? this.cover.pos : this.formationPos();
    } else {
      this.cover = null;
      this.status = G.mission && G.mission.stealth ? 'Furtivo' : 'Seguindo';
      dest = this.formationPos();
    }
    // ---- movimento ----
    const dToDest = Math.hypot(dest.x - this.pos.x, dest.z - this.pos.z);
    const dToPlayer = this.pos.distanceTo(pl.pos);
    const far = dToPlayer > 40 || Math.abs(this.pos.y - pl.pos.y) > 8;
    if (far && !this.script && !this.visibleToPlayer()) { const p = this.behindPlayer(); if (p) { this.place(p, pl.yaw); return; } }
    if (dToDest > 1.2) {
      this.repathT -= dt;
      if (!this.goal || this.goal.distanceTo(dest) > 2.5 || this.repathT <= 0) { this.setGoal(dest); this.repathT = 1.2; }
      let wp = dest;
      if (this.path && this.path.length) {
        while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - this.pos.x, this.path[this.pathIdx].z - this.pos.z) < 0.8) this.pathIdx++;
        wp = this.path[this.pathIdx];
      }
      const run = dToDest > 8 || combat || (this.script && this.script.run);
      speed = run ? 4.6 : (this.crouch > 0.5 ? 2.0 : 3.6);
      if (dToPlayer > 18) speed = 5.6;
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      let vx = (dx / d) * speed, vz = (dz / d) * speed;
      // não ficar na frente do jogador
      const toMe = this.pos.clone().sub(pl.pos);
      if (toMe.length() < 1.6) { toMe.normalize(); vx += toMe.x * 3; vz += toMe.z * 3; }
      const before = this.pos.clone();
      G.physics.moveBody(this.body, vx * dt, vz * dt, dt, true);
      this.pos.set(this.body.x, this.body.y, this.body.z);
      this.speedNow = before.distanceTo(this.pos) / Math.max(dt, 1e-4);
      if (this.speedNow < 0.2) this.stuckT += dt; else this.stuckT = 0;
      if (this.stuckT > 2.5) { this.stuckT = 0; this.goal = null; if (!this.visibleToPlayer()) { const p = this.behindPlayer(); if (p) this.place(p, pl.yaw); } }
      this.wantYaw = Math.atan2(dx, dz);
    } else {
      G.physics.moveBody(this.body, 0, 0, dt, true);
      this.pos.set(this.body.x, this.body.y, this.body.z);
      this.speedNow = 0;
      this.wantYaw = this.script && this.script.yaw !== undefined ? this.script.yaw : pl.yaw + Math.PI + (this.offset.x > 0 ? -0.5 : 0.5);
    }
    if (this.body.y < -60) { const p = this.behindPlayer(); if (p) this.place(p, pl.yaw); }
    // ---- alvo e disparo ----
    this.target = null;
    if (combat && !(this.script && this.script.holdFire)) {
      let best = null, bs = -1e9;
      const eye = this.eyePos();
      for (const e of enemies) {
        if (e.dead || !e.inCombat) continue;
        const d = e.pos.distanceTo(this.pos);
        if (d > 70) continue;
        let s = -d;
        if (e.target === 'player' && e.canSee) s += 25;
        if (e.pos.distanceTo(pl.pos) < 12) s += 15;
        if (e.hp < e.maxHp * 0.35) s += 12;
        if (s > bs) { const c = e.chestPos(); if (G.physics.los(eye.x, eye.y, eye.z, c.x, c.y, c.z)) { bs = s; best = e; } }
      }
      this.target = best;
    }
    if (this.target) {
      const t = this.target;
      this.wantYaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (this.fireCd <= 0 && Math.abs(angleWrap(this.wantYaw - this.yaw)) < 0.3) {
        if (this.burst <= 0) { this.burst = 3 + Math.floor(Math.random() * 4); }
        this.burst--;
        this.fireCd = this.burst > 0 ? 0.11 : rand(1.2, 2.4);
        this.shoot(t);
      }
    }
    this.yaw = dampAngle(this.yaw, this.wantYaw ?? this.yaw, 6, dt);
    // ---- postura ----
    const stealth = G.mission && G.mission.stealth && !combat;
    const wantCrouch = (stealth && (pl.stance !== 'stand' || this.speedNow < 0.3)) || (combat && this.cover && this.cover.low && this.speedNow < 0.5 && this.fireCd > 0.3) || (this.script && this.script.crouch);
    this.crouch = wantCrouch ? 1 : 0;
    this.model.setPose(this.pos, this.yaw);
    this.model.aimPitch = 0;
    this.model.animate(dt, this.speedNow, this.crouch, G.time);
    // estroboscópio IR (só na NVG)
    const on = G.nvg && Math.sin(G.time * 6 + this.offset.x) > 0.85;
    this.model.strobe.material.opacity = on ? 1 : 0;
  }
  shoot(e) {
    const G = this.G;
    const muzzle = this.model.muzzleWorld(new THREE.Vector3());
    this.model.muzzleFlash();
    G.audio.shot('KR7', muzzle, { vol: 0.8 });
    const c = e.chestPos();
    // aliados suprimem mais do que matam: o protagonismo é do jogador
    const pl = G.player;
    const playerBusy = G.time - G.weapons.lastShot < 3;
    const inTrouble = pl.hp < 50;
    const hit = Math.random() < (inTrouble ? 0.4 : 0.26) * (1 - e.suppression * 0.2);
    const aim = hit ? c : c.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)));
    if (Math.random() < 0.4) G.fx.tracer(muzzle, aim, 0xffb060, 350, 5);
    e.suppression = Math.min(1, e.suppression + 0.25);
    if (hit) {
      const finishing = e.hp < 15;
      const k = inTrouble ? 0.6 : playerBusy ? 0.2 : 0.3;
      const killed = e.takeDamage(finishing ? 34 : 34 * k, 'body', aim.clone().sub(muzzle).normalize(), 'ally', aim);
      G.fx.blood(aim, aim.clone().sub(muzzle).normalize());
      if (killed) { G.stats.allyKills++; if (Math.random() < 0.4) G.allies.say(this.name, 'kill'); }
    } else {
      const dir = aim.clone().sub(muzzle).normalize();
      const wh = G.physics.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, muzzle.distanceTo(aim) + 10, {});
      if (wh) G.fx.impact(new THREE.Vector3(wh.x, wh.y, wh.z), new THREE.Vector3(wh.nx, wh.ny, wh.nz), wh.col ? wh.col.mat : 'concrete');
    }
    // aliados também acordam inimigos próximos
    G.director.noise(muzzle, 60, 'shot', 'player');
  }
  formationPos() {
    const pl = this.G.player;
    const f = pl.forward, r = pl.right;
    const p = pl.pos.clone().addScaledVector(r, this.offset.x).addScaledVector(f, -this.offset.z);
    const gy = this.G.physics.groundHeight(p.x, p.z, pl.pos.y + 1.5, 0.2);
    if (gy > -1e8 && Math.abs(gy - pl.pos.y) < 2) p.y = gy; else return pl.pos.clone().addScaledVector(f, -2);
    return p;
  }
  behindPlayer() {
    const G = this.G, pl = G.player;
    for (const k of [3, 5, 2, 7]) {
      for (const side of [this.offset.x > 0 ? 1 : -1, 0]) {
        const p = pl.pos.clone().addScaledVector(pl.forward, -k).addScaledVector(pl.right, side * 1.5);
        const gy = G.physics.groundHeight(p.x, p.z, pl.pos.y + 1, 0.2);
        if (gy < -1e8 || Math.abs(gy - pl.pos.y) > 1.2) continue;
        p.y = gy;
        if (G.physics.boxBlocked(p.x - 0.3, gy + 0.3, p.z - 0.3, p.x + 0.3, gy + 1.7, p.z + 0.3)) continue;
        if (!G.physics.los(pl.eye.x, pl.eye.y, pl.eye.z, p.x, gy + 1, p.z)) continue;
        return p;
      }
    }
    return null;
  }
  visibleToPlayer() {
    const G = this.G, cam = G.camera;
    const to = this.chestPos().sub(cam.position);
    const d = to.length();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    if (to.dot(fwd) / d < 0.5) return false;
    return G.physics.los(cam.position.x, cam.position.y, cam.position.z, this.pos.x, this.pos.y + 1.2, this.pos.z);
  }
}

export class Allies {
  constructor(G) {
    this.G = G;
    this.list = [new Ally(G, 'TROVÃO', 'ally1', new THREE.Vector3(-2, 0, 3)), new Ally(G, 'FAÍSCA', 'ally2', new THREE.Vector3(2, 0, 4))];
    this.byName = { TROVÃO: this.list[0], FAÍSCA: this.list[1] };
    this.cd = {}; this.seen = new Set(); this.checkT = 0; this.wasCombat = false; this.calmT = 0;
  }
  placeNear(p, yaw) {
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.list.forEach((a, i) => {
      const q = p.clone().addScaledVector(r, a.offset.x).addScaledVector(f, -a.offset.z);
      const gy = this.G.physics.groundHeight(q.x, q.z, p.y + 2, 0.2);
      q.y = gy > -1e8 ? gy : p.y;
      a.place(q, yaw + Math.PI); a.script = null; a.cover = null;
    });
  }
  say(name, kind) {
    const L = LINES[kind] && LINES[kind][name];
    if (!L) return;
    this.G.dialog.say(name, pick(L), { priority: 1, short: true });
  }
  callout(kind, force = false) {
    const now = this.G.time;
    if (!force && this.cd[kind] && now - this.cd[kind] < (kind === 'grenade' ? 4 : 12)) return;
    this.cd[kind] = now;
    this.say(Math.random() < 0.55 ? 'TROVÃO' : 'FAÍSCA', kind);
  }
  onPlayerReload() { if (this.G.director.anyAware() && Math.random() < 0.15) this.callout('reload'); }
  onEnemyKilled(e) { if (Math.random() < 0.12 && this.G.director.anyAware()) this.callout('kill'); }
  update(dt) {
    const G = this.G;
    for (const a of this.list) a.update(dt, this);
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    const pl = G.player;
    const combat = G.director.anyAware();
    for (const e of G.director.enemies) {
      if (e.dead || !e.inCombat) continue;
      const d = e.pos.distanceTo(pl.pos);
      if (d > 70) continue;
      const key = e.type + ':' + e.id;
      if (!this.seen.has(key) && e.canSee) {
        this.seen.add(key);
        if (e.type === 'sniper') this.callout('sniper');
        else if (e.type === 'heavy') this.callout('heavy');
        else if (e.type === 'shield') this.callout('shield');
        else if (e.type === 'gunner') this.callout('turret');
      }
      if (e.squad && e.squad.flanker === e && d < 28) {
        const to = e.pos.clone().sub(pl.pos).normalize();
        const side = to.dot(pl.right);
        if (Math.abs(side) > 0.5) this.callout(side < 0 ? 'flankL' : 'flankR');
      }
      if (e.reloading > 0 && e.canSee && d < 25 && Math.random() < 0.2) this.callout('enemyReload');
    }
    if (combat) { this.wasCombat = true; this.calmT = 0; }
    else if (this.wasCombat) { this.calmT += 0.5; if (this.calmT > 3) { this.wasCombat = false; if (G.director.enemies.some((e) => e.dead && G.time - (e.deathTime || 0) < 20)) this.callout('clear', true); } }
  }
  get nvgStrobe() { return true; }
}
