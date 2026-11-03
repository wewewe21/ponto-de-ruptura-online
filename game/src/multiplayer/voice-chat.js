// Cada transmissão é unidirecional: ouvir não exige acesso ao microfone.
export class VoiceChat {
  constructor(multiplayer) {
    this.mp = multiplayer;
    this.peers = new Map();
    this.pendingIce = new Map();
    this.retryAfter = new Map();
    this.stream = null;
    this.generation = 0;
  }
  status(message) { const el = document.getElementById('voice-chat-status'); if (el) el.textContent = message; }
  send(to, kind, side, payload = {}) {
    const socket = this.mp.socket;
    if (this.mp.connected && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({t:'voice', to, kind, side, ...payload}));
  }
  async enable() {
    if (!this.mp.connected) { this.status('Entre em uma sala para ativar o microfone.'); return false; }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { this.status('Voz indisponível neste navegador ou conexão.'); return false; }
    const generation = ++this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if (generation !== this.generation || !this.mp.connected) { stream.getTracks().forEach(t=>t.stop()); return false; }
      this.stream = stream;
      stream.getAudioTracks().forEach(t => { t.onended = () => this.disable(); });
      this.status('Microfone ligado para todos na sala.');
      this.sync(this.mp.players);
      return true;
    } catch (e) { if (generation === this.generation) this.status('Não foi possível acessar o microfone. Confira a permissão do navegador.'); return false; }
  }
  disable() {
    ++this.generation;
    for (const [key] of this.peers) if (key.endsWith(':out')) { this.send(key.slice(0,-4),'stop','in'); this.closePeer(key); }
    if (this.stream) { const stream=this.stream; this.stream=null; stream.getTracks().forEach(t=>t.stop()); }
    const box=document.getElementById('set-voice-chat'); if(box) box.checked=false;
    this.status(this.mp.connected ? 'Microfone desligado. Você ainda pode ouvir a sala.' : 'Entre em uma sala para ativar o microfone.');
  }
  closePeer(key) {
    const p=this.peers.get(key); if (!p) return;
    this.peers.delete(key); this.pendingIce.delete(key);
    p.pc.onconnectionstatechange=null; p.pc.onicecandidate=null; p.pc.ontrack=null; p.pc.close();
    if (p.audio) { p.audio.pause(); p.audio.srcObject=null; p.audio.remove(); }
  }
  close() { this.disable(); for(const key of [...this.peers.keys()]) this.closePeer(key); this.pendingIce.clear(); }
  sync(players = []) {
    const ids = new Set(players.map(p=>p.id).filter(id=>id!==this.mp.id));
    for (const key of [...this.peers.keys()]) if(!ids.has(key.slice(0,key.lastIndexOf(':')))) this.closePeer(key);
    if (this.stream) for (const id of ids) if(!this.peers.has(`${id}:out`)) this.offer(id);
  }
  create(id, side) {
    const key=`${id}:${side}`, pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const peer={pc,audio:null}; this.peers.set(key,peer);
    pc.onicecandidate=e=>{if(e.candidate)this.send(id,'ice',side==='out'?'in':'out',{candidate:e.candidate.toJSON()});};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){if(side==='out')this.retryAfter.set(id,Date.now()+10000);this.closePeer(key);}};
    if(side==='in') pc.ontrack=e=>{
      if(!peer.audio){const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;document.body.appendChild(audio);peer.audio=audio;}
      peer.audio.srcObject=e.streams[0] || new MediaStream([e.track]);
      peer.audio.play().catch(()=>this.status('Clique no jogo para ouvir o áudio da sala.'));
    };
    return peer;
  }
  async offer(id) {
    const key=`${id}:out`; if(!this.stream || this.peers.has(key) || (this.retryAfter.get(id)||0)>Date.now())return;
    const peer=this.create(id,'out');
    try {
      this.stream.getAudioTracks().forEach(track=>peer.pc.addTrack(track,this.stream));
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      if(this.peers.get(key)===peer)this.send(id,'offer','in',{description:peer.pc.localDescription.toJSON()});
    } catch { this.retryAfter.set(id,Date.now()+10000); this.closePeer(key); }
  }
  async signal(msg) {
    if(!msg || typeof msg.from!=='string' || !['in','out'].includes(msg.side))return;
    const key=`${msg.from}:${msg.side}`;
    if(msg.kind==='stop'){this.closePeer(key);this.pendingIce.delete(key);return;}
    try {
      let peer=this.peers.get(key);
      if(msg.kind==='offer' && msg.side==='in') {
        if(peer)this.closePeer(key);
        peer=this.create(msg.from,'in');
        await peer.pc.setRemoteDescription(msg.description);
        for(const ice of this.pendingIce.get(key)||[])await peer.pc.addIceCandidate(ice);
        this.pendingIce.delete(key);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        if(this.peers.get(key)===peer)this.send(msg.from,'answer','out',{description:peer.pc.localDescription.toJSON()});
      } else if(msg.kind==='answer' && peer && msg.side==='out') {
        await peer.pc.setRemoteDescription(msg.description);
        for(const ice of this.pendingIce.get(key)||[])await peer.pc.addIceCandidate(ice);
        this.pendingIce.delete(key);
      } else if(msg.kind==='ice' && msg.candidate) {
        if(peer?.pc.remoteDescription)await peer.pc.addIceCandidate(msg.candidate);
        else { const list=this.pendingIce.get(key)||[]; if(list.length<50)list.push(msg.candidate); this.pendingIce.set(key,list); }
      }
    } catch { this.closePeer(key); }
  }
}
