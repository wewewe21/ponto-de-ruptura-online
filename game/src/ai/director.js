// Diretor de combate: esquadrões (conhecimento comum, papéis, tokens), sistema de cobertura,
// fila de caminhos, ruídos, alarmes por setor, fumaça, flash, explosões, corpos, drops e adaptação.
import * as THREE from 'three';
import { Enemy, ETYPES } from './enemy.js';
import { clamp, rand, pick, pointSegDist } from '../core/utils.js';

class Squad {
  constructor(name) { this.name = name; this.members = []; this.known = null; this.knownT = -99; this.grenadeT = -99; this.flanker = null; this.roleT = 0; this.alerted = false; }
  alert(pos, from) {
    this.alerted = true;
    for (const m of this.members) if (m !== from && !m.dead && !m.inCombat) m.engage(pos.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))), 'heard', true);
  }
  report(pos) { this.known = pos.clone(); this.knownT = performance.now(); for (const m of this.members) if (!m.dead && m.inCombat && !m.canSee) m.lastKnown.lerp(pos, 0.5); }
  roleOf(e) { return this.flanker === e ? 'flank' : 'assault'; }
  canGrenade(t) { return t - this.grenadeT > 8; }
  usedGrenade(t) { this.grenadeT = t; }
  onDeath(e, silent) {
    if (this.flanker === e) this.flanker = null;
    const alive = this.members.filter((m) => !m.dead);
    if (!silent) { const w = alive.find((m) => m.inCombat); w && w.say('down'); }
    for (const m of alive) m.suppression = Math.min(1, m.suppression + 0.2);
  }
  update(dt, G) {
    this.roleT -= dt;
    if (this.roleT > 0) return;
    this.roleT = 1.5;
    const alive = this.members.filter((m) => !m.dead && m.state === 'combat' && !m.static && !m.def.push && !m.def.shield);
    if (alive.length >= 3 && !this.flanker && G.player.stationaryT > 4 + rand(0, 3)) this.flanker = pick(alive);
    if (this.flanker && (this.flanker.dead || this.flanker.state !== 'combat')) this.flanker = null;
    if (G.director.adapt.camping > 6 && alive.length >= 2 && !this.flanker) this.flanker = pick(alive);
  }
}

