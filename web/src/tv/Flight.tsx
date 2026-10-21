// Up to the roof: Jingle carries Grandpa's star over the snowy rooftops to the top of the
// workshop roof, Flappy Bird style. OK on the remote flaps, gravity pulls him down, the world
// scrolls right to left. Chimney smoke, snowballs, icicles and wind gusts get in the way;
// sparkles make the star glow brighter. Bumping into something sends Jingle tumbling and costs a
// little ground, never the game. Shaking the phones sends a warm wind: a golden gust, a shield
// and a burst of speed. At the end Jingle sets the star on the roof peak like a lighthouse.
//
// Everything moving is drawn on one 1920x1080 canvas. Glows, smoke, snow and scenery are
// pre-rendered once on offscreen canvases, so each frame is mostly cheap drawImage calls.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PublicState } from "../../../shared/types";
import { api } from "../api";
import { playNote, sfx } from "../sfx";
import "./Flight.css";
import { flySprite } from "./look";

// ---------------- tuning ----------------
const W = 1920;
const H = 1080;
/** Jingle's screen x while flying. */
const JX = 520;
const START_Y = 470;
/** World pixels from the start to the moment the roof peak takes over. */
const TOTAL = 15000;
/** World scroll speed (px/s): TOTAL / BASE_SPEED = 50 s of clean flying. */
const BASE_SPEED = 300;
const BOOST_MUL = 1.75;
const BOOST_TIME = 4.2;
const GRAVITY = 1850;
const FLAP_V = -700;
const MAX_FALL = 850;
const BODY_R = 44;
const FLOOR_Y = 960;
const CEIL_Y = 70;
const INVULN = 1.6;
/** Knock-back speed after a hit; it decays at KNOCK_DECAY, so a hit rewinds about 225 px. */
const KNOCKBACK = 900;
const KNOCK_DECAY = 4;
/** Sparkles that fill the star glow meter. */
const GLOW_FULL = 30;
const SPRITE = 190;
const K = SPRITE / 512;
/** Body centre inside the 512px flying frames (they face left; we mirror them to face right). */
const BODY_PX = { x: 250, y: 270 };
/** The beak tip relative to the body centre, once mirrored. */
const BEAK = { x: (BODY_PX.x - 43) * K, y: (218 - BODY_PX.y) * K };
const STRING = 38;
/** Where the workshop roof peak sits in the world, and its brass star cup on screen. */
const PEAK_WX = TOTAL + JX + 760;
const PEAK_TOP = 560;
const LAST_OBSTACLE_WX = TOTAL + JX - 1200;
const FIRST_OBSTACLE_WX = 2100;
const FLAP_DEDUPE_MS = 80;
const REPORT_MS = 1000;
const LAND_TIME = 1.8;
const MAX_PARTS = 170;
/** Width of the progress rail in Flight.css (.fl-rail). */
const RAIL_W = 1080;

const FLAP_KEYS = new Set(["Enter", "NumpadEnter", " ", "Spacebar", "Select", "Accept", "ArrowUp"]);
const FLAP_CODES = new Set([13, 23, 32, 38, 66]);
const HIT_QUIPS = ["Oof!", "Whoops!", "Brr, snow!", "My gears!", "Eek!"];
// A rising pentatonic run for sparkle combos, in semitones above C5.
const COMBO_NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

type Phase = "tutorial" | "play" | "landing" | "landed";

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; grow: number; g: number; drag: number; img: HTMLCanvasElement;
  add: boolean; rot: number; vr: number; alpha: number;
}
interface Puff { wx: number; y: number; r: number; life: number; dead?: boolean }
interface Chimney { kind: "chimney"; wx: number; top: number; smoky: boolean; emit: number; cycle: number; puffs: Puff[] }
interface Eave { kind: "eave"; wx: number; ledge: number; variant: number; drop: boolean; dropped: boolean }
interface Thrower { kind: "thrower"; wx: number; vys: number[]; stage: 0 | 1 | 2; t: number }
interface Wind { kind: "wind"; wx: number; w: number; y0: number; y1: number; dir: 1 | -1; t: number; whooshed: boolean }
type Obstacle = Chimney | Eave | Thrower | Wind;
interface Ball { wx: number; y: number; vx: number; vy: number; rot: number; dead?: boolean }
interface Icicle { wx: number; y: number; vy: number; len: number; delay: number; dead?: boolean }
interface Spark { wx: number; y: number; ph: number; taken: boolean }
interface Quip { text: string; x: number; y: number; t: number; color: string }
interface Streak { x: number; y: number; len: number; v: number; life: number; max: number; w: number }
interface Ringwave { x: number; y: number; t: number; max: number; size: number }
interface Flake { x: number; y: number; z: number; ph: number }

interface HudRefs {
  fill: RefObject<HTMLDivElement | null>;
  marker: RefObject<HTMLDivElement | null>;
  glowFill: RefObject<HTMLDivElement | null>;
  glowCount: RefObject<HTMLElement | null>;
  bubble: RefObject<HTMLDivElement | null>;
}

interface Engine { boost: () => void; destroy: () => void }

// ---------------- small helpers ----------------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function loadImg(src: string) {
  const r = { img: new Image(), ok: false };
  r.img.onload = () => { r.ok = true; };
  r.img.src = src;
  return r;
}

// ---------------- pre-rendered sprites ----------------
function radial(size: number, stops: [number, string][]) {
  const [c, x] = makeCanvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function starPath(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}

function starSprite() {
  const [c, x] = makeCanvas(160, 160);
  x.lineJoin = "round";
  starPath(x, 80, 84, 70, 30);
  const g = x.createLinearGradient(30, 20, 130, 150);
  g.addColorStop(0, "#fff8d6"); g.addColorStop(0.45, "#ffd36b"); g.addColorStop(1, "#c8963e");
  x.fillStyle = g; x.fill();
  x.lineWidth = 6; x.strokeStyle = "#8a6224"; x.stroke();
  starPath(x, 80, 84, 42, 18);
  x.fillStyle = "rgba(255,252,235,0.6)"; x.fill();
  return c;
}

function twinkleSprite() {
  const c = radial(64, [[0, "rgba(255,250,225,1)"], [0.22, "rgba(255,215,120,0.55)"], [1, "rgba(255,200,90,0)"]]);
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(255,252,238,0.95)";
  x.beginPath();
  x.moveTo(32, 1); x.lineTo(35, 29); x.lineTo(63, 32); x.lineTo(35, 35);
  x.lineTo(32, 63); x.lineTo(29, 35); x.lineTo(1, 32); x.lineTo(29, 29);
  x.closePath(); x.fill();
  return c;
}

function smokeSprite() {
  const [c, x] = makeCanvas(128, 128);
  const blob = (bx: number, by: number, r: number, a: number) => {
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `rgba(198,208,224,${a})`); g.addColorStop(1, "rgba(198,208,224,0)");
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2); x.fill();
  };
  blob(64, 66, 60, 0.8); blob(42, 58, 34, 0.65); blob(86, 52, 30, 0.6); blob(66, 84, 30, 0.5);
  return c;
}

function snowballSprite(rand: () => number) {
  const [c, x] = makeCanvas(72, 72);
  const g = x.createRadialGradient(27, 25, 3, 36, 36, 32);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, "#e3ecf7"); g.addColorStop(1, "#97adc9");
  x.fillStyle = g; x.beginPath(); x.arc(36, 36, 30, 0, Math.PI * 2); x.fill();
  x.fillStyle = "rgba(140,165,198,0.55)";
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2, d = rand() * 22;
    x.beginPath(); x.arc(36 + Math.cos(a) * d, 36 + Math.sin(a) * d, 1.5 + rand() * 2.5, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = "rgba(110,135,170,0.55)"; x.lineWidth = 2;
  x.beginPath(); x.arc(36, 36, 30, 0, Math.PI * 2); x.stroke();
  return c;
}

function beamSprite() {
  const [c, x] = makeCanvas(1400, 320);
  const g = x.createLinearGradient(0, 0, 1400, 0);
  g.addColorStop(0, "rgba(255,238,175,0.7)"); g.addColorStop(0.35, "rgba(255,214,120,0.24)"); g.addColorStop(1, "rgba(255,200,100,0)");
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 148); x.lineTo(1400, 0); x.lineTo(1400, 320); x.lineTo(0, 172); x.closePath(); x.fill();
  return c;
}

