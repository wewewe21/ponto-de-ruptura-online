// Suporte tático liberado pelos jammers: drone de reconhecimento, morteiro e overwatch do Coruja.
// Cargas, cooldown, designação a laser, interferência da tempestade e regras de céu aberto/linha de visão.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';

export class Support {
  constructor(G) {
    this.G = G;
    this.reset();
  }
  reset(state) {
    this.types = state ? JSON.parse(JSON.stringify(state.types)) : {
      drone: { name: 'DRONE', unlocked: false, charges: 3, max: 3, cd: 45, cdT: 0 },
      mortar: { name: 'MORTEIRO', unlocked: false, charges: 2, max: 2, cd: 75, cdT: 0 },
      sniper: { name: 'CORUJA', unlocked: false, charges: 6, max: 6, cd: 25, cdT: 0 },
    };
    this.selected = state ? state.selected : 'drone';
    this.droneT = 0; this.droneLink = 0; this.dronePos = null; this.shells = []; this.snipes = []; this.passiveT = 30; this.pending = [];
    if (this.droneMesh) this.droneMesh.visible = false;
  }
  snapshot() { return { types: JSON.parse(JSON.stringify(this.types)), selected: this.selected }; }
  anyUnlocked() { return Object.values(this.types).some((t) => t.unlocked); }
  unlock(k) {
    this.types[k].unlocked = true; this.types[k].charges = this.types[k].max; this.selected = k;
  }
  cycle(dir = 1) {
    const keys = Object.keys(this.types).filter((k) => this.types[k].unlocked);
    if (!keys.length) return;
    const i = keys.indexOf(this.selected);
    this.selected = keys[(i + (dir > 0 ? 1 : keys.length - 1)) % keys.length];
    this.G.audio.mech('beep');
    this.G.hud.toast('Suporte: ' + this.types[this.selected].name);
  }
  interference() { return this.G.time - this.G.weather.lastStrike < 2.2; }
  designate(point, actor) {
    const G = this.G, T = this.types[this.selected];
    if (!T.unlocked) { G.hud.toast('Suporte indisponível'); return; }
    if (T.charges <= 0) { G.hud.toast(T.name + ' sem cargas — aguarde'); G.audio.mech('beep'); return; }
    const k = this.selected;
    const delay = this.interference() ? 2 : 0;
    if (delay) G.dialog.say('ATALAIA', 'Interferência... repita. ...Recebido.', { priority: 2 });
    if (k === 'drone') {
      T.charges--; G.stats.supportUsed++;
      G.dialog.say('ATALAIA', 'Drone no ar. Marcando hostis.', { priority: 2 });
      this.pending.push({ t: G.time + 1.5 + delay, fn: () => this.startDrone(point) });
    } else if (k === 'mortar') {
      // céu aberto?
      const P = G.physics;
      const up = P.raycast(point.x, point.y + 0.5, point.z, 0, 1, 0, 60, {});
      if (up) { G.dialog.say('ATALAIA', 'Negativo, Eco. Alvo coberto, o morteiro não alcança.', { priority: 2 }); return; }
      T.charges--; G.stats.supportUsed++;
      const danger = point.distanceTo(G.player.pos) < 12;
      G.dialog.say('ATALAIA', danger ? 'Perigo próximo! Fogo em quatro. Abriguem-se!' : 'Coordenadas recebidas. Fogo em quatro.', { priority: 2 });
      const t0 = G.time + 4 + delay;
      for (let i = 0; i < 4; i++) {
        const p = point.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)));
        p.y = P.groundHeight(p.x, p.z, point.y + 6, 0.2);
        if (p.y < -1e8) p.y = point.y;
        this.shells.push({ t: t0 + i * 0.8, p, whistle: false });
      }
    } else if (k === 'sniper') {
      let target = actor;
      if (!target) {
        let best = null, bd = 4;
        for (const e of G.director.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(point); if (d < bd) { bd = d; best = e; } }
        target = best;
      }
      if (!target) { G.dialog.say('CORUJA', 'Sem alvo nesse ponto. Marca o hostil.', { priority: 2 }); return; }
      const c = G.level.points.coruja, tp = target.chestPos();
      if (!G.physics.los(c.x, c.y, c.z, tp.x, tp.y, tp.z)) { G.dialog.say('CORUJA', 'Sem visada nesse alvo.', { priority: 2 }); return; }
      T.charges--; G.stats.supportUsed++;
      G.dialog.say('CORUJA', 'Alvo marcado. Enviando.', { priority: 2, short: true });
      this.snipes.push({ t: G.time + 1.2 + delay + (G.weather.intensity > 0.85 ? 0.5 : 0), e: target });
    }
  }
  startDrone(point) {
    const G = this.G;
    const r = 45 * (1 - 0.35 * G.weather.intensity);
    this.droneT = 10; this.dronePos = point.clone(); this.droneR = r;
    if (!this.droneMesh) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.level.T.soft, color: 0xff3020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      l.scale.setScalar(1.5); l.position.y = -0.2;
      g.add(b, w, l); G.scene.add(g); this.droneMesh = g; this.droneLight = l;
    }
    this.droneMesh.visible = true;
    this.droneAng = 0;
    this.markAround();
  }
  markAround() {
    const G = this.G;
    let n = 0;
    for (const e of G.director.enemies) { if (!e.dead && e.pos.distanceTo(this.dronePos) < this.droneR) { e.markedT = Math.max(e.markedT, this.droneT); n++; } }
    return n;
  }
  update(dt) {
    const G = this.G;
    for (let i = this.pending.length - 1; i >= 0; i--) if (G.time >= this.pending[i].t) { const f = this.pending[i].fn; this.pending.splice(i, 1); f(); }
    for (const k in this.types) {
      const T = this.types[k];
      if (!T.unlocked || T.charges >= T.max) { T.cdT = 0; continue; }
      T.cdT += dt;
      if (T.cdT >= T.cd) { T.cdT = 0; T.charges++; }
    }
    // drone
    if (this.droneT > 0) {
      this.droneT -= dt;
      this.droneAng += dt * 0.35;
      this.droneMesh.position.set(this.dronePos.x + Math.cos(this.droneAng) * 25, this.dronePos.y + 55, this.dronePos.z + Math.sin(this.droneAng) * 25);
      this.droneMesh.rotation.y = -this.droneAng;
      this.droneLight.visible = Math.sin(G.time * 8) > 0;
      if (this.interference()) { this.droneLink = 1.5; }
      this.droneLink = Math.max(0, this.droneLink - dt);
      if (Math.floor(this.droneT * 2) !== Math.floor((this.droneT + dt) * 2)) this.markAround();
      if (this.droneT <= 0) this.droneMesh.visible = false;
    }
    // morteiro
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      if (!s.whistle && G.time > s.t - 1.4) { s.whistle = true; G.audio.mortarIncoming(s.p); }
      if (G.time >= s.t) { G.weapons.explode(s.p, 'mortar', 'support'); this.shells.splice(i, 1); }
    }
    // Coruja
    for (let i = this.snipes.length - 1; i >= 0; i--) {
      const s = this.snipes[i];
      if (G.time >= s.t) {
        this.snipes.splice(i, 1);
        if (!s.e.dead) {
          const c = G.level.points.coruja, tp = s.e.headPos();
          G.fx.tracer(c.clone(), tp, 0xffd090, 900, 14);
          s.e.takeDamage(999, 'head', tp.clone().sub(c).normalize(), 'support', tp);
          G.fx.blood(tp, tp.clone().sub(c).normalize(), true);
          G.audio.sniperDistant();
          G.stats.supportKills++;
          if (Math.random() < 0.5) G.dialog.say('CORUJA', Math.random() < 0.5 ? 'Abatido.' : 'Alvo neutralizado.', { priority: 1, short: true });
        }
      }
    }
    // passivo do Coruja: tira um atirador ou pesado a cada ~30 s
    if (this.types.sniper.unlocked && G.director.anyAware()) {
      this.passiveT -= dt;
      if (this.passiveT <= 0) {
        this.passiveT = 30;
        const c = G.level.points.coruja;
        const t = G.director.alive((e) => (e.type === 'sniper' || e.type === 'heavy' || e.type === 'gunner') && e.inCombat).find((e) => { const p = e.chestPos(); return G.physics.los(c.x, c.y, c.z, p.x, p.y, p.z); });
        if (t) { this.snipes.push({ t: G.time + 0.5, e: t }); G.dialog.say('CORUJA', t.type === 'heavy' ? 'Pesado na mira. Derrubando.' : 'Atirador na mira.', { priority: 1, short: true }); }
      }
    }
  }
  // marcados visíveis? (interferência derruba o enlace)
  marksVisible() { return this.droneLink <= 0; }
}
