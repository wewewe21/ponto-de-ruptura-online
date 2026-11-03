const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let THREE, Weather, presets, robots, avatars;
test.before(async () => {
  THREE = await import('three');
  ({ Weather } = await import('../src/world/weather.js'));
  ({ MATCH_WEATHER: presets } = await import('../src/world/match-weather.js'));
  robots = await import('../src/multiplayer/robot-view.js');
  avatars = await import('../src/multiplayer/avatars.js');
});

function weatherGame() {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x070a0d, 0.0115);
  return { scene, camera: new THREE.PerspectiveCamera(70, 16 / 9), hemi: new THREE.HemisphereLight(0x3d4c63, 0x1a1b1d, 0.55), moon: new THREE.DirectionalLight(0xb8c8ff, 0.12), lightBase: { hemi: 2, moon: 0.58 }, level: { T: {} } };
}

test('match weather uses the four protocol IDs, with dry day choices and light rain', () => {
  assert.deepEqual(Object.keys(presets).sort(), ['day_clear', 'day_cloudy', 'rain', 'sunset']);
  for (const id of ['day_clear', 'day_cloudy', 'sunset']) {
    assert.equal(presets[id].rain, 0); assert.equal(presets[id].lightning, false);
    assert.ok(presets[id].hemi >= 2, `${id} must remain legible`);
  }
  assert.ok(presets.rain.rain > 0 && presets.rain.rain < 0.4);
  assert.ok(presets.day_clear.sun > presets.day_cloudy.sun);
  assert.ok(presets.day_clear.fogDensity < presets.rain.fogDensity);
  assert.ok(Object.isFrozen(presets) && Object.values(presets).every(Object.isFrozen));
});

test('dry match removes every rain draw and blocks automatic and explicit lightning', () => {
  const G = weatherGame(), weather = new Weather(G); let thunders = 0;
  G.audio = { thunder() { thunders++; } };
  weather.setMatchWeather('rain'); weather.update(0.1);
  assert.equal(weather.rain.visible, true); assert.ok(weather.rainMat.uniforms.uDensity.value > 0);
  weather.setMatchWeather('day_clear'); weather.nextStrike = -1; weather.strike(true); weather.update(100);
  assert.equal(weather.rain.visible, false);
  assert.equal(weather.rainMat.uniforms.uDensity.value, 0); assert.equal(weather.rainMat.uniforms.uOpacity.value, 0);
  assert.equal(weather.flash, 0); assert.equal(weather.boltMat.opacity, 0); assert.equal(thunders, 0);
  assert.equal(weather.skyMat.uniforms.uMatch.value, 1);
  assert.ok(G.hemi.intensity > 2); assert.ok(G.moon.intensity > 3);
  // The GPU density predicate must also reject zero; step(random,0) alone keeps a zero seed.
  assert.match(weather.rainMat.vertexShader, /step\(0\.00001, uDensity\)/);
});

test('same ID produces the same sky/light/fog on independent clients', () => {
  const a = weatherGame(), b = weatherGame();
  const wa = new Weather(a), wb = new Weather(b);
  wa.time = 11; wb.time = 303;
  for (const id of Object.keys(presets)) {
    wa.setMatchWeather(id); wb.setMatchWeather(id); wa.update(0.02); wb.update(0.02);
    assert.equal(a.scene.fog.color.getHex(), b.scene.fog.color.getHex());
    assert.equal(a.scene.fog.density, b.scene.fog.density);
    assert.equal(a.hemi.intensity, b.hemi.intensity); assert.equal(a.moon.intensity, b.moon.intensity);
    assert.equal(wa.skyMat.uniforms.uHigh.value.getHex(), wb.skyMat.uniforms.uHigh.value.getHex());
  }
});

