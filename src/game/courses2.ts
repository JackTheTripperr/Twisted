/**
 * Levels 21–41: the Warden, sectors 06–10, and Warden Prime.
 * Play area: x 60..1220, y 92..676 (1160 x 584). All timings are in beats.
 */

import type { Course } from './courses';
import { cutRect, door, frame, gate, lane, pistonBottom, pistonTop } from './courses';
import { PLAY_AREA as PLAY, box, corridor, line, rect, rectPoly, v, type GridBeam, type ObstacleDef } from './entities';

// NOTE: courses.ts imports this module (circular). Only functions from courses.ts are used here, and only
// inside builders, so nothing from that module is touched while it is still initialising.
const L = PLAY.x;
const R = PLAY.x + PLAY.w;
const T = PLAY.y;
const B = PLAY.y + PLAY.h;
const CY = PLAY.y + PLAY.h / 2; // 384

function gridBeams(xs: number[], ys: number[]): GridBeam[] {
  const out: GridBeam[] = [];
  for (let j = 0; j < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) out.push({ x1: xs[i], y1: ys[j], x2: xs[i + 1], y2: ys[j], group: j % 2 });
  for (let i = 0; i < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) out.push({ x1: xs[i], y1: ys[j], x2: xs[i], y2: ys[j + 1], group: 2 + (i % 2) });
  return out;
}

function mine(x: number, y: number, trigger = 62, blastR = 95): ObstacleDef {
  return { kind: 'mine', pos: v(x, y), trigger, blastR };
}

function turret(x: number, y: number, period: number, speed: number, phase = 0, spread?: number): ObstacleDef {
  return { kind: 'turret', pos: v(x, y), period, speed, phase, spread };
}

// ------------------------------------------------------------------ 21: the Warden

function l21(): Course {
  return {
    walls: [...frame()],
    obstacles: [{ kind: 'boss', box: rect(540, T, 200, 96), hp: 3, tier: 1 }],
    zones: [],
    fragment: v(1120, 150),
    start: v(640, 610),
    goal: v(640, 250),
    goalR: 24,
  };
}

// ------------------------------------------------------------------ sector 06: DEEP FIELD

