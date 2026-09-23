/**
 * Obstacle catalog for TWISTED.
 * Every obstacle is a plain definition; each simulation step it is evaluated
 * (mostly analytically, from the level-relative beat clock) into collision
 * primitives: capsules (Segment), discs, gapped rings and solid blocks.
 * Stateful kinds (seeker, crush, turret, mine, boss) integrate per step.
 * Rendering reads the same runtime object.
 */

import { distToSegment, rayVsSegment } from './maze';
import type { Disc, Rect, Segment, Vec } from './types';

export interface Clock {
  /** beats since the level started */
  beat: number;
  /** bars since the level started */
  bars: number;
  /** seconds for this step (already time-dilated) */
  dt: number;
  /** kick energy 0..1 */
  kick: number;
}

export const PLAY_AREA = { x: 60, y: 92, w: 1160, h: 584 };

// ----------------------------------------------------------------- geometry helpers

export const v = (x: number, y: number): Vec => ({ x, y });

export function seg(x1: number, y1: number, x2: number, y2: number, ht = 4, tooth = false): Segment {
  return { x1, y1, x2, y2, ht, tooth };
}

export function line(pts: Vec[], ht = 4): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < pts.length; i++) out.push(seg(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, ht));
  return out;
}

/** Closed outline of a rectangle. */
export function box(x: number, y: number, w: number, h: number, ht = 4): Segment[] {
  return line([v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h), v(x, y)], ht);
}

