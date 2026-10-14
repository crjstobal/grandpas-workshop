// Shared gingerbread rendering for the phone and the TV, so the cookie and the icing look the
// same on both screens.
//
// Coordinate model (matches IcingStroke): points are normalized 0..1 inside the cookie box,
// x across its width and y down its height. The box is always portrait, COOKIE_ASPECT wide per
// unit of height. A stroke's width is a fraction of the box WIDTH.
import type { IcingStroke } from "../../../shared/types";

/** Width / height of the cookie box. */
export const COOKIE_ASPECT = 3 / 4;

export const ICING_COLORS = [
  { name: "Snow white", hex: "#fbf6ec" },
  { name: "Cherry red", hex: "#d6332b" },
  { name: "Holly green", hex: "#2e9a52" },
  { name: "Sugar pink", hex: "#f38fb8" },
  { name: "Lemon yellow", hex: "#f6c832" },
  { name: "Frost blue", hex: "#3d8fe2" },
] as const;

export const SPRINKLE_COLORS = ["#fbf6ec", "#d6332b", "#2e9a52", "#f38fb8", "#f6c832", "#3d8fe2", "#9a5fd6"];

/** Nozzle widths, as a fraction of the cookie width. The server accepts 0.004..0.05. */
export const NOZZLES = [
  { name: "Fine", width: 0.012 },
  { name: "Medium", width: 0.022 },
  { name: "Thick", width: 0.036 },
] as const;
export const CANDY_WIDTH = 0.05;
export const SPRINKLE_WIDTH = 0.009;

type Ctx = CanvasRenderingContext2D;
type StrokeLike = Pick<IcingStroke, "color" | "width" | "points">;

// ---------------------------------------------------------------- the cookie art

let artPromise: Promise<HTMLImageElement | null> | null = null;

/** The painted gingerbread, or null when it is missing (then the procedural one is drawn). */
export function loadCookieArt(): Promise<HTMLImageElement | null> {
  artPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = "/scenes/gingerbread.png";
  });
  return artPromise;
}

