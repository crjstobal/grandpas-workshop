// Statues on the phone: dance while the gramophone plays, freeze when it stops.
// The phone measures how much it is moving (acceleration without gravity, so a phone held still
// reads close to zero) and streams that energy to the server about four times a second. The
// server decides who wiggled during the freeze. Without a motion sensor, a big "Dance" button
// stands in: taps count as dancing, so during the freeze, hands off!
import { useEffect, useRef, useState } from "react";
import type { DanceState, PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx, unlockAudio } from "../sfx";
import "./DancePhone.css";

type Phase = DanceState["phase"];
type Mode = "ask" | "motion" | "tap";
type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const SEND_EVERY_MS = 250;
const STREAM: Phase[] = ["intro", "music", "freeze", "caught"];
// Below this much movement (m/s2, blended RMS and peak) the phone counts as still: hand tremor
// and breathing stay under it, a real wiggle goes well over.
const STILL = 0.9;
const FULL = 7;

export function DancePhone({ state, code, playerId }: { state: PublicState; code: string; playerId: string }) {
  const d = state.dance;
  const phase = d.phase;
  const [mode, setMode] = useState<Mode>("ask");
  const [level, setLevel] = useState(0);
  const [tapBounce, setTapBounce] = useState(0);
  const win = useRef({ sumSq: 0, n: 0, peak: 0, taps: 0 });

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const codeRef = useRef(code);
  codeRef.current = code;
  const playerRef = useRef(playerId);
  playerRef.current = playerId;

  const now = useNow((phase === "intro" && !!d.until) || phase === "freeze" ? 200 : 0);

  const start = async () => {
    unlockAudio();
    const DME = (window as unknown as { DeviceMotionEvent?: MotionPermission }).DeviceMotionEvent;
    if (!DME) { setMode("tap"); return; }
    try {
      // iOS asks for permission; it must come from this tap.
      if (typeof DME.requestPermission === "function" && (await DME.requestPermission()) !== "granted") { setMode("tap"); return; }
      setMode("motion");
    } catch { setMode("tap"); }
  };

  // Motion sensor: accumulate movement between sends.
  useEffect(() => {
    if (mode !== "motion") return;
    let got = false;
    let grav: number[] | null = null;
    let warm = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      let m: number;
      const a = e.acceleration;
      if (a && a.x != null && a.y != null && a.z != null) {
        m = Math.hypot(a.x, a.y, a.z);
      } else {
        // No gravity-free reading on this device: take gravity out with a slow low-pass filter.
        const g = e.accelerationIncludingGravity;
        if (!g || g.x == null || g.y == null || g.z == null) return;
        const v = [g.x, g.y, g.z];
        if (!grav) { grav = v; return; }
        for (let i = 0; i < 3; i++) grav[i] = grav[i] * 0.92 + v[i] * 0.08;
        if (warm++ < 15) return;
        m = Math.hypot(v[0] - grav[0], v[1] - grav[1], v[2] - grav[2]);
      }
      if (!Number.isFinite(m)) return;
      got = true;
      const w = win.current;
      w.sumSq += m * m;
      w.n += 1;
      if (m > w.peak) w.peak = m;
    };
    window.addEventListener("devicemotion", onMotion);
    // Some browsers say they have a sensor but never send readings: fall back to tapping.
    const check = setTimeout(() => { if (!got) setMode("tap"); }, 2500);
    return () => { window.removeEventListener("devicemotion", onMotion); clearTimeout(check); };
  }, [mode]);

  // Stream the energy to the server, ~4 times a second, zeros included (that is what keeps it fair).
  useEffect(() => {
    if (mode === "ask") return;
    const t = setInterval(() => {
      const w = win.current;
      let e: number;
      if (mode === "tap") e = Math.min(1, w.taps * 0.4);
      else {
        const rms = w.n ? Math.sqrt(w.sumSq / w.n) : 0;
        e = Math.max(0, Math.min(1, (0.65 * rms + 0.35 * w.peak - STILL) / FULL));
      }
      win.current = { sumSq: 0, n: 0, peak: 0, taps: 0 };
      setLevel((l) => l * 0.4 + e * 0.6);
      if (!STREAM.includes(phaseRef.current)) return;
      void api.shake(codeRef.current, playerRef.current, Math.round(e * 100) / 100).catch(() => {});
    }, SEND_EVERY_MS);
    return () => clearInterval(t);
  }, [mode]);

  // Buzz and sound at the big moments.
  const prev = useRef<Phase | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = phase;
    if (p === null || p === phase) return;
    if (phase === "freeze") navigator.vibrate?.([450, 90, 250]);
    if (phase === "music") navigator.vibrate?.(40);
    if (phase === "caught") { sfx.boing(); navigator.vibrate?.([60, 50, 60, 50, 60]); }
    if (phase === "done") sfx.chime();
  }, [phase]);

  const tap = () => {
    unlockAudio();
    win.current.taps += 1;
    setTapBounce((b) => b + 1);
    navigator.vibrate?.(15);
  };

  const view = mode === "ask" ? "ask" : phase === "intro" ? (d.until ? "ready" : "listen") : phase;
  const secs = d.until ? Math.max(0, Math.ceil((d.until - now) / 1000)) : 0;
  const me = state.players.find((p) => p.id === playerId);
  const caughtPlayer = d.caught ? state.players.find((p) => p.name === d.caught) : undefined;
  const itWasMe = !!caughtPlayer && !!me && caughtPlayer.deviceId === me.deviceId;
  const wobbling = level > 0.18;

  return (
    <div className={`dp dp-${view}`}>
      {view === "freeze" && <div className="dp-frost" aria-hidden />}
      {view === "music" && <div className="dp-dots" aria-hidden><i /><i /><i /><i /><i /><i /></div>}

      {view !== "ask" && view !== "listen" && view !== "done" && (
        <div className="dp-round">Statue {Math.min(d.round + 1, d.rounds)} of {d.rounds}</div>
      )}

      {view === "ask" && (
        <>
          <div className="dp-eyebrow">The gramophone game</div>
          <h1 className="dp-big dp-ask-title">Statues!</h1>
          <div className="dp-rules">
            <div><PhoneIcon dancing /><span><b>Music plays:</b> dance with your phone in your hand</span></div>
            <div><PhoneIcon /><span><b>Music stops:</b> freeze! Not a wiggle</span></div>
          </div>
          <button className="dp-go" onClick={start}>I'm ready to dance</button>
        </>
      )}

      {view === "listen" && (
        <>
          <Record />
          <h1 className="dp-mid">Listen to Grandpa's record</h1>
          <p className="dp-sub">Hold your phone. The dance starts soon!</p>
        </>
      )}

      {view === "ready" && (
        <>
          <div className="dp-eyebrow">Phones in your hands</div>
          {secs > 0 && secs <= 3
            ? <div className="dp-count" key={secs}>{secs}</div>
            : <h1 className="dp-big">Get ready!</h1>}
          <p className="dp-sub">Dance when the music plays. Freeze when it stops!</p>
        </>
      )}

      {view === "music" && (
        <>
          <h1 className="dp-big dp-dance" aria-label="Dance!">
            {"Dance!".split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }}>{c}</span>)}
          </h1>
          {mode === "tap"
            ? <button className={`dp-tap ${tapBounce % 2 ? "a" : "b"}`} onPointerDown={tap}>Dance</button>
            : <div className="dp-energy" style={{ ["--lv" as string]: String(level) }}><i /><i /><i /></div>}
          <p className="dp-sub">{mode === "tap" ? "Tap, tap, tap to the music!" : level > 0.5 ? "What a dancer!" : "Shake it! Wiggle! Twirl!"}</p>
        </>
      )}

      {view === "freeze" && (
        <>
          <h1 className="dp-big dp-freeze">FREEZE!</h1>
          {mode === "tap"
            ? <button className="dp-tap frozen" onPointerDown={tap}>Hands off!</button>
            : <div className={`dp-still ${wobbling ? "warn" : ""}`}>{wobbling ? "Careful, you're wobbling!" : "Perfectly still"}</div>}
          <p className="dp-sub">{mode === "tap" ? "Don't touch the button!" : "Don't move a muscle!"}</p>
          <div className="dp-icebar"><div style={{ width: `${Math.round(100 * (1 - Math.max(0, d.until - now) / 3500))}%` }} /></div>
        </>
      )}

      {view === "caught" && (
        <>
          <h1 className="dp-big dp-wobbly">Wobbly!</h1>
          <div className="dp-who">
            {caughtPlayer && <span className="dp-dot" style={{ background: caughtPlayer.color }} />}
            {itWasMe ? "That was you!" : d.caught === "Jingle" ? "Jingle wiggled his wings!" : `${d.caught} wiggled!`}
          </div>
          <p className="dp-sub">Get ready to dance again...</p>
        </>
      )}

      {view === "done" && (
        <>
          <Record gold />
          <h1 className="dp-big dp-win">Perfect statues!</h1>
          <p className="dp-sub">Grandpa's song is yours. Look at the TV!</p>
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

function PhoneIcon({ dancing }: { dancing?: boolean }) {
  return (
    <svg viewBox="0 0 60 60" width="56" height="56" aria-hidden className={dancing ? "dp-icon-dance" : ""}>
      {!dancing && <rect x="12" y="4" width="36" height="52" rx="10" fill="#cfeaff" opacity="0.5" stroke="#fff" strokeWidth="2" />}
      <rect x="20" y="10" width="20" height="40" rx="5" fill="#2b1d14" />
      <rect x="23" y="14" width="14" height="30" rx="2" fill={dancing ? "#ffcf6b" : "#9fd3ff"} />
      {dancing && <path d="M12 20 q-6 10 0 20 M48 20 q6 10 0 20" stroke="#ff8a6b" strokeWidth="4" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

function Record({ gold }: { gold?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width="130" height="130" className={`dp-record ${gold ? "gold" : ""}`} aria-hidden>
      <circle cx="20" cy="20" r="19" fill={gold ? "#e8b84a" : "#141414"} />
      <circle cx="20" cy="20" r="15" fill="none" stroke={gold ? "#fff1c2" : "#333"} strokeWidth="1" />
      <circle cx="20" cy="20" r="11.5" fill="none" stroke={gold ? "#fff1c2" : "#333"} strokeWidth="1" />
      <circle cx="20" cy="20" r="7" fill="#b23a2e" />
      <circle cx="20" cy="20" r="1.5" fill="#f6ecd9" />
    </svg>
  );
}
