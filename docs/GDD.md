# PONTO DE RUPTURA — Operação MURALHA
### Game Design Document · Missão de campanha FPS · v1.0

> Documento de produção. Tudo aqui foi pensado para ser implementado; os números são pontos de partida de balanceamento, já usados no protótipo jogável em `game/`.

---

## 0. Ficha técnica

| Item | Definição |
|---|---|
| Título de trabalho | **PONTO DE RUPTURA** |
| Missão | **Operação MURALHA** (missão 1 de campanha, autocontida) |
| Gênero | FPS militar de campanha, linear com hubs abertos (estilo "corredor largo") |
| Duração alvo | 25–40 min na primeira jogada (protótipo: 15–25 min) |
| Plataforma alvo | PC / consoles atuais. Protótipo: navegador (WebGL2) |
| Engine de produção recomendada | Unreal Engine 5 (Lumen, Nanite, Niagara, MetaSounds, StateTree/Behavior Tree + EQS) |
| Protótipo entregue | Three.js r170, código em `game/src`, roda com `iniciar.bat` |
| Classificação pretendida | 16+ (violência realista, sem gore exagerado) |

---

## 1. CONCEITO GERAL

### 1.1 Resumo
Noite de tempestade no vale do rio Sarn. Um grupo paramilitar chamado **Os Afogados** tomou a **Usina Hidrelétrica de Pedra Funda**, uma barragem de concreto de 70 m de altura que segura um reservatório gigante acima de quatro cidades. O líder, **Ilya Varga, o "Barqueiro"**, ameaça abrir as comportas.

O jogador é **ECO**, operador da **Equipe MARTELO**. Na inserção, o segundo helicóptero (Martelo-2) é abatido e o esquadrão fica sozinho. Três **bloqueadores de sinal (jammers)** deixam o comando cego. Cada jammer desativado devolve um pedaço do apoio tático. No terceiro, uma armadilha: o jammer era um gatilho e as comportas começam a abrir. A missão vira uma corrida até a sala de controle, uma defesa em ondas sob tempestade máxima e uma extração de helicóptero.

### 1.2 Proposta (pilares)
1. **Tiro com peso.** Cada arma tem papel claro, recuo aprendível e resposta audiovisual imediata.
2. **A tempestade é um sistema.** Chuva, raios e escuridão mudam o que você vê, o que o inimigo vê e o que o apoio consegue fazer.
3. **Conquistar o apoio.** O suporte tático é recompensa de progresso e cria decisões. Ele não substitui o tiroteio.
4. **Escala monumental.** Concreto de 70 m, turbinas de 10 m, um vale inteiro abaixo. O jogador deve se sentir pequeno.
5. **Ritmo de cinema.** Picos e respiros alternados, set pieces roteirizados que nunca tiram o controle por mais de alguns segundos.

### 1.3 Diferencial
- **Comunicação como progressão:** 3 jammers → 3 níveis de suporte (drone → morteiro → atirador aliado), cada um com cargas, cooldown, designação a laser e interferência da tempestade.
- **Furtividade baseada em luz real:** holofotes, sinalizadores, relâmpagos e o próprio clarão da sua arma mudam sua visibilidade. A chuva mascara passos.
- **NVG com risco:** a visão noturna é necessária em áreas sem energia, mas ofusca com luz forte. O inimigo sabe disso e usa sinalizadores.
- **Reviravolta sistêmica:** o terceiro jammer muda o mapa (ponte destruída, comportas abertas, galeria inundando) em vez de ser só uma cutscene.

### 1.4 Narrativa e esquadrão

**Contexto.** Há 30 anos, o enchimento do reservatório de Pedra Funda afogou três vilas do vale. Os descendentes, somados a mercenários, formam Os Afogados. Símbolo: uma mão saindo da água. Lema pichado nas paredes: *"O VALE LEMBRA"*.

| Personagem | Codinome | Função | Personalidade | Fala-assinatura |
|---|---|---|---|---|
| Sargento (sem nome) | **ECO** (jogador) | Operador, carrega o designador a laser e o relé de rádio | Silencioso. Fala só no final | — |
| Cap. Rafael Duarte | **TROVÃO** | Líder do esquadrão | Veterano calmo, humor seco, mastiga café em grão | "Chuva é amiga. Esconde passo e engole tiro." |
| Cabo Inês Kowalski | **FAÍSCA** | Explosivos e eletrônica | Fala rápido, sarcástica, odeia água | "Eu desarmo bomba. Eu não nado." |
| Sgt. Tomás Adebayo | **CORUJA** | Atirador de elite, overwatch na crista leste | Lacônico, preciso | "Coruja em posição." |
| Major Vera Lind | **ATALAIA** | Comando (TOC) | Fria, profissional, carrega o peso das cidades | "Martelo, vocês são tudo o que eu tenho." |
| Ten. Bia Sampaio | **CORVO-1** | Piloto da extração | Animada sob fogo | "Táxi chegou, quem vai?" |
| Ilya Varga | **BARQUEIRO** | Líder dos Afogados, ex-engenheiro-chefe da usina | Calmo, culto, ressentido. Presença só pelo rádio e alto-falantes | "Vocês chamam de usina. Eu chamo de túmulo." |

**Reviravolta (meio da missão).** O jammer 3 era um gatilho de homem-morto: ao desligá-lo, o Barqueiro abre as comportas do vertedouro e as de fundo, explode a ponte da crista e começa a inundar a galeria. A missão deixa de ser "restabelecer comunicação" e vira "travar as comportas antes que o vale desapareça".

**Final.** Comportas travadas, extração sob fogo. Do helicóptero, Coruja tem o Barqueiro na mira num barco no reservatório. Atalaia ordena: vivo. O Barqueiro fala pela última vez: *"Vocês salvaram as cidades esta noite. Mas o vale lembra."* Gancho para a próxima missão.

Roteiro completo de falas no **Anexo A**.

---

## 2. GAMEPLAY LOOP

### 2.1 Loops em três escalas

| Escala | Duração | Loop |
|---|---|---|
| **Micro** (encontro) | 20–60 s | Ler o espaço → escolher posição → suprimir/flanquear → abater → recarregar/reposicionar |
| **Meso** (setor) | 3–6 min | Chegar ao setor → reconhecer (NVG, drone, escuta) → escolher rota (furtiva/flanco/frontal) → cumprir objetivo (jammer, porta, sala) → respiro + checkpoint |
| **Macro** (missão) | 20–40 min | Infiltração → alarme → 3 jammers liberam suporte → reviravolta → assalto à sala de controle → defesa → extração |

### 2.2 Loop principal detalhado
1. **Avançar com o esquadrão.** Aliados seguem em formação e anunciam ameaças. O marcador de objetivo e a arquitetura (luz, sinalização, cabos) guiam.
2. **Escolher a abordagem.** No Ato I, cada setor tem pelo menos duas rotas. Agachado, no escuro, com arma supressada: furtivo. Tiro sem supressor, holofote ou corpo encontrado: alarme.
3. **Enfrentar esquadrões.** Inimigos usam cobertura, suprimem, flanqueiam, lançam granadas e recuam. O jogador responde com posicionamento, granadas e inclinação.
4. **Desativar jammers.** Interação longa (4 s) em ponto exposto, sempre com uma ameaça própria (patrulha, MG, atiradores).
5. **Usar o suporte.** Cada jammer libera uma ferramenta nova, apresentada num momento seguro e testada logo depois num encontro feito para ela.
6. **Gerenciar recursos.** Munição limitada mas recuperável, vida regenerativa com punição por exposição, granadas escassas.
7. **Tomar, segurar, extrair.** O clímax usa todas as ferramentas ao mesmo tempo.

### 2.3 Objetivo e condição de vitória
Vitória: embarcar no helicóptero com as comportas travadas. Etapas obrigatórias, em ordem:

| # | Objetivo na HUD | Conclusão |
|---|---|---|
| 1 | Infiltre o perímetro da usina | Cruzar a cerca (brecha ou portão) |
| 2 | Desative o bloqueador 1 — Subestação | Segurar [F] 4 s no jammer |
| 3 | Atravesse a casa de máquinas | Sair pela porta leste, aberta pela Faísca |
| 4 | Desative o bloqueador 2 — Crista | Segurar [F] no jammer do caminhão |
| 5 | Desative o bloqueador 3 — Torre das comportas | Segurar [F] no topo da torre |
| 6 | Desça pelo elevador de serviço | Acionar o elevador |
| 7 | Atravesse a galeria antes que inunde | Chegar à saída da face jusante |
| 8 | Suba até a margem leste | Topo da escadaria |
| 9 | Abra caminho pelos alojamentos | Limpar o refeitório |
| 10 | Tome a sala de controle | Eliminar os defensores |
| 11 | Defenda a sala enquanto a Faísca trava as comportas | Override chega a 100% |
| 12 | Vá para o heliponto | Embarcar no Corvo-1 |

