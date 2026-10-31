// Sons synthétisés (Web Audio), aucun fichier à charger : sifflet des fusées, gerbes, tonnerre, clochette à vent et koto.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Une corde de koto : attaque nette, deux harmoniques qui s'éteignent. */
function koto(freq: number, delay = 0, gain = 0.09): void {
  tone(freq, 0.9, { type: 'triangle', gain, delay });
  tone(freq * 2, 0.5, { type: 'sine', gain: gain * 0.45, delay });
  tone(freq * 3.01, 0.25, { type: 'sine', gain: gain * 0.2, delay });
  noise(0.015, { gain: gain * 0.8, freq: 4200, delay });
}

/** La gamme in, si japonaise à l'oreille : ré, mi bémol, sol, la, si bémol. */
const IN = [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25, 784, 880, 932.33];

export const sfx = {
  /** La fusée qui monte en sifflant. */
  launch: () => {
    tone(520, 0.55, { type: 'sine', gain: 0.035, slide: 2.6, attack: 0.05 });
    noise(0.5, { gain: 0.05, freq: 3000, fade: 0.6 });
  },
  /** La gerbe : un coup sourd, puis le crépitement. Plus fort pour un 5. */
  burst: (big = false) => {
    noise(big ? 0.9 : 0.6, { gain: big ? 0.75 : 0.5, freq: 120, type: 'lowpass', fade: 3 });
    tone(70, 0.45, { gain: 0.18, slide: 0.5 });
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) noise(0.02, { gain: 0.05 + Math.random() * 0.06, freq: 2500 + Math.random() * 4000, delay: 0.15 + Math.random() * (big ? 1.1 : 0.7) });
  },
  /** Raté : la mèche qui s'éteint, puis le tonnerre qui roule. */
  thunder: () => {
    tone(700, 0.4, { type: 'sine', gain: 0.04, slide: 0.3 });
    noise(0.12, { gain: 0.6, freq: 900, delay: 0.25 });
    noise(2.2, { gain: 0.9, freq: 90, type: 'lowpass', delay: 0.3, fade: 1.4 });
    noise(1.4, { gain: 0.35, freq: 200, type: 'lowpass', delay: 0.6, fade: 2 });
  },
  /** Un indice : la clochette à vent (fûrin). */
  chime: () => {
    const base = 1568 + Math.random() * 60;
    tone(base, 1.6, { gain: 0.05 });
    tone(base * 2.76, 0.9, { gain: 0.02 });
    tone(base * 1.5, 1.2, { gain: 0.03, delay: 0.09 });
  },
  /** Le papier qu'on pose : défausse, carte piochée. */
  paper: () => {
    noise(0.16, { gain: 0.16, freq: 1800, q: 0.7, fade: 1 });
    noise(0.08, { gain: 0.08, freq: 5200, delay: 0.05 });
  },
  /** À toi : une petite cloche de temple (rin). */
  turn: () => {
    tone(1046, 1.4, { gain: 0.06 });
    tone(1046 * 2.71, 0.7, { gain: 0.02 });
    tone(1046 * 0.5, 0.9, { gain: 0.025 });
  },
  tap: () => tone(880, 0.06, { gain: 0.03, slide: 1.4 }),
  /** Le tambour qui ouvre la fête. */
  taiko: () => {
    noise(0.35, { gain: 0.9, freq: 110, type: 'lowpass', fade: 3 });
    tone(62, 0.4, { gain: 0.3, slide: 0.7 });
    noise(0.3, { gain: 0.5, freq: 120, type: 'lowpass', delay: 0.32, fade: 3 });
    tone(66, 0.35, { gain: 0.22, slide: 0.7, delay: 0.32 });
  },
  /** Une phrase de koto, plus longue et plus haute avec le score. */
  finale: (score: number) => {
    const notes = score >= 25 ? [0, 2, 3, 5, 7, 8, 9, 7, 9] : score >= 16 ? [0, 2, 3, 5, 7, 5, 7] : score >= 6 ? [3, 2, 0, 2, 3] : [4, 3, 1, 0];
    notes.forEach((n, i) => koto(IN[n], i * 0.2));
  },
  /** La défaite : trois notes qui descendent sous la pluie. */
  defeat: () => {
    [4, 2, 1, 0].forEach((n, i) => koto(IN[n] / 2, i * 0.32, 0.08));
    noise(2.5, { gain: 0.12, freq: 3000, fade: 0.4 });
  },
};
