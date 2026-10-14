// Sound effects, synthesized with the Web Audio API (no audio files to license or download).
// Shared by the TV and the phones. Browsers only start audio after a user gesture; the TV
// WebView allows it from the start.

let ctx: AudioContext | null = null;

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a tap or click so phones are allowed to play sound later. */
export function unlockAudio() {
  try { ac(); } catch { /* no audio */ }
}

function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; slide?: number } = {}) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, at);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function noise(at: number, dur: number, opts: { gain?: number; freq?: number; q?: number } = {}) {
  const c = ac();
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 1.5;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.3;
  src.connect(f).connect(g).connect(c.destination);
  src.start(at);
}

/** A music-box note, in semitones above C5: the toy orchestra's tune. */
export function playNote(semis: number) {
  try {
    const t = ac().currentTime + 0.01;
    const f = 523.25 * Math.pow(2, semis / 12);
    tone(f, t, 0.9, { gain: 0.22 }); tone(f * 2, t, 0.5, { gain: 0.05 }); tone(f * 3, t, 0.3, { gain: 0.03 });
  } catch { /* no audio */ }
}

const safe = (fn: (t: number) => void) => () => {
  try { fn(ac().currentTime + 0.01); } catch { /* no audio on this device */ }
};

export const sfx = {
  /** One click of a wind-up key. */
  ratchet: safe((t) => { noise(t, 0.035, { freq: 3200, q: 4, gain: 0.5 }); tone(1800, t, 0.03, { type: "square", gain: 0.04 }); }),
  /** A run of ratchet clicks, for a big shake. */
  wind: safe((t) => { for (let i = 0; i < 4; i++) { noise(t + i * 0.06, 0.03, { freq: 3000 + i * 150, q: 4, gain: 0.45 }); } }),
  /** Little bells: something good happened. */
  chime: safe((t) => { [0, 4, 7, 12].forEach((s, i) => tone(1046 * Math.pow(2, s / 12), t + i * 0.08, 0.6, { gain: 0.12 })); }),
  /** Glittery sparkle, for magic moments. */
  sparkle: safe((t) => { for (let i = 0; i < 9; i++) tone(2000 + Math.random() * 2500, t + i * 0.045, 0.25, { gain: 0.05 }); }),
  /** Snow globe swirl: soft glassy tinkles. */
  tinkle: safe((t) => { for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 1800, t + Math.random() * 0.25, 0.35, { gain: 0.035 }); noise(t, 0.3, { freq: 6000, q: 0.7, gain: 0.05 }); }),
  /** Wrong spot: a friendly boing. */
  boing: safe((t) => tone(330, t, 0.35, { type: "triangle", gain: 0.18, slide: 0.5 })),
  /** Picking something up. */
  pop: safe((t) => tone(600, t, 0.12, { type: "sine", gain: 0.2, slide: 2 })),
  /** Moving the hand over something you can use. */
  hover: safe((t) => tone(1400, t, 0.06, { gain: 0.05 })),
  /** A key turning in a lock, then the door creaking open. */
  unlock: safe((t) => {
    noise(t, 0.06, { freq: 900, q: 3, gain: 0.6 }); noise(t + 0.18, 0.08, { freq: 700, q: 3, gain: 0.7 });
    tone(140, t + 0.5, 1.2, { type: "sawtooth", gain: 0.03, slide: 1.6 });
  }),
  /** Toy train whistle. */
  toot: safe((t) => { tone(740, t, 0.45, { type: "square", gain: 0.05 }); tone(932, t, 0.45, { type: "square", gain: 0.04 }); }),
  /** Toy drum. */
  drum: safe((t) => { tone(160, t, 0.25, { gain: 0.4, slide: 0.5 }); noise(t, 0.12, { freq: 1500, q: 0.8, gain: 0.25 }); tone(160, t + 0.18, 0.25, { gain: 0.3, slide: 0.5 }); }),
  /** Wooden toy knock. */
  knock: safe((t) => { tone(520, t, 0.08, { type: "triangle", gain: 0.25 }); tone(390, t + 0.1, 0.08, { type: "triangle", gain: 0.2 }); }),
  /** A spinning top whirr. */
  whirr: safe((t) => { for (let i = 0; i < 10; i++) tone(500 + i * 40, t + i * 0.05, 0.08, { type: "triangle", gain: 0.05 }); }),
  /** The combination lock wheel turning. */
  tick: safe((t) => noise(t, 0.02, { freq: 4000, q: 6, gain: 0.35 })),
};