### 2.4 Como o progresso funciona
- **Progresso de missão:** linear por objetivos, com espaços abertos dentro de cada etapa.
- **Progresso de poder:** suporte (drone → morteiro → overwatch) e arsenal (armas recolhidas: KR-7, VK-12, BRK-8, RPL-2).
- **Curva de intensidade** (0 = silêncio, 10 = caos):

```
10 |                                         ███        ████
 8 |                 ███       ████          ███   █   █████
 6 |            ██   ███  ██   ████  ██      ███  ███  █████
 4 |      ██    ██   ███  ██   ████  ███  █  ███  ███  █████ █
 2 | ██   ██ █  ██ █ ███  ██ █ ████  ███ ██  ███  ███  █████ ██
   +----------------------------------------------------------
     LZ  cerca J1  casa de  crista J2  torre  gal. esc. ref. sala  defesa  helip.
              máquinas            J3
```
Regra: depois de cada pico vem um respiro de 30–90 s (diálogo, checkpoint, munição, vista monumental).

---

## 3. MECÂNICAS PRINCIPAIS

### 3.1 Movimentação

| Ação | Tecla (PC) | Velocidade / valor | Notas |
|---|---|---|---|
| Andar | WASD | 4,2 m/s | Aceleração 40 m/s² |
| Correr | Shift (segurar) | 6,8 m/s | Sem atirar; 0,18 s para voltar a atirar |
| Agachar | C / Ctrl | 2,2 m/s | Visibilidade ×0,7, ruído 2 m |
| Deitar | Z | 1,0 m/s | Visibilidade ×0,45, spread −40% |
| Deslizar | C durante corrida | 9 m/s → 0 em 0,8 s | Termina agachado, mira de quadril permitida |
| Inclinar | Q / E | 0,55 m + 10° de rolagem | Colide com paredes, funciona com ADS |
| Pular | Espaço | 4,5 m/s vertical | Spread de ar +150% |
| Escalar baixo (mantle) | Espaço perto de obstáculo de 0,5–1,4 m | 0,45 s | Automático quando há espaço em cima |
| Mirar (ADS) | Botão direito | Movimento ×0,6 | |

Queda acima de 4 m causa dano. Acima de 10 m mata. Água acima do joelho reduz velocidade em até 50%. Água acima dos olhos: 8 s de fôlego e depois dano.

### 3.2 Gunplay
- **Hitscan** para armas de fogo (a escala dos combates, até 120 m, dispensa balística). Foguete e granadas são projéteis físicos.
- **ADS:** tempo por arma (0,15–0,30 s), zoom 1,4× (miras) ou 4× (luneta da DMR com respiração segurando Shift).
- **Recuo com padrão aprendível:** cada arma tem uma sequência determinística (sobe nos primeiros 5–6 tiros e depois deriva para um lado e volta) com 10% de aleatoriedade. ADS reduz o recuo para 60%. A recuperação é parcial: o jogador precisa compensar puxando o mouse.
- **Spread de quadril:** valor base por arma × movimento (+60%) × ar (+150%) × agachado (−20%) × deitado (−40%) + bloom por tiro (+0,3°, decai em ~0,3 s). A cruz de mira reflete o cone real.
- **Recarga tática vs. vazia:** a tática guarda a bala na câmara (pente +1) e é ~25% mais rápida. A vazia inclui ferrolho. Correr ou trocar de arma cancela.
- **Troca rápida:** 0,35 s. Primária + pistola. Uma terceira posição para o designador a laser.
- **Penetração:** cada arma tem poder de penetração. Madeira (0,5), chapa metálica (0,8) e vidro (0,1) são atravessáveis com perda de dano. Concreto e aço grosso bloqueiam.
- **Dano por região:** cabeça ×2,2 (DMR ×2,5), torso ×1, membros ×0,8. Queda de dano com a distância por arma.
- **Feedback:** hitmarker (branco), headshot (laranja, som agudo), kill (vermelho, som grave), faíscas e poeira por material, buracos de bala, estremecimento do inimigo, sons de impacto diferentes para metal, concreto e carne.

### 3.3 Furtividade
**Visibilidade do jogador (V):**
```
V = clamp( Luz × Postura × Movimento , 0.05 , 1.5 )
Luz      = ambiente_da_zona (0.15 escuro … 0.6 interior aceso)
         + holofote cobrindo você (1.0, com linha de visão)
         + lâmpadas próximas (decaimento quadrático)
         + relâmpago ativo (1.0 por ~0.4 s)
         + clarão da própria arma (1.0 sem supressor / 0.3 com, por 0.15 s)
         + sinalizador inimigo próximo (1.0)
Postura  = em pé 1.0 · agachado 0.7 · deitado 0.45
Movimento= parado 0.85 · andando 1.0 · correndo 1.3
```
**Medidor de detecção por inimigo:** sobe com `V × (1 − d/alcance) × fator_angular × 2.5/s`. Em 0,35 o inimigo fica *suspeito*. Em 1,0 ele te viu e entra em combate. Decai 0,15/s fora de vista. Indicadores em volta da mira mostram de onde vem a detecção (branco → amarelo → vermelho).

**Ruído (raio de audição):**

| Fonte | Raio | Com chuva (ar livre) |
|---|---|---|
| Tiro sem supressor | 90 m | 90 m |
| Tiro supressado | 12 m | 8 m |
| Correr | 14 m | 10 m |
| Andar | 6 m | 4 m |
| Agachado | 2 m | 1,5 m |
| Explosão | 120 m | 120 m |
| Execução furtiva | 3 m | 2 m |

**Execuções furtivas:** [V] pelas costas (ângulo > 110° do olhar do inimigo, ≤ 2 m) de alvo sem alerta é kill silencioso. Corpos ficam no chão. Inimigo que vê um corpo dispara o alerta e corre para o painel de alarme.

**Alarme por setor:** um inimigo em combate grita no rádio. Se sobreviver 4 s, o alarme do setor toca (sirene, luzes rotativas) e 1–2 esquadrões de reforço chegam pelos pontos de spawn do setor.

### 3.4 Jammers (bloqueadores)

| # | Local | Identidade de combate | Ameaça principal | Libera |
|---|---|---|---|---|
| J1 | Subestação (pátio de transformadores) | **Furtivo**: escuro, patrulhas, 2 holofotes, NVG obrigatória | Ser visto e acionar o alarme | Drone de reconhecimento |
| J2 | Caminhão no meio da crista | **Combate aberto**: 140 m de concreto exposto, ninho de MG, escudos, pesado | Fogo cruzado e supressão | Morteiro |
| J3 | Telhado da torre das comportas (18 m) | **Vertical**: subir sob fogo de atiradores nas torres de tomada e no prédio de controle | Atiradores e quedas | Overwatch do Coruja |

Interação: segurar [F] por 4 s. Levar dano não cancela, mas sair do raio de 2 m pausa. Visual: mastro com antenas, luzes vermelhas piscando, gerador. Som: zumbido eletrônico que distorce o rádio quando você está perto (o mesmo chiado some ao desativar, como recompensa sonora).

### 3.5 Suporte tático
Chamado com o **designador a laser** (tecla 4): mire, [botão esquerdo] designa, [R] alterna o tipo. O feixe é infravermelho: quase invisível a olho nu, forte na NVG.

| Suporte | Libera em | Cargas | Cooldown | Efeito | Limites da tempestade |
|---|---|---|---|---|---|
| **Drone de reconhecimento** | J1 | 3 | 45 s | Marca inimigos num raio por 10 s, inclusive através de paredes e no minimapa | Raio 45 m × (1 − 0,35 × chuva). Relâmpago derruba o link por 1,5 s |
| **Morteiro** | J2 | 2 | 75 s | 4 granadas em 3 s num raio de 7 m, 4 s após a chamada | Exige céu aberto (recusado em interiores). Relâmpago no momento da chamada: +2 s ("interferência, repita") |
| **Overwatch (Coruja)** | J3 | 6 marcações (+1 a cada 25 s) | — | Mate um alvo marcado em 1,2 s se ele tiver linha de visão da crista leste. Passivo: elimina 1 atirador ou pesado a cada 30 s | Sem visada: "Sem linha nesse alvo". Escuridão total + chuva forte: +0,5 s |

**Por que não trivializa:** cargas baixas, atraso de chegada, perigo de fogo amigo ("perigo próximo" a menos de 12 m), céu aberto obrigatório, linha de visão do atirador limitada a uma direção e designar exige ficar exposto alguns segundos.

