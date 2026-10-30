// Le moteur de Hanabi : pioche, mains, indices, feux d'artifice, défausse et fin de partie. Aucune minuterie ici.
import crypto from 'node:crypto';
import {
  COLORS,
  COPIES,
  MAX_HINTS,
  MAX_SCORE,
  MAX_STORMS,
  VALUES,
  emptyFireworks,
  fireworksScore,
  handSize,
  touches,
  type Card,
  type EndReason,
  type Fireworks,
  type GameEvent,
  type Hint,
  type PlayerStats,
} from '../shared/protocol';
import { excludeDead, freshKnowledge, isPlayable, learn, readHint, type GCard, type Knowledge, type PublicTable } from './cards';

export interface GameOptions {
  /** Pioche imposée, du dessus vers le dessous (tests). */
  deck?: Card[];
  /** Durée d'affichage d'un indice avant qu'il ne disparaisse des vues. */
  hintMs?: number;
  /** Durée d'affichage d'une carte jouée ou défaussée. */
  actMs?: number;
}

function randomInt(n: number): number {
  return crypto.randomInt(n);
}

function shortId(): string {
  return crypto.randomBytes(6).toString('base64url');
}

export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) for (const value of VALUES) for (let i = 0; i < COPIES[value]; i++) cards.push({ color, value });
  return cards;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyStats(): PlayerStats {
  return { plays: 0, hints: 0, discards: 0, storms: 0 };
}

export class Game {
  readonly order: string[];
  /** Chaque main, de gauche à droite : la carte piochée arrive à gauche. */
  readonly hands = new Map<string, GCard[]>();
  readonly tilted = new Set<string>();
  /** La pioche, face cachée : elle ne sort jamais du serveur. */
  deck: GCard[];
  discard: GCard[] = [];
  fireworks: Fireworks = emptyFireworks();
  hints = MAX_HINTS;
  storms = 0;
  turn = 0;
  seq = 0;
  lastRound: { lastId: string; fromSeq: number } | null = null;
  over: { reason: EndReason; score: number } | null = null;
  /** La mémoire des indices, carte par carte : réservée aux bots et au pilote automatique. */
  readonly know = new Map<string, Knowledge>();
  readonly stats = new Map<string, PlayerStats>();
  events: GameEvent[] = [];
  private eventId = 0;
  private readonly hintMs: number;
  private readonly actMs: number;

  constructor(order: string[], opts: GameOptions = {}) {
    this.order = [...order];
    this.hintMs = opts.hintMs ?? 8000;
    this.actMs = opts.actMs ?? 4500;
    const cards = opts.deck ? opts.deck.map((c) => ({ ...c })) : shuffle(fullDeck());
    // Les identifiants sont tirés au hasard : ils ne disent rien de la carte.
    this.deck = cards.map((c) => ({ ...c, id: shortId() }));
    const size = handSize(order.length);
    for (const id of order) {
      this.hands.set(id, []);
      this.stats.set(id, emptyStats());
    }
    for (let i = 0; i < size; i++) for (const id of order) this.draw(id);
  }

  get current(): string {
    return this.order[this.turn];
  }

  get score(): number {
    return fireworksScore(this.fireworks);
  }

  get table(): PublicTable {
    return { fireworks: this.fireworks, discard: this.discard };
  }

  knowledge(cardId: string): Knowledge {
    let k = this.know.get(cardId);
    if (!k) {
      k = freshKnowledge();
      this.know.set(cardId, k);
    }
    return k;
  }

  hand(id: string): GCard[] {
    return this.hands.get(id) ?? [];
  }

  private draw(id: string): void {
    const card = this.deck.shift();
    if (!card) return;
    this.hand(id).unshift(card);
    this.know.set(card.id, freshKnowledge());
    if (this.deck.length === 0 && !this.lastRound) this.lastRound = { lastId: id, fromSeq: this.seq };
  }

  private check(by: string): string | undefined {
    if (this.over) return 'La partie est terminée.';
    if (by !== this.current) return "Ce n'est pas ton tour.";
    return undefined;
  }

  private event(e: Omit<GameEvent, 'id' | 'at' | 'until'>): void {
    const at = Date.now();
    this.events.push({ ...e, id: ++this.eventId, at, until: at + (e.kind === 'hint' ? this.hintMs : this.actMs) });
    // Pas d'historique : seuls les tout derniers événements sont gardés, le temps de les afficher.
    if (this.events.length > 6) this.events.splice(0, this.events.length - 6);
  }

  private finish(reason: EndReason): void {
    this.over = { reason, score: reason === 'storms' ? 0 : this.score };
  }

  /** Fin du tour : on passe au suivant, sauf si le dernier tour de table vient de s'achever. */
  private endTurn(by: string): void {
    const done = this.seq;
    this.seq++;
    if (this.over) return;
    if (this.lastRound && by === this.lastRound.lastId && done > this.lastRound.fromSeq) {
      this.finish('deck');
      return;
    }
    this.turn = (this.turn + 1) % this.order.length;
  }

