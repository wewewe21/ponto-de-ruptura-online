// As medalhas de abates rápidos usam uma janela curta independente da sequência de vidas.
export class Medals {
  constructor(audio, now = () => performance.now()) { this.audio = audio; this.now = now; this.count = 0; this.last = -Infinity; this.timer = 0; }
  reset() { this.count = 0; this.last = -Infinity; clearTimeout(this.timer); const el = document.getElementById('kill-medal'); if (el) el.hidden = true; }
  kill(count) {
    const now = this.now(); this.count = count || (now - this.last <= 5000 ? this.count + 1 : 1); this.last = now;
    const title = ['','ABATE','DOUBLE KILL','TRIPLE KILL','QUADRUPLE KILL'][this.count] || 'MULTIPLE KILL';
    this.show(title, this.count, false);
  }
  nuke() { this.show('NUKE', 1, true); }
  show(title, count, nuke) {
    const el = document.getElementById('kill-medal'); if (!el) return;
    el.classList.toggle('nuke', nuke); el.hidden = false;
    el.querySelector('strong').textContent = title;
    el.querySelector('small').textContent = nuke ? 'RECOMPENSA CONQUISTADA' : 'ELIMINAÇÃO';
    el.querySelector('.medal-icons').innerHTML = nuke ? '<i>☢</i>' : '<i>✦</i>'.repeat(Math.min(count, 5));
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    this.audio?.medal?.(count, nuke);
    clearTimeout(this.timer); this.timer = setTimeout(() => { el.hidden = true; }, nuke ? 4800 : 2400);
  }
}
