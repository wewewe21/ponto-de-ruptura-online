// As duas modalidades usam a mesma espera e velocidade de regeneração.
export const REGEN_DELAY_MS = 4500;
export const REGEN_PER_SECOND = 25;
export const STIM_COOLDOWN_MS = 30000;

export function useStim(player, now) {
  if (player.dead || player.robot || player.hp <= 0 || player.hp >= player.maxHp || now < (player.stimReadyAt || 0)) return false;
  player.hp = player.maxHp;
  player.stimReadyAt = now + STIM_COOLDOWN_MS;
  return true;
}

export function regenerate(player, now, dt) {
  if (player.dead || player.robot || player.hp <= 0 || player.hp >= player.maxHp || now < player.lastDamageAt + REGEN_DELAY_MS) return;
  player.hp = Math.min(player.maxHp, player.hp + REGEN_PER_SECOND * dt);
}
