// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, logo, avatars et décor d'estampe.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'paper';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le titre comme sur une estampe : le nom, et son cachet vermillon. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Hanabi">
      <span className="logo-word" aria-hidden>
        Hanabi
      </span>
      <span className="logo-seal" aria-hidden>
        花火
      </span>
    </div>
  );
}

/** Le décor : le ciel d'été en dégradé, comme les ciels tirés à la main des estampes, et le fleuve en bas. */
export function Night({ children, className, river = true }: { children: ReactNode; className?: string; river?: boolean }) {
  return (
    <div className={cls('night', className)}>
      <div className="night-sky" aria-hidden />
      {river && (
        <svg className="night-river" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
          <path className="river-bank" d="M0 40C180 30 320 52 520 44S900 26 1200 40V160H0Z" />
          <g className="river-lines">
            {[64, 84, 104, 126, 146].map((y, i) => (
              <path key={y} d={`M${-40 + i * 23} ${y}c60-8 120-8 180 0s120 8 180 0 120-8 180 0 120 8 180 0 120-8 180 0 120 8 180 0 120-8 180 0`} />
            ))}
          </g>
        </svg>
      )}
      <div className="night-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'gold' | 'shu' | 'blue'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre. Elle s'ouvre avec un petit mouvement en CSS, dont l'état final est l'état de repos,
 * et se ferme d'un coup : aucune animation de sortie dont dépendrait l'affichage suivant.
 */
export function Modal({ open, onClose, title, children, wide, sheet, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; sheet?: boolean; footer?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    // Le focus entre dans la fenêtre, et revient d'où il venait à la fermeture.
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-body button, .modal-body input')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={cls('modal-back', sheet && 'is-sheet')} onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', sheet && 'is-sheet')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  lanterne: '🏮',
  furin: '🎐',
  poisson: '🐠',
  renard: '🦊',
  pasteque: '🍉',
  dango: '🍡',
  glace: '🍧',
  lune: '🌙',
  bambou: '🎋',
  grenouille: '🐸',
  kimono: '👘',
  tortue: '🐢',
};

export const AVATAR_LABELS: Record<string, string> = {
  lanterne: 'Lanterne',
  furin: 'Clochette à vent',
  poisson: 'Poisson rouge',
  renard: 'Renard',
  pasteque: 'Pastèque',
  dango: 'Dango',
  glace: 'Glace pilée',
  lune: 'Lune',
  bambou: 'Bambou',
  grenouille: 'Grenouille',
  kimono: 'Yukata',
  tortue: 'Tortue',
};

export function Avatar({ avatar, className, lit }: { avatar: string; className?: string; lit?: boolean }) {
  return (
    <span className={cls('avatar', lit && 'is-lit', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🏮'}
    </span>
  );
}
