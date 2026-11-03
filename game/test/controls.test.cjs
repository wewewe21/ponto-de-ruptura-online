const test = require('node:test');
const assert = require('node:assert/strict');

function stubDom() {
  const handlers = {};
  globalThis.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
  globalThis.document = { addEventListener() {}, pointerLockElement: null };
  const fire = (type, e = {}) => (handlers[type] || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, repeat: false, ...e }));
  return fire;
}

test('key and mouse bindings remap actions to keys, mouse buttons and side buttons, and capture the next input', async () => {
  const fire = stubDom();
  const { Input } = await import('../src/core/input.js');
  const { ACTIONS, codeLabel } = await import('../src/core/keybinds.js');
  const input = new Input({});
  input.locked = true;
  fire('keydown', { code: 'KeyW' });
  assert.equal(input.down('KeyW'), true);
  input.endFrame(); fire('keyup', { code: 'KeyW' });

  input.setBinds({ Space: 'KeyC', KeyC: 'KeyJ', Mouse2: 'KeyH', Mouse0: 'Mouse4' });
  fire('keydown', { code: 'KeyC' });
  assert.equal(input.pressed('Space'), true, 'jump now lives on C');
  assert.equal(input.pressed('KeyC'), false, 'crouch no longer answers to C');
  input.endFrame(); fire('keyup', { code: 'KeyC' });
  fire('keydown', { code: 'KeyH' });
  assert.equal(input.mouse(2), true, 'aim can be bound to a keyboard key');
  fire('mousedown', { button: 4 });
  assert.equal(input.mouse(0), true, 'fire can be bound to a side mouse button');
  assert.equal(input.mousePressed(0), true);

  input.capture = code => { input.captured = code; };
  fire('keydown', { code: 'KeyP' });
  assert.equal(input.captured, 'KeyP');
  assert.equal(input.capture, null, 'capture is one-shot');
  assert.equal(input.pressed('KeyP'), false, 'the captured key is not also delivered to the game');

  assert.ok(ACTIONS.length >= 20 && new Set(ACTIONS.map(a => a.id)).size === ACTIONS.length);
  assert.equal(codeLabel('KeyW'), 'W'); assert.equal(codeLabel('Digit3'), '3'); assert.equal(codeLabel('Mouse2'), 'MOUSE 2'); assert.equal(codeLabel('Space'), 'ESPAÇO');
});

test('mouse wheel cycles every weapon in both directions in the campaign', async () => {
  const { Weapons } = await import('../src/actors/weapons.js');
  const G = { time: 0, player: { dead: false, locked: false, sprinting: false, hSpeed: 0, stance: 'stand', body: { onGround: true } },
    audio: { mech() {} }, hud: { toast() {} }, vm: { set(id) { this.id = id; } } };
  const W = G.weapons = new Weapons(G);
  const spin = dir => { W.update(0.016, { enabled: true, wheel: dir, pressed: () => false, down: () => false, mouse: () => false, mousePressed: () => false }); for (let i = 0; i < 60; i++) W.update(0.016, { enabled: true, wheel: 0, pressed: () => false, down: () => false, mouse: () => false, mousePressed: () => false }); return W.id; };
  const seen = [W.id];
  for (let i = 0; i < 7; i++) seen.push(spin(1));
  assert.deepEqual(seen, ['SD9', 'MK5', 'KR7', 'VK12', 'P19', 'KNIFE', 'AX50', 'SD9']);
  assert.equal(spin(-1), 'AX50');
  assert.equal(spin(-1), 'KNIFE');
});

test('sniper recoil rises fast, holds, then returns smoothly; shake fades out by itself; rifles return quickly', async () => {
  const { Recoil } = await import('../src/actors/recoil.js');
  const run = (id, upDeg, steps) => { const R = new Recoil(), P = { pitch: 0, yaw: 0 }, tl = []; R.kick(upDeg * Math.PI / 180, 0, id); for (let i = 0; i < steps; i++) { R.update(1 / 30, P); tl.push(P.pitch * 180 / Math.PI); } return { tl, P }; };
  const s = run('AX50', 3.8, 120);
  assert(s.tl[7] > 3.2, 'sobe rápido');                                            // ~0,25 s
  assert(Math.abs(s.tl[12] - s.tl[16]) < 0.3, 'segura em cima');                   // ~0,4–0,55 s quase parado
  assert(s.tl[45] < s.tl[20] && s.tl[45] > 0.8, 'desce devagar');
  for (let i = 21; i < 120; i++) assert(s.tl[i] <= s.tl[i - 1] + 0.12, 'sem solavancos grandes na volta ' + i);   // só o tremor leve
  assert(s.tl[119] < 0.8 && s.tl[119] > 0, 'fica um pouco acima, como a campanha');
  const r = run('SD9', 1.4, 30);
  assert(r.tl[29] < r.tl[4], 'fuzil volta mais rápido');
});
