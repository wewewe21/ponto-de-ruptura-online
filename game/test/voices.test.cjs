const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const manifest=require('../assets/audio/voices/manifest.json');
const {catalog,key}=require('../tools/voice-catalog.cjs');const {verify}=require('../tools/verify-voices.cjs');

test('all authored dialogue and multiplayer callouts are recorded; missing-file and missing-line controls fail',()=>{
  const lines=catalog();assert.ok(lines.length>100);assert.equal(verify(lines,manifest).speakers,8);
  assert.ok(lines.every(l=>!Object.keys(manifest.cast).includes(l.text)),'nested dialogue arrays must not invent speaker-name utterances');
  const broken=structuredClone(manifest);delete broken.lines[key(lines[0].speaker,lines[0].text)];assert.throws(()=>verify(lines,broken),/missing/);
  assert.throws(()=>verify(lines,manifest,path.join(__dirname,'absent-fixture')),/ENOENT/);
});
function audioFixture(){
  const nodes=[],sources=[];const node=kind=>{const n={kind,frequency:{},gain:{},positionX:{},positionY:{},positionZ:{},threshold:{},ratio:{},attack:{},release:{},connect(other){this.output=other;return other;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const audio={tts:true,master:node('master'),radioBus:node('radioBus')};
  audio.ctx={decodeAudioData:async()=>({duration:4}),createGain:()=>node('gain'),createBiquadFilter:()=>node('filter'),createDynamicsCompressor:()=>node('compressor'),createPanner:()=>node('panner'),createBufferSource:()=>{const s=node('source');s.start=()=>{s.started=true;};s.stop=()=>{s.stopped=true;s.onended?.();};sources.push(s);return s;}};
  return {audio,nodes,sources};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('recorded speech routes radio through filters and nearby speech through a positional panner',async()=>{
  const {VoiceBank,voiceKey}=await import('../src/core/voicebank.js');const f=audioFixture(),bank=new VoiceBank(f.audio);
  bank.lines[voiceKey('TROVÃO','Teste')]=Object.values(manifest.lines)[0];bank.buffer=async()=>({duration:4});
  bank.play('TROVÃO','Teste',{radio:true});await settle();assert.equal(f.sources.length,1);assert.ok(f.sources[0].started);
  assert.ok(f.nodes.some(n=>n.type==='highpass'&&n.frequency.value===380));assert.ok(f.nodes.some(n=>n.type==='lowpass'&&n.frequency.value===3300));
  bank.play('TROVÃO','Teste',{radio:false,pos:{x:3,y:1,z:7}});await settle();assert.ok(f.sources[0].stopped);
  const pan=f.nodes.find(n=>n.kind==='panner');assert.equal(pan.positionX.value,3);assert.equal(pan.positionZ.value,7);assert.equal(pan.output,f.audio.master);
  bank.stop();assert.ok(f.sources[1].stopped);assert.equal(bank.active.size,0);
});
test('cleared, replaced, stale or muted pending speech cannot start after its download finishes',async()=>{
  const {VoiceBank,voiceKey}=await import('../src/core/voicebank.js');const f=audioFixture(),bank=new VoiceBank(f.audio);
  bank.lines[voiceKey('ATALAIA','Teste')]=Object.values(manifest.lines)[0];let resolve;bank.buffer=()=>new Promise(r=>resolve=r);
  bank.play('ATALAIA','Teste');bank.stop();resolve({duration:4});await settle();assert.equal(f.sources.length,0);
  bank.play('ATALAIA','Teste');f.audio.tts=false;resolve({duration:4});await settle();assert.equal(f.sources.length,0);
  f.audio.tts=true;let time=100;bank.clock=()=>time;bank.play('ATALAIA','Teste',{maxDelay:1000});time=2000;resolve({duration:4});await settle();assert.equal(f.sources.length,0);
});
test('dialogue uses recorded duration, routes nearby allies normally and cancels lower-priority speech',async()=>{
  const {Dialog}=await import('../src/game/hud.js');const calls=[];const G={player:{pos:{}},allies:{byName:{'TROVÃO':{pos:{distanceTo:()=>4,clone:()=>({x:1,y:0,z:2})}}}},hud:{subtitle(...a){calls.push(['subtitle',...a]);}},audio:{stopSpeech(c){calls.push(['stop',c]);},speechDuration:()=>9,squelch(){calls.push(['radio']);},speak(text,speaker,options){calls.push(['speech',text,speaker,options]);}}};
  const d=new Dialog(G);d.say('TROVÃO','Uma fala comprida.');assert.ok(d.t>9);const first=calls.find(c=>c[0]==='speech');assert.equal(first[3].radio,false);assert.equal(first[3].pos.x,1);
  d.say('ATALAIA','Urgente!',{priority:3});assert.equal(d.cur.speaker,'ATALAIA');assert.ok(calls.filter(c=>c[0]==='stop').length>=2);assert.ok(calls.some(c=>c[0]==='radio'));
  first[3].onStart(20);assert.ok(d.t<20,'obsolete decode callback must not extend the next dialogue');d.clear();assert.equal(d.busy,false);
});
test('multiplayer announces state changes and robot rewards once, and suppresses low-priority barks during announcements',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');const {MP_VOICE_LINES}=await import('../src/multiplayer/voice-lines.js');
  const previousDocument=global.document;const node={};global.document={getElementById:()=>node};
  try{
    const said=[];let now=1000;const m=Object.assign(Object.create(Multiplayer.prototype),{G:{audio:{speechDuration:()=>3,speak(text,speaker,options){said.push({text,speaker,options});}}},now:()=>now});
    const p={team:'alpha',robot:false,dead:false,robotReady:false,reloadUntil:0},room={phase:'playing',round:1};
    m.updateVoice(null,p,null,room);assert.equal(said.at(-1).text,MP_VOICE_LINES.start[1]);
    m.updateVoice(p,p,room,room);assert.equal(said.length,1);m.speakMatch('kill',0);assert.equal(said.length,1);
    now+=4000;m.updateVoice(p,{...p,robotReady:true},room,room);assert.equal(said.at(-1).text,MP_VOICE_LINES.ready[1]);
    m.updateVoice({...p,robot:true},{...p,robot:true,dead:true},room,room);assert.equal(said.at(-1).text,MP_VOICE_LINES.destroyed[1]);
  }finally{global.document=previousDocument;}
});
