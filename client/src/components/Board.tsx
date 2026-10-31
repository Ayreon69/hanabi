// Ce qui est posé au milieu de la table : jetons indice et orage, pioche, feux d'artifice et défausse.
import { Layers, Zap } from 'lucide-react';
import { COLORS, MAX_HINTS, MAX_STORMS, type Card, type Color, type Fireworks } from '../../../shared/protocol';
import { COLOR_NAME } from '../lib/text';
import { cls, plural } from '../lib/util';
import { EmptySlot, PlayingCard, SuitGlyph } from './Cards';
import { Modal } from './Ui';

/** Les jetons, tels qu'on les voit sur la table : pas de chiffre, juste des jetons. */
export function Tokens({ hints, storms }: { hints: number; storms: number }) {
  return (
    <div className="tokens">
      <div className="token-row" role="img" aria-label={`${plural(hints, 'jeton')} indice disponible${hints > 1 ? 's' : ''} sur ${MAX_HINTS}`}>
        {Array.from({ length: MAX_HINTS }, (_, i) => (
          <span key={i} className={cls('token', 'token-hint', i < hints ? 'is-on' : 'is-off')} />
        ))}
      </div>
      <div className="token-row" role="img" aria-label={storms ? `${plural(storms, 'orage')} sur ${MAX_STORMS}` : 'Aucun orage'}>
        {Array.from({ length: MAX_STORMS }, (_, i) => (
          <span key={i} className={cls('token', 'token-storm', i < storms ? 'is-on' : 'is-off')}>
            <Zap size={11} strokeWidth={2.6} aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}

/** La pioche et son nombre de cartes ; vide, elle annonce le dernier tour. */
export function Deck({ count, last }: { count: number; last: boolean }) {
  if (count === 0 && last) {
    return (
      <div className="deck is-last" role="status">
        Dernier tour
      </div>
    );
  }
  return (
    <div className="deck" role="img" aria-label={`Pioche : ${plural(count, 'carte')}`}>
      <span className="deck-stack" aria-hidden>
        <Layers size={16} />
      </span>
      <b>{count}</b>
    </div>
  );
}

/** Les cinq feux : la plus haute carte posée de chaque couleur. */
export function FireworksRow({ fireworks, size = 'md' }: { fireworks: Fireworks; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <ol className="fireworks" aria-label="Les feux d'artifice">
      {COLORS.map((c) => {
        const top = fireworks[c];
        return (
          <li key={c} className={cls('firework', top === 5 && 'is-done')} data-slot={c} aria-label={top ? `Feu ${c} : jusqu'au ${top}${top === 5 ? ', complet' : ''}` : `Feu ${c} : pas encore commencé`}>
            {top ? <PlayingCard key={top} color={c} value={top} size={size} className="firework-card" /> : <EmptySlot color={c} size={size} />}
          </li>
        );
      })}
    </ol>
  );
}

function grouped(discard: Card[]): [Color, number[]][] {
  return COLORS.map((c) => [c, discard.filter((d) => d.color === c).map((d) => d.value)] as [Color, number[]]).filter(([, v]) => v.length > 0);
}

/** La défausse en bande : face visible, rangée par couleur, comme on l'étale sur la table. */
export function DiscardStrip({ discard, onOpen }: { discard: Card[]; onOpen: () => void }) {
  return (
    <button type="button" className="discard-strip" data-discard onClick={onOpen} aria-label={discard.length ? `Défausse : ${plural(discard.length, 'carte')}. Voir en grand.` : 'Défausse vide'}>
      <span className="discard-title">Défausse</span>
      {discard.length === 0 ? (
        <span className="discard-empty">vide</span>
      ) : (
        <span className="discard-groups" aria-hidden>
          {grouped(discard).map(([c, values]) => (
            <span key={c} className={cls('discard-group', `suit-${c}`)}>
              <SuitGlyph color={c} />
              {values.map((v, i) => (
                <i key={i}>{v}</i>
              ))}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

export function DiscardModal({ open, onClose, discard }: { open: boolean; onClose: () => void; discard: Card[] }) {
  const groups = grouped(discard);
  return (
    <Modal open={open} onClose={onClose} title="La défausse" wide>
      {groups.length === 0 ? (
        <p className="muted">Aucune carte défaussée pour l'instant.</p>
      ) : (
        <div className="discard-big">
          {groups.map(([c, values]) => (
            <section key={c} className="discard-line" aria-label={`${COLOR_NAME[c]} : ${values.join(', ')}`}>
              <span className={cls('discard-line-name', `suit-${c}`)}>
                <SuitGlyph color={c} /> {COLOR_NAME[c]}
              </span>
              <div className="discard-line-cards">
                {values.map((v, i) => (
                  <PlayingCard key={i} color={c} value={v} size="sm" />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
