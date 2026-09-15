/**
 * The 20 hand-authored TWISTED courses.
 * Play area: x 60..1220, y 92..676 (1160 x 584). Start pads sit on the left,
 * goals on the right unless the level says otherwise. All timings are in beats.
 */

import { box, corridor, line, rect, rectPoly, seg, v, type ObstacleDef } from './entities';
import { mazeSegments } from './maze';
import type { Rect, Segment, Vec, ZoneDef } from './types';

export const PLAY = { x: 60, y: 92, w: 1160, h: 584 };
const L = PLAY.x;
const R = PLAY.x + PLAY.w;
const T = PLAY.y;
const B = PLAY.y + PLAY.h;
const CY = PLAY.y + PLAY.h / 2; // 384

export interface Course {
  walls: Segment[];
  obstacles: ObstacleDef[];
  zones: ZoneDef[];
  pickup?: Vec;
  /** signal fragment collectible (one per level) */
  fragment?: Vec;
  start: Vec;
  goal: Vec;
  goalR: number;
}

const frame = () => box(L, T, PLAY.w, PLAY.h, 4);
const gate = (x1: number, y1: number, x2: number, y2: number): Segment => seg(x1, y1, x2, y2, 3);
const lane = (top: number, bottom: number): Segment[] => [...line([v(L, top), v(R, top)]), ...line([v(L, bottom), v(R, bottom)])];

function pistonTop(x: number, wallY: number, travel: number, period: number, phase: number): ObstacleDef {
  return { kind: 'piston', base: v(x, wallY), dir: v(0, 1), length: 12, travel, period, phase, t: 14 };
}
function pistonBottom(x: number, wallY: number, travel: number, period: number, phase: number): ObstacleDef {
  return { kind: 'piston', base: v(x, wallY), dir: v(0, -1), length: 12, travel, period, phase, t: 14 };
}
function door(x: number, top: number, bottom: number, period: number, openFrac: number, phase: number): ObstacleDef {
  return { kind: 'door', a: v(x, top), b: v(x, bottom), period, openFrac, phase, t: 10 };
}

/** Remove the parts of axis-aligned segments that fall inside a rect (used to cut doorways). */
function cutRect(segs: Segment[], r: Rect): Segment[] {
  const out: Segment[] = [];
  const eps = 0.01;
  for (const s of segs) {
    if (Math.abs(s.x1 - s.x2) < eps && s.x1 >= r.x - eps && s.x1 <= r.x + r.w + eps) {
      const y1 = Math.min(s.y1, s.y2);
      const y2 = Math.max(s.y1, s.y2);
      if (y2 <= r.y || y1 >= r.y + r.h) {
        out.push(s);
        continue;
      }
      if (y1 < r.y) out.push({ ...s, y1, y2: r.y });
      if (y2 > r.y + r.h) out.push({ ...s, y1: r.y + r.h, y2 });
    } else if (Math.abs(s.y1 - s.y2) < eps && s.y1 >= r.y - eps && s.y1 <= r.y + r.h + eps) {
      const x1 = Math.min(s.x1, s.x2);
      const x2 = Math.max(s.x1, s.x2);
      if (x2 <= r.x || x1 >= r.x + r.w) {
        out.push(s);
        continue;
      }
      if (x1 < r.x) out.push({ ...s, x1, x2: r.x });
      if (x2 > r.x + r.w) out.push({ ...s, x1: r.x + r.w, x2 });
    } else out.push(s);
  }
  return out;
}

function circlePoly(c: Vec, r: number, n = 18): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) out.push(v(c.x + Math.cos((i / n) * Math.PI * 2) * r, c.y + Math.sin((i / n) * Math.PI * 2) * r));
  return out;
}

// ------------------------------------------------------------------ levels

function l01(): Course {
  return {
    walls: [...frame(), ...box(380, T, 40, 300), ...box(620, B - 300, 40, 300), ...box(860, T, 40, 300)],
    obstacles: [],
    zones: [],
    start: v(130, CY),
    goal: v(1150, CY),
    fragment: v(640, 150),
    goalR: 26,
  };
}

