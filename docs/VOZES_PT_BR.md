# Vozes em português brasileiro

156 falas gravadas, cobrindo missão, aliados, hostis, chefe, suporte e os avisos do multiplayer. São oito identidades: Trovão, Faísca, Atalaia, Coruja, Barqueiro, Corvo-1, Hostil e Eco. As legendas e o texto original foram preservados. Siglas e termos de rádio são expandidos apenas na entrada da síntese, para melhorar a pronúncia.

O jogo baixa MP3 sob demanda e guarda até 36 falas decodificadas. Não precisa de ComfyUI, conta, TTS do navegador ou modelo de IA no Render. Ative/desative em **Configurações → Vozes dos personagens (português Brasil)**; as gravações ficam ligadas por padrão. Essa opção substitui o antigo TTS experimental, que vinha desligado.

Trovão e Faísca usam voz normal espacial a menos de 12 metros; à distância usam rádio. Atalaia, Coruja, Corvo-1 e Barqueiro usam rádio, com corte de graves/agudos e compressão. Os inimigos falam no mundo e Eco fala sem rádio. No multiplayer, o comando anuncia início/fim, resultado e Colosso; o operador confirma abate, recarga e retorno. Eventos prioritários interrompem avisos menos importantes. Falas atrasadas ou de uma sessão encerrada são canceladas.

## ComfyUI local

Foi instalado no ComfyUI portátil existente o nó **Ponto de Ruptura / Vozes PT-BR**, com cópia do código em `game/tools/comfy_nodes/pdr_kokoro`. O workflow **Ponto de Ruptura - Vozes PT-BR.json** está na pasta de workflows do ComfyUI. Também há versões editável e API em `game/tools/workflows/`.

- Motor: [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), pacote 0.6.1.
- Pesos: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0; modelo ONNX int8 de 92.361.271 bytes e banco de vozes de 28.214.398 bytes. Ficam em `ComfyUI/models/kokoro-onnx`, fora do repositório do jogo.
- Vozes brasileiras nativas: `pm_alex`, `pm_santa`, `pf_dora`. Mistura, ritmo e pequenos ajustes de tom diferenciam o elenco. As configurações estão no manifesto gerado e no gerador.
- Referência de workflow: [exemplo público de Apache0ne/ComfyUI-kokoro](https://github.com/Apache0ne/ComfyUI-kokoro/blob/main/Kokoro%20Onnx%20TTS-example.json). A adaptação usa os nós locais do projeto, inclui pt-BR e força execução na CPU; não baixa o modelo grande nem instala ONNX GPU.

## Gerar novamente

Instale as dependências de `game/tools/comfy_nodes/pdr_kokoro/requirements.txt` no Python do ComfyUI, copie esse diretório para `ComfyUI/custom_nodes/pdr_kokoro` e reinicie o ComfyUI quando não houver trabalhos na fila. São necessários Node 22+, `npm ci` e FFmpeg/ffprobe no ambiente de geração.

```powershell
node game/tools/voice-catalog.cjs
node game/tools/generate-voices.cjs
node game/tools/verify-voices.cjs
npm test
```

O gerador usa `http://127.0.0.1:8188` por padrão (variável `COMFY` para outro endereço), reutiliza falas já geradas e atualiza o manifesto atomicamente. O catálogo lê a AST das falas do código; os testes detectam falas sem gravação, arquivo ausente e erros de associação entre personagens. Depois de editar um diálogo, gere os áudios antes de publicar.

`tools/voice-qa.html` permite experimentar as oito vozes com e sem rádio. A validação objetiva verificou sinal/volume das 156 gravações e transcrição em português de amostras dos oito personagens. Essa transcrição não substitui uma avaliação artística feita por quem ouve.
