// Recorte circular da luneta: o aro vermelho da AX-50 é cortado a uma faixa fina em volta da lente (em alturas de tela),
// e a cena fora dele é desfocada na composição. `r` = 0 desliga o recorte (qualquer outra arma/estado).
import * as THREE from 'three';

export const SCOPE_RING = 0.05;   // espessura do aro visível, em alturas de tela
export const SCOPE_CLIP = { r: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } };

// descarta os fragmentos do material fora do círculo de raio r (centro da tela)
export function clipToScope(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uClipR = SCOPE_CLIP.r; sh.uniforms.uClipRes = SCOPE_CLIP.res;
    sh.fragmentShader = 'uniform float uClipR; uniform vec2 uClipRes;\n' + sh.fragmentShader.replace('void main() {',
      'void main() {\n  if (uClipR > 0.0 && length((gl_FragCoord.xy - 0.5 * uClipRes) / uClipRes.y) > uClipR) discard;');
  };
  material.customProgramCacheKey = () => 'scopeclip';
  return material;
}
