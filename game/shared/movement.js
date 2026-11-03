// Movimento do jogador, igual no servidor e na predição do cliente.
// Agachar: altura menor e metade da velocidade; só levanta se houver espaço acima. Deslizar: agachar enquanto corre no chão
// dá um impulso de 9 m/s na direção da câmera que decai em 0,8 s (como na campanha); levantar ou pular cancela.
const CROUCH_H = 1.05, SLIDE_TIME = 0.8, SLIDE_SPEED = 9;
export function stepBody(physics, body, input, dt, robot, rules) {
  const cfg = robot ? rules.robot : rules.human;
  body.r = cfg.radius; body.step = robot ? 0.6 : 0.5;
  const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  let forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
  let right = Math.max(-1, Math.min(1, Number(input.right) || 0));
  const length = Math.hypot(forward, right);
  if (length > 1) { forward /= length; right /= length; }
  let crouch = !robot && !!input.crouch;
  if (!crouch && body.crouched && physics.boxBlocked(body.x - 0.28, body.y + CROUCH_H, body.z - 0.28, body.x + 0.28, body.y + cfg.height, body.z + 0.28)) crouch = true;   // sem espaço para levantar
  if (robot) { body.slideT = 0; body.crouched = false; }
  if (crouch && !body.crouched && body.sprinting && body.onGround && !(body.slideT > 0)) {
    body.slideT = SLIDE_TIME; body.sdx = -Math.sin(yaw); body.sdz = -Math.cos(yaw);
  }
  if (!input.crouch) body.slideT = 0;
  body.h = crouch ? CROUCH_H : cfg.height; body.crouched = crouch;
  const sprint = !!input.sprint && forward > 0 && !crouch;
  body.sprinting = sprint && body.onGround !== false;
  let dx, dz;
  if (body.slideT > 0) {
    body.slideT = Math.max(0, body.slideT - dt);
    const s = SLIDE_SPEED * (body.slideT / SLIDE_TIME);
    dx = body.sdx * s * dt; dz = body.sdz * s * dt;
  } else {
    const speed = (sprint ? cfg.sprint : cfg.speed) * (crouch ? 0.5 : 1);
    dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed * dt;
    dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed * dt;
  }
  if (input.jump && body.onGround && !robot && !crouch) { body.vy = 4.6; body.onGround = false; }
  physics.moveBody(body, dx, dz, dt, true);
  const a = rules.arena, r = cfg.radius;
  body.x = Math.max(a.minX + r, Math.min(a.maxX - r, body.x));
  body.z = Math.max(a.minZ + r, Math.min(a.maxZ - r, body.z));
  return body;
}