  hint(by: string, target: unknown, hint: Hint | null): string | undefined {
    const err = this.check(by);
    if (err) return err;
    if (!hint) return 'Indice invalide : une couleur ou une valeur.';
    if (typeof target !== 'string' || !this.hands.has(target)) return 'Joueur introuvable.';
    if (target === by) return "On ne se donne pas d'indice à soi-même.";
    if (this.hints <= 0) return 'Plus de jeton indice : il faut jouer ou défausser.';
    const hand = this.hand(target);
    const mask = hand.map((c) => touches(c, hint));
    const know = hand.map((c) => this.knowledge(c.id));
    // La lecture se fait avant que l'indice ne soit appris : la carte en danger est celle d'avant l'indice.
    const reading = readHint(know, mask, hint, this.table);
    hand.forEach((c, i) => {
      const fresh = mask[i] && !know[i].touched;
      learn(know[i], hint, mask[i]);
      if (fresh) excludeDead(know[i], this.table);
    });
    if (reading.focus !== null) {
      const k = know[reading.focus];
      if (reading.kind === 'play') {
        k.mark = 'play';
        k.intent = reading.intent;
      } else if (reading.kind === 'save') k.mark = 'keep';
    }
    this.hints--;
    this.stats.get(by)!.hints++;
    this.event({ kind: 'hint', by, target, hint, cardIds: hand.filter((_, i) => mask[i]).map((c) => c.id) });
    this.endTurn(by);
    return undefined;
  }

  private take(by: string, cardId: unknown): GCard | string {
    const hand = this.hand(by);
    const i = hand.findIndex((c) => c.id === cardId);
    if (i < 0) return "Cette carte n'est pas dans ta main.";
    const [card] = hand.splice(i, 1);
    this.tilted.delete(card.id);
    return card;
  }

  play(by: string, cardId: unknown): string | undefined {
    const err = this.check(by);
    if (err) return err;
    const card = this.take(by, cardId);
    if (typeof card === 'string') return card;
    const stats = this.stats.get(by)!;
    const face = { color: card.color, value: card.value };
    if (isPlayable(card, this.fireworks)) {
      this.fireworks[card.color] = card.value;
      stats.plays++;
      // Une carte désignée vient d'être posée : on ne désigne jamais deux fois la même carte, ses doubles désignés sont autre chose.
      if (this.knowledge(card.id).touched) {
        for (const h of this.hands.values()) {
          for (const c of h) {
            const k = this.knowledge(c.id);
            if (k.touched && !k.not.some((n) => n.color === card.color && n.value === card.value)) k.not.push(face);
          }
        }
      }
      // Un feu complet rend un jeton indice, s'il en manque un.
      const bonus = card.value === 5 && this.hints < MAX_HINTS;
      if (bonus) this.hints++;
      this.event({ kind: 'play', by, card: face, cardId: card.id, success: true, bonus });
      if (this.score === MAX_SCORE) this.finish('perfect');
    } else {
      this.discard.push(card);
      this.storms++;
      stats.storms++;
      this.event({ kind: 'play', by, card: face, cardId: card.id, success: false });
      if (this.storms >= MAX_STORMS) this.finish('storms');
    }
    if (!this.over) this.draw(by);
    this.endTurn(by);
    return undefined;
  }

  discardCard(by: string, cardId: unknown): string | undefined {
    const err = this.check(by);
    if (err) return err;
    if (this.hints >= MAX_HINTS) return 'Les huit jetons indice sont disponibles : on ne peut pas défausser.';
    const card = this.take(by, cardId);
    if (typeof card === 'string') return card;
    this.discard.push(card);
    this.hints++;
    this.stats.get(by)!.discards++;
    this.event({ kind: 'discard', by, card: { color: card.color, value: card.value }, cardId: card.id });
    this.draw(by);
    this.endTurn(by);
    return undefined;
  }

  /** Réordonner sa main : un geste de vraie table, permis à tout moment et visible de tous. */
  arrange(by: string, order: unknown): string | undefined {
    if (this.over) return 'La partie est terminée.';
    const hand = this.hands.get(by);
    if (!hand) return "Tu n'as pas de main.";
    if (!Array.isArray(order) || order.length !== hand.length) return 'Ta main a changé, réessaie.';
    const byId = new Map(hand.map((c) => [c.id, c]));
    const next: GCard[] = [];
    for (const id of order) {
      const c = typeof id === 'string' ? byId.get(id) : undefined;
      if (!c) return 'Ta main a changé, réessaie.';
      byId.delete(id as string);
      next.push(c);
    }
    hand.splice(0, hand.length, ...next);
    return undefined;
  }

  /** Incliner une carte (ou la redresser) pour s'en souvenir, comme on décale une carte dans sa main. */
  tilt(by: string, cardId: unknown): string | undefined {
    if (this.over) return 'La partie est terminée.';
    const card = this.hand(by).find((c) => c.id === cardId);
    if (!card) return "Cette carte n'est pas dans ta main.";
    if (this.tilted.has(card.id)) this.tilted.delete(card.id);
    else this.tilted.add(card.id);
    return undefined;
  }

  /** Les cartes de la défausse, rangées par couleur puis par valeur, comme on les étale sur la table. */
  sortedDiscard(): Card[] {
    return this.discard
      .map((c) => ({ color: c.color, value: c.value }))
      .sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.value - b.value);
  }
}