### 3.6 Visão noturna (NVG)
- Tecla N. Liga com 0,3 s de transição e som de tubo.
- **Imagem:** luminância ×6, verde-fósforo, granulação, vinheta circular do tubo e leve aberração.
- **Áreas sem energia** (subestação, casa de máquinas após o alarme, sala de controle após o apagão) ficam praticamente pretas sem NVG.
- **Ofuscamento:** holofotes, sinalizadores, explosões e o clarão da própria arma sem supressor saturam a imagem proporcionalmente ao brilho no centro da tela. O auto-gating recupera em ~0,5 s.
- **Relâmpago** satura a NVG por um instante e revela inimigos e jogador para todos.
- **Resposta inimiga:** inimigos *suspeitos* em áreas escuras disparam sinalizadores (25 s de luz vermelha), que expõem o jogador e cegam a NVG. Isso cria a decisão "desligar a NVG ou sair da luz".
- **Leitura extra:** estroboscópios IR dos aliados (piscam só na NVG) e o laser do designador.

### 3.7 Granadas

| Tipo | Tecla | Inventário | Fusível | Efeito |
|---|---|---|---|---|
| Fragmentação | G (segurar = cozinhar) | 3 | 3,5 s | Letal até 3 m, dano até 7 m, bloqueada por cobertura (−70%), destrói coberturas frágeis |
| Atordoante (flash) | T (com flash selecionada) | 2 | 1,5 s | Inimigos com visão dela até 12 m ficam cegos 4 s. Escudos baixam o escudo |
| Fumaça | T (com fumaça selecionada) | 2 | 1,2 s | Nuvem de 5 m por 18 s, bloqueia a linha de visão da IA |

X alterna a granada tática. Indicador de granada inimiga na HUD (ícone + seta) num raio de 8 m. Cozinhar demais explode na mão.

### 3.8 Cobertura
- **Baixa** (≤ 1,3 m: sacos de areia, mureta da crista, consoles): protege agachado, expõe a cabeça ao levantar.
- **Alta** (paredes, pilares, contêineres, transformadores): protege em pé, exige inclinar ou sair de lado.
- **Destrutível:** caixotes de madeira, barricadas de compensado e sacos de areia têm HP. Disparos, explosões e morteiro abrem caminho. Concreto da barragem e aço das turbinas são indestrutíveis (leitura clara: cinza-concreto = seguro).
- Sem "grudar" na cobertura (estilo campanha clássica). Postura e inclinação fazem o trabalho.

### 3.9 Vida e regeneração
- 100 HP. Sem dano por 4,5 s → regenera 25 HP/s.
- Abaixo de 40: batimento cardíaco, dessaturação, vinheta vermelha, respiração. Indicador direcional de dano.
- **Supressão no jogador:** balas passando a menos de 2 m causam estalo, leve desfoque e aberração cromática. O efeito é sensorial: não reduz precisão.

### 3.10 Munição
- Reserva por arma (ver arsenal). Inimigos derrubam a arma: passar por cima de uma do mesmo tipo pega munição automaticamente. Arma diferente: [F] troca.
- 60% dos inimigos derrubam um **pacote de munição genérico** (+1 pente primária, +1 pistola).
- **Caixas de munição** fixas em respiros (pós-J1, pós-casa de máquinas, base da torre, sala de controle) reabastecem tudo, inclusive granadas.

### 3.11 Falha, morte e checkpoints
- **Morte:** tela "KIA" com dica contextual e citação. [Espaço] volta ao checkpoint.
- **Checkpoints automáticos** no início de cada etapa de objetivo (12). Salvam posição, vida cheia, armas, munição, granadas, estado do suporte e as *flags* do mundo (jammers, ponte, comportas, energia, nível da água).
- **Restauração:** o setor atual é reconstruído do zero (inimigos e scripts). Setores anteriores ficam como estavam.
- **Falhas de objetivo:** afogar na galeria e cair da barragem também contam como morte.

---

## 4. IA DE INIMIGOS E ALIADOS

### 4.1 Arquitetura
```
Percepção (visão, audição, dano, supressão, corpos)
      │  atualiza
      ▼
Memória individual (consciência 0..1, última posição vista, alvo)
      │  compartilha
      ▼
Coordenador de Esquadrão (conhecimento comum, papéis, tokens de granada/flanco)
      │  ordens
      ▼
Máquina de estados por inimigo (estados abaixo) + comportamentos por tipo
      │  pede
      ▼
Serviços: Navegação (grade + A*), Sistema de Cobertura, Diretor de Combate (alarme, reforços, adaptação)
```
Em UE5: Perception Component + Blackboard + Behavior Tree (ou StateTree) + EQS para cobertura + um `SquadManager` em C++.

### 4.2 Estados

| Estado | Entrada | Comportamento | Saída |
|---|---|---|---|
| **Patrulha** | Padrão | Rota em loop ou ponto fixo olhando ao redor. Conversa casual (lore) | Estímulo → Suspeita. Visão total → Combate |
| **Suspeita / investigação** | Consciência ≥ 0,35, ruído fraco, corpo à distância | Para, olha 1,5 s ("Ouviu isso?"), anda até o ponto, varre 3–4 s. Em área escura dispara sinalizador | Nada → Patrulha com alerta elevado. Visão → Combate |
| **Alerta** | Tiro alto, aliado morto à vista, alarme | Corre para a cobertura mais próxima voltada ao estímulo, avisa o esquadrão | Contato → Combate. 20 s sem nada → Busca |
| **Combate em cobertura** | Contato confirmado | Alterna esconder (1,5–3 s) e espiar/atirar (rajadas de 1,5–3 s). Muda de cobertura se ela for comprometida | Papéis do esquadrão, perda de alvo |
| **Flanqueamento** | Papel dado pelo coordenador | Corre por rota lateral até cobertura ≥ 60° fora do eixo esquadrão–jogador | Chegou → Combate |
| **Supressão (preso)** | Supressão ≥ 0,6 | Fica abaixado, atira às cegas por cima da cobertura (precisão ×0,2) | Supressão < 0,3 |
| **Recuo / reagrupamento** | HP < 35% ou esquadrão < 40% | "Recuar!": move para cobertura ≥ 10 m mais longe, junta com sobreviventes | Chegou → Combate |
| **Busca** | 5 s sem ver o jogador | Vai à última posição conhecida em leque, depois a pontos aleatórios num raio de 15 m por 20–30 s | Achou → Combate. Nada → Patrulha alerta (ou segura posição se o alarme estiver ativo) |

### 4.3 Lógica de esquadrão
- **Conhecimento compartilhado:** quem vê atualiza a posição do jogador para todos (com 3 m de ruído para quem não viu).
- **Papéis a cada 1,5 s:** 1 *flanqueador* (se ≥ 3 membros e o jogador parado em cobertura há > 4 s), o resto *supressor/atirador*. Um *granadeiro* usa o token de granada (1 por esquadrão a cada 8 s, alvo sem linha de visão a 10–30 m).
- **Reserva de cobertura:** dois inimigos nunca ocupam o mesmo ponto.
- **Callouts audíveis** (servem como informação para o jogador): "Contato!", "Recarregando!", "Granada saindo!", "Flanqueando pela esquerda!", "Recuar!", "Homem abatido!".

### 4.4 Reação a som, luz e supressão
- **Som:** cada evento tem posição, raio e tipo. Tiros altos dão posição aproximada (±3 m) → Alerta. Ruídos fracos → Suspeita (investigar).
- **Luz:** a visão é escalada pela visibilidade V do jogador (3.3). Holofotes que detectam alguém viram para seguir a última posição conhecida. Relâmpago dá V = 1 a todos por ~0,4 s.
- **Supressão:** cada bala que passa a < 2,5 m da cabeça soma 0,25 (decai 0,35/s). Efeitos: precisão ×(1 − 0,6 × s), espiadas mais curtas e, acima de 0,6, estado Supressão. Metralhadoras e DMR suprimem mais.
- **Reação de tempo:** os primeiros 0,6 s após adquirir o alvo têm precisão ×0,3 (tiros de aviso). É a "janela justa" para o jogador reagir.

### 4.5 Perseguição e perda de alvo
1. Perdeu a visão → continua atirando na última posição por 1–2 s (fogo de supressão).
2. 5 s sem ver → Busca: o esquadrão avança em leque até a última posição conhecida.
3. Varredura de pontos de navegação próximos, sinalizador se estiver escuro.
4. 20–30 s → desiste. Se o alarme estiver ativo, segura posições defensivas. Senão, volta à patrulha com FOV e ganho de detecção ×1,5.

### 4.6 Tipos de inimigo

