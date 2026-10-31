// Donner un indice en trois gestes : un partenaire, une couleur ou une valeur, et l'aperçu des cartes désignées avant de valider.
import { Lightbulb } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { COLORS, VALUES, touches, type Hint, type PlayerView, type RoomView } from '../../../shared/protocol';
import { COLOR_NAME, hintSentence } from '../lib/text';
import { cls } from '../lib/util';
import { send } from '../net';
import { PlayingCard, SUIT_VAR, SuitGlyph } from './Cards';
import { Avatar, Button, Modal } from './Ui';

interface Props {
  view: RoomView;
  targetId: string | null;
  partners: PlayerView[];
  onTarget: (id: string) => void;
  onClose: () => void;
}

const same = (a: Hint | null, b: Hint) => !!a && a.kind === b.kind && (a.kind === 'color' ? a.color === (b as typeof a).color : a.value === (b as typeof a).value);

export function HintSheet({ view, targetId, partners, onTarget, onClose }: Props) {
  const g = view.game!;
  const target = partners.find((p) => p.id === targetId) ?? null;
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setHint(null), [targetId]);

  const myTurn = g.turnId === view.me && !g.ended;
  const hand = target?.hand ?? [];
  const touched = hint ? hand.map((c) => !!c.color && touches({ color: c.color, value: c.value! }, hint)) : hand.map(() => false);
  const n = touched.filter(Boolean).length;
  const reason = !myTurn ? "Ce n'est pas ton tour : tu peux préparer ton indice." : g.hints === 0 ? 'Plus de jeton indice : joue ou défausse une carte.' : null;

  const give = async () => {
    if (!hint || !target || reason || busy) return;
    setBusy(true);
    const ok = await send('game:hint', { target: target.id, hint, seq: g.seq });
    setBusy(false);
    if (ok) onClose();
  };

  const count = (h: Hint) => hand.filter((c) => !!c.color && touches({ color: c.color, value: c.value! }, h)).length;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={target ? `Indice pour ${target.name}` : 'Indice'}
      sheet
      footer={
        <div className="hint-foot">
          <p className={cls('hint-sentence', !hint && 'is-placeholder')} aria-live="polite">
            {hint ? `« ${hintSentence(hint, n)} »` : 'Choisis une couleur ou une valeur.'}
          </p>
          {reason && <p className="hint-reason">{reason}</p>}
          {target?.isBot && !reason && (
            <p className="hint-bot">
              {target.name} est un bot : il jouera aussitôt la carte visée, la plus à gauche des cartes nouvellement désignées. Sauf sur sa carte en danger, à droite : un 5 ou une dernière carte, il la gardera.
            </p>
          )}
          <Button variant="primary" className="btn-lg btn-wide" icon={<Lightbulb size={20} />} disabled={!hint || !!reason || busy} onClick={() => void give()}>
            {hint ? `Donner l'indice${n === 0 ? ' (aucune carte)' : ''}` : "Donner l'indice"}
          </Button>
        </div>
      }
    >
      {partners.length > 1 && (
        <div className="hint-targets" role="radiogroup" aria-label="À qui ?">
          {partners.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === targetId} className={cls('hint-target', p.id === targetId && 'is-on')} onClick={() => onTarget(p.id)}>
              <Avatar avatar={p.avatar} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="hint-preview" aria-label={`Main de ${target?.name ?? ''}`}>
        {hand.map((c, i) => (
          <div key={c.id} className={cls('hint-card', hint && (touched[i] ? 'is-touched' : 'is-left'))}>
            <PlayingCard color={c.color} value={c.value} size="md" tilted={c.tilted} lit={!!hint && touched[i]} dim={!!hint && !touched[i]} />
          </div>
        ))}
      </div>
      <div className="hint-pick">
        <span className="field-label" id="hint-colors">
          Une couleur
        </span>
        <div className="hint-options" role="radiogroup" aria-labelledby="hint-colors">
          {COLORS.map((color) => {
            const h: Hint = { kind: 'color', color };
            const k = count(h);
            return (
              <button key={color} type="button" role="radio" aria-checked={same(hint, h)} aria-label={`${COLOR_NAME[color]} : ${k ? `${k} carte${k > 1 ? 's' : ''}` : 'aucune carte'}`} className={cls('hint-opt', 'is-color', `suit-${color}`, same(hint, h) && 'is-on', k === 0 && 'is-none')} style={{ '--suit': SUIT_VAR[color] } as CSSProperties} onClick={() => setHint(h)}>
                <SuitGlyph color={color} />
                <small>{COLOR_NAME[color]}</small>
              </button>
            );
          })}
        </div>
        <span className="field-label" id="hint-values">
          Une valeur
        </span>
        <div className="hint-options" role="radiogroup" aria-labelledby="hint-values">
          {VALUES.map((value) => {
            const h: Hint = { kind: 'value', value };
            const k = count(h);
            return (
              <button key={value} type="button" role="radio" aria-checked={same(hint, h)} aria-label={`${value} : ${k ? `${k} carte${k > 1 ? 's' : ''}` : 'aucune carte'}`} className={cls('hint-opt', 'is-value', same(hint, h) && 'is-on', k === 0 && 'is-none')} onClick={() => setHint(h)}>
                <b>{value}</b>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
