// Statues on the TV: while the gramophone plays, the toys and Jingle dance (the phones' energy
// makes the toys bounce harder, the remote's arrows make Jingle dance). When the music stops,
// everything freezes mid pose inside a block of ice. Any arrow press during the freeze tells the
// server Jingle moved. The server owns the phases (intro, music, freeze, caught, done); this
// screen only follows them.
//
// All the dancing runs in one requestAnimationFrame loop that writes transforms straight to the
// DOM (no React renders per frame, so it stays smooth on a Fire TV). Freezing is simply the dance
// clock stopping: every toy holds the exact pose it was in.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DanceState, PublicState } from "../../../shared/types";
import { api } from "../api";
import { musicBox } from "../music";
import { sfx } from "../sfx";
import "./DanceTv.css";
import { flySprite } from "./look";

type Phase = DanceState["phase"];
type Bind = (key: string) => (el: HTMLElement | SVGElement | null) => void;

const BEAT = 0.6; // seconds per bounce: two beats of the dance tune
const SIZE = 230; // Jingle's sprite size on the stage
const HOME = { x: 960, y: 790 };
const RANGE = { x0: 400, x1: 1520, y0: 430, y1: 820 };
const STEP = 95;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type MoveKind = "spin" | "squash" | "hop" | "wobble";

