// Texturas procedurais em canvas: concreto molhado, metal, faixas de segurança, madeira,
// sacos de areia, placas, painéis, pichação. Nenhum arquivo externo.
import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';

const rng = mulberry32(1337);
const R = (a = 0, b = 1) => a + rng() * (b - a);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function noise(g, w, h, amount, alpha = 0.08, dark = true) {
  for (let i = 0; i < amount; i++) {
    const v = dark ? Math.floor(R(0, 60)) : Math.floor(R(150, 255));
    g.fillStyle = `rgba(${v},${v},${v},${R(0, alpha)})`;
    const s = R(1, 3);
    g.fillRect(R(0, w), R(0, h), s, s);
  }
}
function blotches(g, w, h, n, color, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(0, h), r = R(rmin, rmax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', alpha));
    gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function streaks(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(-h * 0.2, h * 0.6), len = R(h * 0.2, h * 0.9), wd = R(1, 5);
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(10,12,14,${alpha})`);
    gr.addColorStop(1, 'rgba(10,12,14,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, wd, len);
  }
}

export function makeTextures() {
  const T = {};

  // concreto da barragem (painéis de forma 2x2 m por textura de 4 m)
  {
    const [c, g] = canvas(512);
    g.fillStyle = '#6a6d70'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, 60, 'rgba(40,44,48,A)', 20, 90, 0.25);
    blotches(g, 512, 512, 30, 'rgba(140,140,135,A)', 20, 70, 0.12);
    noise(g, 512, 512, 9000, 0.12);
    noise(g, 512, 512, 3000, 0.06, false);
    streaks(g, 512, 512, 70, 0.35);
    g.strokeStyle = 'rgba(25,28,30,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke();
      g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.stroke();
    }
    g.fillStyle = 'rgba(20,22,24,0.6)';
    for (let x = 32; x < 512; x += 64) for (let y = 32; y < 512; y += 128) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
    // musgo nas juntas inferiores
    g.fillStyle = 'rgba(40,60,35,0.25)';
    for (let i = 0; i < 40; i++) g.fillRect(R(0, 512), 250 + R(-4, 6), R(10, 60), R(2, 6));
    T.concrete = tex(c);
  }
  // concreto escuro / molhado de piso
  {
    const [c, g] = canvas(512);
    g.fillStyle = '#4a4d50'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, 80, 'rgba(25,28,30,A)', 20, 100, 0.35);
    noise(g, 512, 512, 12000, 0.15);
    g.strokeStyle = 'rgba(20,22,24,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
    T.floor = tex(c);
  }
  // asfalto com faixa
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#26282b'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 6000, 0.25);
    noise(g, 256, 256, 1500, 0.08, false);
    blotches(g, 256, 256, 15, 'rgba(10,10,12,A)', 10, 40, 0.4);
    T.asphalt = tex(c);
  }
  // metal pintado
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#3d454c'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 4000, 0.1);
    g.strokeStyle = 'rgba(15,18,20,0.7)'; g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 126); g.strokeRect(1, 128, 254, 126);
    g.fillStyle = 'rgba(20,22,24,0.8)';
    for (let x = 8; x < 256; x += 30) { g.fillRect(x, 6, 3, 3); g.fillRect(x, 120, 3, 3); g.fillRect(x, 134, 3, 3); g.fillRect(x, 248, 3, 3); }
    blotches(g, 256, 256, 12, 'rgba(110,60,30,A)', 4, 20, 0.35);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(160,170,175,${R(0.05, 0.2)})`; g.lineWidth = 1; g.beginPath(); const x = R(0, 256), y = R(0, 256); g.moveTo(x, y); g.lineTo(x + R(-20, 20), y + R(-5, 5)); g.stroke(); }
    T.metal = tex(c);
  }
  // metal enferrujado / corrugado (contêiner)
  T.container = {};
  for (const [name, col] of [['red', '#6e2a22'], ['blue', '#25405e'], ['green', '#34452e'], ['grey', '#55595c']]) {
    const [c, g] = canvas(256);
    g.fillStyle = col; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.fillRect(x, 0, 16, 256);
    }
    blotches(g, 256, 256, 25, 'rgba(90,50,25,A)', 5, 30, 0.45);
    noise(g, 256, 256, 3000, 0.15);
    streaks(g, 256, 256, 30, 0.3);
    T.container[name] = tex(c);
  }
  // faixas de segurança
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#d9a40d'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#141414';
    for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 + 256, 256); g.lineTo(i + 256, 256); g.fill(); }
    noise(g, 256, 256, 5000, 0.25);
    blotches(g, 256, 256, 20, 'rgba(30,30,30,A)', 5, 25, 0.5);
    T.hazard = tex(c);
  }
  // madeira (caixote / compensado)
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#6b5236'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = `rgba(${R(70, 110)},${R(50, 75)},${R(30, 45)},0.6)`; g.fillRect(0, y, 256, 30);
      g.fillStyle = 'rgba(20,14,8,0.7)'; g.fillRect(0, y + 30, 256, 2);
      for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(40,28,15,${R(0.1, 0.35)})`; g.beginPath(); const yy = y + R(2, 28); g.moveTo(0, yy); g.bezierCurveTo(80, yy + R(-3, 3), 160, yy + R(-3, 3), 256, yy + R(-2, 2)); g.stroke(); }
    }
    g.strokeStyle = 'rgba(30,20,10,0.8)'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
    g.lineWidth = 8; g.beginPath(); g.moveTo(10, 10); g.lineTo(246, 246); g.stroke();
    g.fillStyle = 'rgba(15,15,15,0.75)'; g.font = 'bold 22px monospace'; g.fillText('AFG-07', 150, 60);
    noise(g, 256, 256, 2000, 0.15);
    T.wood = tex(c);
  }
  // compensado de barricada
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#7d6648'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(60,42,25,${R(0.05, 0.25)})`; g.beginPath(); const y = R(0, 256); g.moveTo(0, y); g.bezierCurveTo(90, y + R(-8, 8), 170, y + R(-8, 8), 256, y + R(-4, 4)); g.stroke(); }
    streaks(g, 256, 256, 30, 0.35);
    g.fillStyle = 'rgba(150,20,15,0.85)'; g.font = 'bold 40px sans-serif'; g.save(); g.translate(40, 150); g.rotate(-0.1); g.fillText('O VALE', 0, 0); g.fillText('LEMBRA', 10, 44); g.restore();
    T.plywood = tex(c);
  }
  // sacos de areia
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#6d6248'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
      const x = col * 80 + (row % 2) * 40, y = row * 64;
      const gr = g.createRadialGradient(x + 40, y + 28, 5, x + 40, y + 32, 50);
      gr.addColorStop(0, '#8c7f5d'); gr.addColorStop(0.8, '#5e5440'); gr.addColorStop(1, '#3a3428');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + 40, y + 32, 40, 30, 0, 0, 7); g.fill();
    }
    noise(g, 256, 256, 5000, 0.2);
    T.sandbag = tex(c);
  }
  // rocha
  {
    const [c, g] = canvas(512);
    g.fillStyle = '#4c4d4b'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, 90, 'rgba(30,30,28,A)', 15, 70, 0.4);
    blotches(g, 512, 512, 60, 'rgba(110,108,100,A)', 10, 50, 0.2);
    noise(g, 512, 512, 15000, 0.2);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(15,15,15,${R(0.2, 0.5)})`; g.lineWidth = R(1, 3); g.beginPath(); let x = R(0, 512), y = R(0, 512); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += R(-30, 30); y += R(5, 30); g.lineTo(x, y); } g.stroke(); }
    T.rock = tex(c);
  }
  // terreno (lama/grama achatada)
  {
    const [c, g] = canvas(512);
    g.fillStyle = '#2e3324'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, 120, 'rgba(45,38,28,A)', 10, 60, 0.5);
    blotches(g, 512, 512, 80, 'rgba(50,62,38,A)', 10, 50, 0.4);
    for (let i = 0; i < 4000; i++) { g.strokeStyle = `rgba(${R(50, 80)},${R(65, 90)},${R(35, 50)},${R(0.2, 0.5)})`; g.beginPath(); const x = R(0, 512), y = R(0, 512); g.moveTo(x, y); g.lineTo(x + R(-6, 6), y + R(-2, 2)); g.stroke(); }
    noise(g, 512, 512, 8000, 0.2);
    T.ground = tex(c);
  }
  // grade de passarela (alpha)
  {
    const [c, g] = canvas(128);
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#5a6066';
    for (let i = 0; i < 128; i += 16) { g.fillRect(i, 0, 4, 128); g.fillRect(0, i, 128, 3); }
    T.grate = tex(c, true);
  }
  // alambrado
  {
    const [c, g] = canvas(128);
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(150,155,160,0.95)'; g.lineWidth = 2;
    for (let i = -128; i < 256; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
    }
    T.fence = tex(c, true);
  }
  // painel de controle (cor + emissivo)
  {
    const [c, g] = canvas(256);
    const [ce, ge] = canvas(256);
    g.fillStyle = '#2b3036'; g.fillRect(0, 0, 256, 256);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 2000, 0.15);
    for (let i = 0; i < 4; i++) {
      const x = 12 + i * 60;
      g.fillStyle = '#0d1418'; g.fillRect(x, 20, 50, 40);
      ge.fillStyle = ['#16a3a3', '#2f8a3b', '#c88a1a', '#16a3a3'][i];
      ge.globalAlpha = 0.6; ge.fillRect(x + 2, 22, 46, 36); ge.globalAlpha = 1;
      ge.fillStyle = '#9ff'; for (let k = 0; k < 5; k++) ge.fillRect(x + 5, 26 + k * 6, R(10, 40), 2);
    }
    for (let i = 0; i < 40; i++) {
      const x = 14 + (i % 10) * 23, y = 90 + Math.floor(i / 10) * 30;
      g.fillStyle = '#111'; g.beginPath(); g.arc(x + 6, y + 6, 7, 0, 7); g.fill();
      const col = ['#e33', '#3e3', '#ec3', '#39f'][Math.floor(R(0, 4))];
      if (R() > 0.4) { ge.fillStyle = col; ge.beginPath(); ge.arc(x + 6, y + 6, 4, 0, 7); ge.fill(); }
      g.fillStyle = col; g.beginPath(); g.arc(x + 6, y + 6, 4, 0, 7); g.fill();
    }
    g.fillStyle = '#d9a40d'; g.fillRect(0, 230, 256, 6);
    g.fillStyle = '#ccc'; g.font = '12px monospace'; g.fillText('COMPORTAS  CG-01..05', 12, 220);
    T.panel = tex(c, false); T.panelE = tex(ce, false);
  }
  // janela iluminada / apagada
  {
    const [c, g] = canvas(128);
    g.fillStyle = '#1c2228'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#0a0d10'; g.fillRect(10, 10, 108, 108);
    g.fillStyle = 'rgba(150,170,180,0.15)'; g.fillRect(10, 10, 52, 108); g.fillRect(66, 10, 52, 108);
    g.fillStyle = '#1c2228'; g.fillRect(62, 10, 4, 108);
    T.window = tex(c);
  }
  // jammer: caixa com LEDs e adesivos
  {
    const [c, g] = canvas(256);
    g.fillStyle = '#2d332b'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 3000, 0.2);
    g.fillStyle = '#111'; g.fillRect(20, 20, 216, 90);
    g.fillStyle = '#c33'; for (let i = 0; i < 8; i++) g.fillRect(30 + i * 25, 40, 12, 12);
    g.fillStyle = '#ddd'; g.font = 'bold 18px monospace'; g.fillText('RX-BLOCK 9', 30, 95);
    g.fillStyle = '#d9a40d'; g.fillRect(20, 130, 216, 30);
    g.fillStyle = '#111'; g.font = 'bold 16px sans-serif'; g.fillText('PERIGO  RF  ALTA POTÊNCIA', 26, 151);
    T.jammer = tex(c, false);
  }

  // placas com texto
  T.sign = (text, sub = '', bg = '#e2e2dc', fg = '#111', stripe = '#c22') => {
    const [c, g] = canvas(512, 256);
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = stripe; g.fillRect(0, 0, 512, 40); g.fillRect(0, 216, 512, 40);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 64px "Barlow Condensed", Arial Narrow, sans-serif';
    g.fillText(text, 256, 140);
    g.font = 'bold 30px "Barlow Condensed", Arial Narrow, sans-serif';
    g.fillText(sub, 256, 192);
    noise(g, 512, 256, 3000, 0.12);
    streaks(g, 512, 256, 20, 0.25);
    return tex(c, false);
  };
  // pichação com símbolo dos Afogados (mão saindo da água)
  {
    const [c, g] = canvas(512, 256);
    g.clearRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(190,25,20,0.92)'; g.fillStyle = 'rgba(190,25,20,0.92)'; g.lineWidth = 9; g.lineCap = 'round';
    // ondas
    for (let k = 0; k < 2; k++) { g.beginPath(); for (let x = 30; x < 200; x += 5) g.lineTo(x, 200 + k * 24 + Math.sin(x * 0.08) * 8); g.stroke(); }
    // mão
    g.beginPath(); g.moveTo(90, 195); g.lineTo(95, 110); g.lineTo(140, 110); g.lineTo(145, 195); g.stroke();
    for (let f = 0; f < 4; f++) { g.beginPath(); g.moveTo(98 + f * 13, 112); g.lineTo(96 + f * 13, 50 + Math.abs(f - 1.5) * 12); g.stroke(); }
    g.beginPath(); g.moveTo(140, 140); g.lineTo(168, 105); g.stroke();
    g.font = 'bold 56px "Barlow Condensed", Arial Narrow, sans-serif';
    g.save(); g.translate(220, 120); g.rotate(-0.05); g.fillText('O VALE', 0, 0); g.fillText('LEMBRA', 14, 60); g.restore();
    T.graffiti = tex(c, false);
  }
  // marcação do heliponto
  {
    const [c, g] = canvas(512);
    g.fillStyle = '#2a2d30'; g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 8000, 0.2);
    g.strokeStyle = '#d8d8d0'; g.lineWidth = 18; g.beginPath(); g.arc(256, 256, 200, 0, 7); g.stroke();
    g.fillStyle = '#d8d8d0'; g.fillRect(170, 140, 40, 232); g.fillRect(302, 140, 40, 232); g.fillRect(170, 236, 172, 40);
    blotches(g, 512, 512, 30, 'rgba(20,20,20,A)', 10, 50, 0.4);
    T.helipad = tex(c, false);
  }

  // texturas utilitárias de partículas
  {
    const [c, g] = canvas(64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    T.soft = tex(c, false, false);
  }
  {
    const [c, g] = canvas(128);
    for (let i = 0; i < 26; i++) {
      const x = 64 + R(-26, 26), y = 64 + R(-26, 26), r = R(12, 34);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    T.smoke = tex(c, false, false);
  }
  {
    const [c, g] = canvas(128);
    g.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      g.rotate(Math.PI * 2 / 7 + R(-0.2, 0.2));
      const gr = g.createLinearGradient(0, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(R(40, 62), 0); g.lineTo(0, 7); g.fill();
    }
    const gr2 = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr2.addColorStop(0, 'rgba(255,255,230,1)'); gr2.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = gr2; g.fillRect(-32, -32, 64, 64);
    T.flash = tex(c, false, false);
  }
  {
    // água: normal map de ondulação
    const [c, g] = canvas(256);
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const nx = Math.sin(x * 0.15 + Math.sin(y * 0.07) * 2) * 0.5 + Math.sin((x + y) * 0.31) * 0.25 + (rng() - 0.5) * 0.3;
      const ny = Math.cos(y * 0.13 + Math.sin(x * 0.09) * 2) * 0.5 + Math.cos((x - y) * 0.27) * 0.25 + (rng() - 0.5) * 0.3;
      img.data[i] = 128 + nx * 60; img.data[i + 1] = 128 + ny * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    T.waterN = tex(c, true, false);
  }
  {
    // espuma do vertedouro
    const [c, g] = canvas(256);
    g.fillStyle = 'rgba(200,215,220,0.35)'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(240,248,255,${R(0.2, 0.7)})`;
      g.fillRect(R(0, 256), R(0, 256), R(2, 8), R(20, 90));
    }
    T.foam = tex(c, true);
  }
  return T;
}
