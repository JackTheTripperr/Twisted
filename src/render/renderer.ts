/**
 * Canvas renderer for TWISTED.
 * Draws into an offscreen "scene" at logical 1280x720, then composites to the
 * visible canvas with bloom, chromatic aberration, glitch slices, shake and
 * flashes. Everything modulates with the BeatInfo from the audio engine.
 */

import type { BeatInfo } from '../audio/engine';
import type { Course } from '../game/courses';
import { PLAY } from '../game/courses';
import type { Clock, Obstacle } from '../game/entities';
import { pointAlong } from '../game/entities';
import type { Zone } from '../game/levels';
import { MODIFIER_INFO } from '../game/levels';
import type { GateState, Phase, Segment, Vec, ZoneDef, ZoneState } from '../game/types';

export const W = 1280;
export const H = 720;
export const INTRO_T = 1.25;
export const DEATH_T = 2.0;
export const REBOOT_T = 1.5;
export const CLEAR_T = 1.35;
export const PRACTICE_T = 1.0;

export interface PhantomView {
  x: number;
  y: number;
  r: number;
  alive: boolean;
  fade: number;
  /** seconds since it spawned; harmless while materialising */
  age: number;
  trail: Vec[];
}

export interface PurgeView {
  poly: Vec[];
  pos: Vec;
  dir: Vec;
  span: number;
}

export interface GameView {
  phase: Phase;
  phaseT: number;
  level: number;
  zone: Zone;
  course: Course | null;
  obstacles: Obstacle[];
  cursor: { x: number; y: number; r: number };
  vel: Vec;
  activeZone: ZoneDef | null;
  zoneState: ZoneState | null;
  gates: GateState[];
  phantom: PhantomView | null;
  purge: PurgeView | null;
  pickupTaken: boolean;
  fragmentTaken: boolean;
  ghostPos: Vec | null;
  surgeActive: boolean;
  surgeT: number;
  zoom: { x: number; y: number; s: number };
  hasMoved: boolean;
  near: { seg: Segment; d: number }[];
  ghost: boolean;
  attract: boolean;
  clock: Clock;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
  drag: number;
  shape: 'dot' | 'line' | 'square';
}

interface Ring {
  x: number;
  y: number;
  t0: number;
  color: string;
  speed: number;
  width: number;
  max: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

interface Star {
  x: number;
  y: number;
  s: number;
  p: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const RED = '#ff2d55';
const TAU = Math.PI * 2;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private scene: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private glow: HTMLCanvasElement;
  private core: HTMLCanvasElement;
  private bloom: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private filterOK: boolean;
  private noise: HTMLCanvasElement;
  private noisePattern: CanvasPattern | null = null;
  private hatch: HTMLCanvasElement;

  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private shakeScale = 1;
  private flashScale = 1;
  private zoomState = { x: 640, y: 360, s: 1 };
  private surgeOn = false;
  private trail: { x: number; y: number; t: number }[] = [];
  private rings: Ring[] = [];
  private stars: Star[] = [];
  private motes: Particle[] = [];

  private shakeAmt = 0;
  private aberr = 0;
  private glitchAmt = 0;
  private flashAmt = 0;
  private flashColor = '#ffffff';
  private time = 0;
  private lastBar = -1;
  private lastStep = -1;
  private blackout = 0;

  private walls: Segment[] = [];
  private zone: Zone | null = null;
  private start: Vec = { x: 0, y: 0 };
  private maxReveal = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.scene = document.createElement('canvas');
    this.sctx = this.scene.getContext('2d', { alpha: false })!;
    this.glow = document.createElement('canvas');
    this.core = document.createElement('canvas');
    this.bloom = document.createElement('canvas');
    this.bctx = this.bloom.getContext('2d')!;
    this.filterOK = 'filter' in this.ctx;
    // static-noise tile for crush walls / purge waves
    this.noise = document.createElement('canvas');
    this.noise.width = 128;
    this.noise.height = 128;
    const ng = this.noise.getContext('2d')!;
    const img = ng.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const vv = Math.random();
      const bright = vv > 0.82 ? 255 : vv > 0.5 ? 90 + vv * 80 : 20;
      img.data[i] = bright;
      img.data[i + 1] = bright * (0.6 + Math.random() * 0.4);
      img.data[i + 2] = bright;
      img.data[i + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
    this.noisePattern = this.sctx.createPattern(this.noise, 'repeat');
    // hatch tile for zones
    this.hatch = document.createElement('canvas');
    this.hatch.width = 16;
    this.hatch.height = 16;
    const hg = this.hatch.getContext('2d')!;
    hg.strokeStyle = 'rgba(255,255,255,0.35)';
    hg.lineWidth = 1.5;
    hg.beginPath();
    hg.moveTo(-4, 20);
    hg.lineTo(20, -4);
    hg.moveTo(-4, 4);
    hg.lineTo(4, -4);
    hg.moveTo(12, 20);
    hg.lineTo(20, 12);
    hg.stroke();
    this.setDpr(Math.min(2, window.devicePixelRatio || 1));
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 110; i++) {
      this.stars.push({ x: rnd() * W, y: rnd() * H * 0.55, s: 0.6 + rnd() * 1.6, p: rnd() * Math.PI * 2 });
    }
    for (let i = 0; i < 46; i++) {
      this.motes.push({
        x: rnd() * W,
        y: rnd() * H,
        vx: (rnd() - 0.5) * 14,
        vy: -6 - rnd() * 16,
        life: 1,
        max: 1,
        size: 1 + rnd() * 2.2,
        color: '#ffffff',
        g: 0,
        drag: 0,
        shape: 'dot',
      });
    }
  }

