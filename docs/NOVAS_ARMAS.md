# Armas, braços em primeira pessoa e poses

## O que há agora

| Slot | Arma | Modelo |
|---|---|---|
| 1 (aperte **1** de novo para trocar) | SD-9, MK-5 (submetralhadora), KR-7, VK-12 (DMR) | `assets/models/rifle.glb`, `weapons/smg.glb`, `weapons/scifi.glb` |
| 2 | Glock brasileira (mira de ferro; id interno P19) | `weapons/glock.glb` |
| 4 | Sniper brasileira (luneta, ferrolho; id interno AX50) | `weapons/sniper_br.glb` |
| 3 | Faca (clique = corte e estocada; **V** = golpe rápido/execução) | `weapons/knife.glb` |

A escopeta BRK-8, o lança-foguetes RPL-2 e o designador a laser foram **removidos** por não terem modelo 3D (os inimigos com escudo e o alojamento agora entregam a MK-5; o lança-foguetes da sala de controle saiu). Para devolvê-los, crie o modelo, uma estação nova no Blender (abaixo) e a definição em `weapons.js`.

Os modelos antigos da sniper e da pistola estão guardados em `Assets/antigas/`. Para trocar o modelo de uma arma no arquivo de poses **sem perder as mãos já posicionadas**, use `blender --background Assets/poses/poses_armas.blend --python game/tools/blender/update_weapon_models.py -- ID` (lê a tabela `GUNS` de `build_pose_scene.py`; faça backup antes).

Se você mover, girar ou redimensionar o `Modelo_XX` dentro do `ARMA_XX` no Blender, essa posição também é exportada (`model` em `fps_poses.json`) e o jogo aplica igual: a arma fica no jogo exatamente onde está no Blender, junto com a mão e os dedos.

## Braços em primeira pessoa

- Vêm do `FPS Arms.fbx` (51 ossos, com dedos) → `assets/models/fps_arms.glb` (gerado por `tools/blender/export_arms_glb.py`).
- **Só quem joga vê esses braços.** Os outros jogadores veem o modelo 3D do soldado (`actors/meshsoldier.js`), que não foi alterado.
- A pose de cada arma (posição da arma na tela, mão, dedos, cotovelo) foi feita à mão no Blender e está em `assets/poses/fps_poses.json` (gerado de `Assets/poses/poses_armas.blend`). O código está em `actors/fpsarms.js`: cada osso recebe a transformação da pose; quando a arma se mexe (balanço, mirar, correr, recarregar) a mão e os dedos acompanham a arma e o braço/antebraço são resolvidos por IK entre o ombro (fixo) e o pulso, preservando a pose.
- A posição da arma na tela (`HIP`), os tamanhos reais (`len` em `weaponmodels.js`: fuzil 0,95 m, submetralhadora 0,90 m, pistola 0,36 m, DMR 1,05 m, sniper 1,15 m, faca 0,28 m) e a mira holográfica vermelha seguem como antes.

## Como refazer ou ajustar uma pose

1. Abra `Assets/poses/poses_armas.blend` (Blender 4.4+; há um texto "LEIA-ME" dentro). Cada estação é uma arma, vista pela câmera do jogo. Mova os controles `ik_target` (pulso), `pole` (cotovelo) e gire os dedos. Salve (Ctrl+S).
2. Exporte e converta:
   ```
   blender --background Assets/poses/poses_armas.blend --python game/tools/blender/export_poses.py -- game/tools/blender/data/poses_user.json
   node game/tools/blender/build_game_poses.cjs game/tools/blender/data/poses_user.json game/assets/poses/fps_poses.json
   ```
3. Recarregue o jogo. (O backup do arquivo com as poses atuais está em `Assets/poses/backup/`; o JSON exportado fica em `tools/blender/data/poses_user.json`.)

## Como acrescentar uma arma nova

1. Gere o GLB (Trellis), reduza a malha (`game/tools/decimate_glb.mjs`) e otimize (`python game/tools/glb_optimize.py entrada.glb game/assets/models/weapons/nome.glb 1536 88`). Meta: ~20 mil triângulos e ~1,3 MB.
2. Anote no modelo normalizado (comprimento 1 em X, base em y = 0): linha do cano (`origin`), boca (`muzzle`), onde fica a mira (`holo`); `flip: true` se a boca estiver em +X. Acrescente a ficha em `GUN_SPECS` (`weaponmodels.js`) e a definição em `WEAPONS` e `ARSENAL` (`weapons.js`).
3. No Blender, acrescente uma estação em `game/tools/blender/build_pose_scene.py` (`GUNS` e `HIP`), gere a cena, posicione as mãos e exporte como acima (inclua o id na lista `WEAPONS` de `build_game_poses.cjs`).

**Multiplayer:** as mesmas armas existem no deathmatch (teclas 1–4, 1 repetido troca a primária). O servidor decide dano, cadência, alcance, munição e recarga de cada arma (`shared/rules.json`, bloco `weapons`); munição e tempo entre tiros são guardados por arma, e a troca leva 0,45 s.
