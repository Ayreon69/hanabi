// Les règles de Hanabi, les secrets de la vue envoyée à chacun, les conventions et la solidité des bots.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLORS, COPIES, MAX_HINTS, handSize, type Card, type Color } from '../shared/protocol';
import { botMove, botView } from '../server/bots';
import { freshKnowledge, readHint } from '../server/cards';
import { Game, fullDeck } from '../server/game';
import { Room, type Player } from '../server/room';

const c = (color: Color, value: number): Card => ({ color, value });
const face = (card: { color: Color; value: number }) => `${card.color}${card.value}`;

/**
 * Une pioche truquée : chaque main est donnée de gauche à droite, puis le reste de la pioche dans l'ordre.
 * Le reste est complété avec les cartes inutilisées, pour garder une boîte de 50 cartes.
 */
function rig(hands: Card[][], top: Card[] = []): Card[] {
  const size = hands[0].length;
  const deal: Card[] = [];
  // On distribue une carte à la fois, et chaque carte piochée arrive à gauche.
  for (let i = 0; i < size; i++) for (const h of hands) deal.push(h[size - 1 - i]);
  const used = [...deal, ...top];
  const rest = fullDeck();
  for (const u of used) rest.splice(rest.findIndex((x) => x.color === u.color && x.value === u.value), 1);
  return [...deal, ...top, ...rest];
}

function game(hands: Card[][], top: Card[] = []): Game {
  return new Game(
    hands.map((_, i) => `p${i}`),
    { deck: rig(hands, top) },
  );
}

const ids = (g: Game, p: string) => g.hand(p).map((x) => x.id);