| Tipo | HP | Arma | Comportamento | Leitura visual/sonora | Contra-jogo |
|---|---|---|---|---|---|
| **Soldado** | 100 | Fuzil KR-7 | Cobertura, flanco, granadas | Balaclava, braçadeira vermelha | Tudo |
| **Atirador de elite** | 90 | DMR VK-12 | Fixo em altura. Mira 1,8 s com **reflexo de luneta** crescente, tiro de 80, rearma 2,5 s | Brilho na luneta, laser de mira fraco na NVG | Suprimir, fumaça, overwatch, cobertura alta |
| **Pesado** | 300 (corpo ×0,5) | Metralhadora | Avança andando e atirando rajadas longas, não recua, imune a flash parcial | Armadura volumosa, capacete com viseira, passos pesados | Cabeça (×2,5), granada, morteiro, foguete |
| **Escudo balístico** | 120 | Pistola | Avança com escudo frontal (0,3–1,7 m), para a 8 m | Escudo com visor, batidas no metal | Flash (baixa o escudo 4 s), pernas, flanco, granada |
| **Operador de torre/veículo** | 100 | MG montada (arco ±60°) | Supressão pesada, escudo da arma protege o torso | Ninho de sacos de areia, traçantes | Flanquear, granada, morteiro, headshot |
| **Técnica (veículo)** | 600 | MG na caçamba | Entra por estrada, para e metralha. Só explosivos causam dano relevante | Faróis, motor | RPL-2, morteiro, granada |

### 4.7 Aliados
- **Trovão** (fuzil) e **Faísca** (carabina) seguem em formação (−2/+3 m e +2/+4 m relativos ao jogador). **Coruja** é remoto (overwatch).
- **Furtividade:** andam agachados, *nunca* atiram primeiro e não são detectáveis (o jogador é o único que pode estragar a infiltração).
- **Combate:** procuram cobertura a 6–12 m do jogador, atiram em inimigos visíveis com **35% de dano** (suprimem e terminam inimigos feridos, mas não roubam kills). Priorizam inimigos que flanqueiam o jogador.
- **Invulneráveis** fora de roteiro. Se travados por > 3 s fora da visão do jogador, teletransportam para trás dele.
- **Utilidade:** avisam ameaças (atirador, pesado, escudo, granada, flanco, recarga inimiga), abrem portas por breach, cobrem a interação nos jammers e anunciam "Limpo" ao fim do encontro.

### 4.8 Diretor de combate (adaptação ao estilo)
| Sinal do jogador | Adaptação |
|---|---|
| Fica parado em cobertura > 6 s | Ordem de flanco + granada |
| Mata muito de longe (> 40 m) | Inimigos usam fumaça e avançam em grupo |
| Avança agressivo (kills < 8 m) | Inimigos seguram ângulos, mais escudos no próximo spawn |
| Muitas kills furtivas | Patrulhas em duplas, mais sinalizadores |
| Vida baixa repetida | Reforços chegam 25% mais tarde (fôlego) |

---

## 5. LEVEL DESIGN

### 5.1 Mapa (vista de cima, norte para cima, 1 célula ≈ 20 m, coordenadas em metros)

```
 z
-80 ~~~~~~~~~~~~~~~~~~~~~~~~~ RESERVATÓRIO (nível alto, y=-3) ~~~~~~~~~~~~~~~~~~~~~~~~~
-60 ~~~~~~~~~~~~~~~~~~~~ [TOMADA A](-50,-40)~~~~~~~[TOMADA B](20,-45)~~~~~~~~~~~ [CAIS](130,-70)
-40  estrada do reservatório (flanco)  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-20  ┌─────────────┐ praça  ╔════════════════ CRISTA (y=0, 20 m larg.) ════[TORRE]═╳╳╳═══╗  ┌───────────┐   ◎ HELIPONTO
  0  │ CASA DE     │═══════ ║ barricada  MG  ▣J2 caminhão   escudos   J3(40) ponte(60-70)║══│ SALA DE   │   (178,-2)
 20  │ MÁQUINAS    │        ╚═══════════════════════════════════════════════════╤══════╝  │ CONTROLE  │
     │ 3 turbinas  │           face jusante: degrau a y=-22 (saída da galeria) →  │escad. ├───────────┤
 40  └──────┬──────┘                     VALE (y=-70) — cidades ao sul            │      │ ALOJAMENTOS│
 60  SUBESTAÇÃO  ▣J1                                                                      └───────────┘
 80  transformadores · contêineres · casa de comando                                estrada sul (reforços)
100 ═══torre══════portão══════════════torre═══ CERCA ═══brecha(-235)
140  floresta · patrulha
190  ★ LZ (-200,190) encosta
     x: -260 ......... -150 ........ -100 ............. 0 ............. 100 ......... 150 ....... 190
```

### 5.2 Setores

| Setor | Espaço | Rotas | Cobertura | Inimigos | Set piece / destaque | Ritmo |
|---|---|---|---|---|---|---|
| **A. Encosta / LZ** | Mata molhada em declive, 80×90 m | Trilha central ou mata oeste | Árvores, pedras | Patrulha de 2 | Martelo-2 abatido por foguete na abertura | Tensão baixa, tutorial |
| **B. Perímetro** | Cerca de 140 m, 2 torres com holofote, portão com caminhão | Brecha oeste (furtiva) · portão (frontal) · lateral das torres (flanco) | Caminhão, guarita, sacos de areia | 2 vigias + 3 no portão | Holofotes varrendo na chuva | Tensão média |
| **C. Subestação (J1)** | Pátio 90×60 m sem energia, fileiras de transformadores | Corredores entre transformadores (furtiva) · telhado dos contêineres (flanco alto) · pátio central (frontal) | Transformadores (alta), contêineres, cercas internas | 8 + 4 de reforço se houver alarme | Escuridão total, NVG, painel de alarme | Furtivo |
| **D. Casa de máquinas** | Salão 40×55×18 m, 3 turbinas | Piso (frontal) · passarela a 6 m (flanco elevado) · estrada do reservatório por fora (flanco externo) | Geradores, consoles, caixotes, pilares | 12 + 4 | **Alarme roteirizado** (luz vermelha, voz do Barqueiro no PA). **Explosão da turbina 2 e queda da viga da ponte rolante** | Primeiro pico |
| **E. Crista (J2)** | 140 m de concreto exposto, mureta baixa | Pista central (frontal) · atrás dos caminhões (flanco) · mureta norte agachado (furtiva) | Mureta, barricadas, caminhões, sacos | 14 + 4 + atiradores nas torres de tomada | Vento e chuva laterais, vista do vale | Pico aberto |
| **F. Torre das comportas (J3)** | Torre de 18 m sobre a crista | Escada externa (vertical) | Guarda-corpos, casa de máquinas | 4 na torre + 2 atiradores na margem leste | **Reviravolta:** ponte explode, comportas abrem | Vertical, depois choque |
| **G. Galeria inundando** | Túnel de inspeção 57 m a y=−22 | Linear com nichos | Nichos, bombas, tubulação | 5–6 em CQB | **Elevador** + **inundação** (a água sobe ~2 m em 75 s) | Pressão de tempo |
| **H. Escadaria jusante** | Escadas na face da barragem, ao lado do vertedouro | Duas rampas | Patamar, guarda-corpo | 3–4 atirando de cima | Cortina d'água do vertedouro, névoa | Respiro tenso |
| **I. Alojamentos / refeitório** | Prédio 35×30 m | Porta sul · janelas | Mesas, armários | 6 | Lore (diários, mapas) | CQB |
| **J. Sala de controle** | Prédio 35×30 m, janelões para a barragem | Porta principal · porta lateral · janelas | Consoles | 8 | Assalto com flash | Pico fechado |
| **K. Defesa** | Sala + pátio + estradas sul/norte | — | Consoles, caixotes | 3 ondas (~23) + técnica | **Apagão**, tempestade máxima, RPL-2 | Clímax |
| **L. Heliponto** | Plataforma 25×25 m | Corrida de 60 m | Pouca (tensão) | 6 finais | Corvo-1 com metralhadora lateral, embarque | Alívio |

### 5.3 Fluxo de progressão
LZ → perímetro (2 rotas) → subestação (J1, drone) → casa de máquinas (alarme, turbina) → praça → crista (J2, morteiro) → torre (J3, overwatch, **reviravolta**) → elevador → galeria inundando → escadaria jusante → alojamentos → sala de controle → defesa → heliponto.

**Orientação do jogador:** cada objetivo tem uma "luz-guia" (o jammer pisca em vermelho, a torre tem luz de obstrução no topo, a sala de controle tem janelas acesas), cabos no chão levam aos jammers, placas pintadas ("CASA DE MÁQUINAS →", "COMPORTA 03") e o marcador de objetivo na bússola.

### 5.4 Pontos de spawn
| Setor | Spawn de reforço | Gatilho |
|---|---|---|
| Subestação | Porta sul da casa de máquinas (−130, 28) | Alarme |
| Casa de máquinas | Porta leste (−112, −20) | 15 s após o alarme roteirizado |
| Crista | Leste da crista, caminhão (40, 0) | 20 s após entrar na crista |
| Defesa | Estrada sul (180, 90), cais norte (130, −70), extremidade leste da crista (100, 0) | Linha do tempo das ondas |
| Heliponto | Estrada sul | Início da extração |

