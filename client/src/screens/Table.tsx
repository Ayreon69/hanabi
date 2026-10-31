// La table : le ciel et ses feux en haut, les mains des partenaires au milieu, la tienne en bas.
import { motion } from 'framer-motion';
import { BookOpen, Flag, LogOut, MoreHorizontal, Smile, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { EMOTES, TAUNTS, type Card, type GameEvent, type GameView, type RoomView } from '../../../shared/protocol';
import { Deck, DiscardModal, DiscardStrip, FireworksRow, Tokens } from '../components/Board';
import { PlayingCard } from '../components/Cards';
import { MyHand, OtherHand, type Chip } from '../components/Hands';
import { HintSheet } from '../components/HintSheet';
import { firework, storm } from '../components/Sky';
import { Button, Logo, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { eventText, nameOf } from '../lib/text';
import { cls, reducedMotion, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

function TurnTimer({ endsAt, think }: { endsAt: number; think: number }) {
  const now = useTick(250);
  if (!endsAt || !think) return null;
  const left = Math.max(0, endsAt - now);
  return (
    <span className="turn-timer" role="timer" aria-label={`${Math.ceil(left / 1000)} secondes`}>
      <span style={{ width: `${Math.min(100, (left / (think * 1000)) * 100)}%` }} />
    </span>
  );
}

/** Les indices en cours d'affichage : la pastille de chaque carte désignée, le temps de l'indice. */
function useChips(g: GameView, now: number): Map<string, Chip> {
  return useMemo(() => {
    const chips = new Map<string, Chip>();
    const latest = new Map<string, GameEvent>();
    for (const e of g.events) if (e.kind === 'hint' && e.until > now && e.target) latest.set(e.target, e);
    for (const e of latest.values()) {
      for (const id of e.cardIds ?? []) chips.set(id, e.hint!.kind === 'color' ? { kind: 'color', color: e.hint!.color } : { kind: 'value', value: e.hint!.value });
    }
    return chips;
  }, [g.events, now]);
}

interface Flight {
  id: number;
  card: Card;
  from: DOMRect;
  to: DOMRect;
}

/**
 * Sons, vibrations, ciel et cartes qui volent : tout se déduit des événements reçus.
 * Les positions des cartes sont notées après chaque rendu : la carte jouée a déjà quitté la main quand l'événement arrive.
 */
function useTableEffects(view: RoomView, setFlights: (f: (x: Flight[]) => Flight[]) => void) {
  const g = view.game!;
  const rects = useRef(new Map<string, DOMRect>());
  const seen = useRef<number>(-1);
  const turn = useRef<string | null>(null);
  const started = useRef(false);

  // D'abord traiter les événements, avec les positions d'avant…
  useLayoutEffect(() => {
    const fresh = g.events.filter((e) => e.id > seen.current);
    const first = seen.current < 0;
    if (g.events.length) seen.current = Math.max(seen.current, ...g.events.map((e) => e.id));
    else if (first) seen.current = 0;
    if (!started.current) {
      started.current = true;
      if (g.seq === 0) sfx.taiko();
    }
    for (const e of fresh) {
      // Un événement déjà ancien à l'arrivée (reconnexion) ne rejoue pas le spectacle.
      if (first && view.serverNow - e.at > 1500) continue;
      if (e.kind === 'hint') {
        sfx.chime();
        if (e.target === view.me) vibrate([20, 60, 20]);
        continue;
      }
      if (!e.card) continue;
      const card = e.card;
      const from = e.cardId ? rects.current.get(e.cardId) : undefined;
      const slot = e.success ? document.querySelector(`[data-slot="${card.color}"]`) : document.querySelector('[data-discard]');
      const to = slot?.getBoundingClientRect();
      const fly = !reducedMotion() && from && to;
      if (fly) {
        setFlights((x) => [...x, { id: e.id, card, from, to }]);
        // La carte se pose, puis disparaît : rien n'attend la fin de son vol.
        window.setTimeout(() => setFlights((x) => x.filter((f) => f.id !== e.id)), 640);
      }
      const land = fly ? 480 : 0;
      if (e.kind === 'discard') {
        sfx.paper();
        continue;
      }
      if (e.success) {
        sfx.launch();
        window.setTimeout(() => {
          const r = document.querySelector(`[data-slot="${card.color}"]`)?.getBoundingClientRect();
          if (r) {
            // Sur téléphone, les feux sont collés en haut de l'écran : la gerbe éclate alors sous eux, sinon elle sortirait du cadre.
            const x = r.left + r.width / 2;
            const sky = r.top - 40 >= 120;
            firework(x, sky ? r.top - 40 : r.bottom + 90, card.color, { big: card.value === 5, from: sky ? { x, y: r.top + r.height / 2 } : undefined });
          }
          sfx.burst(card.value === 5);
          if (e.by === view.me) vibrate(25);
        }, land);
      } else {
        window.setTimeout(() => {
          storm();
          sfx.thunder();
          vibrate([90, 60, 140]);
        }, land);
      }
    }
  });

  // …puis noter les positions actuelles pour le prochain coup.
  useLayoutEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) rects.current.set(el.dataset.card!, el.getBoundingClientRect());
  });

  useEffect(() => {
    const t = g.turnId;
    if (t === view.me && turn.current !== view.me && !g.ended) {
      sfx.turn();
      vibrate(30);
    }
    turn.current = t;
  }, [g.turnId, g.ended, view.me]);
}

