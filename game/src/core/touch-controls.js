// Entrada por toque alimenta as mesmas ações e comandos usados por teclado e mouse.
export function isMobileTouch(nav = navigator, view = window) {
  const coarse = !!view.matchMedia?.('(pointer: coarse)').matches;
  return (nav.maxTouchPoints || 0) > 0 && (coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || ''));
}

export function stickVector(x, y, radius) {
  const dx = x / radius, dy = y / radius, length = Math.hypot(dx, dy);
  if (!length || length < .12) return { right: 0, forward: 0, x: 0, y: 0 };
  const direction = Math.min(length, 1) / length;
  const right = dx * direction, forward = -dy * direction;
  return { right, forward, x: right * radius, y: -forward * radius };
}

export class TouchControls {
  constructor(G) {
    this.G = G; this.input = G.input; this.root = document.getElementById('touch-controls');
    this.rotate = document.getElementById('touch-rotate'); this.stick = document.getElementById('touch-stick');
    this.knob = document.getElementById('touch-stick-knob'); this.extra = document.getElementById('touch-extra');
    this.lookId = null; this.stickId = null; this.holds = new Map(); this.active = false; this.hintShown = false; this.aiming = false;
    this.stick.addEventListener('pointerdown', e => this.stickDown(e));
    this.stick.addEventListener('pointermove', e => this.stickMove(e));
    for (const name of ['pointerup','pointercancel','lostpointercapture']) this.stick.addEventListener(name, e => this.stickEnd(e));
    const canvas = this.input.canvas;
    canvas.addEventListener('pointerdown', e => this.lookDown(e));
    canvas.addEventListener('pointermove', e => this.lookMove(e));
    for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, e => this.lookEnd(e));
    for (const button of this.root.querySelectorAll('[data-action]')) this.bindButton(button);
    document.getElementById('touch-pause').addEventListener('click', () => this.input.unlock());
    document.getElementById('touch-more').addEventListener('click', () => { this.extra.hidden = !this.extra.hidden; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    window.addEventListener('blur', () => this.reset());
  }
  bindButton(button) {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', e => {
      if (!this.active || e.pointerType === 'mouse') return;
      e.preventDefault(); button.setPointerCapture?.(e.pointerId);
      if (action === 'Mouse2') {
        this.aiming = !this.aiming; this.input.setVirtual(action, 'aim-toggle', this.aiming);
        button.classList.toggle('held', this.aiming); button.setAttribute('aria-pressed', String(this.aiming)); this.refreshSprint(); return;
      }
      const source = `button:${e.pointerId}`;
      this.holds.set(e.pointerId, { action, source, button, x: e.clientX, y: e.clientY });
      button.classList.add('held'); this.input.setVirtual(action, source, true); this.refreshSprint();
    });
    button.addEventListener('pointermove', e => {
      const hold = this.holds.get(e.pointerId); if (!hold || hold.button !== button) return;
      // O polegar pode arrastar o botão de tiro para acompanhar o alvo.
      if (action === 'Mouse0') { this.input.mouseDX += (e.clientX - hold.x) * 3; this.input.mouseDY += (e.clientY - hold.y) * 3; }
      hold.x = e.clientX; hold.y = e.clientY;
    });
    const end = e => {
      const hold = this.holds.get(e.pointerId); if (!hold || hold.button !== button) return;
      this.holds.delete(e.pointerId); this.input.setVirtual(action, hold.source, false);
      if (![...this.holds.values()].some(h => h.button === button)) button.classList.remove('held');
      this.refreshSprint();
    };
    for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name, end);
  }
  stickDown(e) {
    if (!this.active || this.stickId !== null || e.pointerType === 'mouse') return;
    e.preventDefault(); this.stickId = e.pointerId; this.stick.setPointerCapture?.(e.pointerId); this.stickMove(e);
  }
  stickMove(e) {
    if (e.pointerId !== this.stickId) return;
    e.preventDefault(); const rect = this.stick.getBoundingClientRect(), radius = rect.width * .42;
    const v = stickVector(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, radius);
    this.knob.style.transform = `translate(${v.x}px, ${v.y}px)`;
    this.input.setTouchMove(v.right, v.forward); this.refreshSprint();
  }
  stickEnd(e) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null; this.knob.style.transform = ''; this.input.setTouchMove(0, 0); this.refreshSprint();
  }
  refreshSprint() {
    const auto = this.input.touchMove.forward > .82 && !this.input.mouse(0) && !this.input.mouse(2);
    this.input.setVirtual('ShiftLeft', 'stick-sprint', auto);
  }
  lookDown(e) {
    if (!this.active || this.lookId !== null || e.pointerType === 'mouse') return;
    e.preventDefault(); this.lookId = e.pointerId; this.lookX = e.clientX; this.lookY = e.clientY;
    this.input.canvas.setPointerCapture?.(e.pointerId);
  }
  lookMove(e) {
    if (e.pointerId !== this.lookId) return;
    e.preventDefault(); this.input.mouseDX += (e.clientX - this.lookX) * 3; this.input.mouseDY += (e.clientY - this.lookY) * 3;
    this.lookX = e.clientX; this.lookY = e.clientY;
  }
  lookEnd(e) { if (e.pointerId === this.lookId) this.lookId = null; }
  reset() {
    this.input.clearVirtual(); this.holds.clear(); this.lookId = null; this.stickId = null; this.aiming = false;
    this.knob.style.transform = ''; for (const el of this.root.querySelectorAll('.held')) el.classList.remove('held');
    document.getElementById('touch-aim').setAttribute('aria-pressed', 'false');
    this.extra.hidden = true;
  }
  update() {
    const G = this.G, mp = G.multiplayer, online = !!mp?.active;
    const playing = this.input.locked && (online ? !!mp.self && !mp.self.dead && mp.room?.phase !== 'intermission' && !mp.room?.nuke && !mp.dropActive() : G.state === 'playing' && !G.player.dead && !G.cinematic);
    const portrait = window.innerHeight > window.innerWidth;
    const active = playing && !portrait;
    this.rotate.hidden = !(playing && portrait); this.root.hidden = !active;
    if (this.active && !active) this.reset();
    this.active = active;
    if (!active) return;
    document.getElementById('touch-special').hidden = online;
    document.getElementById('touch-interact').hidden = online;
    document.getElementById('touch-heal').hidden = online && !!mp.self.robot;
    document.getElementById('touch-robot').hidden = !(online && mp.self.robotReady && !mp.self.robot);
    document.getElementById('touch-nuke').hidden = !(online && mp.self.nukeReady && !mp.self.dead);
    for (const el of this.extra.querySelectorAll('[data-campaign]')) el.hidden = online;
    for (const el of this.extra.querySelectorAll('[data-online]')) el.hidden = !online;
    this.refreshSprint();
    if (!this.hintShown) { this.hintShown = true; setTimeout(() => { const hint = document.getElementById('touch-hint'); if (hint) hint.hidden = true; }, 8500); }
  }
}