Regra de spawn: nunca à vista do jogador e nunca a menos de 25 m dele.

---

## 6. DIREÇÃO DE ARTE E ÁUDIO

### 6.1 Estilo visual
Realismo cinematográfico noturno: contraste alto, pretos profundos com informação nas médias, fontes de luz motivadas (cada luz existe no mundo). A tempestade dá a textura: chuva visível contra cada luz, névoa que engole a distância, relâmpagos que revelam a escala por frações de segundo.

### 6.2 Materiais
| Material | Tratamento |
|---|---|
| Concreto da barragem | Cinza frio, painéis de forma (juntas a cada 2 m), escorrimentos verticais escuros, musgo nas juntas, **molhado** (rugosidade 0,45–0,6) |
| Metal industrial | Azul-acinzentado com pintura gasta, rebites, ferrugem nas bordas |
| Pintura de segurança | Faixas diagonais amarelo/preto em bordas de queda, portas e guarda-corpos |
| Equipamento inimigo | Improvisado: compensado, sacos de areia, lonas, pichação "O VALE LEMBRA", símbolo da mão |
| Terreno | Lama escura, grama achatada pela chuva, rocha cinza nas encostas íngremes |
| Água | Escura e espelhada no reservatório, branca e espumosa no vertedouro |

### 6.3 Iluminação (por setor)
| Setor | Chave | Preenchimento | Acento |
|---|---|---|---|
| LZ / perímetro | Holofotes brancos frios das torres | Céu azul-escuro (hemisférico) | Incêndio laranja do Martelo-2 ao longe |
| Subestação | Nenhuma (sem energia) → NVG | Céu | LEDs vermelhos do J1 piscando |
| Casa de máquinas | Fluorescentes → **vermelho de emergência** após o alarme | Reflexo nas turbinas | Fogo da turbina 2, faíscas |
| Crista | Postes de sódio (alguns apagados) | Relâmpagos | Traçantes, sinalizadores |
| Galeria | Lâmpadas de emergência verdes | Lanternas inimigas | Reflexo na água subindo |
| Sala de controle | Telas e painéis (ciano/âmbar) → apagão | — | Sinalizadores vermelhos inimigos |
| Extração | Holofote do helicóptero | Relâmpagos constantes | Traçantes da metralhadora lateral |

### 6.4 Paleta
| Uso | Cor |
|---|---|
| Noite / sombra | `#0B0F14` · `#141B24` |
| Concreto molhado | `#5E6266` · `#3A3E42` |
| Sódio (postes) | `#FFB35C` |
| Holofote | `#DDE8FF` |
| Segurança | `#E8B10E` + `#151515` |
| Sinalizador inimigo / alarme | `#FF3B2E` |
| Luz de navegação aliada / NVG | `#3DFF7A` |
| Relâmpago | `#C9D8FF` |

### 6.5 Clima
Intensidade de tempestade de 0 a 1 ao longo da missão: 0,6 na inserção, 0,75 na crista, 0,9 depois da reviravolta e 1,0 na defesa. A intensidade controla densidade da chuva, frequência de raios (a cada 25 s → a cada 5 s), força do vento (inclinação da chuva), névoa e som.

### 6.6 Referências traduzidas em decisões
| O que as referências mostram | Decisão |
|---|---|
| Minimapa no canto superior esquerdo com aliados em verde | Minimapa rotativo, aliados em verde, inimigos só quando atiram sem supressor ou são marcados pelo drone |
| Lista de nomes do esquadrão com barras | Lista TROVÃO / FAÍSCA / CORUJA com estado ("Cobrindo", "Avançando", "Overwatch") |
| Painel de objetivo no canto superior direito | Painel "OBJETIVO" + subitens (Bloqueadores 1/3) |
| Munição grande no canto inferior direito + granadas | Munição pente/reserva grande, ícones de frag/flash/fumaça, suporte ao lado |
| Bússola no topo | Bússola com graus e marcador de objetivo |
| Arma no terço direito, mira red dot | Viewmodel no terço direito, red dot com ponto emissivo alinhado ao centro no ADS |
| Contraste luz/sombra forte, poeira e detritos no impacto | Impactos com faíscas, poeira e lascas, fumaça persistente |

### 6.7 Som e áudio
| Camada | Design |
|---|---|
| **Ambiente** | Chuva com 2 camadas (chiado + gotas), muda para "chuva no telhado" em interiores. Vento em rajadas. Água correndo nas canaletas. Trovão com atraso pela distância (d / 340 m/s) |
| **Máquinas** | Zumbido grave das turbinas (50/100 Hz) posicional, gerador do jammer, rugido do vertedouro após a reviravolta |
| **Armas** | Cada tipo com corpo próprio: estalo + soco grave + cauda. A cauda muda com o ambiente: curta e abafada na chuva, longa no salão das turbinas, metálica na galeria. Supressor: "thup" + clique mecânico |
| **Supressão** | Estalo supersônico e zumbido de bala perto da cabeça, panorâmico |
| **Inimigos** | Alertas, recarga, granada, flanco, morte. Conversa casual na patrulha |
| **Rádio** | Esquadrão e comando com filtro de banda e chiado de abertura/fechamento. Interferência perto dos jammers |
| **Música dinâmica** | 3 camadas: drone de tensão (furtivo) → pulso grave (alerta) → percussão (combate). Stingers em objetivos. Silêncio quase total na infiltração |
| **Feedback** | Hitmarker, headshot, kill, batimento com vida baixa, zumbido após flash e explosão próxima |

---

## 7. LISTA DE ASSETS

Prioridade: **P0** necessário para o vertical slice, **P1** produção, **P2** polimento.

### 7.1 Cenário modular
| Kit | Peças | Prioridade |
|---|---|---|
| Barragem | Bloco de crista 10 m, mureta, poste de iluminação, junta de dilatação, face jusante (bloco 10×10), pilar do vertedouro, comporta segmento, ponte do vertedouro | P0 |
| Torre das comportas | Pernas, casa de máquinas, escada externa (lances de 3 m), guarda-corpo, guindaste pórtico | P0 |
| Torres de tomada | Corpo cilíndrico, plataforma, grades | P1 |
| Casa de máquinas | Parede modular 5 m com janelas altas, pilares, ponte rolante, viga, passarela, escada, turbina/gerador (hero) | P0 |
| Galeria | Túnel 4×4 m (reto, curva, nicho, cruzamento), tubulação, bomba, porta estanque | P0 |
| Subestação | Transformador grande, transformador médio, isolador, pórtico de linha, cerca interna, casa de comando | P0 |
| Perímetro | Cerca alambrado 3 m + arame, portão, torre de vigia, guarita | P0 |
| Prédios da margem leste | Parede modular, janelões, porta dupla, telhado, escada interna | P0 |
| Heliponto | Plataforma com marcação H, luzes de borda | P1 |
| Terreno | Encosta, falésia do cânion, rochas (5 variações), coníferas (4 variações) | P0 |

### 7.2 Props
Caixotes de madeira (3), caixas de munição, barricadas de compensado, sacos de areia (reto, curvo, ninho), barris (2), contêineres 20' (4 cores), extintores, placas de aviso (10 textos), painéis de controle (4), consoles, armários, mesas e cadeiras de refeitório, beliches, cabos e carretéis, holofotes portáteis, geradores, lonas, rádios, mapas, documentos (intel), pichações (decal).

### 7.3 Armas e equipamentos
6 armas (ver seção 8) em 1ª pessoa (alta) e 3ª pessoa (média), designador a laser, 3 granadas, faca, NVG (montada no capacete), jammer (hero: mastro, antenas, caixa, gerador, LEDs), drone (ar), granada de morteiro (projétil), sinalizador de mão.

### 7.4 Veículos
Caminhão militar (estático + destruído), técnica com MG (dirigível por spline), helicóptero de transporte (Martelo-2/Corvo-1, com rotor animado, holofote, metralhadora lateral, versão destruída), barco do Barqueiro (P2).

### 7.5 Personagens
| Personagem | Variações | Prioridade |
|---|---|---|
| Soldado dos Afogados | 4 cabeças (balaclava, boné, capacete, capuz), 3 coletes | P0 |
| Atirador | Ghillie leve, DMR | P0 |
| Pesado | Armadura, viseira | P0 |
| Escudo | Escudo balístico com visor | P0 |
| Trovão, Faísca | Hero, com NVG e estroboscópio IR | P0 |
| Coruja, Barqueiro | Cutscene final | P2 |

### 7.6 Animações
**Primeira pessoa (por arma):** idle, andar, correr, ADS in/out, disparo, disparo ADS, recarga tática, recarga vazia, troca in/out, inspeção (P2). **Gerais:** faca (execução furtiva + golpe), granada (cozinhar, lançar), designador, mantle, deslize, NVG on/off.

