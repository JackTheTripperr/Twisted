export type ModifierKind = 'UNTWIST' | 'TURBO' | 'DRAG' | 'SWELL' | 'BLACKOUT' | 'SPIN';

export type Phase = 'title' | 'intro' | 'playing' | 'dying' | 'over' | 'clear' | 'won' | 'paused';

export type RunMode = 'run' | 'practice' | 'daily' | 'overdrive';

export type Rank = 'S' | 'A' | 'B' | 'C';

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

export interface Mutators {
  mirror: boolean;
  /** soundtrack tempo multiplier (obstacles follow the beat, so they speed up too) */
  tempo: number;
  /** phantom speed multiplier */
  phantom: number;
  /** every gate becomes this kind */
  gateOverride: ModifierKind | null;
}

export interface Options {
  /** mouse sensitivity multiplier */
  sens: number;
  music: number;
  sfx: number;
  shake: boolean;
  /** full-strength flashes and glitches */
  flash: boolean;
  scanlines: boolean;
  /** show the best-run ghost */
  ghost: boolean;
}

export interface LevelResult {
  level: number;
  name: string;
  time: number;
  grazes: number;
  score: number;
  rank: Rank;
  rebootUsed: boolean;
  fragment: boolean;
  core: boolean;
}

export interface RunRecord {
  date: string;
  mode: RunMode;
  score: number;
  level: number;
  time: number;
  deaths: number;
  cleared: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export interface Profile {
  v: number;
  runs: number;
  deaths: number;
  clears: number;
  bestLevel: number;
  bestTime: number | null;
  bestScore: number;
  totalGrazes: number;
  maxCombo: number;
  /** 1..5 sectors available in practice */
  sectorsUnlocked: number;
  overdriveUnlocked: boolean;
  overdriveBest: { level: number; score: number; time: number | null } | null;
  levelBest: Record<string, { time: number; score: number; rank: Rank }>;
  /** levels whose signal fragment has ever been collected */
  fragments: number[];
  achievements: string[];
  history: RunRecord[];
  daily: { key: string; bestScore: number; bestLevel: number; attempts: number; cleared: boolean } | null;
  /** level → flattened [x, y, x, y, ...] sampled at 20 Hz */
  ghosts: Record<string, number[]>;
  options: Options;
}

export interface Snapshot {
  phase: Phase;
  mode: RunMode;
  level: number;
  levelName: string;
  zoneName: string;
  zoneIndex: number;
  runIndex: number;
  runLength: number;
  deaths: number;
  runTime: number;
  zone: ZoneState | null;
  reboots: number;
  pickupAvailable: boolean;
  fragmentAvailable: boolean;
  rebootUsed: boolean;
  locked: boolean;
  fallbackInput: boolean;
  lastDeathLevel: number;
  winTime: number;
  ghost: boolean;
  ghostPlaying: boolean;
  score: number;
  levelScore: number;
  levelGrazes: number;
  combo: number;
  /** 0..1 combo timer */
  comboT: number;
  /** 0..1 surge meter */
  surge: number;
  surgeActive: boolean;
  killer: string;
  /** 0..1 how far along the level the death happened */
  progress: number;
  taunt: string;
  transmission: string;
  sectorBrief: { title: string; text: string } | null;
  results: LevelResult[];
  profile: Profile;
  toast: AchievementDef | null;
  mutators: Mutators;
  dailyKey: string;
  newRecords: string[];
  /** the main run was cleared for the first time this session */
  firstClear: boolean;
  boss: { hp: number; maxHp: number; phase: number; dead: boolean } | null;
  /** big centre text during boss fights (SURVIVE, PHASE II, WARDEN OFFLINE) */
  bossBanner: string;
  /** the Warden fell this run: the over screen may offer a respawn at level 22 */
  checkpoint: boolean;
}
