# PONTO DE RUPTURA — Operação MURALHA

## Multiplayer online

No menu, escolha **MULTIPLAYER ONLINE**, informe seu nome e entre em uma sala ou crie a sua. O servidor coloca cada jogador no time com menos pessoas. Use **Copiar convite da sala** para chamar amigos.

- Deathmatch em equipes: até 12 jogadores, 50 abates ou 10 minutos por partida.
- 8 abates seguidos como soldado liberam o **Colosso MX-9**. Pressione **B** para pilotá-lo: visão própria, arma pesada e 900 de blindagem. Ao perder o robô, retorne como soldado e conquiste outra sequência.
- Clima compartilhado e sorteado por partida: 60% dia aberto, 25% dia nublado, 10% entardecer e 5% chuva leve.
- Movimento, colisões, tiros, vida, recarga, abates e recompensas são validados pelo servidor. **TAB** abre o placar; **ESC** libera o mouse. A partida online continua com o menu aberto.

Para desenvolvimento local, na pasta raiz: `npm install`, depois `npm start`. Abra `http://localhost:8080`. Node.js 22 ou superior. `npm test` executa os testes; `node game/test/live.cjs` verifica dois clientes reais e o ciclo do Colosso.

### Publicação no Render

O serviço Node serve o jogo e os WebSockets na mesma porta definida por `PORT`. Use `npm ci --omit=dev` no build e `npm start` na inicialização; saúde em `/health`. `render.yaml` registra o plano gratuito e região Virginia. Three.js é servido localmente, com a versão fixada no lockfile.

Salas e partidas ficam na memória. Reiniciar o serviço reinicia as salas. O plano gratuito do Render pode adormecer quando fica sem tráfego; a primeira conexão pode precisar aguardar o despertar.

Missão de campanha FPS militar: usina hidrelétrica tomada por paramilitares, noite de tempestade, três bloqueadores de sinal, suporte tático conquistado, reviravolta, defesa em ondas e extração.

| O quê | Onde |
|---|---|
| Documento de design completo (11 seções + roteiro) | [docs/GDD.md](docs/GDD.md) |
| Protótipo jogável (Three.js, sem build) | [game/](game/) |

## Como jogar

1. Dê dois cliques em `game/iniciar.bat` (usa Node.js e instala as dependências na primeira execução).
2. O navegador abre em `http://localhost:8080`.
3. **INICIAR MISSÃO** → briefing → **INICIAR** (o clique trava o mouse). `ESC` pausa.

Three.js e os assets são servidos pelo próprio jogo; as fontes têm reserva local caso a fonte online não esteja disponível. Fones de ouvido recomendados: todo o som é espacializado.

Para rodar manualmente:

```bash
cd game
node server.js
```

## Controles

| Ação | Tecla |
|---|---|
| Mover / correr | WASD / Shift |
| Pular / escalar | Espaço |
| Agachar (correndo = deslizar) / deitar | C ou Ctrl / Z |
| Inclinar | Q / E |
| Atirar / mirar | Mouse 1 / Mouse 2 |
| Recarregar | R |
| Primária / pistola / designador | 1 / 2 / 4 (ou roda) |
| Alternar suporte (com o designador) | R ou roda |
| Granada (segure para cozinhar) / tática / alternar tática | G / T / X |
| Faca / execução pelas costas | V |
| Interagir | F |
| Visão noturna / mapa | N / M |

## Estrutura do código

```
game/src/
  main.js            loop, estados, menus, capítulos, configurações
  core/              utilitários, entrada, áudio procedural
  world/             física (AABB + grade), nível, navegação (A*), clima, luzes, texturas
  actors/            jogador, armas, viewmodel, modelo de soldado
  ai/                inimigo (FSM), diretor de combate (esquadrões, cobertura, alarmes), aliados
  game/              missão (roteiro e checkpoints), suporte tático, HUD, efeitos
  render/post.js     pós-processamento: ACES, NVG, dano, supressão, luneta
```

