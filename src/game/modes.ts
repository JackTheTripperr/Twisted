/**
 * Run modes and mutators: the daily plan, Overdrive, and course mirroring.
 */
import type { Course } from './courses';
import type { ObstacleDef } from './entities';
import { hashSeed, mulberry32 } from './rng';
import type { ModifierKind, Mutators, Rect, Segment, Vec, ZoneDef } from './types';

const MW = 1280;

export const NO_MUTATORS: Mutators = { mirror: false, tempo: 1, phantom: 1, gateOverride: null };
export const OVERDRIVE_MUTATORS: Mutators = { mirror: true, tempo: 1.12, phantom: 1.25, gateOverride: null };

const GATE_KINDS: ModifierKind[] = ['UNTWIST', 'TURBO', 'DRAG', 'SWELL', 'BLACKOUT', 'SPIN'];

export const DAILY_LENGTH = 8;

export function dailyPlan(key: string): { levels: number[]; mutators: Mutators } {
  const parts = key.split('-').map((s) => parseInt(s, 10) || 0);
  const rng = mulberry32(hashSeed(parts[0], parts[1], parts[2], 0x0da1));
  const pool = Array.from({ length: 18 }, (_, i) => i + 3);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const levels = pool.slice(0, DAILY_LENGTH).sort((a, b) => a - b);
  const mutators: Mutators = {
    mirror: rng() < 0.5,
    tempo: 1 + Math.floor(rng() * 4) * 0.04,
    phantom: 1 + Math.floor(rng() * 3) * 0.15,
    gateOverride: rng() < 0.25 ? GATE_KINDS[Math.floor(rng() * GATE_KINDS.length)] : null,
  };
  return { levels, mutators };
}

export function describeMutators(m: Mutators): string[] {
  const out: string[] = [];
  if (m.mirror) out.push('MIRRORED');
  if (m.tempo > 1) out.push(`TEMPO +${Math.round((m.tempo - 1) * 100)}%`);
  if (m.phantom > 1) out.push(`PHANTOMS +${Math.round((m.phantom - 1) * 100)}%`);
  if (m.gateOverride) out.push(`ALL GATES ${m.gateOverride}`);
  if (!out.length) out.push('STANDARD');
  return out;
}

// ------------------------------------------------------------------ mirroring

const mx = (x: number) => MW - x;
const mv = (p: Vec): Vec => ({ x: mx(p.x), y: p.y });
const mseg = (s: Segment): Segment => ({ ...s, x1: mx(s.x1), x2: mx(s.x2) });
const mrect = (r: Rect): Rect => ({ x: MW - r.x - r.w, y: r.y, w: r.w, h: r.h });
const mpoly = (p: Vec[]): Vec[] => p.map(mv);

function mirrorObstacle(d: ObstacleDef): ObstacleDef {
  switch (d.kind) {
    case 'piston':
      return { ...d, base: mv(d.base), dir: { x: -d.dir.x, y: d.dir.y } };
    case 'slider':
      return { ...d, a: mv(d.a), b: mv(d.b), angle: 180 - d.angle };
    case 'spinner':
      return { ...d, pivot: mv(d.pivot), speed: -d.speed, phase: 0.5 - (d.phase ?? 0) };
    case 'orbit':
      return { ...d, center: mv(d.center), speed: -d.speed, phase: 0.5 - (d.phase ?? 0) };
    case 'door':
      return { ...d, a: mv(d.a), b: mv(d.b) };
    case 'sweeper':
      if (d.a0 !== undefined && d.a1 !== undefined) return { ...d, pivot: mv(d.pivot), a0: 180 - d.a0, a1: 180 - d.a1 };
      return { ...d, pivot: mv(d.pivot), speed: -d.speed, phase: 0.5 - (d.phase ?? 0) };
    case 'pulser':
      return { ...d, center: mv(d.center), spin: -d.spin, gapPhase: 180 - (d.gapPhase ?? 0) };
    case 'crush':
      return { ...d, path: d.path.map(mv) };
    case 'seeker':
      return { ...d, spawn: mv(d.spawn), trigger: mrect(d.trigger), leash: d.leash ? mrect(d.leash) : undefined };
    case 'well':
      return { ...d, center: mv(d.center) };
    case 'spiral':
      return { ...d, center: mv(d.center), spin: -d.spin, phase: 0.5 - (d.phase ?? 0), mirror: !d.mirror };
    case 'breather':
      return { ...d, pts: d.pts.map(mv) };
    case 'bouncer':
      return { ...d, rect: mrect(d.rect), balls: d.balls.map((b) => ({ ...b, x0: mx(b.x0), vx: -b.vx })) };
  }
}

function mirrorZone(z: ZoneDef): ZoneDef {
  return { ...z, poly: mpoly(z.poly), holes: z.holes?.map(mpoly), entry: mseg(z.entry), exit: mseg(z.exit) };
}

export function mirrorCourse(c: Course): Course {
  return {
    ...c,
    walls: c.walls.map(mseg),
    obstacles: c.obstacles.map(mirrorObstacle),
    zones: c.zones.map(mirrorZone),
    pickup: c.pickup ? mv(c.pickup) : undefined,
    fragment: c.fragment ? mv(c.fragment) : undefined,
    start: mv(c.start),
    goal: mv(c.goal),
  };
}

export function applyMutators(course: Course, m: Mutators): Course {
  let c = course;
  if (m.gateOverride) c = { ...c, zones: c.zones.map((z) => ({ ...z, kind: m.gateOverride! })) };
  if (m.mirror) c = mirrorCourse(c);
  return c;
}
