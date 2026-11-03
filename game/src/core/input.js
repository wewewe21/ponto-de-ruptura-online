// Teclado + mouse com pointer lock. "pressed" vale só para o quadro atual.
export class Input {
  constructor(canvas, { mobile = false } = {}) {
    this.canvas = canvas;
    this.mobile = mobile;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = [false, false, false, false, false];
    this.btnPressed = [false, false, false, false, false];
    this.btnReleased = [false, false, false, false, false];
    this.binds = {};       // ação (código padrão) -> tecla/botão físico escolhido pelo jogador
    this.capture = null;   // quando definido, a próxima tecla/botão vai para essa função (tela de controles)
    this.locked = false;
    this.enabled = true;
    this.onUnlock = null;
    this.virtual = new Map(); this.virtualPressed = new Set(); this.virtualReleased = new Set();
    this.touchMove = { right: 0, forward: 0 };

    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); if (!e.repeat) this._capture(e.code); return; }
      if (e.repeat) return;
      if (this.locked && (['Tab', 'Space', 'ControlLeft', 'KeyS'].includes(e.code) || Object.values(this.binds).includes(e.code))) e.preventDefault();
      this.keys.add(e.code);
      this.pressedSet.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.releasedSet.add(e.code);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignora picos gerados por alguns navegadores ao travar o ponteiro
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (this.capture) { e.preventDefault(); this._capture('Mouse' + e.button); return; }
      if (!this.locked) return;
      this.buttons[e.button] = true;
      this.btnPressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => {
      this.buttons[e.button] = false;
      this.btnReleased[e.button] = true;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      if (this.mobile) return;
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.buttons = [false, false, false, false, false]; }
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    addEventListener('blur', () => { this.keys.clear(); this.buttons = [false, false, false, false, false]; this.clearVirtual(); });
  }
  async lock() {
    if (this.mobile) { this.locked = true; return true; }
    try {
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
      return true;
    } catch (error) {
      if (error.name === 'NotSupportedError') {
        try { await this.canvas.requestPointerLock(); return true; } catch (fallback) { error = fallback; }
      }
      this.onLockError?.(error);
      return false;
    }
  }
  unlock() {
    if (this.mobile) { const was = this.locked; this.locked = false; this.clearVirtual(); if (was) this.onUnlock?.(); return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  setVirtual(action, source, down) {
    let sources = this.virtual.get(action);
    if (down) {
      if (!sources) this.virtual.set(action, sources = new Set());
      if (!sources.has(source)) { sources.add(source); this.virtualPressed.add(action); }
    } else if (sources?.delete(source)) {
      if (!sources.size) { this.virtual.delete(action); this.virtualReleased.add(action); }
    }
  }
  clearVirtual() { this.virtual.clear(); this.virtualPressed.clear(); this.virtualReleased.clear(); this.touchMove.right = 0; this.touchMove.forward = 0; this.mouseDX = 0; this.mouseDY = 0; }
  setTouchMove(right, forward) {
    this.touchMove.right = Math.max(-1, Math.min(1, right)); this.touchMove.forward = Math.max(-1, Math.min(1, forward));
    for (const [code, on] of [['KeyW',forward>.15],['KeyS',forward<-.15],['KeyD',right>.15],['KeyA',right<-.15]]) this.setVirtual(code, 'stick', on);
  }
  movement() {
    if (!this.enabled) return { right: 0, forward: 0 };
    const key = code => Number(this._down(this.physical(code)));
    return { right: Math.max(-1, Math.min(1, key('KeyD') - key('KeyA') + this.touchMove.right)), forward: Math.max(-1, Math.min(1, key('KeyW') - key('KeyS') + this.touchMove.forward)) };
  }
  // remapeamento: o jogo pergunta pelo código padrão (ex.: 'KeyW'); aqui vira a tecla/botão que o jogador escolheu
  setBinds(binds) { this.binds = { ...(binds || {}) }; }
  physical(code) { return this.binds[code] || code; }
  _capture(code) {
    const fn = this.capture; this.capture = null;
    if (code.startsWith('Mouse')) addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });   // o clique que escolheu o botão não aciona nada
    fn && fn(code);
  }
  _down(c) { return c.startsWith('Mouse') ? !!this.buttons[+c.slice(5)] : this.keys.has(c); }
  _pressed(c) { return c.startsWith('Mouse') ? !!this.btnPressed[+c.slice(5)] : this.pressedSet.has(c); }
  _released(c) { return c.startsWith('Mouse') ? !!this.btnReleased[+c.slice(5)] : this.releasedSet.has(c); }
  down(code) { return this.enabled && (this._down(this.physical(code)) || this.virtual.has(code)); }
  pressed(code) { return this.enabled && (this._pressed(this.physical(code)) || this.virtualPressed.has(code)); }
  released(code) { return this._released(this.physical(code)) || this.virtualReleased.has(code); }
  mouse(b) { const code = 'Mouse' + b; return this.enabled && (this._down(this.physical(code)) || this.virtual.has(code) || this.virtualPressed.has(code)); }
  mousePressed(b) { const code = 'Mouse' + b; return this.enabled && (this._pressed(this.physical(code)) || this.virtualPressed.has(code)); }
  mouseReleased(b) { const code = 'Mouse' + b; return this._released(this.physical(code)) || this.virtualReleased.has(code); }
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.btnPressed = [false, false, false, false, false];
    this.btnReleased = [false, false, false, false, false];
    this.virtualPressed.clear(); this.virtualReleased.clear();
  }
}