function l02(): Course {
  const path = [v(L, 190), v(1000, 190), v(1000, CY), v(280, CY), v(280, 578), v(R, 578)];
  return {
    walls: [...frame(), ...corridor(path, 130)],
    obstacles: [pistonTop(560, 125, 78, 4, 0), pistonBottom(640, 449, 78, 4, 0.5), pistonTop(800, 513, 78, 4, 0.25)],
    zones: [],
    start: v(130, 190),
    goal: v(1150, 578),
    fragment: v(1000, 290),
    goalR: 26,
  };
}

function l03(): Course {
  const xs = [300, 460, 620, 780, 940, 1100];
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 200)],
    obstacles: xs.map((x, i) => (i % 2 === 0 ? pistonTop(x, 284, 140, 2, (i * 0.35) % 1) : pistonBottom(x, 484, 140, 2, (i * 0.35) % 1))),
    zones: [],
    start: v(130, CY),
    goal: v(1160, CY),
    fragment: v(700, 302),
    goalR: 26,
  };
}

function l04(): Course {
  return {
    walls: [...frame(), ...lane(234, 534)],
    obstacles: [
      { kind: 'spinner', pivot: v(400, CY), arms: 2, radius: 138, speed: 0.5, phase: 0, hub: 16, t: 10 },
      { kind: 'spinner', pivot: v(700, CY), arms: 2, radius: 138, speed: -0.5, phase: 0.25, hub: 16, t: 10 },
      { kind: 'spinner', pivot: v(1000, CY), arms: 2, radius: 138, speed: 0.5, phase: 0.5, hub: 16, t: 10 },
    ],
    zones: [],
    start: v(130, CY),
    goal: v(1160, CY),
    fragment: v(550, 252),
    goalR: 26,
  };
}

function l05(): Course {
  const walls: Segment[] = [
    ...frame(),
    ...line([v(L, 474), v(R, 474)]),
    ...line([v(L, 294), v(1065, 294)]),
    ...line([v(1135, 294), v(R, 294)]),
    ...line([v(1065, 294), v(1065, 230), v(990, 230), v(990, T)]),
    ...line([v(1135, 294), v(1135, 230), v(1210, 230), v(1210, T)]),
  ];
  return {
    walls,
    obstacles: [
      pistonTop(300, 294, 120, 2, 0),
      pistonBottom(420, 474, 120, 2, 0.5),
      pistonTop(900, 294, 120, 2, 0.25),
      pistonBottom(1000, 474, 120, 2, 0.75),
      { kind: 'spinner', pivot: v(1100, 161), arms: 2, radius: 60, inner: 22, speed: 0.6, t: 8 },
    ],
    zones: [
      { kind: 'UNTWIST', poly: rectPoly(500, 294, 300, 180), entry: gate(500, 294, 500, 474), exit: gate(800, 294, 800, 474), pressure: 'phantom' },
    ],
    pickup: v(1100, 161),
    start: v(130, CY),
    goal: v(1160, CY),
    fragment: v(650, 312),
    goalR: 26,
  };
}

function l06(): Course {
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 160)],
    obstacles: [340, 560, 780, 1000].map((x, i) => door(x, 304, 464, 4, 0.5, i * 0.25)),
    zones: [],
    start: v(130, CY),
    goal: v(1160, CY),
    fragment: v(450, 322),
    goalR: 26,
  };
}

function l07(): Course {
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [
      { kind: 'orbit', center: v(400, CY), radius: 120, balls: 3, ballR: 14, speed: 0.5, core: 18 },
      { kind: 'orbit', center: v(700, 262), radius: 92, balls: 4, ballR: 12, speed: -0.75, core: 16 },
      { kind: 'orbit', center: v(700, 506), radius: 92, balls: 4, ballR: 12, speed: 0.75, phase: 0.5, core: 16 },
      { kind: 'orbit', center: v(1000, CY), radius: 120, balls: 5, ballR: 14, speed: -0.5, core: 18 },
    ],
    zones: [],
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(700, CY),
    goalR: 24,
  };
}

function l08(): Course {
  return {
    walls: [...frame(), ...lane(180, 588), ...box(380, 330, 44, 108), ...box(640, 240, 44, 108), ...box(640, 440, 44, 108), ...box(900, 330, 44, 108)],
    obstacles: [
      { kind: 'sweeper', pivot: v(640, 180), length: 700, a0: 15, a1: 165, speed: 0.25, t: 6 },
      { kind: 'sweeper', pivot: v(640, 588), length: 700, a0: 195, a1: 345, speed: 0.25, phase: 0.5, t: 6 },
    ],
    zones: [
      { kind: 'UNTWIST', poly: rectPoly(980, 180, 160, 408), entry: gate(980, 180, 980, 588), exit: gate(1140, 180, 1140, 588), pressure: 'phantom' },
    ],
    start: v(130, CY),
    goal: v(1185, CY),
    fragment: v(662, 394),
    goalR: 22,
  };
}

