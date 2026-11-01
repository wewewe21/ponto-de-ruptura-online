// Teclado + mouse com pointer lock. "pressed" vale só para o quadro atual.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = [false, false, false];
    this.btnPressed = [false, false, false];
    this.btnReleased = [false, false, false];
    this.locked = false;
    this.enabled = true;
    this.onUnlock = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Tab', 'Space', 'ControlLeft', 'KeyS'].includes(e.code) && this.locked) e.preventDefault();
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
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.buttons = [false, false, false]; }
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    addEventListener('blur', () => { this.keys.clear(); this.buttons = [false, false, false]; });
  }
  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) {} });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) {}
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.enabled && this.keys.has(code); }
  pressed(code) { return this.enabled && this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  mouse(b) { return this.enabled && this.buttons[b]; }
  mousePressed(b) { return this.enabled && this.btnPressed[b]; }
  mouseReleased(b) { return this.btnReleased[b]; }
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.btnPressed = [false, false, false];
    this.btnReleased = [false, false, false];
  }
}
