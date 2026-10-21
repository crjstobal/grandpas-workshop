// The snow globe balance game, on the phone whose turn it is. The player holds the phone flat and
// tilts it to keep the heart gear inside the golden circle while the snow swirls and a gentle drift
// pushes it around. Hold it there for HOLD_S seconds in total (within ATTEMPT_S) to fill the ring.
//
// This file also exports the canvas painter for the globe (glass, snow, gear, golden circle) so the
// TV draws exactly the same object, bigger.
import { useEffect, useRef, useState } from "react";
import type { Player, PublicState } from "../../../shared/types";
import { api } from "../api";
import { sfx, unlockAudio } from "../sfx";
import "./BalanceGlobe.css";

/* ------------------------------------------------------------------------------------------------
 * Tuning. Units: the gear lives in a unit disk (-1..1 on both axes, y grows downwards), and forces
 * are in units per second squared. Tuned with a Monte Carlo of the physics: with no input the ring
 * fills about 5% of the time, a sloppy player (slow reactions, tremor) about 99%, so a 6 year old
 * gets it in one or two tries but a phone left on the table does not.
 * ---------------------------------------------------------------------------------------------- */

/** Radius of the golden circle, in gear units: the gear counts as inside when its centre is within. */
export const GLOBE_TARGET = 0.36;
const ATTEMPT_S = 20;
const HOLD_S = 4;
/** Ring progress lost per second while the gear is outside the circle ("drains a bit"). */
const DRAIN_PER_S = 0.05;
/** Tilt that counts as a full push: sin(20 degrees). Small tilts move the gear slowly. */
const TILT_FULL = 0.34;
/** Ignore hand tremor below about 1.7 degrees. */
const TILT_DEADZONE = 0.03;
const TILT_ACCEL = 2.4;
/** Viscous damping, like a gear floating in the globe's water. */
const DAMPING = 2.6;
/** The slow wandering current, growing over the attempt. */
const DRIFT_START = 1.2;
const DRIFT_END = 1.7;
/** Short swirls of snow every few seconds that nudge the gear in a random direction. */
const GUST = 1.4;
const GUST_S = 0.9;
/** A very gentle pull to the middle while inside, so a steady hand feels rewarded. */
const ASSIST = 0.2;
const SEND_MS = 125;

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ------------------------------------------------------------------------------------------------
 * The globe painter, shared with the TV.
 * ---------------------------------------------------------------------------------------------- */

export interface GlobeArt {
  /** Glass radius, logical px. */
  r: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Radius of the gear's playing disk, logical px. */
  rp: number;
  /** Gear radius, logical px. */
  gr: number;
  scale: number;
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  gear: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  flake: HTMLCanvasElement;
}

function layer(w: number, h: number, scale: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  return [c, g];
}

function brass(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const b = g.createLinearGradient(x0, y0, x1, y1);
  b.addColorStop(0, "#fff0c2");
  b.addColorStop(0.28, "#e0b25a");
  b.addColorStop(0.55, "#c8963e");
  b.addColorStop(0.8, "#8a6224");
  b.addColorStop(1, "#5a3c14");
  return b;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.1, y + s * 0.25, x - s * 0.55, y + s * 0.02, x - s * 0.5, y - s * 0.22);
  g.bezierCurveTo(x - s * 0.45, y - s * 0.48, x - s * 0.1, y - s * 0.5, x, y - s * 0.24);
  g.bezierCurveTo(x + s * 0.1, y - s * 0.5, x + s * 0.45, y - s * 0.48, x + s * 0.5, y - s * 0.22);
  g.bezierCurveTo(x + s * 0.55, y + s * 0.02, x + s * 0.1, y + s * 0.25, x, y + s * 0.35);
  g.closePath();
}

function pine(g: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const ty = y - h * (0.18 + i * 0.27);
    const tw = h * (0.42 - i * 0.1);
    g.fillStyle = i % 2 ? "#24493d" : "#2e5e4e";
    g.beginPath();
    g.moveTo(x, ty - h * 0.36);
    g.lineTo(x + tw, ty + h * 0.06);
    g.lineTo(x - tw, ty + h * 0.06);
    g.closePath();
    g.fill();
    // a little snow on each tier
    g.fillStyle = "#eef3fa";
    g.beginPath();
    g.moveTo(x, ty - h * 0.36);
    g.lineTo(x + tw * 0.35, ty - h * 0.2);
    g.quadraticCurveTo(x, ty - h * 0.14, x - tw * 0.35, ty - h * 0.2);
    g.closePath();
    g.fill();
  }
}

