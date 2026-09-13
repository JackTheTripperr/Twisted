/**
 * Canvas renderer for TWISTED.
 * Draws into an offscreen "scene" at logical 1280x720, then composites to the
 * visible canvas with bloom, chromatic aberration, glitch slices, shake and
 * flashes. Everything modulates with the BeatInfo from the audio engine.
 */

import type { BeatInfo } from '../audio/engine';
import type { Zone } from '../game/levels';
import { MODIFIER_INFO } from '../game/levels';
import type { LevelGeometry, ModifierKind, Phase, Segment, Vec } from '../game/types';

export const W = 1280;
export const H = 720;
export const AREA = { x: 60, y: 92, w: 1160, h: 584 };
export const INTRO_T = 1.25;
export const DEATH_T = 2.0;
export const CLEAR_T = 1.35;

export interface GameView {
  phase: Phase;
  phaseT: number;
  level: number;
  zone: Zone;
  geo: LevelGeometry | null;
  cursor: { x: number; y: number; r: number };
  vel: Vec;
  modifier: { kind: ModifierKind; state: 'warn' | 'active'; progress: number } | null;
  deathPos: Vec | null;
  hasMoved: boolean;
  near: { seg: Segment; d: number }[];
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
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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

  private particles: Particle[] = [];
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

