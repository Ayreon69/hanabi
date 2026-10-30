// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes et règles des cartes.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** Les cinq feux d'artifice, dans l'ordre où ils s'alignent sur la table. */
export const COLORS = ['rouge', 'jaune', 'vert', 'bleu', 'blanc'] as const;
export type Color = (typeof COLORS)[number];
export const VALUES = [1, 2, 3, 4, 5] as const;
/** Dans chaque couleur : trois 1, deux 2, deux 3, deux 4 et un seul 5. */
export const COPIES: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };
export const DECK_SIZE = 50;
export const MAX_HINTS = 8;
export const MAX_STORMS = 3;
export const MAX_SCORE = 25;

/** Cinq cartes en main à 2 ou 3 joueurs, quatre à 4 ou 5. */
export function handSize(players: number): number {
  return players <= 3 ? 5 : 4;
}

export const AVATARS = ['lanterne', 'furin', 'poisson', 'renard', 'pasteque', 'dango', 'glace', 'lune', 'bambou', 'grenouille', 'kimono', 'tortue'] as const;
/** Des réactions qui ne disent rien des cartes : à Hanabi, on ne communique que par les indices. */
export const EMOTES = ['👏', '😮', '😅', '🙏', '🎆', '🤞'] as const;
export const TAUNTS = ['Bravo !', 'Merci !', 'Oups…', 'Pardon !', 'Je réfléchis…', 'Joli coup'] as const;

export const THINK_OPTIONS = [0, 45, 90] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];

export interface Settings {
  /** Temps de réflexion par tour, en secondes (0 : sans limite). */
  think: ThinkTime;
}

export interface Card {
  color: Color;
  value: number;
}

export type Hint = { kind: 'color'; color: Color } | { kind: 'value'; value: number };

/** Une carte est-elle désignée par cet indice ? */
export function touches(card: Card, hint: Hint): boolean {
  return hint.kind === 'color' ? card.color === hint.color : card.value === hint.value;
}

export type Fireworks = Record<Color, number>;

export function emptyFireworks(): Fireworks {
  return { rouge: 0, jaune: 0, vert: 0, bleu: 0, blanc: 0 };
}

/** La somme des plus hautes cartes posées. */
export function fireworksScore(fw: Fireworks): number {
  return COLORS.reduce((n, c) => n + fw[c], 0);
}

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

/**
 * Une carte telle qu'un joueur la voit. Face (couleur et valeur) seulement pour les cartes des autres :
 * ses propres cartes, on n'en voit que le dos, et on sait seulement si on l'a inclinée.
 */
export interface CardView {
  id: string;
  tilted: boolean;
  color?: Color;
  value?: number;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** La main, dans l'ordre choisi par son propriétaire (null hors partie). */
  hand: CardView[] | null;
}

/**
 * Ce qui vient de se passer autour de la table. Le serveur ne garde ces événements que quelques secondes :
 * l'indice s'affiche sur le moment, puis il faut s'en souvenir.
 */
export interface GameEvent {
  id: number;
  at: number;
  until: number;
  kind: 'hint' | 'play' | 'discard';
  by: string;
  /** Indice : à qui, quoi, et les cartes désignées. */
  target?: string;
  hint?: Hint;
  cardIds?: string[];
  /** Carte jouée ou défaussée : elle se retourne pour tout le monde. */
  card?: Card;
  cardId?: string;
  success?: boolean;
  /** Un 5 posé rend un jeton indice. */
  bonus?: boolean;
}

export type EndReason = 'storms' | 'perfect' | 'deck';

export interface GameView {
  order: string[];
  turnId: string | null;
  turnEndsAt: number;
  /** Numéro de l'action : une action envoyée pour un tour déjà passé est refusée. */
  seq: number;
  hints: number;
  storms: number;
  deck: number;
  fireworks: Fireworks;
  /** La défausse, face visible et rangée par couleur : elle se consulte à tout moment. */
  discard: Card[];
  /** La pioche est vide : chacun joue une dernière fois, et celui qui a pioché la dernière carte finit. */
  lastRound: { lastId: string } | null;
  events: GameEvent[];
  /** La partie vient de s'achever : on laisse le temps de voir le dernier coup avant les résultats. */
  ended: { reason: EndReason; score: number } | null;
}

export interface PlayerStats {
  plays: number;
  hints: number;
  discards: number;
  storms: number;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  /** Les cartes qu'il avait en main à la fin, révélées à tous. */
  hand: Card[];
  stats: PlayerStats;
}

export interface FinalView {
  reason: EndReason;
  score: number;
  fireworks: Fireworks;
  players: FinalEntry[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Vérifie et normalise un indice reçu du réseau. */
export function parseHint(raw: unknown): Hint | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (h.kind === 'color' && (COLORS as readonly unknown[]).includes(h.color)) return { kind: 'color', color: h.color as Color };
  if (h.kind === 'value' && (VALUES as readonly unknown[]).includes(h.value)) return { kind: 'value', value: h.value as number };
  return null;
}