function chimneySprite(rand: () => number) {
  const [c, x] = makeCanvas(150, 800);
  x.fillStyle = "#7a3f2c"; x.fillRect(16, 60, 118, 740);
  for (let row = 0, y = 62; y < 800; row++, y += 26) {
    const off = row % 2 ? 0 : 20;
    for (let bx = 16 + off - 40; bx < 134; bx += 40) {
      x.fillStyle = `rgba(${150 + rand() * 40},${70 + rand() * 25},${45 + rand() * 20},0.55)`;
      x.fillRect(Math.max(16, bx + 3), y + 3, Math.min(37, 134 - bx - 3), 23);
    }
    x.fillStyle = "#4a2519"; x.fillRect(16, y, 118, 3);
    for (let bx = 16 + off; bx < 134; bx += 40) x.fillRect(bx, y, 3, 26);
  }
  const sh = x.createLinearGradient(16, 0, 134, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.4)"); sh.addColorStop(0.35, "rgba(255,190,140,0.1)"); sh.addColorStop(1, "rgba(0,0,0,0.55)");
  x.fillStyle = sh; x.fillRect(16, 60, 118, 740);
  // A warm glint from the moonlit side.
  x.fillStyle = "rgba(255,210,150,0.18)"; x.fillRect(22, 60, 6, 740);
  x.fillStyle = "#5a2d20"; x.fillRect(4, 30, 142, 32);
  x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(4, 54, 142, 8);
  x.fillStyle = "rgba(255,200,140,0.25)"; x.fillRect(4, 30, 142, 4);
  // Snow cap with a blue shadow underneath.
  x.fillStyle = "#a9bfdc";
  x.beginPath(); x.moveTo(0, 40); x.quadraticCurveTo(12, 12, 42, 18); x.quadraticCurveTo(76, 4, 110, 16);
  x.quadraticCurveTo(146, 12, 150, 40); x.quadraticCurveTo(136, 52, 118, 44); x.quadraticCurveTo(96, 54, 76, 44);
  x.quadraticCurveTo(52, 54, 34, 44); x.quadraticCurveTo(14, 52, 0, 40); x.fill();
  x.fillStyle = "#f4f8ff";
  x.beginPath(); x.moveTo(0, 36); x.quadraticCurveTo(12, 8, 42, 14); x.quadraticCurveTo(76, 0, 110, 12);
  x.quadraticCurveTo(146, 8, 150, 36); x.quadraticCurveTo(136, 46, 118, 39); x.quadraticCurveTo(96, 48, 76, 39);
  x.quadraticCurveTo(52, 48, 34, 39); x.quadraticCurveTo(14, 46, 0, 36); x.fill();
  return c;
}

const EAVE_LEDGE = 1036; // sprite y of the gutter's snowy underside
const EAVE_ICE: number[][] = [[70, 120, 55, 150, 90, 60, 110], [100, 60, 140, 80, 130, 50, 95]];
const EAVE_ICE_MAX = EAVE_ICE.map((v) => Math.max(...v));

function eaveSprite(icicles: number[]) {
  const [c, x] = makeCanvas(320, 1220);
  const wg = x.createLinearGradient(24, 0, 296, 0);
  wg.addColorStop(0, "#141e33"); wg.addColorStop(0.5, "#22314d"); wg.addColorStop(1, "#111a2c");
  x.fillStyle = wg; x.fillRect(24, 0, 272, 1000);
  x.strokeStyle = "rgba(8,14,26,0.75)"; x.lineWidth = 10;
  for (const vx of [40, 160, 280]) { x.beginPath(); x.moveTo(vx, 0); x.lineTo(vx, 990); x.stroke(); }
  x.beginPath(); x.moveTo(24, 760); x.lineTo(296, 760); x.stroke();
  // A lit window: somebody up there is still awake.
  const glow = x.createRadialGradient(160, 865, 10, 160, 865, 150);
  glow.addColorStop(0, "rgba(255,200,110,0.35)"); glow.addColorStop(1, "rgba(255,200,110,0)");
  x.fillStyle = glow; x.fillRect(24, 715, 272, 280);
  const wing = x.createLinearGradient(0, 800, 0, 930);
  wing.addColorStop(0, "#ffe2a0"); wing.addColorStop(1, "#f0a050");
  x.fillStyle = wing; x.fillRect(110, 800, 100, 130);
  x.strokeStyle = "#2b1d14"; x.lineWidth = 8;
  x.beginPath(); x.moveTo(160, 800); x.lineTo(160, 930); x.moveTo(110, 865); x.lineTo(210, 865); x.stroke();
  x.strokeStyle = "#3a2516"; x.lineWidth = 10; x.strokeRect(105, 795, 110, 140);
  x.fillStyle = "#eef4fc"; x.fillRect(98, 932, 124, 12);
  // Gutter board with a brass edge, and the snow roll under it.
  x.fillStyle = "#3a2516"; x.fillRect(0, 990, 320, 38);
  x.fillStyle = "#c8963e"; x.fillRect(0, 990, 320, 6);
  x.fillStyle = "#eef4fc";
  x.beginPath(); x.moveTo(0, 1022);
  for (let i = 0; i <= 8; i++) x.quadraticCurveTo(i * 40 - 20, 1046, i * 40, 1030);
  x.lineTo(320, 1022); x.closePath(); x.fill();
  icicles.forEach((len, i) => {
    const ix = 30 + i * 43;
    const g = x.createLinearGradient(0, 1030, 0, 1030 + len);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#cfe2f6"); g.addColorStop(1, "rgba(190,215,240,0.35)");
    x.fillStyle = g;
    x.beginPath(); x.moveTo(ix - 13, 1030); x.lineTo(ix + 13, 1030); x.lineTo(ix + 1, 1030 + len); x.closePath(); x.fill();
    x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = 2;
    x.beginPath(); x.moveTo(ix - 5, 1034); x.lineTo(ix - 1, 1030 + len * 0.7); x.stroke();
  });
  return c;
}

function icicleSprite() {
  const [c, x] = makeCanvas(32, 160);
  const g = x.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#cfe2f6"); g.addColorStop(1, "rgba(190,215,240,0.4)");
  x.fillStyle = g;
  x.beginPath(); x.moveTo(2, 0); x.lineTo(30, 0); x.lineTo(17, 160); x.closePath(); x.fill();
  return c;
}

const PEAK_CUP = 30; // sprite y of the brass cup the star sits in
function peakSprite() {
  const [c, x] = makeCanvas(1500, 700);
  x.save();
  x.beginPath(); x.moveTo(0, 700); x.lineTo(750, 100); x.lineTo(1500, 700); x.closePath(); x.clip();
  x.fillStyle = "#4a271c"; x.fillRect(0, 0, 1500, 700);
  for (let row = 0, y = 104; y < 720; row++, y += 30) {
    for (let sx = (row % 2) * 30; sx < 1530; sx += 60) {
      x.fillStyle = row % 3 ? "#6b3a2a" : "#5e3224";
      x.beginPath(); x.arc(sx, y, 30, 0, Math.PI); x.fill();
    }
  }
  const sh = x.createLinearGradient(0, 100, 0, 700);
  sh.addColorStop(0, "rgba(255,200,140,0.12)"); sh.addColorStop(1, "rgba(5,10,20,0.55)");
  x.fillStyle = sh; x.fillRect(0, 0, 1500, 700);
  // Grandpa's round attic window, glowing warm.
  const wg = x.createRadialGradient(750, 420, 140, 750, 420, 260);
  wg.addColorStop(0, "rgba(255,200,110,0.35)"); wg.addColorStop(1, "rgba(255,200,110,0)");
  x.fillStyle = wg; x.fillRect(450, 160, 600, 540);
  const glass = x.createRadialGradient(735, 400, 10, 750, 420, 80);
  glass.addColorStop(0, "#fff3c4"); glass.addColorStop(1, "#f2a65a");
  x.fillStyle = glass; x.beginPath(); x.arc(750, 420, 80, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#3a2516"; x.lineWidth = 10;
  x.beginPath(); x.moveTo(670, 420); x.lineTo(830, 420); x.moveTo(750, 340); x.lineTo(750, 500); x.stroke();
  x.strokeStyle = "#c8963e"; x.lineWidth = 14; x.beginPath(); x.arc(750, 420, 84, 0, Math.PI * 2); x.stroke();
  x.restore();
  // Thick snow along both slopes.
  x.lineJoin = "round"; x.lineCap = "round";
  x.strokeStyle = "rgba(140,170,210,0.7)"; x.lineWidth = 16;
  x.beginPath(); x.moveTo(-10, 728); x.lineTo(750, 124); x.lineTo(1510, 728); x.stroke();
  x.strokeStyle = "#f4f8ff"; x.lineWidth = 38;
  x.beginPath(); x.moveTo(-10, 708); x.lineTo(750, 100); x.lineTo(1510, 708); x.stroke();
  x.fillStyle = "#f4f8ff";
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    for (const side of [-1, 1]) {
      const px = 750 + side * 750 * t, py = 100 + 600 * t + 16;
      x.beginPath(); x.ellipse(px, py, 9, 14 + (i % 3) * 6, 0, 0, Math.PI * 2); x.fill();
    }
  }
  // Brass finial with the cup for the star.
  x.strokeStyle = "#8a6224"; x.lineWidth = 14; x.beginPath(); x.moveTo(750, 96); x.lineTo(750, 42); x.stroke();
  x.strokeStyle = "#e0b45c"; x.lineWidth = 6; x.beginPath(); x.moveTo(748, 94); x.lineTo(748, 44); x.stroke();
  const cup = x.createLinearGradient(716, 0, 784, 0);
  cup.addColorStop(0, "#8a6224"); cup.addColorStop(0.45, "#ffe2a0"); cup.addColorStop(1, "#8a6224");
  x.fillStyle = cup;
  x.beginPath(); x.moveTo(716, PEAK_CUP); x.quadraticCurveTo(750, 62, 784, PEAK_CUP); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(750, PEAK_CUP, 34, 8, 0, 0, Math.PI * 2); x.fill();
  return c;
}