  private geo: LevelGeometry | null = null;
  private zone: Zone | null = null;
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
    this.setDpr(Math.min(2, window.devicePixelRatio || 1));
    // seeded starfield
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
    if (this.geo && this.zone) this.buildCache(this.geo, this.zone);
  }

  // ------------------------------------------------------------------ level cache

  setLevel(geo: LevelGeometry, zone: Zone) {
    this.geo = geo;
    this.zone = zone;
    this.trail.length = 0;
    this.rings.length = 0;
    const corners = [
      [geo.ox, geo.oy],
      [geo.ox + geo.w, geo.oy],
      [geo.ox, geo.oy + geo.h],
      [geo.ox + geo.w, geo.oy + geo.h],
    ];
    this.maxReveal = Math.max(...corners.map(([x, y]) => Math.hypot(x - geo.start.x, y - geo.start.y)));
    this.buildCache(geo, zone);
  }

  private strokeSegs(g: CanvasRenderingContext2D, segs: Segment[], teeth: boolean) {
    g.beginPath();
    for (const s of segs) {
      if (!!s.tooth !== teeth) continue;
      g.moveTo(s.x1, s.y1);
      g.lineTo(s.x2, s.y2);
    }
    g.stroke();
  }

  private buildCache(geo: LevelGeometry, zone: Zone) {
    const wallT = geo.segs.length ? geo.segs[0].ht * 2 : 8;
    const passes: { c: HTMLCanvasElement; fn: (g: CanvasRenderingContext2D) => void }[] = [
      {
        c: this.glow,
        fn: (g) => {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const [teeth, color] of [
            [false, zone.primary],
            [true, zone.secondary],
          ] as [boolean, string][]) {
            g.shadowBlur = 0;
            g.strokeStyle = color;
            g.globalAlpha = 0.16;
            g.lineWidth = wallT * 4.2;
            this.strokeSegs(g, geo.segs, teeth);
            g.globalAlpha = 0.32;
            g.lineWidth = wallT * 2.3;
            this.strokeSegs(g, geo.segs, teeth);
            g.shadowColor = color;
            g.shadowBlur = 18 * this.dpr;
            g.globalAlpha = 0.95;
            g.lineWidth = wallT;
            this.strokeSegs(g, geo.segs, teeth);
          }
        },
      },
      {
        c: this.core,
        fn: (g) => {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const [teeth, color] of [
            [false, zone.primary],
            [true, zone.secondary],
          ] as [boolean, string][]) {
            g.strokeStyle = color;
            g.globalAlpha = 1;
            g.lineWidth = wallT;
            this.strokeSegs(g, geo.segs, teeth);
            g.strokeStyle = 'rgba(255,255,255,0.9)';
            g.lineWidth = Math.max(1.5, wallT * 0.38);
            this.strokeSegs(g, geo.segs, teeth);
          }
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

  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }
  glitch(a: number) {
    this.glitchAmt = Math.max(this.glitchAmt, a);
  }
  flash(color: string, a: number) {
    this.flashColor = color;
    this.flashAmt = Math.max(this.flashAmt, a);
  }
  chroma(a: number) {
    this.aberr = Math.max(this.aberr, a);
  }
  ring(x: number, y: number, color: string, speed = 260, width = 3, max = 240) {
    this.rings.push({ x, y, t0: this.time, color, speed, width, max });
  }

  explode(x: number, y: number, colors: string[], count = 150) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 520;
      const shape = Math.random() < 0.3 ? 'line' : Math.random() < 0.5 ? 'square' : 'dot';
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 1.1,
        max: 0,
        size: 1.5 + Math.random() * 3.5,
        color: colors[(Math.random() * colors.length) | 0],
        g: 260,
        drag: 1.4,
        shape,
      });
      this.particles[this.particles.length - 1].max = this.particles[this.particles.length - 1].life;
    }
  }

  burst(x: number, y: number, colors: string[], count = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 380;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0.8 + Math.random() * 1.2,
        max: 0,
        size: 2 + Math.random() * 3,
        color: colors[(Math.random() * colors.length) | 0],
        g: 380,
        drag: 1.1,
        shape: Math.random() < 0.5 ? 'square' : 'dot',
      });
      this.particles[this.particles.length - 1].max = this.particles[this.particles.length - 1].life;
    }
  }

  private sparks(x: number, y: number, vx: number, vy: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp - vx * 0.3,
        vy: Math.sin(a) * sp - vy * 0.3,
        life: 0.25 + Math.random() * 0.35,
        max: 0.6,
        size: 0.8 + Math.random() * 1.6,
        color,
        g: 0,
        drag: 2,
        shape: 'dot',
      });
    }
  }

  // ------------------------------------------------------------------ frame

  frame(view: GameView, beat: BeatInfo, dt: number) {
    this.time += dt;
    const g = this.sctx;
    const zone = view.zone;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // beat-edge events
    if (beat.bar !== this.lastBar) {
      this.lastBar = beat.bar;
      if (view.geo && (view.phase === 'playing' || view.phase === 'title')) {
        this.ring(view.geo.exit.x, view.geo.exit.y, zone.secondary, 180, 2, 150);
      }
    }
    if (beat.step !== this.lastStep) {
      this.lastStep = beat.step;
      if (beat.step === 4 || beat.step === 12) this.aberr = Math.max(this.aberr, 1.6 * beat.intensity + 0.4);
    }

    this.drawBackground(g, view, beat, dt);
    if (view.geo) {
      this.drawFrame(g, view, beat);
      this.drawWalls(g, view, beat);
      this.drawExit(g, view, beat);
      this.drawStart(g, view, beat);
      this.drawRings(g);
      this.drawTrail(g, view, beat);
      this.drawCursor(g, view, beat);
    }
    this.updateParticles(g, dt);
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

    // stars
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 2.2 + s.p));
      g.globalAlpha = (0.25 + beat.hat * 0.5) * tw;
      g.fillStyle = '#ffffff';
      g.fillRect(s.x, s.y, s.s, s.s);
    }
    g.restore();

    // sun
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
    // stripes cut out of the sun (scrolling)
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

    // perspective floor + ceiling grid
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
    // horizon line
    g.globalAlpha = 0.35 + kick * 0.5;
    g.lineWidth = 2;
    g.strokeStyle = zone.secondary;
    g.beginPath();
    g.moveTo(0, horizon);
    g.lineTo(W, horizon);
    g.stroke();
    g.restore();

    // ambient motes
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
    const geo = view.geo!;
    const zone = view.zone;
    const pad = 16;
    const x = geo.ox - pad;
    const y = geo.oy - pad;
    const w = geo.w + pad * 2;
    const h = geo.h + pad * 2;
    g.save();
    g.fillStyle = 'rgba(4,2,16,0.86)';
    this.roundRect(g, x, y, w, h, 10);
    g.fill();
    // subtle cell-corner dots inside the maze
    g.fillStyle = rgba(zone.primary, 0.12);
    for (let cy = 1; cy < geo.rows; cy++) {
      for (let cx = 1; cx < geo.cols; cx++) {
        g.fillRect(geo.ox + cx * geo.cell - 0.5, geo.oy + cy * geo.cell - 0.5, 1, 1);
      }
    }
    // frame glow
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 8;
    g.strokeStyle = rgba(zone.primary, 0.08 + beat.kick * 0.14);
    this.roundRect(g, x, y, w, h, 10);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = rgba(zone.primary, 0.35 + beat.kick * 0.45);
    this.roundRect(g, x, y, w, h, 10);
    g.stroke();
    // bar sweep: a scanning line that crosses the maze once per bar
    const sx = geo.ox + geo.w * beat.barPhase;
    const sweep = g.createLinearGradient(sx - 60, 0, sx, 0);
    sweep.addColorStop(0, rgba(zone.primary, 0));
    sweep.addColorStop(1, rgba(zone.primary, 0.12 + beat.intensity * 0.08));
    g.fillStyle = sweep;
    g.fillRect(sx - 60, geo.oy, 60, geo.h);
    g.restore();
  }

  private drawWalls(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const geo = view.geo!;
    const zone = view.zone;
    const glowA = 0.5 + beat.kick * 0.5;
    const reveal = view.phase === 'intro' ? clamp01(view.phaseT / (INTRO_T * 0.85)) : 1;
    const revealR = reveal * this.maxReveal * 1.05;
    g.save();
    if (reveal < 1) {
      g.beginPath();
      g.arc(geo.start.x, geo.start.y, revealR, 0, Math.PI * 2);
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
      g.arc(geo.start.x, geo.start.y, revealR, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    // danger highlight on nearby walls
    if (view.near.length && (view.phase === 'playing' || view.phase === 'dying')) {
      g.save();
      g.lineCap = 'round';
      g.globalCompositeOperation = 'lighter';
      for (const n of view.near) {
        const warnDist = 30;
        const a = clamp01(1 - n.d / warnDist);
        if (a <= 0) continue;
        const wallT = n.seg.ht * 2;
        g.strokeStyle = '#ff2d55';
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

  private drawExit(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const geo = view.geo!;
    const zone = view.zone;
    const { x, y } = geo.exit;
    const R = geo.exitR;
    const kick = beat.kick;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(x, y, 0, x, y, R * 3.2);
    halo.addColorStop(0, rgba(zone.secondary, 0.55 + kick * 0.3));
    halo.addColorStop(0.35, rgba(zone.secondary, 0.18));
    halo.addColorStop(1, rgba(zone.secondary, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, R * 3.2, 0, Math.PI * 2);
    g.fill();
    // rotating dashed ring
    g.strokeStyle = zone.secondary;
    g.lineWidth = 2;
    g.setLineDash([R * 0.5, R * 0.35]);
    g.lineDashOffset = -this.time * 60;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(x, y, R * 1.25 + kick * 3, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // spokes
    g.globalAlpha = 0.35 + kick * 0.3;
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = this.time * 1.4 + (i * Math.PI) / 3;
      g.moveTo(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5);
      g.lineTo(x + Math.cos(a) * R * 1.05, y + Math.sin(a) * R * 1.05);
    }
    g.stroke();
    // core
    const core = g.createRadialGradient(x, y, 0, x, y, R * 0.7 * (1 + kick * 0.2));
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, zone.secondary);
    core.addColorStop(1, rgba(zone.secondary, 0));
    g.globalAlpha = 1;
    g.fillStyle = core;
    g.beginPath();
    g.arc(x, y, R * 0.7 * (1 + kick * 0.2), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawStart(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const geo = view.geo!;
    const zone = view.zone;
    const d = Math.hypot(view.cursor.x - geo.start.x, view.cursor.y - geo.start.y);
    const a = clamp01(1 - d / (geo.cell * 1.5)) * 0.8;
    if (a <= 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * (0.6 + beat.kick * 0.4);
    g.strokeStyle = zone.primary;
    g.lineWidth = 1.5;
    const r = Math.min(geo.cell * 0.36, 40);
    g.beginPath();
    g.arc(geo.start.x, geo.start.y, r, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = a * 0.5;
    g.beginPath();
    g.arc(geo.start.x, geo.start.y, r * 0.6 + beat.kick * 4, 0, Math.PI * 2);
    g.stroke();
    g.restore();
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
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  private drawTrail(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    const zone = view.zone;
    const c = view.cursor;
    if (view.phase === 'playing' || view.phase === 'title') {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - c.x, last.y - c.y) > 0.5) this.trail.push({ x: c.x, y: c.y, t: this.time });
      const speed = Math.hypot(view.vel.x, view.vel.y);
      if (speed > 1.5 && view.phase === 'playing') {
        this.sparks(c.x, c.y, view.vel.x, view.vel.y, Math.random() < 0.7 ? zone.primary : zone.accent, Math.min(4, speed * 0.25));
      }
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
    void beat;
  }

  private drawCursor(g: CanvasRenderingContext2D, view: GameView, beat: BeatInfo) {
    if (view.phase === 'dying' || view.phase === 'won' || view.phase === 'clear') return;
    const zone = view.zone;
    const { x, y, r } = view.cursor;
    const kick = beat.kick;
    const mod = view.modifier;
    const active = mod && mod.state === 'active' ? mod.kind : null;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // halo
    const hr = r * 4.6 * (1 + kick * 0.45);
    const halo = g.createRadialGradient(x, y, 0, x, y, hr);
    halo.addColorStop(0, rgba(zone.primary, 0.55));
    halo.addColorStop(0.4, rgba(zone.primary, 0.16));
    halo.addColorStop(1, rgba(zone.primary, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, hr, 0, Math.PI * 2);
    g.fill();
    // turbo streaks
    if (active === 'TURBO') {
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
    // modifier ring
    if (mod) {
      const col = MODIFIER_INFO[mod.kind].color;
      const rr = r + 7 + (mod.state === 'warn' ? Math.sin(this.time * 30) * 2 : 3);
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash(mod.state === 'warn' ? [3, 5] : [6, 4]);
      g.lineDashOffset = -this.time * (mod.kind === 'SPIN' ? 150 : 50);
      g.globalAlpha = mod.state === 'warn' ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 12)) : 0.95;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      if (mod.state === 'active') {
        // countdown arc
        g.globalAlpha = 0.9;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, rr + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - mod.progress));
        g.stroke();
      }
    }
    // body
    g.globalAlpha = 1;
    g.fillStyle = zone.primary;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, Math.PI * 2);
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
        g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
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
    const mod = view.modifier;
    let target = 0;
    if (mod && mod.kind === 'BLACKOUT') target = mod.state === 'active' ? 1 : 0.35;
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

    // bloom
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

    // glitch slices
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

    // decay
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
