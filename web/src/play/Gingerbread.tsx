// The finale on the phone: the whole family decorates one gingerbread for Grandpa at once.
// Every finger stroke is piped onto the shared cookie and streamed to the TV while it is drawn.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { IcingStroke, PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx, unlockAudio } from "../sfx";
import {
  CANDY_WIDTH, COOKIE_ASPECT, ICING_COLORS, NOZZLES, SPRINKLE_COLORS, SPRINKLE_WIDTH,
  drawCookie, drawStroke, drawStrokes, loadCookieArt,
} from "./icing";
import "./gingerbread.css";

type Tool = "icing" | "candy" | "sprinkles";
type Pt = [number, number];
type MyStroke = Omit<IcingStroke, "playerId">;

const SEND_EVERY_MS = 120;
/** The server keeps up to 600 points per stroke: a longer line continues as a new stroke. */
const MAX_POINTS = 500;
const round = (v: number) => Math.round(v * 10000) / 10000;
const newId = () => Math.random().toString(36).slice(2, 10);

export function Gingerbread({ state, code, playerId }: { state: PublicState; code: string; playerId: string }) {
  const [tool, setTool] = useState<Tool>("icing");
  const [colorIdx, setColorIdx] = useState(0);
  const [nozzleIdx, setNozzleIdx] = useState(1);
  const [phase, setPhase] = useState<"draw" | "sending">("draw");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [undoArmed, setUndoArmed] = useState(false);
  const [localTick, setLocalTick] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const stateRef = useRef(state);
  stateRef.current = state;

  // My strokes as I drew them, until the server echoes them back in full.
  const mine = useRef(new Map<string, MyStroke>());
  const live = useRef<{ stroke: MyStroke; sent: number; pointer: number; last: Pt } | null>(null);
  const sprinkleFrom = useRef<{ pointer: number; at: Pt } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const frame = useRef(0);

  const color = ICING_COLORS[colorIdx].hex;
  // Which screen is showing: the canvas effects re-attach when the drawing screen comes back.
  const screen = state.cookie.done ? "done" : phase === "sending" ? "sending" : state.finale !== "cookie" ? "wait" : "draw";
  const width = NOZZLES[nozzleIdx].width;

  // ---------------------------------------------------------------- strokes in order

  /** Server strokes with my own replaced by my local copy (which is always at least as long). */
  const mergedStrokes = useCallback((skipId?: string): MyStroke[] => {
    const server = stateRef.current.cookie.strokes;
    const out: MyStroke[] = [];
    const seen = new Set<string>();
    for (const s of server) {
      if (s.playerId === playerId) {
        seen.add(s.id);
        if (s.id === skipId) continue;
        const local = mine.current.get(s.id);
        out.push(local && local.points.length > s.points.length ? local : s);
      } else out.push(s);
    }
    for (const [id, s] of mine.current) if (!seen.has(id) && id !== skipId) out.push(s);
    return out;
  }, [playerId]);

  // Forget local copies the server already has in full.
  useEffect(() => {
    for (const s of state.cookie.strokes) {
      if (s.playerId !== playerId) continue;
      const local = mine.current.get(s.id);
      if (local && live.current?.stroke.id !== s.id && s.points.length >= local.points.length) mine.current.delete(s.id);
    }
  }, [state.cookie.strokes, playerId]);

  // ---------------------------------------------------------------- drawing to the screen

  const present = useCallback(() => {
    const cv = canvasRef.current, cache = cacheRef.current;
    if (!cv || !cache) return;
    const g = cv.getContext("2d")!;
    const { w, h, dpr } = sizeRef.current;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(cache, 0, 0);
    if (live.current) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStroke(g, live.current.stroke, w, h);
    }
  }, []);

  const requestPresent = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; present(); });
  }, [present]);

  /** Repaints the cookie and every finished stroke into the cache layer. */
  const rebuild = useCallback(() => {
    const { w, h, dpr } = sizeRef.current;
    if (!w) return;
    const cache = (cacheRef.current ??= document.createElement("canvas"));
    cache.width = Math.round(w * dpr); cache.height = Math.round(h * dpr);
    const g = cache.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCookie(g, w, h, artRef.current);
    drawStrokes(g, mergedStrokes(live.current?.stroke.id), w, h);
    requestPresent();
  }, [mergedStrokes, requestPresent]);

  useEffect(() => { rebuild(); }, [state.cookie.strokes, localTick, rebuild]);

  useEffect(() => {
    let alive = true;
    void loadCookieArt().then((img) => { if (alive) { artRef.current = img; rebuild(); } });
    return () => { alive = false; };
  }, [rebuild]);

  // Size the canvas to its box, sharp on high density screens.
  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    const fit = () => {
      const w = wrap.clientWidth, h = w / COOKIE_ASPECT;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      sizeRef.current = { w, h, dpr };
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      rebuild();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [rebuild, screen]);

  // iOS Safari still scrolls on some gestures unless touchmove is cancelled explicitly.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    cv.addEventListener("touchmove", stop, { passive: false });
    cv.addEventListener("touchstart", stop, { passive: false });
    return () => { cv.removeEventListener("touchmove", stop); cv.removeEventListener("touchstart", stop); };
  }, [screen]);

  // ---------------------------------------------------------------- talking to the server

  const send = useCallback((piece: MyStroke) => {
    // Pieces of one stroke must arrive in order: the first one creates it, the rest extend it.
    queue.current = queue.current.then(() => api.stroke(code, playerId, piece).catch(() => undefined));
  }, [code, playerId]);

  const flush = useCallback(() => {
    const l = live.current;
    if (!l || l.stroke.points.length <= l.sent) return;
    send({ id: l.stroke.id, color: l.stroke.color, width: l.stroke.width, points: l.stroke.points.slice(l.sent) });
    l.sent = l.stroke.points.length;
  }, [send]);

  useEffect(() => {
    const t = setInterval(flush, SEND_EVERY_MS);
    return () => clearInterval(t);
  }, [flush]);

  const place = useCallback((s: MyStroke) => {
    mine.current.set(s.id, s);
    send(s);
  }, [send]);

  // ---------------------------------------------------------------- finger input

  const toPoint = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };

  const scatter = (at: Pt) => {
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI;
      const dist = Math.random() * 0.045, off = Math.random() * Math.PI * 2;
      const cx = at[0] + Math.cos(off) * dist, cy = at[1] + Math.sin(off) * dist * COOKIE_ASPECT;
      const half = 0.012;
      const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half * COOKIE_ASPECT;
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      place({
        id: newId(), width: SPRINKLE_WIDTH,
        color: SPRINKLE_COLORS[Math.floor(Math.random() * SPRINKLE_COLORS.length)],
        points: [[round(clamp(cx - dx)), round(clamp(cy - dy))], [round(clamp(cx + dx)), round(clamp(cy + dy))]],
      });
    }
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (live.current || sprinkleFrom.current || state.cookie.done) return;
    unlockAudio();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    setError(null);
    if (tool === "icing") {
      live.current = { stroke: { id: newId(), color, width, points: [[round(p[0]), round(p[1])]] }, sent: 0, pointer: e.pointerId, last: p };
      flush();
      requestPresent();
    } else if (tool === "candy") {
      place({ id: newId(), color, width: CANDY_WIDTH, points: [[round(p[0]), round(p[1])]] });
      sfx.pop();
      navigator.vibrate?.(8);
      setLocalTick((t) => t + 1);
    } else {
      scatter(p);
      sprinkleFrom.current = { pointer: e.pointerId, at: p };
      sfx.tinkle();
      setLocalTick((t) => t + 1);
    }
  };

  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const sp = sprinkleFrom.current;
    if (sp && sp.pointer === e.pointerId) {
      const p = toPoint(e);
      if (Math.hypot(p[0] - sp.at[0], (p[1] - sp.at[1]) / COOKIE_ASPECT) > 0.07) {
        scatter(p);
        sp.at = p;
        setLocalTick((t) => t + 1);
      }
      return;
    }
    const l = live.current;
    if (!l || l.pointer !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const raw = toPoint(ev);
      // Light smoothing: icing flows, it does not jitter.
      const p: Pt = [l.last[0] + (raw[0] - l.last[0]) * 0.55, l.last[1] + (raw[1] - l.last[1]) * 0.55];
      const prev = l.stroke.points[l.stroke.points.length - 1];
      if (Math.hypot(p[0] - prev[0], (p[1] - prev[1]) / COOKIE_ASPECT) < 0.004) { l.last = p; continue; }
      l.last = p;
      l.stroke.points.push([round(p[0]), round(p[1])]);
      if (l.stroke.points.length >= MAX_POINTS) {
        // Hand this stroke over and keep piping as a fresh one from the same spot.
        flush();
        mine.current.set(l.stroke.id, l.stroke);
        const tail = l.stroke.points[l.stroke.points.length - 1];
        live.current = { stroke: { id: newId(), color: l.stroke.color, width: l.stroke.width, points: [tail] }, sent: 0, pointer: l.pointer, last: p };
        flush();
        setLocalTick((t) => t + 1);
      }
    }
    requestPresent();
  };

  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (sprinkleFrom.current?.pointer === e.pointerId) { sprinkleFrom.current = null; return; }
    const l = live.current;
    if (!l || l.pointer !== e.pointerId) return;
    flush();
    mine.current.set(l.stroke.id, l.stroke);
    live.current = null;
    setLocalTick((t) => t + 1);
  };

  // ---------------------------------------------------------------- buttons

  const myCount = useMemo(() => {
    const ids = new Set(state.cookie.strokes.filter((s) => s.playerId === playerId).map((s) => s.id));
    for (const id of mine.current.keys()) ids.add(id);
    return ids.size;
  }, [state.cookie.strokes, playerId, localTick]);
  const totalCount = Math.max(state.cookie.strokes.length, myCount);

  useEffect(() => {
    if (!undoArmed) return;
    const t = setTimeout(() => setUndoArmed(false), 3000);
    return () => clearTimeout(t);
  }, [undoArmed]);

  const undo = async () => {
    if (!myCount) return;
    if (myCount > 3 && !undoArmed) { setUndoArmed(true); return; }
    setUndoArmed(false);
    mine.current.clear();
    sfx.whirr();
    setLocalTick((t) => t + 1);
    await queue.current;
    await api.clearStrokes(code, playerId).catch((e: Error) => setError(e.message));
  };

  const give = async () => {
    unlockAudio();
    setError(null);
    setPhase("sending");
    try {
      const blob = await composite(mergedStrokes(), artRef.current);
      setPreview(URL.createObjectURL(blob));
      sfx.chime();
      await queue.current;
      await api.scan(code, playerId, "cookie", blob);
    } catch (e) {
      setError((e as Error).message || "Grandpa could not reach it. Try again!");
      setPhase("draw");
    }
  };

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // ---------------------------------------------------------------- screens

  const others = useMemo(() => {
    const ids = new Set(state.cookie.strokes.map((s) => s.playerId).filter((id) => id !== playerId));
    return state.players.filter((p) => ids.has(p.id));
  }, [state.cookie.strokes, state.players, playerId]);

  if (state.cookie.done) {
    return (
      <div className="gb gb-done">
        {preview && <img className="gb-keepsake" src={preview} alt="The gingerbread the family decorated" />}
        <span className="eyebrow">Delivered with love</span>
        <h2>Grandpa loved it!</h2>
        <p>Every swirl of icing, from all of you. Look at the TV: he has something to tell you.</p>
        {state.cookie.label && <p className="gb-label">"{state.cookie.label}"</p>}
      </div>
    );
  }

  if (screen === "sending") {
    return (
      <div className="gb gb-tasting">
        <div className="gb-plate-mini">{preview && <img src={preview} alt="Your gingerbread" />}</div>
        <h2>Grandpa is tasting it<span className="gb-dots"><i /><i /><i /></span></h2>
        <p>Look at the TV!</p>
      </div>
    );
  }

  if (screen === "wait") {
    return (
      <div className="gb gb-tasting">
        <h2>Grandpa's train is coming</h2>
        <p>Watch the TV. The oven is warming up for a very special gingerbread.</p>
      </div>
    );
  }

  return (
    <div className="gb">
      <div className="gb-head">
        <span className="eyebrow">A gingerbread for Grandpa</span>
        <p>{others.length ? <>Piping with <Names players={others} /></> : "Draw with your finger. It appears on the TV!"}</p>
      </div>

      <div className="gb-plate">
        <div className="gb-cookie" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="gb-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="The gingerbread. Draw on it with your finger."
          />
        </div>
      </div>

      <div className="gb-tools">
        <div className="gb-row">
          <div className="gb-seg" role="radiogroup" aria-label="Tool">
            <ToolButton on={tool === "icing"} label="Icing" onClick={() => setTool("icing")}><IconPipe /></ToolButton>
            <ToolButton on={tool === "candy"} label="Candy" onClick={() => setTool("candy")}><IconCandy color={color} /></ToolButton>
            <ToolButton on={tool === "sprinkles"} label="Sprinkles" onClick={() => setTool("sprinkles")}><IconSprinkles /></ToolButton>
          </div>
          <div className={`gb-nozzles${tool === "icing" ? "" : " off"}`} role="radiogroup" aria-label="Nozzle size">
            {NOZZLES.map((n, i) => (
              <button key={n.name} role="radio" aria-checked={nozzleIdx === i} aria-label={`${n.name} nozzle`}
                className={nozzleIdx === i ? "on" : ""} onClick={() => { setNozzleIdx(i); setTool("icing"); }}>
                <span style={{ width: 6 + i * 6, height: 6 + i * 6, background: color }} />
              </button>
            ))}
          </div>
        </div>
        <div className={`gb-colors${tool === "sprinkles" ? " off" : ""}`} role="radiogroup" aria-label="Icing color">
          {ICING_COLORS.map((c, i) => (
            <button key={c.hex} role="radio" aria-checked={colorIdx === i} aria-label={c.name}
              className={colorIdx === i ? "on" : ""} style={{ ["--c" as string]: c.hex }}
              onClick={() => { setColorIdx(i); if (tool === "sprinkles") setTool("icing"); }} />
          ))}
        </div>
      </div>

      <div className="gb-actions">
        <button className={`gb-undo${undoArmed ? " armed" : ""}`} onClick={undo} disabled={!myCount}>
          {undoArmed ? "Tap again to scrape it off" : "Undo mine"}
        </button>
        <button className="gb-give" onClick={give} disabled={!totalCount}>Give it to Grandpa!</button>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function Names({ players }: { players: PublicState["players"] }) {
  return (
    <>
      {players.map((p, i) => (
        <span key={p.id} className="gb-name">
          <span className="dot" style={{ background: p.color }} />{p.name}{i < players.length - 2 ? ", " : i === players.length - 2 ? " and " : ""}
        </span>
      ))}
    </>
  );
}

function ToolButton({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button role="radio" aria-checked={on} className={on ? "on" : ""} onClick={onClick}>
      {children}
      <small>{label}</small>
    </button>
  );
}

const IconPipe = () => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <path d="M6 4h12l-3 13h-6z" fill="#f6ecd9" stroke="#8a6224" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M10.5 17h3l-1.5 4z" fill="#c8963e" />
    <path d="M5 27c3-3 5 1 8-1.5s5 1.5 9-1 4 0 5 0" fill="none" stroke="#f38fb8" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
const IconCandy = ({ color }: { color: string }) => (
  <svg viewBox="0 0 32 32" aria-hidden>
    <defs>
      <radialGradient id="gbCandy" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
        <stop offset="0.35" stopColor={color} />
        <stop offset="1" stopColor={color} />
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="10" fill="url(#gbCandy)" stroke="#0004" strokeWidth="1" />
  </svg>
);
const IconSprinkles = () => (
  <svg viewBox="0 0 32 32" aria-hidden strokeLinecap="round" strokeWidth="3">
    <path d="M7 10l4-3" stroke="#f38fb8" /><path d="M18 6l3 3" stroke="#f6c832" />
    <path d="M24 15l3-2" stroke="#3d8fe2" /><path d="M10 18l1 4" stroke="#2e9a52" />
    <path d="M17 16l4 2" stroke="#fbf6ec" /><path d="M14 26l4-2" stroke="#d6332b" />
    <path d="M23 23l2 3" stroke="#9a5fd6" />
  </svg>
);

/** The finished gingerbread as a JPEG, about 800px tall, for Grandpa (and the judge) to look at. */
async function composite(strokes: MyStroke[], art: HTMLImageElement | null): Promise<Blob> {
  const H = 800, W = Math.round(H * COOKIE_ASPECT);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createRadialGradient(W / 2, H * 0.45, W * 0.1, W / 2, H / 2, H * 0.75);
  bg.addColorStop(0, "#fbf3e3");
  bg.addColorStop(1, "#e6d3b0");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  drawCookie(g, W, H, art ?? (await loadCookieArt()));
  drawStrokes(g, strokes, W, H);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not wrap the gingerbread."))), "image/jpeg", 0.88));
}