export function rectPoly(x: number, y: number, w: number, h: number): Vec[] {
  return [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)];
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function inRect(p: Vec, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function offsetPolyline(pts: Vec[], d: number): Vec[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const dirs: Vec[] = [];
  const norms: Vec[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    dirs.push(v(dx / len, dy / len));
    norms.push(v(-dy / len, dx / len));
  }
  const out: Vec[] = [v(pts[0].x + norms[0].x * d, pts[0].y + norms[0].y * d)];
  for (let i = 1; i < n - 1; i++) {
    const p0 = v(pts[i - 1].x + norms[i - 1].x * d, pts[i - 1].y + norms[i - 1].y * d);
    const p1 = v(pts[i].x + norms[i].x * d, pts[i].y + norms[i].y * d);
    const d0 = dirs[i - 1];
    const d1 = dirs[i];
    const den = d0.x * d1.y - d0.y * d1.x;
    if (Math.abs(den) < 1e-6) {
      out.push(p1);
      continue;
    }
    const t = ((p1.x - p0.x) * d1.y - (p1.y - p0.y) * d1.x) / den;
    out.push(v(p0.x + d0.x * t, p0.y + d0.y * t));
  }
  out.push(v(pts[n - 1].x + norms[n - 2].x * d, pts[n - 1].y + norms[n - 2].y * d));
  return out;
}

/** Two offset walls around a centreline polyline. */
export function corridor(pts: Vec[], width: number, ht = 4): Segment[] {
  const half = width / 2;
  return [...line(offsetPolyline(pts, half), ht), ...line(offsetPolyline(pts, -half), ht)];
}

/** Arc-length parameterisation helpers for crush walls. */
export function polylineLengths(pts: Vec[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return acc;
}

export function pointAlong(pts: Vec[], lens: number[], s: number): { p: Vec; dir: Vec } {
  const total = lens[lens.length - 1];
  const d = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i++;
  const l0 = lens[i - 1];
  const l1 = lens[i];
  const t = l1 > l0 ? (d - l0) / (l1 - l0) : 0;
  const a = pts[i - 1];
  const b = pts[i];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { p: v(a.x + dx * t, a.y + dy * t), dir: v(dx / len, dy / len) };
}

/** Arc-length of the nearest point on the polyline to p, and the distance to it. */
export function projectOnto(pts: Vec[], lens: number[], p: Vec): { s: number; dist: number } {
  let best = Infinity;
  let bs = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best) {
      best = d;
      bs = lens[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return { s: bs, dist: best };
}

// ----------------------------------------------------------------- definitions

export interface PistonDef {
  kind: 'piston';
  base: Vec;
  dir: Vec;
  length: number;
  travel: number;
  period: number;
  phase?: number;
  t?: number;
}
export interface SliderDef {
  kind: 'slider';
  a: Vec;
  b: Vec;
  len: number;
  angle: number;
  period: number;
  phase?: number;
  t?: number;
}
export interface SpinnerDef {
  kind: 'spinner';
  pivot: Vec;
  arms: number;
  radius: number;
  speed: number;
  phase?: number;
  inner?: number;
  hub?: number;
  t?: number;
}
export interface OrbitDef {
  kind: 'orbit';
  center: Vec;
  radius: number;
  balls: number;
  ballR: number;
  speed: number;
  phase?: number;
  core?: number;
}
export interface DoorDef {
  kind: 'door';
  a: Vec;
  b: Vec;
  period: number;
  openFrac: number;
  phase?: number;
  t?: number;
}
export interface SweeperDef {
  kind: 'sweeper';
  pivot: Vec;
  length: number;
  speed: number;
  a0?: number;
  a1?: number;
  phase?: number;
  t?: number;
}
export interface PulserDef {
  kind: 'pulser';
  center: Vec;
  period: number;
  speed: number;
  maxR: number;
  gaps: number;
  gapWidth: number;
  spin: number;
  gapPhase?: number;
  core?: number;
  t?: number;
  phase?: number;
}
export interface CrushDef {
  kind: 'crush';
  path: Vec[];
  width: number;
  speed: number;
  delay: number;
}
export interface SeekerDef {
  kind: 'seeker';
  spawn: Vec;
  trigger: Rect;
  vmax: number;
  accel: number;
  leash?: Rect;
  r?: number;
  /** seconds before it burns out (default: never) */
  life?: number;
  /** re-arm after burning out, in beats (default: never) */
  respawn?: number;
}
export interface WellDef {
  kind: 'well';
  center: Vec;
  radius: number;
  pull: number;
  coreR: number;
}
export interface SpiralDef {
  kind: 'spiral';
  center: Vec;
  a: number;
  b: number;
  turns: number;
  spin: number;
  phase?: number;
  t?: number;
  mirror?: boolean;
}
export interface BreatherDef {
  kind: 'breather';
  pts: Vec[];
  width: number;
  amp: number;
  t?: number;
}
export interface BouncerDef {
  kind: 'bouncer';
  rect: Rect;
  balls: { r: number; vx: number; vy: number; x0: number; y0: number }[];
}
/** Fires aimed bolts at the player every `period` beats. Bolts die on walls. */
export interface TurretDef {
  kind: 'turret';
  pos: Vec;
  period: number;
  /** px/s */
  speed: number;
  phase?: number;
  /** number of bolts in a fan (odd) */
  spread?: number;
  r?: number;
}
export interface GridBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  group: number;
}
/** Laser beams that cycle through groups on the beat. */
export interface LaserGridDef {
  kind: 'lasergrid';
  beams: GridBeam[];
  groups: number;
  period: number;
  phase?: number;
  t?: number;
}
/** A region that pushes the cursor (px/s). */
export interface CurrentDef {
  kind: 'current';
  rect: Rect;
  vx: number;
  vy: number;
}
/** Proximity mine: arms when approached, detonates into a deadly ring. */
export interface MineDef {
  kind: 'mine';
  pos: Vec;
  trigger: number;
  blastR: number;
  fuse?: number;
}
/** A chain of discs snaking along a line. */
export interface SerpentDef {
  kind: 'serpent';
  from: Vec;
  to: Vec;
  amp: number;
  wavelength: number;
  /** px per beat */
  speed: number;
  segments: number;
  segR: number;
  spacing: number;
  phase?: number;
}
export interface PendulumDef {
  kind: 'pendulum';
  pivot: Vec;
  length: number;
  /** degrees */
  amp: number;
  period: number;
  phase?: number;
  t?: number;
  bob?: number;
}
/** A solid block that phases in and out. */
export interface ShutterDef {
  kind: 'shutter';
  rect: Rect;
  period: number;
  openFrac: number;
  phase?: number;
}
/** Walls of a box that close in over time. */
export interface ShrinkDef {
  kind: 'shrink';
  rect: Rect;
  minW: number;
  minH: number;
  duration: number;
  delay: number;
  t?: number;
}
/** The Warden. Sits in a box, launches everything, drops a roaming spiral with its weak point at the centre. */
export interface BossDef {
  kind: 'boss';
  box: Rect;
  hp: number;
  tier: 1 | 2;
}

export type ObstacleDef =
  | PistonDef
  | SliderDef
  | SpinnerDef
  | OrbitDef
  | DoorDef
  | SweeperDef
  | PulserDef
  | CrushDef
  | SeekerDef
  | WellDef
  | SpiralDef
  | BreatherDef
  | BouncerDef
  | TurretDef
  | LaserGridDef
  | CurrentDef
  | MineDef
  | SerpentDef
  | PendulumDef
  | ShutterDef
  | ShrinkDef
  | BossDef;

// ----------------------------------------------------------------- runtime

export interface Ring {
  x: number;
  y: number;
  R: number;
  gapA: number;
  gaps: number;
  gapHalf: number;
  ht: number;
}

export interface Proj {
  kind: 'bolt' | 'bar' | 'seeker';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  len: number;
  trail: Vec[];
}

export interface BossState {
  hp: number;
  maxHp: number;
  phase: number;
  dead: boolean;
  deadT: number;
  hitT: number;
  phaseStartBeat: number;
  projectiles: Proj[];
  spiral: { cx: number; cy: number; rot: number; t: number; alive: boolean; born: number } | null;
  pickup: Vec | null;
  boxX: number;
  origin: Vec;
  laserAngle: number;
  lastBolt: number;
  lastBar: number;
  lastRing: number;
  lastSeeker: number;
  blackout: number;
  wantPhantom: boolean;
  eye: number;
}

export interface Obstacle {
  def: ObstacleDef;
  caps: Segment[];
  discs: Disc[];
  rings: Ring[];
  blocks: Rect[];
  angle: number;
  ext: number;
  doorState: 'open' | 'warn' | 'closed';
  beamLen: number;
  front: number;
  frontPos: Vec;
  frontDir: Vec;
  lens: number[];
  pos: Vec;
  vel: Vec;
  alive: boolean;
  spawned: boolean;
  fade: number;
  trail: Vec[];
  sides: Vec[][];
  balls: Vec[];
  // turret
  projectiles: Proj[];
  charge: number;
  lastFire: number;
  aim: Vec;
  // laser grid
  beamState: ('on' | 'warn' | 'off')[];
  // mine
  mineState: 'idle' | 'armed' | 'blast' | 'spent';
  fuse: number;
  blast: number;
  // shrink
  curRect: Rect;
  // seeker burnout
  burnT: number;
  respawnBeat: number;
  boss: BossState | null;
}

export function createObstacle(def: ObstacleDef): Obstacle {
  const o: Obstacle = {
    def,
    caps: [],
    discs: [],
    rings: [],
    blocks: [],
    angle: 0,
    ext: 0,
    doorState: 'open',
    beamLen: 0,
    front: 0,
    frontPos: v(0, 0),
    frontDir: v(1, 0),
    lens: def.kind === 'crush' ? polylineLengths(def.path) : [],
    pos: def.kind === 'seeker' ? { ...def.spawn } : v(0, 0),
    vel: v(0, 0),
    alive: false,
    spawned: false,
    fade: 0,
    trail: [],
    sides: [],
    balls: [],
    projectiles: [],
    charge: 0,
    lastFire: -1,
    aim: v(0, 1),
    beamState: [],
    mineState: 'idle',
    fuse: 0,
    blast: 0,
    curRect: def.kind === 'shrink' ? { ...def.rect } : rect(0, 0, 0, 0),
    burnT: 0,
    respawnBeat: -1,
    boss: null,
  };
  if (def.kind === 'boss') {
    o.boss = {
      hp: def.hp,
      maxHp: def.hp,
      phase: 1,
      dead: false,
      deadT: 0,
      hitT: 0,
      phaseStartBeat: 0,
      projectiles: [],
      spiral: null,
      pickup: null,
      boxX: def.box.x,
      origin: v(def.box.x + def.box.w / 2, def.box.y + def.box.h + 6),
      laserAngle: Math.PI / 2,
      lastBolt: -1,
      lastBar: -1,
      lastRing: -1,
      lastSeeker: -1,
      blackout: 0,
      wantPhantom: false,
      eye: 0,
    };
  }
  return o;
}

const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
const cap = (a: Vec, b: Vec, ht: number): Segment => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, ht, tooth: true });

