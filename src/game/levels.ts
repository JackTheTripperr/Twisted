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
  cursorR: number;
  zone: number;
  /** a reboot core exists on this level */
  pickup: boolean;
}

const NAMES = [
  'BOOT SEQUENCE',
  'MIRROR PROTOCOL',
  'PISTON ALLEY',
  'CAROUSEL',
  'UNSTABLE SIGNAL',
  'PHASE GATES',
  'ORBITAL',
  'THE SWEEP',
  'OVERCLOCK',
  'PULSE',
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

export const LEVELS: LevelDef[] = NAMES.map((name, i) => {
  const level = i + 1;
  return {
    level,
    name,
    cursorR: level <= 8 ? 8 : level <= 16 ? 7.5 : 7,
    zone: Math.min(4, Math.floor(i / 4)),
    pickup: level % 5 === 0,
  };
});

export const LEVEL_COUNT = LEVELS.length;
export const MAX_REBOOTS = 3;

export const MODIFIER_INFO: Record<ModifierKind, { label: string; blurb: string; color: string }> = {
  UNTWIST: { label: 'UNTWIST', blurb: 'CONTROLS ARE NORMAL', color: '#3dff8f' },
  TURBO: { label: 'TURBO', blurb: 'CURSOR SPEED ×2', color: '#ff3c3c' },
  DRAG: { label: 'DRAG', blurb: 'CURSOR SPEED ×0.4', color: '#3d8bff' },
  SWELL: { label: 'SWELL', blurb: 'CURSOR SIZE ×1.9', color: '#ffe14d' },
  BLACKOUT: { label: 'BLACKOUT', blurb: 'VISION REDUCED', color: '#b04dff' },
  SPIN: { label: 'SPIN', blurb: 'AXES ROTATED 90°', color: '#ff2bd6' },
};

export const PRESSURE_INFO = {
  phantom: 'PHANTOM HUNTING · REACH THE EXIT GATE',
  purge: 'PURGE WAVE INCOMING · REACH THE EXIT GATE',
  decay: 'SIGNAL DECAYING · REACH THE CORE',
  none: 'REACH THE EXIT GATE',
} as const;
