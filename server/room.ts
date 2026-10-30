// Une table de Hanabi : salon, partie, minuteries, pilote automatique et vue personnalisée de chacun.
import crypto from 'node:crypto';
import {
  AVATARS,
  MAX_HINTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  THINK_OPTIONS,
  parseHint,
  type CardView,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type ThinkTime,
} from '../shared/protocol';
import { botMove, botView } from './bots';
import type { GCard } from './cards';
import { Game } from './game';

const BOT_NAMES = ['Hoshi', 'Kaede', 'Ren', 'Sora', 'Akari', 'Haru', 'Natsu', 'Mio', 'Tomo', 'Yuki'];
const MAX_MEMBERS = 12;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (HA_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.HA_FAST === '1';
/** Le temps de lire un indice, puis il disparaît : il faut s'en souvenir. */
const HINT_MS = FAST ? 400 : 8_000;
const ACT_MS = FAST ? 300 : 4_500;
/** Le temps de voir la dernière gerbe (ou le dernier orage) avant les résultats. */
const END_MS = FAST ? 120 : 4_200;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { think: 0 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  turnEndsAt = 0;
  turnStartedAt = 0;
  botActAt = 0;
  finishAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa main reste sur la table : le pilote automatique la joue.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if ((THINK_OPTIONS as readonly unknown[]).includes(payload.think)) this.settings.think = payload.think as ThinkTime;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) p.status = 'playing';
    // On s'assoit dans un ordre tiré au sort : le premier de la liste commence.
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, { hintMs: HINT_MS, actMs: ACT_MS });
    this.phase = 'playing';
    this.final = null;
    this.finishAt = 0;
    this.armTurn();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.finishAt = 0;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Plus aucun humain à la table : les bots finissent vite. */
  private onlyBots(): boolean {
    return this.players.every((p) => p.isBot || p.left || p.status !== 'playing');
  }

  /** Prépare le tour du joueur suivant, ou la fin de partie. */
  private armTurn(): void {
    const g = this.game;
    if (!g) return;
    const now = Date.now();
    if (g.over) {
      this.turnEndsAt = 0;
      this.finishAt = now + (this.onlyBots() ? Math.min(END_MS, 1500) : END_MS);
      return;
    }
    this.turnStartedAt = now;
    this.turnEndsAt = FAST ? now + 900 : this.settings.think ? now + this.settings.think * 1000 : 0;
    // Un bot prend le temps qu'on lise ce qui vient de se passer, un peu plus après un indice.
    const last = g.events[g.events.length - 1];
    const afterHint = last?.kind === 'hint' ? 1300 : 0;
    this.botActAt = FAST ? now + 15 : this.onlyBots() ? now + 500 : now + 1700 + afterHint + Math.random() * 1500;
  }

  private check(by: string, seq: unknown): string | undefined {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    if (this.game.over) return 'La partie est terminée.';
    if (seq !== undefined && seq !== this.game.seq) return 'Le tour a changé entre-temps.';
    if (this.game.current !== by) return "Ce n'est pas ton tour.";
    return undefined;
  }

  hint(by: string, target: unknown, hint: unknown, seq?: unknown): string | undefined {
    const err = this.check(by, seq) ?? this.game!.hint(by, target, parseHint(hint));
    if (err) return err;
    this.afterAction(by);
    return undefined;
  }

  play(by: string, cardId: unknown, seq?: unknown): string | undefined {
    const err = this.check(by, seq) ?? this.game!.play(by, cardId);
    if (err) return err;
    this.afterAction(by);
    return undefined;
  }

  discard(by: string, cardId: unknown, seq?: unknown): string | undefined {
    const err = this.check(by, seq) ?? this.game!.discardCard(by, cardId);
    if (err) return err;
    this.afterAction(by);
    return undefined;
  }

  arrange(by: string, order: unknown): string | undefined {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    return this.game.arrange(by, order);
  }

  tilt(by: string, cardId: unknown): string | undefined {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    return this.game.tilt(by, cardId);
  }

  private afterAction(by: string): void {
    const g = this.game!;
    const last = g.events[g.events.length - 1];
    this.botReacts(by, last);
    this.armTurn();
  }

  /** De temps en temps, un bot réagit : jamais rien qui renseigne sur les cartes. */
  private botReacts(by: string, e: Game['events'][number] | undefined): void {
    if (FAST || !e) return;
    const bots = this.players.filter((p) => p.isBot && p.status === 'playing' && p.id !== by);
    if (!bots.length || Math.random() > 0.22) return;
    const bot = bots[crypto.randomInt(bots.length)];
    let pool: string[] = [];
    if (e.kind === 'play' && e.success) pool = e.card?.value === 5 ? ['🎆', 'Bravo !', '👏'] : ['👏', 'Joli coup'];
    else if (e.kind === 'play') pool = ['😮', '😅'];
    else if (e.kind === 'hint' && e.target === bot.id) pool = ['Merci !', '🙏'];
    if (pool.length) this.onEmote(bot.id, pool[crypto.randomInt(pool.length)]);
  }

  private finishGame(): void {
    const g = this.game;
    if (!g?.over) return;
    this.final = {
      reason: g.over.reason,
      score: g.over.score,
      fireworks: { ...g.fireworks },
      players: g.order.map((id) => {
        const p = this.get(id);
        return {
          id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          hand: g.hand(id).map((c) => ({ color: c.color, value: c.value })),
          stats: { ...g.stats.get(id)! },
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries & pilote automatique ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  /** Quand agir pour le joueur dont c'est le tour : bot → délai naturel, absent → fin du délai de grâce, sinon fin du chrono. */
  private dueAt(p: Player | undefined): number {
    if (!p) return Date.now();
    const limit = this.turnEndsAt > 0 ? this.turnEndsAt : Infinity;
    if (p.isBot) return this.botActAt;
    // Un absent : le pilote joue peu après le début du tour (ou après son départ), sans traîner.
    if (this.isAuto(p)) return Math.min(this.botActAt, Math.max(this.turnStartedAt + 1200, p.disconnectedAt + (p.left ? 0 : GRACE_MS)));
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private reschedule(): void {
    this.clearTimer();
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    let due = g.over ? this.finishAt : this.dueAt(this.get(g.current));
    // Un indice affiché doit disparaître des écrans à l'heure dite.
    for (const e of g.events) if (e.until > now) due = Math.min(due, e.until + 5);
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - now, 2_147_000_000)));
  }

  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    if (g.over) {
      if (now >= this.finishAt) this.finishGame();
      return;
    }
    const p = this.get(g.current);
    if (now >= this.dueAt(p)) this.autoPlay(g.current);
  }

  /** Le pilote automatique joue comme un bot : avec la mémoire des indices, sans jamais voir ses propres cartes. */
  autoPlay(id: string): void {
    const g = this.game!;
    const move = botMove(botView(g, id));
    const err = move.type === 'play' ? this.play(id, move.cardId) : move.type === 'discard' ? this.discard(id, move.cardId) : this.hint(id, move.target, move.hint);
    if (!err) return;
    // Filet de sécurité : la partie ne doit jamais se bloquer.
    console.error(`[room ${this.code}] coup refusé (${err})`, move);
    const hand = g.hand(id);
    if (g.hints < MAX_HINTS && hand.length) this.discard(id, hand[hand.length - 1].id);
    else {
      const target = g.order.find((x) => x !== id)!;
      this.hint(id, target, { kind: 'value', value: g.hand(target)[0]?.value ?? 1 });
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  /**
   * Le cœur du jeu : on voit les cartes des autres, jamais les siennes. Un spectateur ne voit aucune face :
   * sinon un joueur pourrait ouvrir un second onglet en spectateur pour regarder sa propre main.
   */
  private cardView(c: GCard, owner: string, viewer: string, g: Game): CardView {
    const visible = viewer !== owner && g.order.includes(viewer);
    const v: CardView = { id: c.id, tilted: g.tilted.has(c.id) };
    if (visible) {
      v.color = c.color;
      v.value = c.value;
    }
    return v;
  }

  private gameView(g: Game): GameView {
    const now = Date.now();
    return {
      order: [...g.order],
      turnId: g.over ? null : g.current,
      turnEndsAt: g.over ? 0 : this.turnEndsAt,
      seq: g.seq,
      hints: g.hints,
      storms: g.storms,
      deck: g.deck.length,
      fireworks: { ...g.fireworks },
      discard: g.sortedDiscard(),
      lastRound: g.lastRound ? { lastId: g.lastRound.lastId } : null,
      events: g.events.filter((e) => e.until > now).map((e) => ({ ...e, cardIds: e.cardIds ? [...e.cardIds] : undefined })),
      ended: g.over ? { ...g.over } : null,
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        hand: g && g.hands.has(p.id) ? g.hand(p.id).map((c) => this.cardView(c, p.id, viewerId, g)) : null,
      })),
      game: g ? this.gameView(g) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
