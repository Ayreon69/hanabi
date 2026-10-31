// Les règles, lisibles en deux minutes, consultables à tout moment, avec les conventions des bots.
import { Hand, Lightbulb, RotateCcw, Sparkles, Trash2, Zap } from 'lucide-react';
import { COLORS } from '../../../shared/protocol';
import { COLOR_NAME } from '../lib/text';
import { useStore } from '../store';
import { PlayingCard, SuitGlyph } from './Cards';
import { Modal } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <div className="rule-fan" aria-hidden>
            <PlayingCard color="rouge" value={1} size="sm" />
            <PlayingCard color="jaune" value={2} size="sm" />
            <PlayingCard color="bleu" value={3} size="sm" />
            <PlayingCard size="sm" />
          </div>
          <p>
            Ensemble, vous tirez un feu d'artifice : <b>cinq feux, un par couleur, du 1 au 5</b>. Tu tiens tes cartes à l'envers : <b>tu vois celles des autres, jamais les tiennes.</b> Tout le monde gagne, ou perd, ensemble.
          </p>
        </section>

        <section>
          <h3>Le matériel</h3>
          <ul className="rule-suits" aria-label="Les cinq couleurs">
            {COLORS.map((c) => (
              <li key={c} className={`suit-${c}`}>
                <SuitGlyph color={c} /> {COLOR_NAME[c]}
              </li>
            ))}
          </ul>
          <p>
            50 cartes : dans chaque couleur, trois 1, deux 2, deux 3, deux 4 et <b>un seul 5</b>. Huit jetons indice, trois jetons orage. Chacun reçoit 5 cartes à 2 ou 3 joueurs, 4 cartes à 4 ou 5.
          </p>
        </section>

        <section>
          <h3>À ton tour, une seule action</h3>
          <ul className="rule-actions">
            <li>
              <Lightbulb size={20} aria-hidden />
              <div>
                <b>Donner un indice</b> (un jeton). Tu montres à un partenaire <b>toutes</b> ses cartes d'une couleur, ou toutes ses cartes d'une valeur. « Ces deux cartes sont rouges. » « Cette carte est un 5. » Le livret permet même « tu n'as aucun 4 ».
              </div>
            </li>
            <li>
              <Trash2 size={20} aria-hidden />
              <div>
                <b>Défausser</b> une de tes cartes : un jeton indice revient. Impossible quand les huit jetons sont là.
              </div>
            </li>
            <li>
              <Sparkles size={20} aria-hidden />
              <div>
                <b>Jouer</b> une de tes cartes. Si elle prolonge son feu (le 1, puis le 2…), elle y est posée. Sinon, elle part à la défausse et <b>un orage éclate</b>. Compléter un feu avec son 5 rend un jeton indice.
              </div>
            </li>
          </ul>
          <p>Après avoir joué ou défaussé, tu pioches une carte, sans la regarder. Elle arrive à gauche de ta main.</p>
        </section>

        <section className="rule-split">
          <div className="rule-case">
            <h3>
              <Zap size={18} aria-hidden /> Fin de partie
            </h3>
            <p>
              <b>Troisième orage :</b> la fête est gâchée, la partie est perdue (0 point). <b>25 points :</b> feu d'artifice parfait, c'est fini. <b>Pioche vide :</b> chacun joue encore une fois, et celui qui a pioché la dernière carte joue le dernier.
            </p>
          </div>
          <div className="rule-case">
            <h3>Le score</h3>
            <p>La somme des plus hautes cartes posées sur chaque feu, de 0 à 25.</p>
          </div>
        </section>

        <section>
          <h3>Les gestes</h3>
          <ul className="rule-actions">
            <li>
              <Lightbulb size={20} aria-hidden />
              <div>
                <b>Touche la main d'un partenaire</b> pour lui donner un indice : choisis une couleur ou une valeur, tu vois les cartes désignées avant de valider.
              </div>
            </li>
            <li>
              <Hand size={20} aria-hidden />
              <div>
                <b>Touche une de tes cartes</b> pour la jouer ou la défausser. Glisse-la, ou utilise les flèches, pour ranger ta main.
              </div>
            </li>
            <li>
              <RotateCcw size={20} aria-hidden />
              <div>
                <b>Incline une carte</b> pour t'en souvenir. Comme autour d'une vraie table, les autres voient tes gestes.
              </div>
            </li>
          </ul>
        </section>

        <section className="rule-memory">
          <h3>Ta mémoire, pas la nôtre</h3>
          <p>
            Un indice s'affiche quelques secondes, puis il disparaît : aucune trace sur tes cartes, aucun historique. C'est tout le jeu. Range ta main, incline une carte, et souviens-toi. La défausse, elle, reste face visible : tout le monde peut la consulter.
          </p>
        </section>

        <section className="rule-bots">
          <h3>Comment jouent les bots</h3>
          <p>Ils ne voient pas leurs cartes, mais se souviennent de chaque indice. Ils suivent quelques conventions simples :</p>
          <ul>
            <li>
              <b>La carte en danger</b> est la plus à droite des cartes qu'aucun indice n'a désignées. C'est elle qu'on défausse.
            </li>
            <li>
              <b>Un indice vise une carte :</b> la carte en danger si elle est désignée, sinon la plus à gauche des cartes nouvellement désignées. Cette carte est <b>jouable tout de suite</b>.
            </li>
            <li>
              <b>Sauvegarde :</b> si la carte en danger désignée peut être un 5 ou le dernier exemplaire d'une carte encore utile, c'est pour la garder, pas pour la jouer.
            </li>
            <li>
              <b>On ne désigne jamais</b> une carte devenue inutile, ni le double d'une carte déjà désignée.
            </li>
          </ul>
        </section>

        <p className="rule-foot">
          D'après <i>Hanabi</i>, le jeu d'Antoine Bauza (Cocktail Games, Les XII Singes). Création de fans, non officielle, avec ses propres visuels.
        </p>
      </div>
    </Modal>
  );
}