function punch(f: number): number {
  if (f < 0.15) return Math.sin((f / 0.15) * (Math.PI / 2));
  if (f < 0.45) return 1;
  const r = (f - 0.45) / 0.55;
  return 1 - r * r * (3 - 2 * r);
}

function tri(p: number, range: number): number {
  const m = ((p % (2 * range)) + 2 * range) % (2 * range);
  return m < range ? m : 2 * range - m;
}

function outOfPlay(x: number, y: number, m = 40): boolean {
  return x < PLAY_AREA.x - m || x > PLAY_AREA.x + PLAY_AREA.w + m || y < PLAY_AREA.y - m || y > PLAY_AREA.y + PLAY_AREA.h + m;
}

function hitsWall(x: number, y: number, r: number, walls: Segment[]): boolean {
  for (const w of walls) if (distToSegment(x, y, w) < w.ht + r) return true;
  return false;
}

export interface SimContext {
  cursor: Vec;
  cursorR: number;
  walls: Segment[];
  /** true while collisions are live (seekers only spawn then) */
  live: boolean;
}

function spiralCaps(out: Segment[], center: Vec, a: number, b: number, turns: number, rot: number, ht: number, sgn = 1) {
  const thetaMax = TAU * turns;
  const step = 0.14;
  let prev: Vec | null = null;
  for (let th = 0; th <= thetaMax + 1e-6; th += step) {
    const r = a + b * th;
    const p = v(center.x + Math.cos(sgn * th + rot) * r, center.y + Math.sin(sgn * th + rot) * r);
    if (prev) out.push(cap(prev, p, ht));
    prev = p;
  }
}

