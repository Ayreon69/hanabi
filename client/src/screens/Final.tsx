// Fin de partie : le score, une appréciation, le bouquet final dans le ciel, les mains révélées et la revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { COLORS, MAX_SCORE, type Color, type FinalView, type RoomView } from '../../../shared/protocol';
import { FireworksRow } from '../components/Board';
import { PlayingCard } from '../components/Cards';
import { SUIT_HEX, firework, storm } from '../components/Sky';
import { Avatar, Button, Logo, Night } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

/** L'appréciation du public, à notre façon. */
export function verdict(f: Pick<FinalView, 'reason' | 'score'>): { title: string; text: string } {
  if (f.reason === 'storms') return { title: "L'orage a gagné", text: 'Trois orages : le ciel s’est fâché et la fête s’arrête là. Les feux posés ne comptent pas.' };
  const s = f.score;
  if (s >= 25) return { title: 'Bouquet parfait', text: 'Cinq feux complets. Pas un bruit sur le pont : toute la ville retient son souffle.' };
  if (s >= 21) return { title: 'Éblouissant', text: 'On en parlera encore l’été prochain, et celui d’après.' };
  if (s >= 16) return { title: 'Le fleuve applaudit', text: 'Les barques s’arrêtent, le pont entier lève les yeux. Un grand cru.' };
  if (s >= 11) return { title: 'Une belle soirée', text: 'Un vrai spectacle, avec ses longueurs. On en reparlera jusqu’au prochain festival.' };
  if (s >= 6) return { title: 'Quelques étincelles', text: 'Des gerbes ici et là. Les enfants ont applaudi, les grands ont regardé l’heure.' };
  return { title: 'Pétards mouillés', text: 'Quelques crépitements timides. Le public est rentré avant la fin.' };
}

function statsLine(s: FinalView['players'][number]['stats']): string {
  const parts = [`${s.plays} carte${s.plays > 1 ? 's' : ''} posée${s.plays > 1 ? 's' : ''}`, plural(s.hints, 'indice'), plural(s.discards, 'défausse')];
  if (s.storms) parts.push(plural(s.storms, 'orage'));
  return parts.join(' · ');
}

/** Le bouquet final : une gerbe par point marqué, aux couleurs des feux réussis. */
function useFinale(final: FinalView) {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const timers: number[] = [];
    if (final.reason === 'storms') {
      sfx.defeat();
      timers.push(window.setTimeout(() => storm(), 250));
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    sfx.finale(final.score);
    if (reducedMotion()) return;
    const colors: Color[] = [];
    for (const c of COLORS) for (let i = 0; i < final.fireworks[c]; i++) colors.push(c);
    const shots = colors.sort(() => Math.random() - 0.5).slice(0, 25);
    shots.forEach((c, i) => {
      timers.push(
        window.setTimeout(() => {
          firework(window.innerWidth * (0.12 + Math.random() * 0.76), window.innerHeight * (0.08 + Math.random() * 0.25), c, { big: i === shots.length - 1 && final.score >= 16 });
          if (i % 3 === 0) sfx.burst(false);
        }, 300 + i * 150),
      );
    });
    if (final.score >= MAX_SCORE) {
      timers.push(
        window.setTimeout(() => {
          void confetti({ particleCount: 160, spread: 110, origin: { y: 0.3 }, colors: [SUIT_HEX.jaune, '#ffdf8a', '#fff4d6'], gravity: 0.6, scalar: 0.8, disableForReducedMotion: true });
        }, 300 + shots.length * 150),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [final]);
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  useFinale(final);
  const v = verdict(final);
  const lost = final.reason === 'storms';

  return (
    <Night className={cls('is-quiet', lost && 'is-rain')}>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className={cls('final-hero', lost && 'is-lost')} initial={{ y: 18 }} animate={{ y: 0 }} transition={{ duration: 0.5 }}>
          <span className="final-eyebrow">{lost ? 'Partie perdue' : final.reason === 'perfect' ? 'Feu d’artifice parfait' : 'Le spectacle est terminé'}</span>
          <div className="final-score" aria-label={`Score : ${final.score} sur ${MAX_SCORE}`}>
            <motion.b initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 14 }}>
              {final.score}
            </motion.b>
            <span>/ {MAX_SCORE}</span>
          </div>
          <h1>{v.title}</h1>
          <p>{v.text}</p>
          <FireworksRow fireworks={final.fireworks} size="sm" />
        </motion.section>

        <section className="sheet final-hands">
          <h3>Les artificiers</h3>
          <p className="muted small">Les cartes que chacun tenait sans les voir.</p>
          <ul>
            {final.players.map((p, i) => (
              <motion.li key={p.id} className={cls('final-row', p.id === view.me && 'is-me')} initial={{ x: -12 }} animate={{ x: 0 }} transition={{ delay: 0.3 + i * 0.07 }}>
                <div className="final-who">
                  <Avatar avatar={p.avatar} className="player-avatar" />
                  <div>
                    <b>
                      {p.name}
                      {p.id === view.me && <span className="muted"> (toi)</span>}
                    </b>
                    <span className="muted small">{statsLine(p.stats)}</span>
                  </div>
                </div>
                <div className="final-cards" aria-label={`Main de ${p.name} : ${p.hand.map((c) => `${c.value} ${c.color}`).join(', ') || 'vide'}`}>
                  {p.hand.map((c, j) => (
                    <PlayingCard key={j} color={c.color} value={c.value} size="xs" />
                  ))}
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Night>
  );
}