test('clearing a sequence of match presets restores campaign state and storm behavior', () => {
  const G = weatherGame(), weather = new Weather(G); weather.update(0.1);
  weather.intensity = 0.73; weather.lightningDisabled = true;
  const original = { sky: G.hemi.color.getHex(), ground: G.hemi.groundColor.getHex(), moon: G.moon.color.getHex(), fog: G.scene.fog.color.getHex(), density: G.scene.fog.density, environment: G.scene.environmentIntensity };
  weather.setMatchWeather('day_clear'); weather.setMatchWeather('sunset'); weather.setMatchWeather('rain');
  weather.clearMatchWeather();
  assert.equal(weather.intensity, 0.73); assert.equal(weather.lightningDisabled, true);
  assert.equal(weather.skyMat.uniforms.uMatch.value, 0); assert.equal(weather.cities.visible, true);
  assert.equal(G.hemi.color.getHex(), original.sky); assert.equal(G.hemi.groundColor.getHex(), original.ground);
  assert.equal(G.moon.color.getHex(), original.moon); assert.equal(G.scene.fog.color.getHex(), original.fog);
  assert.equal(G.scene.fog.density, original.density); assert.equal(G.scene.environmentIntensity, original.environment);
  weather.clearMatchWeather(); weather.update(0.1);
  assert.equal(weather.rain.visible, true); assert.ok(weather.rainMat.uniforms.uDensity.value > 0.45);
  assert.ok(G.scene.fog.density > 0.01);
  assert.throws(() => weather.setMatchWeather('typo'), RangeError);
  assert.equal(weather.matchWeather, null);
});

function robotFixture() {
  const model = new THREE.Group(), fbx = new THREE.Group(); model.add(fbx);
  const bones = {}, rest = {};
  const definitions = [
    ['Hips', null, [0, 2.2, 0]], ['Spine', 'Hips', [0, 0.3, 0]], ['Spine1', 'Spine', [0, 0.3, 0]], ['Spine2', 'Spine1', [0, 0.4, 0]], ['Neck', 'Spine2', [0, 0.5, 0]], ['Head', 'Neck', [0, 0.4, 0]],
    ...['Left', 'Right'].flatMap((side, i) => {
      const x = i ? -1 : 1;
      return [[side + 'Shoulder', 'Spine2', [x * 0.35, 0, 0]], [side + 'Arm', side + 'Shoulder', [x * 0.25, 0, 0]], [side + 'ForeArm', side + 'Arm', [x * 0.7, 0, 0]], [side + 'Hand', side + 'ForeArm', [x * 0.65, 0, 0]], [side + 'UpLeg', 'Hips', [x * 0.3, 0, 0]], [side + 'Leg', side + 'UpLeg', [0, -1, 0]], [side + 'Foot', side + 'Leg', [0, -1, 0]], [side + 'ToeBase', side + 'Foot', [0, 0, 0.2]]];
    }),
  ];
  for (const [name, parent, position] of definitions) {
    const bone = new THREE.Bone(); bone.name = 'mixamorig' + name; bone.position.set(...position);
    (parent ? bones[parent] : fbx).add(bone); bones[name] = bone;
  }
  model.updateMatrixWorld(true);
  for (const [name, bone] of Object.entries(bones)) rest[name] = { localQ: bone.quaternion.clone(), localP: bone.position.clone(), worldQ: bone.getWorldQuaternion(new THREE.Quaternion()) };
  const all = Object.values(bones), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 3, 0, 1, 3, 0, 1, 2.7, 0, 0, 2, 0, 0.5, 2, 0, 0.5, 1, 0], 3));
  const arm = all.indexOf(bones.RightForeArm), hip = all.indexOf(bones.Hips);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([arm, 0, 0, 0, arm, 0, 0, 0, arm, 0, 0, 0, hip, 0, 0, 0, hip, 0, 0, 0, hip, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: 24 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); fbx.add(mesh); mesh.bind(new THREE.Skeleton(all));
  const gun = new THREE.Group(); gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.3), new THREE.MeshStandardMaterial()));
  gun.userData.anchors = { gripR: new THREE.Vector3(0, 0.2, -0.7), gripL: new THREE.Vector3(0, 0.2, 0.2), muzzle: new THREE.Vector3(0, 0.4, 1.2) };
  const rot = new Float32Array(240); for (let i = 3; i < rot.length; i += 4) rot[i] = 1;
  const clip = (name) => ({ name, frames: 2, fps: 30, dur: 2 / 30, rot, root: new Float32Array([0, 0.93, 0, 0, 0.93, 0]), noXZ: true });
  const clips = Object.fromEntries(['idle', 'walk', 'run', 'die'].map((name) => [name, clip(name)]));
  return { rig: { model, fbx, bones, rest, mesh, height: 5, scale: 1, hipHeight: 2.2, hipsRest: new THREE.Vector3(0, 2.2, 0) }, gun, clips };
}

