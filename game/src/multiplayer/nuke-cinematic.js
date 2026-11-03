import * as THREE from 'three';

// Relógio do servidor mantém as etapas iguais para quem se reconecta durante a sequência.
export class NukeCinematic {
  constructor(G) { this.G = G; this.audio = G.audio; this.last = ''; this.start = 0; this.missile = null; }
  clear() {
    const el = document.getElementById('nuke-cinematic'); if (el) el.hidden = true;
    if(this.missile){this.G.scene.remove(this.missile);this.missile.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.missile=null;}
    this.last = ''; this.start = 0; this.impact = false;
  }
  makeMissile() {
    const group=new THREE.Group();
    const part=(geometry,color,y,emissive=0)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.7,roughness:.35,emissive}));mesh.position.y=y;group.add(mesh);return mesh;};
    part(new THREE.CylinderGeometry(.8,.8,8,16),0x899694,0);
    const nose=part(new THREE.ConeGeometry(.8,2.8,16),0xced5c6,-5.4);nose.rotation.z=Math.PI;
    part(new THREE.CylinderGeometry(.85,.95,.5,16),0x20292b,3.9);
    part(new THREE.ConeGeometry(.7,3,12),0xffaa33,5.5,0xff5310);
    for(let i=0;i<4;i++){const fin=part(new THREE.BoxGeometry(.12,1.8,1.5),0x3a4c4b,3);fin.rotation.y=i*Math.PI/2;fin.position.x=Math.sin(fin.rotation.y)*.75;fin.position.z=Math.cos(fin.rotation.y)*.75;}
    this.G.scene.add(group);this.missile=group;
  }
  update(nuke, phase, id, now) {
    const el = document.getElementById('nuke-cinematic'); if (!el) return;
    if (!nuke || phase !== 'playing') { if (!el.hidden) this.clear(); return; }
    const t = Math.max(0, now - nuke.startedAt), owner = nuke.player === id;
    const stage = t < 3000 ? (owner ? 'phone' : 'alert') : t < 7000 ? 'missile' : 'blast';
    el.hidden = false; el.dataset.stage = stage;
    const code = el.querySelector('.phone-code');
    code.textContent = t < 700 ? '___' : t < 1250 ? '1__' : t < 1800 ? '11_' : '113';
    if (this.start !== nuke.startedAt) { this.start = nuke.startedAt; this.last = ''; }
    if (this.last !== stage) {
      this.last = stage;
      if (stage === 'phone' || stage === 'alert') this.audio?.medal?.(2, true);
      if (stage === 'missile') this.audio?.sfx?.('incoming');
      if (stage === 'blast') { if(!this.audio?.sfx?.('boom_big'))this.audio?.explosion?.(this.G.camera?.position||{x:0,y:0,z:0},3); this.audio?.medal?.(4, true); }
    }
    if ((stage==='missile'||stage==='blast') && this.G.scene && this.G.camera && Number.isFinite(nuke.x)) {
      if(!this.missile)this.makeMissile();
      const k=THREE.MathUtils.clamp((t-3000)/4000,0,1),height=(1-k*k)*90;
      this.missile.visible=stage==='missile';this.missile.position.set(nuke.x,nuke.y+height+6,nuke.z);
      const cam=this.G.camera;cam.position.set(nuke.x+26,nuke.y+12+height*.5,nuke.z+34);
      cam.lookAt(nuke.x,nuke.y+Math.max(4,height*.7),nuke.z);cam.fov=55;cam.updateProjectionMatrix();
      if(stage==='blast'&&!this.impact){this.impact=true;const p=new THREE.Vector3(nuke.x,nuke.y,nuke.z);this.G.fx?.explosion(p,4);this.G.fx?.smokeCloud(p,8);}
    }
  }
}