Ajuste de balanceamento: `ETYPES` em `ai/enemy.js`, `WEAPONS` em `actors/weapons.js`, `DIFF` em `main.js`.

## Chefe: COLOSSO MX-9 (subestação)

Logo ao cruzar a cerca (passo "Subestação"), o robô gigante cai do céu numa cena cinematográfica (`ESPAÇO` pula). A subestação tem menos soldados (8 → 4; reforço 4 → 2) e o bloqueador J1 só pode ser desativado depois que o chefe cair.

| O quê | Onde |
|---|---|
| IA, ataques, cena, barra de vida | `game/src/ai/boss.js` |
| Carrega o FBX do Mixamo e **separa a cabeça** (pesos + pivô próprio) | `game/src/actors/bossmodel.js` |
| Retarget das animações do Kimodo + IK dos braços na arma | `game/src/actors/bossanim.js` |
| Modelos | `game/assets/models/` (`robot_rigged.fbx`, `boss_gun.glb`, `rifle.glb`) |
| Animações (Kimodo → 30 juntas SOMA @30 fps) | `game/assets/anims/boss_kimodo.json` |
| Regerar animações com o Kimodo | `node game/tools/kimodo_boss_anims.js` (servidor do Kimodo em `127.0.0.1:8094`) |

Ataques: rajadas do fuzil pesado, pisão (círculo vermelho no chão), golpe duplo com os punhos, salva de mísseis (3; 5 na fase 2) e fase 2 aos 50% de vida (rugido, mais rápido, mais mísseis, munição cai no chão). Blindagem: corpo ×0,55, pernas ×0,3, **cabeça ×0,6 sobre o multiplicador de headshot** — é o ponto fraco. Balanceamento: `CFG` no topo de `boss.js`. Para testar direto: menu **Capítulos → Subestação** ou `G.startMission('yard')` no console.

O rifle em primeira pessoa (SD-9 e KR-7) usa `game/assets/models/rifle.glb` via `game/src/actors/gunmodel.js`; se o arquivo não carregar, o modelo procedural antigo continua valendo.

## Pipeline de assets com IA (ComfyUI + Kimodo)

Tudo que é arte, som e modelo 3D do jogo é gerado localmente. Scripts em `game/tools/` (Node + Python do ComfyUI):

| Etapa | Modelo | Script | Saída |
|---|---|---|---|
| Sons e trilhas (178 clipes: tiros, impactos, passos, explosões, ambientes, 9 músicas) | **Stable Audio 3 Medium** | `gen_audio.js` (lista em `audio_list.js`) | `assets/audio/{sfx,loops,music}` + `manifest.json` |
| Arte do menu, capítulos, loading, emblemas, texturas PBR | **Krea 2 Turbo** | `gen_images.js` (lista em `image_list.js`) → `process_images.py` | `assets/ui/*.jpg`, `assets/tex/*_{c,n,r}.jpg` |
| Soldados, árvores, props, helicóptero, caminhonete (imagem → 3D) | **Trellis 2** | `gen_models.js` → `build_models.py` (`glb_optimize.py`) | `assets/models/{soldiers,env,veh}` |
| Animações (chefe e soldados) | **Kimodo** (texto → movimento) | `kimodo_boss_anims.js`, `kimodo_soldier_anims.js` | `assets/anims/*.json` |
| Tudo em sequência numa GPU | — | `pipeline.js` | — |

`tools/comfy.js` é o cliente da API do ComfyUI (usa os workflows de `Workflows api/`). O ComfyUI precisa estar rodando em `127.0.0.1:8188`.

No jogo: `core/samples.js` (banco de amostras, loops com crossfade, trilhas sob demanda) + `core/audio.js` (síntese procedural só como reserva); `world/pbr.js` (texturas PBR), `world/env3d.js` (modelos do cenário instanciados), `actors/meshsoldier.js` (rig automático + animação do Kimodo + IK na arma); `render/post.js` (bloom, SSAO, nitidez, gradação, foco ao mirar); `ui.css` (menus com arte). Se um arquivo gerado faltar, o jogo cai no equivalente procedural.