test('robot clones isolate skeleton, material and hips closure without copying shared texture geometry', () => {
  const source = robotFixture(), a = robots.cloneRobotAssets(source), b = robots.cloneRobotAssets(source);
  assert.notEqual(a.rig.bones.RightHand, b.rig.bones.RightHand);
  assert.notEqual(a.rig.mesh.material, b.rig.mesh.material);
  assert.equal(a.rig.mesh.geometry, source.rig.mesh.geometry);
  assert.equal(a.rig.mesh.skeleton.bones.find((bone) => bone.name.endsWith('RightHand')), a.rig.bones.RightHand);
  a.rig.model.position.set(5, 8, 3); a.rig.setHips(new THREE.Vector3(0, -0.8, 0));
  assert.ok(Math.abs(a.rig.bones.Hips.position.y - 1.4) < 1e-6);
  assert.equal(b.rig.bones.Hips.position.y, 2.2); assert.equal(source.rig.bones.Hips.position.y, 2.2);
  a.rig.bones.RightHand.rotation.x = 1; a.rig.mesh.material.color.setHex(0xff0000);
  assert.ok(Math.abs(b.rig.bones.RightHand.rotation.x) < 1e-9); assert.notEqual(b.rig.mesh.material.color.getHex(), 0xff0000);
  robots.disposeRobotAssets(a); robots.disposeRobotAssets(b);
});

test('shipped Colosso GLB has enough original mechanical arm skin for the viewmodel', () => {
  const file = fs.readFileSync(path.join(__dirname, '../assets/models/robot_rigged.glb'));
  const jsonLength = file.readUInt32LE(12), json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
  const binary = file.subarray(28 + jsonLength);
  const node = json.nodes.find((n) => n.mesh !== undefined && n.skin !== undefined), primitive = json.meshes[node.mesh].primitives[0];
  const joints = json.skins[node.skin].joints;
  const bones = joints.map((id) => { const bone = new THREE.Bone(); bone.name = json.nodes[id].name; return bone; });
  joints.forEach((id, i) => { for (const child of json.nodes[id].children || []) if (joints.includes(child)) bones[i].add(bones[joints.indexOf(child)]); });
  const accessor = (id, width) => {
    const a = json.accessors[id], v = json.bufferViews[a.bufferView];
    const readers = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
    const [read, bytes] = readers[a.componentType], out = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) out.push(binary[read]((v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || bytes * width) + k * bytes));
    return out;
  };
  const geometry = new THREE.BufferGeometry(), count = json.accessors[primitive.attributes.POSITION].count;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(accessor(primitive.attributes.JOINTS_0, 4), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(accessor(primitive.attributes.WEIGHTS_0, 4), 4));
  if (primitive.indices !== undefined) geometry.setIndex(accessor(primitive.indices, 1));
  const mesh = new THREE.SkinnedMesh(geometry); mesh.skeleton = new THREE.Skeleton(bones);
  const arms = robots.robotArmGeometry(mesh);
  assert.ok(arms.index.count > 300, 'arm detail must come from the shipped skinned model');
  assert.ok(arms.index.count < (geometry.index?.count || count) / 2, 'torso and head stay outside first person');
  const forearms = new Set();
  for (const bone of bones) if (/(Left|Right)ForeArm$/.test(bone.name)) bone.traverse((o) => { if (o.isBone) forearms.add(bones.indexOf(o)); });
  for (const vertex of new Set(arms.index.array)) {
    let lowerArm = 0, upperBody = 0;
    for (let k = 0; k < 4; k++) {
      const joint = geometry.attributes.skinIndex.array[vertex * 4 + k], weight = geometry.attributes.skinWeight.array[vertex * 4 + k];
      if (forearms.has(joint)) lowerArm += weight; else upperBody += weight;
    }
    assert.ok(lowerArm >= 0.9 && upperBody <= 0.10001, 'visible skin cannot carry strong shoulder/root influence');
  }
  arms.dispose(); geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose();
});

