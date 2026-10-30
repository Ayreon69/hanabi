// Règles des cartes et mémoire des indices. La mémoire ne quitte jamais le serveur : elle sert aux bots.
import { COLORS, COPIES, VALUES, touches, type Card, type Color, type Fireworks, type Hint } from '../shared/protocol';

export interface GCard extends Card {
  id: string;
}

/** Ce que la table sait d'une carte d'après les indices entendus. Tout le monde les a entendus : c'est public. */
export interface Knowledge {
  colors: Set<Color>;
  values: Set<number>;
  /** Désignée au moins une fois par un indice. */
  touched: boolean;
  /** Lecture de l'indice selon les conventions des bots : à jouer, ou à garder. */
  mark: 'play' | 'keep' | null;
  /** Pour une carte à jouer : les identités qui la rendaient jouable au moment de l'indice. */
  intent: Card[] | null;
  /**
   * Ce qu'une carte désignée ne peut pas être, selon les conventions : on ne désigne jamais une carte déjà inutile,
   * ni le double d'une carte déjà désignée. Quand une carte désignée est posée, ses doubles désignés ne peuvent pas être elle.
   */
  not: Card[];
}

export function freshKnowledge(): Knowledge {
  return { colors: new Set(COLORS), values: new Set(VALUES), touched: false, mark: null, intent: null, not: [] };
}

export function cloneKnowledge(k: Knowledge): Knowledge {
  return { colors: new Set(k.colors), values: new Set(k.values), touched: k.touched, mark: k.mark, intent: k.intent ? [...k.intent] : null, not: [...k.not] };
}

/** Ce qu'un indice apprend sur une carte : sa couleur ou sa valeur si elle est désignée, sinon ce qu'elle n'est pas. */
export function learn(k: Knowledge, hint: Hint, touched: boolean): void {
  if (touched) {
    k.touched = true;
    if (hint.kind === 'color') k.colors = new Set([hint.color]);
    else k.values = new Set([hint.value]);
  } else if (hint.kind === 'color') k.colors.delete(hint.color);
  else k.values.delete(hint.value);
}

export function same(a: Card, b: Card): boolean {
  return a.color === b.color && a.value === b.value;
}

export function isPlayable(c: Card, fw: Fireworks): boolean {
  return c.value === fw[c.color] + 1;
}

/** Ce que tout le monde voit sur la table : feux d'artifice et défausse. */
export interface PublicTable {
  fireworks: Fireworks;
  discard: Card[];
}

export function discarded(t: PublicTable, c: Card): number {
  let n = 0;
  for (const d of t.discard) if (same(d, c)) n++;
  return n;
}

/** Une carte morte ne servira plus : déjà posée, ou une carte plus basse de sa couleur est entièrement défaussée. */
export function isDead(c: Card, t: PublicTable): boolean {
  const top = t.fireworks[c.color];
  if (c.value <= top) return true;
  for (let v = top + 1; v < c.value; v++) if (discarded(t, { color: c.color, value: v }) >= COPIES[v]) return true;
  return false;
}

/** Une carte critique est le dernier exemplaire encore utile : la défausser, c'est renoncer à des points. */
export function isCritical(c: Card, t: PublicTable): boolean {
  return !isDead(c, t) && discarded(t, c) === COPIES[c.value] - 1;
}

/** Combien d'exemplaires de cette carte ne sont ni posés ni défaussés (dont ceux qu'on voit en main). */
export function unaccounted(t: PublicTable, c: Card): number {
  return COPIES[c.value] - discarded(t, c) - (t.fireworks[c.color] >= c.value ? 1 : 0);
}

export interface Candidate {
  card: Card;
  /** Nombre d'exemplaires qui peuvent encore être cette carte. */
  weight: number;
}

/**
 * Les identités possibles d'une carte, pondérées par le nombre d'exemplaires restants.
 * `seen` : les cartes que celui qui raisonne voit ailleurs (mains des autres), à retirer du compte.
 */
export function candidates(k: Knowledge, t: PublicTable, seen: Card[] = []): Candidate[] {
  const list: Candidate[] = [];
  for (const color of k.colors) {
    for (const value of k.values) {
      const card = { color, value };
      let weight = unaccounted(t, card);
      for (const s of seen) if (same(s, card)) weight--;
      if (weight > 0) list.push({ card, weight });
    }
  }
  // Les déductions par convention ne s'appliquent que si elles laissent au moins une possibilité.
  const kept = list.filter((c) => !k.not.some((n) => same(n, c.card)));
  return kept.length ? kept : list;
}

/** Au moment où une carte est désignée : elle n'est aucune des cartes déjà inutiles. */
export function excludeDead(k: Knowledge, t: PublicTable): void {
  for (const color of k.colors) {
    for (const value of k.values) {
      const card = { color, value };
      if (isDead(card, t) && !k.not.some((n) => same(n, card))) k.not.push(card);
    }
  }
}

/** La carte en danger d'une main : la plus à droite (la plus ancienne) qu'aucun indice n'a désignée. */
export function chopIndex(know: Knowledge[]): number {
  for (let i = know.length - 1; i >= 0; i--) if (!know[i].touched) return i;
  return -1;
}

export interface Reading {
  /** La carte visée par l'indice (null : rien de nouveau n'est désigné). */
  focus: number | null;
  kind: 'play' | 'save' | 'info';
  intent: Card[];
}

/**
 * Lecture d'un indice selon les conventions des bots, à partir de la seule information publique.
 * - La carte visée est la carte en danger si l'indice la désigne, sinon la plus à gauche des cartes nouvellement désignées.
 * - Sur la carte en danger, si elle peut être une carte critique qui n'est pas jouable, c'est une sauvegarde : on la garde.
 * - Sinon, si elle peut être jouable, c'est un indice de jeu : elle est jouable tout de suite.
 * Celui qui donne l'indice fait la même lecture avant de le donner : il ne donne que des indices qui seront bien compris.
 */
export function readHint(know: Knowledge[], touched: boolean[], hint: Hint, t: PublicTable): Reading {
  const chop = chopIndex(know);
  const fresh: number[] = [];
  for (let i = 0; i < know.length; i++) if (touched[i] && !know[i].touched) fresh.push(i);
  if (!fresh.length) return { focus: null, kind: 'info', intent: [] };
  const focus = chop >= 0 && fresh.includes(chop) ? chop : fresh[0];
  const k = cloneKnowledge(know[focus]);
  learn(k, hint, true);
  let cands = candidates(k, t).map((c) => c.card);
  // On ne désigne pas une carte morte : si une identité utile reste possible, c'est elle.
  const alive = cands.filter((c) => !isDead(c, t));
  if (alive.length) cands = alive;
  const playable = cands.filter((c) => isPlayable(c, t.fireworks));
  if (focus === chop && cands.some((c) => !isPlayable(c, t.fireworks) && isCritical(c, t))) return { focus, kind: 'save', intent: [] };
  if (playable.length) return { focus, kind: 'play', intent: playable };
  return { focus, kind: 'info', intent: [] };
}

/** Désigne-t-il une carte, d'après ses vraies couleur et valeur ? */
export function touchMask(hand: Card[], hint: Hint): boolean[] {
  return hand.map((c) => touches(c, hint));
}