function stepProjectiles(list: Proj[], c: Clock, ctx: SimContext, caps: Segment[], discs: Disc[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= c.dt;
    if (p.kind === 'seeker') {
      const dx = ctx.cursor.x - p.x;
      const dy = ctx.cursor.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const vmax = Math.hypot(p.vx, p.vy) || 150;
      const k = Math.min(1, c.dt * 3);
      p.vx += ((dx / len) * vmax - p.vx) * k;
      p.vy += ((dy / len) * vmax - p.vy) * k;
    }
    p.x += p.vx * c.dt;
    p.y += p.vy * c.dt;
    p.trail.push(v(p.x, p.y));
    if (p.trail.length > 8) p.trail.shift();
    let dead = p.life <= 0 || outOfPlay(p.x, p.y, 60);
    if (!dead && p.kind === 'bolt' && hitsWall(p.x, p.y, p.r, ctx.walls)) dead = true;
    if (dead) {
      list.splice(i, 1);
      continue;
    }
    if (p.kind === 'bar') caps.push(cap(v(p.x - p.len, p.y), v(p.x + p.len, p.y), p.r));
    else discs.push({ x: p.x, y: p.y, r: p.r });
  }
}

export function updateObstacle(o: Obstacle, c: Clock, ctx: SimContext) {
  const d = o.def;
  o.caps.length = 0;
  o.discs.length = 0;
  o.rings.length = 0;
  o.blocks.length = 0;
  switch (d.kind) {
    case 'piston': {
      const f = frac(c.beat / d.period + (d.phase ?? 0));
      o.ext = punch(f);
      const L = d.length + d.travel * o.ext;
      o.caps.push(cap(d.base, v(d.base.x + d.dir.x * L, d.base.y + d.dir.y * L), (d.t ?? 12) / 2));
      break;
    }
    case 'slider': {
      const s = 0.5 - 0.5 * Math.cos(TAU * (c.beat / d.period + (d.phase ?? 0)));
      const cx = d.a.x + (d.b.x - d.a.x) * s;
      const cy = d.a.y + (d.b.y - d.a.y) * s;
      const ang = (d.angle * Math.PI) / 180;
      const ux = Math.cos(ang) * d.len * 0.5;
      const uy = Math.sin(ang) * d.len * 0.5;
      o.ext = s;
      o.caps.push(cap(v(cx - ux, cy - uy), v(cx + ux, cy + uy), (d.t ?? 12) / 2));
      break;
    }
    case 'spinner': {
      o.angle = TAU * (d.speed * c.bars + (d.phase ?? 0));
      const inner = d.inner ?? 0;
      for (let k = 0; k < d.arms; k++) {
        const a = o.angle + (TAU * k) / d.arms;
        const cx = Math.cos(a);
        const sy = Math.sin(a);
        o.caps.push(cap(v(d.pivot.x + cx * inner, d.pivot.y + sy * inner), v(d.pivot.x + cx * d.radius, d.pivot.y + sy * d.radius), (d.t ?? 10) / 2));
      }
      if (d.hub) o.discs.push({ x: d.pivot.x, y: d.pivot.y, r: d.hub });
      break;
    }
    case 'orbit': {
      o.angle = TAU * (d.speed * c.bars + (d.phase ?? 0));
      for (let k = 0; k < d.balls; k++) {
        const a = o.angle + (TAU * k) / d.balls;
        o.discs.push({ x: d.center.x + Math.cos(a) * d.radius, y: d.center.y + Math.sin(a) * d.radius, r: d.ballR });
      }
      if (d.core) o.discs.push({ x: d.center.x, y: d.center.y, r: d.core });
      break;
    }
    case 'door': {
      const f = frac(c.beat / d.period + (d.phase ?? 0));
      const warnFrom = d.openFrac - 1 / d.period;
      o.doorState = f >= d.openFrac ? 'closed' : f >= warnFrom ? 'warn' : 'open';
      if (o.doorState === 'closed') o.caps.push(cap(d.a, d.b, (d.t ?? 10) / 2));
      break;
    }
    case 'sweeper': {
      if (d.a0 !== undefined && d.a1 !== undefined) {
        const s = 0.5 - 0.5 * Math.cos(TAU * (d.speed * c.bars + (d.phase ?? 0)));
        o.angle = ((d.a0 + (d.a1 - d.a0) * s) * Math.PI) / 180;
      } else {
        o.angle = TAU * (d.speed * c.bars + (d.phase ?? 0));
      }
      const dx = Math.cos(o.angle);
      const dy = Math.sin(o.angle);
      let len = d.length;
      for (const w of ctx.walls) {
        const t = rayVsSegment(d.pivot.x, d.pivot.y, dx, dy, w);
        if (t > 2 && t < len) len = t;
      }
      o.beamLen = len;
      o.caps.push(cap(d.pivot, v(d.pivot.x + dx * len, d.pivot.y + dy * len), (d.t ?? 6) / 2));
      break;
    }
    case 'pulser': {
      const b = c.beat - (d.phase ?? 0);
      const gapA = ((d.spin * c.beat + (d.gapPhase ?? 0)) * Math.PI) / 180;
      const gapHalf = ((d.gapWidth / 2) * Math.PI) / 180;
      for (let k = Math.floor(b / d.period); k >= 0; k--) {
        const R = (b - k * d.period) * d.speed;
        if (R >= d.maxR) break;
        if (R > 0) o.rings.push({ x: d.center.x, y: d.center.y, R, gapA, gaps: d.gaps, gapHalf, ht: (d.t ?? 8) / 2 });
      }
      if (d.core) o.discs.push({ x: d.center.x, y: d.center.y, r: d.core });
      break;
    }
    case 'crush': {
      o.front = Math.max(0, (c.beat - d.delay) * d.speed);
      const { p, dir } = pointAlong(d.path, o.lens, o.front);
      o.frontPos = p;
      o.frontDir = dir;
      break;
    }
    case 'seeker': {
      const r = d.r ?? 11;
      if (!o.spawned && ctx.live && inRect(ctx.cursor, d.trigger) && (o.respawnBeat < 0 || c.beat >= o.respawnBeat)) {
        o.spawned = true;
        o.alive = true;
        o.fade = 1;
        o.burnT = 0;
        o.pos = { ...d.spawn };
        o.vel = v(0, 0);
        o.trail.length = 0;
      }
      if (o.spawned) {
        if (o.alive && d.leash && inRect(ctx.cursor, d.leash)) o.alive = false;
        if (o.alive && d.life !== undefined) {
          o.burnT += c.dt;
          if (o.burnT >= d.life) {
            o.alive = false;
            if (d.respawn !== undefined) {
              o.respawnBeat = c.beat + d.respawn;
              o.spawned = false;
            }
          }
        }
        if (o.alive) {
          const dx = ctx.cursor.x - o.pos.x;
          const dy = ctx.cursor.y - o.pos.y;
          const len = Math.hypot(dx, dy) || 1;
          const wx = (dx / len) * d.vmax;
          const wy = (dy / len) * d.vmax;
          const k = Math.min(1, (c.dt * d.accel) / d.vmax);
          o.vel.x += (wx - o.vel.x) * k;
          o.vel.y += (wy - o.vel.y) * k;
          o.pos.x += o.vel.x * c.dt;
          o.pos.y += o.vel.y * c.dt;
          o.discs.push({ x: o.pos.x, y: o.pos.y, r });
        } else {
          o.fade = Math.max(0, o.fade - c.dt * 2);
        }
        o.trail.push({ ...o.pos });
        if (o.trail.length > 14) o.trail.shift();
      }
      break;
    }
    case 'well': {
      o.angle += c.dt * 1.4;
      o.discs.push({ x: d.center.x, y: d.center.y, r: d.coreR });
      break;
    }
    case 'spiral': {
      const rot = TAU * (d.spin * c.bars + (d.phase ?? 0));
      spiralCaps(o.caps, d.center, d.a, d.b, d.turns, rot, (d.t ?? 10) / 2, d.mirror ? -1 : 1);
      o.angle = rot;
      break;
    }
    case 'breather': {
      const half = d.width / 2 - d.amp * c.kick;
      const L = offsetPolyline(d.pts, half);
      const R = offsetPolyline(d.pts, -half);
      o.sides = [L, R];
      const ht = (d.t ?? 8) / 2;
      for (let i = 1; i < L.length; i++) o.caps.push(cap(L[i - 1], L[i], ht));
      for (let i = 1; i < R.length; i++) o.caps.push(cap(R[i - 1], R[i], ht));
      break;
    }
    case 'bouncer': {
      o.balls.length = 0;
      for (const b of d.balls) {
        const rw = d.rect.w - 2 * b.r;
        const rh = d.rect.h - 2 * b.r;
        const x = d.rect.x + b.r + tri(b.x0 - d.rect.x - b.r + b.vx * c.beat, rw);
        const y = d.rect.y + b.r + tri(b.y0 - d.rect.y - b.r + b.vy * c.beat, rh);
        o.balls.push(v(x, y));
        o.discs.push({ x, y, r: b.r });
      }
      break;
    }
    case 'turret': {
      const bb = c.beat + (d.phase ?? 0);
      const k = Math.floor(bb / d.period);
      const f = bb / d.period - k;
      o.charge = f > 0.6 ? (f - 0.6) / 0.4 : 0;
      const dx = ctx.cursor.x - d.pos.x;
      const dy = ctx.cursor.y - d.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      if (o.charge > 0 || o.lastFire < 0) o.aim = v(dx / len, dy / len);
      if (ctx.live && k > o.lastFire && c.beat > 0.5) {
        if (o.lastFire >= 0 || k >= 1) {
          const n = d.spread ?? 1;
          const base = Math.atan2(o.aim.y, o.aim.x);
          for (let i = 0; i < n; i++) {
            const a = base + ((i - (n - 1) / 2) * 14 * Math.PI) / 180;
            o.projectiles.push({ kind: 'bolt', x: d.pos.x + Math.cos(a) * 18, y: d.pos.y + Math.sin(a) * 18, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed, r: d.r ?? 7, life: 7, len: 0, trail: [] });
          }
        }
        o.lastFire = k;
      }
      stepProjectiles(o.projectiles, c, ctx, o.caps, o.discs);
      o.discs.push({ x: d.pos.x, y: d.pos.y, r: 13 });
      break;
    }
    case 'lasergrid': {
      const bb = c.beat / d.period + (d.phase ?? 0);
      const active = Math.floor(bb) % d.groups;
      const next = (active + 1) % d.groups;
      const warn = bb - Math.floor(bb) > 0.72;
      const ht = (d.t ?? 6) / 2;
      o.beamState.length = d.beams.length;
      d.beams.forEach((bm, i) => {
        if (bm.group === active) {
          o.beamState[i] = 'on';
          o.caps.push({ x1: bm.x1, y1: bm.y1, x2: bm.x2, y2: bm.y2, ht, tooth: true });
        } else o.beamState[i] = warn && bm.group === next ? 'warn' : 'off';
      });
      break;
    }
    case 'current':
      break;
    case 'mine': {
      const dist = Math.hypot(ctx.cursor.x - d.pos.x, ctx.cursor.y - d.pos.y);
      const fuse = d.fuse ?? 0.55;
      if (o.mineState === 'idle' && ctx.live && dist < d.trigger) {
        o.mineState = 'armed';
        o.fuse = fuse;
      }
      if (o.mineState === 'armed') {
        o.fuse -= c.dt;
        if (o.fuse <= 0) {
          o.mineState = 'blast';
          o.blast = 0;
        }
      }
      if (o.mineState === 'blast') {
        o.blast += c.dt / 0.55;
        if (o.blast >= 1) o.mineState = 'spent';
        else o.rings.push({ x: d.pos.x, y: d.pos.y, R: o.blast * d.blastR, gapA: 0, gaps: 0, gapHalf: 0, ht: 7 });
      }
      if (o.mineState !== 'spent') o.discs.push({ x: d.pos.x, y: d.pos.y, r: 7 });
      break;
    }
    case 'serpent': {
      const dx = d.to.x - d.from.x;
      const dy = d.to.y - d.from.y;
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L;
      const uy = dy / L;
      const nx = -uy;
      const ny = ux;
      const T = L + d.segments * d.spacing;
      const head = ((c.beat * d.speed + (d.phase ?? 0) * T) % T + T) % T;
      for (let i = 0; i < d.segments; i++) {
        const s = head - i * d.spacing;
        if (s < 0 || s > L) continue;
        const off = d.amp * Math.sin((TAU * s) / d.wavelength);
        o.discs.push({ x: d.from.x + ux * s + nx * off, y: d.from.y + uy * s + ny * off, r: d.segR });
      }
      break;
    }
    case 'pendulum': {
      const ang = Math.PI / 2 + ((d.amp * Math.PI) / 180) * Math.sin(TAU * (c.beat / d.period + (d.phase ?? 0)));
      o.angle = ang;
      const tip = v(d.pivot.x + Math.cos(ang) * d.length, d.pivot.y + Math.sin(ang) * d.length);
      o.caps.push(cap(d.pivot, tip, (d.t ?? 8) / 2));
      if (d.bob) o.discs.push({ x: tip.x, y: tip.y, r: d.bob });
      break;
    }
    case 'shutter': {
      const f = frac(c.beat / d.period + (d.phase ?? 0));
      const warnFrom = d.openFrac - 1 / d.period;
      o.doorState = f >= d.openFrac ? 'closed' : f >= warnFrom ? 'warn' : 'open';
      if (o.doorState === 'closed') {
        o.blocks.push(d.rect);
        const r = d.rect;
        o.caps.push(...box(r.x, r.y, r.w, r.h, 3).map((s) => ({ ...s, tooth: true })));
      }
      break;
    }
    case 'shrink': {
      const p = Math.max(0, Math.min(1, (c.beat - d.delay) / d.duration));
      const w = d.rect.w + (d.minW - d.rect.w) * p;
      const h = d.rect.h + (d.minH - d.rect.h) * p;
      const cx = d.rect.x + d.rect.w / 2;
      const cy = d.rect.y + d.rect.h / 2;
      o.curRect = rect(cx - w / 2, cy - h / 2, w, h);
      o.ext = p;
      o.caps.push(...box(o.curRect.x, o.curRect.y, w, h, (d.t ?? 8) / 2).map((s) => ({ ...s, tooth: true })));
      break;
    }
    case 'boss': {
      updateBoss(o, d, c, ctx);
      break;
    }
  }
}

