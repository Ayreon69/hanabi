// Les cartes : une face de nuit où éclate une gerbe à la couleur du feu, un dos de papier washi tamponné.
import { forwardRef, memo, type CSSProperties, type HTMLAttributes } from 'react';
import type { Color } from '../../../shared/protocol';
import { cls } from '../lib/util';

export const SUIT_VAR: Record<Color, string> = {
  rouge: 'var(--s-rouge)',
  jaune: 'var(--s-jaune)',
  vert: 'var(--s-vert)',
  bleu: 'var(--s-bleu)',
  blanc: 'var(--s-blanc)',
};

/** Un motif par couleur, pour qu'aucune carte ne repose sur la seule couleur : pivoine, étoile, feuille, vague, lune. */
export function SuitGlyph({ color, className }: { color: Color; className?: string }) {
  const common = { className: cls('glyph', className), viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (color) {
    case 'rouge':
      return (
        <svg {...common}>
          <g fill="currentColor">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse key={a} cx="12" cy="5.6" rx="3.4" ry="4.4" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
          <circle cx="12" cy="12" r="2.6" fill="var(--glyph-core, #1a1430)" />
        </svg>
      );
    case 'jaune':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M12 1.8l2.9 6.6 7.2.7-5.4 4.8 1.6 7.1L12 17.3 5.7 21l1.6-7.1L1.9 9.1l7.2-.7z" />
        </svg>
      );
    case 'vert':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M20.5 3.2C11 3 4.2 8.6 4 17.3l-1.6 2.6 1.4.9 1.5-2.4c8.8-.3 14.8-6.4 15.2-15.2z" />
          <path d="M6.2 17.6c3.2-4.4 6.6-7.6 10.6-10.2" stroke="var(--glyph-core, #1a1430)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'bleu':
      return (
        <svg {...common}>
          <g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
            <path d="M2.5 20.5a9.5 9.5 0 0 1 19 0" />
            <path d="M7 20.5a5 5 0 0 1 10 0" />
            <path d="M11 20.5a1 1 0 0 1 2 0" />
          </g>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path fill="currentColor" d="M15.6 2.4A10 10 0 1 0 21.8 16 8 8 0 0 1 15.6 2.4z" />
        </svg>
      );
  }
}

/** La gerbe dessinée sur la carte : plus la valeur est haute, plus elle est riche. */
const Burst = memo(function Burst({ value }: { value: number }) {
  const rays = 6 + value * 2;
  const r1 = 9 + value;
  const r2 = 22 + value * 4.2;
  const items = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    const x1 = 50 + Math.cos(a) * r1;
    const y1 = 66 + Math.sin(a) * r1;
    const x2 = 50 + Math.cos(a) * r2;
    const y2 = 66 + Math.sin(a) * r2;
    items.push(<line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />);
    items.push(<circle key={`c${i}`} cx={50 + Math.cos(a) * (r2 + 4)} cy={66 + Math.sin(a) * (r2 + 4)} r={1.3 + value * 0.25} />);
    if (value >= 3 && i % 2 === 0) {
      const b = a + Math.PI / rays;
      items.push(<circle key={`d${i}`} cx={50 + Math.cos(b) * (r2 * 0.62)} cy={66 + Math.sin(b) * (r2 * 0.62)} r={1.1} className="burst-dot" />);
    }
  }
  return (
    <svg className="card-burst" viewBox="0 0 100 150" aria-hidden>
      <g className="burst-rays">{items}</g>
      {value >= 4 && <circle cx="50" cy="66" r={r2 + 12} className="burst-ring" />}
      {value === 5 && <circle cx="50" cy="66" r={r1 - 3} className="burst-core" />}
    </svg>
  );
});

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  color?: Color;
  value?: number;
  size?: Size;
  tilted?: boolean;
  lit?: boolean;
  dim?: boolean;
  selected?: boolean;
}

/** Une carte, face visible si on en connaît la couleur et la valeur, sinon de dos. */
export const PlayingCard = forwardRef<HTMLDivElement, CardProps>(function PlayingCard({ color, value, size = 'md', tilted, lit, dim, selected, className, style, ...rest }, ref) {
  const face = color !== undefined && value !== undefined;
  return (
    <div
      ref={ref}
      className={cls('card', `card-${size}`, face ? 'card-face' : 'card-back', face && `suit-${color}`, tilted && 'is-tilted', lit && 'is-lit', dim && 'is-dim', selected && 'is-selected', className)}
      style={face ? ({ '--suit': SUIT_VAR[color], ...style } as CSSProperties) : style}
      {...rest}
    >
      <div className="card-in">
        {face ? (
          <>
            <Burst value={value} />
            <span className="card-corner">
              <b>{value}</b>
              <SuitGlyph color={color} />
            </span>
            <span className="card-num">{value}</span>
            <SuitGlyph color={color} className="card-glyph" />
          </>
        ) : (
          <span className="card-seal" aria-hidden>
            花火
          </span>
        )}
      </div>
    </div>
  );
});

/** L'emplacement vide d'un feu d'artifice qui n'a pas encore commencé. */
export function EmptySlot({ color, size = 'md' }: { color: Color; size?: Size }) {
  return (
    <div className={cls('card', `card-${size}`, 'card-slot')} style={{ '--suit': SUIT_VAR[color] } as CSSProperties}>
      <SuitGlyph color={color} className="slot-glyph" />
    </div>
  );
}
