// Grandpa's music box, synthesized with the Web Audio API: "Deck the Halls" (traditional, public
// domain). And the background music: a loop composed once with Eleven Music (web/public/music,
// server/scripts/render-music.ts), crossfaded into itself so it never seams. Everything goes through
// one master gain, so the music can duck under voices and stop exactly when statues need silence.

const DECK = [
  // [semitones from C5, beats]
  [7, 1.5], [5, 0.5], [4, 1], [2, 1], [0, 1], [2, 1], [4, 1], [0, 1],
  [2, 0.5], [4, 0.5], [5, 0.5], [2, 0.5], [4, 1.5], [2, 0.5], [0, 1], [-1, 1], [0, 2],
] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** The nodes of whatever is playing, so stop() can silence it at once. */
let playing: OscillatorNode[] = [];
let duckLevel = 1;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const FULL = 1;
/** Under the narrator and Grandpa the music nearly disappears; under Jingle and Alexa a bit less. */
const DUCK_STORY = 0.12;
const DUCK_CHAT = 0.2;
/** After a line ends, wait before swelling back, so it doesn't breathe between lines. */
const RELEASE_MS = 1400;

function out() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = duckLevel;
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

// ---- background loop ----

const BED_URL = "/music/workshop.mp3";
const BED_LEVEL = 0.24;
const XFADE = 4; // seconds of overlap between one pass and the next
const SKIP = 0.5; // the file opens with half a second of near-silence
let bedBuf: Promise<AudioBuffer | null> | null = null;
let bedGain: GainNode | null = null;
let bedOn = false;
let bedTimer: ReturnType<typeof setTimeout> | null = null;
let bedSources: AudioBufferSourceNode[] = [];
let unlockArmed = false;

function loadBed() {
  bedBuf ??= (async () => {
    try {
      const { c } = out();
      const res = await fetch(BED_URL);
      if (!res.ok) return null;
      return await c.decodeAudioData(await res.arrayBuffer());
    } catch { return null; }
  })();
  return bedBuf;
}

/** One pass of the loop starting at time `at`, fading in; schedules the next pass before it ends. */
function bedPass(buf: AudioBuffer, at: number) {
  if (!bedOn || !bedGain || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  const len = buf.duration - SKIP;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(1, at + XFADE);
  g.gain.setValueAtTime(1, at + len - XFADE);
  g.gain.linearRampToValueAtTime(0, at + len);
  src.connect(g).connect(bedGain);
  src.start(at, SKIP);
  src.stop(at + len + 0.05);
  bedSources.push(src);
  src.onended = () => { bedSources = bedSources.filter((x) => x !== src); };
  const next = at + len - XFADE;
  bedTimer = setTimeout(() => bedPass(buf, next), Math.max(0, (next - ctx.currentTime - 1) * 1000));
}

export const backgroundMusic = {
  /** Fades the loop in (or keeps it playing). */
  async start() {
    if (bedOn) return;
    bedOn = true;
    // Browsers keep audio suspended until the first key or tap: resume it then.
    if (!unlockArmed) {
      unlockArmed = true;
      const unlock = () => { if (ctx?.state === "suspended") void ctx.resume(); };
      window.addEventListener("keydown", unlock);
      window.addEventListener("pointerdown", unlock);
    }
    try {
      const { c, m } = out();
      if (!bedGain) { bedGain = c.createGain(); bedGain.connect(m); }
      bedGain.gain.cancelScheduledValues(c.currentTime);
      bedGain.gain.setValueAtTime(bedGain.gain.value, c.currentTime);
      bedGain.gain.linearRampToValueAtTime(BED_LEVEL, c.currentTime + 2);
      if (bedSources.length) return; // still fading out from a stop: just bring it back up
      const buf = await loadBed();
      if (buf && bedOn && !bedSources.length) bedPass(buf, c.currentTime + 0.05);
    } catch { /* no audio on this device */ }
  },
  /** Fades the loop out (chapters with their own music). */
  stop() {
    bedOn = false;
    if (bedTimer) { clearTimeout(bedTimer); bedTimer = null; }
    if (!bedGain || !ctx) return;
    const t = ctx.currentTime;
    bedGain.gain.cancelScheduledValues(t);
    bedGain.gain.setValueAtTime(bedGain.gain.value, t);
    bedGain.gain.linearRampToValueAtTime(0, t + 1.5);
    const dying = bedSources;
    setTimeout(() => { if (!bedOn) { for (const s of dying) { try { s.stop(); } catch { /* ended */ } } bedSources = bedSources.filter((x) => !dying.includes(x)); } }, 1600);
  },
};

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
  /** Lower the music while someone speaks: "story" for the narrator and Grandpa (deeper), "chat"
   * for Jingle and Alexa, null when quiet (the music comes back after a short pause). */
  duck(voice: "story" | "chat" | null) {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
    const apply = (level: number, tc: number) => {
      duckLevel = level;
      if (master && ctx) master.gain.setTargetAtTime(level, ctx.currentTime, tc);
    };
    if (voice) apply(voice === "story" ? DUCK_STORY : DUCK_CHAT, 0.08);
    else releaseTimer = setTimeout(() => apply(FULL, 0.6), RELEASE_MS);
  },
  chime() {
    try {
      const { c } = out();
      const t = c.currentTime + 0.05;
      note(t, 12, 0.3); note(t + 0.12, 16, 0.3); note(t + 0.24, 19, 0.5);
    } catch { /* no audio */ }
  },
};
