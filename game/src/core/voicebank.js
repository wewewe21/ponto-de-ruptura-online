// Recorded pt-BR speech generated locally in ComfyUI; playback never needs a TTS service.
const normalize = text => String(text).normalize('NFC').replace(/\s+/g,' ').trim();
export const voiceKey = (speaker,text) => `${normalize(speaker)}|${normalize(text)}`;
export class VoiceBank {
  constructor(audio) { this.audio=audio;this.lines={};this.cache=new Map();this.active=new Map();this.serial=0;this.clock=()=>Date.now(); }
  async init() {
    if (!this.loading) this.loading=fetch('./assets/audio/voices/manifest.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('voice manifest');return r.json();}).then(m=>{this.lines=m.lines||{};return true;}).catch(e=>{console.warn('Vozes indisponíveis:',e.message);return false;});
    return this.loading;
  }
  entry(speaker,text) { return this.lines[voiceKey(speaker,text)]; }
  duration(speaker,text) { return this.entry(speaker,text)?.duration||0; }
  async buffer(entry) {
    if (!this.cache.has(entry.url)) {
      const pending=fetch('./'+entry.url).then(r=>{if(!r.ok)throw Error('voice '+r.status);return r.arrayBuffer();}).then(b=>this.audio.ctx.decodeAudioData(b)).catch(e=>{this.cache.delete(entry.url);throw e;});
      this.cache.set(entry.url,pending);
      // Keep decoded speech bounded during a full campaign, including hundreds of repeated barks.
      if(this.cache.size>36)this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(entry.url);
  }
  stop(channel) {
    for(const [key,play] of this.active)if(!channel||key===channel){play.cancelled=true;try{play.source?.stop();}catch{}play.cleanup?.();this.active.delete(key);}
  }
  play(speaker,text,{radio=true,pos=null,channel='dialogue',maxDelay=3000,onStart,onEnd}={}) {
    const A=this.audio;if(!A.tts||!A.ctx)return null;
    const entry=this.entry(speaker,text);if(!entry)return null;
    this.stop(channel);
    const request={serial:++this.serial,cancelled:false,requested:this.clock(),source:null};this.active.set(channel,request);
    this.buffer(entry).then(buffer=>{
      if(request.cancelled||!A.tts||this.active.get(channel)!==request||this.clock()-request.requested>maxDelay){if(this.active.get(channel)===request)this.active.delete(channel);return;}
      const C=A.ctx,src=C.createBufferSource();src.buffer=buffer;request.source=src;
      const gain=C.createGain();gain.gain.value=radio ? .82 : .95;
      const nodes=[gain];src.connect(gain);
      if(radio){
        const high=C.createBiquadFilter();high.type='highpass';high.frequency.value=380;
        const low=C.createBiquadFilter();low.type='lowpass';low.frequency.value=3300;
        const compressor=C.createDynamicsCompressor();compressor.threshold.value=-24;compressor.ratio.value=5;compressor.attack.value=.004;compressor.release.value=.1;
        gain.connect(high).connect(low).connect(compressor).connect(A.radioBus);nodes.push(high,low,compressor);
      }else if(pos){
        const pan=C.createPanner();pan.panningModel='equalpower';pan.distanceModel='inverse';pan.refDistance=3;pan.maxDistance=55;pan.rolloffFactor=1.15;
        if(pan.positionX){pan.positionX.value=pos.x;pan.positionY.value=pos.y+1.5;pan.positionZ.value=pos.z;}else pan.setPosition(pos.x,pos.y+1.5,pos.z);
        gain.connect(pan).connect(A.master);nodes.push(pan);
      }else gain.connect(A.master);
      request.cleanup=()=>{for(const n of nodes)try{n.disconnect();}catch{}try{src.disconnect();}catch{}};
      src.onended=()=>{request.cleanup();if(this.active.get(channel)===request)this.active.delete(channel);if(!request.cancelled)onEnd?.();};
      src.start();onStart?.(buffer.duration);
    }).catch(e=>{if(this.active.get(channel)===request)this.active.delete(channel);if(!request.cancelled)onEnd?.();console.warn('Falha ao tocar voz:',e.message);});
    return {duration:entry.duration,stop:()=>{if(this.active.get(channel)===request)this.stop(channel);}};
  }
}