test('forearm filter rejects pure shoulders/upper arms/root and mixed body fragments', () => {
  const { rig } = robotFixture(), bones = rig.mesh.skeleton.bones;
  const allowed = bones.indexOf(rig.bones.RightForeArm), shoulder = bones.indexOf(rig.bones.RightShoulder), upper = bones.indexOf(rig.bones.RightArm), hip = bones.indexOf(rig.bones.Hips);
  const geometry = new THREE.BufferGeometry(), positions = new Float32Array(45), indices = [], weights = [];
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: 30 }, (_, i) => i / 30), 2));
  for (const [joint, weight, other] of [[allowed, 1, hip], [shoulder, 1, hip], [upper, 1, hip], [hip, 1, hip], [allowed, 0.85, shoulder]]) {
    for (let vertex = 0; vertex < 3; vertex++) { indices.push(joint, other, 0, 0); weights.push(weight, 1 - weight, 0, 0); }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  rig.mesh.geometry = geometry;
  const arms = robots.robotArmGeometry(rig.mesh);
  assert.deepEqual(Array.from(arms.index.array), [0, 1, 2]);
  assert.deepEqual(arms.attributes.uv.array, geometry.attributes.uv.array);
  assert.deepEqual(arms.attributes.skinWeight.array, geometry.attributes.skinWeight.array);
  arms.dispose(); geometry.dispose();
});

test('first-person shows only the stable aimed robot gun; resizes and recoils', () => {
  const source = robotFixture(), assets = robots.cloneRobotAssets(source);
  const view = new robots.RobotView(weatherGame(), assets);
  assert.equal(view.rig.model.parent, null, 'body and arms are not drawn in the view scene');
  assert.equal(view.gun.parent, view.scene);
  assert.equal(source.rig.mesh.geometry.index, null);
  view.update(1 / 60, { adsT: 1, speed: 4.4, yaw: 0.1, pitch: 0.2 });
  assert.ok(view.gun.position.x > 0.15 && view.gun.position.x < 0.3); assert.ok(view.gun.position.z < -1);
  const muzzle = view.gun.localToWorld(view.gun.userData.anchors.muzzle.clone());
  assert.ok(muzzle.z < view.gun.position.z, 'gun muzzle faces into the world');
  const before = view.gun.position.z; view.kick(); view.update(1 / 60, {});
  assert.ok(view.gun.position.z > before); assert.ok(view.flash.material.opacity > 0);
  view.resize(1.25); assert.equal(view.camera.aspect, 1.25);
  for (const bone of Object.values(view.rig.bones)) assert.ok(bone.quaternion.toArray().every(Number.isFinite));
  view.dispose(); assert.equal(view.scene.children.length, 0);
});

test('remote robot gun follows the hand from the first death frame and the shared rig stays alive', () => {
  const source = robotFixture(), G = weatherGame(), avatar = new avatars.RobotAvatar(G, source);
  avatar.setPose(new THREE.Vector3(5, 0, 2), Math.PI); avatar.animate(1 / 60, 3);
  const position = avatar.gun.getWorldPosition(new THREE.Vector3());
  avatar.die();
  assert.equal(avatar.gun.parent, avatar.rig.bones.RightHand);
  assert.ok(avatar.gun.getWorldPosition(new THREE.Vector3()).distanceTo(position) < 1e-6);
  avatar.animate(1 / 60, 0); assert.equal(avatar.anim.name, 'die');
  assert.equal(source.gun.parent, null); assert.equal(source.rig.bones.RightHand.rotation.x, 0);
  avatar.dispose(); assert.equal(G.scene.children.length, 0);
});

