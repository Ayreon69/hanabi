// Cerveau des bots : des conventions simples et cohérentes, appliquées avec la seule information légitime.
// Un bot voit les mains des autres, la table, et se souvient de tous les indices donnés. Jamais ses propres cartes.
import { COLORS, MAX_HINTS, VALUES, touches, type Card, type Color, type Fireworks, type Hint } from '../shared/protocol';
import { candidates, chopIndex, cloneKnowledge, isCritical, isDead, isPlayable, learn, readHint, same, type Candidate, type GCard, type Knowledge, type PublicTable } from './cards';
import type { Game } from './game';

/** Tout ce que sait un bot. Sa main n'est qu'une liste d'identifiants : il ne peut pas tricher. */
export interface BotView {
  me: string;
  myHand: string[];
  /** Les autres joueurs, dans l'ordre où ils joueront après moi. */
  others: { id: string; hand: GCard[]; turnsLeft: boolean }[];
  know: (cardId: string) => Knowledge;
  fireworks: Fireworks;
  discard: Card[];
  hints: number;
  storms: number;
  deck: number;
}

export type BotMove = { type: 'play'; cardId: string } | { type: 'discard'; cardId: string } | { type: 'hint'; target: string; hint: Hint };

/** Construit la vue d'un joueur à partir de la partie : ses cartes y figurent sans leur face. */
export function botView(game: Game, me: string): BotView {
  const n = game.order.length;
  const start = game.order.indexOf(me);
  const others: BotView['others'] = [];
  for (let i = 1; i < n; i++) {
    const id = game.order[(start + i) % n];
    // Au dernier tour de table, un joueur qui a déjà joué sa dernière fois ne profitera plus d'un indice.
    let turnsLeft = true;
    if (game.lastRound) {
      const last = game.order.indexOf(game.lastRound.lastId);
      const dist = (last - start + n) % n;
      turnsLeft = dist === 0 ? false : i <= dist;
    }
    others.push({ id, hand: game.hand(id).map((c) => ({ ...c })), turnsLeft });
  }
  return {
    me,
    myHand: game.hand(me).map((c) => c.id),
    others,
    know: (id) => game.knowledge(id),
    fireworks: { ...game.fireworks },
    discard: game.discard.map((c) => ({ color: c.color, value: c.value })),
    hints: game.hints,
    storms: game.storms,
    deck: game.deck.length,
  };
}

const HINTS: Hint[] = [...COLORS.map((color): Hint => ({ kind: 'color', color })), ...VALUES.map((value): Hint => ({ kind: 'value', value }))];

interface Mine {
  id: string;
  index: number;
  know: Knowledge;
  cands: Candidate[];
  /** Chance d'être jouable, d'après les exemplaires restants. */
  pPlay: number;
  pDead: number;
}

function share(cands: Candidate[], test: (c: Card) => boolean): number {
  const total = cands.reduce((n, c) => n + c.weight, 0);
  if (!total) return 0;
  return cands.filter((c) => test(c.card)).reduce((n, c) => n + c.weight, 0) / total;
}

/** Ce que je peux savoir de chacune de mes cartes : indices, cartes vues ailleurs, et promesse d'un indice de jeu. */
function myCards(v: BotView, t: PublicTable): Mine[] {
  const seen: Card[] = v.others.flatMap((o) => o.hand);
  return v.myHand.map((id, index) => {
    const know = v.know(id);
    let cands = candidates(know, t, seen);
    // Seule hypothèse admise : un indice de jeu promet une carte jouable au moment où il est donné.
    if (know.mark === 'play' && know.intent) {
      const promised = cands.filter((c) => know.intent!.some((i) => same(i, c.card)));
      if (promised.length) cands = promised;
    }
    return { id, index, know, cands, pPlay: share(cands, (c) => isPlayable(c, t.fireworks)), pDead: share(cands, (c) => isDead(c, t)) };
  });
}

/** Les cartes dont quelqu'un connaît déjà l'existence : désignées par un indice dans une main, ou certaines dans la mienne. */
function cluedCards(v: BotView, mine: Mine[]): Card[] {
  const list: Card[] = [];
  for (const o of v.others) for (const c of o.hand) if (v.know(c.id).touched) list.push(c);
  for (const m of mine) if (m.know.touched && m.cands.length === 1) list.push(m.cands[0].card);
  return list;
}

