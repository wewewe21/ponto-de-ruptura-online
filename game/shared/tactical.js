// Duplo toque na tecla configurada de corrida ativa a corrida tática enquanto ela for mantida.
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
export function stepTactical(body, request, sprinting) {
  body.tacticalCooldown = 0; // mantém o campo de rede existente compatível com os clientes
  body.tacticalT = sprinting && (request || body.tacticalT > 0) ? 1 : 0;
  return body.tacticalT > 0;
}
