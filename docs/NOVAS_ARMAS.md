# Armas, mãos e mira holográfica

## O que há agora

| Slot | Arma | Modelo |
|---|---|---|
| 1 (aperte **1** de novo para trocar) | SD-9, **MK-5** (submetralhadora silenciada), KR-7, VK-12 (DMR), **AX-50** (sniper com ferrolho e luneta), BRK-8 | `assets/models/rifle.glb`, `weapons/smg.glb`, `weapons/scifi.glb`, `weapons/sniper.glb` |
| 2 | P-19 (pistola) | `weapons/pistol.glb` |
| 3 | **Faca tática** (clique = corte e estocada alternados; **V** continua sendo golpe rápido/execução) | `weapons/knife.glb` |
| 4 | Designador a laser | procedural |

- **Mãos**: as mãos são as luvas 3D do soldado aliado (`actors/fparms.js`). O rig do soldado não tem dedos, então a mão ganhou dois ossos extras de "dedos" (pesos pela posição ao longo da mão) que fecham em volta da empunhadura. Cada arma define a curvatura (`rightCurl`/`leftCurl`) e o tamanho da mão (`handScale`).
- **Mira holográfica vermelha**: `makeHoloSight()` em `actors/weaponmodels.js` (moldura fina, vidro quase transparente, retículo vermelho). Ao mirar (botão direito) o retículo fica exatamente no centro da tela; a cruz da interface some. O SD-9/KR-7 usam a janela da mira do próprio modelo com o retículo desenhado dentro.
- **Posição na tela**: tabela `HIP` em `actors/viewmodel.js` (x, y, z por arma) e `ADS_DIST` (distância da câmera ao mirar).
- **Colosso (primeira pessoa)**: `ROBOT_LAYOUT` em `multiplayer/robot-view.js` (escala do corpo/arma e posição da arma). Os antebraços são cortados por um plano limpo e as duas mãos agarram a arma.

## Como acrescentar uma arma nova

1. Gere o GLB (Trellis) e reduza a malha. Modelos do Tripo vêm com ~600 mil vértices; use `game/tools/decimate_glb.mjs` (preserva UV) e depois `python game/tools/glb_optimize.py entrada.glb game/assets/models/weapons/nome.glb 1536 88`. Meta: ~20 mil triângulos e ~1,3 MB.
2. Confira o modelo: `http://localhost:8080/modelview.html?m=./assets/models/weapons/nome.glb`. Anote, no sistema de coordenadas normalizado (comprimento 1 no eixo X, base em y = 0), os pontos: linha do cano (`origin`), boca do cano (`muzzle`), empunhadura (`right`), mão de apoio (`left`) e onde fica a mira (`holo`). `flip: true` se a boca do cano estiver em +X.
3. Acrescente uma ficha em `GUN_SPECS` (`weaponmodels.js`) e uma definição em `WEAPONS` (`weapons.js`: dano, cadência, recuo, `sound` reaproveitando um som existente). Coloque o id em `ARSENAL` (`weapons.js`) para entrar na troca com a tecla 1 e uma posição em `HIP` (`viewmodel.js`).
4. Ajuste `len` (comprimento em metros), `handScale`, `rightWrist`/`leftWrist` e `HIP` olhando a arma no jogo.

Observação: o deathmatch online ainda usa só a SD-9 (as estatísticas da arma são definidas no servidor em `shared/rules.json`); as armas novas valem na campanha.