interface Scored {
  target: string;
  hint: Hint;
  score: number;
  saves: boolean;
}

/** Note un indice en simulant la lecture qu'en fera celui qui le reçoit. */
function scoreHint(v: BotView, t: PublicTable, o: BotView['others'][number], hint: Hint, clued: Card[], rank: number, mine: Mine[]): Scored | null {
  const hand = o.hand;
  // Une de mes cartes désignées pourrait être ce double : je ne le vois pas, mais je m'en méfie.
  const ownDoubt = (c: Card) => Math.max(0, ...mine.filter((m) => m.know.touched).map((m) => share(m.cands, (x) => same(x, c))));
  const mask = hand.map((c) => touches(c, hint));
  if (!mask.some(Boolean)) return null;
  const know = hand.map((c) => v.know(c.id));
  const reading = readHint(know, mask, hint, t);
  const focus = reading.focus === null ? null : hand[reading.focus];
  let score = 0;
  let saves = false;
  if (focus && reading.kind === 'play') {
    // Un indice mal compris ferait exploser un orage : interdit.
    if (!isPlayable(focus, t.fireworks)) return { target: o.id, hint, score: -100, saves };
    score += 10 + (5 - focus.value) * 0.3;
    if (focus.value === 5) score += 1.5;
  } else if (focus && reading.kind === 'save') {
    saves = isCritical(focus, t);
    score += saves ? 6 : 0.5;
  }
  const counted: Card[] = [...clued];
  let forbidden = false;
  hand.forEach((c, i) => {
    if (!mask[i]) return;
    const after = cloneKnowledge(know[i]);
    learn(after, hint, true);
    const cands = candidates(after, t).map((x) => x.card);
    const before = candidates(know[i], t).map((x) => x.card);
    // Compléter ce qu'il sait : une carte désignée devient sûre à jouer, ou sûrement inutile.
    if (i !== reading.focus && cands.length && cands.every((x) => isPlayable(x, t.fireworks)) && !before.every((x) => isPlayable(x, t.fireworks))) {
      if (isPlayable(c, t.fireworks)) score += 8.5;
      else forbidden = true;
    } else if (know[i].touched && cands.length && cands.every((x) => isDead(x, t)) && !before.every((x) => isDead(x, t))) score += 1.5;
    if (know[i].touched) return;
    // Bonne désignation : jamais une carte inutile, jamais le double d'une carte déjà désignée.
    if (isDead(c, t) || counted.some((x) => same(x, c))) forbidden = true;
    score -= ownDoubt(c) * 6;
    if (i !== reading.focus) score += isCritical(c, t) ? 2 : 1.2;
    counted.push(c);
  });
  if (forbidden) return { target: o.id, hint, score: -100, saves };
  if (score === 0) return null;
  if (!o.turnsLeft) score -= 30;
  score -= rank * 0.25;
  return { target: o.id, hint, score, saves };
}

/** A-t-il déjà de quoi faire, d'après ce que tout le monde sait de sa main ? */
function hasPlannedPlay(v: BotView, t: PublicTable, hand: GCard[]): boolean {
  return hand.some((c) => {
    const k = v.know(c.id);
    if (k.mark === 'play') return true;
    const cands = candidates(k, t);
    return cands.length > 0 && cands.every((x) => isPlayable(x.card, t.fireworks));
  });
}

function pick<T>(list: T[], score: (x: T) => number): T | undefined {
  let best: T | undefined;
  let top = -Infinity;
  for (const x of list) {
    const s = score(x);
    if (s > top) {
      top = s;
      best = x;
    }
  }
  return best;
}

