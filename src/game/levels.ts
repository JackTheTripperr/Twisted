import type { ModifierKind } from './types';

export interface Zone {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  /** hue used for background tinting */
  hue: number;
  bpm: number;
}

/** Five visual/musical zones, four levels each. */
export const ZONES: Zone[] = [
  { name: 'NEON DAWN', primary: '#19f0ff', secondary: '#ff2bd6', accent: '#ffffff', hue: 195, bpm: 126 },
  { name: 'VIOLET DRIFT', primary: '#b04dff', secondary: '#ffe14d', accent: '#f4e8ff', hue: 270, bpm: 130 },
  { name: 'GRID RUNNER', primary: '#3dff8f', secondary: '#ff3c78', accent: '#e8fff5', hue: 150, bpm: 134 },
  { name: 'SOLAR FLARE', primary: '#ffa326', secondary: '#3d8bff', accent: '#fff2d9', hue: 30, bpm: 138 },
  { name: 'MELTDOWN', primary: '#ff2d55', secondary: '#7cf7ff', accent: '#ffe0e6', hue: 350, bpm: 142 },
];

export interface LevelDef {
  level: number;
  name: string;
  cols: number;
  rows: number;
  cursorR: number;
  wallT: number;
  /** probability of continuing straight while carving (lower = twistier) */
  straightBias: number;
  chokepoints: number;
  modifiers: ModifierKind[];
  /** [min, max] seconds between modifier events */
  modInterval: [number, number];
  modDuration: number;
  warnTime: number;
  zone: number;
}

const NAMES = [
  'BOOT SEQUENCE',
  'MIRROR PROTOCOL',
  'INVERSE DRIFT',
  'FEEDBACK LOOP',
  'UNSTABLE SIGNAL',
  'PHASE SHIFT',
  'GHOST IN THE GRID',
  'NULL POINTER',
  'OVERCLOCK',
  'STACK OVERFLOW',
  'KERNEL PANIC',
  'RECURSION',
  'SWELL SEASON',
  'BLACK ICE',
  'DAEMON',
  'SEGFAULT',
  'EVENT HORIZON',
  'TOTAL RECALL',
  'CORE MELTDOWN',
  'ANNIHILATION',
];

interface Row {
  cols: number;
  rows: number;
  r: number;
  bias: number;
  chok: number;
}

const TABLE: Row[] = [
  { cols: 5, rows: 3, r: 9, bias: 0.6, chok: 0 },
  { cols: 6, rows: 4, r: 9, bias: 0.55, chok: 0 },
  { cols: 8, rows: 4, r: 9, bias: 0.5, chok: 0 },
  { cols: 9, rows: 5, r: 8.5, bias: 0.45, chok: 0 },
  { cols: 10, rows: 6, r: 8.5, bias: 0.4, chok: 0 },
  { cols: 11, rows: 6, r: 8, bias: 0.4, chok: 1 },
  { cols: 12, rows: 7, r: 8, bias: 0.35, chok: 1 },
  { cols: 13, rows: 7, r: 8, bias: 0.35, chok: 2 },
  { cols: 14, rows: 8, r: 7.5, bias: 0.3, chok: 2 },
  { cols: 15, rows: 8, r: 7.5, bias: 0.3, chok: 2 },
  { cols: 16, rows: 9, r: 7, bias: 0.25, chok: 3 },
  { cols: 17, rows: 9, r: 7, bias: 0.25, chok: 3 },
  { cols: 18, rows: 10, r: 7, bias: 0.2, chok: 3 },
  { cols: 19, rows: 10, r: 6.5, bias: 0.2, chok: 4 },
  { cols: 20, rows: 11, r: 6.5, bias: 0.15, chok: 4 },
  { cols: 21, rows: 11, r: 6.5, bias: 0.15, chok: 4 },
  { cols: 22, rows: 12, r: 6, bias: 0.1, chok: 5 },
  { cols: 24, rows: 13, r: 6, bias: 0.1, chok: 5 },
  { cols: 26, rows: 14, r: 5.5, bias: 0.05, chok: 6 },
  { cols: 28, rows: 15, r: 5.5, bias: 0.05, chok: 6 },
];

function poolFor(level: number): ModifierKind[] {
  if (level < 5) return [];
  const pool: ModifierKind[] = ['UNTWIST'];
  if (level >= 9) pool.push('TURBO', 'DRAG');
  if (level >= 13) pool.push('SWELL');
  if (level >= 17) pool.push('BLACKOUT');
  if (level >= 19) pool.push('SPIN');
  return pool;
}

function intervalFor(level: number): [number, number] {
  if (level < 9) return [8, 11];
  if (level < 13) return [7, 10];
  if (level < 17) return [6, 9];
  return [5, 7.5];
}

export const LEVELS: LevelDef[] = TABLE.map((row, i) => {
  const level = i + 1;
  return {
    level,
    name: NAMES[i],
    cols: row.cols,
    rows: row.rows,
    cursorR: row.r,
    wallT: level <= 8 ? 8 : level <= 16 ? 7 : 6,
    straightBias: row.bias,
    chokepoints: row.chok,
    modifiers: poolFor(level),
    modInterval: intervalFor(level),
    modDuration: level >= 13 ? 3.5 : 3,
    warnTime: 1.3,
    zone: Math.min(4, Math.floor(i / 4)),
  };
});

export const LEVEL_COUNT = LEVELS.length;

export const MODIFIER_INFO: Record<ModifierKind, { label: string; blurb: string; color: string }> = {
  UNTWIST: { label: 'UNTWIST', blurb: 'CONTROLS ARE NORMAL', color: '#3dff8f' },
  TURBO: { label: 'TURBO', blurb: 'CURSOR SPEED ×2', color: '#ff3c3c' },
  DRAG: { label: 'DRAG', blurb: 'CURSOR SPEED ×0.4', color: '#3d8bff' },
  SWELL: { label: 'SWELL', blurb: 'CURSOR SIZE ×1.9', color: '#ffe14d' },
  BLACKOUT: { label: 'BLACKOUT', blurb: 'VISION REDUCED', color: '#b04dff' },
  SPIN: { label: 'SPIN', blurb: 'AXES ROTATED 90°', color: '#ff2bd6' },
};
