// The finale on the TV: the family's gingerbread on a wooden board, iced live from every phone.
// Mounted inside the 1920x1080 stage over the beacon scene while state.finale === "cookie".
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicState } from "../../../shared/types";
import { sfx } from "../sfx";
import { COOKIE_ASPECT, drawCookie, drawSparkle, drawStrokes, loadCookieArt } from "../play/icing";
import "./gingerbread-tv.css";

const COOKIE_H = 860;
const COOKIE_W = Math.round(COOKIE_H * COOKIE_ASPECT);
/** How long the sparkle stays on the tip of a stroke after it last grew. */
const SPARKLE_MS = 1100;
/** A player counts as "piping now" this long after their last new icing. */
const ACTIVE_MS = 2200;

export function GingerbreadTv({ state }: { state: PublicState }) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const icingRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(state.cookie.strokes);
  strokesRef.current = state.cookie.strokes;
  // id -> how many points we last saw and when it last grew.
  const growth = useRef(new Map<string, { n: number; at: number }>());
  const lastSound = useRef(0);
  const primed = useRef(false);
  const [activeAt, setActiveAt] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  // The bare cookie, once its art has loaded (or the procedural one when it is missing).
  useEffect(() => {
    let alive = true;
    void loadCookieArt().then((art) => {
      const cv = baseRef.current;
      if (!alive || !cv) return;
      const g = cv.getContext("2d")!;
      g.clearRect(0, 0, cv.width, cv.height);
      drawCookie(g, COOKIE_W, COOKIE_H, art);
    });
    return () => { alive = false; };
  }, []);

  // A cheap signature: the icing is only repainted when a stroke was added, grew or was removed.
  const strokes = state.cookie.strokes;
  const signature = useMemo(() => {
    let pts = 0;
    for (const s of strokes) pts += s.points.length;
    return `${strokes.length}:${pts}:${strokes[0]?.id ?? ""}:${strokes[strokes.length - 1]?.id ?? ""}`;
  }, [strokes]);

  useEffect(() => {
    const cv = icingRef.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, cv.width, cv.height);
    drawStrokes(g, strokesRef.current, COOKIE_W, COOKIE_H);

    // Who is piping right now, and which strokes are still growing.
    const t = Date.now();
    const seen = new Set<string>();
    const touched: Record<string, number> = {};
    let fresh = false;
    for (const s of strokesRef.current) {
      seen.add(s.id);
      const before = growth.current.get(s.id);
      if (!before) fresh = true;
      if (!before || before.n !== s.points.length) {
        // Icing already on the cookie when the TV mounts does not sparkle.
        growth.current.set(s.id, { n: s.points.length, at: primed.current ? t : 0 });
        if (primed.current) touched[s.playerId] = t;
      }
    }
    for (const id of growth.current.keys()) if (!seen.has(id)) growth.current.delete(id);
    if (Object.keys(touched).length) setActiveAt((a) => ({ ...a, ...touched }));
    const wasPrimed = primed.current;
    primed.current = true;
    if (wasPrimed && fresh && t - lastSound.current > 900) { lastSound.current = t; sfx.tinkle(); }
  }, [signature]);

  // Sparkles on the tip of every stroke being piped right now.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cv = fxRef.current;
      if (!cv) return;
      const g = cv.getContext("2d")!;
      g.clearRect(0, 0, cv.width, cv.height);
      const t = Date.now();
      for (const s of strokesRef.current) {
        const gr = growth.current.get(s.id);
        if (!gr || t - gr.at > SPARKLE_MS || !s.points.length) continue;
        const [x, y] = s.points[s.points.length - 1];
        const fade = 1 - (t - gr.at) / SPARKLE_MS;
        drawSparkle(g, x * COOKIE_W, y * COOKIE_H, 16 + s.width * COOKIE_W * 0.6, t + x * 4000, fade);
      }
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(() => setNow(Date.now()), 700);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, []);

  // Everyone who has iced something, in the order they started.
  const bakers = useMemo(() => {
    const order: string[] = [];
    for (const s of strokes) if (!order.includes(s.playerId)) order.push(s.playerId);
    return order.map((id) => state.players.find((p) => p.id === id)).filter((p): p is PublicState["players"][number] => !!p);
  }, [strokes, state.players]);

  return (
    <div className="gbtv">
      <div className="gbtv-copy">
        <span className="gbtv-eyebrow">Grandpa's train is almost home</span>
        <h1>A gingerbread for Grandpa</h1>
        <p className="gbtv-lead">
          <svg viewBox="0 0 24 24" aria-hidden><rect x="6" y="1.5" width="12" height="21" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="18.5" r="1.3" fill="currentColor" /></svg>
          Decorate it on your phone!
        </p>

        <div className="gbtv-bakers">
          <span className="gbtv-label">Iced with love by</span>
          {bakers.length ? (
            <ul>
              {bakers.map((p) => {
                const piping = now - (activeAt[p.id] ?? 0) < ACTIVE_MS;
                return (
                  <li key={p.id} className={piping ? "piping" : ""} style={{ ["--pc" as string]: p.color }}>
                    <span className="gbtv-dot" />{p.name}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="gbtv-empty">Waiting for the first swirl of icing...</p>
          )}
        </div>

        <p className="gbtv-tip">
          When it looks delicious, press <strong>Give it to Grandpa!</strong> on any phone.
        </p>
      </div>

      <div className="gbtv-board">
        <div className="gbtv-parchment" />
        <div className="gbtv-cookie" style={{ width: COOKIE_W, height: COOKIE_H }}>
          <canvas ref={baseRef} width={COOKIE_W} height={COOKIE_H} />
          <canvas ref={icingRef} width={COOKIE_W} height={COOKIE_H} />
          <canvas ref={fxRef} width={COOKIE_W} height={COOKIE_H} />
        </div>
        {state.cookie.done && <div className="gbtv-ribbon">Off to Grandpa!</div>}
      </div>
    </div>
  );
}
