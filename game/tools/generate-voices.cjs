'use strict';
// Run while the local ComfyUI + tools/comfy_nodes/pdr_kokoro node is available.
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const comfy=require('./comfy');const {catalog,key}=require('./voice-catalog.cjs');
const workflow=require('./workflows/pdr-voices-api.json');
const DIR=path.join(__dirname,'../assets/audio/voices');
const manifestFile=path.join(DIR,'manifest.json');
const cast={
  'TROVÃO':{voice_a:'pm_santa',voice_b:'pm_alex',blend:.22,speed:1.08,pitch_semitones:-1.3},
  'FAÍSCA':{voice_a:'pf_dora',voice_b:'pf_dora',blend:0,speed:1.13,pitch_semitones:.4},
  'ATALAIA':{voice_a:'pm_alex',voice_b:'pm_santa',blend:.12,speed:1.03,pitch_semitones:.1},
  'CORUJA':{voice_a:'pm_alex',voice_b:'pm_santa',blend:.52,speed:1.01,pitch_semitones:-1.9},
  'BARQUEIRO':{voice_a:'pm_santa',voice_b:'pm_alex',blend:0,speed:.96,pitch_semitones:-2.3},
  'CORVO-1':{voice_a:'pm_alex',voice_b:'pm_santa',blend:.35,speed:1.13,pitch_semitones:1.25},
  'HOSTIL':{voice_a:'pm_santa',voice_b:'pm_alex',blend:.65,speed:1.16,pitch_semitones:.7},
  'ECO':{voice_a:'pm_alex',voice_b:'pm_santa',blend:.08,speed:1.09,pitch_semitones:-.65},
};
function spokenText(text){return text.replace(/\bNVG\b/g,'visão noturna').replace(/\bRPG\b/g,'erre pê gê').replace(/\bMG\b/g,'metralhadora').replace(/\bJ([123])\b/g,(_,n)=>'bloqueador '+n).replace(/\boverride\b/gi,'comando manual').replace(/\boverwatch\b/gi,'cobertura').replace(/\bflash\b/gi,'granada de luz').replace(/\bMartelo-([12])\b/g,'Martelo $1');}
async function wait(id){const start=Date.now();for(;;){const j=await(await fetch(comfy.HOST+'/history/'+id)).json();if(j[id]){if(j[id].status?.status_str==='error')throw Error(JSON.stringify(j[id].status.messages));if(j[id].status?.completed)return comfy.files(j[id].outputs);}if(Date.now()-start>120000)throw Error('TTS timeout '+id);await new Promise(r=>setTimeout(r,450));}}
async function main(){
  fs.mkdirSync(DIR,{recursive:true});const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):{};
  const entries={};const all=catalog();
  const manifest={version:1,language:'pt-BR',engine:'Kokoro-82M ONNX int8 / ComfyUI CPU',workflow:'tools/workflows/pdr-voices-api.json',cast,lines:entries};
  for(let i=0;i<all.length;i++){
    const line=all[i],profile=cast[line.speaker],dest=path.join(DIR,line.id+'.mp3');
    const old=previous.lines?.[key(line.speaker,line.text)];
    if(old&&fs.existsSync(dest)&&JSON.stringify(old.voice)===JSON.stringify(profile))entries[key(line.speaker,line.text)]={...old,sources:line.sources};
    else{
      const w=structuredClone(workflow);Object.assign(w['2'].inputs,profile,{text:spokenText(line.text)});w['3'].inputs.filename_prefix='pdr_voices/'+line.id;
      const id=await comfy.queue(w),outputs=await wait(id);const file=outputs.find(f=>f.filename.endsWith('.mp3'));if(!file)throw Error('No MP3 '+line.id);
      await comfy.download(file,dest);
      const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',dest],{encoding:'utf8'}));
      entries[key(line.speaker,line.text)]={...line,url:'assets/audio/voices/'+line.id+'.mp3',duration:Number(info.format.duration),bytes:fs.statSync(dest).size,voice:profile};
    }
    fs.writeFileSync(manifestFile+'.tmp',JSON.stringify(manifest,null,2)+'\n');fs.renameSync(manifestFile+'.tmp',manifestFile);
    console.log(`${i+1}/${all.length} ${line.speaker}: ${line.text.slice(0,65)}`);
  }
  console.log('VOICES_GENERATED '+all.length);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={cast,spokenText};