function skySprite(rand: () => number) {
  const [c, x] = makeCanvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#071120"); g.addColorStop(0.55, "#13233b"); g.addColorStop(1, "#2a3e5f");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(255,${235 + rand() * 20},${200 + rand() * 55},${0.25 + rand() * 0.7})`;
    const s = rand() < 0.1 ? 3 : 1.6;
    x.fillRect(rand() * W, rand() * H * 0.7, s, s);
  }
  const moon = x.createRadialGradient(1480, 200, 40, 1480, 200, 260);
  moon.addColorStop(0, "rgba(255,240,205,0.45)"); moon.addColorStop(1, "rgba(255,240,205,0)");
  x.fillStyle = moon; x.fillRect(1200, 0, 600, 480);
  x.fillStyle = "#fbf2da"; x.beginPath(); x.arc(1480, 200, 58, 0, Math.PI * 2); x.fill();
  x.fillStyle = "rgba(200,190,170,0.35)";
  x.beginPath(); x.arc(1462, 186, 12, 0, Math.PI * 2); x.arc(1500, 218, 8, 0, Math.PI * 2); x.fill();
  return c;
}

/** Rolling far hills, seamless across 1920 px (integer frequencies). */
const FAR_Y = 640;
function farTile(rand: () => number) {
  const TW = 1920, TH = 440;
  const [c, x] = makeCanvas(TW, TH);
  const hill = (px: number) => 170 + 46 * Math.sin((2 * Math.PI * px * 2) / TW + 0.6) + 26 * Math.sin((2 * Math.PI * px * 5) / TW + 2) + 12 * Math.sin((2 * Math.PI * px * 11) / TW);
  x.beginPath(); x.moveTo(0, TH);
  for (let px = 0; px <= TW; px += 12) x.lineTo(px, hill(px));
  x.lineTo(TW, TH); x.closePath();
  const g = x.createLinearGradient(0, 100, 0, TH);
  g.addColorStop(0, "#22365a"); g.addColorStop(1, "#14213a");
  x.fillStyle = g; x.fill();
  x.strokeStyle = "rgba(205,222,245,0.4)"; x.lineWidth = 5;
  x.beginPath();
  for (let px = 0; px <= TW; px += 12) { if (px) x.lineTo(px, hill(px) + 2); else x.moveTo(px, hill(px) + 2); }
  x.stroke();
  for (let i = 0; i < 46; i++) {
    const px = 30 + rand() * (TW - 60), py = hill(px) + 8, h = 18 + rand() * 26;
    x.fillStyle = "#101b30"; x.beginPath(); x.moveTo(px - h * 0.35, py + 4); x.lineTo(px, py - h); x.lineTo(px + h * 0.35, py + 4); x.fill();
  }
  for (let i = 0; i < 22; i++) {
    const px = 30 + rand() * (TW - 60), py = hill(px) + 26 + rand() * 40;
    x.fillStyle = "rgba(255,205,125,0.85)"; x.fillRect(px, py, 4, 5);
  }
  return c;
}

/** The town in the middle distance: house silhouettes with warm windows. */
const MID_Y = 740;
function midTile(rand: () => number) {
  const TW = 2400, TH = 380;
  const [c, x] = makeCanvas(TW, TH);
  x.fillStyle = "#15233a"; x.fillRect(0, TH - 40, TW, 40);
  let px = 20;
  while (px < TW - 280) {
    const w = 120 + rand() * 120, h = 90 + rand() * 110, roof = 40 + rand() * 50;
    const top = TH - h;
    x.fillStyle = "#15233a"; x.fillRect(px, top, w, h);
    x.fillStyle = "#101b2f";
    x.beginPath(); x.moveTo(px - 8, top); x.lineTo(px + w / 2, top - roof); x.lineTo(px + w + 8, top); x.closePath(); x.fill();
    x.strokeStyle = "rgba(220,232,246,0.85)"; x.lineWidth = 9; x.lineJoin = "round";
    x.beginPath(); x.moveTo(px - 8, top + 2); x.lineTo(px + w / 2, top - roof + 3); x.lineTo(px + w + 8, top + 2); x.stroke();
    if (rand() < 0.5) { x.fillStyle = "#101b2f"; x.fillRect(px + w * 0.7, top - roof * 0.9, 18, roof * 0.6); }
    const nWin = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < nWin; i++) {
      if (rand() < 0.25) continue;
      const wx = px + 16 + (i * (w - 40)) / Math.max(1, nWin - 1 || 1), wy = top + 26 + rand() * (h - 70);
      x.fillStyle = "rgba(255,190,100,0.25)"; x.fillRect(wx - 6, wy - 6, 28, 32);
      x.fillStyle = "#ffcf7a"; x.fillRect(wx, wy, 16, 20);
    }
    px += w + 20 + rand() * 60;
  }
  return c;
}

/** The snowy rooftops right under Jingle. */
const NEAR_TH = 270;
const NEAR_Y = H - 230;
function nearTile(rand: () => number) {
  const TW = 2400;
  const [c, x] = makeCanvas(TW, NEAR_TH);
  let px = 0;
  while (px < TW) {
    const w = Math.min(TW - px, 340 + rand() * 220);
    const base = 90 + rand() * 50, ridge = 30 + rand() * 30;
    const g = x.createLinearGradient(0, ridge, 0, NEAR_TH);
    g.addColorStop(0, "#26324c"); g.addColorStop(1, "#111827");
    x.fillStyle = g;
    x.beginPath(); x.moveTo(px, NEAR_TH); x.lineTo(px, base); x.lineTo(px + w / 2, ridge); x.lineTo(px + w, base); x.lineTo(px + w, NEAR_TH); x.closePath(); x.fill();
    if (rand() < 0.6) {
      const dx = px + w * (0.25 + rand() * 0.5), dy = base + 40;
      x.fillStyle = "rgba(255,190,100,0.28)"; x.fillRect(dx - 10, dy - 10, 48, 54);
      x.fillStyle = "#ffcf7a"; x.fillRect(dx, dy, 28, 34);
      x.fillStyle = "#2b1d14"; x.fillRect(dx + 12, dy, 4, 34); x.fillRect(dx, dy + 15, 28, 4);
    }
    x.lineJoin = "round"; x.lineCap = "round";
    x.strokeStyle = "rgba(140,170,210,0.8)"; x.lineWidth = 10;
    x.beginPath(); x.moveTo(px + 4, base + 14); x.lineTo(px + w / 2, ridge + 14); x.lineTo(px + w - 4, base + 14); x.stroke();
    x.strokeStyle = "#f4f8ff"; x.lineWidth = 22;
    x.beginPath(); x.moveTo(px + 6, base + 2); x.lineTo(px + w / 2, ridge + 2); x.lineTo(px + w - 6, base + 2); x.stroke();
    px += w;
  }
  return c;
}

