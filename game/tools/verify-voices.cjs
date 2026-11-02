'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {catalog,key,id}=require('./voice-catalog.cjs');
const ROOT=path.join(__dirname,'..');
function verify(lines,manifest,root=ROOT){
  assert.equal(manifest.language,'pt-BR');assert.equal(Object.keys(manifest.lines).length,lines.length,'stale or missing recorded lines');
  const ids=new Set();let bytes=0,seconds=0;
  for(const line of lines){
    const entry=manifest.lines[key(line.speaker,line.text)];assert.ok(entry,'Unvoiced: '+line.speaker+': '+line.text);
    assert.equal(entry.id,id(line.speaker,line.text));assert.ok(!ids.has(entry.id),'Duplicate line ID');ids.add(entry.id);
    assert.equal(entry.speaker,line.speaker);assert.equal(entry.text,line.text);assert.ok(entry.sources.length>0);
    assert.ok(entry.duration>.15&&entry.duration<60,'invalid duration '+entry.id);assert.ok(entry.bytes>1000);
    assert.equal(entry.url,'assets/audio/voices/'+entry.id+'.mp3');assert.equal(fs.statSync(path.join(root,entry.url)).size,entry.bytes);
    assert.ok(entry.voice.voice_a.startsWith('p')&&entry.voice.voice_b.startsWith('p'),'voice must be Brazilian');
    bytes+=entry.bytes;seconds+=entry.duration;
  }
  assert.equal(new Set(Object.values(manifest.cast).map(v=>JSON.stringify(v))).size,Object.keys(manifest.cast).length,'characters share the same voice preset');
  return {lines:lines.length,speakers:Object.keys(manifest.cast).length,bytes,seconds:Math.round(seconds)};
}
if(require.main===module){const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/audio/voices/manifest.json')));console.log('VOICE_COVERAGE_OK '+JSON.stringify(verify(catalog(),manifest)));}
module.exports={verify};