// ----------------------------------------------------------------- boss

function updateBoss(o: Obstacle, d: BossDef, c: Clock, ctx: SimContext) {
  const b = o.boss!;
  b.eye += c.dt;
  // box (tier 2 slides along the top)
  b.boxX = d.box.x + (d.tier === 2 && !b.dead ? Math.sin(c.beat * 0.28) * 260 : 0);
  const bx = b.boxX;
  const by = d.box.y;
  b.origin = v(bx + d.box.w / 2, by + d.box.h + 6);
  o.caps.push(...box(bx, by, d.box.w, d.box.h, 5).map((s) => ({ ...s, tooth: true })));
  if (b.dead) {
    b.deadT += c.dt;
    b.projectiles.length = 0;
    b.spiral = null;
    b.pickup = null;
    b.blackout = Math.max(0, b.blackout - c.dt);
    return;
  }
  if (!ctx.live) return;
  const tier = d.tier;
  const ph = b.phase;
  const pb = c.beat - b.phaseStartBeat;
  const respite = b.hitT > 0;
  if (respite) b.hitT -= c.dt;

  // attack cadence per phase
  const boltEvery = tier === 1 ? [2, 1.5, 1][ph - 1] ?? 1 : [1.5, 1, 0.75, 0.5][ph - 1] ?? 0.5;
  const barEvery = 8;
  const ringEvery = 4;
  const seekEvery = 6;
  const boltSpeed = (tier === 1 ? 200 : 240) + 50 * ph;
  const fan = tier === 1 ? (ph >= 3 ? 3 : 1) : ph >= 2 ? 3 : 1;
  const wantRings = tier === 1 ? ph >= 2 : true;
  const wantSeekers = tier === 1 ? ph >= 3 : ph >= 2;
  const wantLaser = tier === 1 ? ph >= 2 : true;

  if (!respite && pb > 1) {
    const kb = Math.floor(pb / boltEvery);
    if (kb > b.lastBolt) {
      b.lastBolt = kb;
      const dx = ctx.cursor.x - b.origin.x;
      const dy = ctx.cursor.y - b.origin.y;
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < fan; i++) {
        const a = base + ((i - (fan - 1) / 2) * 13 * Math.PI) / 180;
        b.projectiles.push({ kind: 'bolt', x: b.origin.x, y: b.origin.y, vx: Math.cos(a) * boltSpeed, vy: Math.sin(a) * boltSpeed, r: 9, life: 6, len: 0, trail: [] });
      }
    }
    const kbar = Math.floor(pb / barEvery);
    if (kbar > b.lastBar && pb > 3) {
      b.lastBar = kbar;
      const speed = 150 + 30 * ph;
      const half = 55 + 12 * ph;
      const xs = ph >= 2 || tier === 2 ? [b.origin.x - 230, b.origin.x + 230] : [b.origin.x];
      for (const x of xs) b.projectiles.push({ kind: 'bar', x, y: b.origin.y, vx: 0, vy: speed, r: 6, life: 8, len: half, trail: [] });
    }
    if (wantSeekers) {
      const ks = Math.floor(pb / seekEvery);
      if (ks > b.lastSeeker && pb > 4) {
        b.lastSeeker = ks;
        const vmax = 120 + 20 * ph;
        b.projectiles.push({ kind: 'seeker', x: b.origin.x, y: b.origin.y, vx: 0, vy: vmax, r: 10, life: 6, len: 0, trail: [] });
      }
    }
  }
  // rings are derived analytically from their launch beats within the phase
  if (wantRings && !respite) {
    const ringSpeed = 170 + 30 * ph;
    for (let k = Math.floor(pb / ringEvery); k >= 0; k--) {
      const launch = k * ringEvery;
      if (launch <= 2) continue;
      const age = pb - launch;
      const R = age * (ringSpeed / 2.1);
      if (R <= 0) continue;
      if (R > 720) break;
      o.rings.push({ x: b.origin.x, y: b.origin.y, R, gapA: age * 0.6 + k, gaps: 3, gapHalf: 0.34, ht: 4 });
    }
  }
  stepProjectiles(b.projectiles, c, ctx, o.caps, o.discs);
  // laser
  if (wantLaser && !respite) {
    const s = 0.5 - 0.5 * Math.cos(TAU * (0.28 + 0.05 * ph) * c.bars);
    b.laserAngle = ((30 + 120 * s) * Math.PI) / 180;
    const len = 540;
    const beams = tier === 2 && ph >= 3 ? [b.laserAngle, Math.PI - b.laserAngle] : [b.laserAngle];
    for (const a of beams) o.caps.push(cap(b.origin, v(b.origin.x + Math.cos(a) * len, b.origin.y + Math.sin(a) * len), 3));
  }
  // the roaming spiral with the weak point at its centre
  if (!respite && !b.spiral && pb >= 6) {
    b.spiral = { cx: b.origin.x, cy: 430, rot: 0, t: 0, alive: true, born: c.beat };
  }
  if (b.spiral) {
    const sp = b.spiral;
    sp.t += c.dt;
    const drift = 0.22 + 0.05 * ph;
    sp.cx = 640 + 320 * Math.sin(sp.t * drift + 0.4);
    sp.cy = 430 + 120 * Math.sin(sp.t * drift * 1.6 + 1.1);
    sp.rot += c.dt * (1.5 + 0.35 * ph) * (tier === 2 ? 1.2 : 1);
    spiralCaps(o.caps, v(sp.cx, sp.cy), 22, 11, 2, sp.rot, 5);
    b.pickup = v(sp.cx, sp.cy);
  } else b.pickup = null;
  // tier 2 extras
  if (tier === 2) {
    const target = ph >= 3 ? 1 : 0;
    b.blackout += (target - b.blackout) * Math.min(1, c.dt * 2);
    b.wantPhantom = ph >= 4;
  }
}