export function botMove(v: BotView): BotMove {
  const t: PublicTable = { fireworks: v.fireworks, discard: v.discard };
  const mine = myCards(v, t);
  const careful = v.storms >= 2;

  // 1. Une carte sûre : on la joue. D'abord celles qu'un indice a promises, puis les plus basses.
  const sure = mine.filter((m) => m.cands.length > 0 && m.pPlay === 1);
  if (sure.length) {
    const best = pick(sure, (m) => (m.know.mark === 'play' ? 2 : 0) - Math.max(...m.cands.map((c) => c.card.value)) * 0.1)!;
    return { type: 'play', cardId: best.id };
  }
  // 2. Une carte promise par un indice de jeu, même si un doute s'est glissé depuis.
  const promised = mine.filter((m) => m.know.mark === 'play' && m.pPlay >= (careful ? 0.99 : 0.5));
  if (promised.length) return { type: 'play', cardId: pick(promised, (m) => m.pPlay)!.id };

  const clued = cluedCards(v, mine);
  const options: Scored[] = [];
  if (v.hints > 0) {
    v.others.forEach((o, rank) => {
      for (const h of HINTS) {
        const s = scoreHint(v, t, o, h, clued, rank, mine);
        if (s) options.push(s);
      }
    });
  }

  // 3. Sauver la carte en danger du joueur suivant s'il risque de la défausser.
  const next = v.others[0];
  if (next && v.hints > 0 && next.turnsLeft) {
    const nk = next.hand.map((c) => v.know(c.id));
    const chop = chopIndex(nk);
    if (chop >= 0) {
      const card = next.hand[chop];
      const danger = isCritical(card, t) && !isPlayable(card, t.fireworks);
      if (danger && !hasPlannedPlay(v, t, next.hand)) {
        const save = pick(
          options.filter((o) => o.target === next.id && o.saves),
          (o) => o.score,
        );
        if (save) return { type: 'hint', target: save.target, hint: save.hint };
      }
    }
  }

  const best = pick(options, (o) => o.score);
  // 4. Un bon indice de jeu ou une sauvegarde.
  if (best && best.score >= 6) return { type: 'hint', target: best.target, hint: best.hint };

  const lastTurns = v.deck === 0;
  // 5. En fin de partie, plus rien à gagner à défausser : on tente la carte la plus prometteuse.
  if (lastTurns && !careful) {
    const gamble = pick(
      mine.filter((m) => m.pPlay >= 0.4),
      (m) => m.pPlay,
    );
    if (gamble) return { type: 'play', cardId: gamble.id };
  }
  // 6. Beaucoup de jetons : un indice même modeste vaut mieux qu'une défausse.
  if (best && best.score >= 1 && v.hints >= 5) return { type: 'hint', target: best.target, hint: best.hint };

  if (v.hints < MAX_HINTS) {
    // 7. Défausser : une carte sûrement inutile, sinon la carte en danger, sinon la moins précieuse.
    const trash = mine.find((m) => m.cands.length > 0 && m.pDead === 1);
    if (trash) return { type: 'discard', cardId: trash.id };
    const chop = chopIndex(mine.map((m) => m.know));
    if (chop >= 0) return { type: 'discard', cardId: mine[chop].id };
    const least = pick(
      mine.filter((m) => m.know.mark !== 'play'),
      (m) => m.pDead - share(m.cands, (c) => isCritical(c, t)) - m.index * 0.01,
    );
    return { type: 'discard', cardId: (least ?? mine[mine.length - 1]).id };
  }

  // 8. Huit jetons : il faut donner un indice. Le meilleur qui ne fait jouer personne à tort.
  const safe = options.filter((o) => o.score > -50);
  const fallback = pick(safe, (o) => o.score);
  if (fallback) return { type: 'hint', target: fallback.target, hint: fallback.hint };
  // Aucun indice sans danger : un indice qui ne désigne rien, permis par la règle.
  const target = v.others[0];
  const present = new Set<Color>(target.hand.map((c) => c.color));
  const absent = COLORS.find((c) => !present.has(c));
  if (absent) return { type: 'hint', target: target.id, hint: { kind: 'color', color: absent } };
  const values = new Set(target.hand.map((c) => c.value));
  const value = VALUES.find((x) => !values.has(x));
  if (value) return { type: 'hint', target: target.id, hint: { kind: 'value', value } };
  return { type: 'hint', target: target.id, hint: { kind: 'color', color: target.hand[0].color } };
}