/** Builds the static layers once (glass, miniature, base, gear sprite). Repaint cost per frame is tiny. */
export function makeGlobeArt(r: number, scale: number): GlobeArt {
  const pad = r * 0.14;
  const w = r * 2 + pad * 2;
  const h = w + r * 0.46;
  const cx = w / 2;
  const cy = pad + r;
  const rp = r * 0.7;
  const gr = r * 0.16;

  /* back: table shadow, lamp halo, glass interior, miniature workshop scene */
  const [back, b] = layer(w, h, scale);
  b.save();
  b.translate(cx, cy + r * 1.36);
  b.scale(1, 0.16);
  const sh = b.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
  sh.addColorStop(0, "rgba(0,0,0,0.6)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  b.fillStyle = sh;
  b.beginPath(); b.arc(0, 0, r * 1.15, 0, TAU); b.fill();
  b.restore();

  const halo = b.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.14);
  halo.addColorStop(0, "rgba(255,206,130,0.16)");
  halo.addColorStop(1, "rgba(255,206,130,0)");
  b.fillStyle = halo;
  b.beginPath(); b.arc(cx, cy, r * 1.14, 0, TAU); b.fill();

  b.save();
  b.beginPath(); b.arc(cx, cy, r, 0, TAU); b.clip();
  const water = b.createRadialGradient(cx, cy - r * 0.25, r * 0.05, cx, cy, r);
  water.addColorStop(0, "#35567f");
  water.addColorStop(0.55, "#182c47");
  water.addColorStop(1, "#08111e");
  b.fillStyle = water;
  b.fillRect(cx - r, cy - r, r * 2, r * 2);
  const warm = b.createRadialGradient(cx - r * 0.45, cy + r * 0.55, 0, cx - r * 0.45, cy + r * 0.55, r * 0.9);
  warm.addColorStop(0, "rgba(255,186,104,0.22)");
  warm.addColorStop(1, "rgba(255,186,104,0)");
  b.fillStyle = warm;
  b.fillRect(cx - r, cy - r, r * 2, r * 2);

  // the cottage, its lit window and two pines, half buried in the snow bank
  const hx = cx - r * 0.42, hy = cy + r * 0.62, hw = r * 0.22, hh = r * 0.15;
  b.fillStyle = "#7a4c2a";
  b.fillRect(hx - hw / 2, hy - hh, hw, hh);
  b.fillStyle = "#5c3820";
  b.fillRect(hx - hw / 2, hy - hh * 0.25, hw, hh * 0.25);
  b.fillStyle = "#f4f7fb";
  b.beginPath();
  b.moveTo(hx - hw * 0.66, hy - hh * 0.92);
  b.lineTo(hx, hy - hh * 1.9);
  b.lineTo(hx + hw * 0.66, hy - hh * 0.92);
  b.closePath();
  b.fill();
  const win = b.createRadialGradient(hx + hw * 0.15, hy - hh * 0.55, 0, hx + hw * 0.15, hy - hh * 0.55, r * 0.12);
  win.addColorStop(0, "rgba(255,214,120,0.7)");
  win.addColorStop(1, "rgba(255,214,120,0)");
  b.fillStyle = win;
  b.fillRect(hx - r * 0.12, hy - hh - r * 0.1, r * 0.4, r * 0.3);
  b.fillStyle = "#ffd36b";
  b.fillRect(hx + hw * 0.05, hy - hh * 0.72, hw * 0.22, hh * 0.32);
  pine(b, cx + r * 0.32, cy + r * 0.64, r * 0.3);
  pine(b, cx + r * 0.5, cy + r * 0.64, r * 0.2);

  const bank = b.createLinearGradient(0, cy + r * 0.5, 0, cy + r);
  bank.addColorStop(0, "#f6f9fd");
  bank.addColorStop(1, "#aebfd6");
  b.fillStyle = bank;
  b.beginPath();
  b.moveTo(cx - r, cy + r * 0.64);
  b.bezierCurveTo(cx - r * 0.55, cy + r * 0.52, cx - r * 0.15, cy + r * 0.68, cx + r * 0.15, cy + r * 0.61);
  b.bezierCurveTo(cx + r * 0.45, cy + r * 0.55, cx + r * 0.75, cy + r * 0.63, cx + r, cy + r * 0.58);
  b.lineTo(cx + r, cy + r);
  b.lineTo(cx - r, cy + r);
  b.closePath();
  b.fill();
  b.restore();

  /* front: glass shading and highlights, then the brass collar and wooden base over the glass foot */
  const [front, f] = layer(w, h, scale);
  f.save();
  f.beginPath(); f.arc(cx, cy, r, 0, TAU); f.clip();
  const edge = f.createRadialGradient(cx - r * 0.1, cy - r * 0.15, r * 0.55, cx, cy, r);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(0.82, "rgba(4,10,20,0.18)");
  edge.addColorStop(1, "rgba(4,10,20,0.55)");
  f.fillStyle = edge;
  f.fillRect(cx - r, cy - r, r * 2, r * 2);
  const fres = f.createRadialGradient(cx, cy, r * 0.86, cx, cy, r);
  fres.addColorStop(0, "rgba(190,220,255,0)");
  fres.addColorStop(1, "rgba(190,220,255,0.28)");
  f.fillStyle = fres;
  f.fillRect(cx - r, cy - r, r * 2, r * 2);
  f.save();
  f.translate(cx - r * 0.4, cy - r * 0.46);
  f.rotate(-0.62);
  f.scale(1, 0.48);
  const spec = f.createRadialGradient(0, 0, 0, 0, 0, r * 0.34);
  spec.addColorStop(0, "rgba(255,255,255,0.62)");
  spec.addColorStop(0.5, "rgba(255,255,255,0.18)");
  spec.addColorStop(1, "rgba(255,255,255,0)");
  f.fillStyle = spec;
  f.beginPath(); f.arc(0, 0, r * 0.34, 0, TAU); f.fill();
  f.restore();
  f.fillStyle = "rgba(255,255,255,0.5)";
  f.beginPath(); f.arc(cx - r * 0.18, cy - r * 0.7, r * 0.03, 0, TAU); f.fill();
  f.strokeStyle = "rgba(255,255,255,0.22)";
  f.lineWidth = r * 0.025;
  f.lineCap = "round";
  f.beginPath(); f.arc(cx, cy, r * 0.9, -0.15, 0.55); f.stroke();
  f.strokeStyle = "rgba(255,226,160,0.14)";
  f.lineWidth = r * 0.05;
  f.beginPath(); f.arc(cx, cy, r * 0.86, 2.1, 2.7); f.stroke();
  f.restore();
  f.strokeStyle = "rgba(255,255,255,0.38)";
  f.lineWidth = Math.max(1, r * 0.012);
  f.beginPath(); f.arc(cx, cy, r, 0, TAU); f.stroke();

  const t0 = cy + r * 0.9, t1 = cy + r * 1.27;
  // wooden base
  f.beginPath();
  f.moveTo(cx - r * 0.7, t0);
  f.lineTo(cx + r * 0.7, t0);
  f.quadraticCurveTo(cx + r * 0.8, t1 - r * 0.12, cx + r * 0.84, t1);
  f.lineTo(cx - r * 0.84, t1);
  f.quadraticCurveTo(cx - r * 0.8, t1 - r * 0.12, cx - r * 0.7, t0);
  f.closePath();
  const wood = f.createLinearGradient(cx - r * 0.84, 0, cx + r * 0.84, 0);
  wood.addColorStop(0, "#2a170b");
  wood.addColorStop(0.22, "#6b4224");
  wood.addColorStop(0.45, "#8f5d35");
  wood.addColorStop(0.7, "#5e3a1f");
  wood.addColorStop(1, "#22130a");
  f.fillStyle = wood;
  f.fill();
  f.save();
  f.clip();
  const woodShade = f.createLinearGradient(0, t0, 0, t1);
  woodShade.addColorStop(0, "rgba(255,220,170,0.18)");
  woodShade.addColorStop(1, "rgba(0,0,0,0.4)");
  f.fillStyle = woodShade;
  f.fillRect(cx - r, t0, r * 2, t1 - t0);
  f.strokeStyle = "rgba(30,14,4,0.35)";
  f.lineWidth = Math.max(1, r * 0.006);
  for (let i = 0; i < 7; i++) {
    const y = t0 + (t1 - t0) * (0.15 + i * 0.12);
    f.beginPath();
    f.moveTo(cx - r * 0.9, y);
    f.bezierCurveTo(cx - r * 0.3, y + r * 0.02 * Math.sin(i * 1.7), cx + r * 0.2, y - r * 0.02 * Math.cos(i), cx + r * 0.9, y + r * 0.01);
    f.stroke();
  }
  f.restore();
  // brass foot band
  f.fillStyle = brass(f, 0, t1 - r * 0.01, 0, t1 + r * 0.07);
  roundRect(f, cx - r * 0.88, t1 - r * 0.01, r * 1.76, r * 0.07, r * 0.02);
  f.fill();
  // brass collar where the glass sits
  f.fillStyle = brass(f, 0, cy + r * 0.78, 0, cy + r * 0.93);
  roundRect(f, cx - r * 0.68, cy + r * 0.78, r * 1.36, r * 0.14, r * 0.04);
  f.fill();
  f.strokeStyle = "rgba(255,244,210,0.7)";
  f.lineWidth = Math.max(1, r * 0.008);
  f.beginPath(); f.moveTo(cx - r * 0.62, cy + r * 0.8); f.lineTo(cx + r * 0.62, cy + r * 0.8); f.stroke();
  // the plaque, with a little engraved heart
  const py = cy + r * 1.03;
  f.fillStyle = brass(f, 0, py, 0, py + r * 0.13);
  roundRect(f, cx - r * 0.24, py, r * 0.48, r * 0.13, r * 0.025);
  f.fill();
  f.strokeStyle = "rgba(60,36,10,0.6)";
  f.lineWidth = Math.max(1, r * 0.006);
  roundRect(f, cx - r * 0.215, py + r * 0.018, r * 0.43, r * 0.094, r * 0.018);
  f.stroke();
  f.fillStyle = "#4a2c10";
  for (const sx of [-0.19, 0.19]) { f.beginPath(); f.arc(cx + r * sx, py + r * 0.065, r * 0.011, 0, TAU); f.fill(); }
  f.fillStyle = "#8a3024";
  heart(f, cx, py + r * 0.068, r * 0.075);
  f.fill();

  /* gear sprite: twelve teeth, five windows, a red enamel heart in the hub */
  const gs = gr * 2.3;
  const [gear, gg] = layer(gs, gs, scale);
  const gc = gs / 2;
  const n = 12, step = TAU / n, ro = gr, rr = gr * 0.8;
  gg.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const pts: [number, number][] = [[a - step * 0.3, rr], [a - step * 0.17, ro], [a + step * 0.17, ro], [a + step * 0.3, rr]];
    pts.forEach(([ang, rad], k) => {
      const x = gc + Math.cos(ang) * rad, y = gc + Math.sin(ang) * rad;
      if (i === 0 && k === 0) gg.moveTo(x, y); else gg.lineTo(x, y);
    });
    gg.arc(gc, gc, rr, a + step * 0.3, a + step * 0.7);
  }
  gg.closePath();
  gg.fillStyle = brass(gg, gc - gr, gc - gr, gc + gr, gc + gr);
  gg.fill();
  gg.strokeStyle = "#4e320f";
  gg.lineWidth = gr * 0.045;
  gg.stroke();
  gg.strokeStyle = "rgba(255,240,200,0.55)";
  gg.lineWidth = gr * 0.05;
  gg.beginPath(); gg.arc(gc, gc, gr * 0.7, 0, TAU); gg.stroke();
  gg.strokeStyle = "rgba(70,44,12,0.55)";
  gg.lineWidth = gr * 0.03;
  gg.beginPath(); gg.arc(gc, gc, gr * 0.64, 0, TAU); gg.stroke();
  // windows between the spokes
  gg.save();
  gg.globalCompositeOperation = "destination-out";
  const spokes = 5, sw = 0.36;
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * TAU + sw, a1 = ((i + 1) / spokes) * TAU - sw * 0.2;
    gg.beginPath();
    gg.arc(gc, gc, gr * 0.58, a0, a1);
    gg.arc(gc, gc, gr * 0.34, a1, a0, true);
    gg.closePath();
    gg.fill();
  }
  gg.restore();
  // window rims
  gg.strokeStyle = "rgba(70,44,12,0.7)";
  gg.lineWidth = gr * 0.025;
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * TAU + sw, a1 = ((i + 1) / spokes) * TAU - sw * 0.2;
    gg.beginPath();
    gg.arc(gc, gc, gr * 0.58, a0, a1);
    gg.arc(gc, gc, gr * 0.34, a1, a0, true);
    gg.closePath();
    gg.stroke();
  }
  gg.fillStyle = brass(gg, gc - gr * 0.3, gc - gr * 0.3, gc + gr * 0.3, gc + gr * 0.3);
  gg.beginPath(); gg.arc(gc, gc, gr * 0.31, 0, TAU); gg.fill();
  gg.strokeStyle = "#4e320f";
  gg.lineWidth = gr * 0.03;
  gg.stroke();
  const enamel = gg.createLinearGradient(gc, gc - gr * 0.2, gc, gc + gr * 0.15);
  enamel.addColorStop(0, "#e2584a");
  enamel.addColorStop(1, "#8e2419");
  gg.fillStyle = enamel;
  heart(gg, gc, gc + gr * 0.02, gr * 0.42);
  gg.fill();
  gg.fillStyle = "rgba(255,255,255,0.55)";
  gg.beginPath(); gg.ellipse(gc - gr * 0.09, gc - gr * 0.07, gr * 0.05, gr * 0.03, -0.6, 0, TAU); gg.fill();

  /* glow and snowflake sprites */
  const gw = gr * 3.4;
  const [glow, gl] = layer(gw * 2, gw * 2, scale);
  const gd = gl.createRadialGradient(gw, gw, 0, gw, gw, gw);
  gd.addColorStop(0, "rgba(255,214,110,0.75)");
  gd.addColorStop(0.35, "rgba(255,190,80,0.28)");
  gd.addColorStop(1, "rgba(255,190,80,0)");
  gl.fillStyle = gd;
  gl.fillRect(0, 0, gw * 2, gw * 2);
  const [flake, fl] = layer(16, 16, scale);
  const fd = fl.createRadialGradient(8, 8, 0, 8, 8, 8);
  fd.addColorStop(0, "rgba(255,255,255,1)");
  fd.addColorStop(0.45, "rgba(255,255,255,0.75)");
  fd.addColorStop(1, "rgba(255,255,255,0)");
  fl.fillStyle = fd;
  fl.fillRect(0, 0, 16, 16);

  return { r, w, h, cx, cy, rp, gr, scale, back, front, gear, glow, flake };
}

