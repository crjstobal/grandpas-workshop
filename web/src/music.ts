// Grandpa's music box, synthesized with the Web Audio API: no audio files to license.
// "Deck the Halls" (traditional, public domain). Everything goes through one master gain, so the
// music can duck under voices and stop exactly when statues need silence.

const DECK = [
  // [semitones from C5, beats]
  [7, 1.5], [5, 0.5], [4, 1], [2, 1], [0, 1], [2, 1], [4, 1], [0, 1],
  [2, 0.5], [4, 0.5], [5, 0.5], [2, 0.5], [4, 1.5], [2, 0.5], [0, 1], [-1, 1], [0, 2],
] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** The nodes of whatever is playing, so stop() can silence it at once. */
let playing: OscillatorNode[] = [];
let ducked = false;
const FULL = 1;
const DUCKED = 0.3;

function out() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = ducked ? DUCKED : FULL;
    master.connect(ctx.destination);
  }
  return { c: ctx, m: master };
}

function note(at: number, semis: number, dur: number) {
  const { c, m } = out();
  const f = 440 * Math.pow(2, (semis + 3) / 12);
  for (const [mult, gain] of [[1, 0.22], [2, 0.06], [3, 0.03]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.6, dur * 2));
    o.connect(g).connect(m);
    o.start(at);
    o.stop(at + Math.max(0.7, dur * 2.1));
    playing.push(o);
    o.onended = () => { playing = playing.filter((x) => x !== o); };
  }
}

export const musicBox = {
  /** record: Grandpa's song twice. finale: three times, the last an octave up. dance: loops until stop(). */
  play(kind: "record" | "finale" | "dance", opts: { tempo?: number } = {}) {
    try {
      const { c } = out();
      const beat = (kind === "record" ? 0.42 : kind === "dance" ? 0.3 : 0.36) / (opts.tempo ?? 1);
      let t = c.currentTime + 0.1;
      const repeats = kind === "record" ? 2 : kind === "dance" ? 6 : 3;
      for (let r = 0; r < repeats; r++) {
        for (const [s, b] of DECK) { note(t, s + (kind === "finale" && r === 2 ? 12 : 0), b * beat); t += b * beat; }
      }
    } catch { /* no audio on this device */ }
  },
  /** Silence now (statues: the music stops, freeze!). */
  stop() {
    for (const o of playing) { try { o.stop(); } catch { /* already stopped */ } }
    playing = [];
  },
  /** Lower the music while someone speaks. */
  duck(on: boolean) {
    ducked = on;
    if (!master || !ctx) return;
    master.gain.setTargetAtTime(on ? DUCKED : FULL, ctx.currentTime, 0.15);
  },
  chime() {
    try {
      const { c } = out();
      const t = c.currentTime + 0.05;
      note(t, 12, 0.3); note(t + 0.12, 16, 0.3); note(t + 0.24, 19, 0.5);
    } catch { /* no audio */ }
  },
};