/** The player grabbed the weak point. Returns true when the boss died. */
export function damageBoss(o: Obstacle, beat: number): boolean {
  const b = o.boss!;
  b.hp--;
  b.spiral = null;
  b.pickup = null;
  b.projectiles.length = 0;
  b.hitT = 2.2;
  b.lastBolt = -1;
  b.lastBar = -1;
  b.lastRing = -1;
  b.lastSeeker = -1;
  b.phaseStartBeat = beat + 2.2;
  if (b.hp <= 0) {
    b.dead = true;
    b.deadT = 0;
    return true;
  }
  b.phase++;
  return false;
}

// ----------------------------------------------------------------- collision

function ringHit(ring: Ring, px: number, py: number, r: number): boolean {
  const dx = px - ring.x;
  const dy = py - ring.y;
  const dist = Math.hypot(dx, dy);
  if (Math.abs(dist - ring.R) >= ring.ht + r) return false;
  if (ring.gaps <= 0) return true;
  const ang = Math.atan2(dy, dx);
  const angR = ring.R > 1 ? r / ring.R : 0;
  for (let i = 0; i < ring.gaps; i++) {
    const g = ring.gapA + (TAU * i) / ring.gaps;
    let da = Math.abs(((ang - g + Math.PI) % TAU) - Math.PI);
    if (da > Math.PI) da = TAU - da;
    if (da < ring.gapHalf - angR) return false;
  }
  return true;
}