// ---------------- the game ----------------
function createFlight(canvas: HTMLCanvasElement, cfg: {
  code: () => string;
  progress: number;
  done: boolean;
  onPhase: (p: Phase) => void;
  refs: HudRefs;
}): Engine {
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(20261224);
  const sp = {
    glow: radial(128, [[0, "rgba(255,240,190,1)"], [0.2, "rgba(255,214,120,0.75)"], [0.5, "rgba(255,180,80,0.22)"], [1, "rgba(255,170,60,0)"]]),
    warm: radial(64, [[0, "rgba(255,205,130,0.95)"], [1, "rgba(255,150,60,0)"]]),
    snow: radial(32, [[0, "rgba(255,255,255,1)"], [0.45, "rgba(240,246,255,0.8)"], [1, "rgba(230,240,255,0)"]]),
    ring: radial(256, [[0, "rgba(255,220,140,0.05)"], [0.7, "rgba(255,215,120,0.1)"], [0.84, "rgba(255,225,140,0.5)"], [0.9, "rgba(255,248,215,0.9)"], [0.95, "rgba(255,220,140,0.35)"], [1, "rgba(255,210,120,0)"]]),
    twinkle: twinkleSprite(),
    smoke: smokeSprite(),
    ball: snowballSprite(rand),
    star: starSprite(),
    beam: beamSprite(),
    chimney: chimneySprite(rand),
    eaves: EAVE_ICE.map(eaveSprite),
    icicle: icicleSprite(),
    peak: peakSprite(),
    sky: skySprite(rand),
    far: farTile(rand),
    mid: midTile(rand),
    near: nearTile(rand),
  };
  const bird = [loadImg(flySprite(0)), loadImg(flySprite(1))];
  const bg = loadImg("/scenes/roof.jpg");

  // World and Jingle.
  let phase: Phase = cfg.done ? "landed" : "tutorial";
  let t = 0;
  let dist = cfg.done ? TOTAL + 150 : clamp(cfg.progress, 0, 0.98) * TOTAL;
  let speedMul = 1, slow = 1, back = 0, speed = 0;
  let boostLeft = 0, shieldLeft = 0, invul = 0, tumble = -1, hitStop = 0, trauma = 0, flash = 0, warmth = 0;
  let pendingBoost = false;
  let glow = cfg.done ? GLOW_FULL : 0, glowPulse = 0, combo = 0, comboT = 0;
  let jx = JX, jy = START_Y, jvy = 0, tilt = 0, flapT = 9, sq = 0, sqv = 0;
  let starAng = 0, starAngV = 0;
  let trailT = 0;
  let windForce = 0;
  let nextWX = Math.max(FIRST_OBSTACLE_WX, dist + JX + 1500), patterns = 0, lastKind = "";
  let runway = false;
  let land = { t: 0, x0: JX, y0: START_Y, v0: BASE_SPEED };
  let placedT = 0;
  let sentP = cfg.progress;
  const obstacles: Obstacle[] = [];
  let balls: Ball[] = [];
  let icicles: Icicle[] = [];
  let sparks: Spark[] = [];
  let parts: Particle[] = [];
  let quips: Quip[] = [];
  let streaks: Streak[] = [];
  let rings: Ringwave[] = [];
  const flakes: Flake[] = Array.from({ length: 60 }, () => ({ x: rand() * W, y: rand() * H, z: 0.25 + rand() * 0.75, ph: rand() * 6.28 }));
  const timers: ReturnType<typeof setTimeout>[] = [];

  if (cfg.done) {
    const peakSX = PEAK_WX - dist;
    jx = peakSX - 230; jy = PEAK_TOP - 120; placedT = 10;
  } else {
    // A few sparkles to fly through while warming up.
    sparkArc(dist + JX + 500, 430, 5, 120, -50);
  }

  // ---- particles ----
  function emit(x: number, y: number, o: Partial<Particle> & { img: HTMLCanvasElement }) {
    if (parts.length >= MAX_PARTS) return;
    parts.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.6, size: 20, grow: 0, g: 0, drag: 0, add: false, rot: 0, vr: 0, alpha: 1, ...o });
  }
  function burst(x: number, y: number, n: number, img: HTMLCanvasElement, spd: number, o: Partial<Particle> = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, v = spd * (0.4 + rand() * 0.6);
      emit(x, y, { img, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: 0.5 + rand() * 0.4, size: 14 + rand() * 18, drag: 2.5, ...o });
    }
  }
  function quip(text: string, color = "#fff3c4") {
    quips.push({ text, x: jx - 60, y: jy - 100, t: 0, color });
    if (quips.length > 3) quips.shift();
  }

  // ---- level ----
  function sparkArc(x0: number, y0: number, n: number, gap: number, bump: number) {
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      sparks.push({ wx: x0 + i * gap, y: clamp(y0 + Math.sin(u * Math.PI) * bump, 120, 900), ph: rand() * 6.28, taken: false });
    }
  }

  function spawnPattern() {
    const x = nextWX;
    const d = clamp((x - FIRST_OBSTACLE_WX) / (LAST_OBSTACLE_WX - FIRST_OBSTACLE_WX), 0, 1);
    let gap = 860 - 280 * d;
    let kind: string;
    if (patterns === 0) kind = "chimney";
    else if (patterns === 1) kind = "eave";
    else if (patterns === 2) kind = "snow";
    else {
      const table: [string, number][] = [["chimney", 3], ["eave", 2], ["pair", 0.6 + 2.6 * d], ["snow", 2], ["wind", lastKind === "wind" ? 0 : 1.3]];
      let r = rand() * table.reduce((s, [, w]) => s + w, 0);
      kind = table.find(([, w]) => (r -= w) < 0)?.[0] ?? "chimney";
    }
    lastKind = kind;
    patterns++;
    if (kind === "chimney") {
      const top = 820 - rand() * (140 + 140 * d);
      obstacles.push({ kind: "chimney", wx: x, top, smoky: true, emit: 0, cycle: rand() * 2.6, puffs: [] });
      sparkArc(x - 170, top - 390, 4, 120, -50);
    } else if (kind === "eave") {
      const variant = Math.floor(rand() * 2);
      const ledge = 150 + rand() * (140 + 90 * d);
      obstacles.push({ kind: "eave", wx: x, ledge, variant, drop: d > 0.25 && rand() < 0.55, dropped: false });
      sparkArc(x - 60, ledge + EAVE_ICE_MAX[variant] + 210, 4, 130, 40);
    } else if (kind === "pair") {
      // The classic gap: an eave above, a cold chimney below.
      const variant = Math.floor(rand() * 2);
      const G = 480 - 140 * d;
      const gc = 450 + rand() * 250;
      obstacles.push({ kind: "eave", wx: x, ledge: gc - G / 2 - EAVE_ICE_MAX[variant], variant, drop: false, dropped: false });
      obstacles.push({ kind: "chimney", wx: x + 85, top: gc + G / 2, smoky: false, emit: 0, cycle: 0, puffs: [] });
      sparkArc(x + 40, gc, 3, 120, 0);
      gap += 120;
    } else if (kind === "snow") {
      const n = d > 0.45 && rand() < 0.6 ? 2 : 1;
      const vys = Array.from({ length: n }, () => -(1300 + rand() * 320));
      obstacles.push({ kind: "thrower", wx: x + 200, vys, stage: 0, t: 0 });
      sparkArc(x - 100, 330 + rand() * 300, 5, 110, rand() < 0.5 ? -60 : 60);
      gap += 100;
    } else {
      const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
      obstacles.push({ kind: "wind", wx: x, w: 520, y0: 120, y1: 980, dir, t: 0, whooshed: false });
      // Sparkles ride the gust, so following the wind is rewarded.
      for (let i = 0; i < 5; i++) sparks.push({ wx: x + 60 + i * 100, y: 540 + dir * (i - 2) * 70, ph: rand() * 6.28, taken: false });
      gap += 200;
    }
    nextWX += gap;
  }

  function spawnRunway() {
    runway = true;
    // A rising trail of sparkles that points at the roof peak.
    const x0 = LAST_OBSTACLE_WX + 300, x1 = PEAK_WX - 260;
    const n = 11;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      sparks.push({ wx: lerp(x0, x1, u), y: lerp(560, PEAK_TOP - 70, easeInOutCubic(u)) - Math.sin(u * Math.PI) * 90, ph: rand() * 6.28, taken: false });
    }
  }

  // ---- actions ----
  function flap() {
    if (phase === "tutorial") start();
    if (phase !== "play") return;
    jvy = FLAP_V;
    flapT = 0;
    sqv += 5.5;
    starAngV -= 2.6;
    sfx.ratchet();
    for (let i = 0; i < 4; i++) {
      emit(jx - 30 + rand() * 20, jy + 30, { img: sp.snow, vx: -120 - rand() * 160, vy: 60 + rand() * 120, max: 0.45, size: 10 + rand() * 10, drag: 3, alpha: 0.8 });
    }
  }

  function start() {
    phase = "play";
    cfg.onPhase("play");
    jvy = 0;
    if (pendingBoost) { pendingBoost = false; applyBoost(); }
  }

  function applyBoost() {
    boostLeft = boostLeft > 0 ? Math.min(7, boostLeft + 1.8) : BOOST_TIME;
    shieldLeft = boostLeft;
    warmth = 1;
    jvy = Math.min(jvy, -220);
    sfx.whirr();
    sfx.chime();
    quip("Warm wind!", "#ffd36b");
    for (let i = 0; i < 34; i++) {
      streaks.push({ x: -200 - rand() * 900, y: 80 + rand() * 900, len: 160 + rand() * 260, v: 1500 + rand() * 900, life: 0, max: 1.2 + rand() * 0.5, w: 3 + rand() * 5 });
    }
    rings.push({ x: jx, y: jy, t: 0, max: 0.6, size: 420 });
  }

  function boost() {
    if (phase === "tutorial") {
      pendingBoost = true;
      warmth = 0.6;
      sfx.chime();
      return;
    }
    if (phase === "play") { applyBoost(); return; }
    // Landing or landed: just a happy golden gust.
    warmth = 0.8;
    for (let i = 0; i < 20; i++) streaks.push({ x: -200 - rand() * 600, y: 80 + rand() * 900, len: 160 + rand() * 260, v: 1500 + rand() * 900, life: 0, max: 1.2, w: 3 + rand() * 4 });
    sfx.sparkle();
  }

  function hit(x: number, y: number) {
    if (invul > 0 || shieldLeft > 0 || phase !== "play") return;
    invul = INVULN;
    tumble = 0;
    back = KNOCKBACK;
    slow = 0.35;
    jvy = -380;
    trauma = Math.min(1, trauma + 0.75);
    hitStop = 0.07;
    combo = 0;
    sfx.boing();
    quip(HIT_QUIPS[Math.floor(rand() * HIT_QUIPS.length)]);
    burst(x, y, 16, sp.snow, 520, { g: 600, alpha: 0.95 });
    burst(jx, jy, 6, sp.twinkle, 380, { add: true, vr: 6, size: 26 });
  }

  /** Something small met the shield: it pops into sparkles instead. */
  function deflect(x: number, y: number) {
    burst(x, y, 10, sp.twinkle, 420, { add: true, vr: 5, size: 24 });
    burst(x, y, 6, sp.snow, 300, { alpha: 0.8 });
    sfx.pop();
  }

  function collect(s: Spark, x: number, y: number) {
    s.taken = true;
    glow = Math.min(99, glow + 1);
    glowPulse = 1;
    combo = comboT > 0 ? combo + 1 : 0;
    comboT = 1.3;
    playNote(COMBO_NOTES[Math.min(combo, COMBO_NOTES.length - 1)]);
    burst(x, y, 7, sp.twinkle, 300, { add: true, vr: 6, size: 22, max: 0.5 });
    if (combo === 5) quip("Shiny!", "#ffd36b");
  }

  function beginLanding() {
    phase = "landing";
    land = { t: 0, x0: jx, y0: jy, v0: Math.max(160, speed) };
    invul = 0; tumble = -1; boostLeft = 0;
    cfg.onPhase("landing");
  }

  function place(sx: number, sy: number) {
    phase = "landed";
    placedT = 0;
    flash = 1;
    trauma = 0.45;
    glowPulse = 1;
    burst(sx, sy, 40, sp.twinkle, 900, { add: true, vr: 5, size: 30, max: 1.1, drag: 1.6 });
    burst(sx, sy, 24, sp.glow, 600, { add: true, size: 50, max: 0.9, drag: 2 });
    rings.push({ x: sx, y: sy, t: 0, max: 0.9, size: 900 }, { x: sx, y: sy, t: -0.15, max: 1.1, size: 1400 });
    sfx.chime();
    sfx.sparkle();
    timers.push(setTimeout(() => sfx.toot(), 1100), setTimeout(() => sfx.toot(), 1700));
    cfg.onPhase("landed");
    report(1);
  }

  function report(p: number) {
    sentP = Math.max(sentP, p);
    api.flight(cfg.code(), p).catch(() => {});
  }

  // ---- update ----
  function update(dt: number) {
    trauma = Math.max(0, trauma - dt * 1.6);
    flash = Math.max(0, flash - dt * 1.7);
    warmth = Math.max(0, warmth - dt * 0.8);
    glowPulse = Math.max(0, glowPulse - dt * 3);
    comboT -= dt;
    flapT += dt;

    // Squash and stretch spring.
    sqv += (-170 * sq - 13 * sqv) * dt;
    sq += sqv * dt;

    // The star swings on its chain behind the beak.
    const swingTarget = -0.22 - clamp(-jvy, 0, 900) / 900 * 0.35 + clamp(jvy, 0, 900) / 900 * 0.25;
    starAngV += (-40 * (starAng - swingTarget) - 4 * starAngV) * dt;
    starAng += starAngV * dt;

    windForce = 0;
    if (phase === "tutorial") {
      speed = 0;
      jy = START_Y + Math.sin(t * 2.6) * 16;
      jvy = Math.cos(t * 2.6) * 40;
      tilt += (-0.06 - tilt) * Math.min(1, dt * 6);
    } else if (phase === "play") {
      updatePlay(dt);
    } else if (phase === "landing") {
      updateLanding(dt);
    } else {
      updateLanded(dt);
    }

    // Snow: drifts with the world and the wind.
    for (const f of flakes) {
      f.x -= (speed * f.z * 0.7 + 25) * dt;
      f.y += (35 + 70 * f.z) * dt;
      f.ph += dt * 1.5;
      f.x += Math.sin(f.ph) * 20 * dt;
      if (f.x < -20) { f.x += W + 40; }
      if (f.y > H + 20) { f.y = -20; f.x = rand() * W; }
    }

    for (const p of parts) {
      p.life += dt;
      p.vy += p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    parts = parts.filter((p) => p.life < p.max);
    for (const q of quips) { q.t += dt; q.y -= 50 * dt; }
    quips = quips.filter((q) => q.t < 1.1);
    for (const s of streaks) { s.life += dt; s.x += s.v * dt; }
    streaks = streaks.filter((s) => s.life < s.max && s.x - s.len < W);
    for (const r of rings) r.t += dt;
    rings = rings.filter((r) => r.t < r.max);
  }

  function updatePlay(dt: number) {
    const target = boostLeft > 0 ? BOOST_MUL : 1;
    speedMul += (target - speedMul) * Math.min(1, dt * 3);
    slow = Math.min(1, slow + dt * 0.9);
    back *= Math.exp(-KNOCK_DECAY * dt);
    speed = BASE_SPEED * speedMul * slow - back;
    dist = Math.max(0, dist + speed * dt);
    boostLeft -= dt; shieldLeft -= dt; invul -= dt;
    if (tumble >= 0) { tumble += dt; if (tumble > 0.8) tumble = -1; }

    // Spawning ahead of the screen.
    while (nextWX < dist + W + 700 && nextWX < LAST_OBSTACLE_WX) spawnPattern();
    if (nextWX >= LAST_OBSTACLE_WX && !runway) spawnRunway();

    const r = BODY_R * 0.85;
    for (const o of obstacles) {
      const sx = o.wx - dist;
      if (o.kind === "chimney") {
        if (o.smoky) {
          o.cycle += dt;
          o.emit -= dt;
          if (o.cycle % 2.6 < 1.5 && o.emit <= 0 && sx < W + 300) {
            o.emit = 0.16;
            o.puffs.push({ wx: o.wx + 75 + (rand() - 0.5) * 20, y: o.top - 6, r: 24, life: 0 });
          }
        }
        for (const p of o.puffs) {
          p.life += dt;
          p.y -= (135 - p.life * 22) * dt;
          p.wx -= 40 * dt;
          p.r = 24 + p.life * 30;
          if (!p.dead && p.life < 1.7) {
            const px = p.wx - dist;
            if ((px - jx) ** 2 + (p.y - jy) ** 2 < (p.r * 0.55 + r) ** 2) {
              if (shieldLeft > 0) { p.dead = true; deflect(px, p.y); } else hit(px, p.y);
            }
          }
        }
        o.puffs = o.puffs.filter((p) => !p.dead && p.life < 2.6);
        if (shieldLeft <= 0 && circleRect(jx, jy, r, sx + 10, o.top - 8, 130, H)) hit(jx + 30, jy);
      } else if (o.kind === "eave") {
        const ice = EAVE_ICE_MAX[o.variant];
        if (shieldLeft <= 0 && (circleRect(jx, jy, r, sx, -20, 320, o.ledge + 20) || circleRect(jx, jy, r, sx + 30, o.ledge, 260, ice * 0.55))) hit(jx + 20, jy - 30);
        if (o.drop && !o.dropped && sx < JX + 330) {
          o.dropped = true;
          icicles.push({ wx: o.wx + 160, y: o.ledge, vy: 0, len: ice, delay: 0.35 });
        }
      } else if (o.kind === "thrower") {
        if (o.stage === 0 && sx < 1300) { o.stage = 1; o.t = 0; }
        if (o.stage === 1) {
          o.t += dt;
          if (rand() < dt * 30) emit(clamp(sx, 80, W - 80) + (rand() - 0.5) * 60, H - 40, { img: sp.snow, vx: (rand() - 0.5) * 80, vy: -260 - rand() * 200, g: 700, size: 12 + rand() * 10, max: 0.6 });
          if (o.t > 0.65) {
            o.stage = 2;
            o.vys.forEach((vy, i) => balls.push({ wx: o.wx + i * 70, y: H + 40, vx: -(60 + rand() * 140), vy: vy * (1 - i * 0.12), rot: 0 }));
            sfx.knock();
          }
        }
      } else {
        o.t += dt;
        if (!o.whooshed && sx < JX + 260) { o.whooshed = true; sfx.tinkle(); }
        if (jx > sx && jx < sx + o.w && jy > o.y0 && jy < o.y1) windForce = o.dir * 1600;
        if (sx < W && sx + o.w > 0 && rand() < dt * 14) {
          emit(sx + rand() * o.w, o.dir > 0 ? o.y0 + rand() * 200 : o.y1 - rand() * 200, { img: sp.snow, vx: -speed * 0.2, vy: o.dir * (500 + rand() * 300), size: 8 + rand() * 8, max: 0.9, alpha: 0.8 });
        }
      }
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (o.wx - dist < -700 && (o.kind !== "chimney" || o.puffs.length === 0)) obstacles.splice(i, 1);
    }

    for (const b of balls) {
      b.wx += b.vx * dt;
      b.vy += 1500 * dt;
      b.y += b.vy * dt;
      b.rot += dt * 7;
      const bx = b.wx - dist;
      if (!b.dead && (bx - jx) ** 2 + (b.y - jy) ** 2 < (28 + r) ** 2) {
        b.dead = true;
        if (shieldLeft > 0) deflect(bx, b.y); else { hit(bx, b.y); burst(bx, b.y, 10, sp.snow, 400, { g: 700 }); }
      }
      if (b.vy > 0 && b.y > H + 80) b.dead = true;
    }
    balls = balls.filter((b) => !b.dead);

    for (const ic of icicles) {
      if (ic.delay > 0) { ic.delay -= dt; continue; }
      ic.vy += 2400 * dt;
      ic.y += ic.vy * dt;
      const ix = ic.wx - dist, tipY = ic.y + ic.len * 0.6;
      if (!ic.dead && (ix - jx) ** 2 + (tipY - jy) ** 2 < (22 + r) ** 2) {
        ic.dead = true;
        if (shieldLeft > 0) deflect(ix, tipY); else hit(ix, tipY);
      }
      if (!ic.dead && ic.y + ic.len > FLOOR_Y + 20) {
        ic.dead = true;
        burst(ix, FLOOR_Y, 10, sp.snow, 360, { g: 900, size: 10 });
        sfx.tick();
      }
    }
    icicles = icicles.filter((ic) => !ic.dead);

    // Jingle.
    jvy = Math.min(MAX_FALL, jvy + (GRAVITY + windForce) * dt);
    jy += jvy * dt;
    if (jy > FLOOR_Y) {
      jy = FLOOR_Y;
      if (jvy > 200) {
        jvy = -Math.min(640, jvy * 0.8);
        sqv -= 7;
        burst(jx, jy + 40, 8, sp.snow, 260, { g: 500, alpha: 0.9 });
        sfx.knock();
      } else jvy = -320;
    }
    if (jy < CEIL_Y) { jy = CEIL_Y; jvy = Math.max(jvy, 80); }
    const tt = clamp(jvy / MAX_FALL, -0.6, 1) * 0.6;
    tilt += (tt - tilt) * Math.min(1, dt * 9);

    collectSparks();

    // A twinkling trail from the star, brighter with more glow.
    trailT -= dt;
    if (trailT <= 0) {
      trailT = 0.05;
      const s = starPos();
      emit(s.x + (rand() - 0.5) * 14, s.y + (rand() - 0.5) * 14, { img: rand() < 0.3 ? sp.twinkle : sp.warm, add: true, vx: -speed * 0.5 - 40, vy: (rand() - 0.5) * 40, size: 14 + 14 * glowFrac(), grow: -10, max: 0.6 });
    }
    if (shieldLeft > 0 && rand() < dt * 20) {
      const a = rand() * Math.PI * 2;
      emit(jx + Math.cos(a) * 110, jy + Math.sin(a) * 110, { img: sp.twinkle, add: true, vx: -200, vy: 0, size: 18, max: 0.5, vr: 4 });
    }

    if (dist >= TOTAL) beginLanding();
  }

  function collectSparks() {
    const s = starPos();
    const reach = shieldLeft > 0 ? 170 : 74;
    for (const sk of sparks) {
      if (sk.taken) continue;
      const x = sk.wx - dist, y = sk.y + Math.sin(t * 3 + sk.ph) * 10;
      if (x < -100 || x > W + 100) continue;
      if ((x - jx) ** 2 + (y - jy) ** 2 < reach * reach || (x - s.x) ** 2 + (y - s.y) ** 2 < 50 * 50) collect(sk, x, y);
    }
    sparks = sparks.filter((sk) => !sk.taken && sk.wx - dist > -200);
  }

  function updateLanding(dt: number) {
    land.t += dt;
    const k = Math.max(0, 1 - land.t / 1.1);
    speed = land.v0 * k;
    dist += speed * dt;
    const peakSX = PEAK_WX - dist;
    const cupX = peakSX, cupY = PEAK_TOP - 30;
    // Aim so the hanging star lands in the cup.
    const tx = cupX - BEAK.x, ty = cupY - BEAK.y - STRING;
    const u = easeInOutCubic(Math.min(1, land.t / LAND_TIME));
    jx = lerp(land.x0, tx, u);
    jy = lerp(land.y0, ty, u) - Math.sin(u * Math.PI) * 160;
    flapT = (land.t * 9) % 1 < 0.5 ? 0 : 9;
    tilt += (lerp(-0.25, 0.05, u) - tilt) * Math.min(1, dt * 6);
    starAng += (0 - starAng) * Math.min(1, dt * 8);
    collectSparks();
    if (land.t >= LAND_TIME) place(cupX, cupY - 4);
  }

  function updateLanded(dt: number) {
    placedT += dt;
    speed = 0;
    const peakSX = PEAK_WX - dist;
    const hx = peakSX - 230, hy = PEAK_TOP - 120 + Math.sin(t * 2.2) * 14;
    jx += (hx - jx) * Math.min(1, dt * 2.5);
    jy += (hy - jy) * Math.min(1, dt * 2.5);
    flapT = (t * 4) % 1 < 0.5 ? 0 : 9;
    tilt += (-0.08 - tilt) * Math.min(1, dt * 4);
    if (rand() < dt * 8) {
      emit(peakSX + (rand() - 0.5) * 60, PEAK_TOP - 40, { img: sp.twinkle, add: true, vx: (rand() - 0.5) * 120, vy: -120 - rand() * 160, size: 16 + rand() * 16, max: 1.4, vr: 3 });
    }
  }

  const glowFrac = () => Math.min(1, glow / GLOW_FULL);

  function starPos() {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const bx = jx + BEAK.x * c - BEAK.y * s;
    const by = jy + BEAK.x * s + BEAK.y * c;
    return { bx, by, x: bx + Math.sin(starAng) * STRING, y: by + Math.cos(starAng) * STRING };
  }

  // ---- render ----
  function drawTile(img: HTMLCanvasElement, factor: number, y: number) {
    const tw = img.width;
    const off = ((dist * factor) % tw + tw) % tw;
    ctx.drawImage(img, -off, y);
    if (tw - off < W + 40) ctx.drawImage(img, tw - off, y);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (trauma > 0) {
      const s = trauma * trauma;
      ctx.translate((rand() - 0.5) * 2 * 26 * s, (rand() - 0.5) * 2 * 20 * s);
    }
    const prog = clamp(dist / (TOTAL + 400), 0, 1);

    // Sky.
    if (bg.ok) {
      const iw = bg.img.naturalWidth, ih = bg.img.naturalHeight;
      const sc = Math.max(W / iw, H / ih) * 1.1;
      const dw = iw * sc, dh = ih * sc;
      ctx.drawImage(bg.img, -(dw - W) * (0.1 + 0.8 * prog), -(dh - H) * 0.5, dw, dh);
    } else {
      ctx.drawImage(sp.sky, -20, -20, W + 40, H + 40);
    }

    // Far and middle scenery.
    ctx.globalAlpha = bg.ok ? 0.6 : 1;
    drawTile(sp.far, 0.12, FAR_Y);
    ctx.globalAlpha = bg.ok ? 0.85 : 1;
    drawTile(sp.mid, 0.35, MID_Y);
    ctx.globalAlpha = 1;
    drawFlakes(false);

    // Wind gusts behind everything solid.
    for (const o of obstacles) if (o.kind === "wind") drawWind(o);

    // Eaves and chimneys.
    for (const o of obstacles) {
      const sx = o.wx - dist;
      if (o.kind === "eave") {
        if (sx > W || sx < -340) continue;
        let wob = 0;
        if (o.drop && !o.dropped && sx - JX < 700) wob = Math.sin(t * 50) * 3;
        ctx.drawImage(sp.eaves[o.variant], sx + wob, o.ledge - EAVE_LEDGE);
      } else if (o.kind === "chimney") {
        if (sx < W && sx > -160) {
          const h = Math.min(800, H - o.top + 40);
          ctx.drawImage(sp.chimney, 0, 0, 150, h, sx, o.top - 30, 150, h);
        }
      }
    }
    for (const ic of icicles) {
      const ix = ic.wx - dist;
      ctx.drawImage(sp.icicle, ix - 16, ic.y, 32, ic.len);
    }

    // Rooftops under Jingle, then the workshop peak arriving.
    drawTile(sp.near, 1, NEAR_Y);
    const peakSX = PEAK_WX - dist;
    if (peakSX - 750 < W) ctx.drawImage(sp.peak, peakSX - 750, PEAK_TOP - PEAK_CUP);

    // Smoke puffs over the chimneys.
    for (const o of obstacles) {
      if (o.kind !== "chimney") continue;
      for (const p of o.puffs) {
        const px = p.wx - dist;
        if (px < -150 || px > W + 150) continue;
        ctx.globalAlpha = Math.max(0, 0.95 * (1 - p.life / 2.6));
        const s = p.r * 2.4;
        ctx.drawImage(sp.smoke, px - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;

    // Glows: sparkles, warm tint, landed lighthouse.
    ctx.globalCompositeOperation = "lighter";
    if (phase === "landed") drawBeacon(peakSX, PEAK_TOP - 34);
    for (const sk of sparks) {
      const x = sk.wx - dist;
      if (x < -60 || x > W + 60) continue;
      const y = sk.y + Math.sin(t * 3 + sk.ph) * 10;
      const pulse = 1 + Math.sin(t * 6 + sk.ph) * 0.15;
      ctx.drawImage(sp.glow, x - 45 * pulse, y - 45 * pulse, 90 * pulse, 90 * pulse);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.5 + sk.ph);
      ctx.drawImage(sp.twinkle, -26 * pulse, -26 * pulse, 52 * pulse, 52 * pulse);
      ctx.restore();
    }
    for (const r of rings) {
      if (r.t < 0) continue;
      const u = easeOutCubic(r.t / r.max);
      ctx.globalAlpha = 1 - r.t / r.max;
      const s = r.size * u;
      ctx.drawImage(sp.ring, r.x - s / 2, r.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Snowballs and their warnings.
    for (const o of obstacles) {
      if (o.kind !== "thrower" || o.stage !== 1) continue;
      const x = clamp(o.wx - dist, 80, W - 80);
      const pulse = 1 + Math.sin(o.t * 26) * 0.12;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(sp.ring, x - 70 * pulse, H - 150 - 70 * pulse, 140 * pulse, 140 * pulse);
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "900 72px Nunito, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 10; ctx.strokeStyle = "#0d1b2a"; ctx.fillStyle = "#fff3c4";
      ctx.strokeText("!", x, H - 124); ctx.fillText("!", x, H - 124);
    }
    for (const b of balls) {
      const bx = b.wx - dist;
      ctx.save(); ctx.translate(bx, b.y); ctx.rotate(b.rot);
      ctx.drawImage(sp.ball, -34, -34, 68, 68);
      ctx.restore();
    }

    drawJingleAndStar();

    // Particles: soft ones, then glowing ones.
    for (const add of [false, true]) {
      ctx.globalCompositeOperation = add ? "lighter" : "source-over";
      for (const p of parts) {
        if (p.add !== add) continue;
        const s = Math.max(0, p.size + p.grow * p.life);
        if (s <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.alpha * (1 - p.life / p.max));
        if (p.vr) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
          ctx.restore();
        } else ctx.drawImage(p.img, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;

    // Warm wind streaks.
    if (streaks.length) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const s of streaks) {
        const a = Math.sin(Math.PI * Math.min(1, s.life / s.max));
        ctx.strokeStyle = `rgba(255,${200 + Math.floor(a * 40)},120,${0.55 * a})`;
        ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(s.x - s.len, s.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    drawFlakes(true);

    // Little words that pop out of Jingle.
    ctx.textAlign = "center";
    ctx.font = "800 46px Nunito, system-ui, sans-serif";
    for (const q of quips) {
      const s = q.t < 0.25 ? easeOutBack(q.t / 0.25) : 1;
      ctx.globalAlpha = q.t > 0.75 ? Math.max(0, 1 - (q.t - 0.75) / 0.35) : 1;
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s); ctx.rotate(-0.06);
      ctx.lineWidth = 10; ctx.strokeStyle = "#0d1b2a"; ctx.strokeText(q.text, 0, 0);
      ctx.fillStyle = q.color; ctx.fillText(q.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Screen-wide light: warm wind tint and the landing flash.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (warmth > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = warmth * 0.16;
      ctx.drawImage(sp.warm, -W * 0.25, -H * 0.4, W * 1.5, H * 1.8);
      ctx.globalCompositeOperation = "source-over";
    }
    if (flash > 0) {
      ctx.globalAlpha = flash * flash * 0.85;
      ctx.fillStyle = "#fff4d0";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlakes(front: boolean) {
    for (const f of flakes) {
      if (front !== f.z >= 0.6) continue;
      const s = 4 + 10 * f.z;
      ctx.globalAlpha = 0.35 + 0.55 * f.z;
      ctx.drawImage(sp.snow, f.x - s / 2, f.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawWind(o: Wind) {
    const sx = o.wx - dist;
    if (sx > W || sx + o.w < 0) return;
    const hgt = o.y1 - o.y0;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#9fc4ff";
    ctx.fillRect(sx, o.y0, o.w, hgt);
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(215,232,255,0.42)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = sx + 40 + ((i * 61) % (o.w - 80));
      const y = o.y0 + ((((o.t * 520 * o.dir + i * 137) % hgt) + hgt) % hgt);
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 22, y - o.dir * 50, x + 8, y - o.dir * 110);
    }
    ctx.stroke();
    // Curly arrowheads say which way the gust pushes.
    ctx.strokeStyle = "rgba(235,244,255,0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = sx + o.w * (0.25 + i * 0.25);
      const y = o.y0 + hgt * 0.5 + Math.sin(o.t * 3 + i) * 30 + o.dir * 40;
      ctx.moveTo(x - 22, y - o.dir * 22); ctx.lineTo(x, y); ctx.lineTo(x + 22, y - o.dir * 22);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawBeacon(x: number, y: number) {
    const appear = Math.min(1, placedT / 0.8);
    ctx.globalAlpha = 0.75 * appear;
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.9 + i * Math.PI);
      ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(t * 0.9 + i * Math.PI)));
      ctx.drawImage(sp.beam, 0, -160);
      ctx.restore();
    }
    ctx.globalAlpha = appear;
    const g = 520 + Math.sin(t * 3) * 40;
    ctx.drawImage(sp.glow, x - g / 2, y - g / 2, g, g);
    ctx.globalAlpha = 1;
  }

  function drawJingleAndStar() {
    const blink = phase === "play" && invul > 0 && Math.floor(t * 14) % 2 === 0;
    const alpha = blink ? 0.35 : 1;
    let rot = tilt;
    if (tumble >= 0) rot += easeOutCubic(Math.min(1, tumble / 0.75)) * Math.PI * 2;
    const sy = 1 + clamp(sq, -0.35, 0.35) * 0.6;
    const sx = 1 - clamp(sq, -0.35, 0.35) * 0.4;
    const frame = phase === "tutorial" ? Math.floor(t * 5) % 2 : flapT < 0.12 ? 1 : 0;
    const st = starPos();
    const gf = glowFrac();
    const placed = phase === "landed";

    // The star's light falls on Jingle.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.22 + 0.2 * gf;
    ctx.drawImage(sp.glow, jx - 150, jy - 150, 300, 300);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Star: in the cup once placed, otherwise swinging from the beak.
    let starX = st.x, starY = st.y, starScale = 1 + 0.3 * glowPulse;
    if (placed) {
      starX = PEAK_WX - dist; starY = PEAK_TOP - 34;
      starScale = lerp(1, 1.9, easeOutBack(Math.min(1, placedT / 0.7))) + Math.sin(t * 3) * 0.05;
    } else {
      ctx.strokeStyle = "#c8963e"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(st.bx, st.by); ctx.lineTo(st.x, st.y - 22); ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    const halo = (110 + 170 * gf) * starScale * (placed ? 1.6 : 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.glow, starX - halo / 2, starY - halo / 2, halo, halo);
    ctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.translate(starX, starY);
    ctx.rotate(placed ? Math.sin(t * 1.5) * 0.06 : starAng * 0.6 + Math.sin(t * 2) * 0.12);
    const ss = 72 * starScale;
    ctx.drawImage(sp.star, -ss / 2, -ss / 2, ss, ss);
    ctx.restore();

    // Jingle himself, mirrored to face right.
    const img = bird[frame].ok ? bird[frame].img : bird[0].ok ? bird[0].img : null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(jx, jy);
    ctx.rotate(rot);
    ctx.scale(-sx, sy);
    if (img) ctx.drawImage(img, -BODY_PX.x * K, -BODY_PX.y * K, SPRITE, SPRITE);
    else drawFallbackBird(frame);
    ctx.restore();

    // The warm-wind shield.
    if (shieldLeft > 0 && phase === "play") {
      const on = shieldLeft > 1 || Math.floor(t * 10) % 2 === 0;
      if (on) {
        const s = 250 * (1 + Math.sin(t * 8) * 0.04);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sp.ring, jx - s / 2, jy - s / 2, s, s);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Drawn robin, facing left (the caller mirrors it), in case the sprites fail to load. */
  function drawFallbackBird(frame: number) {
    ctx.fillStyle = "#c8963e";
    ctx.beginPath(); ctx.ellipse(10, 10, 62, 52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e0654a";
    ctx.beginPath(); ctx.ellipse(-28, 22, 30, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#b07d2e";
    ctx.beginPath(); ctx.ellipse(-30, -32, 34, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d8a24a";
    ctx.beginPath(); ctx.moveTo(-60, -28); ctx.lineTo(-84, -20); ctx.lineTo(-60, -16); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(-42, -38, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e7b964";
    ctx.beginPath(); ctx.ellipse(28, frame ? 26 : -24, 40, 16, frame ? 0.5 : -0.6, 0, Math.PI * 2); ctx.fill();
  }

  // ---- HUD (DOM, written only when it changes) ----
  let hudP = -1, hudG = -1, bubbleBelow = false;
  function hud() {
    const r = cfg.refs;
    const p = phase === "landed" ? 1 : Math.min(1, dist / TOTAL);
    if (Math.abs(p - hudP) > 0.0006) {
      hudP = p;
      if (r.fill.current) r.fill.current.style.transform = `scaleX(${p})`;
      if (r.marker.current) r.marker.current.style.transform = `translateX(${Math.round(p * RAIL_W)}px)`;
    }
    if (glow !== hudG) {
      hudG = glow;
      if (r.glowFill.current) r.glowFill.current.style.clipPath = `inset(${((1 - glowFrac()) * 100).toFixed(1)}% 0 0 0)`;
      if (r.glowCount.current) r.glowCount.current.textContent = String(glow);
      const host = r.glowFill.current?.parentElement?.parentElement;
      if (host && glow > 0) { host.classList.remove("bump"); void host.offsetWidth; host.classList.add("bump"); }
    }
    const b = r.bubble.current;
    if (b) {
      const below = jy < 340;
      if (below !== bubbleBelow) { bubbleBelow = below; b.classList.toggle("below", below); }
      b.style.transform = `translate(${Math.round(jx)}px, ${Math.round(jy)}px)`;
    }
  }

  // ---- loop and input ----
  let raf = 0, last = performance.now();
  const frameFn = (now: number) => {
    let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.08; }
    t += dt;
    update(dt);
    render();
    hud();
    raf = requestAnimationFrame(frameFn);
  };
  raf = requestAnimationFrame(frameFn);

  let lastKey = 0;
  const onKey = (e: KeyboardEvent) => {
    if (!(FLAP_KEYS.has(e.key) || FLAP_CODES.has(e.keyCode))) return;
    e.preventDefault();
    if (e.repeat) return;
    const now = performance.now();
    if (now - lastKey < FLAP_DEDUPE_MS) return;
    lastKey = now;
    flap();
  };
  const onPointer = () => flap();
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);

  const reporter = setInterval(() => {
    if (phase !== "play" && phase !== "landing") return;
    const p = Math.min(0.99, dist / TOTAL);
    if (p > sentP + 0.004) report(p);
  }, REPORT_MS);

  return {
    boost,
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(reporter);
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointer);
    },
  };
}

// ---------------- the component ----------------
const STAR_D = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 20 : 46;
    pts.push(`${(50 + Math.cos(a) * rr).toFixed(1)} ${(53 + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
})();

function StarIcon() {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><path d={STAR_D} /></svg>;
}

function RoofIcon() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path className="fl-roof-glow" d="M60 4 L66 18 L80 20 L69 29 L72 43 L60 36 L48 43 L51 29 L40 20 L54 18 Z" />
      <line x1="60" y1="40" x2="60" y2="56" stroke="#c8963e" strokeWidth="5" />
      <path d="M10 112 L60 56 L110 112 Z" fill="#6b3a2a" stroke="#f4f8ff" strokeWidth="9" strokeLinejoin="round" />
      <circle cx="60" cy="92" r="11" fill="#ffd98a" stroke="#c8963e" strokeWidth="3" />
    </svg>
  );
}

function RemoteIcon() {
  return (
    <svg className="fl-remote" viewBox="0 0 120 210" aria-hidden="true">
      <rect x="12" y="4" width="96" height="200" rx="48" fill="#1b2a40" stroke="#c8963e" strokeWidth="4" />
      <circle cx="60" cy="74" r="38" fill="#0d1b2a" stroke="#c8963e88" strokeWidth="3" />
      <circle className="fl-ok-btn" cx="60" cy="74" r="19" />
      <circle cx="40" cy="140" r="8" fill="#2b3d5a" />
      <circle cx="80" cy="140" r="8" fill="#2b3d5a" />
      <circle cx="60" cy="166" r="8" fill="#2b3d5a" />
    </svg>
  );
}

function PhoneShakeIcon() {
  return (
    <svg className="fl-phone" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="15" y="6" width="18" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M8 16 Q4 24 8 32 M40 16 Q44 24 40 32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Flight({ state, bubble }: { state: PublicState; bubble: { line: string; at: number } | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const glowFill = useRef<HTMLDivElement>(null);
  const glowCount = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const codeRef = useRef(state.code);
  codeRef.current = state.code;
  const lastBoost = useRef(state.flight.boost?.at ?? 0);
  const [phase, setPhase] = useState<Phase>(state.flight.done ? "landed" : "tutorial");
  const [toast, setToast] = useState<{ name: string; color: string; at: number } | null>(null);
  const [bubbleOn, setBubbleOn] = useState(false);

  useEffect(() => {
    const e = createFlight(canvasRef.current!, {
      code: () => codeRef.current,
      progress: state.flight.progress,
      done: state.flight.done,
      onPhase: setPhase,
      refs: { fill, marker, glowFill, glowCount, bubble: bubbleRef },
    });
    engine.current = e;
    return () => { e.destroy(); engine.current = null; };
    // The engine owns the game; it is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new boost timestamp means a phone just shook loose a warm wind.
  const boostAt = state.flight.boost?.at ?? 0;
  useEffect(() => {
    const b = state.flight.boost;
    if (!b || b.at === lastBoost.current) return;
    lastBoost.current = b.at;
    const p = state.players.find((pl) => pl.id === b.playerId);
    engine.current?.boost();
    setToast({ name: p?.name ?? "the family", color: p?.color ?? "#ffd36b", at: b.at });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boostAt]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!bubble?.line) { setBubbleOn(false); return; }
    const left = 12000 - (Date.now() - bubble.at);
    if (left <= 0) { setBubbleOn(false); return; }
    setBubbleOn(true);
    const id = setTimeout(() => setBubbleOn(false), left);
    return () => clearTimeout(id);
  }, [bubble?.at, bubble?.line]);

  return (
    <div className={`fl-root is-${phase}`}>
      <canvas ref={canvasRef} className="fl-canvas" width={W} height={H} />

      <div ref={bubbleRef} className="fl-bubble-anchor">
        {bubbleOn && bubble && <div className="fl-bubble" key={bubble.at}>{bubble.line}</div>}
      </div>

      <div className="fl-glow" aria-label="Star glow">
        <div className="fl-glow-star">
          <div className="fl-glow-dim"><StarIcon /></div>
          <div className="fl-glow-fill" ref={glowFill}><StarIcon /></div>
        </div>
        <div className="fl-glow-text">
          <span>Star glow</span>
          <strong ref={glowCount}>0</strong>
        </div>
      </div>

      <div className="fl-progress" aria-label="Distance to the roof">
        <span className="fl-progress-label">To the roof</span>
        <div className="fl-rail">
          <div className="fl-fill" ref={fill} />
          <div className="fl-marker-track">
            <div className="fl-marker" ref={marker}><img src={flySprite(0)} alt="" /></div>
          </div>
        </div>
        <div className={`fl-roof ${phase === "landed" ? "lit" : ""}`}><RoofIcon /></div>
      </div>

      {phase === "tutorial" && (
        <div className="fl-tutorial">
          <RemoteIcon />
          <div>
            <h2>Press OK to flap!</h2>
            <p>Dodge the smoke, the snowballs and the icicles.</p>
            <p>Catch sparkles to make the star glow.</p>
            <p className="fl-tip"><PhoneShakeIcon /> Shake your phones for a warm wind!</p>
          </div>
        </div>
      )}

      {phase === "landed" && (
        <div className="fl-landed">
          <strong>The star is on the roof!</strong>
          <span>Shine bright, little lighthouse. Grandpa, follow the light!</span>
        </div>
      )}

      {toast && (
        <div className="fl-toast" key={toast.at}>
          <i style={{ background: toast.color }} />
          Warm wind from {toast.name}!
        </div>
      )}
    </div>
  );
}