  setDpr(dpr: number) {
    this.dpr = dpr;
    for (const c of [this.canvas, this.scene, this.glow, this.core]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    this.bloom.width = Math.round(W / 4);
    this.bloom.height = Math.round(H / 4);
    if (this.zone) this.buildCache();
  }

  // ------------------------------------------------------------------ level cache

  setLevel(walls: Segment[], start: Vec, zone: Zone) {
    this.walls = walls;
    this.zone = zone;
    this.start = start;
    this.trail.length = 0;
    this.rings.length = 0;
    const corners = [
      [PLAY.x, PLAY.y],
      [PLAY.x + PLAY.w, PLAY.y],
      [PLAY.x, PLAY.y + PLAY.h],
      [PLAY.x + PLAY.w, PLAY.y + PLAY.h],
    ];
    this.maxReveal = Math.max(...corners.map(([x, y]) => Math.hypot(x - start.x, y - start.y)));
    this.buildCache();
  }

  private strokeSegs(g: CanvasRenderingContext2D, segs: Segment[]) {
    g.beginPath();
    for (const s of segs) {
      g.moveTo(s.x1, s.y1);
      g.lineTo(s.x2, s.y2);
    }
    g.stroke();
  }

  private buildCache() {
    const zone = this.zone!;
    const segs = this.walls;
    const wallT = 8;
    const passes: { c: HTMLCanvasElement; fn: (g: CanvasRenderingContext2D) => void }[] = [
      {
        c: this.glow,
        fn: (g) => {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.shadowBlur = 0;
          g.strokeStyle = zone.primary;
          g.globalAlpha = 0.16;
          g.lineWidth = wallT * 4.2;
          this.strokeSegs(g, segs);
          g.globalAlpha = 0.32;
          g.lineWidth = wallT * 2.3;
          this.strokeSegs(g, segs);
          g.shadowColor = zone.primary;
          g.shadowBlur = 18 * this.dpr;
          g.globalAlpha = 0.95;
          g.lineWidth = wallT;
          this.strokeSegs(g, segs);
        },
      },
      {
        c: this.core,
        fn: (g) => {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.strokeStyle = zone.primary;
          g.globalAlpha = 1;
          g.lineWidth = wallT;
          this.strokeSegs(g, segs);
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = Math.max(1.5, wallT * 0.38);
          this.strokeSegs(g, segs);
        },
      },
    ];
    for (const p of passes) {
      const g = p.c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, p.c.width, p.c.height);
      g.scale(this.dpr, this.dpr);
      p.fn(g);
    }
  }

  // ------------------------------------------------------------------ effects API