interface Flake { x: number; y: number; vx: number; vy: number; s: number; z: number; life: number; tw: number }

/** Snow inside the glass, in glass units (the glass is the unit circle). */
export class Flakes {
  list: Flake[] = [];
  constructor(n: number) {
    for (let i = 0; i < n; i++) this.list.push(this.spawn(true));
  }
  private spawn(anywhere: boolean): Flake {
    const a = Math.random() * TAU;
    const d = Math.sqrt(Math.random()) * 0.88;
    let x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (!anywhere) { x = (Math.random() - 0.5) * 1.4; y = -Math.sqrt(Math.max(0, 0.8 - x * x)) + Math.random() * 0.15; }
    return { x, y, vx: 0, vy: 0, s: 0.55 + Math.random() * 1.1, z: Math.random(), life: anywhere ? 1 : 0, tw: Math.random() * TAU };
  }
  /** swirl: 0 calm .. 1 stormy. stir: the gear, in glass units, pushes the flakes it passes. */
  update(dt: number, t: number, swirl: number, stir?: { x: number; y: number; vx: number; vy: number }) {
    const k = Math.min(1, dt * 1.6);
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const sw = 0.35 + swirl * 1.4;
      let tx = Math.sin(p.y * 3.1 + t * 0.6 + p.z * 4) * 0.09 * sw + Math.sin(t * 0.23) * 0.02;
      let ty = 0.05 + Math.cos(p.x * 2.7 - t * 0.45 + p.z * 3) * 0.06 * sw;
      // a slow vortex around the middle when it swirls
      tx += -p.y * 0.18 * swirl;
      ty += p.x * 0.18 * swirl;
      if (stir) {
        const dx = p.x - stir.x, dy = p.y - stir.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.09) {
          const f = (1 - d2 / 0.09) * 0.9;
          tx += stir.vx * f - dy * f * 0.6;
          ty += stir.vy * f + dx * f * 0.6;
        }
      }
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life = Math.min(1, p.life + dt * 1.2);
      const d = Math.hypot(p.x, p.y);
      if (d > 0.94) { p.x *= 0.94 / d; p.y *= 0.94 / d; p.vx *= -0.3; p.vy *= -0.3; }
      // flakes that settle on the snow bank melt into it and fall again from the top
      if (p.y > 0.6 + Math.sin(p.x * 3) * 0.04) this.list[i] = this.spawn(false);
    }
  }
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; gold: boolean }