export function DanceTv({ state, bubble }: { state: PublicState; bubble: { line: string; at: number } | null }) {
  const d = state.dance;
  const phase = d.phase;
  const now = useNow(phase === "intro" || phase === "freeze" ? 100 : 0);

  // Live values for the animation loop and the key handler.
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const grooveRef = useRef(d.groove);
  grooveRef.current = d.groove;
  const codeRef = useRef(state.code);
  codeRef.current = state.code;
  const caughtRef = useRef(d.caught);
  caughtRef.current = d.caught;

  // ---- music and sound cues, following the server's phases ----
  const prev = useRef<{ phase: Phase | null; round: number }>({ phase: null, round: d.round });
  useEffect(() => {
    const p = prev.current;
    prev.current = { phase, round: d.round };
    if (phase === "music" && (p.phase !== "music" || p.round !== d.round)) {
      musicBox.stop();
      musicBox.play("dance");
      if (p.phase === "freeze") sfx.chime(); // a perfect statue
    } else if (phase !== "music" && p.phase === "music") {
      // The music stops at once: that IS the game.
      musicBox.stop();
      if (phase === "freeze") needleScratch();
    }
    if (phase === "caught" && p.phase !== "caught") sfx.boing();
    if (phase === "done" && p.phase !== null && p.phase !== "done") { sfx.chime(); sfx.sparkle(); }
  }, [phase, d.round]);
  useEffect(() => () => { if (prev.current.phase === "music") musicBox.stop(); }, []);

  // ---- the rig: DOM nodes the loop animates ----
  const parts = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const binders = useRef(new Map<string, (el: HTMLElement | SVGElement | null) => void>());
  const bind = useCallback<Bind>((key) => {
    let f = binders.current.get(key);
    if (!f) { f = (el) => { parts.current[key] = el; }; binders.current.set(key, f); }
    return f;
  }, []);

  // Jingle's controls.
  const jingle = useRef({ x: HOME.x, y: HOME.y, tx: HOME.x, ty: HOME.y, facing: -1 as 1 | -1, move: null as null | { kind: MoveKind; dir: number; at: number } });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const a = ARROWS[e.key];
      if (!a) return;
      e.preventDefault();
      const ph = phaseRef.current;
      const j = jingle.current;
      if (ph === "freeze") {
        // Held keys repeat: only a real new press counts, once per press.
        if (e.repeat) return;
        void api.danceMove(codeRef.current).catch(() => {});
        j.move = { kind: "wobble", dir: a[0] || 1, at: performance.now() };
        j.tx = clamp(j.tx + a[0] * 26, RANGE.x0, RANGE.x1);
        j.ty = clamp(j.ty + a[1] * 26, RANGE.y0, RANGE.y1);
        return;
      }
      const step = e.repeat ? STEP * 0.45 : STEP;
      j.tx = clamp(j.tx + a[0] * step, RANGE.x0, RANGE.x1);
      j.ty = clamp(j.ty + a[1] * step, RANGE.y0, RANGE.y1);
      if (a[0]) j.facing = a[0] > 0 ? 1 : -1;
      if (!e.repeat || !j.move || performance.now() - j.move.at > 420) {
        j.move = { kind: a[1] < 0 ? "spin" : a[1] > 0 ? "squash" : "hop", dir: a[0] || 1, at: performance.now() };
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const sim = { t: 0, amp: 0.1, giggle: 0, spin: 0, roll: 0, puff: 0, frameT: 0, frame: 0 };
    let raf = 0;
    let last = performance.now();
    const tf = (k: string, v: string) => { const el = parts.current[k]; if (el) el.style.transform = v; };
    const op = (k: string, v: number) => { const el = parts.current[k]; if (el) el.style.opacity = String(v); };

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const ph = phaseRef.current;
      const frozen = ph === "freeze";
      if (!frozen) {
        const target = ph === "music" ? 0.35 + 0.65 * grooveRef.current : ph === "intro" ? 0.14 : ph === "caught" ? 0.04 : 0;
        sim.amp += (target - sim.amp) * Math.min(1, dt * 3);
        sim.t += dt * (ph === "music" ? 1 : ph === "intro" ? 0.45 : 0.3);
        sim.spin += dt * (30 + 300 * sim.amp);
        sim.roll += dt * (60 + 640 * sim.amp);
        sim.puff += dt * (0.35 + 1.2 * sim.amp);
        sim.giggle = ph === "caught" ? sim.giggle + dt : 0;
      }
      const A = sim.amp;
      const b = (sim.t * Math.PI * 2) / BEAT;
      const s = Math.sin(b);
      const up = Math.abs(s);
      const gig = ph === "caught" ? Math.sin(sim.giggle * 40) * 3 * Math.max(0, 1 - sim.giggle / 2.5) : 0;

      // Nutcracker: hops, arms swinging up in turn, jaw clacking.
      tf("nut", `translateY(${-up * 38 * A}px) rotate(${s * 7 * A + gig}deg)`);
      tf("nut.armL", `rotate(${(0.5 + 0.5 * s) * 130 * A}deg)`);
      tf("nut.armR", `rotate(${-(0.5 - 0.5 * s) * 130 * A}deg)`);
      tf("nut.jaw", `translateY(${Math.max(0, Math.sin(b * 2)) * 8 * A}px)`);
      // Drummer: bounces and drums, plume flicking.
      tf("drum", `translateY(${-up * 24 * A}px) rotate(${-s * 4 * A - gig}deg)`);
      tf("drum.stickL", `rotate(${Math.sin(b * 2) * 38 * A}deg)`);
      tf("drum.stickR", `rotate(${Math.sin(b * 2) * 38 * A}deg)`);
      tf("drum.plume", `rotate(${Math.sin(b * 2 + 1) * 22 * A}deg)`);
      // Spinning top: stripes whirl, the top wobbles and hops.
      tf("top", `translateY(${-up * 16 * A}px) rotate(${Math.sin(b * 0.5) * 16 * A + gig}deg)`);
      tf("top.stripes", `translateX(${sim.spin % 108}px)`);
      // Train: chugs back and forth, wheels rolling, smoke puffing.
      tf("train", `translate(${Math.sin(b * 0.5) * 26 * A}px, ${-Math.abs(Math.sin(b * 2)) * 9 * A}px) rotate(${gig * 0.5}deg)`);
      tf("train.w1", `rotate(${-sim.roll}deg)`);
      tf("train.w2", `rotate(${-sim.roll}deg)`);
      tf("train.w3", `rotate(${-sim.roll * 0.75}deg)`);
      for (let k = 0; k < 3; k++) {
        const p = (sim.puff + k / 3) % 1;
        tf(`train.p${k}`, `translate(${p * 46}px, ${-p * 120}px) scale(${0.35 + p * 1.15})`);
        op(`train.p${k}`, 0.9 * (1 - p));
      }

      // Jingle: glides to where the arrows send him, dances on the beat, plus one-off moves.
      const j = jingle.current;
      j.x += (j.tx - j.x) * Math.min(1, dt * 9);
      j.y += (j.ty - j.y) * Math.min(1, dt * 9);
      let lift = -up * 30 * A;
      let rot = s * 9 * A;
      let sx = 1;
      let sy = 1;
      if (j.move) {
        const age = t - j.move.at;
        if (j.move.kind === "spin" && age < 520) { const k = age / 520; rot += easeOut(k) * 360 * j.move.dir; lift -= Math.sin(Math.PI * k) * 90; }
        else if (j.move.kind === "squash" && age < 420) { const k = Math.sin((Math.PI * age) / 420); sy -= 0.32 * k; sx += 0.22 * k; }
        else if (j.move.kind === "hop" && age < 380) { const k = Math.sin((Math.PI * age) / 380); lift -= 46 * k; rot += 16 * k * j.move.dir; }
        else if (j.move.kind === "wobble" && age < 800) { rot += Math.sin(age * 0.05) * 16 * (1 - age / 800); }
        else j.move = null;
      }
      if (ph === "caught" && caughtRef.current === "Jingle") rot += Math.sin(sim.giggle * 7) * 18;
      tf("jingle", `translate(${j.x - SIZE / 2}px, ${j.y - SIZE / 2}px)`);
      tf("jingle.pose", `translateY(${lift}px) rotate(${rot}deg) scale(${sx * -j.facing}, ${sy})`);
      // Wing frames: flapping to the music, held still in the freeze.
      if (!frozen) {
        sim.frameT += dt;
        const every = ph === "music" ? 0.14 : ph === "caught" ? 0.11 : 0.28;
        if (sim.frameT > every) {
          sim.frameT = 0;
          sim.frame = 1 - sim.frame;
          const img = parts.current["jingle.img"] as HTMLImageElement | undefined;
          if (img) img.src = flySprite(sim.frame);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const remaining = d.until ? Math.max(0, d.until - now) : 0;
  const secs = Math.ceil(remaining / 1000);
  const waitingForRecord = phase === "intro" && !d.until;
  const caughtPlayer = d.caught ? state.players.find((p) => p.name === d.caught) : undefined;
  const showBubble = bubble && Date.now() - bubble.at < 7000 && phase !== "freeze";
  const doneRounds = phase === "done" ? d.rounds : d.round;

  return (
    <div className={`dt dt-ph-${phase}`}>
      {phase === "music" && (
        <div className="dt-beams" aria-hidden>
          <i className="b1" /><i className="b2" /><i className="b3" />
        </div>
      )}
      <Notes playing={phase === "music"} frozen={phase === "freeze"} />

      <div className={`dt-toys ${phase === "freeze" ? "frozen" : ""} ${phase === "done" ? "bow" : ""}`}>
        <Toys bind={bind} />
      </div>

      <div className="dt-jingle" ref={bind("jingle")}>
        <div className="dt-jingle-pose" ref={bind("jingle.pose")}>
          <img ref={bind("jingle.img")} src={flySprite(0)} alt="Jingle" />
        </div>
        {phase === "freeze" && <div className="dt-ice" />}
        {phase === "caught" && d.caught === "Jingle" && <DizzyStars />}
        {phase === "music" && d.round === 0 && <div className="dt-jingle-hint">Arrows make me dance!</div>}
        {showBubble && <div className={`bubble dt-bubble ${jingle.current.x > 1100 ? "left" : "right"}`} key={bubble!.at}>{bubble!.line}</div>}
      </div>

      {phase === "freeze" && <Frost />}

      {!waitingForRecord && (
        <div className="dt-round">
          <span>{phase === "done" ? "All statues done" : `Statue ${Math.min(d.round + 1, d.rounds)} of ${d.rounds}`}</span>
          <span className="dt-pips">
            {Array.from({ length: d.rounds }, (_, i) => <i key={i} className={i < doneRounds ? "on" : i === d.round && phase !== "done" ? "now" : ""} />)}
          </span>
        </div>
      )}

      {waitingForRecord && (
        <div className="dt-listen">
          <MiniRecord />
          <span>Listen to Grandpa's record...</span>
        </div>
      )}

      {phase === "intro" && !waitingForRecord && (
        <>
          {secs <= 3 && secs > 0
            ? <div className="dt-title dt-count" key={secs}>{secs}</div>
            : <div className="dt-title dt-ready">Statues!</div>}
          <HowTo />
        </>
      )}

      {phase === "music" && (
        <>
          <div className="dt-title dt-dance" key={`dance-${d.round}`} aria-label="Dance!">
            {"DANCE!".split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }}>{c}</span>)}
          </div>
          <div className="dt-groove">
            <span>Dance power</span>
            <div className="dt-meter"><div style={{ width: `${Math.round(18 + d.groove * 82)}%` }} /></div>
          </div>
        </>
      )}

      {phase === "freeze" && (
        <>
          <div className="dt-title dt-freeze" aria-label="Freeze!">
            {"FREEZE!".split("").map((c, i) => <span key={i} style={{ ["--r" as string]: `${((i * 37) % 9) - 4}deg` }}>{c}</span>)}
          </div>
          <div className="dt-hold">
            <span>Don't move a feather!</span>
            <div className="dt-icebar"><div style={{ width: `${Math.round(100 * (1 - remaining / 3500))}%` }} /></div>
          </div>
        </>
      )}

      {phase === "caught" && d.caught && (
        <div className="dt-caught" key={`${d.caught}-${d.until}`}>
          <WobbleMarks />
          <div className="dt-stamp">Wobbly!</div>
          <div className="dt-who">
            {caughtPlayer && <span className="dt-dot" style={{ background: caughtPlayer.color }} />}
            {d.caught === "Jingle" ? "Jingle wiggled his wings!" : `${d.caught} wiggled!`}
          </div>
          <div className="dt-again">Everybody, back to dancing!</div>
        </div>
      )}

      {phase === "done" && (
        <>
          <Confetti />
          <div className="dt-title dt-win">Perfect statues!</div>
          <div className="dt-win-sub"><MiniRecord gold /> Grandpa's song is yours</div>
        </>
      )}
    </div>
  );
}

