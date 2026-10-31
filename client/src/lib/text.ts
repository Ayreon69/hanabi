// Les mots de la table : couleurs accordées, indices dits à voix haute, et ce qui vient de se passer.
import type { Card, Color, GameEvent, Hint, RoomView } from '../../../shared/protocol';

/** Le nom de la couleur, comme sur un bouton. */
export const COLOR_NAME: Record<Color, string> = { rouge: 'Rouge', jaune: 'Jaune', vert: 'Vert', bleu: 'Bleu', blanc: 'Blanc' };
/** Accordée avec « carte ». */
const FEM: Record<Color, string> = { rouge: 'rouge', jaune: 'jaune', vert: 'verte', bleu: 'bleue', blanc: 'blanche' };
const FEM_PL: Record<Color, string> = { rouge: 'rouges', jaune: 'jaunes', vert: 'vertes', bleu: 'bleues', blanc: 'blanches' };

/** « un 3 vert », comme on le dit à la table. */
export function cardName(c: Card): string {
  return `un ${c.value} ${c.color}`;
}

/** L'indice, tel qu'on le dit à celui qui le reçoit. */
export function hintSentence(hint: Hint, n: number): string {
  if (hint.kind === 'color') {
    if (n === 0) return `Tu n'as aucune carte ${FEM[hint.color]}.`;
    return n === 1 ? `Cette carte est ${FEM[hint.color]}.` : `Ces ${n} cartes sont ${FEM_PL[hint.color]}.`;
  }
  if (n === 0) return `Tu n'as aucun ${hint.value}.`;
  return n === 1 ? `Cette carte est un ${hint.value}.` : `Ces ${n} cartes sont des ${hint.value}.`;
}

/** L'indice résumé, pour ceux qui regardent. */
function hintShort(hint: Hint, n: number): string {
  if (hint.kind === 'color') {
    if (n === 0) return `aucune carte ${FEM[hint.color]}`;
    return n === 1 ? `1 carte ${FEM[hint.color]}` : `${n} cartes ${FEM_PL[hint.color]}`;
  }
  if (n === 0) return `aucun ${hint.value}`;
  return n === 1 ? `1 carte de valeur ${hint.value}` : `${n} cartes de valeur ${hint.value}`;
}

export function hintLabel(hint: Hint): string {
  return hint.kind === 'color' ? COLOR_NAME[hint.color] : String(hint.value);
}

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Ce qui vient de se passer, en une phrase. */
export function eventText(view: RoomView, e: GameEvent): string {
  const mine = e.by === view.me;
  const who = mine ? 'Tu' : nameOf(view, e.by);
  if (e.kind === 'hint' && e.hint) {
    const n = e.cardIds?.length ?? 0;
    if (e.target === view.me) return `${who} t'indique : ${hintSentence(e.hint, n).replace(/^./, (x) => x.toLowerCase())}`;
    return `${mine ? 'Tu indiques à' : `${who} indique à`} ${nameOf(view, e.target)} : ${hintShort(e.hint, n)}`;
  }
  if (!e.card) return '';
  const card = cardName(e.card);
  if (e.kind === 'discard') return `${who} ${mine ? 'défausses' : 'défausse'} ${card}.`;
  if (!e.success) return `${who} ${mine ? 'joues' : 'joue'} ${card}… raté : orage !`;
  if (e.card.value === 5) return `${who} ${mine ? 'complètes' : 'complète'} le feu ${e.card.color} !${e.bonus ? ' Un jeton indice revient.' : ''}`;
  return `${who} ${mine ? 'poses' : 'pose'} ${card}.`;
}
