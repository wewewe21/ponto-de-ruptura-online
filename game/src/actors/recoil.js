// Recuo da mira (a câmera sobe, segura um instante e volta devagar) e tremor leve depois do tiro.
// Usado pela campanha (Weapons) e pelo online (client), para as duas terem o mesmo comportamento.
// rise: velocidade da subida (1/s) · hold: tempo parada em cima (s) · rate: velocidade da volta (1/s) · ret: fração que volta
const DEFAULT = { rise: 60, hold: 0.1, rate: 5.5, ret: 0.55 };
export const RECOIL_STYLE = {
  AX50: { rise: 16, hold: 0.45, rate: 2.0, ret: 0.9, tremor: 0.0015, tremorT: 1.1 },   // sniper: coice duro, fica no alto, desce suave, tremor leve
  VK12: { rise: 40, hold: 0.12, rate: 4.5, ret: 0.7 },
};

export class Recoil {
  constructor() { this.reset(); }
  reset() { this.pend = 0; this.pendYaw = 0; this.accum = 0; this.since = 9; this.style = DEFAULT; this.tremT = 0; this.tremDur = 1; this.tremAmp = 0; this.tp = 0; this.ty = 0; this.phase = 0; }
  // up/side em radianos
  kick(up, side, id) {
    const s = this.style = { ...DEFAULT, ...(RECOIL_STYLE[id] || {}) };
    this.pend += up; this.pendYaw += side; this.since = 0;
    if (s.tremor) { this.tremAmp = s.tremor; this.tremDur = s.tremorT; this.tremT = this.tremDur; this.phase = Math.random() * 6.28; }
  }
  update(dt, P) {
    const s = this.style; this.since += dt;
    if (this.pend || this.pendYaw) {
      const k = 1 - Math.exp(-s.rise * dt), a = this.pend * k, y = this.pendYaw * k;
      this.pend -= a; this.pendYaw -= y; P.pitch += a; P.yaw -= y; this.accum += a;
    }
    if (this.accum > 1e-5 && this.since > s.hold) {
      const ramp = Math.min(1, (this.since - s.hold) / 0.25);          // a volta começa devagar e ganha ritmo
      const rec = this.accum * (1 - Math.exp(-s.rate * ramp * ramp * dt));
      this.accum -= rec; P.pitch -= rec * s.ret;
    }
    let tp = 0, ty = 0;
    if (this.tremT > 0) {
      this.tremT -= dt; const env = Math.max(0, this.tremT / this.tremDur), e = env * env, t = this.tremDur - this.tremT;
      tp = this.tremAmp * e * (Math.sin(t * 52 + this.phase) + 0.5 * Math.sin(t * 91 + this.phase * 2));
      ty = this.tremAmp * e * 0.7 * Math.sin(t * 44 + 1.3 + this.phase);
    }
    P.pitch += tp - this.tp; P.yaw += ty - this.ty; this.tp = tp; this.ty = ty;   // tremor aplicado como diferença: some sozinho
    P.pitch = Math.max(-1.4, Math.min(1.4, P.pitch));
  }
}