**Terceira pessoa:** locomoção (andar, correr, agachado) em 8 direções, mira e disparo (em pé/agachado), espiar lateral e por cima da cobertura, fogo às cegas, recarga, lançar granada, sinalizador, reações a impacto (4 direções), mortes (6 + execução furtiva), atordoado (flash), escudo (andar/parar/baixar), pesado (andar atirando), aliados (breach, sinal de mão, cobrir).

### 7.7 VFX
Chuva (gotas, respingos no chão, escorrimento nas superfícies), relâmpago (raio no céu + iluminação), névoa volumétrica, flash de cano (por arma, versão supressada), traçantes, impactos por material (concreto, metal, madeira, terra, água, carne), buracos de bala, explosão (granada, morteiro, foguete, turbina), fogo e fumaça persistentes, faíscas elétricas (jammer, transformador), sinalizadores, fumaça de granada, cortina d'água do vertedouro, névoa da queda d'água, água subindo na galeria, cápsulas ejetadas, poeira do desabamento, overlay de NVG, sangue na tela (P1).

### 7.8 Sons
Ver 6.7. Lista mínima P0: 6 armas × (tiro perto, tiro longe, cauda interior, cauda exterior, recarga tática, recarga vazia, troca), supressor, impactos (6 materiais), estalos de bala, explosões (3 portes), granadas (pino, quique), passos (concreto, metal, terra, água) × 3 velocidades, chuva (exterior/interior), vento, trovões (5), turbina, vertedouro, gerador do jammer, alarme, helicóptero, NVG on/off, interface de rádio, 120 falas de combate inimigo, 80 falas de aliados, 60 falas de roteiro, música em 3 camadas + 4 stingers.

---

## 8. ARSENAL

| Arma | Papel | Dano (perto → longe) | Cadência | Pente / reserva | Spread quadril / ADS | Recarga tática / vazia | Penetração | Observações |
|---|---|---|---|---|---|---|---|---|
| **Carabina SD-9** (supressada) | Furtividade, curta-média | 26 → 20 (25–50 m) | 800 rpm auto | 30 / 150 | 3,0° / 0,15° | 2,0 / 2,6 s | 0,5 | Ruído de 12 m, sem traçante, recuo baixo e vertical. Arma inicial |
| **Fuzil KR-7** | Linha de frente | 34 → 26 (35–70 m) | 680 rpm auto | 30 / 180 | 3,5° / 0,2° | 2,2 / 2,8 s | 1,0 | Recuo sobe e deriva para a direita após o 6º tiro. Dropado por soldados |
| **DMR VK-12** | Precisão, contra-atirador | 70 → 62 | Semi (máx. 300) | 10 / 50 | 6,0° / 0,05° | 2,4 / 3,0 s | 1,5 | Luneta 4×, headshot ×2,5 (1 tiro), respiração segura. Dropada por atiradores |
| **Escopeta BRK-8** | CQB, escudos | 9 × 18 → 9 × 6 (8–25 m) | Pump (75 rpm) | 7 / 28 | Pellets 4,5° / 3,2° | 0,5 s por cartucho | 0,2 | Derruba escudo de perto. Achada na galeria |
| **Pistola P-19** | Secundária | 30 → 22 | Semi (máx. 450) | 15 / 60 | 2,5° / 0,3° | 1,4 / 1,8 s | 0,3 | Troca mais rápida que recarregar |
| **Lança-foguetes RPL-2** | Veículos (missão) | 400 de explosão (raio 6 m) | Tiro único | 1 / 3 | — / mira de ferro | 3,5 s | — | Projétil a 60 m/s com rastro. Na sala de controle, para a técnica |

**Animações de primeira pessoa (todas):** idle com respiração, bob de caminhada em "oito", sway pelo mouse, pose de corrida (arma baixa e inclinada), coice no disparo com retorno em mola, recarga com troca visível do pente (vazia: pente cai, ferrolho), troca abaixa/levanta, ADS com alinhamento exato da mira.

**Sons por arma:** SD-9 seco e abafado com clique metálico. KR-7 estalo médio e grave seco. VK-12 estalo alto e longo. BRK-8 soco grave + "shk-shk" do pump. P-19 estalo agudo curto. RPL-2 sopro + whoosh + explosão.

**Granadas e equipamentos:** ver 3.7 e 3.5. Faca: execução furtiva instantânea, golpe de 55 de dano.

---

## 9. IMPLEMENTAÇÃO TÉCNICA

### 9.1 Duas camadas
1. **Protótipo jogável (entregue):** `game/`, Three.js puro com ES modules, sem build. Todo o conteúdo é procedural: geometria, texturas em canvas, áudio sintetizado em Web Audio. Serve como greybox jogável e referência de feel e balanceamento.
2. **Produção (recomendada):** Unreal Engine 5. Mapeamento de cada sistema do protótipo para UE5 em 9.4.

### 9.2 Estrutura do protótipo
```
game/
  index.html            HUD, menus, import map do Three.js
  server.js             servidor estático (Node, sem dependências)
  src/
    main.js             bootstrap, loop, estados (menu, briefing, jogo, pausa, morte, vitória)
    core/   utils.js · input.js · audio.js
    world/  physics.js (AABB, grade espacial, raycast DDA, terreno)
            textures.js (texturas procedurais) · builder.js (batcher de geometria)
            level.js (mapa inteiro, luzes, set pieces) · nav.js (grade de navegação + A*)
            weather.js (chuva GPU, relâmpagos, céu) · lights.js (pool de luzes dinâmicas)
    actors/ player.js · weapons.js · viewmodel.js · soldier.js
    ai/     enemy.js (FSM + percepção) · director.js (esquadrões, alarme, adaptação) · ally.js
    game/   mission.js (roteiro, objetivos, checkpoints, ondas) · support.js · fx.js · hud.js
    render/ post.js (NVG, tonemapping, dano, supressão, flash)
```

### 9.3 Sistemas (como estão implementados)

**Controlador do jogador.** Corpo AABB (raio 0,32 m, altura 1,8/1,15/0,5 conforme postura) resolvido eixo a eixo contra colisores AABB numa grade espacial de 8 m. Degraus até 0,5 m sobem sozinhos, rampas (escadas) têm altura analítica, terreno vem de um heightfield bilinear. Mantle por detecção de borda à frente. Inclinação com teste de colisão da câmera.

**Sistema de armas.** Definições em dados (`WEAPONS` em `weapons.js`). Disparo hitscan: um raio contra o mundo (DDA na grade + slab test) e contra hitboxes dos atores (esfera da cabeça, cilindro do torso, cilindro das pernas, OBB do escudo). Penetração re-lança o raio ignorando o colisor atravessado. Recuo por tabela determinística + ruído. Supressão aplicada a inimigos cuja cabeça fica a < 2,5 m da linha do tiro.
```js
// recuo aprendível: sobe e deriva em senoide, com 10% de ruído
kick(i) = { up: base.up * (i < 6 ? 1.15 : 0.85) * jitter(0.1),
            side: base.side * Math.sin(i * base.freq + base.phase) * jitter(0.1) }
```

**IA inimiga.** FSM por inimigo (estados da 4.2) com percepção escalonada (10 Hz). Navegação: grade de 2 m gerada automaticamente sobre os colisores (várias camadas por coluna: crista e galeria), arestas validadas por continuidade de chão e folga, A* com heap binário e suavização por linha de visão. Cobertura: pontos gerados ao redor de colisores marcados `cover`, pontuados por proteção (raio do inimigo até o ponto bloqueado), distância ideal por tipo, ângulo de flanco e reserva.
```js
score(p) = (protegido ? 40 : -100) - |dist(p, jogador) - distIdeal| * 0.8
         - dist(p, eu) * 0.6 + (papel == FLANCO ? angulo(p) * 0.5 : 0) - (reservado ? 999 : 0)
```

**Coordenador de esquadrão e diretor.** `Squad` guarda conhecimento comum e distribui papéis e tokens. `Director` registra ruídos, alarmes por setor, reforços, corpos, drops e aplica a adaptação de 4.8.

**Tokens de ataque (equilíbrio de dano).** Só N inimigos por vez "atiram pra valer" no jogador (Recruta 2, Regular 3, Veterano 4); os demais fazem fogo de supressão com precisão ×0,15. Tokens expiram em 3,5 s ou quando o inimigo perde a linha de visão. Somado ao tempo de reação (0,4 s de tiros de aviso, precisão total em ~1,6 s) e ao tiro de aviso obrigatório do atirador de elite, isso mantém o tempo até a morte exposto em 8–14 s no Regular (medido no protótipo) e torna a cobertura decisiva.

**Aliados.** FSM simples (SEGUIR / COBRIR / ROTEIRO), alvo priorizando quem ameaça o jogador, dano ×0,35, teletransporte de segurança, callouts com cooldown.