/** Draws the undecorated cookie filling a w x h box (with its soft shadow). */
export function drawCookie(ctx: Ctx, w: number, h: number, art: HTMLImageElement | null) {
  ctx.save();
  ctx.shadowColor = "rgba(40, 16, 4, 0.45)";
  ctx.shadowBlur = w * 0.045;
  ctx.shadowOffsetY = w * 0.022;
  if (art) {
    const s = Math.min(w / art.naturalWidth, h / art.naturalHeight);
    const dw = art.naturalWidth * s, dh = art.naturalHeight * s;
    ctx.drawImage(art, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.drawImage(proceduralCookie(Math.round(w), Math.round(h)), 0, 0, w, h);
  }
  ctx.restore();
}

const procCache = new Map<string, HTMLCanvasElement>();

/** A classic gingerbread man drawn with canvas paths: baked rim, golden middle, a few speckles. */
function proceduralCookie(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  const hit = procCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext("2d")!;
  const u = w; // everything is measured in cookie widths
  const yOff = (h - u / COOKIE_ASPECT) / 2;

  const silhouette = (inset: number) => {
    g.beginPath();
    g.arc(0.5 * u, yOff + 0.25 * u, (0.155 - inset) * u, 0, Math.PI * 2);
    g.fill();
    roundRect(g, (0.32 + inset) * u, yOff + (0.35 + inset) * u, (0.36 - inset * 2) * u, (0.58 - inset * 2) * u, (0.15 - inset) * u);
    g.fill();
    g.lineCap = "round";
    const limb = (x1: number, y1: number, x2: number, y2: number, lw: number) => {
      g.lineWidth = (lw - inset * 2) * u;
      g.beginPath(); g.moveTo(x1 * u, yOff + y1 * u); g.lineTo(x2 * u, yOff + y2 * u); g.stroke();
    };
    limb(0.38, 0.5, 0.135, 0.625, 0.155);
    limb(0.62, 0.5, 0.865, 0.625, 0.155);
    limb(0.42, 0.84, 0.33, 1.165, 0.17);
    limb(0.58, 0.84, 0.67, 1.165, 0.17);
  };

  // Baked rim.
  g.fillStyle = g.strokeStyle = "#8c4519";
  silhouette(0);
  // Golden middle, lighter towards the centre.
  const grad = g.createRadialGradient(0.5 * u, yOff + 0.55 * u, 0.05 * u, 0.5 * u, yOff + 0.6 * u, 0.7 * u);
  grad.addColorStop(0, "#d58f4f");
  grad.addColorStop(0.6, "#bf7537");
  grad.addColorStop(1, "#a65b25");
  g.fillStyle = g.strokeStyle = grad;
  silhouette(0.02);

  // Speckles and a soft top light, only over the cookie.
  g.globalCompositeOperation = "source-atop";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(110, 50, 15, 0.28)" : "rgba(255, 220, 170, 0.18)";
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, (0.002 + rnd() * 0.004) * u, 0, Math.PI * 2);
    g.fill();
  }
  const sheen = g.createLinearGradient(0, yOff, 0, h);
  sheen.addColorStop(0, "rgba(255, 236, 200, 0.22)");
  sheen.addColorStop(0.5, "rgba(255, 236, 200, 0)");
  sheen.addColorStop(1, "rgba(60, 20, 0, 0.18)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";
  procCache.set(key, c);
  return c;
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// ---------------------------------------------------------------- icing

function tracePath(ctx: Ctx, pts: [number, number][], w: number, h: number, dx: number, dy: number) {
  ctx.beginPath();
  const X = (p: [number, number]) => p[0] * w + dx;
  const Y = (p: [number, number]) => p[1] * h + dy;
  ctx.moveTo(X(pts[0]), Y(pts[0]));
  if (pts.length === 2) { ctx.lineTo(X(pts[1]), Y(pts[1])); return; }
  // Quadratic curves through the midpoints: a smooth line that still passes near every point.
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (X(pts[i]) + X(pts[i + 1])) / 2, my = (Y(pts[i]) + Y(pts[i + 1])) / 2;
    ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(X(last), Y(last));
}

function isDot(pts: [number, number][], lwNorm: number) {
  if (pts.length === 1) return true;
  let maxD = 0;
  for (const p of pts) maxD = Math.max(maxD, Math.hypot(p[0] - pts[0][0], (p[1] - pts[0][1]) / COOKIE_ASPECT));
  return maxD < lwNorm * 0.25;
}

/** One stroke of icing: soft shadow on the cookie, the colour, and a glossy highlight on top. */
export function drawStroke(ctx: Ctx, s: StrokeLike, w: number, h: number) {
  const pts = s.points;
  if (!pts.length) return;
  const lw = Math.max(1, s.width * w);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isDot(pts, s.width)) {
    const x = pts[0][0] * w, y = pts[0][1] * h, r = lw / 2;
    ctx.fillStyle = "rgba(60, 24, 6, 0.38)";
    ctx.beginPath(); ctx.arc(x + r * 0.12, y + r * 0.22, r * 1.04, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    body.addColorStop(0, mix(s.color, "#ffffff", 0.35));
    body.addColorStop(0.55, s.color);
    body.addColorStop(1, mix(s.color, "#000000", 0.22));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  // Shadow where the icing sits on the cookie.
  ctx.strokeStyle = "rgba(60, 24, 6, 0.34)";
  ctx.lineWidth = lw * 1.1;
  tracePath(ctx, pts, w, h, lw * 0.06, lw * 0.2);
  ctx.stroke();
  // A slightly darker edge, then the body of the icing.
  ctx.strokeStyle = mix(s.color, "#3a1a08", 0.18);
  ctx.lineWidth = lw;
  tracePath(ctx, pts, w, h, 0, 0);
  ctx.stroke();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = lw * 0.78;
  tracePath(ctx, pts, w, h, 0, -lw * 0.04);
  ctx.stroke();
  // Glossy highlight along the top of the bead.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = Math.max(0.8, lw * 0.24);
  tracePath(ctx, pts, w, h, -lw * 0.14, -lw * 0.22);
  ctx.stroke();
  ctx.restore();
}

export function drawStrokes(ctx: Ctx, strokes: StrokeLike[], w: number, h: number) {
  for (const s of strokes) drawStroke(ctx, s, w, h);
}

/** A twinkling four-point sparkle, for the tip of a stroke being piped right now. */
export function drawSparkle(ctx: Ctx, x: number, y: number, size: number, t: number, alpha = 1) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 0.012);
  const r = size * pulse;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(t * 0.002);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
  glow.addColorStop(0, "rgba(255, 244, 200, 0.9)");
  glow.addColorStop(1, "rgba(255, 220, 140, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fffaf0";
  for (const k of [1, 0.55]) {
    ctx.rotate(Math.PI / 4);
    const a = r * k, b = r * 0.16 * k;
    ctx.beginPath();
    ctx.moveTo(0, -a); ctx.quadraticCurveTo(b, -b, a, 0); ctx.quadraticCurveTo(b, b, 0, a);
    ctx.quadraticCurveTo(-b, b, -a, 0); ctx.quadraticCurveTo(-b, -b, 0, -a);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- colour helper

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
}
