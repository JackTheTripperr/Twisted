/**
 * Obstacle catalog for TWISTED.
 * Every obstacle is a plain definition; each simulation step it is evaluated
 * (mostly analytically, from the level-relative beat clock) into collision
 * primitives: capsules (Segment) and discs. Stateful kinds (seeker, crush)
 * integrate per step. Rendering reads the same runtime object.
 */

import { distToSegment, rayVsSegment } from './maze';
import type { Disc, Rect, Segment, Vec } from './types';

export interface Clock {
  /** beats since the level started */
  beat: number;
  /** bars since the level started */
  bars: number;
  /** seconds for this step */
  dt: number;
  /** kick energy 0..1 */
  kick: number;
}

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
  /** unit direction of extension */
  dir: Vec;
  /** retracted length */
  length: number;
  travel: number;
  /** beats per cycle */
  period: number;
  phase?: number;
  t?: number;
}
export interface SliderDef {
  kind: 'slider';
  a: Vec;
  b: Vec;
  len: number;
  /** bar orientation in degrees */
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
  /** turns per bar (negative = counter-clockwise) */
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
  /** fraction of the cycle the door is open */
  openFrac: number;
  phase?: number;
  t?: number;
}
export interface SweeperDef {
  kind: 'sweeper';
  pivot: Vec;
  length: number;
  /** turns per bar (full rotation) or oscillation cycles per bar when a0/a1 given */
  speed: number;
  a0?: number;
  a1?: number;
  phase?: number;
  t?: number;
}
export interface PulserDef {
  kind: 'pulser';
  center: Vec;
  /** beats between rings */
  period: number;
  /** px per beat */
  speed: number;
  maxR: number;
  gaps: number;
  /** degrees */
  gapWidth: number;
  /** degrees per beat */
  spin: number;
  /** degrees, initial gap rotation */
  gapPhase?: number;
  core?: number;
  t?: number;
  phase?: number;
}
export interface CrushDef {
  kind: 'crush';
  path: Vec[];
  width: number;
  /** px per beat */
  speed: number;
  /** beats before it starts */
  delay: number;
}
export interface SeekerDef {
  kind: 'seeker';
  spawn: Vec;
  trigger: Rect;
  /** px/s */
  vmax: number;
  /** px/s² */
  accel: number;
  leash?: Rect;
  r?: number;
}
export interface WellDef {
  kind: 'well';
  center: Vec;
  radius: number;
  /** drift speed (px/s) at the centre, fading to 0 at the radius */
  pull: number;
  coreR: number;
}
export interface SpiralDef {
  kind: 'spiral';
  center: Vec;
  a: number;
  b: number;
  turns: number;
  /** turns per bar */
  spin: number;
  phase?: number;
  t?: number;
  /** wind the other way (used by mirrored courses) */
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
  | BouncerDef;

// ----------------------------------------------------------------- runtime

export interface Ring {
  R: number;
  gapA: number;
}

export interface Obstacle {
  def: ObstacleDef;
  caps: Segment[];
  discs: Disc[];
  angle: number;
  ext: number;
  doorState: 'open' | 'warn' | 'closed';
  beamLen: number;
  rings: Ring[];
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
}

export function createObstacle(def: ObstacleDef): Obstacle {
  return {
    def,
    caps: [],
    discs: [],
    angle: 0,
    ext: 0,
    doorState: 'open',
    beamLen: 0,
    rings: [],
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
  };
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

export interface SimContext {
  cursor: Vec;
  cursorR: number;
  walls: Segment[];
  /** true while collisions are live (seekers only spawn then) */
  live: boolean;
}

export function updateObstacle(o: Obstacle, c: Clock, ctx: SimContext) {
  const d = o.def;
  o.caps.length = 0;
  o.discs.length = 0;
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
        o.caps.push(
          cap(
            v(d.pivot.x + cx * inner, d.pivot.y + sy * inner),
            v(d.pivot.x + cx * d.radius, d.pivot.y + sy * d.radius),
            (d.t ?? 10) / 2,
          ),
        );
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
      o.rings.length = 0;
      const b = c.beat - (d.phase ?? 0);
      const gapA = ((d.spin * c.beat + (d.gapPhase ?? 0)) * Math.PI) / 180;
      for (let k = Math.floor(b / d.period); k >= 0; k--) {
        const R = (b - k * d.period) * d.speed;
        if (R >= d.maxR) break;
        if (R > 0) o.rings.push({ R, gapA });
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
      if (!o.spawned && ctx.live && inRect(ctx.cursor, d.trigger)) {
        o.spawned = true;
        o.alive = true;
        o.fade = 1;
        o.pos = { ...d.spawn };
        o.vel = v(0, 0);
        o.trail.length = 0;
      }
      if (o.spawned) {
        if (o.alive && d.leash && inRect(ctx.cursor, d.leash)) o.alive = false;
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
      const thetaMax = TAU * d.turns;
      const step = 0.14;
      const sgn = d.mirror ? -1 : 1;
      let prev: Vec | null = null;
      for (let th = 0; th <= thetaMax + 1e-6; th += step) {
        const r = d.a + d.b * th;
        const p = v(d.center.x + Math.cos(sgn * th + rot) * r, d.center.y + Math.sin(sgn * th + rot) * r);
        if (prev) o.caps.push(cap(prev, p, (d.t ?? 10) / 2));
        prev = p;
      }
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
  }
}

/** Does the cursor circle hit this obstacle? */
export function hitsObstacle(o: Obstacle, px: number, py: number, r: number): boolean {
  for (const s of o.caps) if (distToSegment(px, py, s) < s.ht + r) return true;
  for (const d of o.discs) if (Math.hypot(px - d.x, py - d.y) < d.r + r) return true;
  const d = o.def;
  if (d.kind === 'pulser') {
    const dx = px - d.center.x;
    const dy = py - d.center.y;
    const dist = Math.hypot(dx, dy);
    const ht = (d.t ?? 8) / 2;
    const ang = Math.atan2(dy, dx);
    const gapHalf = ((d.gapWidth / 2) * Math.PI) / 180;
    for (const ring of o.rings) {
      if (Math.abs(dist - ring.R) >= ht + r) continue;
      // inside a gap?
      let safe = false;
      const angR = ring.R > 1 ? r / ring.R : 0;
      for (let i = 0; i < d.gaps; i++) {
        const g = ring.gapA + (TAU * i) / d.gaps;
        let da = Math.abs(((ang - g + Math.PI) % TAU) - Math.PI);
        if (da > Math.PI) da = TAU - da;
        if (da < gapHalf - angR) {
          safe = true;
          break;
        }
      }
      if (!safe) return true;
    }
  } else if (d.kind === 'crush') {
    const { s, dist } = projectOnto(d.path, o.lens, v(px, py));
    if (dist < d.width / 2 + 30 && s < o.front + r) return true;
  }
  return false;
}

/** Drift applied to the cursor by gravity wells (px, already multiplied by dt). */
export function wellPull(obs: Obstacle[], p: Vec, dt: number): Vec {
  const out = v(0, 0);
  for (const o of obs) {
    const d = o.def;
    if (d.kind !== 'well') continue;
    const dx = d.center.x - p.x;
    const dy = d.center.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > d.radius || dist < 1) continue;
    const k = (d.pull * (1 - dist / d.radius) * dt) / dist;
    out.x += dx * k;
    out.y += dy * k;
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