function Flights({ flights }: { flights: Flight[] }) {
  return (
    <div className="flights" aria-hidden>
      {flights.map((f) => (
        <motion.div
          key={f.id}
          className="flight"
          style={{ width: f.from.width, height: f.from.height }}
          initial={{ x: f.from.left, y: f.from.top, rotateY: 180, scale: 1 }}
          animate={{ x: f.to.left + (f.to.width - f.from.width) / 2, y: f.to.top + (f.to.height - f.from.height) / 2, rotateY: 0, scale: Math.min(1, f.to.height / f.from.height) }}
          transition={{ duration: 0.48, ease: [0.3, 0.7, 0.4, 1] }}
        >
          <PlayingCard color={f.card.color} value={f.card.value} size="md" className="flight-card" style={{ '--cw': `${f.from.width}px` } as CSSProperties} />
        </motion.div>
      ))}
    </div>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: 8 }} animate={{ y: 0 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Le bandeau : ce qui vient de se passer, le temps de le lire, sinon à qui c'est le tour.
 * Pendant qu'un événement s'affiche, une pastille rappelle toujours qui joue.
 */
function Ribbon({ view, now }: { view: RoomView; now: number }) {
  const g = view.game!;
  const live = g.events.filter((e) => e.until > now);
  const e = live[live.length - 1];
  const status = statusLine(view);
  const myTurn = g.turnId === view.me && !g.ended;
  const turnName = myTurn ? 'à toi' : g.turnId ? nameOf(view, g.turnId) : '';
  if (!e) {
    return (
      <div className={cls('ribbon', status.mine && 'is-mine')} role="status" aria-live="polite">
        <span className="ribbon-text">{status.text}</span>
        {myTurn && <TurnTimer endsAt={g.turnEndsAt} think={view.settings.think} />}
      </div>
    );
  }
  const toMe = e.kind === 'hint' && e.target === view.me;
  const tone = e.kind === 'hint' ? 'hint' : e.kind === 'discard' ? 'discard' : e.success ? 'good' : 'bad';
  return (
    <motion.div key={e.id} className={cls('ribbon', 'is-event', `is-${tone}`, toMe && 'is-me')} role="status" aria-live="polite" initial={{ y: -4 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
      {e.card && <PlayingCard color={e.card.color} value={e.card.value} size="xs" aria-hidden />}
      <span className="ribbon-text">{eventText(view, e)}</span>
      {turnName && !g.ended && <span className={cls('ribbon-turn', myTurn && 'is-mine')}>{myTurn ? 'À toi' : turnName}</span>}
      {myTurn && <TurnTimer endsAt={g.turnEndsAt} think={view.settings.think} />}
    </motion.div>
  );
}

function statusLine(view: RoomView): { text: string; mine: boolean } {
  const g = view.game!;
  const me = view.me;
  if (g.ended) {
    if (g.ended.reason === 'storms') return { text: 'Troisième orage… la fête est finie.', mine: false };
    if (g.ended.reason === 'perfect') return { text: 'Les cinq feux sont complets !', mine: false };
    return { text: 'Le dernier tour est joué : le spectacle s’achève.', mine: false };
  }
  if (g.turnId === me) {
    if (g.hints === 0) return { text: 'À toi ! Plus de jeton indice : joue ou défausse.', mine: true };
    if (g.hints >= 8) return { text: 'À toi ! Huit jetons : donne un indice ou joue.', mine: true };
    return { text: 'À toi ! Donne un indice, joue ou défausse.', mine: true };
  }
  const p = view.players.find((x) => x.id === g.turnId);
  return { text: `Au tour de ${p?.name ?? '?'}${p?.autopilot ? ' (pilote automatique)' : ''}`, mine: false };
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const now = useTick(300);
  const g = view.game!;
  useTableEffects(view, setFlights);
  const chips = useChips(g, now);

  const closeHint = useCallback(() => setHintFor(null), []);

  const me = view.players.find((p) => p.id === view.me);
  const seated = g.order.includes(view.me);
  const n = g.order.length;
  // On tourne la table : d'abord celui qui joue juste après toi.
  const start = seated ? g.order.indexOf(view.me) + 1 : 0;
  const partners = Array.from({ length: seated ? n - 1 : n }, (_, i) => view.players.find((p) => p.id === g.order[(start + i) % n])!).filter(Boolean);
  const myTurn = g.turnId === view.me && !g.ended;
  const isHost = view.hostId === view.me;
  const lastId = g.lastRound?.lastId ?? null;

  return (
    <div className={cls('table-screen', `is-${n}p`, myTurn && 'is-my-turn')}>
      <div className="night-sky" aria-hidden />
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <Tokens hints={g.hints} storms={g.storms} />
        <Deck count={g.deck} last={!!g.lastRound} />
        <div className="table-tools">
          <button type="button" className="icon-btn" aria-label="Les règles" onClick={() => setRulesOpen(true)}>
            <BookOpen size={20} />
          </button>
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <section className="sky-band" aria-label="Le ciel">
        <FireworksRow fireworks={g.fireworks} />
        <DiscardStrip discard={g.discard} onOpen={() => setDiscardOpen(true)} />
      </section>

      <Ribbon view={view} now={now} />

      <main className={cls('partners', `has-${partners.length}`)}>
        {partners.map((p) => (
          <OtherHand
            key={p.id}
            player={p}
            isTurn={g.turnId === p.id && !g.ended}
            isLast={lastId === p.id && !g.ended}
            canHint={seated && !g.ended}
            myTurn={myTurn}
            chips={chips}
            emotes={emotes.filter((e) => e.playerId === p.id)}
            timer={<TurnTimer endsAt={g.turnEndsAt} think={view.settings.think} />}
            onHint={() => setHintFor(p.id)}
          />
        ))}
      </main>

      <section className={cls('me-zone', myTurn && 'is-turn')} style={{ '--n': me?.hand?.length ?? 5 } as CSSProperties}>
        {seated && me ? (
          <MyHand me={me} myTurn={myTurn} isLast={lastId === view.me && !g.ended} hints={g.hints} seq={g.seq} chips={chips} emotes={emotes.filter((e) => e.playerId === view.me)} />
        ) : (
          <p className="me-off">Tu regardes la partie. Les spectateurs ne voient aucune carte : ainsi, personne ne peut regarder sa propre main par-dessus son épaule.</p>
        )}
      </section>

      <Flights flights={flights} />

      {seated && <HintSheet view={view} targetId={hintFor} partners={partners} onTarget={setHintFor} onClose={closeHint} />}
      <DiscardModal open={discardOpen} onClose={() => setDiscardOpen(false)} discard={g.discard} />

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