function l09(): Course {
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 170)],
    obstacles: [
      pistonTop(330, 299, 112, 2, 0),
      pistonBottom(430, 469, 112, 2, 0.4),
      pistonTop(530, 299, 112, 2, 0.8),
      door(830, 299, 469, 4, 0.55, 0),
      door(940, 299, 469, 4, 0.55, 0.33),
      door(1050, 299, 469, 4, 0.55, 0.66),
    ],
    zones: [
      { kind: 'TURBO', poly: rectPoly(240, 299, 400, 170), entry: gate(240, 299, 240, 469), exit: gate(640, 299, 640, 469), pressure: 'phantom' },
      { kind: 'DRAG', poly: rectPoly(760, 299, 340, 170), entry: gate(760, 299, 760, 469), exit: gate(1100, 299, 1100, 469), pressure: 'phantom' },
    ],
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(900, 318),
    goalR: 24,
  };
}

function l10(): Course {
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [{ kind: 'pulser', center: v(640, CY), period: 4, speed: 85, maxR: 640, gaps: 3, gapWidth: 42, spin: 12, core: 22, t: 8 }],
    zones: [],
    pickup: v(640, 195),
    start: v(130, CY),
    goal: v(1160, CY),
    fragment: v(640, 560),
    goalR: 24,
  };
}

function l11(): Course {
  const pillars = [
    [300, 150, 40, 120],
    [300, 420, 40, 120],
    [480, 290, 40, 190],
    [660, 150, 40, 150],
    [660, 430, 40, 150],
    [840, 290, 40, 190],
    [1020, 150, 40, 120],
    [1020, 420, 40, 120],
  ];
  const leash = rect(1080, T, 140, PLAY.h);
  return {
    walls: [...frame(), ...pillars.flatMap(([x, y, w, h]) => box(x, y, w, h))],
    obstacles: [
      { kind: 'seeker', spawn: v(70, CY), trigger: rect(220, T, 1000, PLAY.h), vmax: 150, accel: 320, leash, r: 11 },
      { kind: 'seeker', spawn: v(640, 100), trigger: rect(600, T, 620, PLAY.h), vmax: 165, accel: 360, leash, r: 11 },
    ],
    zones: [],
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(680, 365),
    goalR: 24,
  };
}

function l12(): Course {
  return {
    walls: [...frame()],
    obstacles: [{ kind: 'spiral', center: v(720, CY), a: 30, b: 10.5, turns: 2.75, spin: 0.125, phase: 0.75, t: 10 }],
    zones: [],
    start: v(130, CY),
    goal: v(720, CY),
    fragment: v(480, 250),
    goalR: 15,
  };
}

function l13(): Course {
  const posts = [470, 610].flatMap((x) => [...line([v(x, 289), v(x, 356)]), ...line([v(x, 479), v(x, 412)])]);
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 190), ...posts],
    obstacles: [
      door(400, 289, 479, 4, 0.55, 0),
      door(540, 289, 479, 4, 0.55, 0.33),
      door(680, 289, 479, 4, 0.55, 0.66),
      {
        kind: 'bouncer',
        rect: rect(820, 289, 300, 190),
        balls: [
          { r: 12, vx: 70, vy: 45, x0: 850, y0: 320 },
          { r: 12, vx: -60, vy: 55, x0: 1000, y0: 420 },
          { r: 10, vx: 50, vy: -70, x0: 900, y0: 380 },
          { r: 14, vx: -80, vy: -40, x0: 1080, y0: 340 },
        ],
      },
    ],
    zones: [
      { kind: 'SWELL', poly: rectPoly(300, 289, 460, 190), entry: gate(300, 289, 300, 479), exit: gate(760, 289, 760, 479), pressure: 'phantom' },
    ],
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(790, 310),
    goalR: 24,
  };
}