**Jammers e suporte.** `level.jammers[]` com estado e progresso. `support.js` mantém cargas e cooldowns, verifica céu aberto (raio para cima), linha de visão do Coruja (raio da crista leste até o alvo) e interferência por relâmpago (`weather.lastStrike`).

**NVG e iluminação dinâmica.** Luzes "virtuais" (centenas de fontes de dados) mapeadas a cada 0,1 s para um pool fixo de luzes reais (6 pontuais + 3 spots), evitando recompilar shaders. Holofotes têm cone volumétrico falso. O pós-processamento (render target HDR) aplica ACES, NVG (ganho, fósforo, grão, tubo, ofuscamento), vinheta de dano, supressão, flash e fade.

**Ondas da defesa.** Linha do tempo em `mission.js` (eventos em segundos) com spawns fora de vista, técnica com spline, apagão programado e override de 0 a 100%.

**Checkpoint e fluxo de vitória/derrota.** Snapshot do jogador e das *flags* do mundo. Na morte, limpa inimigos e projéteis, reaplica as flags e reexecuta a etapa atual (as etapas são idempotentes). Vitória: cutscene no helicóptero e tela de estatísticas (tempo, abates, headshots, kills furtivas, precisão, suporte usado, mortes, intel).

### 9.4 Mapeamento para Unreal Engine 5
| Sistema | UE5 |
|---|---|
| Jogador | `ACharacter` + Enhanced Input + `UCharacterMovementComponent` (slide e lean custom), Motion Matching para 3ª pessoa |
| Armas | `UWeaponDataAsset` (stats, curva de recuo `UCurveVector`), `AWeaponBase` com hitscan por `LineTraceMulti` + Physical Materials para penetração e impacto |
| Dano | Gameplay Ability System (atributos Health/Armor, GameplayEffects para supressão e flash) |
| IA | `AAIController` + AIPerception (Sight com luz custom, Hearing, Damage) + StateTree/BT + EQS (cobertura, flanco, busca) + `USquadSubsystem` |
| Navegação | NavMesh com Nav Links (escadas, mantle), Smart Objects para coberturas |
| Iluminação | Lumen, Volumetric Fog, holofotes com `ULightFunction`, relâmpago via Directional + Sky Atmosphere |
| NVG | Post Process Material (luminância, fósforo, grão, bloom de ofuscamento) |
| Chuva e água | Niagara (GPU rain com colisão por depth buffer), Water plugin, decais de umidade |
| Áudio | MetaSounds (armas com camadas e cauda por ambiente via Submix + Convolution Reverb), Audio Modulation para música dinâmica |
| Roteiro | Level Sequencer + Gameplay Tags para flags + Checkpoint Save Game |
| Destrutíveis | Chaos Destruction (Geometry Collections) para caixotes, barricadas, desabamento |

---

## 10. ROTEIRO DE PRODUÇÃO

| Fase | Duração | Entregas | Critério de saída |
|---|---|---|---|
| **0. Pré-produção** | 3 semanas | GDD, mapa em papel, moodboard, protótipo de feel (este) | Loop divertido em greybox |
| **1. Greybox jogável** | 5 semanas | Mapa completo em blocos, todos os encontros, IA básica, objetivos, checkpoints | Missão jogável do início ao fim |
| **2. Sistemas** | 6 semanas | Gunplay final, IA completa (esquadrão, cobertura, tipos), suporte, NVG, granadas, aliados | Playtests internos: "o tiro é bom" |
| **3. Vertical slice** | 6 semanas | Setores C e D (subestação + casa de máquinas) com arte, som e VFX finais | Qualidade final em 10 min de jogo |
| **4. Produção de conteúdo** | 12 semanas | Arte de todos os setores, personagens, animações, set pieces, diálogo gravado | Conteúdo completo (alpha) |
| **5. Som e música** | paralelo (8 sem.) | Design sonoro, mix, música dinâmica | Mix aprovado |
| **6. Balanceamento** | 4 semanas | Telemetria de mortes, tempo por setor, uso de suporte, precisão | Mortes por setor 1–3 em Regular |
| **7. Polimento e otimização** | 6 semanas | Performance (60 fps), bugs, acessibilidade, legendas | Beta → Gold |

**Ordem ideal de construção:** controle + 1 arma → um inimigo bom → um esquadrão bom → um encontro bom → o mapa em blocos → objetivos → suporte e NVG → set pieces → arte → som → balanceamento.

**Equipe mínima (vertical slice):** 1 diretor/game designer, 1 level designer, 2 programadores de gameplay, 1 programador de IA, 2 artistas de ambiente, 1 artista técnico/VFX, 1 animador, 1 sound designer, 1 QA.

**Métricas de balanceamento a coletar:** tempo por setor, mortes por setor e por causa, percentual de jogadores que mantêm a furtividade até o J1, uso de cada suporte, precisão por arma, munição restante ao fim de cada setor, abandono na galeria inundando.

---

## 11. VERSÃO MÍNIMA JOGÁVEL

### 11.1 O que o protótipo entregue já tem
- Missão completa: inserção → 3 jammers → reviravolta → galeria inundando → sala de controle → defesa em 3 ondas → extração e tela de vitória.
- Controle completo: correr, agachar, deitar, deslizar, inclinar, mantle, ADS, recarga tática/vazia, troca, 6 armas, 3 granadas, faca e execução furtiva, NVG, designador.
- IA: patrulha, suspeita, alerta, cobertura, flanco, supressão, recuo, busca. Tipos: soldado, atirador com reflexo, pesado, escudo, operador de MG, técnica.
- Aliados com callouts, suporte (drone, morteiro, Coruja), tempestade sistêmica, 4 set pieces (Martelo-2 abatido, explosão da turbina com desabamento, ponte destruída, inundação), checkpoints.
- HUD completa (minimapa, bússola, objetivo, esquadrão, munição, suporte, detecção, dano), legendas de rádio, áudio procedural com música dinâmica.
- Seleção de capítulos no menu (9 pontos de entrada) para testar qualquer trecho da missão, três dificuldades e configurações (sensibilidade, FOV, volume, resolução, sombras, vozes TTS).

**Medições do protótipo (Regular):** ~0,5 ms de lógica por quadro com 13 inimigos ativos, ~2 ms de render; jogador parado e exposto sobrevive 8–14 s; agachado no escuro fica invisível além de ~7 m; sob holofote é detectado em menos de 0,5 s.

### 11.2 Escopo enxuto se fosse começar do zero em engine (4–6 semanas)
1. Movimento + SD-9 + KR-7 + pistola com recuo e feedback.
2. Inimigo soldado com patrulha → suspeita → combate em cobertura → busca.
3. Setores C (subestação, furtivo) e E (crista, aberto) em greybox, com J1 e J2.
4. Drone e morteiro.
5. NVG + escuridão + holofotes.
6. Checkpoint e morte.

**Fica para depois:** reviravolta e galeria, defesa em ondas, veículo, pesado, escudo, deitar e deslizar, adaptação do diretor, intel, cutscenes, música dinâmica completa.

### 11.3 Próximos passos recomendados a partir do protótipo
1. Jogar 3 vezes e registrar onde morre, onde se perde e onde se entedia.
2. Ajustar `DIFFICULTY` e as tabelas de `weapons.js`/`enemy.js` com base nisso.
3. Congelar o layout do greybox e levar para UE5 como base de blockout (as coordenadas do `level.js` são o blueprint do mapa).

---

## ANEXO A — Roteiro de rádio

**Briefing (tela antes da missão)**
> ATALAIA: Martelo, há quatro horas Os Afogados tomaram Pedra Funda. Liderança: Ilya Varga, o Barqueiro, ex-engenheiro-chefe da própria usina. Ele ameaça abrir as comportas. Abaixo da barragem estão Sarnov e mais três cidades: quatrocentas mil pessoas.
> ATALAIA: Três bloqueadores de sinal cegam nossos drones e nosso rádio. Derrubem os três, me devolvam os olhos e travem as comportas pela sala de controle. Martelo-1 entra pela encosta oeste, Martelo-2 pelo leste. Extração no heliponto da margem leste.
> ATALAIA: A tempestade está piorando. Ela vai esconder vocês. E vai esconder eles.

**Inserção**
> CORVO-1: Martelo-1 em solo. Boa caçada, pessoal.
> TROVÃO: Recebido. Martelo-2, posição?
> (foguete, explosão)
> FAÍSCA: Martelo-2 foi atingido! Tá caindo!
> TROVÃO: Atalaia, Martelo-2 abatido. Repito, Martelo-2 abatido.
> ATALAIA: ...ouvido, Martelo. Vocês são tudo o que eu tenho.
> TROVÃO: Então vamos fazer valer. Eco, Faísca, comigo. Silêncio até a cerca. Chuva é amiga: esconde passo e engole tiro.

