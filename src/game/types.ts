export type ModifierKind = 'UNTWIST' | 'TURBO' | 'DRAG' | 'SWELL' | 'BLACKOUT' | 'SPIN';

export type Phase = 'title' | 'intro' | 'playing' | 'dying' | 'clear' | 'won' | 'paused';

/** A neon wall tube: a thick segment with round caps (capsule) used for both drawing and collision. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** half thickness */
  ht: number;
  /** true for chokepoint "teeth" (drawn in the accent colour) */
  tooth?: boolean;
}

export interface Vec {
  x: number;
  y: number;
}

export interface LevelGeometry {
  cols: number;
  rows: number;
  cell: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  segs: Segment[];
  start: Vec;
  exit: Vec;
  exitR: number;
  /** pixel centres of the solution path cells */
  solution: Vec[];
}

export interface ModifierState {
  kind: ModifierKind;
  state: 'warn' | 'active';
  /** seconds remaining in the current state */
  remaining: number;
  total: number;
}

export interface Snapshot {
  phase: Phase;
  level: number;
  levelName: string;
  zoneName: string;
  deaths: number;
  runTime: number;
  bestLevel: number;
  bestTime: number | null;
  modifier: ModifierState | null;
  locked: boolean;
  fallbackInput: boolean;
  lastDeathLevel: number;
  winTime: number;
}