function l14(): Course {
  const path = [v(L, 160), v(700, 160), v(700, CY), v(300, CY), v(300, 600), v(R, 600)];
  return {
    walls: [...frame(), ...corridor(path, 130)],
    obstacles: [
      pistonTop(300, 95, 78, 2, 0),
      pistonBottom(500, 225, 78, 2, 0.5),
      pistonTop(600, 535, 78, 2, 0),
      pistonBottom(900, 665, 78, 2, 0.5),
      pistonTop(1100, 535, 78, 2, 0.25),
      { kind: 'crush', path, width: 130, speed: 30, delay: 9 },
    ],
    zones: [{ kind: 'DRAG', poly: rectPoly(320, 319, 360, 130), entry: gate(680, 319, 680, 449), exit: gate(320, 319, 320, 449), pressure: 'none' }],
    start: v(130, 160),
    goal: v(1170, 600),
    fragment: v(500, 337),
    goalR: 24,
  };
}

function l15(): Course {
  const leash = rect(1080, T, 140, PLAY.h);
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [
      { kind: 'seeker', spawn: v(70, 150), trigger: rect(220, T, 1000, PLAY.h), vmax: 140, accel: 300, leash, r: 11 },
      { kind: 'seeker', spawn: v(70, 618), trigger: rect(420, T, 800, PLAY.h), vmax: 155, accel: 320, leash, r: 11 },
      { kind: 'orbit', center: v(500, CY), radius: 110, balls: 4, ballR: 12, speed: 0.5, core: 18 },
      { kind: 'orbit', center: v(850, CY), radius: 110, balls: 4, ballR: 12, speed: -0.5, phase: 0.5, core: 18 },
      { kind: 'well', center: v(675, 230), radius: 150, pull: 200, coreR: 20 },
      { kind: 'well', center: v(675, 540), radius: 150, pull: 200, coreR: 20 },
      { kind: 'spinner', pivot: v(1100, 210), arms: 3, radius: 62, inner: 24, speed: 0.5, t: 8 },
      { kind: 'sweeper', pivot: v(1215, 152), length: 420, a0: 118, a1: 180, speed: 0.35, t: 6 },
    ],
    zones: [],
    pickup: v(1100, 210),
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(675, CY),
    goalR: 24,
  };
}

function l16(): Course {
  const block = mazeSegments(12, 6, 0x5e6f, rect(200, 130, 900, 450), 8, 0.3);
  const sol = block.solution;
  const doors: ObstacleDef[] = [];
  const at = [Math.floor(sol.length / 3), Math.floor((2 * sol.length) / 3)];
  at.forEach((i, k) => {
    const a = sol[i];
    const b = sol[i + 1];
    const half = block.cell / 2 - 4;
    if (Math.abs(a.y - b.y) < 1) {
      const mx = (a.x + b.x) / 2;
      doors.push({ kind: 'door', a: v(mx, a.y - half), b: v(mx, a.y + half), period: 4, openFrac: 0.5, phase: k * 0.5, t: 8 });
    } else {
      const my = (a.y + b.y) / 2;
      doors.push({ kind: 'door', a: v(a.x - half, my), b: v(a.x + half, my), period: 4, openFrac: 0.5, phase: k * 0.5, t: 8 });
    }
  });
  return {
    walls: [...frame(), ...block.segs],
    obstacles: [...doors, { kind: 'crush', path: sol, width: block.cell - 8, speed: 22, delay: 11 }],
    zones: [],
    start: block.start,
    goal: block.exit,
    fragment: sol[3],
    goalR: Math.min(22, block.cell * 0.3),
  };
}

function l17(): Course {
  const wells: ObstacleDef[] = [v(350, 250), v(350, 520), v(640, CY), v(930, 250), v(930, 520)].map((c) => ({
    kind: 'well',
    center: c,
    radius: 150,
    pull: 240,
    coreR: 22,
  }));
  return {
    walls: [...frame(), ...lane(130, 638)],
    obstacles: [...wells, { kind: 'orbit', center: v(640, CY), radius: 110, balls: 4, ballR: 10, speed: 0.75 }],
    zones: [
      { kind: 'BLACKOUT', poly: rectPoly(760, 130, 320, 508), entry: gate(760, 130, 760, 638), exit: gate(1080, 130, 1080, 638), pressure: 'phantom' },
    ],
    start: v(130, CY),
    goal: v(1170, CY),
    fragment: v(640, 236),
    goalR: 24,
  };
}