function useNow(every: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!every) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return every ? now : Date.now();
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

// The needle dragged across the record when the music stops.
let scratchCtx: AudioContext | null = null;
function needleScratch() {
  try {
    scratchCtx ??= new AudioContext();
    const c = scratchCtx;
    if (c.state === "suspended") void c.resume();
    const t = c.currentTime + 0.01;
    const dur = 0.32;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  } catch { /* no audio */ }
}

// ---------------- the toys ----------------

const Toys = memo(function Toys({ bind }: { bind: Bind }) {
  return (
    <>
      <div className="dt-toy" style={{ left: 110, bottom: 54, width: 210, height: 400 }}>
        <Nutcracker bind={bind} />
        <div className="dt-ice" />
      </div>
      <div className="dt-toy" style={{ left: 440, bottom: 54, width: 236, height: 386, animationDelay: "0.12s" }}>
        <Drummer bind={bind} />
        <div className="dt-ice" />
      </div>
      <div className="dt-toy" style={{ left: 1245, bottom: 54, width: 196, height: 268, animationDelay: "0.24s" }}>
        <SpinningTop bind={bind} />
        <div className="dt-ice" />
      </div>
      <div className="dt-toy" style={{ left: 1488, bottom: 54, width: 330, height: 242, animationDelay: "0.36s" }}>
        <Train bind={bind} />
        <div className="dt-ice" />
      </div>
    </>
  );
});

