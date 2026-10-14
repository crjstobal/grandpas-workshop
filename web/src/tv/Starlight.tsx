// Starlight: phones shake sparkles loose, they drift down over the Star Machine, and the family
// flies Jingle to catch them. A few also fall on their own, so the TV is playable alone. When the
// star is full, Jingle holds it up, ready to fly it to the roof.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx } from "../sfx";
import { Hand } from "./Hand";

interface Sparkle { id: number; x: number; y: number; vy: number; sway: number; color: string; caught?: number }

const CATCH_RADIUS = 80;

export function Starlight({ state, bubble, star }: { state: PublicState; bubble: { line: string; at: number } | null; star: ReactNode }) {
  const jingle = useRef({ x: 960, y: 600 });
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const list = useRef<Sparkle[]>([]);
  const nextId = useRef(1);
  const full = state.starlight >= state.starlightNeeded;
  const colorOf = (playerId: string) => state.players.find((p) => p.id === playerId)?.color ?? "#ffe2a0";

  const spawn = (n: number, color = "#ffe2a0") => {
    for (let i = 0; i < n; i++) {
      list.current.push({ id: nextId.current++, x: 420 + Math.random() * 1100, y: 60 - Math.random() * 120, vy: 120 + Math.random() * 90, sway: Math.random() * Math.PI * 2, color });
    }
  };

  // Sparkles shaken loose by the phones, in the colour of whoever shook them.
  const lastDrop = useRef(0);
  useEffect(() => {
    const d = state.sparkleDrop;
    if (!d || d.at === lastDrop.current || full) return;
    lastDrop.current = d.at;
    spawn(d.n, colorOf(d.playerId));
    sfx.tinkle();
  }, [state.sparkleDrop, full]);

  useEffect(() => {
    if (full) return;
    const t = setInterval(() => spawn(1), 1800);
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const j = jingle.current;
      for (const s of list.current) {
        if (s.caught) continue;
        s.y += s.vy * dt;
        s.sway += dt * 2;
        s.x += Math.sin(s.sway) * 40 * dt;
        if (Math.hypot(s.x - j.x, s.y - (j.y - 40)) < CATCH_RADIUS) {
          s.caught = now;
          sfx.sparkle();
          api.catch(state.code).catch(() => {});
        }
      }
      list.current = list.current.filter((s) => (s.caught ? now - s.caught < 400 : s.y < 1100));
      setSparkles([...list.current]);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { clearInterval(t); cancelAnimationFrame(raf); };
  }, [full, state.code]);

  const pct = Math.min(1, state.starlight / state.starlightNeeded);
  return (
    <>
      <div className="starlight-meter">
        <div className="meter-star" style={{ filter: `grayscale(${1 - pct}) brightness(${0.5 + pct * 0.8}) drop-shadow(0 0 ${pct * 40}px #ffd36b)` }}>{star}</div>
        <div className="meter-bar"><div style={{ width: `${pct * 100}%` }} /></div>
        <span>{full ? "The star is shining!" : `Starlight ${state.starlight} of ${state.starlightNeeded}`}</span>
      </div>
      {sparkles.map((s) => (
        <i key={s.id} className={`falling-sparkle ${s.caught ? "caught" : ""}`} style={{ left: s.x, top: s.y, background: s.color, boxShadow: `0 0 18px ${s.color}, 0 0 4px #fff` }} />
      ))}
      <Hand posRef={jingle} bubble={bubble} start={{ x: 960, y: 700 }}
        hotspots={[]}
        carrying={full ? star : undefined}
        help={full ? "The star is shining!" : "Fly Jingle into the starlight to catch it"}
        onPick={() => {}} />
    </>
  );
}