describe('mise en place', () => {
  it('50 cartes : cinq couleurs, et dans chacune 1,1,1,2,2,3,3,4,4,5', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(50);
    for (const color of COLORS) {
      expect(
        deck
          .filter((x) => x.color === color)
          .map((x) => x.value)
          .sort(),
      ).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    }
    expect(Object.values(COPIES).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('cinq cartes à 2 ou 3 joueurs, quatre à 4 ou 5', () => {
    expect([2, 3, 4, 5].map(handSize)).toEqual([5, 5, 4, 4]);
    for (const n of [2, 3, 4, 5]) {
      const g = new Game(Array.from({ length: n }, (_, i) => `p${i}`));
      for (const id of g.order) expect(g.hand(id)).toHaveLength(handSize(n));
      expect(g.deck).toHaveLength(50 - n * handSize(n));
      expect(g.hints).toBe(8);
      expect(g.storms).toBe(0);
    }
  });

  it('la pioche truquée des tests donne bien les mains voulues', () => {
    const g = game([
      [c('rouge', 1), c('jaune', 2), c('vert', 3), c('bleu', 4), c('blanc', 5)],
      [c('rouge', 2), c('rouge', 3), c('rouge', 4), c('rouge', 5), c('jaune', 1)],
    ]);
    expect(g.hand('p0').map(face)).toEqual(['rouge1', 'jaune2', 'vert3', 'bleu4', 'blanc5']);
    expect(g.hand('p1').map(face)).toEqual(['rouge2', 'rouge3', 'rouge4', 'rouge5', 'jaune1']);
  });
});

const H2 = [
  [c('rouge', 1), c('jaune', 1), c('rouge', 3), c('bleu', 4), c('blanc', 5)],
  [c('rouge', 2), c('vert', 1), c('rouge', 4), c('jaune', 5), c('bleu', 1)],
];

describe('donner un indice', () => {
  it('coûte un jeton et désigne toutes les cartes de la couleur ou de la valeur', () => {
    const g = game(H2);
    expect(g.hint('p0', 'p1', { kind: 'color', color: 'rouge' })).toBeUndefined();
    expect(g.hints).toBe(7);
    const e = g.events.at(-1)!;
    const hand = g.hand('p1');
    expect(e.cardIds).toEqual([hand[0].id, hand[2].id]);
    expect(g.current).toBe('p1');
    expect(g.hint('p1', 'p0', { kind: 'value', value: 1 })).toBeUndefined();
    expect(g.events.at(-1)!.cardIds).toEqual([g.hand('p0')[0].id, g.hand('p0')[1].id]);
  });

  it('peut ne désigner aucune carte (« tu n’as pas de carte verte »), comme le permet le livret', () => {
    const g = game(H2);
    expect(g.hint('p0', 'p1', { kind: 'color', color: 'blanc' })).toBeUndefined();
    expect(g.events.at(-1)!.cardIds).toEqual([]);
    expect(g.hints).toBe(7);
  });

  it('jamais à soi-même, jamais hors de son tour, jamais sans jeton', () => {
    const g = game(H2);
    expect(g.hint('p0', 'p0', { kind: 'value', value: 1 })).toBeTruthy();
    expect(g.hint('p1', 'p0', { kind: 'value', value: 1 })).toBeTruthy();
    expect(g.hint('p0', 'p1', null)).toBeTruthy();
    g.hints = 0;
    expect(g.hint('p0', 'p1', { kind: 'value', value: 1 })).toMatch(/jeton/);
  });
});

describe('défausser', () => {
  it('rend un jeton, pose la carte face visible et fait piocher à gauche', () => {
    const g = game(H2);
    g.hint('p0', 'p1', { kind: 'value', value: 1 });
    const right = g.hand('p1')[4];
    const before = g.deck.length;
    expect(g.discardCard('p1', right.id)).toBeUndefined();
    expect(g.hints).toBe(8);
    expect(g.discard.map(face)).toEqual(['bleu1']);
    expect(g.deck.length).toBe(before - 1);
    expect(g.hand('p1')).toHaveLength(5);
    expect(g.hand('p1').some((x) => x.id === right.id)).toBe(false);
  });

  it('interdit quand les huit jetons sont disponibles', () => {
    const g = game(H2);
    expect(g.hints).toBe(MAX_HINTS);
    expect(g.discardCard('p0', g.hand('p0')[0].id)).toMatch(/huit/);
  });
});

describe('jouer une carte', () => {
  it('prolonge son feu d’artifice, sinon orage et défausse', () => {
    const g = game(H2);
    expect(g.play('p0', g.hand('p0')[0].id)).toBeUndefined();
    expect(g.fireworks.rouge).toBe(1);
    expect(g.events.at(-1)).toMatchObject({ kind: 'play', success: true, card: { color: 'rouge', value: 1 } });
    // Un 4 bleu sur un feu bleu vide : orage.
    const blue4 = g.hand('p1')[2];
    expect(face(blue4)).toBe('rouge4');
    expect(g.play('p1', blue4.id)).toBeUndefined();
    expect(g.storms).toBe(1);
    expect(g.discard.map(face)).toEqual(['rouge4']);
    expect(g.events.at(-1)).toMatchObject({ success: false });
  });

  it('compléter un feu avec le 5 rend un jeton, sauf s’ils sont déjà tous là', () => {
    const g = game(H2);
    g.fireworks.blanc = 4;
    g.hints = 5;
    g.play('p0', g.hand('p0')[4].id);
    expect(g.fireworks.blanc).toBe(5);
    expect(g.hints).toBe(6);
    g.fireworks.jaune = 4;
    g.hints = 8;
    g.play('p1', g.hand('p1')[3].id);
    expect(g.fireworks.jaune).toBe(5);
    expect(g.hints).toBe(8);
  });

  it('le troisième orage arrête tout : partie perdue, 0 point', () => {
    const g = game(H2);
    g.fireworks.rouge = 1;
    g.storms = 2;
    g.play('p0', g.hand('p0')[4].id);
    expect(g.over).toEqual({ reason: 'storms', score: 0 });
    expect(g.play('p1', g.hand('p1')[0].id)).toBeTruthy();
  });

  it('25 points : la partie s’arrête sur un feu d’artifice parfait', () => {
    const g = game(H2);
    g.fireworks = { rouge: 5, jaune: 5, vert: 5, bleu: 5, blanc: 4 };
    g.play('p0', g.hand('p0')[4].id);
    expect(g.over).toEqual({ reason: 'perfect', score: 25 });
  });
});

describe('fin de pioche', () => {
  it('chacun joue encore une fois, et celui qui a pioché la dernière carte joue le dernier', () => {
    const g = new Game(['a', 'b', 'c']);
    g.hints = 0;
    // On vide la pioche jusqu'à une carte.
    g.deck.splice(0, g.deck.length - 1);
    expect(g.current).toBe('a');
    g.discardCard('a', g.hand('a')[0].id);
    expect(g.deck).toHaveLength(0);
    expect(g.lastRound?.lastId).toBe('a');
    const turns: string[] = [];
    while (!g.over) {
      turns.push(g.current);
      g.hints = 5;
      g.hint(g.current, g.order.find((x) => x !== g.current)!, { kind: 'value', value: 1 });
    }
    expect(turns).toEqual(['b', 'c', 'a']);
    expect(g.over!.reason).toBe('deck');
    expect(g.hand('b')).toHaveLength(5);
  });

  it('le score est la somme des plus hautes cartes posées', () => {
    const g = new Game(['a', 'b']);
    g.fireworks = { rouge: 4, jaune: 2, vert: 0, bleu: 1, blanc: 5 };
    expect(g.score).toBe(12);
  });
});

describe('gestes de vraie table', () => {
  it('réordonner sa main, à tout moment, et refuser une main qui ne correspond pas', () => {
    const g = game(H2);
    const order = ids(g, 'p1').reverse();
    expect(g.arrange('p1', order)).toBeUndefined();
    expect(ids(g, 'p1')).toEqual(order);
    expect(g.arrange('p1', order.slice(1))).toBeTruthy();
    expect(g.arrange('p1', [...order.slice(1), order[1]])).toBeTruthy();
    expect(g.arrange('p1', [...order.slice(1), 'inconnue'])).toBeTruthy();
  });

  it('incliner une carte, la redresser, et l’oublier quand elle quitte la main', () => {
    const g = game(H2);
    const card = g.hand('p0')[0];
    g.tilt('p0', card.id);
    expect(g.tilted.has(card.id)).toBe(true);
    g.tilt('p0', card.id);
    expect(g.tilted.has(card.id)).toBe(false);
    g.tilt('p0', card.id);
    g.play('p0', card.id);
    expect(g.tilted.has(card.id)).toBe(false);
    expect(g.tilt('p1', card.id)).toBeTruthy();
  });
});

describe('conventions des bots', () => {
  const t = { fireworks: { rouge: 0, jaune: 0, vert: 0, bleu: 0, blanc: 0 }, discard: [] as Card[] };
  const fresh = (n: number) => Array.from({ length: n }, freshKnowledge);

  it('un 5 sur la carte en danger est une sauvegarde : on le garde', () => {
    const r = readHint(fresh(5), [false, false, false, false, true], { kind: 'value', value: 5 }, t);
    expect(r).toMatchObject({ focus: 4, kind: 'save' });
  });

  it('un indice de jeu vise la carte la plus à gauche parmi les nouvelles', () => {
    const r = readHint(fresh(5), [false, true, true, false, false], { kind: 'value', value: 1 }, t);
    expect(r.focus).toBe(1);
    expect(r.kind).toBe('play');
    expect(r.intent).toHaveLength(5);
  });

  it('une carte en danger qui pourrait être critique est gardée, pas jouée', () => {
    // Le dernier 3 rouge est défaussé ailleurs : un indice « rouge » sur la carte en danger la sauve.
    const r = readHint(fresh(5), [false, false, false, false, true], { kind: 'color', color: 'rouge' }, { ...t, discard: [c('rouge', 3)] });
    expect(r.kind).toBe('save');
  });
});

/** Joue une partie complète entre bots, en vérifiant qu'ils ne voient jamais leurs propres cartes. */
function botGame(n: number): Game {
  const g = new Game(Array.from({ length: n }, (_, i) => `b${i}`));
  for (let i = 0; i < 400 && !g.over; i++) {
    const me = g.current;
    const v = botView(g, me);
    expect(JSON.stringify(v.myHand)).not.toMatch(/color|value/);
    const m = botMove(v);
    const err = m.type === 'play' ? g.play(me, m.cardId) : m.type === 'discard' ? g.discardCard(me, m.cardId) : g.hint(me, m.target, m.hint);
    expect(err).toBeUndefined();
  }
  expect(g.over).not.toBeNull();
  return g;
}

describe('les bots', () => {
  it.each([2, 3, 4, 5])('finissent toujours la partie à %i joueurs, avec de bons scores', (n) => {
    const games = 60;
    let total = 0;
    let lost = 0;
    for (let i = 0; i < games; i++) {
      const g = botGame(n);
      total += g.over!.score;
      if (g.over!.reason === 'storms') lost++;
    }
    expect(total / games).toBeGreaterThan(17);
    expect(lost).toBeLessThanOrEqual(3);
  });

  it('ne se fient qu’à leur mémoire des indices : une carte promise est jouée', () => {
    const g = game(H2);
    // p0 désigne le 1 vert de p1 (seul 1 vert) : p1 doit le jouer.
    g.hint('p0', 'p1', { kind: 'color', color: 'vert' });
    const m = botMove(botView(g, 'p1'));
    expect(m).toEqual({ type: 'play', cardId: g.hand('p1')[1].id });
  });

  it('sauvent le 5 en danger du joueur suivant', () => {
    const g = game([
      [c('vert', 2), c('vert', 3), c('jaune', 3), c('jaune', 4), c('bleu', 2)],
      [c('vert', 4), c('jaune', 2), c('bleu', 3), c('bleu', 4), c('blanc', 5)],
    ]);
    g.hints = 7;
    const m = botMove(botView(g, 'p0'));
    expect(m).toMatchObject({ type: 'hint', target: 'p1' });
    if (m.type !== 'hint') return;
    // L'indice désigne bien le 5 blanc, à droite.
    const touched = g.hand('p1').filter((x) => (m.hint.kind === 'color' ? x.color === m.hint.color : x.value === m.hint.value));
    expect(touched.map(face)).toContain('blanc5');
  });
});

describe('table', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function table(humans: number, bots = 0) {
    const room = new Room('TEST');
    const players = Array.from({ length: humans }, (_, i) => {
      const p = room.addHuman(`Joueur ${i}`, 'lanterne') as Player;
      p.connected = true;
      return p;
    });
    room.hostId = players[0].id;
    for (let i = 0; i < bots; i++) room.addBot(players[0].id);
    return { room, players };
  }

  /** Fait tourner la table : le pilote joue pour tout le monde dès que le chrono le permet. */
  function playOut(room: Room, audit?: (r: Room) => void) {
    for (let i = 0; i < 3000 && room.phase === 'playing'; i++) {
      audit?.(room);
      const g = room.game!;
      if (!g.over) room.autoPlay(g.current);
      room.commit();
      vi.advanceTimersByTime(500);
    }
    vi.advanceTimersByTime(10_000);
    expect(room.phase).toBe('finished');
  }

  it('seul l’hôte lance, pas tout seul, et pas à six', () => {
    const { room, players } = table(2);
    expect(room.start(players[1].id)).toBeTruthy();
    const solo = table(1).room;
    expect(solo.start(solo.hostId)).toMatch(/au moins 2/);
    const full = table(1, 4);
    expect(full.room.addBot(full.players[0].id)).toMatch(/complète/);
    expect(full.room.addHuman('Tard', 'lune')).toMatch(/complète/);
    expect(room.start(players[0].id)).toBeUndefined();
    expect(room.phase).toBe('playing');
  });

  it('chacun voit les cartes des autres, jamais les siennes', () => {
    const { room, players } = table(3);
    room.start(players[0].id);
    for (const viewer of players) {
      const v = room.viewFor(viewer.id);
      for (const p of v.players) {
        expect(p.hand).toHaveLength(5);
        for (const card of p.hand!) {
          if (p.id === viewer.id) {
            expect(card.color).toBeUndefined();
            expect(card.value).toBeUndefined();
          } else {
            expect(COLORS).toContain(card.color);
            expect(card.value).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('ni la pioche ni la mémoire des indices ne sortent du serveur', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const g = room.game!;
    room.hint(g.current, g.order.find((x) => x !== g.current), { kind: 'value', value: 1 });
    for (const p of players) {
      const v = room.viewFor(p.id);
      const json = JSON.stringify(v);
      for (const word of ['"touched"', '"mark"', '"intent"', '"colors"', '"values"', '"not"', 'deck":[']) expect(json).not.toContain(word);
      // Les seules faces envoyées : la main de l'autre, et rien d'autre (pas de défausse ni de feu encore).
      const faces = json.match(/"color":"/g)?.length ?? 0;
      expect(faces).toBe(5);
    }
  });

  it('un spectateur ne voit aucune carte : il pourrait être un joueur dans un second onglet', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const spy = room.addHuman('Curieux', 'lune') as Player;
    expect(spy.status).toBe('spectator');
    const v = room.viewFor(spy.id);
    for (const p of v.players) for (const card of p.hand ?? []) expect(card.color).toBeUndefined();
  });

  it('un indice s’affiche sur le moment, puis disparaît de la vue de tous', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const g = room.game!;
    const target = g.order.find((x) => x !== g.current)!;
    expect(room.hint(g.current, target, { kind: 'value', value: 3 })).toBeUndefined();
    room.commit();
    const shown = room.viewFor(target).game!.events;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: 'hint', target, hint: { kind: 'value', value: 3 } });
    vi.advanceTimersByTime(9_000);
    for (const p of players) expect(room.viewFor(p.id).game!.events).toHaveLength(0);
  });

  it('la défausse est rangée par couleur et valeur : elle ne raconte pas l’ordre de la partie', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const g = room.game!;
    g.discard.push({ id: 'x', color: 'blanc', value: 2 }, { id: 'y', color: 'rouge', value: 4 }, { id: 'z', color: 'rouge', value: 1 });
    expect(room.viewFor(players[0].id).game!.discard.map(face)).toEqual(['rouge1', 'rouge4', 'blanc2']);
  });

  it('refuse une action envoyée pour un tour déjà passé', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const g = room.game!;
    const seq = g.seq;
    const first = g.current;
    const other = g.order.find((x) => x !== first)!;
    room.hint(first, other, { kind: 'value', value: 1 }, seq);
    expect(room.hint(other, first, { kind: 'value', value: 1 }, seq)).toMatch(/changé/);
  });

  it('les gestes se voient : main réordonnée et carte inclinée', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const [a, b] = players;
    const mine = room.viewFor(a.id).players.find((p) => p.id === a.id)!.hand!.map((x) => x.id);
    room.arrange(a.id, [...mine].reverse());
    room.tilt(a.id, mine[0]);
    const seen = room.viewFor(b.id).players.find((p) => p.id === a.id)!.hand!;
    expect(seen.map((x) => x.id)).toEqual([...mine].reverse());
    expect(seen.at(-1)!.tilted).toBe(true);
  });

  it.each([2, 3, 5])('joue une partie complète à %i joueurs et révèle toutes les mains à la fin', (n) => {
    const { room, players } = table(1, n - 1);
    room.start(players[0].id);
    playOut(room, (r) => {
      const v = r.viewFor(players[0].id);
      const me = v.players.find((p) => p.id === players[0].id)!;
      for (const card of me.hand ?? []) expect(card.color).toBeUndefined();
    });
    const final = room.viewFor(players[0].id).final!;
    expect(final.players).toHaveLength(n);
    expect(final.score).toBeGreaterThanOrEqual(0);
    expect(final.players.find((p) => p.id === players[0].id)!.hand.length).toBeGreaterThan(0);
  });

  it('un joueur parti est remplacé par le pilote automatique', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    room.leave(players[1].id);
    expect(room.hostId).toBe(players[0].id);
    const g = room.game!;
    if (g.current === players[0].id) room.autoPlay(players[0].id);
    const seq = g.seq;
    room.commit();
    vi.advanceTimersByTime(4_000);
    expect(g.seq).toBe(seq + 1);
  });

  it('le temps de réflexion écoulé fait jouer le pilote automatique', () => {
    const { room, players } = table(2);
    room.updateSettings(players[0].id, { think: 45 });
    room.start(players[0].id);
    const g = room.game!;
    room.commit();
    vi.advanceTimersByTime(44_000);
    expect(g.seq).toBe(0);
    vi.advanceTimersByTime(2_000);
    expect(g.seq).toBe(1);
  });

  it('sans limite de temps, personne ne joue à la place d’un joueur présent', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    room.commit();
    vi.advanceTimersByTime(10 * 60_000);
    expect(room.game!.seq).toBe(0);
  });

  it('retourne au salon pour une revanche', () => {
    const { room, players } = table(1, 1);
    room.start(players[0].id);
    playOut(room);
    room.restart(players[0].id);
    expect(room.phase).toBe('lobby');
    expect(room.viewFor(players[0].id).players.every((p) => p.hand === null)).toBe(true);
    expect(room.start(players[0].id)).toBeUndefined();
  });
});