const o = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px` });

function Nutcracker({ bind }: { bind: Bind }) {
  return (
    <svg viewBox="0 0 200 380" width="100%" height="100%" aria-label="Nutcracker">
      <defs>
        <linearGradient id="dt-red" x1="0" x2="1"><stop offset="0" stopColor="#7e231b" /><stop offset="0.45" stopColor="#d24b3b" /><stop offset="1" stopColor="#6f1e17" /></linearGradient>
        <linearGradient id="dt-gold" x1="0" x2="1"><stop offset="0" stopColor="#8a6224" /><stop offset="0.5" stopColor="#f3d27e" /><stop offset="1" stopColor="#8a6224" /></linearGradient>
        <linearGradient id="dt-blue" x1="0" x2="1"><stop offset="0" stopColor="#1a2f5c" /><stop offset="0.5" stopColor="#3d62ad" /><stop offset="1" stopColor="#172a52" /></linearGradient>
        <linearGradient id="dt-black" x1="0" x2="1"><stop offset="0" stopColor="#0d0d12" /><stop offset="0.5" stopColor="#3c3c48" /><stop offset="1" stopColor="#0a0a0e" /></linearGradient>
        <linearGradient id="dt-skin" x1="0" x2="1"><stop offset="0" stopColor="#d9a377" /><stop offset="0.5" stopColor="#f8d6b2" /><stop offset="1" stopColor="#cf966a" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="371" rx="72" ry="9" fill="#000" opacity="0.4" />
      <g className="dt-rig" ref={bind("nut")} style={o(100, 368)}>
        <rect x="62" y="326" width="34" height="42" rx="10" fill="url(#dt-black)" />
        <rect x="104" y="326" width="34" height="42" rx="10" fill="url(#dt-black)" />
        <rect x="66" y="250" width="28" height="84" rx="6" fill="url(#dt-blue)" />
        <rect x="106" y="250" width="28" height="84" rx="6" fill="url(#dt-blue)" />
        <rect x="77" y="254" width="6" height="76" fill="#e8c26a" opacity="0.85" />
        <rect x="117" y="254" width="6" height="76" fill="#e8c26a" opacity="0.85" />
        <path d="M58 168 Q100 156 142 168 L150 262 Q100 272 50 262 Z" fill="url(#dt-red)" />
        <rect x="93" y="166" width="14" height="70" fill="#f6ecd9" />
        <circle cx="100" cy="184" r="4.5" fill="url(#dt-gold)" /><circle cx="100" cy="202" r="4.5" fill="url(#dt-gold)" /><circle cx="100" cy="220" r="4.5" fill="url(#dt-gold)" />
        <rect x="53" y="236" width="94" height="14" fill="#16161b" />
        <rect x="90" y="233" width="20" height="20" rx="3" fill="none" stroke="#f3d27e" strokeWidth="4" />
        <path d="M50 256 Q100 266 150 256 L151 266 Q100 276 49 266 Z" fill="url(#dt-gold)" />
        {/* head */}
        <rect x="68" y="96" width="64" height="76" rx="18" fill="url(#dt-skin)" />
        <path d="M68 108 q-10 32 4 62 l8 -4 q-7 -28 0 -54z" fill="#f4efe6" />
        <path d="M132 108 q10 32 -4 62 l-8 -4 q7 -28 0 -54z" fill="#f4efe6" />
        <circle cx="80" cy="134" r="7" fill="#e3735f" opacity="0.5" /><circle cx="120" cy="134" r="7" fill="#e3735f" opacity="0.5" />
        <path d="M78 108 q8 -5 16 0 M106 108 q8 -5 16 0" stroke="#2b1d14" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <ellipse cx="86" cy="120" rx="5" ry="6" fill="#1b120c" /><ellipse cx="114" cy="120" rx="5" ry="6" fill="#1b120c" />
        <circle cx="87.6" cy="118" r="1.8" fill="#fff" /><circle cx="115.6" cy="118" r="1.8" fill="#fff" />
        <rect x="84" y="142" width="32" height="14" rx="4" fill="#3b0f0b" />
        <g className="dt-rig" ref={bind("nut.jaw")}>
          <path d="M74 146 h52 v16 q-26 18 -52 0z" fill="#fbf7ef" />
          <rect x="88" y="146" width="24" height="5" rx="2" fill="#f0e6d4" />
        </g>
        <ellipse cx="100" cy="130" rx="6" ry="7" fill="#e9a07a" />
        <path d="M100 140 q-12 -7 -26 3 q13 6 26 0 q13 6 26 0 q-14 -10 -26 -3z" fill="#fbf7ef" />
        {/* hat */}
        <rect x="64" y="24" width="72" height="78" rx="8" fill="url(#dt-black)" />
        <rect x="64" y="80" width="72" height="10" fill="url(#dt-gold)" />
        <rect x="60" y="94" width="80" height="10" rx="4" fill="#16161b" />
        <path d="M100 38 l11 15 l-11 15 l-11 -15z" fill="url(#dt-gold)" />
        <ellipse cx="100" cy="18" rx="13" ry="14" fill="#d24b3b" />
        <ellipse cx="96" cy="13" rx="4" ry="5" fill="#ff9a8a" opacity="0.6" />
        {/* arms */}
        <g className="dt-rig" ref={bind("nut.armL")} style={o(52, 172)}>
          <rect x="40" y="166" width="22" height="80" rx="11" fill="url(#dt-red)" />
          <rect x="40" y="232" width="22" height="8" fill="url(#dt-gold)" />
          <circle cx="51" cy="250" r="12" fill="#fbf7ef" />
        </g>
        <g className="dt-rig" ref={bind("nut.armR")} style={o(148, 172)}>
          <rect x="138" y="166" width="22" height="80" rx="11" fill="url(#dt-red)" />
          <rect x="138" y="232" width="22" height="8" fill="url(#dt-gold)" />
          <circle cx="149" cy="250" r="12" fill="#fbf7ef" />
        </g>
        <ellipse cx="52" cy="168" rx="17" ry="8" fill="url(#dt-gold)" />
        <ellipse cx="148" cy="168" rx="17" ry="8" fill="url(#dt-gold)" />
      </g>
    </svg>
  );
}

function Drummer({ bind }: { bind: Bind }) {
  return (
    <svg viewBox="0 0 220 360" width="100%" height="100%" aria-label="Toy soldier drummer">
      <defs>
        <linearGradient id="dt-navy" x1="0" x2="1"><stop offset="0" stopColor="#16305c" /><stop offset="0.5" stopColor="#2f5aa0" /><stop offset="1" stopColor="#132a50" /></linearGradient>
        <linearGradient id="dt-drum" x1="0" x2="1"><stop offset="0" stopColor="#6f1e17" /><stop offset="0.4" stopColor="#d24b3b" /><stop offset="1" stopColor="#6a1c15" /></linearGradient>
      </defs>
      <ellipse cx="110" cy="351" rx="78" ry="9" fill="#000" opacity="0.4" />
      <g className="dt-rig" ref={bind("drum")} style={o(110, 348)}>
        <rect x="78" y="310" width="28" height="36" rx="9" fill="url(#dt-black)" />
        <rect x="114" y="310" width="28" height="36" rx="9" fill="url(#dt-black)" />
        <rect x="81" y="246" width="24" height="70" rx="5" fill="#f3ead8" />
        <rect x="115" y="246" width="24" height="70" rx="5" fill="#f3ead8" />
        <rect x="90" y="250" width="5" height="62" fill="#c2402f" /><rect x="125" y="250" width="5" height="62" fill="#c2402f" />
        <path d="M70 152 Q110 140 150 152 L156 252 Q110 262 64 252 Z" fill="url(#dt-navy)" />
        <path d="M76 158 L144 238 M144 158 L76 238" stroke="#f6ecd9" strokeWidth="9" strokeLinecap="round" />
        <circle cx="110" cy="198" r="7" fill="url(#dt-gold)" />
        <rect x="88" y="146" width="44" height="10" rx="5" fill="url(#dt-gold)" />
        {/* head */}
        <circle cx="110" cy="120" r="30" fill="url(#dt-skin)" />
        <circle cx="94" cy="130" r="6" fill="#e3735f" opacity="0.5" /><circle cx="126" cy="130" r="6" fill="#e3735f" opacity="0.5" />
        <ellipse cx="99" cy="118" rx="4" ry="5" fill="#1b120c" /><ellipse cx="121" cy="118" rx="4" ry="5" fill="#1b120c" />
        <circle cx="100.4" cy="116.4" r="1.5" fill="#fff" /><circle cx="122.4" cy="116.4" r="1.5" fill="#fff" />
        <path d="M100 134 q10 9 20 0" stroke="#5a1a14" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M84 132 q-2 16 10 20 M136 132 q2 16 -10 20" stroke="#f3d27e" strokeWidth="3" fill="none" />
        {/* shako */}
        <g className="dt-rig" ref={bind("drum.plume")} style={o(110, 38)}>
          <path d="M110 40 C96 30 98 10 110 2 C122 10 124 30 110 40Z" fill="#fbf7ef" />
          <path d="M110 12 C104 8 106 3 110 1 C114 3 116 8 110 12Z" fill="#d24b3b" />
        </g>
        <path d="M84 100 L88 38 Q110 32 132 38 L136 100 Z" fill="url(#dt-drum)" />
        <rect x="85" y="86" width="50" height="9" fill="url(#dt-gold)" />
        <circle cx="110" cy="62" r="9" fill="url(#dt-gold)" />
        <ellipse cx="110" cy="101" rx="28" ry="6" fill="#16161b" />
        {/* drum */}
        <rect x="52" y="232" width="116" height="62" fill="url(#dt-drum)" />
        <polyline points="52,240 71,286 90,240 110,286 129,240 148,286 168,240" fill="none" stroke="#f6ecd9" strokeWidth="4" strokeLinejoin="round" />
        <rect x="50" y="288" width="120" height="9" rx="3" fill="url(#dt-gold)" />
        <rect x="50" y="228" width="120" height="9" rx="3" fill="url(#dt-gold)" />
        <ellipse cx="110" cy="229" rx="58" ry="12" fill="#f3e6c8" stroke="#c8963e" strokeWidth="3" />
        {/* arms and sticks */}
        <g className="dt-rig" ref={bind("drum.stickL")} style={o(74, 160)}>
          <rect x="64" y="154" width="20" height="62" rx="10" fill="url(#dt-navy)" />
          <line x1="76" y1="212" x2="112" y2="222" stroke="#8a5a2b" strokeWidth="6" strokeLinecap="round" />
          <circle cx="113" cy="222" r="6" fill="#f3e6c8" />
          <circle cx="75" cy="214" r="9" fill="#fbf7ef" />
        </g>
        <g className="dt-rig" ref={bind("drum.stickR")} style={o(146, 160)}>
          <rect x="136" y="154" width="20" height="62" rx="10" fill="url(#dt-navy)" />
          <line x1="144" y1="212" x2="108" y2="222" stroke="#8a5a2b" strokeWidth="6" strokeLinecap="round" />
          <circle cx="107" cy="222" r="6" fill="#f3e6c8" />
          <circle cx="145" cy="214" r="9" fill="#fbf7ef" />
        </g>
      </g>
    </svg>
  );
}

const STRIPES = ["#b23a2e", "#f6ecd9", "#2e5e4e"];

function SpinningTop({ bind }: { bind: Bind }) {
  return (
    <svg viewBox="0 0 220 300" width="100%" height="100%" aria-label="Spinning top">
      <defs>
        <clipPath id="dt-topclip"><path d="M110 290 L24 150 Q20 110 60 94 Q110 78 160 94 Q200 110 196 150 Z" /></clipPath>
        <linearGradient id="dt-topshade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" /><stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.12" /><stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="292" rx="58" ry="8" fill="#000" opacity="0.4" />
      <g className="dt-rig" ref={bind("top")} style={o(110, 290)}>
        <rect x="101" y="16" width="18" height="70" rx="6" fill="url(#dt-gold)" />
        <circle cx="110" cy="16" r="13" fill="url(#dt-gold)" />
        <g clipPath="url(#dt-topclip)">
          <rect x="0" y="0" width="220" height="300" fill="#f6ecd9" />
          <g className="dt-rig" ref={bind("top.stripes")}>
            {Array.from({ length: 12 }, (_, i) => <rect key={i} x={-108 + i * 36} y="0" width="36" height="300" fill={STRIPES[i % 3]} />)}
          </g>
          <rect x="0" y="0" width="220" height="300" fill="url(#dt-topshade)" />
          <ellipse cx="78" cy="132" rx="14" ry="36" fill="#fff" opacity="0.3" />
        </g>
        <path d="M23 150 Q110 178 197 150" stroke="url(#dt-gold)" strokeWidth="9" fill="none" strokeLinecap="round" />
        <ellipse cx="110" cy="94" rx="50" ry="13" fill="#7e231b" />
        <ellipse cx="110" cy="92" rx="44" ry="9" fill="#c2402f" />
      </g>
    </svg>
  );
}

function Wheel({ bind, k, x, y, r }: { bind: Bind; k: string; x: number; y: number; r: number }) {
  return (
    <g className="dt-rig" ref={bind(k)} style={o(x, y)}>
      <circle cx={x} cy={y} r={r} fill="#b23a2e" stroke="#2b1d14" strokeWidth="5" />
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1={x - Math.cos((a * Math.PI) / 180) * (r - 4)} y1={y - Math.sin((a * Math.PI) / 180) * (r - 4)}
          x2={x + Math.cos((a * Math.PI) / 180) * (r - 4)} y2={y + Math.sin((a * Math.PI) / 180) * (r - 4)} stroke="#f3d27e" strokeWidth="4" />
      ))}
      <circle cx={x} cy={y} r={r * 0.28} fill="url(#dt-gold)" />
    </g>
  );
}

function Train({ bind }: { bind: Bind }) {
  return (
    <svg viewBox="0 0 300 220" width="100%" height="100%" aria-label="Toy train">
      <defs>
        <linearGradient id="dt-pine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4b8a72" /><stop offset="0.5" stopColor="#2e5e4e" /><stop offset="1" stopColor="#1c3d32" /></linearGradient>
        <linearGradient id="dt-cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d24b3b" /><stop offset="1" stopColor="#7e231b" /></linearGradient>
      </defs>
      <ellipse cx="150" cy="208" rx="132" ry="9" fill="#000" opacity="0.4" />
      <g className="dt-rig" ref={bind("train")} style={o(150, 205)}>
        {[0, 1, 2].map((k) => (
          <g key={k} className="dt-rig" ref={bind(`train.p${k}`)} style={o(80, 30)}>
            <circle cx="80" cy="30" r="17" fill="#f6ecd9" />
            <circle cx="72" cy="25" r="7" fill="#fff" opacity="0.7" />
          </g>
        ))}
        <rect x="28" y="146" width="244" height="18" rx="4" fill="#2b1d14" />
        <path d="M46 146 L16 172 H62 Z" fill="url(#dt-gold)" />
        <path d="M70 84 H190 V148 H70 Q44 148 44 116 Q44 84 70 84 Z" fill="url(#dt-pine)" />
        <rect x="96" y="84" width="8" height="64" fill="url(#dt-gold)" /><rect x="150" y="84" width="8" height="64" fill="url(#dt-gold)" />
        <rect x="32" y="96" width="18" height="18" rx="5" fill="url(#dt-gold)" /><circle cx="38" cy="105" r="5" fill="#fff6d6" />
        <path d="M66 84 L62 48 H98 L94 84 Z" fill="url(#dt-black)" />
        <rect x="57" y="40" width="46" height="10" rx="3" fill="url(#dt-gold)" />
        <path d="M116 84 Q128 60 140 84 Z" fill="url(#dt-gold)" />
        <rect x="188" y="54" width="80" height="94" rx="6" fill="url(#dt-cab)" />
        <rect x="202" y="68" width="50" height="38" rx="6" fill="#ffe2a0" stroke="#f3d27e" strokeWidth="4" />
        <rect x="180" y="42" width="96" height="16" rx="6" fill="#2b1d14" />
        <Wheel bind={bind} k="train.w1" x={88} y={174} r={24} />
        <Wheel bind={bind} k="train.w2" x={146} y={174} r={24} />
        <Wheel bind={bind} k="train.w3" x={228} y={168} r={32} />
      </g>
    </svg>
  );
}

// ---------------- overlays and decorations ----------------

const NOTE_PATHS = ["M10 0 v26 a8 6 0 1 1 -4 -5 v-15 l14 4 v-4z", "M4 0 h22 v24 a7 5 0 1 1 -4 -4 v-12 h-14 v16 a7 5 0 1 1 -4 -4z"];

/** Notes floating out of the gramophone's horn. They stop mid air when the music does. */
function Notes({ playing, frozen }: { playing: boolean; frozen: boolean }) {
  if (!playing && !frozen) return null;
  return (
    <div className={`dt-notes ${frozen ? "frozen" : ""}`} aria-hidden>
      {[-560, -420, -300, 300, 430, 560, -480, 500].map((dx, i) => (
        <svg key={i} viewBox="0 0 30 34" width="72" height="82" style={{ ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${90 + (i % 4) * 70}px`, animationDelay: `${i * 0.33}s` }}>
          <path d={NOTE_PATHS[i % 2]} fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