/** Golden sparks, in logical canvas px. */
export class Sparks {
  list: Spark[] = [];
  emit(x: number, y: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.35 + Math.random() * 0.65);
      const max = 0.6 + Math.random() * 0.8;
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life: max, max, s: 0.5 + Math.random(), gold: Math.random() < 0.7 });
    }
    if (this.list.length > 400) this.list.splice(0, this.list.length - 400);
  }
  update(dt: number, gravity: number) {
    for (const p of this.list) {
      p.vx *= 1 - dt * 1.8;
      p.vy = p.vy * (1 - dt * 1.8) + gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }
}

export interface GlobeFrame {
  t: number;
  /** Gear position, gear units (-1..1). */
  x: number;
  y: number;
  rot: number;
  /** Ring progress 0..1. */
  hold: number;
  /** 0..1, eased: how much the gear is inside the golden circle (glows when 1). */
  inside: number;
  /** 0..1: how visible the golden circle is. */
  ring: number;
  /** 0..1: the gear floating up out of the glass, freed. */
  lift: number;
  flakes: Flakes;
  sparks: Sparks;
}

function drawFlakes(g: CanvasRenderingContext2D, a: GlobeArt, f: GlobeFrame, front: boolean) {
  const base = a.r * 0.016;
  for (const p of f.flakes.list) {
    if (p.z > 0.5 !== front) continue;
    const sz = base * p.s * (front ? 1.25 : 0.85);
    g.globalAlpha = p.life * (front ? 0.95 : 0.6) * (0.75 + 0.25 * Math.sin(f.t * 3 + p.tw));
    g.drawImage(a.flake, a.cx + p.x * a.r - sz, a.cy + p.y * a.r - sz, sz * 2, sz * 2);
  }
  g.globalAlpha = 1;
}

