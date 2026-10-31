// Le ciel : un canevas par-dessus la table où montent les fusées, éclatent les gerbes et gronde l'orage.
// Rien n'attend la fin d'une animation : le ciel se contente de dessiner, puis s'éteint.
import { useEffect, useRef } from 'react';
import type { Color } from '../../../shared/protocol';
import { reducedMotion } from '../lib/util';

export const SUIT_HEX: Record<Color, string> = {
  rouge: '#ff5b4d',
  jaune: '#ffd23a',
  vert: '#4fd68a',
  bleu: '#5aa8ff',
  blanc: '#f4f2ec',
};
const GOLD = '#ffdf8a';

interface Spark {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  width: number;
  gravity: number;
  drag: number;
  /** Une fusée explose en arrivant : on garde ce qu'elle doit devenir. */
  payload?: { color: string; big: boolean };
  glow?: number;
}

interface Bolt {
  points: [number, number][];
  life: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let sparks: Spark[] = [];
/** Les étincelles nées pendant l'image en cours : elles rejoignent le ciel à l'image suivante. */
let born: Spark[] = [];
let bolts: Bolt[] = [];
let flash = 0;
let raf = 0;
let w = 0;
let h = 0;

function resize(): void {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function explode(x: number, y: number, color: string, big: boolean): void {
  const n = big ? 120 : 70;
  const speed = big ? 5.2 : 3.9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const v = speed * (0.55 + Math.random() * 0.5);
    const gold = Math.random() < 0.18;
    born.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 52 + Math.random() * 30, color: gold ? GOLD : color, width: gold ? 1.4 : 2, gravity: 0.05, drag: 0.968 });
  }
  if (big) {
    // Le 5 : une couronne d'or qui retombe en saule.
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.4 + Math.random() * 1.6;
      born.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, life: 0, max: 95 + Math.random() * 30, color: GOLD, width: 1.2, gravity: 0.03, drag: 0.985 });
    }
  }
  born.push({ x, y, px: x, py: y, vx: 0, vy: 0, life: 0, max: 16, color, width: 0, gravity: 0, drag: 1, glow: big ? 90 : 60 });
}

function frame(): void {
  raf = 0;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (flash > 0.01) {
    ctx.fillStyle = `rgba(220, 230, 255, ${flash})`;
    ctx.fillRect(0, 0, w, h);
    flash *= 0.84;
  } else flash = 0;
  ctx.globalCompositeOperation = 'lighter';
  const next: Spark[] = [];
  for (const s of sparks) {
    s.life++;
    s.px = s.x;
    s.py = s.y;
    s.vx *= s.drag;
    s.vy = s.vy * s.drag + s.gravity;
    s.x += s.vx;
    s.y += s.vy;
    const t = 1 - s.life / s.max;
    if (s.glow) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.glow * (0.6 + 0.4 * (1 - t)));
      g.addColorStop(0, `rgba(255, 244, 214, ${0.55 * t})`);
      g.addColorStop(1, 'rgba(255, 244, 214, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.glow, s.y - s.glow, s.glow * 2, s.glow * 2);
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      if (s.payload) {
        // La fusée : une courte traînée qui s'efface, et une tête brillante.
        const tail = ctx.createLinearGradient(s.x - s.vx * 3, s.y - s.vy * 3, s.x, s.y);
        tail.addColorStop(0, 'rgba(255, 223, 138, 0)');
        tail.addColorStop(1, 'rgba(255, 223, 138, 0.9)');
        ctx.strokeStyle = tail;
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 3, s.y - s.vy * 3);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.fillStyle = '#fff4d6';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.max(0, t) * 0.95;
        ctx.beginPath();
        ctx.moveTo(s.px - s.vx * 1.6, s.py - s.vy * 1.6);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      // Un scintillement au bout des étincelles.
      if (!s.payload && Math.random() < 0.3 && t < 0.6) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(s.x, s.y, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
    if (s.payload && s.life >= s.max) {
      explode(s.x, s.y, s.payload.color, s.payload.big);
      continue;
    }
    if (s.life < s.max && s.y < h + 40) next.push(s);
  }
  sparks = next.concat(born);
  born = [];
  ctx.globalCompositeOperation = 'source-over';
  const keep: Bolt[] = [];
  for (const b of bolts) {
    b.life--;
    ctx.save();
    ctx.strokeStyle = `rgba(235, 240, 255, ${Math.min(1, b.life / 6)})`;
    ctx.shadowColor = '#9fb8ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    b.points.forEach(([x, y], i) => (i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    if (b.life > 0) keep.push(b);
  }
  bolts = keep;
  if (sparks.length || bolts.length || flash > 0) raf = requestAnimationFrame(frame);
  else ctx.clearRect(0, 0, w, h);
}

function run(): void {
  if (!raf && ctx) raf = requestAnimationFrame(frame);
}

/** Une fusée part de `from` (ou du bas de l'écran) et éclate en `x, y`. */
export function firework(x: number, y: number, color: Color, opts: { big?: boolean; from?: { x: number; y: number } } = {}): void {
  if (!ctx) return;
  const hex = SUIT_HEX[color];
  if (reducedMotion()) {
    sparks.push({ x, y, px: x, py: y, vx: 0, vy: 0, life: 0, max: 26, color: hex, width: 0, gravity: 0, drag: 1, glow: 70 });
    run();
    return;
  }
  const from = opts.from ?? { x: x + (Math.random() - 0.5) * 40, y: h + 10 };
  const frames = 26;
  const vy = (y - from.y) / frames - (0.05 * frames) / 2;
  sparks.push({ x: from.x, y: from.y, px: from.x, py: from.y, vx: (x - from.x) / frames, vy, life: 0, max: frames, color: GOLD, width: 2.2, gravity: 0.05, drag: 1, payload: { color: hex, big: !!opts.big } });
  run();
}

/** L'orage : un éclair, un flash, et l'écran qui tremble un instant. */
export function storm(): void {
  if (!ctx) return;
  if (reducedMotion()) {
    flash = 0.25;
    run();
    return;
  }
  flash = 0.6;
  const points: [number, number][] = [];
  let x = w * (0.25 + Math.random() * 0.5);
  let y = -10;
  while (y < h * 0.62) {
    points.push([x, y]);
    x += (Math.random() - 0.5) * 70;
    y += 24 + Math.random() * 36;
  }
  points.push([x, y]);
  bolts.push({ points, life: 16 });
  for (let i = 0; i < 90; i++) {
    const rx = Math.random() * (w + 200) - 100;
    const ry = -Math.random() * h * 0.6;
    sparks.push({ x: rx, y: ry, px: rx, py: ry, vx: -1.6, vy: 11 + Math.random() * 5, life: 0, max: 60 + Math.random() * 30, color: '#9fb2e6', width: 1, gravity: 0, drag: 1 });
  }
  document.body.classList.remove('is-shaking');
  void document.body.offsetWidth;
  document.body.classList.add('is-shaking');
  window.setTimeout(() => document.body.classList.remove('is-shaking'), 450);
  run();
}

/** Le canevas, posé une fois pour toutes par-dessus l'application. */
export function SkyCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas = ref.current;
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas = null;
      ctx = null;
    };
  }, []);
  return <canvas ref={ref} className="sky-canvas" aria-hidden />;
}