test('robot drops with the campaign landing pose and emits impact once for observers', () => {
  const source=robotFixture(),G=weatherGame();let impacts=0,smoke=0;
  source.clips.land={...source.clips.idle,name:'land'};
  G.fx={explosion(){impacts++;},smokeCloud(){smoke++;},sparks(){},addEmitter(e){return e;}};
  G.audio={thud(){},explosion(){}};G.player={pos:new THREE.Vector3(0,0,0),shake(){}};
  const avatar=new avatars.RobotAvatar(G,source),base=new THREE.Vector3(2,0,3),drop={dropId:1000,impactMs:2800,durationMs:5000};
  avatar.setPose(base,0);avatar.animate(.016,0,0,0,{...drop,dropElapsed:100});
  assert(avatar.root.position.y>30);assert.equal(avatar.anim.name,'land');assert.equal(impacts,0);assert.equal(avatar.trails.length,2);
  avatar.setPose(base,0);avatar.animate(.016,0,0,0,{...drop,dropElapsed:2800});
  assert.equal(avatar.root.position.y,0);assert.equal(impacts,1);assert.equal(smoke,1);assert.equal(avatar.trails,null);
  avatar.setPose(base,0);avatar.animate(.016,0,0,0,{...drop,dropElapsed:3200});assert.equal(impacts,1);
  avatar.setPose(base,0);avatar.animate(.016,0,0,0,{...drop,dropElapsed:5001});assert.equal(avatar.anim.name,'idle');
  avatar.dispose();assert.equal(G.scene.children.length,0);
});

test('only the pilot gets the temporary cinematic camera and it is cleaned up afterwards',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js'),source=robotFixture(),G=weatherGame(),oldDocument=global.document;
  source.clips.land={...source.clips.idle,name:'land'};G.fx={explosion(){},smokeCloud(){},sparks(){},addEmitter(e){return e;}};
  G.audio={thud(){},explosion(){}};G.player={pos:new THREE.Vector3(),shake(){}};G.post={uniforms:{uFade:{value:0}}};
  const classes=new Set(),nodes={'mp-hud':{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},'mp-robot-intro':{hidden:true}};
  global.document={getElementById:id=>nodes[id]};
  try{
    const self={robot:true,dead:false,robotDropAt:100000,x:2,y:0,z:3,yaw:0};
    const mp=Object.assign(Object.create(Multiplayer.prototype),{G,self,rules:{robot:{dropDurationMs:5000,dropImpactMs:2800}},robotView:{template:source}});
    assert(mp.updatePilotDrop(101400,.016));assert(mp.pilotDrop);assert(classes.has('robot-intro'));assert.equal(nodes['mp-robot-intro'].hidden,false);
    assert(mp.pilotDrop.avatar.root.position.y>0);assert.notDeepEqual(G.camera.position.toArray(),[0,0,0]);
    assert(mp.updatePilotDrop(104900,.016));assert(G.post.uniforms.uFade.value>.5);
    assert.equal(mp.updatePilotDrop(105001,.016),false);assert.equal(mp.pilotDrop,null);assert(!classes.has('robot-intro'));
    mp.self={robot:false,dead:false,robotDropAt:100000};assert.equal(mp.updatePilotDrop(101400,.016),false);assert.equal(G.scene.children.length,0);
  }finally{global.document=oldDocument;}
});

test('remote shot actor uses event.player while ignoring own authoritative echo', () => {
  let flashes = 0, traces = 0;
  const remotes = new avatars.RemoteAvatars({ fx: { tracer() { traces++; }, flashLight() {} }, audio: { shot() {} } });
  remotes.selfId = 'self'; remotes.avatars.set('other', { model: { muzzleFlash() { flashes++; } } });
  remotes.event({ type: 'shot', id: 'unique-event', player: 'other', origin: [0, 1, 0], end: [0, 1, -10] });
  remotes.event({ type: 'shot', id: 'another-event', player: 'self', origin: [0, 1, 0], end: [0, 1, -10] });
  assert.equal(flashes, 1); assert.equal(traces, 1);
});
