// The snow globe balance game on the TV: a big globe that mirrors the gear of the phone that is
// playing, whose turn it is, how many steady hands are still needed, and a celebration (or a
// friendly wobble) after every attempt. Drawn over the 1920x1080 stage.
//
// Gear updates arrive about 8 times a second, but over a tunnel they can come once a second by
// polling, so the gear is extrapolated a little from its last velocity and then eased towards that
// target with a smoothing time that follows the observed update interval.
import { useEffect, useId, useRef, useState } from "react";
import type { PublicState } from "../../../shared/types";
import { Flakes, GLOBE_TARGET, Sparks, makeGlobeArt, paintGlobe } from "../play/BalanceGlobe";
import type { GlobeArt } from "../play/BalanceGlobe";
import { sfx } from "../sfx";
import "./GlobeTv.css";

const R = 300; // glass radius on the stage, px
const STALE_MS = 4000; // no gear update for this long: treat as idle
const BANNER_MS = 4800;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Sample { x: number; y: number; hold: number; t: number }

export function GlobeTv({ state }: { state: PublicState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const holdBarRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [inside, setInside] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; name: string; freed: boolean; at: number } | null>(null);
  const [wobble, setWobble] = useState(0);
  const [pop, setPop] = useState(-1);

  const gear = state.globe.gear;
  const samples = useRef<{ last: Sample | null; prev: Sample | null; interval: number }>({ last: null, prev: null, interval: 125 });
  const lastGearAt = useRef<number | null>(null);
  const freedRef = useRef(state.pieces.gear);
  freedRef.current = state.pieces.gear;
  const celebrate = useRef<{ ok: boolean; at: number } | null>(null);

  // New gear sample from the server.
  useEffect(() => {
    if (!gear || gear.at === lastGearAt.current) return;
    lastGearAt.current = gear.at;
    const now = performance.now();
    const s = samples.current;
    if (!s.last || now - s.last.t > STALE_MS) sfx.tinkle(); // an attempt just started
    if (s.last && now - s.last.t < STALE_MS) s.interval = clamp(s.interval * 0.7 + (now - s.last.t) * 0.3, 80, 1500);
    s.prev = s.last && now - s.last.t < STALE_MS ? s.last : null;
    s.last = { x: gear.x, y: gear.y, hold: gear.hold, t: now };
  }, [gear]);

  // A finished attempt: celebrate or console. Ignore whatever was already there when we mounted.
  const lastSeen = useRef(state.globe.last?.at ?? null);
  const last = state.globe.last;
  useEffect(() => {
    if (!last || last.at === lastSeen.current) return;
    lastSeen.current = last.at;
    const name = state.players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    const freed = state.pieces.gear;
    setBanner({ ok: last.ok, name, freed, at: Date.now() });
    celebrate.current = { ok: last.ok, at: performance.now() };
    samples.current.last = null;
    samples.current.prev = null;
    if (last.ok) {
      sfx.chime();
      window.setTimeout(() => sfx.sparkle(), 250);
      setPop(state.globe.successes - 1);
    } else {
      sfx.boing();
      setWobble((w) => w + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.at]);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    // The stage may be scaled up on 4K panels; a little extra resolution keeps the glass crisp
    // without costing the Fire TV GPU too much.
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    const art: GlobeArt = makeGlobeArt(R, scale);
    canvas.width = Math.ceil(art.w * scale);
    canvas.height = Math.ceil(art.h * scale);
    canvas.style.width = `${art.w}px`;
    canvas.style.height = `${art.h}px`;
    g.setTransform(scale, 0, 0, scale, 0, 0);

    const flakes = new Flakes(260);
    const sparks = new Sparks();
    // Two chained smoothers give a soft, second order glide.
    const p1 = { x: 0, y: 0.2 }, p2 = { x: 0, y: 0.2 };
    let vx = 0, vy = 0, rot = 0, hold = 0, insideE = 0, ring = 0, lift = freedRef.current ? 1 : 0;
    let wasLive = false, wasInside = false, lastInsideSound = 0;
    let raf = 0, prevT = performance.now(), t = 0;
    let lastCelebrate: number | null = null;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      t += dt;
      const s = samples.current;
      const isLive = !!s.last && now - s.last.t < STALE_MS;
      let tx: number, ty: number, th: number;
      let tau: number;
      if (isLive && s.last) {
        const age = now - s.last.t;
        let evx = 0, evy = 0;
        if (s.prev) {
          const span = Math.max(60, s.last.t - s.prev.t);
          evx = clamp((s.last.x - s.prev.x) / span, -0.004, 0.004);
          evy = clamp((s.last.y - s.prev.y) / span, -0.004, 0.004);
        }
        // Extrapolate gently, never more than half an interval or 300 ms ahead.
        const ahead = Math.min(age, s.interval * 0.5, 300) * 0.8;
        tx = s.last.x + evx * ahead;
        ty = s.last.y + evy * ahead;
        const d = Math.hypot(tx, ty);
        if (d > 1) { tx /= d; ty /= d; }
        th = s.last.hold;
        tau = clamp(s.interval / 1000 * 0.45, 0.06, 0.55);
      } else {
        // Idle: the gear floats lazily, or rests low after a wobbly try.
        tx = Math.sin(t * 0.45) * 0.24;
        ty = 0.2 + Math.sin(t * 0.33) * 0.16;
        th = 0;
        tau = 0.9;
      }
      const k = 1 - Math.exp(-dt / tau);
      const ox = p2.x, oy = p2.y;
      p1.x += (tx - p1.x) * k; p1.y += (ty - p1.y) * k;
      p2.x += (p1.x - p2.x) * k; p2.y += (p1.y - p2.y) * k;
      vx = vx * 0.8 + ((p2.x - ox) / Math.max(dt, 1e-3)) * 0.2;
      vy = vy * 0.8 + ((p2.y - oy) / Math.max(dt, 1e-3)) * 0.2;
      hold += (th - hold) * (1 - Math.exp(-dt / (isLive ? 0.2 : 0.6)));
      rot += (vx * 2.4 + 0.22) * dt;

      const isIn = isLive && Math.hypot(p2.x, p2.y) < GLOBE_TARGET;
      insideE += ((isIn ? 1 : 0) - insideE) * Math.min(1, dt * 7);
      ring += ((isLive ? 1 : 0.35) - ring) * Math.min(1, dt * 3);
      if (isLive !== wasLive) { wasLive = isLive; setLive(isLive); }
      if (isIn !== wasInside) {
        wasInside = isIn;
        setInside(isIn);
        if (isIn && now - lastInsideSound > 700) { lastInsideSound = now; sfx.hover(); }
        if (isIn) sparks.emit(art.cx + p2.x * art.rp, art.cy + p2.y * art.rp, 10, R * 0.6);
      }

      const c = celebrate.current;
      if (c && c.at !== lastCelebrate) {
        lastCelebrate = c.at;
        const gx = art.cx + p2.x * art.rp, gy = art.cy + p2.y * art.rp;
        if (c.ok) {
          sparks.emit(gx, gy, 90, R * 1.7);
          sparks.emit(art.cx, art.cy - R * 0.2, 40, R * 1.1);
          hold = 1;
        }
      }
      if (freedRef.current) lift = Math.min(1, lift + dt * 0.45);
      if (lift > 0 && Math.random() < dt * 8) sparks.emit(art.cx + (Math.random() - 0.5) * R * 0.4, art.cy - R * 0.55, 1, R * 0.5);

      flakes.update(dt, t, isLive ? 0.3 : 0.1, isLive ? { x: p2.x * 0.7, y: p2.y * 0.7, vx: vx * 0.7, vy: vy * 0.7 } : undefined);
      sparks.update(dt, R * 0.5);
      paintGlobe(g, art, { t, x: p2.x, y: p2.y, rot, hold, inside: insideE, ring, lift, flakes, sparks });

      // The whole globe leans a touch with the gear, as if the TV globe were the one being tilted.
      if (tiltRef.current) tiltRef.current.style.transform = `rotate(${(p2.x * 2.2).toFixed(2)}deg)`;
      if (holdBarRef.current) holdBarRef.current.style.transform = `scaleX(${clamp(hold, 0, 1).toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const byId = (id?: string | null) => state.players.find((p) => p.id === id) ?? null;
  const current = byId(state.turn?.playerId);
  const lastPlayer = byId(state.globe.last?.playerId);
  const { successes, needed, tried } = state.globe;
  const freed = state.pieces.gear;

  let eyebrow = "Next steady hand";
  let line = "";
  if (freed) { eyebrow = "Piece number one"; line = "The heart gear is free!"; }
  else if (current && live) { eyebrow = "Now tilting"; line = inside ? "Lovely! Hold it right there." : "Keep the gear in the golden circle."; }
  else if (current) {
    line = lastPlayer && lastPlayer.id !== current.id ? `Pass the phone to ${current.name}` : `${current.name}, press Start on the phone`;
  }

  return (
    <div className="gtv">
      <div className="gtv-globe">
        <div className="gtv-tilt" ref={tiltRef}>
          <div className={`gtv-wobble ${wobble ? (wobble % 2 ? "a" : "b") : ""}`}>
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      <aside className={`gtv-panel gtv-turn ${live ? "live" : ""}`}>
        <span className="gtv-eyebrow">{eyebrow}</span>
        {current && !freed ? (
          <div className="gtv-who">
            <span className="gtv-avatar" style={{ background: current.color }}>{current.name.slice(0, 1).toUpperCase()}</span>
            <strong className={current.name.length > 12 ? "xlong" : current.name.length > 7 ? "long" : ""}>{current.name}</strong>
          </div>
        ) : (
          <div className="gtv-who"><GearIcon filled size={72} /><strong>{freed ? "Hooray!" : "Ready"}</strong></div>
        )}
        <p className={`gtv-line ${inside && live ? "good" : ""}`}>
          {!live && current && !freed && <PassIcon />}
          <span>{line}</span>
        </p>
        <div className={`gtv-hold ${live ? "on" : ""}`}>
          <span>Steady</span>
          <div className="gtv-hold-bar"><div ref={holdBarRef} /></div>
        </div>
      </aside>

      <aside className="gtv-panel gtv-score">
        <span className="gtv-eyebrow">Steady hands</span>
        <div className="gtv-gears">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={`gtv-gear ${i < successes ? "on" : ""} ${i === pop ? "pop" : ""}`}>
              <GearIcon filled={i < successes} size={86} />
            </span>
          ))}
        </div>
        <p className="gtv-count"><strong>{successes}</strong> of {needed}</p>
        <ul className="gtv-players">
          {state.players.map((p) => (
            <li key={p.id} className={`${tried.includes(p.id) ? "tried" : ""} ${p.id === current?.id ? "now" : ""}`}>
              <i style={{ background: p.color }} />
              <span>{p.name}</span>
              {tried.includes(p.id) && <Tick />}
            </li>
          ))}
        </ul>
      </aside>

      {banner && (
        <div className={`gtv-banner ${banner.ok ? "ok" : "no"}`} key={banner.at}>
          <strong>
            {banner.ok ? (banner.freed ? "The heart gear is free!" : `Steady as a rock, ${banner.name}!`) : `Wobbly! Never mind, ${banner.name}.`}
          </strong>
          <span>
            {banner.ok
              ? banner.freed ? "Piece number one for the Star Machine" : needed - successes === 1 ? "The gear is settling. One more steady hand!" : "The gear is settling. Keep going!"
              : state.players.length > 1 ? "Pass the phone on. Everyone gets a go." : "Nice and slow. Try again!"}
          </span>
        </div>
      )}
    </div>
  );
}

/** A brass gear drawn in SVG: filled when earned, a dashed outline when still needed. */
function GearIcon({ filled, size }: { filled: boolean; size: number }) {
  const id = useId().replace(/:/g, "");
  const n = 12, ro = 46, rr = 38;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, st = (Math.PI * 2) / n;
    const pts = [[a - st * 0.3, rr], [a - st * 0.17, ro], [a + st * 0.17, ro], [a + st * 0.3, rr], [a + st * 0.7, rr]];
    for (const [ang, rad] of pts) d += `${d ? "L" : "M"}${(50 + Math.cos(ang) * rad).toFixed(2)} ${(50 + Math.sin(ang) * rad).toFixed(2)}`;
  }
  d += "Z M50 32 A18 18 0 1 0 50.01 32 Z";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0c2" />
          <stop offset="0.35" stopColor="#e0b25a" />
          <stop offset="0.7" stopColor="#c8963e" />
          <stop offset="1" stopColor="#6e4a18" />
        </linearGradient>
      </defs>
      {filled ? (
        <>
          <path d={d} fill={`url(#b${id})`} fillRule="evenodd" stroke="#4e320f" strokeWidth="2" />
          <path d="M50 60 C47 57 39 52 40 46 C41 41 47 40 50 45 C53 40 59 41 60 46 C61 52 53 57 50 60 Z" fill="#b23a2e" stroke="#6e1e15" strokeWidth="1.2" />
        </>
      ) : (
        <path d={d} fill="#ffffff08" fillRule="evenodd" stroke="#c8963e" strokeWidth="2.5" strokeDasharray="5 4" />
      )}
    </svg>
  );
}

function PassIcon() {
  return (
    <svg className="gtv-pass" viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <rect x="20" y="10" width="24" height="42" rx="5" fill="none" stroke="#ffe2a0" strokeWidth="3.5" />
      <circle cx="32" cy="46" r="2.5" fill="#ffe2a0" />
      <path d="M6 30 q-2 -16 14 -20" fill="none" stroke="#c8963e" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M16 6 l5 4 -5 5" fill="none" stroke="#c8963e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58 34 q2 16 -14 20" fill="none" stroke="#c8963e" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M48 58 l-5 -4 5 -5" fill="none" stroke="#c8963e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
      <path d="M5 12.5 l4.5 4.5 L19 7" fill="none" stroke="#ffd36b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