function l18(): Course {
  return {
    walls: [...frame()],
    obstacles: [
      { kind: 'breather', pts: [v(L, CY), v(R, CY)], width: 170, amp: 20, t: 8 },
      pistonTop(220, 299, 112, 2, 0),
      pistonBottom(320, 469, 112, 2, 0.5),
      { kind: 'spinner', pivot: v(500, CY), arms: 2, radius: 78, speed: 0.5, hub: 12, t: 8 },
      door(660, 299, 469, 4, 0.5, 0),
      door(780, 299, 469, 4, 0.5, 0.5),
      { kind: 'sweeper', pivot: v(930, 299), length: 170, a0: 30, a1: 150, speed: 0.5, t: 6 },
      pistonTop(1040, 299, 112, 2, 0.25),
      pistonBottom(1120, 469, 112, 2, 0.75),
    ],
    zones: [],
    start: v(130, CY),
    goal: v(1185, CY),
    fragment: v(600, CY),
    goalR: 22,
  };
}

function l19(): Course {
  const center = v(790, CY);
  return {
    walls: [...frame()],
    obstacles: [
      { kind: 'sweeper', pivot: v(330, T), length: 320, a0: 30, a1: 150, speed: 0.3, t: 6 },
      { kind: 'sweeper', pivot: v(330, B), length: 320, a0: 210, a1: 330, speed: 0.3, phase: 0.5, t: 6 },
      { kind: 'spiral', center, a: 30, b: 10.5, turns: 2.5, spin: 0.125, phase: 0, t: 10 },
    ],
    zones: [
      {
        kind: 'SPIN',
        poly: rectPoly(580, 175, 420, 420),
        holes: [circlePoly(center, 21)],
        entry: gate(580, 175, 580, 595),
        exit: gate(center.x - 14, center.y, center.x + 14, center.y),
        pressure: 'decay',
        decayBeats: 72,
      },
    ],
    start: v(130, CY),
    goal: center,
    fragment: v(588, 300),
    goalR: 14,
  };
}

function l20(): Course {
  const path = [v(L, 170), v(900, 170), v(900, CY), v(360, CY), v(360, 598), v(R, 598)];
  const walls = cutRect(corridor(path, 150), rect(970, 130, 10, 70));
  const chamber = line([v(975, 300), v(1210, 300), v(1210, T)]);
  return {
    walls: [...frame(), ...walls, ...chamber],
    obstacles: [
      { kind: 'crush', path, width: 150, speed: 24, delay: 10 },
      { kind: 'spinner', pivot: v(1095, 196), arms: 3, radius: 70, inner: 22, speed: 0.6, t: 8 },
      { kind: 'sweeper', pivot: v(1210, 300), length: 260, a0: 182, a1: 268, speed: 0.4, t: 6 },
      { kind: 'spinner', pivot: v(400, 170), arms: 2, radius: 70, speed: 0.75, hub: 10, t: 8 },
      door(700, 95, 245, 4, 0.5, 0),
      { kind: 'seeker', spawn: v(900, 100), trigger: rect(285, 309, 690, 150), vmax: 150, accel: 320, leash: rect(1000, 523, 220, 150), r: 11 },
      door(620, 523, 673, 4, 0.5, 0),
      door(780, 523, 673, 4, 0.5, 0.5),
      { kind: 'spinner', pivot: v(1050, 598), arms: 2, radius: 70, speed: -0.75, hub: 10, t: 8 },
    ],
    zones: [
      { kind: 'UNTWIST', poly: rectPoly(500, 309, 300, 150), entry: gate(800, 309, 800, 459), exit: gate(500, 309, 500, 459), pressure: 'phantom' },
      { kind: 'TURBO', poly: rectPoly(500, 523, 400, 150), entry: gate(500, 523, 500, 673), exit: gate(900, 523, 900, 673), pressure: 'none' },
    ],
    pickup: v(1095, 196),
    start: v(130, 170),
    goal: v(1180, 598),
    fragment: v(700, CY),
    goalR: 24,
  };
}

const BUILDERS = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11, l12, l13, l14, l15, l16, l17, l18, l19, l20];

const cache = new Map<number, Course>();

export function getCourse(level: number): Course {
  let c = cache.get(level);
  if (!c) {
    c = BUILDERS[level - 1]();
    cache.set(level, c);
  }
  return c;
}

export const COURSE_COUNT = BUILDERS.length;