function Frost() {
  return (
    <div className="dt-frost" aria-hidden>
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <svg key={c} className={`dt-crystal ${c}`} viewBox="0 0 200 200" width="360" height="360">
          <g stroke="#eef8ff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.9">
            <path d="M0 0 L150 150 M40 40 L40 0 M40 40 L0 40 M80 80 L80 30 M80 80 L30 80 M118 118 L118 76 M118 118 L76 118" />
            <path d="M0 70 L70 140 M30 100 L30 70 M0 130 L40 170" opacity="0.6" />
            <path d="M70 0 L140 70 M100 30 L70 30 M130 0 L170 40" opacity="0.6" />
          </g>
        </svg>
      ))}
    </div>
  );
}

function DizzyStars() {
  return (
    <div className="dt-dizzy" aria-hidden>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 20 20" width="40" height="40" style={{ animationDelay: `${-i * 0.4}s` }}>
          <path d="M10 0 L12.6 7 L20 7.6 L14.2 12.2 L16.2 20 L10 15.6 L3.8 20 L5.8 12.2 L0 7.6 L7.4 7Z" fill="#ffd66b" />
        </svg>
      ))}
    </div>
  );
}

function WobbleMarks() {
  return (
    <svg className="dt-marks" viewBox="0 0 1000 200" aria-hidden>
      <g stroke="#b23a2e" strokeWidth="9" fill="none" strokeLinecap="round">
        <path d="M60 70 q20 -20 40 0 t40 0" /><path d="M40 120 q20 -20 40 0 t40 0" />
        <path d="M860 70 q20 -20 40 0 t40 0" /><path d="M880 120 q20 -20 40 0 t40 0" />
      </g>
    </svg>
  );
}