function drawGear(g: CanvasRenderingContext2D, a: GlobeArt, x: number, y: number, rot: number, scale: number, glow: number) {
  if (glow > 0.01) {
    const gw = a.gr * 3.4 * scale;
    g.globalAlpha = Math.min(1, glow);
    g.drawImage(a.glow, x - gw, y - gw, gw * 2, gw * 2);
    g.globalAlpha = 1;
  }
  const gs = a.gr * 2.3 * scale;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.drawImage(a.gear, -gs / 2, -gs / 2, gs, gs);
  g.restore();
}

/** Paints one frame. The context must already be scaled to logical px. */
export function paintGlobe(g: CanvasRenderingContext2D, a: GlobeArt, f: GlobeFrame) {
  const { cx, cy, r, rp } = a;
  g.clearRect(0, 0, a.w, a.h);
  g.drawImage(a.back, 0, 0, a.w, a.h);
  g.save();
  g.beginPath(); g.arc(cx, cy, r * 0.985, 0, TAU); g.clip();

  // the golden circle and its ring of progress
  if (f.ring > 0.01) {
    const rr = (GLOBE_TARGET + 0.1) * rp;
    if (f.inside > 0.01) {
      const fill = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      fill.addColorStop(0, `rgba(255,211,107,${0.2 * f.inside * f.ring})`);
      fill.addColorStop(1, "rgba(255,211,107,0)");
      g.fillStyle = fill;
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,211,107,${0.16 * f.inside * f.ring})`;
      g.lineWidth = r * 0.07;
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
    }
    g.strokeStyle = `rgba(255,226,160,${0.16 * f.ring})`;
    g.lineWidth = r * 0.032;
    g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
    g.setLineDash([r * 0.045, r * 0.032]);
    g.lineDashOffset = -f.t * r * 0.06;
    g.strokeStyle = `rgba(255,211,107,${(0.55 + 0.45 * f.inside) * f.ring})`;
    g.lineWidth = Math.max(1.5, r * 0.011);
    g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
    g.setLineDash([]);
    if (f.hold > 0.002) {
      const a1 = -Math.PI / 2 + f.hold * TAU;
      g.strokeStyle = `rgba(255,190,80,${0.35 * f.ring})`;
      g.lineWidth = r * 0.06;
      g.lineCap = "round";
      g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, a1); g.stroke();
      g.strokeStyle = `rgba(255,226,140,${f.ring})`;
      g.lineWidth = r * 0.03;
      g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, a1); g.stroke();
      g.fillStyle = `rgba(255,255,255,${f.ring})`;
      g.beginPath(); g.arc(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, r * 0.018, 0, TAU); g.fill();
    }
  }

  drawFlakes(g, a, f, false);
  const gx = cx + f.x * rp, gy = cy + f.y * rp;
  if (f.lift <= 0) drawGear(g, a, gx, gy, f.rot, 1, 0.22 + 0.7 * f.inside);
  drawFlakes(g, a, f, true);
  g.restore();
  g.drawImage(a.front, 0, 0, a.w, a.h);

  // freed: the gear floats up through the glass, bigger and glowing
  if (f.lift > 0) {
    const e = 1 - Math.pow(1 - Math.min(1, f.lift), 3);
    const lx = lerp(gx, cx, e), ly = lerp(gy, cy - r * 0.55, e);
    drawGear(g, a, lx, ly + Math.sin(f.t * 2) * r * 0.02 * e, f.rot, 1 + 0.45 * e, 0.9 + 0.5 * e);
  }

  if (f.sparks.list.length) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of f.sparks.list) {
      const k = p.life / p.max;
      const s = a.r * 0.03 * p.s * (0.4 + k);
      g.globalAlpha = Math.min(1, k * 1.5);
      g.drawImage(a.glow, p.x - s * 2, p.y - s * 2, s * 4, s * 4);
      g.fillStyle = p.gold ? "#fff1c4" : "#ffffff";
      g.beginPath(); g.arc(p.x, p.y, s * 0.28, 0, TAU); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------------------------------------
 * The phone game.
 * ---------------------------------------------------------------------------------------------- */

type Phase = "intro" | "countdown" | "play" | "result";
type Vec3 = [number, number, number];
type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

interface Sim {
  x: number; y: number; vx: number; vy: number; rot: number;
  hold: number; t: number; inside: boolean; insideE: number;
  tiltX: number; tiltY: number;
  gustLeft: number; gustDir: number; nextGust: number;
  phases: [number, number, number, number];
  milestone: number;
  lift: number;
}

const freshSim = (): Sim => ({
  x: 0, y: 0, vx: 0, vy: 0, rot: 0, hold: 0, t: 0, inside: true, insideE: 1, tiltX: 0, tiltY: 0,
  gustLeft: 0, gustDir: 0, nextGust: 2.5 + Math.random(),
  phases: [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, Math.random() * TAU],
  milestone: 0, lift: 0,
});

function screenAngle() {
  const so = (screen as Screen & { orientation?: { angle?: number } }).orientation?.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return ((so ?? legacy ?? 0) % 360 + 360) % 360;
}

export function BalanceGlobe({ state, code, player }: { state: PublicState; code: string; player: Player }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [touchMode, setTouchMode] = useState(false);
  const [inside, setInside] = useState(true);
  const [ok, setOk] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);

  const phaseRef = useRef<Phase>("intro");
  const sim = useRef<Sim>(freshSim());
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const props = useRef({ code, player });
  props.current = { code, player };

  // Sensor: the "up" vector in device coordinates, and the one captured at the start.
  const sensor = useRef<{ u: Vec3 | null; base: Vec3 | null; seen: boolean }>({ u: null, base: null, seen: false });
  // Touch and keyboard fallback: a virtual tilt, -1..1.
  const virt = useRef({ x: 0, y: 0, drag: null as null | { x: number; y: number } , keys: new Set<string>() });
  const timeouts = useRef<number[]>([]);
  const finished = useRef(false);
  /** state.globe.last.at when the attempt started, to spot the server's answer to it. */
  const lastAtStart = useRef<number | null>(null);
  const turnN = useRef(state.turn?.n ?? 0);

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // The result must reach the TV, or the story waits forever: retry through network drops, and
  // offer a button if the TV still hasn't confirmed. The server ignores repeats of the same turn.
  const [stuck, setStuck] = useState(false);
  const sendResult = async (success: boolean) => {
    const { code: c, player: p } = props.current;
    for (let i = 0; i < 4; i++) {
      try { await api.globeResult(c, p.id, success, turnN.current); return; }
      catch { await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
    }
    setStuck(true);
  };

  // Canvas, art and the render and physics loop. Runs for the whole life of the component.
  useEffect(() => {
    const canvas = canvasRef.current!, stage = stageRef.current!;
    const g = canvas.getContext("2d")!;
    const flakes = new Flakes(150);
    const sparks = new Sparks();
    let art: GlobeArt | null = null;
    let raf = 0, last = performance.now(), alive = true, wallT = 0;
    let disp = { x: 0, y: 0.3 };

    const fit = () => {
      const w = Math.min(stage.clientWidth, 440);
      const r = w / 2.28;
      const scale = Math.min(3, window.devicePixelRatio || 1);
      art = makeGlobeArt(r, scale);
      canvas.width = Math.ceil(art.w * scale);
      canvas.height = Math.ceil(art.h * scale);
      canvas.style.width = `${art.w}px`;
      canvas.style.height = `${art.h}px`;
      g.setTransform(scale, 0, 0, scale, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(() => { if (art && Math.abs(Math.min(stage.clientWidth, 440) - art.w) > 2) fit(); });
    ro.observe(stage);

    const readTilt = (): [number, number] => {
      const v = virt.current;
      let kx = 0, ky = 0;
      if (v.keys.has("ArrowLeft")) kx -= 0.8;
      if (v.keys.has("ArrowRight")) kx += 0.8;
      if (v.keys.has("ArrowUp")) ky -= 0.8;
      if (v.keys.has("ArrowDown")) ky += 0.8;
      if (kx || ky || v.drag) return [kx + v.x, ky + v.y];
      const s = sensor.current;
      if (!s.u || !s.base) return [0, 0];
      // Downhill direction on the screen, relative to how the phone was held at the start.
      let dx = -(s.u[0] - s.base[0]), dy = s.u[1] - s.base[1];
      const ang = screenAngle();
      if (ang === 90) [dx, dy] = [dy, -dx];
      else if (ang === 180) [dx, dy] = [-dx, -dy];
      else if (ang === 270) [dx, dy] = [-dy, dx];
      const shape = (d: number) => {
        const m = Math.abs(d);
        if (m < TILT_DEADZONE) return 0;
        return Math.sign(d) * clamp((m - TILT_DEADZONE) / (TILT_FULL - TILT_DEADZONE), 0, 1.4);
      };
      return [shape(dx), shape(dy)];
    };

    const finish = (success: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setOk(success);
      setP("result");
      const s = sim.current;
      if (success) {
        sfx.chime();
        window.setTimeout(() => sfx.sparkle(), 220);
        navigator.vibrate?.([40, 60, 40, 60, 120]);
        if (art) sparks.emit(art.cx + s.x * art.rp, art.cy + s.y * art.rp, 70, art.r * 1.6);
      } else {
        sfx.boing();
        navigator.vibrate?.([80, 60, 80]);
      }
      void sendResult(success);
      timeouts.current.push(window.setTimeout(() => setStuck(true), 8000));
    };

    const step = (dt: number) => {
      const s = sim.current;
      const [rx, ry] = readTilt();
      const kf = Math.min(1, dt * 10);
      s.tiltX += (rx - s.tiltX) * kf;
      s.tiltY += (ry - s.tiltY) * kf;
      const prog = clamp(s.t / ATTEMPT_S, 0, 1);
      const drift = lerp(DRIFT_START, DRIFT_END, prog);
      const [p1, p2, p3, p4] = s.phases;
      let ax = s.tiltX * TILT_ACCEL + drift * (Math.sin(s.t * 0.53 + p1) + 0.6 * Math.sin(s.t * 1.31 + p2)) / 1.6;
      let ay = s.tiltY * TILT_ACCEL + drift * (Math.cos(s.t * 0.47 + p3) + 0.6 * Math.sin(s.t * 1.07 + p4)) / 1.6;
      if (s.t >= s.nextGust) {
        s.gustLeft = GUST_S;
        s.gustDir = Math.random() * TAU;
        s.nextGust = s.t + 3.8 + Math.random() * 2.8;
      }
      if (s.gustLeft > 0) {
        const bell = Math.sin(Math.PI * (1 - s.gustLeft / GUST_S));
        ax += Math.cos(s.gustDir) * GUST * bell;
        ay += Math.sin(s.gustDir) * GUST * bell;
        s.gustLeft -= dt;
      }
      const d = Math.hypot(s.x, s.y);
      if (d < GLOBE_TARGET) { ax -= s.x * ASSIST; ay -= s.y * ASSIST; }
      ax -= s.vx * DAMPING;
      ay -= s.vy * DAMPING;
      s.vx += ax * dt;
      s.vy += ay * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const d2 = Math.hypot(s.x, s.y);
      if (d2 > 1) {
        const nx = s.x / d2, ny = s.y / d2;
        s.x = nx; s.y = ny;
        const vn = s.vx * nx + s.vy * ny;
        if (vn > 0) { s.vx -= nx * vn * 1.35; s.vy -= ny * vn * 1.35; }
      }
      s.rot += (s.vx * 2.4 + 0.25) * dt;
      s.t += dt;
    };

    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      wallT += dt;
      const s = sim.current;
      const p = phaseRef.current;
      let swirl = 0.15;

      if (p === "play") {
        // fixed substeps keep the physics identical on 60 and 120 Hz screens
        let left = dt;
        while (left > 1e-4) { const h = Math.min(1 / 120, left); step(h); left -= h; }
        const isIn = Math.hypot(s.x, s.y) < GLOBE_TARGET;
        if (isIn !== s.inside) {
          s.inside = isIn;
          setInside(isIn);
          if (isIn) { sfx.tinkle(); navigator.vibrate?.(30); if (art) sparks.emit(art.cx + s.x * art.rp, art.cy + s.y * art.rp, 8, art.r * 0.5); }
          else { sfx.hover(); navigator.vibrate?.([15, 40, 15]); }
        }
        s.hold = isIn ? Math.min(1, s.hold + dt / HOLD_S) : Math.max(0, s.hold - dt * DRAIN_PER_S);
        const m = Math.floor(s.hold * 4);
        if (m > s.milestone && m < 4) {
          s.milestone = m;
          sfx.tinkle();
          navigator.vibrate?.(20);
          if (art) {
            const a1 = -Math.PI / 2 + s.hold * TAU, rr = (GLOBE_TARGET + 0.1) * art.rp;
            sparks.emit(art.cx + Math.cos(a1) * rr, art.cy + Math.sin(a1) * rr, 14, art.r * 0.7);
          }
        }
        if (timerRef.current) timerRef.current.style.transform = `scaleX(${Math.max(0, 1 - s.t / ATTEMPT_S)})`;
        swirl = 0.25 + (s.gustLeft > 0 ? 0.8 : 0);
        disp = { x: s.x, y: s.y };
        if (s.hold >= 1) finish(true);
        else if (s.t >= ATTEMPT_S) finish(false);
      } else if (p === "result") {
        if (finished.current && s.hold >= 1) s.lift = Math.min(1, s.lift + dt * 0.8);
        else disp = { x: lerp(disp.x, 0, dt * 1.2), y: lerp(disp.y, 0.62, dt * 1.5) };
        if (s.hold < 1) s.hold = Math.max(0, s.hold - dt * 0.4);
        s.rot += 0.15 * dt;
        s.insideE += ((s.hold >= 1 ? 1 : 0) - s.insideE) * Math.min(1, dt * 6);
      } else {
        // intro: the gear floats lazily; countdown: it settles in the middle of the circle
        const tx = p === "countdown" ? 0 : Math.sin(wallT * 0.5) * 0.22;
        const ty = p === "countdown" ? 0 : 0.18 + Math.sin(wallT * 0.37) * 0.14;
        disp = { x: lerp(disp.x, tx, Math.min(1, dt * 3)), y: lerp(disp.y, ty, Math.min(1, dt * 3)) };
        s.rot += 0.3 * dt;
      }
      if (p === "play") s.insideE += ((s.inside ? 1 : 0) - s.insideE) * Math.min(1, dt * 8);
      else if (p !== "result") s.insideE += ((p === "countdown" ? 1 : 0) - s.insideE) * Math.min(1, dt * 4);

      flakes.update(dt, wallT, swirl, p === "play" ? { x: s.x * 0.7, y: s.y * 0.7, vx: s.vx * 0.7, vy: s.vy * 0.7 } : undefined);
      sparks.update(dt, art ? art.r * 0.6 : 100);
      if (art) {
        paintGlobe(g, art, {
          t: wallT, x: disp.x, y: disp.y, rot: s.rot, hold: s.hold, inside: s.insideE,
          ring: p === "intro" ? 0.6 : 1, lift: s.lift, flakes, sparks,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      // Unmounted mid-attempt (the turn was skipped or the chapter moved on): just stop. The server
      // has already moved on, so no result is sent for this attempt.
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      timeouts.current.forEach((t) => clearTimeout(t));
      timeouts.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device orientation, once permission is granted.
  useEffect(() => {
    if (!listening) return;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const b = e.beta * D2R, gm = e.gamma * D2R;
      const u: Vec3 = [-Math.sin(gm) * Math.cos(b), Math.sin(b), Math.cos(gm) * Math.cos(b)];
      const s = sensor.current;
      s.u = u;
      s.seen = true;
      // While counting down, keep averaging how the phone is held: that is "level".
      if (phaseRef.current === "countdown" || !s.base) {
        s.base = s.base ? [lerp(s.base[0], u[0], 0.2), lerp(s.base[1], u[1], 0.2), lerp(s.base[2], u[2], 0.2)] : u;
      }
    };
    window.addEventListener("deviceorientation", on);
    return () => window.removeEventListener("deviceorientation", on);
  }, [listening]);

  // Keyboard fallback for desktop testing.
  useEffect(() => {
    const keys = virt.current.keys;
    const down = (e: KeyboardEvent) => { if (e.key.startsWith("Arrow")) { keys.add(e.key); e.preventDefault(); } };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Live gear position to the TV, about 8 times a second, never piling requests up on a slow link.
  useEffect(() => {
    if (phase !== "play") return;
    let inflight = false, sentAt = 0;
    const iv = window.setInterval(() => {
      const now = Date.now();
      if (inflight && now - sentAt < 1000) return;
      inflight = true;
      sentAt = now;
      const s = sim.current;
      const { code: c, player: p } = props.current;
      api.globeGear(c, p.id, +s.x.toFixed(3), +s.y.toFixed(3), +s.hold.toFixed(3)).catch(() => {}).finally(() => { inflight = false; });
    }, SEND_MS);
    return () => clearInterval(iv);
  }, [phase]);

  // A new turn for the same player (a family of one tries again): back to the start card.
  useEffect(() => {
    const n = state.turn?.n ?? 0;
    if (n === turnN.current) return;
    turnN.current = n;
    if (phaseRef.current === "result" && state.turn?.playerId === player.id) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn?.n]);

  const reset = () => {
    timeouts.current.forEach((t) => clearTimeout(t));
    timeouts.current = [];
    sim.current = freshSim();
    finished.current = false;
    setOk(null);
    setInside(true);
    setP("intro");
  };

  const start = async () => {
    unlockAudio();
    sfx.pop();
    const DOE = (window as unknown as { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent;
    let granted = typeof window.DeviceOrientationEvent !== "undefined";
    if (DOE?.requestPermission) {
      try { granted = (await DOE.requestPermission()) === "granted"; } catch { granted = false; }
    }
    if (granted) setListening(true);
    else setTouchMode(true);

    sim.current = freshSim();
    finished.current = false;
    lastAtStart.current = state.globe.last?.at ?? null;
    sensor.current.base = null;
    setOk(null);
    setCount(3);
    setP("countdown");
    sfx.knock();
    navigator.vibrate?.(10);
    const at = (ms: number, fn: () => void) => timeouts.current.push(window.setTimeout(fn, ms));
    at(900, () => { setCount(2); sfx.knock(); navigator.vibrate?.(10); });
    at(1800, () => { setCount(1); sfx.knock(); navigator.vibrate?.(10); });
    at(2700, () => {
      setCount(0);
      sfx.tinkle();
      navigator.vibrate?.(40);
      // No sensor events by now: a laptop or a phone without a gyroscope. Drag to tilt instead.
      if (!sensor.current.seen) setTouchMode(true);
      const s = sim.current;
      s.t = 0;
      setInside(true);
      setP("play");
    });
  };

  // Touch drag: dragging the finger tilts the globe that way.
  const onDown = (e: React.PointerEvent) => {
    if (!touchMode && sensor.current.seen) return;
    virt.current.drag = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const v = virt.current;
    if (!v.drag) return;
    v.x = clamp((e.clientX - v.drag.x) / 70, -1.2, 1.2);
    v.y = clamp((e.clientY - v.drag.y) / 70, -1.2, 1.2);
  };
  const onUp = () => { const v = virt.current; v.drag = null; v.x = 0; v.y = 0; };

  const last = state.globe.last;
  const confirmed = phase === "result" && !!last && last.playerId === player.id && last.at !== lastAtStart.current;
  const freed = state.pieces.gear;
  const solo = state.players.length <= 1;

  let hint = "";
  if (phase === "countdown") hint = touchMode ? "Get ready to drag..." : "Hold it flat and still...";
  if (phase === "play") hint = inside ? "Lovely! Hold it right there." : touchMode ? "Drag gently to bring the gear back." : "Gently... tilt the gear back to the circle.";

  return (
    <div className="bg">
      <header className="bg-who">
        <span className="bg-avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <small>The snow globe</small>
          <strong className={player.name.length > 10 ? "long" : ""}>{player.name}'s turn</strong>
        </div>
        <span className="bg-goal" aria-label={`${state.globe.successes} of ${state.globe.needed}`}>
          {Array.from({ length: state.globe.needed }, (_, i) => <i key={i} className={i < state.globe.successes ? "on" : ""} />)}
        </span>
      </header>

      <div
        className={`bg-stage ${phase === "result" && ok === false ? "wobble" : ""}`}
        ref={stageRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <canvas ref={canvasRef} />
        {phase === "countdown" && <div className="bg-count" key={count}>{count > 0 ? count : "Go!"}</div>}
      </div>

      <div className={`bg-timer ${phase === "play" ? "on" : ""}`} aria-hidden><div ref={timerRef} /></div>
      <p className={`bg-hint ${phase === "play" && inside ? "good" : ""}`}>{hint}</p>

      {phase === "intro" && (
        <div className="bg-card">
          <TiltIcon />
          <h2>{player.name}'s turn!</h2>
          <p><strong>Hold the phone flat</strong>, like a little tray.</p>
          <p>Tilt it very gently to keep the gear inside the golden circle until the ring is full.</p>
          <button className="big" onClick={() => void start()}>Start</button>
        </div>
      )}

      {phase === "result" && (
        <div className={`bg-card result ${ok ? "ok" : "no"}`}>
          <h2>{ok ? (freed ? "The heart gear is free!" : "Steady as a rock!") : "Wobbly!"}</h2>
          <p>
            {ok
              ? freed ? "Piece number one. Look at the TV!" : solo ? "Wonderful! One more go to settle it." : "Wonderful! Pass the phone to the next steady hand."
              : solo ? "Never mind. Take a breath and try again, nice and slow." : "Never mind. Pass the phone on, everyone gets a go."}
          </p>
          {confirmed && state.jingle.line && <p className="bg-jingle">"{state.jingle.line}"</p>}
          {!confirmed && !stuck && <p className="bg-wait">Telling the TV...</p>}
          {!confirmed && stuck && (
            <button className="big" onClick={() => { setStuck(false); void sendResult(!!ok); timeouts.current.push(window.setTimeout(() => setStuck(true), 8000)); }}>
              The TV didn't hear it. Send again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TiltIcon() {
  return (
    <svg className="bg-tilt" viewBox="0 0 120 70" width="120" height="70" aria-hidden>
      <ellipse cx="60" cy="60" rx="44" ry="6" fill="#00000033" />
      <g className="bg-tilt-phone">
        <rect x="22" y="34" width="76" height="16" rx="6" fill="#3a2516" stroke="#c8963e" strokeWidth="3" />
        <circle cx="60" cy="42" r="5" fill="#c8963e" />
      </g>
      <path d="M14 22 q-8 10 0 20" fill="none" stroke="#c8963e" strokeWidth="3" strokeLinecap="round" />
      <path d="M106 22 q8 10 0 20" fill="none" stroke="#c8963e" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