/** Does the cursor circle hit this obstacle? */
export function hitsObstacle(o: Obstacle, px: number, py: number, r: number): boolean {
  for (const s of o.caps) if (distToSegment(px, py, s) < s.ht + r) return true;
  for (const d of o.discs) if (Math.hypot(px - d.x, py - d.y) < d.r + r) return true;
  for (const ring of o.rings) if (ringHit(ring, px, py, r)) return true;
  for (const b of o.blocks) if (px > b.x - r && px < b.x + b.w + r && py > b.y - r && py < b.y + b.h + r) return true;
  const d = o.def;
  if (d.kind === 'crush') {
    if (o.front <= 0) return false;
    const { s, dist } = projectOnto(d.path, o.lens, v(px, py));
    if (dist < d.width / 2 + 30 && s < o.front + r) return true;
  }
  return false;
}

/** Drift applied to the cursor by gravity wells and currents (px, already multiplied by dt). */
export function fieldPull(obs: Obstacle[], p: Vec, dt: number): Vec {
  const out = v(0, 0);
  for (const o of obs) {
    const d = o.def;
    if (d.kind === 'well') {
      const dx = d.center.x - p.x;
      const dy = d.center.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > d.radius || dist < 1) continue;
      const k = (d.pull * (1 - dist / d.radius) * dt) / dist;
      out.x += dx * k;
      out.y += dy * k;
    } else if (d.kind === 'current') {
      if (!inRect(p, d.rect)) continue;
      out.x += d.vx * dt;
      out.y += d.vy * dt;
    }
  }
  return out;
}

/** Distance from a point to the nearest dynamic capsule surface (for the danger highlight). */
export function nearDynamic(obs: Obstacle[], px: number, py: number, r: number, within: number): { seg: Segment; d: number }[] {
  const out: { seg: Segment; d: number }[] = [];
  for (const o of obs) {
    for (const s of o.caps) {
      const d = distToSegment(px, py, s) - s.ht - r;
      if (d < within) out.push({ seg: s, d: Math.max(0, d) });
    }
  }
  return out;
}

/** Nearest surface distance across discs and rings (for grazes). */
export function nearestSurface(obs: Obstacle[], px: number, py: number, r: number): number {
  let m = Infinity;
  for (const o of obs) {
    for (const d of o.discs) m = Math.min(m, Math.hypot(px - d.x, py - d.y) - d.r - r);
    for (const ring of o.rings) {
      const dist = Math.hypot(px - ring.x, py - ring.y);
      m = Math.min(m, Math.abs(dist - ring.R) - ring.ht - r);
    }
  }
  return m;
}