  setOptions(shake: boolean, flash: boolean) {
    this.shakeScale = shake ? 1 : 0;
    this.flashScale = flash ? 1 : 0.35;
  }
  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a * this.shakeScale);
  }
  glitch(a: number) {
    this.glitchAmt = Math.max(this.glitchAmt, a * this.flashScale);
  }
  flash(color: string, a: number) {
    this.flashColor = color;
    this.flashAmt = Math.max(this.flashAmt, a * this.flashScale);
  }
  chroma(a: number) {
    this.aberr = Math.max(this.aberr, a * this.flashScale);
  }
  floatText(x: number, y: number, text: string, color: string, size = 16) {
    this.floats.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
  }
  /** Graze feedback: sparks, a tiny ring and a score popup. */
  graze(x: number, y: number, color: string, text: string) {
    this.sparks(x, y, 0, 0, color, 10);
    this.sparks(x, y, 0, 0, '#ffffff', 4);
    this.ring(x, y, color, 260, 2, 60);
    this.floatText(x, y - 18, text, color, 13);
  }
  ring(x: number, y: number, color: string, speed = 260, width = 3, max = 240) {
    this.rings.push({ x, y, t0: this.time, color, speed, width, max });
  }

  private push(p: Omit<Particle, 'max'>) {
    this.particles.push({ ...p, max: p.life });
  }

  explode(x: number, y: number, colors: string[], count = 150) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 520;
      const shape = Math.random() < 0.3 ? 'line' : Math.random() < 0.5 ? 'square' : 'dot';
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 1.1,
        size: 1.5 + Math.random() * 3.5,
        color: colors[(Math.random() * colors.length) | 0],
        g: 260,
        drag: 1.4,
        shape,
      });
    }
  }

  burst(x: number, y: number, colors: string[], count = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 380;
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0.8 + Math.random() * 1.2,
        size: 2 + Math.random() * 3,
        color: colors[(Math.random() * colors.length) | 0],
        g: 380,
        drag: 1.1,
        shape: Math.random() < 0.5 ? 'square' : 'dot',
      });
    }
  }

  private sparks(x: number, y: number, vx: number, vy: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp - vx * 0.3,
        vy: Math.sin(a) * sp - vy * 0.3,
        life: 0.25 + Math.random() * 0.35,
        size: 0.8 + Math.random() * 1.6,
        color,
        g: 0,
        drag: 2,
        shape: 'dot',
      });
    }
  }

  // ------------------------------------------------------------------ frame

  frame(view: GameView, beat: BeatInfo, dt: number, fxDt = dt) {
    this.time += fxDt;
    this.zoomState = view.zoom;
    this.surgeOn = view.surgeActive;
    const g = this.sctx;
    const zone = view.zone;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (beat.bar !== this.lastBar) {
      this.lastBar = beat.bar;
      if (view.course && (view.phase === 'playing' || view.phase === 'title' || view.phase === 'intro')) {
        this.ring(view.course.goal.x, view.course.goal.y, zone.secondary, 180, 2, 150);
        if (view.course.pickup && !view.pickupTaken) this.ring(view.course.pickup.x, view.course.pickup.y, '#ffffff', 140, 1.5, 90);
      }
    }
    if (beat.step !== this.lastStep) {
      this.lastStep = beat.step;
      if (beat.step === 4 || beat.step === 12) this.aberr = Math.max(this.aberr, 1.6 * beat.intensity + 0.4);
    }

    const reveal = view.phase === 'intro' ? clamp01(view.phaseT / (INTRO_T * 0.85)) : 1;

    this.drawBackground(g, view, beat, fxDt);
    if (view.course) {
      this.drawFrame(g, view, beat);
      this.drawZones(g, view, beat, reveal);
      this.drawWalls(g, view, beat, reveal);
      g.save();
      g.globalAlpha = reveal;
      this.drawObstacles(g, view, beat);
      this.drawPurge(g, view);
      g.restore();
      this.drawGoal(g, view, beat);
      this.drawStart(g, view, beat);
      this.drawPickup(g, view, beat, reveal);
      this.drawFragment(g, view, beat, reveal);
      this.drawRings(g);
      this.drawTrail(g, view);
      this.drawGhost(g, view);
      this.drawPhantom(g, view);
      this.drawCursor(g, view, beat);
    }
    this.updateParticles(g, fxDt);
    this.drawFloats(g, fxDt);
    this.drawBlackout(g, view, dt);
    this.composite(beat, dt);
  }

  // ------------------------------------------------------------------ layers

  private drawBackground(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo, dt: number) {
    const zone = view.zone;
    const kick = beat.kick;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${zone.hue}, 70%, ${4 + kick * 3}%)`);
    bg.addColorStop(0.55, `hsl(${zone.hue + 20}, 60%, 3%)`);
    bg.addColorStop(1, '#020108');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2.2 + s.p));
      g.globalAlpha = (0.25 + beat.hat * 0.5) * tw;
      g.fillStyle = '#ffffff';
      g.fillRect(s.x, s.y, s.s, s.s);
    }
    g.restore();

    const sunY = 340;
    const sunR = 230 + kick * 14;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.28 + kick * 0.12;
    const sun = g.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sun.addColorStop(0, zone.accent);
    sun.addColorStop(0.35, zone.secondary);
    sun.addColorStop(1, zone.primary);
    g.fillStyle = sun;
    g.beginPath();
    g.arc(W / 2, sunY, sunR, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    const scroll = (beat.beat * 0.35) % 1;
    for (let i = 0; i < 12; i++) {
      const p = (i + scroll) / 12;
      const y = sunY + sunR * 0.05 + p * sunR * 0.95;
      const h = 2 + p * 16;
      g.fillRect(W / 2 - sunR - 2, y, sunR * 2 + 4, h);
    }
    g.restore();

    const horizon = 392;
    const vp = { x: W / 2, y: horizon };
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = zone.primary;
    g.lineWidth = 1;
    const gridA = 0.07 + kick * 0.22;
    for (const dir of [1, -1]) {
      const span = dir === 1 ? H - horizon : horizon;
      g.globalAlpha = dir === 1 ? gridA : gridA * 0.45;
      g.beginPath();
      for (let i = -14; i <= 14; i++) {
        g.moveTo(vp.x, vp.y);
        g.lineTo(vp.x + i * 130, vp.y + dir * span * 1.2);
      }
      g.stroke();
      const off = (beat.beat * 0.5) % 1;
      for (let k = 0; k < 12; k++) {
        const p = (k + off) / 12;
        const y = vp.y + dir * span * p * p;
        g.globalAlpha = (dir === 1 ? gridA : gridA * 0.45) * (0.3 + p);
        g.lineWidth = 0.6 + p * 1.6;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
    }
    g.globalAlpha = 0.35 + kick * 0.5;
    g.lineWidth = 2;
    g.strokeStyle = zone.secondary;
    g.beginPath();
    g.moveTo(0, horizon);
    g.lineTo(W, horizon);
    g.stroke();
    g.restore();

    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -4) {
        m.y = H + 4;
        m.x = Math.random() * W;
      }
      if (m.x < -4) m.x = W + 4;
      if (m.x > W + 4) m.x = -4;
      g.globalAlpha = 0.18 + beat.hat * 0.35;
      g.fillStyle = zone.accent;
      g.beginPath();
      g.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawFrame(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const zone = view.zone;
    const pad = 16;
    const x = PLAY.x - pad;
    const y = PLAY.y - pad;
    const w = PLAY.w + pad * 2;
    const h = PLAY.h + pad * 2;
    g.save();
    g.fillStyle = 'rgba(4,2,16,0.86)';
    this.roundRect(g, x, y, w, h, 10);
    g.fill();
    g.fillStyle = rgba(zone.primary, 0.1);
    for (let cy = PLAY.y + 40; cy < PLAY.y + PLAY.h; cy += 40) {
      for (let cx = PLAY.x + 40; cx < PLAY.x + PLAY.w; cx += 40) g.fillRect(cx - 0.5, cy - 0.5, 1, 1);
    }
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 8;
    g.strokeStyle = rgba(zone.primary, 0.08 + beat.kick * 0.14);
    this.roundRect(g, x, y, w, h, 10);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = rgba(zone.primary, 0.35 + beat.kick * 0.45);
    this.roundRect(g, x, y, w, h, 10);
    g.stroke();
    const sx = PLAY.x + PLAY.w * beat.barPhase;
    const sweep = g.createLinearGradient(sx - 60, 0, sx, 0);
    sweep.addColorStop(0, rgba(zone.primary, 0));
    sweep.addColorStop(1, rgba(zone.primary, 0.1 + beat.intensity * 0.08));
    g.fillStyle = sweep;
    g.fillRect(sx - 60, PLAY.y, 60, PLAY.h);
    g.restore();
  }

  private polyPath(g: CanvasRenderingContext2D, poly: Vec[]) {
    g.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
    g.closePath();
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, alpha: number, spacing = 4) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.font = `700 ${size}px Orbitron, "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    g.fillText(text, x + spacing / 2, y);
    g.restore();
  }

  private drawZones(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo, reveal: number) {
    const course = view.course!;
    for (const z of course.zones) {
      const info = MODIFIER_INFO[z.kind];
      const active = view.activeZone === z;
      const col = info.color;
      g.save();
      g.globalAlpha = reveal;
      g.beginPath();
      this.polyPath(g, z.poly);
      if (z.holes) for (const h of z.holes) this.polyPath(g, h);
      g.fillStyle = rgba(col, active ? 0.14 + beat.kick * 0.08 : 0.06);
      g.fill('evenodd');
      const pat = g.createPattern(this.hatch, 'repeat');
      if (pat) {
        g.save();
        g.clip('evenodd');
        g.globalAlpha = reveal * (active ? 0.18 : 0.07);
        g.fillStyle = pat;
        g.translate((this.time * 12) % 16, 0);
        g.fillRect(-32, 0, W + 64, H);
        g.restore();
      }
      g.setLineDash([8, 6]);
      g.lineDashOffset = -this.time * 30;
      g.strokeStyle = rgba(col, active ? 0.8 : 0.35);
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
      // label position (centroid) doubles as the "inside" reference for gate chevrons
      let cx = 0;
      let cy = 0;
      for (const p of z.poly) {
        cx += p.x;
        cy += p.y;
      }
      cx /= z.poly.length;
      cy /= z.poly.length;
      // gates
      const drawGate = (s: Segment, isEntry: boolean) => {
        const bright = isEntry ? col : '#ffffff';
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        g.strokeStyle = bright;
        g.globalAlpha = reveal * 0.18;
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(s.x1, s.y1);
        g.lineTo(s.x2, s.y2);
        g.stroke();
        g.globalAlpha = reveal * (0.7 + beat.kick * 0.3);
        g.lineWidth = 3;
        g.stroke();
        // travelling chevrons along the gate
        const dx = s.x2 - s.x1;
        const dy = s.y2 - s.y1;
        const len = Math.hypot(dx, dy) || 1;
        const n = Math.max(1, Math.floor(len / 26));
        const tx = dx / len;
        const ty = dy / len;
        let nx = -ty;
        let ny = tx;
        // orient the normal toward the zone interior, then flip it for the exit gate
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        if ((cx - mx) * nx + (cy - my) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        if (!isEntry) {
          nx = -nx;
          ny = -ny;
        }
        g.lineWidth = 2;
        g.globalAlpha = reveal * 0.9;
        const t = (this.time * 1.6) % 1;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n;
          const px = s.x1 + dx * f;
          const py = s.y1 + dy * f;
          const off = t * 14 - 7;
          const tipX = px + nx * (off + 5);
          const tipY = py + ny * (off + 5);
          const bx = px + nx * (off - 3);
          const by = py + ny * (off - 3);
          g.beginPath();
          g.moveTo(bx - tx * 5, by - ty * 5);
          g.lineTo(tipX, tipY);
          g.lineTo(bx + tx * 5, by + ty * 5);
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
      };
      const gs = view.gates[course.zones.indexOf(z)];
      const gateLabel = (s: Segment, text: string, color: string, alpha: number) => {
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        const vertical = Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1);
        const dirX = vertical ? (mx < cx ? -1 : 1) : 0;
        const dirY = vertical ? 0 : my < cy ? -1 : 1;
        const lx = mx + dirX * 22;
        const ly = vertical ? Math.min(s.y1, s.y2) - 10 : my + dirY * 16;
        this.label(g, text, lx, ly, 8, color, alpha, 3);
      };
      if (!gs || !gs.entryUsed) {
        drawGate(z.entry, true);
        gateLabel(z.entry, `${info.label} ▸`, col, reveal * 0.9);
      }
      if (!gs || !gs.exitUsed) {
        if (active) {
          // pulse the exit node so the player knows where the restore point is
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = '#ffffff';
          g.lineCap = 'round';
          g.lineWidth = 22 + Math.sin(this.time * 6) * 6;
          g.globalAlpha = reveal * (0.12 + beat.kick * 0.1);
          g.beginPath();
          g.moveTo(z.exit.x1, z.exit.y1);
          g.lineTo(z.exit.x2, z.exit.y2);
          g.stroke();
          g.restore();
        }
        drawGate(z.exit, false);
        gateLabel(z.exit, '◂ RESTORE', '#ffffff', reveal * (active ? 0.95 : 0.55));
      }
      const lift = z.holes ? -170 : -Math.min(60, (this.polyHeight(z.poly) / 2) * 0.55);
      this.label(g, info.label, cx, cy + lift, 18, col, reveal * (active ? 0.9 : 0.45), 8);
      this.label(g, active ? info.blurb : 'ZONE', cx, cy + lift + 22, 9, col, reveal * (active ? 0.8 : 0.35), 4);
      g.restore();
    }
  }

  private polyHeight(poly: Vec[]): number {
    let a = Infinity;
    let b = -Infinity;
    for (const p of poly) {
      a = Math.min(a, p.y);
      b = Math.max(b, p.y);
    }
    return b - a;
  }

  private drawWalls(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo, reveal: number) {
    const zone = view.zone;
    const glowA = 0.5 + beat.kick * 0.5;
    const revealR = reveal * this.maxReveal * 1.05;
    g.save();
    if (reveal < 1) {
      g.beginPath();
      g.arc(this.start.x, this.start.y, revealR, 0, Math.PI * 2);
      g.clip();
    }
    g.globalAlpha = glowA;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.glow, 0, 0, this.glow.width, this.glow.height, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.core, 0, 0, this.core.width, this.core.height, 0, 0, W, H);
    g.restore();
    if (reveal < 1) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = zone.accent;
      g.globalAlpha = 0.8 * (1 - reveal);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(this.start.x, this.start.y, revealR, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    if (view.near.length && (view.phase === 'playing' || view.phase === 'dying')) {
      g.save();
      g.lineCap = 'round';
      g.globalCompositeOperation = 'lighter';
      for (const n of view.near) {
        const a = clamp01(1 - n.d / 30);
        if (a <= 0) continue;
        const wallT = n.seg.ht * 2;
        g.strokeStyle = RED;
        g.globalAlpha = a * a * 0.35;
        g.lineWidth = wallT * 3;
        g.beginPath();
        g.moveTo(n.seg.x1, n.seg.y1);
        g.lineTo(n.seg.x2, n.seg.y2);
        g.stroke();
        g.globalAlpha = a * a * 0.9;
        g.lineWidth = wallT;
        g.stroke();
      }
      g.restore();
    }
  }

  /** Neon capsule bar: wide soft glow, colour body, white core. */
  private bar(g: CanvasRenderingContext2D, s: Segment, color: string, alpha = 1) {
    const t = s.ht * 2;
    g.save();
    g.lineCap = 'round';
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = color;
    g.globalAlpha = alpha * 0.16;
    g.lineWidth = t * 3.2;
    g.beginPath();
    g.moveTo(s.x1, s.y1);
    g.lineTo(s.x2, s.y2);
    g.stroke();
    g.globalAlpha = alpha * 0.35;
    g.lineWidth = t * 1.8;
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha;
    g.lineWidth = t;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(1.5, t * 0.36);
    g.stroke();
    g.restore();
  }

  private disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(x, y, r * 0.5, x, y, r * 2.6);
    halo.addColorStop(0, rgba(color, 0.5 * alpha));
    halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r * 2.6, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, TAU);
    g.fill();
    g.restore();
  }

  private drawObstacles(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const zone = view.zone;
    const sec = zone.secondary;
    const pri = zone.primary;
    for (const o of view.obstacles) {
      const d = o.def;
      switch (d.kind) {
        case 'piston': {
          // base plate
          g.save();
          g.translate(d.base.x, d.base.y);
          g.rotate(Math.atan2(d.dir.y, d.dir.x));
          g.fillStyle = pri;
          g.fillRect(-4, -((d.t ?? 12) / 2 + 8), 8, (d.t ?? 12) + 16);
          g.restore();
          for (const s of o.caps) this.bar(g, s, sec);
          break;
        }
        case 'slider': {
          g.save();
          g.setLineDash([4, 6]);
          g.strokeStyle = rgba(pri, 0.35);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(d.a.x, d.a.y);
          g.lineTo(d.b.x, d.b.y);
          g.stroke();
          g.restore();
          for (const s of o.caps) this.bar(g, s, sec);
          break;
        }
        case 'spinner': {
          for (const s of o.caps) this.bar(g, s, sec);
          g.save();
          g.strokeStyle = rgba(pri, 0.7);
          g.lineWidth = 2;
          g.beginPath();
          g.arc(d.pivot.x, d.pivot.y, (d.inner ?? 0) > 0 ? d.inner! - 4 : 7, 0, TAU);
          g.stroke();
          g.restore();
          if (d.hub) this.disc(g, d.pivot.x, d.pivot.y, d.hub, sec);
          break;
        }
        case 'orbit': {
          g.save();
          g.setLineDash([3, 7]);
          g.lineDashOffset = -o.angle * 40;
          g.strokeStyle = rgba(sec, 0.35);
          g.lineWidth = 1;
          g.beginPath();
          g.arc(d.center.x, d.center.y, d.radius, 0, TAU);
          g.stroke();
          g.restore();
          for (const b of o.discs) this.disc(g, b.x, b.y, b.r, sec);
          break;
        }
        case 'door': {
          const t = d.t ?? 10;
          for (const p of [d.a, d.b]) {
            g.fillStyle = pri;
            g.fillRect(p.x - 5, p.y - 5, 10, 10);
          }
          if (o.doorState === 'closed') {
            this.bar(g, { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, ht: t / 2 }, sec);
          } else if (o.doorState === 'warn') {
            const blink = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 18));
            g.save();
            g.setLineDash([6, 6]);
            g.strokeStyle = rgba(sec, blink);
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(d.a.x, d.a.y);
            g.lineTo(d.b.x, d.b.y);
            g.stroke();
            g.restore();
          } else {
            g.save();
            g.strokeStyle = rgba(pri, 0.18);
            g.lineWidth = 1;
            g.setLineDash([2, 8]);
            g.beginPath();
            g.moveTo(d.a.x, d.a.y);
            g.lineTo(d.b.x, d.b.y);
            g.stroke();
            g.restore();
          }
          break;
        }
        case 'sweeper': {
          const s = o.caps[0];
          if (s) {
            g.save();
            g.globalCompositeOperation = 'lighter';
            const grad = g.createLinearGradient(s.x1, s.y1, s.x2, s.y2);
            grad.addColorStop(0, rgba('#ffffff', 0.9));
            grad.addColorStop(0.15, rgba(sec, 0.85));
            grad.addColorStop(1, rgba(sec, 0.25));
            g.strokeStyle = grad;
            g.lineCap = 'round';
            g.lineWidth = (d.t ?? 6) * 4;
            g.globalAlpha = 0.18 + beat.kick * 0.1;
            g.beginPath();
            g.moveTo(s.x1, s.y1);
            g.lineTo(s.x2, s.y2);
            g.stroke();
            g.globalAlpha = 1;
            g.lineWidth = d.t ?? 6;
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 1.5;
            g.stroke();
            g.restore();
          }
          // emitter + arc range
          g.save();
          g.strokeStyle = rgba(pri, 0.6);
          g.lineWidth = 2;
          g.beginPath();
          g.arc(d.pivot.x, d.pivot.y, 9, 0, TAU);
          g.stroke();
          if (d.a0 !== undefined && d.a1 !== undefined) {
            g.strokeStyle = rgba(sec, 0.35);
            g.setLineDash([3, 5]);
            g.beginPath();
            g.arc(d.pivot.x, d.pivot.y, 26, (d.a0 * Math.PI) / 180, (d.a1 * Math.PI) / 180);
            g.stroke();
          }
          g.restore();
          this.disc(g, d.pivot.x, d.pivot.y, 5, sec);
          break;
        }
        case 'pulser': {
          const gapHalf = ((d.gapWidth / 2) * Math.PI) / 180;
          for (const ring of o.rings) {
            const a = 0.35 + 0.65 * (1 - ring.R / d.maxR);
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.lineCap = 'round';
            g.strokeStyle = sec;
            for (const [lw, al] of [
              [(d.t ?? 8) * 3, 0.15],
              [d.t ?? 8, 0.9],
            ]) {
              g.lineWidth = lw;
              g.globalAlpha = a * al;
              g.beginPath();
              for (let i = 0; i < d.gaps; i++) {
                const g0 = ring.gapA + (TAU * i) / d.gaps + gapHalf;
                const g1 = ring.gapA + (TAU * (i + 1)) / d.gaps - gapHalf;
                g.moveTo(d.center.x + Math.cos(g0) * ring.R, d.center.y + Math.sin(g0) * ring.R);
                g.arc(d.center.x, d.center.y, ring.R, g0, g1);
              }
              g.stroke();
            }
            g.restore();
          }
          this.disc(g, d.center.x, d.center.y, d.core ?? 14, sec, 0.9);
          break;
        }
        case 'crush': {
          this.drawCrushFill(g, d.path, d.width, o.front, o.lens);
          this.drawCrushFront(g, o.frontPos, o.frontDir, d.width, o.front > 0);
          break;
        }
        case 'seeker': {
          if (o.spawned && (o.alive || o.fade > 0)) this.drawHunter(g, o.pos, d.r ?? 11, o.trail, o.alive ? 1 : o.fade, RED);
          if (!o.spawned) {
            // dormant marker
            g.save();
            g.strokeStyle = rgba(RED, 0.35 + 0.25 * Math.sin(this.time * 4));
            g.setLineDash([3, 4]);
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(d.spawn.x, d.spawn.y, 12, 0, TAU);
            g.stroke();
            g.restore();
          }
          break;
        }
        case 'well': {
          g.save();
          const grad = g.createRadialGradient(d.center.x, d.center.y, d.coreR, d.center.x, d.center.y, d.radius);
          grad.addColorStop(0, 'rgba(0,0,0,0.85)');
          grad.addColorStop(0.5, rgba(pri, 0.06));
          grad.addColorStop(1, rgba(pri, 0));
          g.fillStyle = grad;
          g.beginPath();
          g.arc(d.center.x, d.center.y, d.radius, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(pri, 0.25);
          g.lineWidth = 1;
          g.setLineDash([2, 6]);
          g.beginPath();
          g.arc(d.center.x, d.center.y, d.radius, 0, TAU);
          g.stroke();
          g.setLineDash([]);
          for (let k = 0; k < 3; k++) {
            const rr = d.radius * (0.35 + k * 0.2);
            const a0 = o.angle * (1 + k * 0.3) + (k * TAU) / 3;
            g.strokeStyle = rgba(sec, 0.45 - k * 0.1);
            g.lineWidth = 2 - k * 0.4;
            g.beginPath();
            g.arc(d.center.x, d.center.y, rr, a0, a0 + 1.6);
            g.stroke();
          }
          g.strokeStyle = sec;
          g.lineWidth = 3;
          g.globalAlpha = 0.8 + beat.kick * 0.2;
          g.beginPath();
          g.arc(d.center.x, d.center.y, d.coreR + 4, 0, TAU);
          g.stroke();
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = '#000';
          g.beginPath();
          g.arc(d.center.x, d.center.y, d.coreR, 0, TAU);
          g.fill();
          g.restore();
          break;
        }
        case 'spiral': {
          g.save();
          g.lineCap = 'round';
          g.lineJoin = 'round';
          const t = d.t ?? 10;
          g.beginPath();
          for (let i = 0; i < o.caps.length; i++) {
            const s = o.caps[i];
            if (i === 0) g.moveTo(s.x1, s.y1);
            g.lineTo(s.x2, s.y2);
          }
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = pri;
          g.globalAlpha = 0.16;
          g.lineWidth = t * 3.5;
          g.stroke();
          g.globalAlpha = 0.35 + beat.kick * 0.2;
          g.lineWidth = t * 2;
          g.stroke();
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          g.lineWidth = t;
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = t * 0.36;
          g.stroke();
          g.restore();
          // mouth marker at the outer end
          const last = o.caps[o.caps.length - 1];
          if (last) this.disc(g, last.x2, last.y2, 7, sec);
          break;
        }
        case 'breather': {
          for (const side of o.sides) {
            g.save();
            g.lineCap = 'round';
            g.lineJoin = 'round';
            g.beginPath();
            g.moveTo(side[0].x, side[0].y);
            for (let i = 1; i < side.length; i++) g.lineTo(side[i].x, side[i].y);
            const t = d.t ?? 8;
            g.globalCompositeOperation = 'lighter';
            g.strokeStyle = pri;
            g.globalAlpha = 0.16;
            g.lineWidth = t * 4;
            g.stroke();
            g.globalAlpha = 0.3 + beat.kick * 0.3;
            g.lineWidth = t * 2.2;
            g.stroke();
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
            g.lineWidth = t;
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.9)';
            g.lineWidth = t * 0.38;
            g.stroke();
            g.restore();
          }
          break;
        }
        case 'bouncer': {
          g.save();
          g.setLineDash([6, 8]);
          g.strokeStyle = rgba(sec, 0.3);
          g.lineWidth = 1;
          g.strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
          g.restore();
          for (const b of o.discs) this.disc(g, b.x, b.y, b.r, sec);
          break;
        }
      }
    }
  }

  private drawCrushFill(g: CanvasRenderingContext2D, path: Vec[], width: number, front: number, lens: number[]) {
    if (front <= 0 || !this.noisePattern) return;
    const total = lens[lens.length - 1];
    const s = Math.min(front, total);
    g.save();
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(path[0].x, path[0].y);
    let i = 1;
    while (i < lens.length && lens[i] <= s) {
      g.lineTo(path[i].x, path[i].y);
      i++;
    }
    const { p } = pointAlong(path, lens, s);
    g.lineTo(p.x, p.y);
    g.translate((this.time * 90) % 128, (this.time * 37) % 128);
    g.strokeStyle = this.noisePattern;
    g.globalAlpha = 0.85;
    g.stroke();
    g.restore();
  }

  private drawCrushFront(g: CanvasRenderingContext2D, pos: Vec, dir: Vec, width: number, active: boolean) {
    g.save();
    g.translate(pos.x, pos.y);
    g.rotate(Math.atan2(dir.y, dir.x));
    g.globalCompositeOperation = 'lighter';
    const grad = g.createLinearGradient(-40, 0, 0, 0);
    grad.addColorStop(0, rgba(RED, 0));
    grad.addColorStop(1, rgba(RED, 0.55));
    g.fillStyle = grad;
    g.fillRect(-40, -width / 2, 40, width);
    g.strokeStyle = RED;
    g.lineWidth = 4;
    g.globalAlpha = active ? 1 : 0.4;
    g.beginPath();
    g.moveTo(0, -width / 2);
    g.lineTo(0, width / 2);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
    if (active && Math.random() < 0.6) {
      const off = (Math.random() - 0.5) * width;
      this.sparks(pos.x - dir.y * off, pos.y + dir.x * off, dir.x * 60, dir.y * 60, Math.random() < 0.5 ? RED : '#ffffff', 2);
    }
  }

  private drawPurge(g: CanvasRenderingContext2D, view: GameView) {
    const p = view.purge;
    if (!p || !this.noisePattern) return;
    g.save();
    g.beginPath();
    this.polyPath(g, p.poly);
    g.clip();
    g.translate(p.pos.x, p.pos.y);
    g.rotate(Math.atan2(p.dir.y, p.dir.x));
    g.translate((this.time * 90) % 128, (this.time * 37) % 128);
    g.fillStyle = this.noisePattern;
    g.globalAlpha = 0.85;
    g.fillRect(-3000 - (this.time * 90) % 128, -2000, 3000, 4000);
    g.restore();
    this.drawCrushFront(g, p.pos, p.dir, p.span, true);
  }

  private drawHunter(g: CanvasRenderingContext2D, pos: Vec, r: number, trail: Vec[], alpha: number, color: string) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const a = (i / trail.length) * 0.35 * alpha;
      g.globalAlpha = a;
      g.fillStyle = color;
      g.beginPath();
      g.arc(t.x, t.y, r * (0.4 + (i / trail.length) * 0.6), 0, TAU);
      g.fill();
    }
    const j = 2 + Math.random() * 2;
    g.globalAlpha = alpha * 0.7;
    g.fillStyle = color;
    g.beginPath();
    g.arc(pos.x + j, pos.y, r + 1, 0, TAU);
    g.fill();
    g.fillStyle = '#19f0ff';
    g.beginPath();
    g.arc(pos.x - j, pos.y, r + 1, 0, TAU);
    g.fill();
    const halo = g.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, r * 4);
    halo.addColorStop(0, rgba(color, 0.5 * alpha));
    halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(pos.x, pos.y, r * 4, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(pos.x, pos.y, r * 0.55, 0, TAU);
    g.fill();
    // glitch slice through the orb
    g.fillStyle = color;
    g.fillRect(pos.x - r - 4, pos.y - 1 + Math.sin(this.time * 40) * r * 0.6, r * 2 + 8, 2);
    g.restore();
  }

  private drawPhantom(g: CanvasRenderingContext2D, view: GameView) {
    const p = view.phantom;
    if (!p || (!p.alive && p.fade <= 0)) return;
    const col = view.zoneState ? MODIFIER_INFO[view.zoneState.kind].color : RED;
    const arm = Math.min(1, p.age / 0.6);
    if (p.alive && arm < 1) {
      // materialising: a collapsing dashed ring telegraphs where it will be
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = col;
      g.setLineDash([4, 6]);
      g.lineWidth = 2;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.arc(p.x, p.y, p.r + 40 * (1 - arm), 0, TAU);
      g.stroke();
      g.restore();
    }
    this.drawHunter(g, p, p.r, p.trail, (p.alive ? 1 : p.fade) * (0.25 + 0.75 * arm), col);
  }

  private drawGoal(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const course = view.course!;
    const zone = view.zone;
    const { x, y } = course.goal;
    const R = course.goalR;
    const kick = beat.kick;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(x, y, 0, x, y, R * 3.2);
    halo.addColorStop(0, rgba(zone.secondary, 0.55 + kick * 0.3));
    halo.addColorStop(0.35, rgba(zone.secondary, 0.18));
    halo.addColorStop(1, rgba(zone.secondary, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, R * 3.2, 0, TAU);
    g.fill();
    g.strokeStyle = zone.secondary;
    g.lineWidth = 2;
    g.setLineDash([R * 0.5, R * 0.35]);
    g.lineDashOffset = -this.time * 60;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(x, y, R * 1.25 + kick * 3, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.35 + kick * 0.3;
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = this.time * 1.4 + (i * Math.PI) / 3;
      g.moveTo(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5);
      g.lineTo(x + Math.cos(a) * R * 1.05, y + Math.sin(a) * R * 1.05);
    }
    g.stroke();
    const core = g.createRadialGradient(x, y, 0, x, y, R * 0.7 * (1 + kick * 0.2));
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, zone.secondary);
    core.addColorStop(1, rgba(zone.secondary, 0));
    g.globalAlpha = 1;
    g.fillStyle = core;
    g.beginPath();
    g.arc(x, y, R * 0.7 * (1 + kick * 0.2), 0, TAU);
    g.fill();
    g.restore();
  }

  private drawStart(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const course = view.course!;
    const zone = view.zone;
    const d = Math.hypot(view.cursor.x - course.start.x, view.cursor.y - course.start.y);
    const a = clamp01(1 - d / 120) * 0.8;
    if (a <= 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * (0.6 + beat.kick * 0.4);
    g.strokeStyle = zone.primary;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(course.start.x, course.start.y, 34, 0, TAU);
    g.stroke();
    g.globalAlpha = a * 0.5;
    g.beginPath();
    g.arc(course.start.x, course.start.y, 20 + beat.kick * 4, 0, TAU);
    g.stroke();
    g.restore();
  }

  private drawPickup(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo, reveal: number) {
    const course = view.course!;
    if (!course.pickup || view.pickupTaken) return;
    const { x, y } = course.pickup;
    const kick = beat.kick;
    g.save();
    g.globalAlpha = reveal;
    // beacon column
    g.globalCompositeOperation = 'lighter';
    const beam = g.createLinearGradient(0, PLAY.y, 0, y);
    beam.addColorStop(0, 'rgba(255,255,255,0)');
    beam.addColorStop(1, `rgba(255,255,255,${(0.16 + kick * 0.12).toFixed(3)})`);
    g.fillStyle = beam;
    g.fillRect(x - 3, PLAY.y, 6, y - PLAY.y);
    const halo = g.createRadialGradient(x, y, 0, x, y, 60);
    halo.addColorStop(0, `rgba(255,255,255,${(0.35 + kick * 0.25).toFixed(3)})`);
    halo.addColorStop(0.4, rgba(view.zone.primary, 0.18));
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, 60, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // hexagon
    g.translate(x, y);
    g.rotate(this.time * 0.8);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * 15;
      const py = Math.sin(a) * 15;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
    g.rotate(-this.time * 2.2);
    g.strokeStyle = view.zone.primary;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const px = Math.cos(a) * 9;
      const py = Math.sin(a) * 9;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, 3.5 + kick * 2, 0, TAU);
    g.fill();
    this.label(g, 'REBOOT', x, y + 30, 9, '#ffffff', reveal * 0.8, 3);
    g.restore();
  }

  private drawFragment(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo, reveal: number) {
    const course = view.course!;
    if (!course.fragment || view.fragmentTaken) return;
    const { x, y } = course.fragment;
    const col = view.zone.primary;
    g.save();
    g.globalAlpha = reveal;
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(x, y, 0, x, y, 34);
    halo.addColorStop(0, rgba(col, 0.35 + beat.kick * 0.25));
    halo.addColorStop(1, rgba(col, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, 34, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.translate(x, y);
    g.rotate(this.time * 1.6);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 0);
    g.lineTo(0, 10);
    g.lineTo(-7, 0);
    g.closePath();
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(3.5, 0);
    g.lineTo(0, 5);
    g.lineTo(-3.5, 0);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawGhost(g: CanvasRenderingContext2D, view: GameView) {
    const p = view.ghostPos;
    if (!p || view.phase !== 'playing') return;
    g.save();
    g.globalAlpha = 0.45;
    g.strokeStyle = view.zone.accent;
    g.setLineDash([3, 3]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(p.x, p.y, view.cursor.r + 1, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba(view.zone.accent, 0.25);
    g.beginPath();
    g.arc(p.x, p.y, view.cursor.r * 0.6, 0, TAU);
    g.fill();
    g.restore();
    this.label(g, 'BEST', p.x, p.y - view.cursor.r - 9, 7, view.zone.accent, 0.5, 2);
  }

  private drawFloats(g: CanvasRenderingContext2D, dt: number) {
    const alive: FloatText[] = [];
    for (const f of this.floats) {
      f.life -= dt;
      if (f.life <= 0) continue;
      const k = 1 - f.life / f.max;
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      this.label(g, f.text, f.x, f.y - k * 34, f.size, f.color, a, 2);
      alive.push(f);
    }
    this.floats = alive;
  }

  private drawRings(g: CanvasRenderingContext2D) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.rings = this.rings.filter((r) => (this.time - r.t0) * r.speed < r.max);
    for (const r of this.rings) {
      const rad = (this.time - r.t0) * r.speed;
      const a = 1 - rad / r.max;
      g.globalAlpha = a * 0.7;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * (0.4 + a);
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  private drawTrail(g: CanvasRenderingContext2D, view: GameView) {
    const zone = view.zone;
    const c = view.cursor;
    if (view.attract) return;
    if (view.phase === 'playing') {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - c.x, last.y - c.y) > 0.5) this.trail.push({ x: c.x, y: c.y, t: this.time });
      const speed = Math.hypot(view.vel.x, view.vel.y);
      if (speed > 1.5) this.sparks(c.x, c.y, view.vel.x, view.vel.y, Math.random() < 0.7 ? zone.primary : zone.accent, Math.min(4, speed * 0.25));
    }
    const maxAge = 0.42;
    while (this.trail.length && this.time - this.trail[0].t > maxAge) this.trail.shift();
    if (this.trail.length < 2) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const p0 = this.trail[i - 1];
      const p1 = this.trail[i];
      const age = clamp01((this.time - p1.t) / maxAge);
      const a = 1 - age;
      g.strokeStyle = zone.primary;
      g.globalAlpha = a * 0.55;
      g.lineWidth = c.r * 2.2 * a;
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.globalAlpha = a * 0.5;
      g.lineWidth = c.r * 0.6 * a;
      g.stroke();
    }
    g.restore();
  }

  private drawCursor(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    if (view.attract || view.phase === 'dying' || view.phase === 'won' || view.phase === 'clear') return;
    const zone = view.zone;
    const { x, y, r } = view.cursor;
    const kick = beat.kick;
    const zs = view.zoneState;
    const bodyColor = view.ghost ? '#3dff8f' : zone.primary;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const hr = r * 4.6 * (1 + kick * 0.45);
    const halo = g.createRadialGradient(x, y, 0, x, y, hr);
    halo.addColorStop(0, rgba(bodyColor, 0.55));
    halo.addColorStop(0.4, rgba(bodyColor, 0.16));
    halo.addColorStop(1, rgba(bodyColor, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, hr, 0, TAU);
    g.fill();
    if (view.surgeActive) {
      // time dilation: concentric rings breathing out of the cursor
      g.strokeStyle = '#bfe9ff';
      for (let i = 0; i < 3; i++) {
        const ph = (view.surgeT * 1.6 + i / 3) % 1;
        g.globalAlpha = (1 - ph) * 0.5;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, r + 6 + ph * 70, 0, TAU);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (zs && zs.kind === 'TURBO') {
      const sp = Math.hypot(view.vel.x, view.vel.y);
      if (sp > 0.5) {
        const nx = -view.vel.x / sp;
        const ny = -view.vel.y / sp;
        g.strokeStyle = MODIFIER_INFO.TURBO.color;
        g.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const off = (i - 2) * r * 0.7;
          g.globalAlpha = 0.5 - Math.abs(i - 2) * 0.12;
          g.beginPath();
          g.moveTo(x + off * ny, y - off * nx);
          g.lineTo(x + off * ny + nx * (30 + sp * 3), y - off * nx + ny * (30 + sp * 3));
          g.stroke();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (zs) {
      const col = MODIFIER_INFO[zs.kind].color;
      const rr = r + 9;
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      g.lineDashOffset = -this.time * (zs.kind === 'SPIN' ? 150 : 50);
      g.globalAlpha = 0.95;
      g.beginPath();
      g.arc(x, y, rr, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      if (zs.pressure === 'decay') {
        g.globalAlpha = 0.9;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, rr + 5, -Math.PI / 2, -Math.PI / 2 + TAU * zs.decay);
        g.stroke();
      }
    }
    if (view.ghost) {
      g.strokeStyle = '#3dff8f';
      g.setLineDash([2, 3]);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r + 16, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
    g.fillStyle = bodyColor;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, TAU);
    g.fill();
    g.restore();
  }

  private updateParticles(g: CanvasRenderingContext2D, dt: number) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = clamp01(p.life / p.max);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      if (p.shape === 'dot') {
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
        g.fill();
      } else if (p.shape === 'square') {
        const s = p.size * (0.5 + a);
        g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else {
        g.lineWidth = p.size * 0.5;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        g.stroke();
      }
      alive.push(p);
    }
    this.particles = alive.length > 900 ? alive.slice(alive.length - 900) : alive;
    g.restore();
  }

  private drawBlackout(g: CanvasRenderingContext2D, view: GameView, dt: number) {
    const zs = view.zoneState;
    let target = 0;
    if (zs && zs.kind === 'BLACKOUT') target = 1;
    else if (view.course && view.phase === 'playing') {
      // dim ahead of a blackout zone so the player sees it coming
      for (const z of view.course.zones) {
        if (z.kind !== 'BLACKOUT') continue;
        const dx = Math.min(...z.poly.map((p) => Math.abs(p.x - view.cursor.x)));
        if (dx < 120) target = Math.max(target, 0.25 * (1 - dx / 120));
      }
    }
    this.blackout += (target - this.blackout) * Math.min(1, dt * 6);
    if (this.blackout < 0.01) return;
    const { x, y } = view.cursor;
    const inner = 60 + (1 - this.blackout) * 900;
    const outer = inner + 90 + Math.sin(this.time * 9) * 6;
    const grad = g.createRadialGradient(x, y, inner, x, y, outer);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(0.97 * this.blackout).toFixed(3)})`);
    g.save();
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------------------------------------------------------------------ composite

  private composite(beat: BeatInfo, dt: number) {
    const ctx = this.ctx;
    const Wd = this.canvas.width;
    const Hd = this.canvas.height;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, Wd, Hd);

    const sx = (Math.random() - 0.5) * this.shakeAmt * 22 * dpr;
    const sy = (Math.random() - 0.5) * this.shakeAmt * 22 * dpr;
    const scale = 1 + beat.snare * 0.006 + this.flashAmt * 0.012;
    ctx.translate(Wd / 2 + sx, Hd / 2 + sy);
    ctx.scale(scale, scale);
    ctx.translate(-Wd / 2, -Hd / 2);
    // cinematic zoom (death cam, portal warp, level entry)
    const zs = this.zoomState;
    if (Math.abs(zs.s - 1) > 0.002) {
      const zx = zs.x * dpr;
      const zy = zs.y * dpr;
      ctx.translate(zx, zy);
      ctx.scale(zs.s, zs.s);
      ctx.translate(-zx, -zy);
    }

    const ab = this.aberr;
    if (ab > 0.45 && this.filterOK) {
      const a = ab * dpr;
      ctx.filter = 'url(#chan-red)';
      ctx.drawImage(this.scene, a, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'url(#chan-cyan)';
      ctx.drawImage(this.scene, -a, 0);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawImage(this.scene, 0, 0);
    }

    if (this.filterOK) {
      const b = this.bctx;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, this.bloom.width, this.bloom.height);
      b.filter = 'blur(4px)';
      b.drawImage(this.scene, 0, 0, this.bloom.width, this.bloom.height);
      b.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42 + beat.kick * 0.32 + beat.rms * 0.6;
      ctx.drawImage(this.bloom, 0, 0, Wd, Hd);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.glitchAmt > 0.04) {
      const n = Math.ceil(this.glitchAmt * 12);
      for (let i = 0; i < n; i++) {
        const y = Math.random() * Hd;
        const h = (3 + Math.random() * 38) * dpr;
        const off = (Math.random() - 0.5) * this.glitchAmt * 120 * dpr;
        ctx.drawImage(this.scene, 0, y, Wd, h, off, y, Wd, h);
      }
    }

    if (this.flashAmt > 0.01) {
      ctx.globalAlpha = Math.min(1, this.flashAmt);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-Wd, -Hd, Wd * 3, Hd * 3);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.surgeOn) {
      // cool tint + edge darkening while time is stretched
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(70,140,255,0.07)';
      ctx.fillRect(0, 0, Wd, Hd);
      ctx.globalCompositeOperation = 'source-over';
      const vg = ctx.createRadialGradient(Wd / 2, Hd / 2, Hd * 0.35, Wd / 2, Hd / 2, Hd * 0.85);
      vg.addColorStop(0, 'rgba(0,10,40,0)');
      vg.addColorStop(1, 'rgba(0,10,40,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, Wd, Hd);
    }

    this.shakeAmt *= Math.exp(-dt * 5.5);
    this.aberr = Math.max(beat.snare * 1.2 * beat.intensity, this.aberr * Math.exp(-dt * 9));
    this.glitchAmt *= Math.exp(-dt * 4);
    this.flashAmt *= Math.exp(-dt * 7);
  }

  private roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
}
