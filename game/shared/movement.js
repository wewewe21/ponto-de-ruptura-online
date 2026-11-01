export function stepBody(physics, body, input, dt, robot, rules) {
  const cfg = robot ? rules.robot : rules.human;
  body.r = cfg.radius; body.h = !robot && input.crouch ? 1.05 : cfg.height; body.step = robot ? 0.6 : 0.5;
  const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  let forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
  let right = Math.max(-1, Math.min(1, Number(input.right) || 0));
  const length = Math.hypot(forward, right);
  if (length > 1) { forward /= length; right /= length; }
  const sprint = input.sprint && forward > 0 && !input.crouch;
  const speed = (sprint ? cfg.sprint : cfg.speed) * (!robot && input.crouch ? 0.5 : 1);
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed * dt;
  const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed * dt;
  if (input.jump && body.onGround && !robot && !input.crouch) { body.vy = 4.6; body.onGround = false; }
  physics.moveBody(body, dx, dz, dt, true);
  const a = rules.arena, r = cfg.radius;
  body.x = Math.max(a.minX + r, Math.min(a.maxX - r, body.x));
  body.z = Math.max(a.minZ + r, Math.min(a.maxZ - r, body.z));
  return body;
}