function l22(): Course {
  return {
    walls: [...frame(), ...lane(150, 618), ...box(420, 250, 40, 110), ...box(420, 430, 40, 110), ...box(760, 200, 40, 120), ...box(760, 460, 40, 120)],
    obstacles: [turret(300, 200, 3, 240), turret(640, CY, 2.5, 260, 0.5), turret(980, 570, 3, 240, 0.3)],
    zones: [],
    fragment: v(640, 200),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l23(): Course {
  const xs = [360, 560, 760, 960];
  const ys = [150, 306, 462, 618];
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [{ kind: 'lasergrid', beams: gridBeams(xs, ys), groups: 4, period: 2, t: 6 }],
    zones: [],
    fragment: v(660, 230),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l24(): Course {
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 180)],
    obstacles: [
      { kind: 'current', rect: rect(300, 294, 300, 180), vx: -90, vy: 0 },
      { kind: 'current', rect: rect(700, 294, 300, 90), vx: 0, vy: 80 },
      { kind: 'current', rect: rect(700, 384, 300, 90), vx: 0, vy: -80 },
      pistonTop(450, 294, 110, 2, 0),
      pistonBottom(550, 474, 110, 2, 0.5),
      door(1000, 294, 474, 4, 0.5, 0),
      door(1100, 294, 474, 4, 0.5, 0.5),
    ],
    zones: [],
    fragment: v(850, 320),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l25(): Course {
  const mines = [
    [320, 250],
    [380, 470],
    [480, 340],
    [560, 200],
    [600, 560],
    [700, 400],
    [780, 240],
    [860, 520],
    [940, 330],
    [1020, 450],
    [1080, 220],
    [950, 200],
    [1050, 200],
    [1000, 260],
  ].map(([x, y]) => mine(x, y));
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: mines,
    zones: [{ kind: 'DRAG', poly: rectPoly(640, 150, 240, 468), entry: gate(640, 150, 640, 618), exit: gate(880, 150, 880, 618), pressure: 'phantom' }],
    pickup: v(1000, 180),
    fragment: v(200, 560),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

// ------------------------------------------------------------------ sector 07: STATIC SEA

function l26(): Course {
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [
      { kind: 'serpent', from: v(260, 300), to: v(R, 300), amp: 90, wavelength: 260, speed: 110, segments: 14, segR: 12, spacing: 22 },
      { kind: 'serpent', from: v(R, 470), to: v(260, 470), amp: 90, wavelength: 300, speed: 95, segments: 14, segR: 12, spacing: 22, phase: 0.5 },
    ],
    zones: [],
    fragment: v(640, CY),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l27(): Course {
  return {
    walls: [...frame(), ...corridor([v(L, CY), v(R, CY)], 220)],
    obstacles: [
      { kind: 'pendulum', pivot: v(350, 274), length: 200, amp: 55, period: 4, bob: 12 },
      { kind: 'pendulum', pivot: v(600, 274), length: 200, amp: 55, period: 4, phase: 0.5, bob: 12 },
      { kind: 'pendulum', pivot: v(850, 274), length: 200, amp: 55, period: 3, phase: 0.25, bob: 12 },
      { kind: 'pendulum', pivot: v(1050, 274), length: 190, amp: 60, period: 3, phase: 0.75, bob: 12 },
    ],
    zones: [],
    fragment: v(725, 300),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l28(): Course {
  const blocks: ObstacleDef[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      blocks.push({ kind: 'shutter', rect: rect(240 + i * 200, 170 + j * 160, 120, 110), period: 4, openFrac: 0.5, phase: ((i + j) % 2) * 0.5 });
    }
  }
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: blocks,
    zones: [{ kind: 'UNTWIST', poly: rectPoly(640, 150, 260, 468), entry: gate(640, 150, 640, 618), exit: gate(900, 150, 900, 618), pressure: 'phantom' }],
    fragment: v(600, 305),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l29(): Course {
  return {
    walls: [...frame()],
    obstacles: [
      { kind: 'shrink', rect: rect(100, 120, 1080, 530), minW: 260, minH: 200, duration: 64, delay: 8, t: 8 },
      { kind: 'orbit', center: v(400, CY), radius: 90, balls: 3, ballR: 12, speed: 0.5, core: 14 },
      { kind: 'orbit', center: v(880, CY), radius: 90, balls: 3, ballR: 12, speed: -0.5, phase: 0.5, core: 14 },
      { kind: 'sweeper', pivot: v(100, 120), length: 520, a0: 10, a1: 80, speed: 0.3, t: 6 },
      { kind: 'sweeper', pivot: v(1180, 650), length: 520, a0: 190, a1: 260, speed: 0.3, phase: 0.5, t: 6 },
    ],
    zones: [],
    fragment: v(640, 200),
    start: v(220, 560),
    goal: v(640, CY),
    goalR: 20,
  };
}

// ------------------------------------------------------------------ sector 08: ZERO DAY

function l30(): Course {
  return {
    walls: [...frame()],
    obstacles: [
      { kind: 'spiral', center: v(420, CY), a: 26, b: 10.5, turns: 2.25, spin: 0.35, phase: 0.25, t: 10 },
      { kind: 'spiral', center: v(900, CY), a: 26, b: 10.5, turns: 2.25, spin: -0.35, phase: 0.25, t: 10 },
    ],
    zones: [],
    pickup: v(420, CY),
    fragment: v(660, CY),
    start: v(130, CY),
    goal: v(900, CY),
    goalR: 15,
  };
}

function l31(): Course {
  return {
    walls: [...frame(), ...lane(150, 618), ...box(500, 300, 40, 168), ...box(800, 300, 40, 168)],
    obstacles: [
      turret(300, 170, 2.5, 250),
      turret(300, 598, 2.5, 250, 0),
      turret(1000, 170, 2, 270, 0.25),
      { kind: 'sweeper', pivot: v(640, 150), length: 500, a0: 40, a1: 140, speed: 0.3, t: 6 },
    ],
    zones: [{ kind: 'BLACKOUT', poly: rectPoly(700, 150, 260, 468), entry: gate(700, 150, 700, 618), exit: gate(960, 150, 960, 618), pressure: 'phantom' }],
    fragment: v(650, 560),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l32(): Course {
  const path = [v(L, 170), v(800, 170), v(800, CY), v(400, CY), v(400, 598), v(R, 598)];
  return {
    walls: [...frame(), ...corridor(path, 140)],
    obstacles: [
      { kind: 'crush', path, width: 140, speed: 30, delay: 10 },
      { kind: 'current', rect: rect(300, 100, 300, 140), vx: -70, vy: 0 },
      { kind: 'current', rect: rect(450, 314, 300, 140), vx: 70, vy: 0 },
      { kind: 'current', rect: rect(600, 528, 400, 140), vx: 0, vy: -60 },
      pistonBottom(900, 668, 80, 2, 0),
      pistonTop(1050, 528, 80, 2, 0.5),
    ],
    zones: [],
    fragment: v(600, 340),
    start: v(130, 170),
    goal: v(1170, 598),
    goalR: 24,
  };
}

function l33(): Course {
  const pillars = [
    [300, 150, 40, 120],
    [300, 420, 40, 120],
    [480, 290, 40, 190],
    [660, 150, 40, 150],
    [660, 430, 40, 150],
    [840, 290, 40, 190],
  ];
  const leash = rect(1080, T, 140, PLAY.h);
  return {
    walls: [...frame(), ...lane(150, 618), ...pillars.flatMap(([x, y, w, h]) => box(x, y, w, h))],
    obstacles: [
      { kind: 'seeker', spawn: v(70, 200), trigger: rect(220, T, 1000, PLAY.h), vmax: 160, accel: 400, leash, r: 9, life: 4, respawn: 12 },
      { kind: 'seeker', spawn: v(70, 568), trigger: rect(350, T, 900, PLAY.h), vmax: 160, accel: 400, leash, r: 9, life: 4, respawn: 12 },
      { kind: 'seeker', spawn: v(640, 100), trigger: rect(520, T, 700, PLAY.h), vmax: 170, accel: 420, leash, r: 9, life: 4, respawn: 12 },
      { kind: 'seeker', spawn: v(640, 668), trigger: rect(700, T, 520, PLAY.h), vmax: 170, accel: 420, leash, r: 9, life: 4, respawn: 12 },
      door(940, 150, 618, 4, 0.6, 0),
    ],
    zones: [],
    fragment: v(590, CY),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

// ------------------------------------------------------------------ sector 09: NULL SPACE

function l34(): Course {
  const xs = [360, 560, 760, 960];
  const ys = [150, 306, 462, 618];
  return {
    walls: [...frame(), ...lane(150, 618)],
    obstacles: [
      { kind: 'lasergrid', beams: gridBeams(xs, ys), groups: 4, period: 1.5, t: 6 },
      { kind: 'well', center: v(460, CY), radius: 130, pull: 200, coreR: 18 },
      { kind: 'well', center: v(860, CY), radius: 130, pull: 200, coreR: 18 },
    ],
    zones: [{ kind: 'DRAG', poly: rectPoly(260, 150, 800, 468), entry: gate(260, 150, 260, 618), exit: gate(1060, 150, 1060, 618), pressure: 'phantom' }],
    fragment: v(660, 230),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l35(): Course {
  const path = [v(L, 200), v(600, 200), v(600, 568), v(R, 568)];
  const walls = cutRect(corridor(path, 150), rect(520, 344, 10, 80));
  const pocket = line([v(525, 344), v(380, 344), v(380, 424), v(525, 424)]);
  return {
    walls: [...frame(), ...walls, ...pocket],
    obstacles: [
      mine(300, 170),
      mine(450, 240),
      mine(570, 330, 56, 80),
      mine(630, 430, 56, 80),
      mine(800, 540),
      mine(950, 600),
      mine(1100, 540),
      pistonTop(480, 125, 90, 2, 0),
      pistonBottom(350, 275, 90, 2, 0.5),
      { kind: 'pendulum', pivot: v(470, 344), length: 70, amp: 70, period: 2, bob: 8 },
      pistonTop(900, 493, 80, 2, 0.25),
    ],
    zones: [],
    pickup: v(410, 384),
    fragment: v(550, 540),
    start: v(130, 200),
    goal: v(1170, 568),
    goalR: 24,
  };
}

function l36(): Course {
  const divider = [...line([v(300, 350), v(980, 350)]), ...line([v(300, 418), v(980, 418)]), ...line([v(300, 350), v(300, 418)]), ...line([v(980, 350), v(980, 418)])];
  return {
    walls: [...frame(), ...lane(150, 618), ...divider],
    obstacles: [
      { kind: 'serpent', from: v(300, 250), to: v(980, 250), amp: 70, wavelength: 240, speed: 100, segments: 12, segR: 11, spacing: 20 },
      turret(400, 600, 2.5, 240),
      turret(700, 430, 2.5, 240, 0.5),
      turret(900, 600, 2.5, 240, 0.25),
    ],
    zones: [{ kind: 'SWELL', poly: rectPoly(520, 150, 340, 468), entry: gate(520, 150, 520, 618), exit: gate(860, 150, 860, 618), pressure: 'phantom' }],
    fragment: v(200, 200),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l37(): Course {
  return {
    walls: [...frame(), ...lane(130, 638)],
    obstacles: [
      { kind: 'well', center: v(350, 250), radius: 140, pull: 230, coreR: 20 },
      { kind: 'well', center: v(350, 520), radius: 140, pull: 230, coreR: 20 },
      { kind: 'well', center: v(930, 250), radius: 140, pull: 230, coreR: 20 },
      { kind: 'well', center: v(930, 520), radius: 140, pull: 230, coreR: 20 },
      { kind: 'orbit', center: v(640, CY), radius: 150, balls: 5, ballR: 11, speed: 0.6 },
      { kind: 'current', rect: rect(500, 130, 280, 254), vx: 0, vy: -90 },
      { kind: 'current', rect: rect(500, 384, 280, 254), vx: 0, vy: 90 },
      turret(640, 140, 2, 230),
      turret(640, 628, 2, 230, 0.5),
    ],
    zones: [],
    fragment: v(640, CY),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

// ------------------------------------------------------------------ sector 10: ENDGAME

function l38(): Course {
  const path = [v(L, CY), v(R, CY)];
  const beams: GridBeam[] = [300, 400, 500].map((x, i) => ({ x1: x, y1: 284, x2: x, y2: 484, group: i % 2 }));
  return {
    walls: [...frame(), ...corridor(path, 200)],
    obstacles: [
      { kind: 'lasergrid', beams, groups: 2, period: 2, t: 6 },
      door(650, 284, 484, 4, 0.5, 0),
      door(760, 284, 484, 4, 0.5, 0.5),
      turret(900, 284, 2, 260),
      turret(1000, 484, 2, 260, 0.5),
      { kind: 'crush', path, width: 200, speed: 32, delay: 10 },
    ],
    zones: [],
    fragment: v(575, 300),
    start: v(130, CY),
    goal: v(1170, CY),
    goalR: 24,
  };
}

function l39(): Course {
  return {
    walls: [...frame()],
    obstacles: [
      { kind: 'spiral', center: v(380, CY), a: 24, b: 10.5, turns: 2, spin: 0.4, phase: 0.5, t: 10 },
      { kind: 'spiral', center: v(900, CY), a: 24, b: 10.5, turns: 2, spin: -0.4, phase: 0.5, t: 10 },
      { kind: 'serpent', from: v(640, T), to: v(640, B), amp: 60, wavelength: 200, speed: 90, segments: 12, segR: 10, spacing: 20 },
      { kind: 'shrink', rect: rect(80, 100, 1120, 570), minW: 720, minH: 400, duration: 80, delay: 8, t: 8 },
    ],
    zones: [],
    fragment: v(380, CY),
    start: v(130, CY),
    goal: v(900, CY),
    goalR: 15,
  };
}

function l40(): Course {
  const path = [v(L, 170), v(900, 170), v(900, CY), v(360, CY), v(360, 598), v(R, 598)];
  const walls = cutRect(corridor(path, 150), rect(970, 130, 10, 70));
  const chamber = line([v(975, 300), v(1210, 300), v(1210, T)]);
  return {
    walls: [...frame(), ...walls, ...chamber],
    obstacles: [
      { kind: 'crush', path, width: 150, speed: 26, delay: 12 },
      mine(300, 140),
      mine(500, 200),
      mine(700, 140),
      { kind: 'pendulum', pivot: v(800, 95), length: 120, amp: 50, period: 3, bob: 10 },
      { kind: 'spinner', pivot: v(1095, 196), arms: 3, radius: 70, inner: 22, speed: 0.6, t: 8 },
      { kind: 'sweeper', pivot: v(1210, 300), length: 260, a0: 182, a1: 268, speed: 0.4, t: 6 },
      turret(640, CY, 2, 240),
      door(620, 523, 673, 4, 0.5, 0),
      door(780, 523, 673, 4, 0.5, 0.5),
      { kind: 'serpent', from: v(900, 598), to: v(R, 598), amp: 40, wavelength: 150, speed: 80, segments: 8, segR: 9, spacing: 18 },
    ],
    zones: [
      { kind: 'UNTWIST', poly: rectPoly(500, 309, 300, 150), entry: gate(800, 309, 800, 459), exit: gate(500, 309, 500, 459), pressure: 'phantom' },
      { kind: 'TURBO', poly: rectPoly(500, 523, 400, 150), entry: gate(500, 523, 500, 673), exit: gate(900, 523, 900, 673), pressure: 'none' },
    ],
    pickup: v(1095, 196),
    fragment: v(700, CY),
    start: v(130, 170),
    goal: v(1180, 598),
    goalR: 24,
  };
}

// ------------------------------------------------------------------ 41: Warden Prime

function l41(): Course {
  return {
    walls: [...frame()],
    obstacles: [{ kind: 'boss', box: rect(540, T, 200, 96), hp: 4, tier: 2 }],
    zones: [],
    fragment: v(120, 150),
    start: v(640, 610),
    goal: v(640, 250),
    goalR: 24,
  };
}


export const LATE_BUILDERS: (() => Course)[] = [l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l35, l36, l37, l38, l39, l40, l41];
