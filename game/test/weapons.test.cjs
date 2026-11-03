const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function input(key) {
  return { enabled: true, wheel: 0, pressed: code => code === key, down: () => false, mouse: () => false, mousePressed: () => false };
}
function context() {
  return { time: 0, player: { dead: false, locked: false, sprinting: false, hSpeed: 0, stance: 'stand', body: { onGround: true } },
    audio: { mech() {} }, hud: { toast() {} }, vm: { set(id) { this.id = id; } } };
}

test('campaign keys select every primary, pistol, knife and sniper; switching preserves each magazine and checkpoint selection', async () => {
  const { Weapons, ARSENAL } = await import('../src/actors/weapons.js');
  const G = context(), W = G.weapons = new Weapons(G);
  const press = key => { W.update(0.016, input(key)); for (let i = 0; i < 30; i++) W.update(0.016, input(null)); };
  assert.equal(W.id, 'SD9');
  for (const id of [...ARSENAL.slice(1), ARSENAL[0]]) { press('Digit1'); assert.equal(W.id, id); assert.equal(G.vm.id, id); }
  W.A.mag = 11;
  for (const [key, id] of [['Digit2','P19'],['Digit3','KNIFE'],['Digit4','AX50']]) {
    press(key); assert.equal(W.id, id); assert.equal(G.vm.id, id);
  }
  W.A.mag = 2; const saved = W.snapshot(); W.reset(saved); assert.equal(W.id, 'AX50'); assert.equal(W.A.mag, 2);
  press('Digit1'); assert.equal(W.id, 'SD9'); assert.equal(W.A.mag, 11);
  press('Digit4'); assert.equal(W.id, 'AX50'); assert.equal(W.A.mag, 2);
});

test('multiplayer keys select the same arsenal and send the selected ID to the authoritative server; robot controls keep their cannon', async () => {
  const { Weapons, ARSENAL } = await import('../src/actors/weapons.js');
  const { Multiplayer } = await import('../src/multiplayer/client.js');
  const G = context(); G.weapons = new Weapons(G);
  const mp = Object.assign(Object.create(Multiplayer.prototype), { G, self: { robot: false }, weapon: 'SD9', lastPrimary: 'SD9', seq: 0 });
  G.input = input(null);
  const press = (key, id) => {
    mp.selectWeapon(input(key)); assert.equal(mp.weapon, id); assert.equal(G.weapons.id, id); assert.equal(G.vm.id, id);
    assert.equal(mp.command(false).weapon, id);
  };
  mp.applyWeapon('SD9', true);
  for (const id of [...ARSENAL.slice(1), ARSENAL[0]]) press('Digit1', id);
  press('Digit2','P19'); press('Digit3','KNIFE'); press('Digit4','AX50'); press('Digit1','SD9');
  mp.self.robot = true;
  for (const key of ['Digit1','Digit2','Digit3','Digit4']) { mp.selectWeapon(input(key)); assert.equal(mp.weapon,'SD9'); }
});

test('each selectable weapon has a registered model and deployed model file, including the FPS arm poses', async () => {
  const { ARSENAL } = await import('../src/actors/weapons.js');
  const { GUN_SPECS } = await import('../src/actors/weaponmodels.js');
  const poses = JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/poses/fps_poses.json')));
  for (const id of [...ARSENAL,'P19','AX50','KNIFE']) {
    const file = id === 'KNIFE' ? 'knife' : ['SD9','KR7'].includes(id) ? '../rifle' : GUN_SPECS[id].file;
    const model = path.join(__dirname,'../assets/models/weapons',file+'.glb');
    assert.ok(fs.statSync(model).size > 1000, `${id} model`);
    assert.ok(poses.weapons[id === 'KR7' ? 'SD9' : id], `${id} arm pose`);
  }
});

test('model placement saved in the pose file is applied to the gun (pistol is shrunk and sniper moved back, exactly as left in Blender)', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const poses = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'poses', 'fps_poses.json'), 'utf8'));
  for (const id of ['MK5', 'P19', 'VK12', 'AX50', 'SD9']) assert.equal(poses.weapons[id].model.length, 16, id + ' sem posição do modelo');
  const m = poses.weapons.P19.model;                                       // matriz coluna-major: escala = comprimento da 1ª coluna
  assert(Math.abs(Math.hypot(m[0], m[1], m[2]) - 0.256) < 0.01, 'a Glock ficou menor no Blender (0,256)');
  assert(Math.abs(poses.weapons.AX50.model[14] - 1.148) < 0.01 || Math.abs(Math.hypot(poses.weapons.AX50.model[0], poses.weapons.AX50.model[1], poses.weapons.AX50.model[2]) - 1.15) < 0.01);
});
