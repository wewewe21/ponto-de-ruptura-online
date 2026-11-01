# Passe "premium" — o que mudou, onde mexer e como regerar

Tudo abaixo foi gerado **localmente** com o seu ComfyUI (Krea 2 Turbo, Trellis 2, Stable Audio 3) e o Kimodo. Rode o jogo com `game/iniciar.bat` (http://localhost:8080).

## O que entrou

| Área | Antes | Agora |
|---|---|---|
| **Menus** | Texto sobre fundo preto/3D | Arte de capa fotográfica com movimento lento (Ken Burns) e fusão entre duas imagens, logotipo metálico, botões animados, briefing com mesa de operações, **capítulos com miniatura**, pausa/morte/vitória/carregamento com imagem própria e dicas |
| **Música** | Síntese procedural | 9 trilhas do Stable Audio 3 que trocam por estado (menu, furtivo, tensão, combate, **chefe**, defesa, extração, vitória, derrota) com crossfade e histerese |
| **Efeitos sonoros** | Síntese procedural | 178 clipes: tiros por arma (variações), manuseio, impactos por material, passos por superfície, explosões, trovões, chefe, rádio, interface, ambientes em loop (chuva, vento, vertedouro, turbina…) |
| **Soldados** | Caixas | 7 modelos em malha 3D (fuzileiros, pesado, escudo, atirador, 2 aliados) com **rig automático**, animações do Kimodo (andar, correr, agachar, morrer ×3, reação a tiro, abate silencioso…) e arma na mão por IK |
| **Primeira pessoa** | Braços de caixa | Mangas em malha (do soldado aliado) + luvas com dedos, IK nas empunhaduras |
| **Cenário** | Cones/dodecaedros/caixas | Pinheiros/abetos/árvores mortas instanciados, pedras, barris, caixas, **helicóptero** (rotor girando) e **caminhonete com metralhadora**; texturas PBR (concreto, asfalto, metal, madeira, terreno, rocha, contêiner, sacos de areia) |
| **Gráficos** | ACES simples | Bloom em pirâmide, SSAO, nitidez adaptativa, gradação (sombras frias/altas-luzes quentes), foco periférico ao mirar, camada de nuvens fotográfica no céu, ambiente mais legível |
| **Chefe** | FBX 27 MB | GLB de 8 MB (mesma cabeça separada) |

Opção **Configurações → Qualidade gráfica** (Alta/Média/Baixa) liga/desliga SSAO e bloom.

## Onde ajustar

- Volumes das amostras: `game/src/core/audio.js` (cada método `shot`, `impact`, `footstep`… tem o ganho ao lado do nome da amostra); música: `norm`/RMS em `core/samples.js`.
- Gatilhos de música: `musicMode()` em `game/src/main.js`.
- Visual: `render/post.js` (bloom `uBloom`/limiar, SSAO `uInt`/`uRadius`, nitidez `uSharp`, gradação), ambiente em `main.js` (`G.lightBase`, névoa, exposição).
- Soldados: `actors/meshsoldier.js` (`CFG` altura/arma por estilo, juntas estimadas em `fitJoints`, pesos em `skinGeometry`), braços em primeira pessoa em `actors/fparms.js`.
- Cenário 3D: `world/env3d.js` (alturas-alvo em `SPEC`), colocação em `world/level.js` (`envAdd`, `decor(...)`).

## Como regerar / acrescentar

1. Suba o ComfyUI em `127.0.0.1:8188` (mesmos launchers de sempre).
2. `node game/tools/gen_audio.js` — sons e trilhas (edite `audio_list.js`; é retomável e só gera o que falta).
3. `node game/tools/gen_images.js` + `python game/tools/process_images.py` — arte, miniaturas e texturas (`image_list.js`).
4. `node game/tools/gen_models.js` + `python game/tools/build_models.py` — modelos 3D (imagem de referência → GLB otimizado). Use o Python do ComfyUI (tem PIL/numpy/trimesh).
5. `node game/tools/kimodo_soldier_anims.js` — animações (suba antes o servidor do Kimodo: `go run ./demo -addr 127.0.0.1:8094`).
6. `node game/tools/check_assets.js` confere se todo arquivo referenciado existe.

Dica de desempenho do Trellis: feche OBS/CapCut/navegadores com aceleração enquanto gera — o ComfyUI usa os 16 GB da placa inteira e qualquer outro programa na GPU deixa cada modelo 10–20× mais lento (ou derruba por falta de memória).

## Limitações conhecidas

- **Arbusto, transformadores, geradores, holofotes, barreiras, caixas de munição, tenda e caminhão de carga**: o código já usa os modelos se o arquivo existir em `assets/models/env|veh`; os que não foram gerados (ver `tools/_gen/models`) continuam com o visual procedural. Rode `gen_models.js` para completar.
- Mãos dos soldados e luvas em primeira pessoa são simples (sem dedos individuais no rig).
- Não foi possível ouvir o áudio nem jogar com mouse travado neste ambiente: a mixagem foi calibrada por medição (picos/RMS) e deve ser refinada de ouvido.
- O artifact do claude.ai não inclui o FBX original do chefe (o GLB de 8 MB o substitui).
