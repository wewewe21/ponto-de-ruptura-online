// Ações do jogo e nomes das teclas. O código padrão de cada ação é o "id" lógico usado em todo o jogo
// (input.down('KeyW')); o jogador pode trocar a tecla/botão físico de qualquer uma delas.
export const ACTIONS = [
  { id: 'KeyW', label: 'Andar para frente', group: 'MOVIMENTO' },
  { id: 'KeyS', label: 'Andar para trás', group: 'MOVIMENTO' },
  { id: 'KeyA', label: 'Andar para a esquerda', group: 'MOVIMENTO' },
  { id: 'KeyD', label: 'Andar para a direita', group: 'MOVIMENTO' },
  { id: 'ShiftLeft', label: 'Correr · toque duplo: corrida tática · segurar o fôlego', group: 'MOVIMENTO' },
  { id: 'Space', label: 'Pular / escalar', group: 'MOVIMENTO' },
  { id: 'KeyC', label: 'Agachar / deslizar · toque novamente para cancelar', group: 'MOVIMENTO' },
  { id: 'KeyZ', label: 'Deitar', group: 'MOVIMENTO' },
  { id: 'KeyQ', label: 'Inclinar para a esquerda', group: 'MOVIMENTO' },
  { id: 'KeyE', label: 'Inclinar para a direita', group: 'MOVIMENTO' },
  { id: 'Mouse0', label: 'Atirar', group: 'COMBATE' },
  { id: 'Mouse2', label: 'Mirar', group: 'COMBATE' },
  { id: 'KeyR', label: 'Recarregar', group: 'COMBATE' },
  { id: 'Digit1', label: 'Arma principal', group: 'COMBATE' },
  { id: 'Digit2', label: 'Arma secundária', group: 'COMBATE' },
  { id: 'Digit3', label: 'Faca', group: 'COMBATE' },
  { id: 'Digit4', label: 'Sniper (só campanha)', group: 'COMBATE' },
  { id: 'KeyV', label: 'Golpe rápido de faca', group: 'COMBATE' },
  { id: 'KeyG', label: 'Granada (segure para cozinhar)', group: 'COMBATE' },
  { id: 'KeyT', label: 'Granada tática', group: 'COMBATE' },
  { id: 'KeyX', label: 'Alternar tática (atordoante/fumaça)', group: 'COMBATE' },
  { id: 'KeyF', label: 'Interagir', group: 'OUTROS' },
  { id: 'KeyB', label: 'Entrar no Colosso (online)', group: 'OUTROS' },
  { id: 'KeyU', label: 'Chamar nuke (online)', group: 'OUTROS' },
  { id: 'KeyN', label: 'Visão noturna', group: 'OUTROS' },
  { id: 'KeyM', label: 'Mapa', group: 'OUTROS' },
  { id: 'Tab', label: 'Placar (online)', group: 'OUTROS' },
];

const NAMES = {
  Space: 'ESPAÇO', ShiftLeft: 'SHIFT ESQ.', ShiftRight: 'SHIFT DIR.', ControlLeft: 'CTRL ESQ.', ControlRight: 'CTRL DIR.',
  AltLeft: 'ALT ESQ.', AltRight: 'ALT DIR.', Tab: 'TAB', CapsLock: 'CAPS', Enter: 'ENTER', Backspace: 'BACKSPACE', Backquote: '`',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\',
  Mouse0: 'MOUSE 1', Mouse1: 'MOUSE 3 (RODA)', Mouse2: 'MOUSE 2', Mouse3: 'MOUSE 4', Mouse4: 'MOUSE 5',
};
export function codeLabel(code) {
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6).toUpperCase();
  return code.toUpperCase();
}
