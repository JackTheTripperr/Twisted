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

/** Ten sectors plus the Warden's own palette (index 10). */
export const ZONES: Zone[] = [
  { name: 'NEON DAWN', primary: '#19f0ff', secondary: '#ff2bd6', accent: '#ffffff', hue: 195, bpm: 126 },
  { name: 'VIOLET DRIFT', primary: '#b04dff', secondary: '#ffe14d', accent: '#f4e8ff', hue: 270, bpm: 130 },
  { name: 'GRID RUNNER', primary: '#3dff8f', secondary: '#ff3c78', accent: '#e8fff5', hue: 150, bpm: 134 },
  { name: 'SOLAR FLARE', primary: '#ffa326', secondary: '#3d8bff', accent: '#fff2d9', hue: 30, bpm: 138 },
  { name: 'MELTDOWN', primary: '#ff2d55', secondary: '#7cf7ff', accent: '#ffe0e6', hue: 350, bpm: 142 },
  { name: 'DEEP FIELD', primary: '#00e5a8', secondary: '#ff7ad9', accent: '#e6fff7', hue: 165, bpm: 132 },
  { name: 'STATIC SEA', primary: '#8ab4ff', secondary: '#ff5c8a', accent: '#f0f4ff', hue: 220, bpm: 136 },
  { name: 'ZERO DAY', primary: '#c8ff3d', secondary: '#ff3d3d', accent: '#f7ffe0', hue: 80, bpm: 140 },
  { name: 'NULL SPACE', primary: '#d9c9ff', secondary: '#ff9f1c', accent: '#ffffff', hue: 262, bpm: 144 },
  { name: 'ENDGAME', primary: '#ff5e00', secondary: '#00f0ff', accent: '#fff0e0', hue: 15, bpm: 148 },
  { name: 'THE WARDEN', primary: '#ff2d55', secondary: '#ffffff', accent: '#ffd6dc', hue: 355, bpm: 150 },
];

export const WARDEN_ZONE = 10;

export interface LevelDef {
  level: number;
  name: string;
  cursorR: number;
  zone: number;
  /** a reboot core exists on this level */
  pickup: boolean;
  /** first level of its sector: shows the sector briefing */
  first: boolean;
  boss: boolean;
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
  'THE WARDEN',
  'AFTERSHOCK',
  'LATTICE',
  'UNDERTOW',
  'MINEFIELD',
  'SERPENT',
  'PENDULUM',
  'SHUTTER',
  'COMPRESSION',
  'TWIN SPIRALS',
  'CROSSFIRE',
  'RIPTIDE',
  'SWARM',
  'LATTICE II',
  'MINE SHAFT',
  'REFLECTION',
  'GRAVITY STORM',
  'ENDGAME I',
  'ENDGAME II',
  'ENDGAME III',
  'WARDEN PRIME',
];

export function zoneOf(level: number): number {
  if (level === 21 || level === 41) return WARDEN_ZONE;
  if (level <= 20) return Math.floor((level - 1) / 4);
  return 5 + Math.floor((level - 22) / 4);
}

export const LEVELS: LevelDef[] = NAMES.map((name, i) => {
  const level = i + 1;
  const boss = level === 21 || level === 41;
  return {
    level,
    name,
    cursorR: level <= 8 ? 8 : level <= 16 ? 7.5 : 7,
    zone: zoneOf(level),
    pickup: level % 5 === 0 && !boss,
    first: [1, 5, 9, 13, 17, 21, 22, 26, 30, 34, 38, 41].includes(level),
    boss,
  };
});

export const LEVEL_COUNT = LEVELS.length;
export const MAX_REBOOTS = 3;
export const CHECKPOINT_LEVEL = 22;

/** Practice tabs: ten sectors; the Warden fights sit with the sector they close. */
export const PRACTICE_TABS: { zone: number; levels: number[] }[] = [
  { zone: 0, levels: [1, 2, 3, 4] },
  { zone: 1, levels: [5, 6, 7, 8] },
  { zone: 2, levels: [9, 10, 11, 12] },
  { zone: 3, levels: [13, 14, 15, 16] },
  { zone: 4, levels: [17, 18, 19, 20, 21] },
  { zone: 5, levels: [22, 23, 24, 25] },
  { zone: 6, levels: [26, 27, 28, 29] },
  { zone: 7, levels: [30, 31, 32, 33] },
  { zone: 8, levels: [34, 35, 36, 37] },
  { zone: 9, levels: [38, 39, 40, 41] },
];

export function tabOf(level: number): number {
  return PRACTICE_TABS.findIndex((t) => t.levels.includes(level));
}

export const MODIFIER_INFO: Record<ModifierKind, { label: string; blurb: string; color: string }> = {
  UNTWIST: { label: 'UNTWIST', blurb: 'CONTROLS ARE NORMAL', color: '#3dff8f' },
  TURBO: { label: 'TURBO', blurb: 'CURSOR SPEED ×2', color: '#ff3c3c' },
  DRAG: { label: 'DRAG', blurb: 'CURSOR SPEED ×0.4', color: '#3d8bff' },
  SWELL: { label: 'SWELL', blurb: 'CURSOR SIZE ×1.9', color: '#ffe14d' },
  BLACKOUT: { label: 'BLACKOUT', blurb: 'VISION REDUCED', color: '#b04dff' },
  SPIN: { label: 'SPIN', blurb: 'AXES ROTATED 90°', color: '#ff2bd6' },
};

export const PRESSURE_INFO = {
  phantom: 'PHANTOM HUNTING · REACH THE RESTORE NODE',
  purge: 'PURGE WAVE INCOMING · REACH THE RESTORE NODE',
  decay: 'SIGNAL DECAYING · REACH THE CORE',
  none: 'REACH THE RESTORE NODE',
} as const;
