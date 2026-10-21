// Point and click on the TV, with Jingle as the pointer: the family flies the clockwork robin
// around the scene with the remote's arrows. Holding an arrow glides him; near something he can
// use he is pulled in gently, the spot glows and its name shows. OK makes him use whatever is
// under him. He can carry things hanging from his beak (a key, a record...), and his speech
// bubble follows him around.
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { JingleMood } from "../../../shared/types";
import { sfx } from "../sfx";
import { pressOk } from "./remote";
import { flySprite } from "./look";

export interface Hotspot {
  id: string;
  x: number;
  y: number;
  /** Radius in stage pixels. */
  r: number;
  label: string;
}

const SPEED = 820; // px per second at full glide
const SIZE = 210; // Jingle's sprite size on the 1920x1080 stage
const BEAK = { x: (43 / 512) * SIZE, y: (218 / 512) * SIZE };
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const OK_KEYS = new Set(["Enter", "NumpadEnter", " ", "Select", "Accept"]);

export function Hand({ hotspots, onPick, carrying, start, help, bubble, mood = "awake", glow, posRef }: {
  hotspots: Hotspot[];
  onPick: (h: Hotspot | null) => void;
  carrying?: ReactNode;
  start?: { x: number; y: number };
  help?: string;
  /** Jingle's latest line, shown next to him wherever he flies. */
  bubble?: { line: string; at: number } | null;
  mood?: JingleMood;
  /** A spot to light up without Jingle being on it (the toy orchestra uses it). */
  glow?: string | null;
  /** Receives Jingle's position every frame, for mini games that need it. */
  posRef?: MutableRefObject<{ x: number; y: number }>;
}) {
  const [pos, setPos] = useState(start ?? { x: 960, y: 520 });
  const posState = useRef(pos);
  const held = useRef(new Set<string>());
  const heldSince = useRef(0);
  const hotRef = useRef(hotspots);
  hotRef.current = hotspots;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [hover, setHover] = useState<Hotspot | null>(null);
  const hoverRef = useRef<Hotspot | null>(null);
  const [tap, setTap] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(-1); // the sprites face left
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (ARROWS[e.key]) {
        e.preventDefault();
        if (!held.current.size) heldSince.current = performance.now();
        held.current.add(e.key);
        if (ARROWS[e.key][0]) setFacing(ARROWS[e.key][0] > 0 ? 1 : -1);
        // A single tap still moves a little, even if the device sends no key repeats.
        if (!e.repeat) nudge(ARROWS[e.key], 26);
        return;
      }
      if (OK_KEYS.has(e.key) || [13, 23, 66].includes(e.keyCode)) {
        e.preventDefault();
        pressOk(() => { setTap((t) => t + 1); pickRef.current(hoverRef.current); });
      }
    };
    const up = (e: KeyboardEvent) => { held.current.delete(e.key); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    let raf = 0;
    let last = performance.now();
    let wasMoving = false;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      let { x, y } = posState.current;
      const isMoving = held.current.size > 0;
      if (isMoving) {
        // Ease in: slow for precision, then glide.
        const k = Math.min(1, 0.35 + (t - heldSince.current) / 600);
        for (const key of held.current) { const [dx, dy] = ARROWS[key]; x += dx * SPEED * k * dt; y += dy * SPEED * k * dt; }
      } else {
        // Magnet: settle onto the nearest spot when close.
        const near = nearest(hotRef.current, x, y, 1.5);
        if (near) { x += (near.x - x) * Math.min(1, dt * 6); y += (near.y - y) * Math.min(1, dt * 6); }
      }
      if (isMoving !== wasMoving) { wasMoving = isMoving; setMoving(isMoving); }
      x = Math.max(60, Math.min(1860, x));
      y = Math.max(90, Math.min(1040, y));
      if (x !== posState.current.x || y !== posState.current.y) {
        posState.current = { x, y };
        setPos(posState.current);
      }
      if (posRef) posRef.current = posState.current;
      const h = nearest(hotRef.current, x, y, 1);
      if (h?.id !== hoverRef.current?.id) {
        hoverRef.current = h;
        setHover(h);
        if (h) sfx.hover();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); cancelAnimationFrame(raf); };
  }, []);

  function nudge([dx, dy]: [number, number], d: number) {
    posState.current = { x: Math.max(60, Math.min(1860, posState.current.x + dx * d)), y: Math.max(90, Math.min(1040, posState.current.y + dy * d)) };
    setPos(posState.current);
  }

  const showBubble = bubble && Date.now() - bubble.at < 12000;
  return (
    <>
      {hotspots.map((h) => (
        <div key={h.id} className={`hotspot ${hover?.id === h.id || glow === h.id ? "on" : ""} ${glow === h.id ? "play" : ""}`}
          style={{ left: h.x - h.r, top: h.y - h.r, width: h.r * 2, height: h.r * 2 }} />
      ))}
      {hover && <div className="hotspot-label" style={{ left: hover.x, top: hover.y - hover.r - 16 }}>{hover.label}</div>}
      <div className="hand" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        {carrying && <div className="carry">{carrying}</div>}
        <JingleFlying key={tap} pecking={tap > 0} facing={facing} moving={moving} mood={mood} />
        {showBubble && <div className={`bubble flying ${pos.x > 1250 ? "left" : "right"}`} key={bubble!.at}>{bubble!.line}</div>}
      </div>
      {help && <div className="hand-help">{help}</div>}
    </>
  );
}

function nearest(spots: Hotspot[], x: number, y: number, reach: number) {
  let best: Hotspot | null = null;
  let bestD = Infinity;
  for (const h of spots) {
    const d = Math.hypot(h.x - x, h.y - y);
    if (d <= h.r * reach && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

/** Jingle in flight: two wing frames flapping (faster while he moves). His beak, bottom-left of
 * the sprite, is the point that touches things. Falls back to the perched sprite, then a drawing. */
function JingleFlying({ pecking, facing, moving, mood }: { pecking: boolean; facing: 1 | -1; moving: boolean; mood: JingleMood }) {
  const [frame, setFrame] = useState(0);
  // Sprites in order of preference; a missing one falls through to the next.
  const [skip, setSkip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => 1 - f), moving ? 110 : 260);
    return () => clearInterval(t);
  }, [moving]);
  const choices = [
    ...(mood === "cold" ? ["/scenes/jingle_cold.png"] : []),
    flySprite(frame),
    "/scenes/jingle_awake.png",
  ];
  const img = choices[skip];
  const flying = !!img?.includes("_fly_");
  return (
    <div className={`jingle-flyer ${pecking ? "peck" : ""} ${mood === "cold" ? "cold" : ""} ${flying ? "" : "bob"}`}
      style={flying
        // The beak tip is at (43, 218) of the 512px flying frames: keep it on the pointer, both ways.
        ? { width: SIZE, height: SIZE, left: facing === 1 ? -(SIZE - BEAK.x) : -BEAK.x, top: -BEAK.y, transform: `scaleX(${facing === 1 ? -1 : 1})` }
        : { width: SIZE, height: SIZE, left: -SIZE / 2, top: -SIZE * 0.85, transform: `scaleX(${facing === 1 ? -1 : 1})` }}>
      {img ? <img src={img} alt="Jingle" onError={() => setSkip((k) => k + 1)} /> : <span className="jingle-dot" />}
    </div>
  );
}
