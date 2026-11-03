// Duplo toque na tecla configurada de corrida, seguido de uma corrida curta e recuperável.
export class SprintTap {
  constructor() { this.elapsed = Infinity; }
  update(dt, pressed) {
    this.elapsed += dt;
    if (!pressed) return false;
    const double = this.elapsed <= 0.4;
    this.elapsed = double ? Infinity : 0;
    return double;
  }
  reset() { this.elapsed = Infinity; }
}
export const TACTICAL_DURATION = 2.5;
export const TACTICAL_RECOVERY = 4.5;
export function stepTactical(body, request, sprinting, dt) {
  body.tacticalCooldown = Math.max(0, (body.tacticalCooldown || 0) - dt);
  body.tacticalT = Math.max(0, (body.tacticalT || 0) - dt);
  if (!sprinting) body.tacticalT = 0;
  if (request && sprinting && body.tacticalCooldown <= 0) {
    body.tacticalT = TACTICAL_DURATION;
    body.tacticalCooldown = TACTICAL_RECOVERY;
  }
  return body.tacticalT > 0;
}
