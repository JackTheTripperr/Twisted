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
  /** drawn in the secondary colour (chokepoint teeth, moving parts) */
  tooth?: boolean;
}

export interface Vec {
  x: number;
  y: number;
}

export interface Disc {
  x: number;
  y: number;
  r: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a modifier zone forces the player to keep moving. */
export type Pressure = 'phantom' | 'purge' | 'decay' | 'none';

export interface ZoneDef {
  kind: ModifierKind;
  poly: Vec[];
  /** optional holes (e.g. the spiral centre) where the zone is NOT active */
  holes?: Vec[][];
  entry: Segment;
  exit: Segment;
  pressure: Pressure;
  /** beats of signal before a decay zone kills */
  decayBeats?: number;
}

/** Per-zone consumable gate nodes: touching the entry activates, touching the exit restores. */
export interface GateState {
  entryUsed: boolean;
  exitUsed: boolean;
}

export interface ZoneState {
  kind: ModifierKind;
  pressure: Pressure;
  /** 0..1 fraction of decay remaining (1 when not a decay zone) */
  decay: number;
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
  zone: ZoneState | null;
  reboots: number;
  /** a reboot core exists on this level and has not been collected */
  pickupAvailable: boolean;
  /** the death currently being shown consumed a reboot */
  rebootUsed: boolean;
  locked: boolean;
  fallbackInput: boolean;
  lastDeathLevel: number;
  winTime: number;
  ghost: boolean;
}