**Perímetro e subestação**
> FAÍSCA: Brecha na cerca a oeste, perto da mata. Ou a gente bate na porta da frente.
> TROVÃO: Holofote nas torres. Fiquem no escuro.
> TROVÃO: Sem energia no pátio. Óculos, Eco.
> (J1 desativado) ATALAIA: ...Martelo, estou recebendo vocês. Fraco, mas estou. Drone de reconhecimento disponível.
> FAÍSCA: Um já foi. Faltam dois e um banho quente.

**Casa de máquinas**
> BARQUEIRO (alto-falantes): Visitantes. Bem-vindos à minha represa. Meu pai ajudou a levantar estas paredes. A vila dele está sessenta metros abaixo da água que vocês vieram proteger.
> TROVÃO: Ele sabe que a gente está aqui. Acabou o silêncio!
> (RPG na turbina) FAÍSCA: RPG! Turbina! Pra baixo!
> (porta leste) TROVÃO: Porta trancada. Faísca!
> FAÍSCA: Carga posicionada. Três, dois...

**Crista**
> TROVÃO: Crista aberta, cento e quarenta metros de nada. Avança de cobertura em cobertura!
> FAÍSCA: Atirador na torre de tomada!
> TROVÃO: Ninho de metralhadora no meio. Flanqueia ou explode.
> (J2) ATALAIA: Dois de três. Morteiros em posição, aguardando suas coordenadas.

**Torre e reviravolta**
> TROVÃO: Bloqueador três no topo da torre. A gente segura embaixo, sobe!
> (J3) ATALAIA: Comunicação total. Bom trabalho, Mar... espera. Tem um sinal saindo do bloqueador. Era um gatilho!
> BARQUEIRO: Vocês desligaram meu bloqueador. Eu desligo a represa.
> (explosões, ponte cai, comportas abrem)
> CORUJA: Coruja em posição na crista leste. Overwatch ativo. Me deem alvos.
> TROVÃO: Ponte já era. Elevador de serviço, desce pela galeria!

**Elevador e galeria**
> FAÍSCA: Eu odeio elevador. Eu odeio água. Hoje é meu dia.
> ATALAIA: Comportas de fundo abertas. A galeria vai inundar. Corram.
> FAÍSCA: Tá subindo! Tá subindo!

**Margem leste**
> CORUJA: Três hostis no topo da escada. Mantenham a cabeça baixa.
> TROVÃO: Alojamentos à direita, sala de controle depois do pátio.
> FAÍSCA: Joga uma flash antes de entrar. Eu gosto de surpresa.

**Defesa**
> FAÍSCA: Tô no sistema. Sobrescrevendo... isso leva uns minutos. Me mantém viva.
> TROVÃO: Contato ao sul! Eles vêm com tudo!
> FAÍSCA: Escudos! Usa a flash!
> TROVÃO: Técnica entrando! Tem um lança-foguetes no armário, derruba!
> (apagão) FAÍSCA: Cortaram a energia! NVG!
> FAÍSCA: Comportas... travadas! Travadas!
> ATALAIA: Confirmo, comportas fechando. Corvo-1, buscar Martelo.

**Extração**
> CORVO-1: Táxi chegou, quem vai? Heliponto, trinta segundos, não esperem convite!
> TROVÃO: Vai, vai, vai!
> (embarque) CORUJA: Tenho o Barqueiro. Barco, quinhentos metros, reservatório.
> ATALAIA: ...Negativo, Coruja. Queremos ele vivo.
> CORUJA: Entendido.
> BARQUEIRO: Vocês salvaram as cidades esta noite. Mas o vale lembra.
> ECO: ...A gente também.

## ANEXO B — Controles (PC)

| Ação | Tecla |
|---|---|
| Mover / correr | WASD / Shift |
| Pular / escalar | Espaço |
| Agachar (deslizar correndo) / deitar | C ou Ctrl / Z |
| Inclinar | Q / E |
| Atirar / mirar | Botão esquerdo / direito |
| Recarregar | R |
| Primária / pistola / designador | 1 / 2 / 4 (ou roda do mouse) |
| Granada de fragmentação | G (segurar para cozinhar) |
| Granada tática / alternar | T / X |
| Faca / execução | V |
| Interagir | F |
| Visão noturna | N |
| Mapa | M |
| Pausa | Esc |

---

## 12. Chefe — COLOSSO MX-9 (adendo)

**Papel.** Primeiro pico de dificuldade e "assinatura" da missão: um robô de assalto de 5 m que cai do céu sobre a subestação assim que o jogador cruza a cerca. Ensina três coisas de uma vez: blindagem (o corpo quase não sente balas), ponto fraco (a cabeça, com visor vermelho) e movimento sob telégrafo (pisão, golpe e mísseis sempre avisam antes).

**Cena de entrada (~9 s, pulável).** Fade → relâmpago e silhueta com jatos nos pés em queda livre → corte baixo no impacto (anel de choque, poeira, tremor, ruído que acorda a base) → ele se ergue, vira para o jogador e ruge; cartão de título nas tarjas.

**Padrões.**

| Ataque | Aviso | Contra-jogo |
|---|---|---|
| Rajada do fuzil pesado | tracer laranja, linha de mira do braço | cobertura (transformadores bloqueiam) |
| Pisão (raio 8,5 m) | círculo vermelho + pé levantado, ~1,5 s | afastar-se ou estar no ar |
| Golpe duplo (cone à frente) | círculo na área + braços erguidos | lateral |
| Salva de mísseis | fala do Trovão + 1,1 s travando | mover-se; explosões são bloqueadas por cobertura |
| Fase 2 (50%) | rugido de 3,5 s + onda de choque | munição cai no chão; foguete RPL-2 é eficiente |

**Números.** 1800 PV; multiplicadores: cabeça ×0,6 (sobre o ×3 de headshot), corpo ×0,55, pernas ×0,3, explosivos ×0,9; ≈ 100–125 tiros no corpo ou ≈ 35 na cabeça com a SD-9. Aliados só "cutucam" (7 de dano a cada 1,3 s).

**Técnica.** Cabeça separada do corpo por reponderação de pele (elipsoide do capacete → 100% osso `Head`, transição suave) e pivô movido para o centro do capacete — o tronco gira até ±0,85 rad e a cabeça ±0,9 rad de forma independente. Animações geradas pelo **Kimodo** (texto→movimento, esqueleto SOMA de 30 juntas): idle, walk, run, fall, land, roar, aim, stomp, slam, hit, die; retargeteadas em tempo real para o esqueleto Mixamo (rotações globais relativas ao T-pose) com IK de dois ossos levando as mãos às empunhaduras do fuzil.

---

## 13. Passe "premium" — arte, áudio e modelos gerados (adendo)

**Direção.** Mesma noite de tempestade, agora com arte final gerada localmente: capas e miniaturas fotográficas (menu, briefing, capítulos, carregamento, morte, vitória), texturas PBR tileáveis (concreto, asfalto, metal, madeira, terreno, rocha, contêiner), soldados e cenário em malha 3D, trilha e efeitos sonoros por IA. Tudo cai no equivalente procedural se um arquivo faltar.

**Áudio (Stable Audio 3).** 178 clipes: 13 armas (3 variações nas principais), manuseio, 4 hitmarkers, 7 impactos por material, passos por superfície, 3 explosões + distante, trovões, sons do chefe, rádio/UI e 13 ambientes em loop (chuva, vento, vertedouro, turbina, túnel, alarme, helicóptero…). Música dinâmica por estado com crossfade de 2,4 s: **menu · furtivo · tensão · combate · chefe · defesa · extração · vitória · derrota** (histerese: combate segura 12 s, tensão 10 s). Níveis normalizados (pico nos SFX, RMS nas trilhas).

**Visual.** Bloom HDR em pirâmide, SSAO em meia resolução, nitidez adaptativa, gradação (sombras frias/altas-luzes quentes), foco periférico ao mirar, céu com camada de nuvens fotográfica. Opção "Qualidade gráfica" (Alta/Média/Baixa).

**Personagens.** Sete soldados (fuzileiro balaclava, fuzileiro boné, pesado blindado, escudo, atirador, 2 aliados) gerados em T-pose, com **rig automático** (juntas estimadas das fatias da malha + pesos por distância aos ossos) e animações do Kimodo (parado, andar, correr, agachado, olhar, hit, 3 mortes, granada, atordoado), IK de dois ossos nas empunhaduras. Braços em primeira pessoa com a mesma malha (mangas) e luvas.

**Cenário.** Pinheiros/abetos/árvores mortas e arbustos instanciados em células (frustum culling por célula), pedras, transformadores, caixas, barris, sacos de areia, barreiras, geradores, holofotes, tendas, helicóptero e caminhonete técnica.
