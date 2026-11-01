// Pool fixo de luzes reais alimentado por centenas de luzes "virtuais" do nível.
// Evita recompilar shaders e mantém custo constante. Também calcula a luz sobre o jogador (furtividade).
import * as THREE from 'three';
import { clamp } from '../core/utils.js';

const _v = new THREE.Vector3();

export class LightManager {
  constructor(G, nPoint = 6, nSpot = 3) {
    this.G = G;
    this.points = [];
    this.spots = [];
    this.flashlights = []; // lanternas inimigas {pos, dir, range, cos}
    for (let i = 0; i < nPoint; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      G.scene.add(l); this.points.push(l);
    }
    for (let i = 0; i < nSpot; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 60, 0.3, 0.4, 2);
      G.scene.add(l); G.scene.add(l.target); this.spots.push(l);
    }
    this.timer = 0;
    this.assigned = [];
  }
  _eff(v, time) {
    if (!v.enabled) return 0;
    let k = v.intensity;
    if (v.flicker) { const n = Math.sin(time * 23 + v.phase) * Math.sin(time * 7.1 + v.phase * 3); if (n > 1 - v.flicker) k *= 0.15; }
    if (v.pulse) k *= 0.5 + 0.5 * Math.max(0, Math.sin(time * v.pulse * Math.PI * 2 + v.phase));
    if (v.life !== undefined) k *= clamp(v.life / (v.maxLife || 1), 0, 1) * 1.5;
    return k;
  }
  update(dt, time) {
    const L = this.G.level, cam = this.G.camera.position;
    // brilho das luzes virtuais (sprites)
    for (const v of L.vlights) {
      v.eff = this._eff(v, time);
      if (v.glow) { v.glow.visible = v.eff > 0.01; v.glow.material.opacity = v.glowBase * clamp(v.eff / (v.intensity || 1), 0, 1.3); v.glow.position.copy(v.pos); }
    }
    // holofotes
    for (const s of L.searchlights) {
      if (s.target) {
        const dx = s.target.x - s.pos.x, dy = s.target.y - s.pos.y, dz = s.target.z - s.pos.z;
        const ty = Math.atan2(dx, dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
        s.yaw += clamp(((ty - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -dt * 1.2, dt * 1.2);
        s.pitch += clamp(tp - s.pitch, -dt * 0.8, dt * 0.8);
      } else {
        s.phase += dt * s.speed;
        const want = s.baseYaw + Math.sin(s.phase) * s.sweep;
        s.yaw += clamp(((want - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -dt * 0.8, dt * 0.8);
        s.pitch += (s.basePitch - s.pitch) * Math.min(1, dt);
      }
      s.dir.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
      _v.copy(s.pos).add(s.dir);
      s.cone.lookAt(_v); s.head.lookAt(_v);
      s.cone.visible = s.enabled;
      s.lens.position.copy(s.pos).addScaledVector(s.dir, 0.45);
      s.lens.visible = s.enabled;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.12;
      const cand = [];
      for (const v of L.vlights) {
        if (v.eff <= 0.01) continue;
        const d = v.pos.distanceTo(cam);
        if (d > v.range + 45) continue;
        cand.push({ v, s: d - v.range * 0.6 - v.priority * 6 });
      }
      cand.sort((a, b) => a.s - b.s);
      this.assigned = cand.slice(0, this.points.length).map((c) => c.v);
      const sc = L.searchlights.filter((s) => s.enabled).map((s) => ({ s, d: s.pos.distanceTo(cam) })).sort((a, b) => a.d - b.d);
      this.assignedSpots = sc.slice(0, this.spots.length).map((c) => c.s);
    }
    this.points.forEach((l, i) => {
      const v = this.assigned[i];
      if (!v) { l.intensity = 0; return; }
      l.position.copy(v.pos); l.color.copy(v.color); l.intensity = v.eff; l.distance = v.range;
    });
    this.spots.forEach((l, i) => {
      const s = this.assignedSpots && this.assignedSpots[i];
      if (!s) { l.intensity = 0; return; }
      l.position.copy(s.pos); l.target.position.copy(s.pos).addScaledVector(s.dir, 10);
      l.angle = s.angle; l.distance = s.range * 1.4; l.intensity = s.intensity; l.color.set(s.color);
    });
  }
  // quanto o ponto está iluminado (para a IA)
  lightAt(pos, zone) {
    const L = this.G.level, P = this.G.physics;
    let lum = zone ? zone.ambient ?? 0.2 : 0.2;
    for (const v of L.vlights) {
      if (!v.stealth || !v.eff) continue;
      const d = v.pos.distanceTo(pos);
      if (d > v.range) continue;
      const k = 1 - d / v.range;
      lum += Math.min(1.2, (v.eff / 220) * k * k);
    }
    for (const s of L.searchlights) {
      if (!s.enabled) continue;
      _v.copy(pos).sub(s.pos);
      const d = _v.length();
      if (d > s.range * 1.2) continue;
      if (_v.dot(s.dir) / d < Math.cos(s.angle * 1.15)) continue;
      if (P.los(s.pos.x, s.pos.y, s.pos.z, pos.x, pos.y + 0.2, pos.z)) { lum += 1.3; s.lit = true; }
    }
    for (const f of this.flashlights) {
      _v.copy(pos).sub(f.pos);
      const d = _v.length();
      if (d > f.range || _v.dot(f.dir) / d < f.cos) continue;
      if (P.los(f.pos.x, f.pos.y, f.pos.z, pos.x, pos.y, pos.z)) lum += 1.0 * (1 - d / f.range) + 0.3;
    }
    if (!zone || !zone.indoor) lum += this.G.weather.flash * 1.3;
    return lum;
  }
  // brilho forte perto do centro da tela (ofuscamento da NVG)
  glareFor(camera) {
    const L = this.G.level;
    let g = 0;
    const fwd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const cp = camera.position;
    const tmp = new THREE.Vector3();
    for (const v of L.vlights) {
      if (!v.eff || v.eff < 60) continue;
      tmp.copy(v.pos).sub(cp);
      const d = tmp.length();
      if (d > 70) continue;
      const c = tmp.dot(fwd) / d;
      if (c < 0.8) continue;
      g += (v.eff / 450) * ((c - 0.8) / 0.2) * (12 / (d + 4));
    }
    for (const s of L.searchlights) {
      if (!s.enabled) continue;
      tmp.copy(cp).sub(s.pos);
      const d = tmp.length();
      if (d > s.range) continue;
      const inBeam = tmp.dot(s.dir) / d;
      const lookAt = -tmp.dot(fwd) / d;
      if (inBeam > Math.cos(s.angle * 1.3) && lookAt > 0.85) g += 1.8 * (1 - d / s.range);
    }
    return g;
  }
}
