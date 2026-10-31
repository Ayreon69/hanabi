// Les mains : celles des partenaires, face visible, et la tienne, de dos, que tu ranges et inclines toi-même.
import { motion, Reorder } from 'framer-motion';
import { ChevronLeft, ChevronRight, Lightbulb, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MAX_HINTS, type CardView, type PlayerView } from '../../../shared/protocol';
import { COLOR_NAME } from '../lib/text';
import { cls } from '../lib/util';
import { send } from '../net';
import type { Emote } from '../store';
import { PlayingCard, SUIT_VAR, SuitGlyph } from './Cards';
import { Avatar, Button } from './Ui';

/** Ce qu'un indice en cours d'affichage dit d'une carte : la pastille posée au-dessus, le temps de l'indice. */
export interface Chip {
  kind: 'color' | 'value';
  color?: CardView['color'];
  value?: number;
}

export function HintChip({ chip }: { chip: Chip }) {
  if (chip.kind === 'value') return <span className="hint-chip is-value">{chip.value}</span>;
  return (
    <span className={cls('hint-chip', 'is-color', `suit-${chip.color}`)} style={{ '--suit': SUIT_VAR[chip.color!] } as CSSProperties}>
      <SuitGlyph color={chip.color!} />
    </span>
  );
}

function chipLabel(chip: Chip): string {
  return chip.kind === 'value' ? `désignée : ${chip.value}` : `désignée : ${COLOR_NAME[chip.color!].toLowerCase()}`;
}

function cardLabel(c: CardView, i: number, n: number, chip?: Chip): string {
  const pos = i === 0 ? 'à gauche' : i === n - 1 ? 'à droite' : `en position ${i + 1}`;
  const face = c.color ? `${c.value} ${c.color}` : 'cachée';
  return [`Carte ${face}, ${pos}`, c.tilted ? 'inclinée' : '', chip ? chipLabel(chip) : ''].filter(Boolean).join(', ');
}

export function Bubble({ emotes }: { emotes: Emote[] }) {
  const last = emotes[emotes.length - 1];
  if (!last) return null;
  return (
    <span key={last.id} className={cls('bubble', last.emoji.length > 3 && 'is-text')} role="status">
      {last.emoji}
    </span>
  );
}

interface OtherProps {
  player: PlayerView;
  isTurn: boolean;
  isLast: boolean;
  canHint: boolean;
  myTurn: boolean;
  chips: Map<string, Chip>;
  emotes: Emote[];
  timer: React.ReactNode;
  onHint?: () => void;
}

/** La main d'un partenaire : on la touche pour lui donner un indice. Son nom est posé sur le bord, comme une étiquette. */
export function OtherHand({ player, isTurn, isLast, canHint, myTurn, chips, emotes, timer, onHint }: OtherProps) {
  const hand = player.hand ?? [];
  const described = hand.map((c, i) => cardLabel(c, i, hand.length, chips.get(c.id))).join(' ; ');
  const label = `Main de ${player.name}${isTurn ? ', à son tour' : ''} : ${described}.${canHint ? (myTurn ? ' Toucher pour lui donner un indice.' : ' Toucher pour préparer un indice.') : ''}`;
  const cards = hand.map((c) => {
    const chip = chips.get(c.id);
    return (
      <motion.div key={c.id} className="card-slot" data-card={c.id} initial={{ x: -14 }} animate={{ x: 0 }} transition={{ duration: 0.3 }}>
        <PlayingCard color={c.color} value={c.value} size="sm" tilted={c.tilted} lit={!!chip} />
        {chip && <HintChip chip={chip} />}
      </motion.div>
    );
  });
  return (
    <section className={cls('other', isTurn && 'is-turn')} data-player={player.id}>
      {canHint ? (
        <button type="button" className={cls('other-cards', 'is-hintable', myTurn && 'is-ready')} onClick={onHint} aria-label={label}>
          {cards}
        </button>
      ) : (
        <div className="other-cards" role="group" aria-label={label}>
          {cards}
        </div>
      )}
      <div className="other-who" aria-hidden>
        <Avatar avatar={player.avatar} lit={isTurn} className="other-avatar" />
        <span className="other-name">{player.name}</span>
        {player.autopilot && <span className="tag">auto</span>}
        {!player.connected && !player.autopilot && <span className="tag">hors ligne</span>}
        {isLast && <span className="tag tag-last">dernier</span>}
      </div>
      {canHint && (
        <span className="hint-cta" aria-hidden>
          <Lightbulb size={13} /> Indice
        </span>
      )}
      <Bubble emotes={emotes} />
      {isTurn && timer}
    </section>
  );
}

interface MyHandProps {
  me: PlayerView;
  myTurn: boolean;
  isLast: boolean;
  hints: number;
  seq: number;
  chips: Map<string, Chip>;
  emotes: Emote[];
}