export class Director {
  constructor(G) {
    this.G = G;
    this.enemies = [];
    this.squads = new Map();
    this.pathQueue = [];
    this.smokes = [];
    this.pickups = [];
    this.sectors = {};
    this.voiceCd = 0;
    this.muzzleLightCd = 0;
    this.combatT = 0;
    this.ignorePlayer = false;
    this.adapt = { camping: 0, longKills: 0, closeKills: 0, stealthKills: 0, lowHealth: 0 };
    this.maxAlive = 24;
    this.boss = null;
  }
  // ---------- cobertura ----------
  buildCover() {
    const P = this.G.physics, nav = this.G.nav;
    this.cover = [];
    this.coverGrid = new Map();
    const add = (x, z, nx, nz, c, tx, tz) => {
      const gy = P.groundHeight(x, z, c.minY + 0.6, 0.1);
      if (Math.abs(gy - c.minY) > 0.6 && Math.abs(gy - (c.groundRef ?? c.minY)) > 0.6) return;
      if (P.boxBlocked(x - 0.3, gy + 0.3, z - 0.3, x + 0.3, gy + 1.6, z + 0.3)) return;
      const pt = { pos: new THREE.Vector3(x, gy, z), n: new THREE.Vector3(nx, 0, nz), low: c.cover === 'low', col: c, occ: null };
      if (!pt.low) {
        // posição de espiada: lado com espaço livre
        for (const s of [1, -1]) {
          const px = x + tx * s * 0.9 + nx * 0.1, pz = z + tz * s * 0.9 + nz * 0.1;
          const ex = x + tx * s * 1.3, ez = z + tz * s * 1.3;
          if (!P.boxBlocked(px - 0.3, gy + 0.3, pz - 0.3, px + 0.3, gy + 1.6, pz + 0.3) && !P.boxBlocked(ex - 0.15, gy + 0.6, ez - 0.15, ex + 0.15, gy + 1.5, ez + 0.15)) { pt.peek = new THREE.Vector3(px, gy, pz); break; }
        }
      }
      this.cover.push(pt);
      const k = Math.floor(x / 10) * 10000 + Math.floor(z / 10);
      if (!this.coverGrid.has(k)) this.coverGrid.set(k, []);
      this.coverGrid.get(k).push(pt);
    };
    for (const c of P.cols) {
      if (!c.cover || !c.active) continue;
      const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
      if (w > 40 || d > 40) continue;
      const off = 0.6;
      const step = 1.6;
      for (let z = c.minZ + Math.min(0.4, d / 2); z <= c.maxZ - Math.min(0.4, d / 2) + 0.01; z += Math.max(step, d < step ? d + 1 : step)) { add(c.maxX + off, z, 1, 0, c, 0, 1); add(c.minX - off, z, -1, 0, c, 0, 1); }
      for (let x = c.minX + Math.min(0.4, w / 2); x <= c.maxX - Math.min(0.4, w / 2) + 0.01; x += Math.max(step, w < step ? w + 1 : step)) { add(x, c.maxZ + off, 0, 1, c, 1, 0); add(x, c.minZ - off, 0, -1, c, 1, 0); }
    }
  }
  coverNear(p, r) {
    const out = [];
    const x0 = Math.floor((p.x - r) / 10), x1 = Math.floor((p.x + r) / 10), z0 = Math.floor((p.z - r) / 10), z1 = Math.floor((p.z + r) / 10);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const l = this.coverGrid.get(x * 10000 + z); if (l) for (const c of l) if (c.col.active && Math.abs(c.pos.y - p.y) < 3 && c.pos.distanceTo(p) < r) out.push(c); }
    return out;
  }
  findCover(e, threat, o = {}) {
    const G = this.G, P = G.physics;
    const pref = e.def.pref;
    const cands = this.coverNear(e.pos, o.retreat ? 35 : 26);
    const myD = e.pos.distanceTo(threat);
    const squadCenter = e.squad ? e.squad.members.filter((m) => !m.dead).reduce((a, m) => a.add(m.pos), new THREE.Vector3()).divideScalar(Math.max(1, e.squad.members.filter((m) => !m.dead).length)) : e.pos;
    const axis = squadCenter.clone().sub(threat).setY(0).normalize();
    const scored = [];
    for (const c of cands) {
      if (c.occ && c.occ !== e) continue;
      const toT = threat.clone().sub(c.pos); toT.y = 0;
      const dT = toT.length();
      if (dT < 5) continue;
      toT.divideScalar(dT);
      const facing = -c.n.dot(toT);
      if (facing < 0.3) continue;
      let s = facing * 10;
      s -= Math.abs(dT - (pref[0] + pref[1]) / 2) * 0.6;
      s -= c.pos.distanceTo(e.pos) * 0.5;
      if (o.retreat) s += (dT - myD) * 1.5 - (dT < myD + 6 ? 40 : 0);
      if (o.flank) { const ang = 1 - Math.abs(axis.dot(c.pos.clone().sub(threat).setY(0).normalize())); s += ang * 25 - (ang < 0.4 ? 30 : 0); }
      if (c.low) s += 1;
      scored.push({ c, s });
    }
    scored.sort((a, b) => b.s - a.s);
    for (let i = 0; i < Math.min(6, scored.length); i++) {
      const c = scored[i].c;
      const h = c.low ? 0.95 : 1.5;
      if (!P.los(threat.x, threat.y + 1.5, threat.z, c.pos.x, c.pos.y + h, c.pos.z)) return c;
    }
    return scored.length ? scored[0].c : null;
  }
  // ---------- spawns ----------
  spawn(type, pos, o = {}) {
    const G = this.G;
    const y = o.y ?? G.physics.groundHeight(pos.x, pos.z, (pos.y ?? 0) + 1.5, 0.2);
    const p = new THREE.Vector3(pos.x, y > -1e8 ? y : pos.y || 0, pos.z);
    const e = new Enemy(G, type, p, o);
    const sq = o.squad || 'default';
    if (!this.squads.has(sq)) this.squads.set(sq, new Squad(sq));
    const S = this.squads.get(sq);
    S.members.push(e); e.squad = S;
    if (o.alerted && S.alerted === false) S.alerted = true;
    this.enemies.push(e);
    if (o.marked) e.markedT = o.marked;
    return e;
  }
  spawnGroup(list, common = {}) { return list.map((s) => this.spawn(s.type || 'rifleman', s.pos, { ...common, ...s })); }
  alive(filter) { return this.enemies.filter((e) => !e.dead && (!filter || filter(e))); }
  aliveIn(squadOrTag) { return this.enemies.filter((e) => !e.dead && (e.squad?.name === squadOrTag || e.tag === squadOrTag)).length; }
  clearAll() {
    for (const e of this.enemies) e.dispose();
    this.enemies = []; this.squads.clear(); this.pathQueue = []; this.smokes = []; this.tokens = new Map();
    if (this.boss) this.boss.reset();
    for (const p of this.pickups) this.G.scene.remove(p.mesh);
    this.pickups = [];
    for (const k in this.sectors) { this.sectors[k].alarm = false; this.sectors[k].timer = 0; }
    if (this.cover) for (const c of this.cover) c.occ = null;
    this.G.audio.stopLoop('alarm');
  }
  // ---------- tokens de ataque ----------
  attackToken(e) {
    const max = this.G.diff.tokens || 3;
    if (!this.tokens) this.tokens = new Map();
    for (const [k, t] of this.tokens) if (k.dead || !k.canSee || this.G.time - t > 3.5) this.tokens.delete(k);
    if (this.tokens.has(e)) return true;
    if (this.tokens.size < max) { this.tokens.set(e, this.G.time); return true; }
    return false;
  }
  // ---------- caminhos ----------
  requestPath(e) { if (!this.pathQueue.includes(e)) this.pathQueue.push(e); }
  // ---------- percepção compartilhada ----------
  noise(pos, radius, kind, src) {
    for (const e of this.enemies) {
      if (e.dead || e === src) continue;
      const d = e.pos.distanceTo(pos);
      if (d > radius * (e.alertBoost ? 1.3 : 1)) continue;
      e.hear(pos, kind, src);
    }
  }
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      const r = pointSegDist(s.pos.x, s.pos.y + 1.5, s.pos.z, a.x, a.y, a.z, b.x, b.y, b.z);
      if (r.d < s.r) return true;
    }
    return false;
  }
  addSmoke(pos, dur) { this.smokes.push({ pos: pos.clone(), r: 0.5, t: dur }); }
  visibleBody(e) {
    const P = this.G.physics, eye = e.eyePos(new THREE.Vector3());
    for (const b of this.enemies) {
      if (!b.dead || b.bodyFound || b.deadT < 1.5) continue;
      const d = b.pos.distanceTo(e.pos);
      if (d > 16) continue;
      const to = b.pos.clone().sub(e.pos).normalize();
      if (to.x * Math.sin(e.yaw) + to.z * Math.cos(e.yaw) < 0.4) continue;
      if (P.los(eye.x, eye.y, eye.z, b.pos.x, b.pos.y + 0.3, b.pos.z)) return b;
    }
    return null;
  }
  raycastActors(o, d, maxT, shooter, includeAllies = false) {
    let best = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
      const along = dx * d.x + dz * d.z;
      if (along < -1 || along > maxT + 1) continue;
      const h = e.raycast(o, d, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) best = { actor: e, t: h.t, part: h.part };
    }
    const bs = this.boss;
    if (bs && bs.alive && !bs.dead) { const h = bs.raycast(o, d, best ? best.t : maxT); if (h && (!best || h.t < best.t)) best = { actor: bs, t: h.t, part: h.part }; }
    return best;
  }
  suppressAlong(a, b, amount, except) {
    for (const e of this.enemies) {
      if (e.dead || e === except) continue;
      const h = e.headPos(new THREE.Vector3());
      const r = pointSegDist(h.x, h.y, h.z, a.x, a.y, a.z, b.x, b.y, b.z);
      if (r.d < 2.5 && r.t > 0.05) {
        e.suppression = Math.min(1, e.suppression + amount * (1 - r.d / 2.5));
        if (!e.inCombat) e.engage(this.G.player.pos.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))), 'heard');
      }
    }
  }
  meleeTarget(pos, fwd) {
    let best = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = e.pos.clone().sub(pos); to.y = 0;
      const d = to.length();
      if (d > 2.3 || Math.abs(e.pos.y - pos.y) > 1.2) continue;
      to.divideScalar(d || 1);
      if (to.dot(new THREE.Vector3(fwd.x, 0, fwd.z).normalize()) < 0.55) continue;
      const behind = to.x * Math.sin(e.yaw) + to.z * Math.cos(e.yaw) > -0.2;
      const unaware = (e.unaware && behind) || e.blind > 0 || (e.unaware && e.aware < 0.5);
      if (!best || d < best.d) best = { enemy: e, d, unaware };
    }
    return best;
  }
  flashbang(pos) {
    const P = this.G.physics;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const eye = e.eyePos(new THREE.Vector3());
      const d = eye.distanceTo(pos);
      if (d > 14 || !P.los(pos.x, pos.y + 0.2, pos.z, eye.x, eye.y, eye.z)) continue;
      const to = pos.clone().sub(eye).normalize();
      const facing = to.x * Math.sin(e.yaw) + to.z * Math.cos(e.yaw);
      e.blind = Math.max(e.blind, facing > 0 ? 4.5 : 2.2) * (e.type === 'heavy' ? 0.5 : 1);
      e.say('blind');
      if (!e.inCombat) e.engage(this.G.player.pos, 'heard', true);
    }
  }
  explosionDamage(pos, radius, maxDmg, owner, kind) {
    const P = this.G.physics, G = this.G;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.chestPos(new THREE.Vector3());
      const d = c.distanceTo(pos);
      if (d > radius) continue;
      const los = P.los(pos.x, pos.y + 0.3, pos.z, c.x, c.y, c.z);
      const dmg = maxDmg * Math.pow(1 - d / radius, 1.2) * (los ? 1 : 0.3) * (e.armored ? 0.8 : 1);
      const dir = c.clone().sub(pos).normalize();
      const killed = e.takeDamage(dmg, 'body', dir, owner === 'player' ? 'player' : 'other', c);
      if (killed && owner === 'player') { G.stats.kills++; this.onPlayerKill(e, d, false); }
      else if (killed && owner === 'support') { G.stats.supportKills++; }
      if (!killed) { e.suppression = 1; e.stagger = 0.6; }
    }
    const bs = this.boss;
    if (bs && bs.alive && !bs.dead && owner !== 'boss') { if (bs.explosionHit(pos, radius, maxDmg) && owner === 'player') G.stats.kills++; }
    if (this.vehicles) for (const v of this.vehicles) v.explosion && v.explosion(pos, radius, maxDmg, kind);
  }
  grenadeDanger(pos, fuse) {
    if (fuse > 2.2) return;
    for (const e of this.enemies) {
      if (e.dead || e.static || e.def.push || e.fleeing) continue;
      if (e.pos.distanceTo(pos) < 6) {
        e.fleeing = true;
        const away = e.pos.clone().sub(pos).setY(0).normalize().multiplyScalar(8).add(e.pos);
        e.setMove(away, e.def.run);
        if (e.cover) { e.cover.occ = null; e.cover = null; }
        e.say('grenade');
        setTimeout(() => { e.fleeing = false; }, 2500);
      }
    }
  }
  fireFlare(e, at) {
    const G = this.G;
    const p = at.clone(); p.y = Math.max(p.y, e.pos.y) + 14;
    G.audio.sfx('flare', e.pos, { vol: 0.9 });
    const v = G.level.vlights;
    const fl = { pos: p.clone(), color: new THREE.Color(0xff3b2e), intensity: 400, range: 45, enabled: true, flicker: 0.2, pulse: 0, priority: 3, phase: 0, stealth: true, life: 25, maxLife: 25, glow: null };
    const sm = new THREE.SpriteMaterial({ map: G.level.T.soft, color: 0xff5040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    fl.glow = new THREE.Sprite(sm); fl.glow.scale.setScalar(4); fl.glowBase = 1; G.scene.add(fl.glow);
    v.push(fl);
    const em = G.fx.addEmitter({ kind: 'flare', pos: fl.pos, t: 25 });
    this.flares = this.flares || [];
    this.flares.push({ fl, em, vy: -0.6 });
    G.hud.subtitle('HOSTIL', 'Sinalizador! Iluminem a área!', 2, true);
    G.audio.speak('Sinalizador! Iluminem a área!','HOSTIL',{radio:false,pos:e.pos,channel:'hostile',maxDelay:1000});
    G.audio.explosion(e.pos, 0.15);
  }
  // ---------- alarmes ----------
  defineSector(name, cfg) { this.sectors[name] = { alarm: false, timer: 0, ...cfg }; }
  alarmActive(sector) { return sector && this.sectors[sector] && this.sectors[sector].alarm; }
  onEnemyCombat(e) {
    const s = this.sectors[e.sector];
    if (s && !s.alarm && !s.timerOn) { s.timerOn = true; s.timer = s.delay ?? 5; s.caller = e; }
  }
  raiseAlarm(sector, pos) {
    const s = this.sectors[sector];
    if (!s || s.alarm) return;
    s.alarm = true;
    this.G.hud.toast('ALARME ACIONADO');
    if (s.alarmPos) this.G.audio.positionalLoop('alarm', s.alarmPos, 'alarm', 0.5);
    s.onAlarm && s.onAlarm();
    this.G.stats.alarms++;
  }
  onEnemyDeath(e, silent) {
    const G = this.G;
    e.deathTime = G.time;
    // drop
    const d = e.def.drop;
    if (d && d !== 'ammo' && Math.random() < (d === 'KR7' ? 0.55 : 1)) this.dropWeapon(d, e.pos);
    else if (Math.random() < 0.6) this.dropAmmo(e.pos);
    if (!silent && !e.unaware) {
      // inimigos próximos que viram a morte reagem
      for (const o of this.enemies) if (!o.dead && o.pos.distanceTo(e.pos) < 18 && o.unaware) o.engage(G.player.pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), 'heard');
    }
    G.mission && G.mission.onEnemyKilled && G.mission.onEnemyKilled(e);
  }
  dropWeapon(id, pos) {
    const G = this.G;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, id === 'VK12' ? 1.1 : id === 'BRK8' ? 0.95 : 0.85), new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.6, emissive: 0x111111 }));
    m.position.set(pos.x + rand(-0.5, 0.5), pos.y + 0.06, pos.z + rand(-0.5, 0.5)); m.rotation.y = rand(0, 6); m.rotation.z = Math.PI / 2;
    G.scene.add(m);
    this.pickups.push({ kind: 'weapon', id, pos: m.position.clone(), mesh: m, t: 90 });
  }
  dropAmmo(pos) {
    const G = this.G;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x3d4232, roughness: 0.7, emissive: 0x1a1a08 }));
    m.position.set(pos.x + rand(-0.4, 0.4), pos.y + 0.06, pos.z + rand(-0.4, 0.4));
    G.scene.add(m);
    this.pickups.push({ kind: 'ammo', pos: m.position.clone(), mesh: m, t: 90 });
  }
  onPlayerKill(e, dist, stealth) {
    this.G.medals?.kill();
    if (dist > 40) this.adapt.longKills++;
    if (dist < 8) this.adapt.closeKills++;
    if (stealth) this.adapt.stealthKills++;
  }
  get combatLevel() {
    const inC = this.enemies.filter((e) => !e.dead && e.state === 'combat').length;
    return clamp(inC / 4, 0, 1);
  }
  anyAware() { return this.enemies.some((e) => !e.dead && e.inCombat); }
  update(dt) {
    const G = this.G;
    this.voiceCd -= dt; this.muzzleLightCd -= dt;
    // caminhos: até 4 por quadro
    for (let i = 0; i < 4 && this.pathQueue.length; i++) {
      const e = this.pathQueue.shift();
      if (e.dead || !e.moveTarget) continue;
      e.path = G.nav.findPath(e.pos.x, e.pos.y, e.pos.z, e.moveTarget.x, e.moveTarget.y, e.moveTarget.z) || null;
      e.pathIdx = 0;
    }
    for (const e of this.enemies) e.update(dt);
    if (this.boss) this.boss.update(dt);
    for (const s of this.squads.values()) s.update(dt, G);
    // fumaça cresce e some
    for (let i = this.smokes.length - 1; i >= 0; i--) { const s = this.smokes[i]; s.t -= dt; s.r = Math.min(5, s.r + dt * 3); if (s.t < 2) s.r *= 0.98; if (s.t <= 0) this.smokes.splice(i, 1); }
    // sinalizadores caindo
    if (this.flares) for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.fl.life -= dt; f.fl.pos.y += f.vy * dt; f.fl.pos.x += 0.3 * dt;
      if (f.fl.life <= 0) { f.fl.enabled = false; G.scene.remove(f.fl.glow); const v = G.level.vlights; v.splice(v.indexOf(f.fl), 1); this.flares.splice(i, 1); }
    }
    // alarmes
    for (const k in this.sectors) {
      const s = this.sectors[k];
      if (s.timerOn && !s.alarm) {
        s.timer -= dt;
        if (s.caller && s.caller.dead) { s.timerOn = false; s.caller = null; }
        else if (s.timer <= 0) this.raiseAlarm(k, s.caller.pos);
      }
    }
    // coleta automática de munição / armas iguais
    const pl = G.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t -= dt;
      const d = p.pos.distanceTo(pl.pos);
      if (p.t <= 0 && d > 30) { G.scene.remove(p.mesh); this.pickups.splice(i, 1); continue; }
      if (d < 1.4 && !pl.dead) {
        if (p.kind === 'ammo') {
          const W = G.weapons;
          W.addAmmo(W.slots.primary, Math.ceil((W.ammo[W.slots.primary] ? 1 : 0) * (W.slots.primary === 'BRK8' ? 7 : W.slots.primary === 'VK12' ? 10 : 30)));
          W.addAmmo('P19', 15);
          G.hud.toast('+ MUNIÇÃO'); G.audio.mech('pickup');
          G.scene.remove(p.mesh); this.pickups.splice(i, 1);
        } else if (p.kind === 'weapon' && G.weapons.slots.primary === p.id) {
          G.weapons.addAmmo(p.id, p.id === 'VK12' ? 10 : p.id === 'BRK8' ? 7 : 30);
          G.hud.toast('+ MUNIÇÃO ' + p.id); G.audio.mech('pickup');
          G.scene.remove(p.mesh); this.pickups.splice(i, 1);
        }
      }
    }
    // adaptação
    this.adapt.camping = this.anyAware() ? pl.stationaryT : 0;
    // limpeza de corpos distantes
    const deadList = this.enemies.filter((e) => e.dead);
    if (deadList.length > 36) {
      deadList.sort((a, b) => a.deathTime - b.deathTime);
      for (const e of deadList.slice(0, deadList.length - 36)) { if (e.pos.distanceTo(pl.pos) > 30) { e.dispose(); this.enemies.splice(this.enemies.indexOf(e), 1); } }
    }
    this.combatT = this.anyAware() ? this.combatT + dt : 0;
  }
}