function MiniRecord({ gold }: { gold?: boolean }) {
  return (
    <svg className={`dt-minirec ${gold ? "gold" : ""}`} viewBox="0 0 40 40" width="52" height="52" aria-hidden>
      <circle cx="20" cy="20" r="19" fill={gold ? "#e8b84a" : "#141414"} />
      <circle cx="20" cy="20" r="14" fill="none" stroke={gold ? "#fff1c2" : "#333"} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="10" fill="none" stroke={gold ? "#fff1c2" : "#333"} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="6" fill="#b23a2e" />
      <circle cx="20" cy="20" r="1.6" fill="#f6ecd9" />
    </svg>
  );
}

function HowTo() {
  return (
    <div className="dt-howto">
      <div className="dt-card">
        <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden>
          <g className="dt-howto-dance">
            <rect x="58" y="18" width="44" height="80" rx="9" fill="#3a2516" />
            <rect x="63" y="26" width="34" height="60" rx="4" fill="#ffcf6b" />
          </g>
          <g stroke="#b23a2e" strokeWidth="6" fill="none" strokeLinecap="round">
            <path d="M40 40 q-12 18 0 36" /><path d="M24 30 q-18 28 0 56" /><path d="M120 40 q12 18 0 36" /><path d="M136 30 q18 28 0 56" />
          </g>
        </svg>
        <span>Music plays</span>
        <strong>Dance!</strong>
      </div>
      <div className="dt-card icy">
        <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden>
          <rect x="44" y="10" width="72" height="100" rx="14" fill="#cfeaff" opacity="0.7" stroke="#ffffff" strokeWidth="3" />
          <rect x="58" y="20" width="44" height="80" rx="9" fill="#3a2516" />
          <rect x="63" y="28" width="34" height="60" rx="4" fill="#9fd3ff" />
          <path d="M52 22 l10 -6 M98 104 l10 -6" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span>Music stops</span>
        <strong>Freeze!</strong>
      </div>
      <div className="dt-card remote">
        <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden>
          <rect x="56" y="6" width="48" height="110" rx="22" fill="#2b2b33" />
          <circle cx="80" cy="42" r="20" fill="#43434f" />
          <circle cx="80" cy="42" r="9" fill="#c8963e" />
          <path d="M80 26 l-5 6 h10z M80 58 l-5 -6 h10z M64 42 l6 -5 v10z M96 42 l-6 -5 v10z" fill="#f6ecd9" />
          <circle cx="70" cy="80" r="5" fill="#6a6a78" /><circle cx="90" cy="80" r="5" fill="#6a6a78" />
        </svg>
        <span>Jingle dances</span>
        <strong>with the arrows</strong>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["#ffd66b", "#b23a2e", "#2e5e4e", "#f6ecd9", "#c8963e", "#ff8a6b"];

function Confetti() {
  return (
    <div className="dt-confetti" aria-hidden>
      {Array.from({ length: 44 }, (_, i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${((i * 53) % 30) / 10}s`,
          animationDuration: `${3 + ((i * 17) % 20) / 10}s`,
          ["--sway" as string]: `${((i * 29) % 120) - 60}px`,
        }} />
      ))}
    </div>
  );
}