/** Ta main, de dos. Toucher une carte la soulève : jouer, défausser, incliner ou déplacer. */
export function MyHand({ me, myTurn, isLast, hints, seq, chips, emotes }: MyHandProps) {
  const cards = me.hand ?? [];
  const ids = cards.map((c) => c.id);
  const key = ids.join();
  const [order, setOrder] = useState(ids);
  const orderRef = useRef(ids);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Le serveur fait foi, sauf pendant qu'on fait glisser une carte.
  useEffect(() => {
    if (dragging.current) return;
    orderRef.current = ids;
    setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (selected && !ids.includes(selected)) setSelected(null);
  }, [key, selected, ids]);

  const byId = new Map(cards.map((c) => [c.id, c]));
  const shown = order.filter((id) => byId.has(id));
  const index = selected ? shown.indexOf(selected) : -1;

  const arrange = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
    void send('game:arrange', { order: next });
  };
  const move = (dir: -1 | 1) => {
    if (index < 0) return;
    const j = index + dir;
    if (j < 0 || j >= shown.length) return;
    const next = [...shown];
    [next[index], next[j]] = [next[j], next[index]];
    arrange(next);
  };
  const act = async (event: 'game:play' | 'game:discard') => {
    if (!selected || busy) return;
    setBusy(true);
    const ok = await send(event, { cardId: selected, seq });
    setBusy(false);
    if (ok) setSelected(null);
  };

  const canDiscard = myTurn && hints < MAX_HINTS;
  let note = '';
  if (selected) {
    if (!myTurn) note = 'À ton tour, tu pourras la jouer ou la défausser.';
    else if (hints >= MAX_HINTS) note = 'Huit jetons : pas de défausse.';
  } else if (myTurn) note = 'À toi : touche une de tes cartes, ou la main d’un partenaire.';
  else note = isLast ? 'Pioche vide : tu joueras le dernier.' : 'Ta main, de dos : range-la, incline une carte quand tu veux.';

  return (
    <div className="my-hand">
      <Bubble emotes={emotes} />
      <Reorder.Group as="ol" axis="x" values={shown} onReorder={(next: string[]) => {
        orderRef.current = next;
        setOrder(next);
      }} className="my-cards" aria-label="Ta main, de gauche à droite">
        {shown.map((id, i) => {
          const c = byId.get(id)!;
          const chip = chips.get(id);
          const isSel = selected === id;
          return (
            <Reorder.Item
              key={id}
              value={id}
              className="my-card"
              data-card={id}
              initial={{ x: -30 }}
              animate={{ x: 0 }}
              onDragStart={() => {
                dragging.current = true;
                dragged.current = true;
              }}
              onDragEnd={() => {
                dragging.current = false;
                const next = orderRef.current;
                if (next.join() !== ids.join()) arrange(next);
              }}
            >
              <button
                type="button"
                className="my-card-btn"
                aria-pressed={isSel}
                aria-label={cardLabel(c, i, shown.length, chip)}
                onClick={() => {
                  // Un glisser n'est pas un toucher.
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  setSelected(isSel ? null : id);
                }}
                onPointerDown={() => {
                  dragged.current = false;
                }}
              >
                <PlayingCard size="lg" tilted={c.tilted} lit={!!chip} selected={isSel} />
                {chip && <HintChip chip={chip} />}
              </button>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      <div className={cls('tray', selected && 'is-open')}>
        {selected ? (
          <>
            <Button variant="primary" className="tray-play" icon={<Sparkles size={18} />} disabled={!myTurn || busy} onClick={() => void act('game:play')}>
              Jouer
            </Button>
            <Button className="tray-discard" icon={<Trash2 size={18} />} disabled={!canDiscard || busy} onClick={() => void act('game:discard')}>
              Défausser
            </Button>
            <span className="tray-tools">
              <button type="button" className="icon-btn is-solid" aria-label={byId.get(selected)?.tilted ? 'Redresser la carte' : 'Incliner la carte'} aria-pressed={!!byId.get(selected)?.tilted} onClick={() => void send('game:tilt', { cardId: selected })}>
                <RotateCcw size={18} />
              </button>
              <button type="button" className="icon-btn is-solid" aria-label="Déplacer vers la gauche" disabled={index <= 0} onClick={() => move(-1)}>
                <ChevronLeft size={20} />
              </button>
              <button type="button" className="icon-btn is-solid" aria-label="Déplacer vers la droite" disabled={index < 0 || index >= shown.length - 1} onClick={() => move(1)}>
                <ChevronRight size={20} />
              </button>
            </span>
          </>
        ) : null}
      </div>
      {(!selected || note) && (
        <p className={cls('tray-note', myTurn && !selected && 'is-turn')} aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
}
