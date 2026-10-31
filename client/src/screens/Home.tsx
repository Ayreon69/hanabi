// Accueil : l'estampe du pont un soir de fête, pseudo + avatar, créer / rejoindre une table, entraînement, règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, House, MessageSquare, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, COLORS } from '../../../shared/protocol';
import { PlayingCard } from '../components/Cards';
import { firework } from '../components/Sky';
import { AVATAR_EMOJI, AVATAR_LABELS, Button, Logo, Night } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

/** Le pont de bois au-dessus du fleuve, et les lanternes des barques. */
function Bridge() {
  return (
    <svg className="home-bridge" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path className="bridge-deck" d="M-20 120C260 40 940 40 1220 120l0 14C940 56 260 56 -20 134Z" />
      <path className="bridge-rail" d="M-20 104C260 24 940 24 1220 104" />
      <g className="bridge-posts">
        {Array.from({ length: 25 }, (_, i) => {
          const x = -20 + i * 51;
          const t = (x + 20) / 1240;
          const y = 120 - Math.sin(t * Math.PI) * 60;
          return <path key={i} d={`M${x} ${y - 16}V${y + 4}`} />;
        })}
      </g>
      <g className="bridge-legs">
        {Array.from({ length: 13 }, (_, i) => {
          const x = 20 + i * 96;
          const t = (x + 20) / 1240;
          const y = 128 - Math.sin(t * Math.PI) * 60;
          return <path key={i} d={`M${x - 6} ${y}L${x - 10} 220M${x + 6} ${y}L${x + 10} 220`} />;
        })}
      </g>
      <g className="bridge-boats">
        <path d="M150 196h120l-14 10h-92z" />
        <circle cx="176" cy="186" r="5" className="boat-lantern" />
        <path d="M860 204h150l-16 9H876z" />
        <circle cx="900" cy="193" r="5" className="boat-lantern" />
        <circle cx="960" cy="193" r="5" className="boat-lantern" />
      </g>
    </svg>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('ha:url', sync);
    return () => window.removeEventListener('ha:url', sync);
  }, []);
  // Quelques gerbes au-dessus du pont, de temps en temps.
  useEffect(() => {
    if (reducedMotion()) return;
    const shoot = () => {
      if (document.hidden) return;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      firework(window.innerWidth * (0.12 + Math.random() * 0.76), window.innerHeight * (0.1 + Math.random() * 0.22), color, { big: Math.random() < 0.2 });
    };
    const first = window.setTimeout(shoot, 700);
    const id = window.setInterval(shoot, 2600);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Night className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=hanabi">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <Bridge />
      <header className="home-hero">
        <motion.div initial={{ y: -12 }} animate={{ y: 0 }} transition={{ duration: 0.6 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">Un feu d'artifice à plusieurs mains. Tu vois les cartes de tous, sauf les tiennes.</p>
        <div className="home-fan" aria-hidden>
          {COLORS.map((c, i) => (
            <motion.div key={c} className="home-fan-card" style={{ '--i': i - 2 } as React.CSSProperties} initial={{ y: 40, rotate: 0 }} animate={{ y: 0, rotate: (i - 2) * 9 }} transition={{ delay: 0.2 + i * 0.07, type: 'spring', stiffness: 200, damping: 18 }}>
              <PlayingCard color={c} value={i + 1} size="md" />
            </motion.div>
          ))}
        </div>
      </header>

      <motion.section className="sheet home-panel" initial={{ y: 24 }} animate={{ y: 0 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et rejoins !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Artificière"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 2, autostart: true }))}>
              {busy === 'bots' ? 'Préparation…' : "S'entraîner avec 2 bots"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 2 minutes
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après <i>Hanabi</i>, le jeu d'Antoine Bauza. Création de fans, non officielle.
      </footer>
    </Night>
  );
}
