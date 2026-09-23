import { AudioEngine, type BeatInfo } from '../audio/engine';
import { CLEAR_T, DEATH_T, PRACTICE_T, REBOOT_T, Renderer, type GameView, type PhantomView, type PurgeView } from '../render/renderer';
import { ACHIEVEMENT_BY_ID } from './achievements';
import { getCourse, PLAY, type Course } from './courses';
import { BOSS_SURVIVE_T, createObstacle, damageBoss, fieldPull, hitsObstacle, nearDynamic, nearestSurface, updateObstacle, type Clock, type Obstacle } from './entities';
import { Input } from './input';
import { CHECKPOINT_LEVEL, LEVELS, LEVEL_COUNT, MAX_REBOOTS, ZONES, tabOf, type LevelDef, type Zone } from './levels';
import { collides, distToSegment } from './maze';
import { applyMutators, dailyPlan, NO_MUTATORS, OVERDRIVE_MUTATORS } from './modes';
import { loadProfile, pushHistory, resetProfile, saveProfile, todayKey } from './profile';
import { checkReachable } from './reach';
import {
  CLEAR_BONUS,
  COMBO_WINDOW,
  CORE_POINTS,
  FRAGMENT_POINTS,
  GRAZE_POINTS,
  MAX_COMBO,
  NO_DEATH_BONUS,
  levelBase,
  rankFor,
  rankSquare,
  timeBonus,
} from './score';
import { SECTOR_BRIEFS, TRANSMISSIONS, tauntFor } from './story';
import type {
  AchievementDef,
  GateState,
  LevelResult,
  Mutators,
  Options,
  Phase,
  Profile,
  RunMode,
  Segment,
  Snapshot,
  Vec,
  ZoneDef,
  ZoneState,
} from './types';

const SUBSTEPS = 4;
const PHANTOM_BASE = 115; // px/s at level 5
const PHANTOM_SPAWN_DIST = 170;
const PHANTOM_ARM = 0.6;
const PURGE_SPEED = 36;
const GRAZE_ENTER = 9;
const GRAZE_LEAVE = 15;
const GRAZE_COOLDOWN = 0.22;
const SURGE_MAX = 1.6;
const SURGE_START = 0.6;
const SURGE_PER_GRAZE = 0.45;
const SURGE_SCALE = 0.3;
const DEATH_SLOWMO_T = 0.45;
const GHOST_HZ = 20;
const DEV = import.meta.env.DEV;

const KILLER_NAMES: Record<string, string> = {
  piston: 'PISTON',
  slider: 'SLIDER',
  spinner: 'SPINNER',
  orbit: 'ORBITER',
  door: 'DOOR',
  sweeper: 'LASER',
  pulser: 'PULSE RING',
  crush: 'CRUSH WALL',
  seeker: 'SEEKER',
  well: 'GRAVITY CORE',
  spiral: 'SPIRAL',
  breather: 'BREATHER WALL',
  bouncer: 'BOUNCER',
  turret: 'TURRET BOLT',
  lasergrid: 'LASER GRID',
  mine: 'MINE',
  serpent: 'SERPENT',
  pendulum: 'PENDULUM',
  shutter: 'SHUTTER',
  shrink: 'COMPRESSION',
  boss: 'THE WARDEN',
};
const BOSS_PHASES = ['I', 'II', 'III', 'IV', 'V'];

interface Phantom extends PhantomView {
  vx: number;
  vy: number;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, s: Segment): boolean {
  const d = (bx - ax) * (s.y2 - s.y1) - (by - ay) * (s.x2 - s.x1);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((s.x1 - ax) * (s.y2 - s.y1) - (s.y1 - ay) * (s.x2 - s.x1)) / d;
  const u = ((s.x1 - ax) * (by - ay) - (s.y1 - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export class Game implements GameView {
  // ---- GameView
  phase: Phase = 'title';
  phaseT = 0;
  level = 1;
  zone: Zone = ZONES[0];
  course: Course | null = null;
  obstacles: Obstacle[] = [];
  cursor = { x: 0, y: 0, r: 8 };
  vel: Vec = { x: 0, y: 0 };
  activeZone: ZoneDef | null = null;
  gates: GateState[] = [];
  phantom: Phantom | null = null;
  purge: PurgeView | null = null;
  pickupTaken = false;
  fragmentTaken = false;
  hasMoved = false;
  near: { seg: Segment; d: number }[] = [];
  ghost = false;
  clock: Clock = { beat: 0, bars: 0, dt: 0, kick: 0 };
  ghostPos: Vec | null = null;
  surgeActive = false;
  surgeT = 0;
  zoom = { x: 640, y: 360, s: 1 };
  boss: Obstacle | null = null;
  get bossBlackout() {
    return this.boss?.boss?.blackout ?? 0;
  }
  get attract() {
    return this.phase === 'title';
  }
  get zoneState(): ZoneState | null {
    const z = this.activeZone;
    if (!z) return null;
    return { kind: z.kind, pressure: z.pressure, decay: z.pressure === 'decay' && z.decayBeats ? Math.max(0, this.decayLeft / z.decayBeats) : 1 };
  }

  // ---- internals
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  readonly input: Input;
  profile: Profile;
  private stage: HTMLElement;
  private def: LevelDef = LEVELS[0];
  private mode: RunMode = 'run';
  private mutators: Mutators = NO_MUTATORS;
  private levelList: number[] = [];
  private runIndex = 0;
  private dailyKey = '';
  private levelT = 0;
  private clockT = 0;
  private runTime = 0;
  private deaths = 0;
  private lastDeathLevel = 0;
  private winTime = 0;
  private reboots = 0;
  private collected = new Set<number>();
  private fragmentsRun = new Set<number>();
  private rebootUsed = false;
  private scale = 1;
  private raf = 0;
  private lastFrame = 0;
  private listeners = new Set<(s: Snapshot) => void>();
  private snapTimer = 0;
  private destroyed = false;
  private levelBeatAcc = 0;
  private lastRawBeat = 0;
  private lastBeat = 0;
  private decayLeft = 0;
  private purgeStartBeat = 0;
  private startOverride = 0;
  private timeScale = 1;
  // scoring
  private score = 0;
  private levelScore = 0;
  private grazesRun = 0;
  private grazesLevel = 0;
  private combo = 1;
  private comboT = 0;
  private inBand = false;
  private grazeCooldown = 0;
  private results: LevelResult[] = [];
  private killer = '';
  private progress = 0;
  private taunt = '';
  private newRecords: string[] = [];
  private firstClear = false;
  // surge
  private surge = SURGE_START;
  private surgeHeld = false;
  private surgeTotal = 0;
  // achievements / toasts
  private toastQueue: AchievementDef[] = [];
  private toast: AchievementDef | null = null;
  private toastT = 0;
  private phantomAliveT = 0;
  // ghosts
  private ghostRec: number[] = [];
  private ghostAcc = 0;
  private ghostPlay: number[] | null = null;
  // boss / checkpoint
  private bossBanner = '';
  private bossBannerT = 0;
  private bossPhantom = false;
  private checkpoint = false;
  private checkpointUsed = false;

  constructor(canvas: HTMLCanvasElement, stage: HTMLElement, lockEl: HTMLElement) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.input = new Input(lockEl);
    this.profile = loadProfile();
    this.input.onLockChange = (locked) => {
      if (!locked && !this.input.fallback && (this.phase === 'playing' || this.phase === 'intro')) this.pause();
      this.publish();
    };
    if (DEV) {
      const q = new URLSearchParams(location.search).get('level');
      const n = q ? parseInt(q, 10) : 0;
      if (n >= 1 && n <= LEVEL_COUNT) this.startOverride = n;
    }
    this.applyOptions();
    this.setupAttract();
    this.applyPalette();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
  }

  // ------------------------------------------------------------------ pub/sub

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private snapshot(): Snapshot {
    const sectorFirst = this.mode !== 'practice' && this.mode !== 'daily' && this.def.first;
    const bs = this.boss?.boss ?? null;
    return {
      phase: this.phase,
      mode: this.mode,
      level: this.level,
      levelName: this.def.name,
      zoneName: this.zone.name,
      zoneIndex: this.def.zone,
      runIndex: this.runIndex,
      runLength: this.levelList.length,
      deaths: this.deaths,
      runTime: this.runTime,
      zone: this.zoneState,
      reboots: this.reboots,
      pickupAvailable: !!this.course?.pickup && !this.pickupTaken,
      fragmentAvailable: !!this.course?.fragment && !this.fragmentTaken,
      rebootUsed: this.rebootUsed,
      locked: this.input.locked,
      fallbackInput: this.input.fallback,
      lastDeathLevel: this.lastDeathLevel,
      winTime: this.winTime,
      ghost: this.ghost,
      ghostPlaying: !!this.ghostPlay,
      score: this.score,
      levelScore: this.levelScore,
      levelGrazes: this.grazesLevel,
      combo: this.combo,
      comboT: this.comboT / COMBO_WINDOW,
      surge: this.surge / SURGE_MAX,
      surgeActive: this.surgeActive,
      killer: this.killer,
      progress: this.progress,
      taunt: this.taunt,
      transmission: this.phase === 'title' ? '' : TRANSMISSIONS[this.level - 1] ?? '',
      sectorBrief: sectorFirst && this.phase === 'intro' ? SECTOR_BRIEFS[this.def.zone] : null,
      results: this.results,
      profile: this.profile,
      toast: this.toast,
      mutators: this.mutators,
      dailyKey: this.dailyKey,
      newRecords: this.newRecords,
      firstClear: this.firstClear,
      boss: bs
        ? {
            hp: bs.hp,
            maxHp: bs.maxHp,
            phase: bs.phase,
            dead: bs.dead,
            stage: this.phase === 'intro' ? 'intro' : bs.stage,
            timeLeft: Math.max(0, BOSS_SURVIVE_T - bs.phaseT),
          }
        : null,
      bossBanner: this.bossBanner,
      checkpoint: this.checkpoint && (this.mode === 'run' || this.mode === 'overdrive'),
    };
  }

  private publish() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  setScale(s: number) {
    this.scale = s;
  }

  // ------------------------------------------------------------------ options / profile

  setOptions(patch: Partial<Options>) {
    this.profile.options = { ...this.profile.options, ...patch };
    this.applyOptions();
    saveProfile(this.profile);
    this.publish();
  }

  private applyOptions() {
    const o = this.profile.options;
    this.audio.setVolumes(o.music, o.sfx);
    this.renderer.setOptions(o.shake, o.flash);
  }

  resetProgress() {
    const opts = this.profile.options;
    this.profile = resetProfile();
    this.profile.options = opts;
    saveProfile(this.profile);
    this.publish();
  }

  private unlock(id: string) {
    if (this.profile.achievements.includes(id)) return;
    const def = ACHIEVEMENT_BY_ID[id];
    if (!def) return;
    this.profile.achievements.push(id);
    saveProfile(this.profile);
    this.toastQueue.push(def);
    this.audio.sfxAchievement();
  }

  // ------------------------------------------------------------------ flow

  /** Start a run from the title (a user gesture, so audio may start). */
  async startRun(mode: 'run' | 'overdrive' | 'daily') {
    if (this.phase !== 'title' && this.phase !== 'over' && this.phase !== 'won') return;
    this.mode = mode;
    if (mode === 'daily') {
      this.dailyKey = todayKey();
      const plan = dailyPlan(this.dailyKey);
      this.levelList = plan.levels;
      this.mutators = plan.mutators;
      const d = this.profile.daily;
      if (!d || d.key !== this.dailyKey) this.profile.daily = { key: this.dailyKey, bestScore: 0, bestLevel: 0, attempts: 0, cleared: false };
      this.profile.daily!.attempts++;
    } else {
      this.levelList = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
      this.mutators = mode === 'overdrive' ? OVERDRIVE_MUTATORS : NO_MUTATORS;
      if (DEV && this.startOverride) this.levelList = this.levelList.slice(this.startOverride - 1);
    }
    this.profile.runs++;
    saveProfile(this.profile);
    await this.launch();
  }

  async startPractice(level: number) {
    if (this.phase !== 'title' && this.phase !== 'won' && this.phase !== 'over') return;
    this.mode = 'practice';
    this.mutators = NO_MUTATORS;
    this.levelList = [level];
    await this.launch();
  }

  private async launch() {
    await this.audio.start();
    this.audio.setTempoMult(this.mutators.tempo);
    this.audio.sfxStart();
    this.renderer.flash('#ffffff', 0.9);
    this.renderer.shake(0.6);
    this.renderer.glitch(0.8);
    this.resetRun();
    await this.input.requestLock();
    this.runIndex = 0;
    this.startLevel(this.levelList[0]);
  }

  /** Play the same configuration again (from the over / won screens). */
  async runAgain() {
    if (this.phase !== 'over' && this.phase !== 'won') return;
    if (this.mode === 'practice') await this.startPractice(this.levelList[0]);
    else await this.startRun(this.mode);
  }

  async practiceNext() {
    if (this.mode !== 'practice' || this.phase !== 'won') return;
    const n = Math.min(LEVEL_COUNT, this.levelList[0] + 1);
    if (tabOf(n) + 1 > this.profile.sectorsUnlocked) return;
    await this.startPractice(n);
  }

  /** The level intro holds until the player clicks. */
  startPlay() {
    if (this.phase !== 'intro') return;
    this.phase = 'playing';
    this.phaseT = 0;
    this.levelT = 0;
    this.clockT = 0;
    this.levelBeatAcc = 0;
    this.lastRawBeat = this.audio.beatInfo().beat;
    this.lastBeat = 0;
    this.input.clear();
    this.renderer.flash('#ffffff', 0.35);
    this.renderer.ring(this.cursor.x, this.cursor.y, this.zone.primary, 500, 3, 260);
    this.audio.sfxGo();
    if (this.boss) this.showBanner('SURVIVE', 2.6, true);
    this.publish();
  }

  private showBanner(text: string, secs: number, alarm: boolean) {
    this.bossBanner = text;
    this.bossBannerT = secs;
    if (alarm) this.audio.sfxBossAlarm();
    this.renderer.glitch(0.5);
    this.renderer.chroma(6);
    this.publish();
  }

  /** Turn the boss's one-shot cues into banners, sound and effects, and keep the music in step with the fight. */
  private drainBossCues() {
    const o = this.boss;
    const b = o?.boss;
    if (!b) {
      this.audio.setBoss(0, 'none');
      return;
    }
    const musicPhase = this.phase === 'intro' || this.phase === 'title' ? 0 : b.phase;
    this.audio.setBoss(musicPhase, this.phase === 'intro' ? 'intro' : b.stage);
    if (!b.events.length) return;
    const cues = b.events.splice(0);
    if (this.phase !== 'playing') return;
    for (const cue of cues) {
      if (cue === 'laser') {
        this.audio.sfxLaserCharge();
        this.renderer.ring(b.origin.x, b.origin.y, '#ff2d55', 300, 3, 160);
      } else if (cue === 'spiral-warn') {
        this.audio.sfxSpiralWarn();
        this.showBanner('INCOMING', 1.8, false);
        if (b.spiral) this.renderer.ring(b.spiral.cx, b.spiral.cy, '#ffffff', 260, 2, 190);
      } else if (cue === 'spiral-live') {
        this.audio.sfxBreach();
        this.showBanner('BREACH', 1.6, false);
        if (b.spiral) {
          this.renderer.ring(b.spiral.cx, b.spiral.cy, '#ff2d55', 700, 5, 420);
          this.renderer.burst(b.spiral.cx, b.spiral.cy, ['#ffffff', '#ff2d55'], 40);
        }
        this.renderer.shake(0.35);
      } else if (cue === 'survive') {
        this.showBanner('SURVIVE', 2.2, true);
      }
    }
  }

  /** The player grabbed the weak point riding in the Warden's spiral. */
  private hitBoss() {
    const o = this.boss!;
    const b = o.boss!;
    const pk = b.pickup!;
    const box = (o.def as { box: { w: number; h: number; y: number } }).box;
    const target = { x: b.boxX + box.w / 2, y: box.y + box.h / 2 };
    const dead = damageBoss(o, this.clock.beat);
    this.renderer.arc(pk.x, pk.y, target.x, target.y, 0.5);
    this.renderer.burst(pk.x, pk.y, ['#ffffff', this.zone.primary, this.zone.secondary], 90);
    this.renderer.ring(pk.x, pk.y, '#ffffff', 700, 4, 600);
    this.renderer.shake(1);
    this.renderer.chroma(10);
    this.renderer.flash('#ffffff', 0.55);
    this.audio.sfxBossHit();
    this.bossPhantom = false;
    if (this.phantom) this.phantom.alive = false;
    if (dead) {
      this.levelScore += 2500;
      this.renderer.explode(target.x, target.y, ['#ffffff', '#ff2d55', this.zone.secondary, this.zone.accent], 220);
      this.renderer.ring(target.x, target.y, '#ff2d55', 900, 8, 1200);
      this.renderer.shake(1.4);
      this.renderer.glitch(1.2);
      this.audio.sfxBossDie();
      this.showBanner('WARDEN OFFLINE', 3, false);
      const tier = (o.def as { tier: number }).tier;
      this.unlock(tier === 2 ? 'warden_prime' : 'warden_down');
      if (b.breachT < 4) this.unlock('untouched_boss');
      if (tier === 1 && (this.mode === 'run' || this.mode === 'overdrive')) this.checkpoint = true;
    } else {
      this.levelScore += 800;
      if (b.breachT < 4) this.unlock('untouched_boss');
      this.renderer.floatText(pk.x, pk.y - 30, 'WARDEN HIT +800', '#ffffff', 18);
      this.showBanner(`PHASE ${BOSS_PHASES[b.phase - 1] ?? b.phase}`, 2.1, true);
    }
    this.publish();
  }

  async resume() {
    if (this.phase !== 'paused') return;
    await this.audio.start();
    if (!this.input.fallback) {
      const ok = await this.input.requestLock();
      if (!ok && !this.input.fallback) {
        this.publish();
        return;
      }
    }
    this.input.clear();
    this.startLevel(this.level);
  }

  /** Practice only: restart the current level from the pause menu. */
  async restartLevel() {
    if (this.mode !== 'practice' || this.phase !== 'paused') return;
    await this.resume();
  }

  quitToTitle() {
    if (this.phase === 'title') return;
    if (this.phase === 'playing' || this.phase === 'intro' || this.phase === 'paused') this.recordRunEnd(false);
    this.input.releaseLock();
    this.phase = 'title';
    this.phaseT = 0;
    this.mode = 'run';
    this.mutators = NO_MUTATORS;
    this.activeZone = null;
    this.phantom = null;
    this.purge = null;
    this.surgeActive = false;
    this.audio.setSurge(false);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    this.audio.setTempoMult(1);
    this.audio.setMode('title', 0);
    this.boss = null;
    this.bossBanner = '';
    this.setupAttract();
    this.applyPalette();
    this.zoom = { x: 640, y: 360, s: 1 };
    this.publish();
  }

  /** Continue the run from the checkpoint written when the Warden fell. */
  async respawnCheckpoint() {
    if (this.phase !== 'over' || !this.checkpoint || (this.mode !== 'run' && this.mode !== 'overdrive')) return;
    const idx = this.levelList.indexOf(CHECKPOINT_LEVEL);
    if (idx < 0) return;
    this.checkpointUsed = true;
    await this.audio.start();
    if (!this.input.fallback) await this.input.requestLock();
    this.runIndex = idx;
    this.startLevel(this.levelList[idx]);
  }

  private resetRun() {
    this.checkpoint = false;
    this.checkpointUsed = false;
    this.deaths = 0;
    this.runTime = 0;
    this.reboots = 0;
    this.collected.clear();
    this.fragmentsRun.clear();
    this.score = 0;
    this.grazesRun = 0;
    this.results = [];
    this.surgeTotal = 0;
    this.newRecords = [];
    this.firstClear = false;
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    return this.audio.muted;
  }

  setSurgeHeld(held: boolean) {
    this.surgeHeld = held;
  }

  // dev helpers (wired to keys in dev builds only)
  toggleGhost() {
    if (!DEV) return false;
    this.ghost = !this.ghost;
    this.publish();
    return this.ghost;
  }
  devJump(delta: number) {
    if (!DEV || this.phase === 'title') return;
    const idx = Math.max(0, Math.min(this.levelList.length - 1, this.runIndex + delta));
    this.runIndex = idx;
    this.startLevel(this.levelList[idx]);
  }

  private pause() {
    this.phase = 'paused';
    this.phaseT = 0;
    this.surgeActive = false;
    this.audio.setSurge(false);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    this.publish();
  }

  private startLevel(n: number) {
    this.level = n;
    this.def = LEVELS[n - 1];
    this.zone = ZONES[this.def.zone];
    this.course = applyMutators(getCourse(n), this.mutators);
    this.obstacles = this.course.obstacles.map(createObstacle);
    this.boss = this.obstacles.find((o) => o.def.kind === 'boss') ?? null;
    this.bossBanner = '';
    this.bossBannerT = 0;
    this.bossPhantom = false;
    this.gates = this.course.zones.map(() => ({ entryUsed: false, exitUsed: false }));
    this.cursor = { x: this.course.start.x, y: this.course.start.y, r: this.def.cursorR };
    this.vel = { x: 0, y: 0 };
    this.phase = 'intro';
    this.phaseT = 0;
    this.levelT = 0;
    this.clockT = 0;
    this.hasMoved = false;
    this.activeZone = null;
    this.phantom = null;
    this.purge = null;
    this.decayLeft = 0;
    this.pickupTaken = this.collected.has(n) || (this.mode === 'practice' ? false : false);
    this.fragmentTaken = this.fragmentsRun.has(n);
    this.rebootUsed = false;
    this.near = [];
    this.levelScore = 0;
    this.grazesLevel = 0;
    this.combo = 1;
    this.comboT = 0;
    this.inBand = false;
    this.grazeCooldown = 0;
    this.surge = SURGE_START;
    this.surgeActive = false;
    this.audio.setSurge(false);
    this.timeScale = 1;
    this.phantomAliveT = 0;
    this.killer = '';
    this.progress = 0;
    this.zoom = { x: this.course.start.x, y: this.course.start.y, s: 1.35 };
    const b = this.audio.beatInfo();
    this.levelBeatAcc = 0;
    this.lastRawBeat = b.beat;
    this.lastBeat = 0;
    this.clock = { beat: 0, bars: 0, dt: 0, kick: b.kick };
    // ghosts: replay the best on unmirrored run / practice levels
    this.ghostRec = [];
    this.ghostAcc = 0;
    const g = this.profile.ghosts[String(n)];
    this.ghostPlay = g && this.profile.options.ghost && !this.mutators.mirror && (this.mode === 'run' || this.mode === 'practice') ? g : null;
    this.ghostPos = null;
    this.renderer.setLevel(this.course.walls, this.course.start, this.zone);
    this.renderer.ring(this.course.start.x, this.course.start.y, this.zone.primary, 300, 3, 200);
    this.audio.setMode('full', n, n === 41 ? 156 : this.zone.bpm);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    if (this.mode === 'run' && n > this.profile.bestLevel) {
      this.profile.bestLevel = n;
      if (!this.newRecords.includes('DEEPEST RUN')) this.newRecords.push('DEEPEST RUN');
    }
    if (this.mode === 'run' || this.mode === 'overdrive') {
      const sector = tabOf(n) + 1;
      if (sector > this.profile.sectorsUnlocked) this.profile.sectorsUnlocked = sector;
      if (n === 10) this.unlock('deep_dive');
      if (n === 17) this.unlock('breach');
      if (this.def.first && n > 1) this.audio.sfxSector();
    }
    saveProfile(this.profile);
    this.applyPalette();
    this.input.clear();
    if (DEV) {
      const rr = checkReachable(this.course, this.def.cursorR);
      if (!rr.goal) console.warn(`[twisted] level ${n}: goal not statically reachable`);
      if (rr.pickup === false) console.warn(`[twisted] level ${n}: reboot core not statically reachable`);
    }
    if (this.input.supported && !this.input.locked && !this.input.fallback) {
      this.pause();
      return;
    }
    this.publish();
  }

  private die(killer: string) {
    if (this.phase !== 'playing' || this.ghost) return;
    this.deaths++;
    this.profile.deaths++;
    this.lastDeathLevel = this.level;
    this.killer = killer;
    const c = this.course!;
    const total = Math.hypot(c.goal.x - c.start.x, c.goal.y - c.start.y) || 1;
    this.progress = Math.max(0, Math.min(1, 1 - Math.hypot(c.goal.x - this.cursor.x, c.goal.y - this.cursor.y) / total));
    this.taunt = tauntFor(killer, this.profile.deaths);
    this.phase = 'dying';
    this.phaseT = 0;
    this.activeZone = null;
    this.purge = null;
    if (this.phantom) this.phantom.alive = false;
    this.surgeActive = false;
    this.audio.setSurge(false);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    this.zoom = { x: this.cursor.x, y: this.cursor.y, s: 1 };
    this.unlock('first_blood');
    this.rebootUsed = this.mode !== 'practice' && this.reboots > 0;
    if (this.rebootUsed) {
      this.reboots--;
      this.unlock('core_saved');
      this.renderer.explode(this.cursor.x, this.cursor.y, ['#ffffff', this.zone.primary, this.zone.accent], 110);
      this.renderer.ring(this.cursor.x, this.cursor.y, '#ffffff', 600, 5, 700);
      this.renderer.shake(0.8);
      this.renderer.glitch(0.8);
      this.renderer.chroma(9);
      this.renderer.flash('#ffffff', 0.6);
      this.audio.sfxReboot();
    } else {
      this.renderer.explode(this.cursor.x, this.cursor.y, [this.zone.primary, this.zone.secondary, '#ffffff', '#ff2d55'], 170);
      this.renderer.ring(this.cursor.x, this.cursor.y, '#ff2d55', 700, 6, 900);
      this.renderer.ring(this.cursor.x, this.cursor.y, '#ffffff', 420, 3, 600);
      this.renderer.shake(1.2);
      this.renderer.glitch(1.2);
      this.renderer.chroma(14);
      this.renderer.flash('#ff2d55', 0.75);
      this.audio.sfxDeath();
    }
    this.stage.style.setProperty('--danger', '1');
    saveProfile(this.profile);
    this.publish();
  }

  private clearLevel() {
    if (this.phase !== 'playing') return;
    this.phase = 'clear';
    this.phaseT = 0;
    this.activeZone = null;
    this.purge = null;
    if (this.phantom) this.phantom.alive = false;
    this.surgeActive = false;
    this.audio.setSurge(false);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    const e = this.course!.goal;
    this.zoom = { x: e.x, y: e.y, s: 1 };
    // scoring
    const t = this.levelT;
    const rank = rankFor(this.level, t);
    const bonus = levelBase(this.level) + timeBonus(this.level, t);
    this.levelScore += bonus;
    this.score += this.levelScore;
    const result: LevelResult = {
      level: this.level,
      name: this.def.name,
      time: t,
      grazes: this.grazesLevel,
      score: this.levelScore,
      rank,
      rebootUsed: false,
      fragment: this.fragmentsRun.has(this.level),
      core: this.collected.has(this.level),
    };
    this.results.push(result);
    this.renderer.floatText(e.x, e.y - 40, `+${bonus}`, '#ffffff', 22);
    this.renderer.floatText(e.x, e.y - 70, `RANK ${rank}`, rank === 'S' ? '#ffe14d' : this.zone.secondary, 18);
    // records
    if (!this.mutators.mirror && (this.mode === 'run' || this.mode === 'practice')) {
      const key = String(this.level);
      const best = this.profile.levelBest[key];
      if (!best || t < best.time) {
        this.profile.levelBest[key] = { time: t, score: this.levelScore, rank };
        if (best) this.newRecords.push(`LEVEL ${String(this.level).padStart(2, '0')} TIME`);
        if (this.ghostRec.length > 4) this.profile.ghosts[key] = this.ghostRec.map((n) => Math.round(n));
      } else if (this.levelScore > best.score) {
        this.profile.levelBest[key] = { ...best, score: this.levelScore, rank: best.rank };
      }
    }
    if (this.level === 1) this.unlock('first_steps');
    if ((this.mode === 'run' || this.mode === 'overdrive') && this.level % 4 === 0) {
      const sectorResults = this.results.slice(-4);
      if (sectorResults.length === 4 && sectorResults.every((r) => r.rank === 'S' && r.level > this.level - 4)) this.unlock('perfect_sector');
    }
    saveProfile(this.profile);
    this.renderer.burst(e.x, e.y, [this.zone.secondary, this.zone.accent, this.zone.primary], 120);
    this.renderer.ring(e.x, e.y, this.zone.secondary, 900, 5, 1100);
    this.renderer.ring(e.x, e.y, '#ffffff', 500, 2, 700);
    this.renderer.flash(this.zone.secondary, 0.5);
    this.renderer.shake(0.35);
    this.renderer.chroma(6);
    this.audio.sfxClear();
    this.publish();
  }

  private collect() {
    this.pickupTaken = true;
    this.collected.add(this.level);
    this.reboots = Math.min(MAX_REBOOTS, this.reboots + 1);
    this.levelScore += CORE_POINTS;
    const p = this.course!.pickup!;
    this.renderer.burst(p.x, p.y, ['#ffffff', this.zone.primary, this.zone.accent], 70);
    this.renderer.ring(p.x, p.y, '#ffffff', 500, 4, 400);
    this.renderer.flash('#ffffff', 0.35);
    this.renderer.chroma(4);
    this.renderer.floatText(p.x, p.y - 30, `REBOOT CORE +${CORE_POINTS}`, '#ffffff', 16);
    this.audio.sfxPickup();
    if (this.reboots >= MAX_REBOOTS) this.unlock('core_collector');
    if (this.collected.size >= 4) this.unlock('all_cores');
    this.publish();
  }

  private collectFragment() {
    this.fragmentTaken = true;
    this.fragmentsRun.add(this.level);
    this.levelScore += FRAGMENT_POINTS;
    const f = this.course!.fragment!;
    this.renderer.burst(f.x, f.y, [this.zone.primary, '#ffffff'], 40);
    this.renderer.ring(f.x, f.y, this.zone.primary, 400, 3, 260);
    this.renderer.floatText(f.x, f.y - 26, `FRAGMENT +${FRAGMENT_POINTS}`, this.zone.primary, 15);
    this.audio.sfxFragment();
    if (!this.profile.fragments.includes(this.level)) {
      this.profile.fragments.push(this.level);
      saveProfile(this.profile);
    }
    if (this.fragmentsRun.size >= 10) this.unlock('fragment_10');
    if (this.profile.fragments.length >= LEVEL_COUNT) this.unlock('full_signal');
    this.publish();
  }

  private graze() {
    this.grazesLevel++;
    this.grazesRun++;
    this.profile.totalGrazes++;
    const pts = GRAZE_POINTS * this.combo;
    this.levelScore += pts;
    this.surge = Math.min(SURGE_MAX, this.surge + SURGE_PER_GRAZE);
    this.renderer.graze(this.cursor.x, this.cursor.y, this.combo >= 4 ? '#ffe14d' : this.zone.primary, `+${pts}${this.combo > 1 ? ` ×${this.combo}` : ''}`);
    this.audio.sfxGraze(this.combo);
    this.combo = Math.min(MAX_COMBO, this.combo + 1);
    this.comboT = COMBO_WINDOW;
    if (this.combo > this.profile.maxCombo) this.profile.maxCombo = this.combo;
    if (this.combo >= MAX_COMBO) this.unlock('combo_8');
    if (this.grazesRun >= 50) this.unlock('graze_50');
  }

  private win() {
    this.phase = 'won';
    this.phaseT = 0;
    this.winTime = this.runTime;
    this.zoom = { x: 640, y: 360, s: 1 };
    let bonus = CLEAR_BONUS;
    if (this.deaths === 0) bonus += NO_DEATH_BONUS;
    this.score += bonus;
    const p = this.profile;
    if (this.mode === 'run') {
      if (p.clears === 0) this.firstClear = true;
      p.clears++;
      if (!p.overdriveUnlocked) {
        p.overdriveUnlocked = true;
        this.newRecords.push('OVERDRIVE UNLOCKED');
      }
      if (p.bestTime === null || this.runTime < p.bestTime) {
        p.bestTime = this.runTime;
        this.newRecords.push('FASTEST CLEAR');
      }
      if (this.score > p.bestScore) {
        p.bestScore = this.score;
        this.newRecords.push('HIGH SCORE');
      }
      this.unlock('untwisted');
      if (!this.checkpointUsed) this.unlock('no_checkpoint');
      if (this.deaths === 0) this.unlock('iron_will');
      if (this.runTime < 12 * 60) this.unlock('speedrunner');
    } else if (this.mode === 'overdrive') {
      if (!p.overdriveBest || this.score > p.overdriveBest.score) {
        p.overdriveBest = { level: LEVEL_COUNT, score: this.score, time: this.runTime };
        this.newRecords.push('OVERDRIVE BEST');
      }
      this.unlock('overdrive_clear');
    } else if (this.mode === 'daily') {
      const d = p.daily!;
      d.cleared = true;
      d.bestLevel = this.levelList.length;
      if (this.score > d.bestScore) {
        d.bestScore = this.score;
        this.newRecords.push('DAILY BEST');
      }
      this.unlock('daily_clear');
    }
    if (this.surgeTotal >= 10) this.unlock('surge_master');
    if (this.mode !== 'practice') pushHistory(p, { date: todayKey(), mode: this.mode, score: this.score, level: this.level, time: this.runTime, deaths: this.deaths, cleared: true });
    saveProfile(p);
    this.audio.setMode('win', LEVEL_COUNT);
    this.audio.sfxWin();
    this.renderer.flash('#ffffff', 1);
    this.input.releaseLock();
    this.publish();
  }

  /** A death with no reboot: the run is over. */
  private runOver() {
    this.phase = 'over';
    this.phaseT = 0;
    this.zoom = { x: 640, y: 360, s: 1 };
    this.recordRunEnd(true);
    this.input.releaseLock();
    this.publish();
  }

  private recordRunEnd(died: boolean) {
    if (this.mode === 'practice') return;
    const p = this.profile;
    const reached = this.results.length;
    if (this.mode === 'run' && this.score > p.bestScore) {
      p.bestScore = this.score;
      this.newRecords.push('HIGH SCORE');
    }
    if (this.mode === 'overdrive' && (!p.overdriveBest || this.score > p.overdriveBest.score)) {
      p.overdriveBest = { level: this.level, score: this.score, time: null };
      this.newRecords.push('OVERDRIVE BEST');
    }
    if (this.mode === 'daily' && p.daily) {
      if (this.score > p.daily.bestScore) {
        p.daily.bestScore = this.score;
        this.newRecords.push('DAILY BEST');
      }
      p.daily.bestLevel = Math.max(p.daily.bestLevel, reached);
    }
    if (this.surgeTotal >= 10) this.unlock('surge_master');
    pushHistory(p, { date: todayKey(), mode: this.mode, score: this.score, level: this.level, time: this.runTime, deaths: this.deaths, cleared: false });
    void died;
    saveProfile(p);
  }

  /** Shareable text summary of the last run. */
  shareText(): string {
    const total = this.levelList.length;
    const squares: string[] = [];
    for (let i = 0; i < total; i++) {
      const r = this.results[i];
      if (r) squares.push(rankSquare(r.rank));
      else if (i === this.results.length && this.phase === 'over') squares.push(rankSquare('X'));
      else squares.push(rankSquare('-'));
    }
    const rows: string[] = [];
    for (let i = 0; i < squares.length; i += 10) rows.push(squares.slice(i, i + 10).join(''));
    const label = this.mode === 'daily' ? `DAILY ${this.dailyKey}` : this.mode === 'overdrive' ? 'OVERDRIVE' : this.mode === 'practice' ? `PRACTICE L${this.level}` : 'RUN';
    const cleared = this.phase === 'won';
    const mm = Math.floor(this.runTime / 60);
    const ss = String(Math.floor(this.runTime % 60)).padStart(2, '0');
    return `TWISTED ${label} · ${cleared ? 'UNTWISTED' : `LOST ON L${this.level}`} · ${Math.round(this.score).toLocaleString('en-US')} pts · ${mm}:${ss} · ${this.deaths} deaths\n${rows.join('\n')}`;
  }

  private applyPalette() {
    const s = this.stage.style;
    s.setProperty('--primary', this.zone.primary);
    s.setProperty('--secondary', this.zone.secondary);
    s.setProperty('--accent', this.zone.accent);
    s.setProperty('--hue', String(this.zone.hue));
  }

  // ------------------------------------------------------------------ attract mode (title demo)

  private setupAttract() {
    this.def = LEVELS[0];
    this.course = getCourse(18);
    this.obstacles = this.course.obstacles.map(createObstacle);
    this.gates = this.course.zones.map(() => ({ entryUsed: false, exitUsed: false }));
    this.zone = ZONES[0];
    this.cursor = { x: this.course.start.x, y: this.course.start.y, r: 8 };
    this.pickupTaken = true;
    this.fragmentTaken = true;
    this.ghostPlay = null;
    this.ghostPos = null;
    this.renderer.setLevel(this.course.walls, this.course.start, this.zone);
  }

  // ------------------------------------------------------------------ loop

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const beat = this.audio.beatInfo();
    this.update(dt, beat);
    const s = this.stage.style;
    s.setProperty('--kick', beat.kick.toFixed(3));
    s.setProperty('--snare', beat.snare.toFixed(3));
    s.setProperty('--hat', beat.hat.toFixed(3));
    const beatN = String(Math.floor(beat.beat) % 4);
    if (this.stage.dataset.beat !== beatN) this.stage.dataset.beat = beatN;
    const zs = this.zoneState;
    s.setProperty('--decay', zs ? zs.decay.toFixed(3) : '1');
    s.setProperty('--surge', (this.surge / SURGE_MAX).toFixed(3));
    s.setProperty('--combo', (this.comboT / COMBO_WINDOW).toFixed(3));
    this.renderer.frame(this, beat, dt, dt * this.timeScale);
    this.drainBossCues();
    if (this.bossBannerT > 0) {
      this.bossBannerT -= dt;
      if (this.bossBannerT <= 0) {
        this.bossBanner = '';
        this.publish();
      }
    }
    // toasts
    if (this.toast) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toast = null;
        this.publish();
      }
    } else if (this.toastQueue.length) {
      this.toast = this.toastQueue.shift()!;
      this.toastT = 3.4;
      this.publish();
    }
    this.snapTimer += dt;
    if (this.snapTimer > 0.15) {
      this.snapTimer = 0;
      if (this.phase === 'playing') this.publish();
    }
  };

  /** Advance the level-relative beat clock by the audio's progress, scaled by the current time dilation. */
  private advanceBeat(beat: BeatInfo, dt: number): number {
    const ctx = this.audio.ctx;
    let rawDelta: number;
    if (ctx && ctx.state !== 'running') rawDelta = (dt * beat.bpm) / 60;
    else {
      rawDelta = Math.max(0, beat.beat - this.lastRawBeat);
      this.lastRawBeat = beat.beat;
    }
    this.levelBeatAcc += rawDelta * this.timeScale;
    return this.levelBeatAcc;
  }

  private update(dt: number, beat: BeatInfo) {
    this.phaseT += dt;
    this.clockT += dt;
    const { dx, dy } = this.input.consume();
    // time dilation
    if (this.phase === 'playing') {
      const want = this.surgeHeld && this.surge > 0;
      if (want !== this.surgeActive) {
        this.surgeActive = want;
        this.audio.setSurge(want);
        if (want) this.renderer.ring(this.cursor.x, this.cursor.y, '#ffffff', 700, 3, 400);
      }
      if (this.surgeActive) {
        this.surge = Math.max(0, this.surge - dt);
        this.surgeTotal += dt;
        this.surgeT += dt;
        if (this.surge <= 0) {
          this.surgeActive = false;
          this.audio.setSurge(false);
        }
      } else this.surgeT = 0;
      this.timeScale = this.surgeActive ? SURGE_SCALE : 1;
    } else if (this.phase === 'dying') {
      this.timeScale = this.phaseT < DEATH_SLOWMO_T ? 0.15 : 1;
    } else this.timeScale = 1;

    const b1 = this.advanceBeat(beat, dt);
    const b0 = this.lastBeat;
    this.lastBeat = b1;
    this.clock = { beat: b1, bars: b1 / 4, dt, kick: beat.kick };
    this.updateZoom(dt);

    switch (this.phase) {
      case 'title':
      case 'intro':
        this.animateObstacles(b1, dt, beat.kick, false);
        break;
      case 'playing':
        this.levelT += dt;
        this.runTime += dt;
        this.simulate(dx, dy, dt, b0, b1, beat.kick);
        break;
      case 'dying':
        this.vel = { x: 0, y: 0 };
        this.animateObstacles(b1, dt * this.timeScale, beat.kick, false);
        if (this.phaseT >= (this.mode === 'practice' ? PRACTICE_T : this.rebootUsed ? REBOOT_T : DEATH_T)) {
          this.stage.style.setProperty('--danger', '0');
          if (this.mode === 'practice' || this.rebootUsed) this.startLevel(this.level);
          else this.runOver();
        }
        break;
      case 'clear':
        this.vel = { x: 0, y: 0 };
        this.animateObstacles(b1, dt, beat.kick, false);
        if (this.phaseT >= CLEAR_T) {
          if (this.runIndex + 1 >= this.levelList.length) this.win();
          else {
            this.runIndex++;
            this.startLevel(this.levelList[this.runIndex]);
          }
        }
        break;
      case 'won':
      case 'over':
      case 'paused':
        break;
    }
  }

  private updateZoom(dt: number) {
    const z = this.zoom;
    let target = 1;
    let rate = 6;
    if (this.phase === 'clear') {
      target = 1 + 1.7 * ease(Math.min(1, this.phaseT / CLEAR_T));
      rate = 30;
    } else if (this.phase === 'dying') {
      target = this.phaseT < DEATH_SLOWMO_T ? 1.55 : 1;
      rate = this.phaseT < DEATH_SLOWMO_T ? 9 : 5;
    } else if (this.phase === 'intro') {
      target = 1;
      rate = 4;
    }
    z.s += (target - z.s) * Math.min(1, dt * rate);
    if (this.phase === 'playing' && Math.abs(z.s - 1) < 0.01) z.s = 1;
  }

  private animateObstacles(beat: number, dt: number, kick: number, live: boolean) {
    if (!this.course) return;
    const clock: Clock = { beat, bars: beat / 4, dt, kick };
    const ctx = { cursor: this.cursor, cursorR: this.cursor.r, walls: this.course.walls, live };
    for (const o of this.obstacles) updateObstacle(o, clock, ctx);
    if (this.phantom && !this.phantom.alive) this.phantom.fade = Math.max(0, this.phantom.fade - dt * 2);
  }

  private simulate(dxCss: number, dyCss: number, dt: number, b0: number, b1: number, kick: number) {
    const course = this.course!;
    const active = this.activeZone?.kind ?? null;
    const sens = this.profile.options.sens;
    let vx = (dxCss / this.scale) * sens;
    let vy = (dyCss / this.scale) * sens;
    if (active !== 'UNTWIST') {
      vx = -vx;
      vy = -vy;
    }
    if (active === 'SPIN') {
      const t = vx;
      vx = -vy;
      vy = t;
    }
    const speed = active === 'TURBO' ? 2 : active === 'DRAG' ? 0.4 : 1;
    vx *= speed;
    vy *= speed;
    const targetR = this.def.cursorR * (active === 'SWELL' ? 1.9 : 1);
    this.cursor.r += (targetR - this.cursor.r) * Math.min(1, dt * 5);
    this.vel = { x: vx, y: vy };
    const moving = Math.hypot(vx, vy) > 0.8;

    // combo timer
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0 && this.combo > 1) {
        this.combo = 1;
        this.audio.sfxComboLost();
      }
    }
    this.grazeCooldown = Math.max(0, this.grazeCooldown - dt);

    // ghost recording / playback
    this.ghostAcc += dt;
    if (this.ghostAcc >= 1 / GHOST_HZ) {
      this.ghostAcc -= 1 / GHOST_HZ;
      this.ghostRec.push(this.cursor.x, this.cursor.y);
    }
    if (this.ghostPlay) {
      const f = this.levelT * GHOST_HZ;
      const i = Math.floor(f) * 2;
      if (i + 3 < this.ghostPlay.length) {
        const t = f - Math.floor(f);
        this.ghostPos = {
          x: this.ghostPlay[i] + (this.ghostPlay[i + 2] - this.ghostPlay[i]) * t,
          y: this.ghostPlay[i + 1] + (this.ghostPlay[i + 3] - this.ghostPlay[i + 1]) * t,
        };
      } else this.ghostPos = null;
    }
    if (this.phantom && this.phantom.alive) {
      this.phantomAliveT += dt;
      if (this.phantomAliveT >= 8) this.unlock('phantom_dance');
    } else this.phantomAliveT = 0;

    const minX = PLAY.x - 4;
    const maxX = PLAY.x + PLAY.w + 4;
    const minY = PLAY.y - 4;
    const maxY = PLAY.y + PLAY.h + 4;
    const sdt = (dt / SUBSTEPS) * this.timeScale;
    const dBeat = (b1 - b0) / SUBSTEPS;

    for (let i = 0; i < SUBSTEPS; i++) {
      const beat = b0 + dBeat * (i + 1);
      const clock: Clock = { beat, bars: beat / 4, dt: sdt, kick };
      const px = this.cursor.x;
      const py = this.cursor.y;
      const pull = fieldPull(this.obstacles, this.cursor, sdt);
      this.cursor.x = Math.max(minX, Math.min(maxX, this.cursor.x + vx / SUBSTEPS + pull.x));
      this.cursor.y = Math.max(minY, Math.min(maxY, this.cursor.y + vy / SUBSTEPS + pull.y));
      if (!this.hasMoved && Math.hypot(this.cursor.x - course.start.x, this.cursor.y - course.start.y) > 3) this.hasMoved = true;

      const ctx = { cursor: this.cursor, cursorR: this.cursor.r, walls: course.walls, live: true };
      for (const o of this.obstacles) updateObstacle(o, clock, ctx);
      this.updateGates(px, py, beat);
      const pressureKill = this.updatePressure(sdt, dBeat, beat);
      if (pressureKill) {
        this.updateNear(moving);
        this.die(pressureKill);
        return;
      }

      const { x, y, r } = this.cursor;
      let killer: string | null = null;
      if (collides(x, y, r, course.walls)) killer = 'WALL';
      if (!killer) {
        for (const o of this.obstacles) {
          if (hitsObstacle(o, x, y, r)) {
            killer = KILLER_NAMES[o.def.kind] ?? 'HAZARD';
            break;
          }
        }
      }
      if (killer) {
        this.updateNear(moving);
        this.die(killer);
        return;
      }
      if (this.boss && !this.boss.boss!.dead) {
        const bs = this.boss.boss!;
        if (bs.pickup && Math.hypot(x - bs.pickup.x, y - bs.pickup.y) < 15 + r) {
          this.hitBoss();
          if (this.phase !== 'playing') return;
        }
        if (bs.wantPhantom && !this.bossPhantom) {
          this.bossPhantom = true;
          this.phantom = { x: PLAY.x + 40, y: PLAY.y + PLAY.h - 40, r: this.def.cursorR + 2, alive: true, fade: 1, age: 0, trail: [], vx: 0, vy: 0 };
          this.renderer.ring(this.phantom.x, this.phantom.y, '#ff2d55', 500, 4, 400);
        } else if (!bs.wantPhantom && this.bossPhantom) {
          this.bossPhantom = false;
          if (this.phantom) {
            this.phantom.alive = false;
            this.renderer.ring(this.phantom.x, this.phantom.y, '#ffffff', 400, 2, 200);
          }
        }
      }
      const goalOpen = !this.boss || (this.boss.boss!.dead && this.boss.boss!.deadT > 1.2);
      if (goalOpen && Math.hypot(x - course.goal.x, y - course.goal.y) < course.goalR) {
        this.updateNear(moving);
        this.clearLevel();
        return;
      }
      if (course.pickup && !this.pickupTaken && Math.hypot(x - course.pickup.x, y - course.pickup.y) < 16 + r) this.collect();
      if (course.fragment && !this.fragmentTaken && Math.hypot(x - course.fragment.x, y - course.fragment.y) < 12 + r) this.collectFragment();
    }
    this.updateNear(moving);
    // audio proximity cues
    if (this.phantom && this.phantom.alive) {
      const d = Math.hypot(this.phantom.x - this.cursor.x, this.phantom.y - this.cursor.y);
      this.audio.setDrone(Math.max(0.15, 1 - d / 320));
    } else this.audio.setDrone(0);
    let rumble = 0;
    for (const o of this.obstacles) {
      if (o.def.kind !== 'crush' || o.front <= 0) continue;
      const d = Math.hypot(o.frontPos.x - this.cursor.x, o.frontPos.y - this.cursor.y);
      rumble = Math.max(rumble, 1 - d / 420);
    }
    if (this.purge) {
      const d = Math.hypot(this.purge.pos.x - this.cursor.x, this.purge.pos.y - this.cursor.y);
      rumble = Math.max(rumble, 1 - d / 300);
    }
    this.audio.setRumble(Math.max(0, rumble));
  }

  /** Did the cursor touch or sweep across a gate node this sub-step? */
  private touchedGate(gate: Segment, px: number, py: number): boolean {
    const { x, y, r } = this.cursor;
    if (distToSegment(x, y, gate) < gate.ht + r + 1) return true;
    return segmentsCross(px, py, x, y, gate);
  }

  private updateGates(px: number, py: number, beat: number) {
    const course = this.course!;
    for (let i = 0; i < course.zones.length; i++) {
      const z = course.zones[i];
      const g = this.gates[i];
      if (!g.entryUsed && this.activeZone !== z && this.touchedGate(z.entry, px, py)) {
        g.entryUsed = true;
        this.enterZone(z, beat);
        continue;
      }
      if (this.activeZone === z && !g.exitUsed && this.touchedGate(z.exit, px, py)) {
        g.exitUsed = true;
        this.exitZone(z);
      }
    }
  }

  private static mid(s: Segment): Vec {
    return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  }

  private enterZone(z: ZoneDef, beat: number) {
    if (this.activeZone) this.exitZone(this.activeZone);
    this.activeZone = z;
    this.audio.sfxActivate(z.kind);
    this.renderer.shake(0.35);
    this.renderer.glitch(0.5);
    this.renderer.chroma(7);
    const em = Game.mid(z.entry);
    const xm = Game.mid(z.exit);
    this.renderer.burst(em.x, em.y, ['#ffffff', this.zone.primary], 40);
    this.renderer.ring(em.x, em.y, '#ffffff', 600, 4, 500);
    const len = Math.hypot(xm.x - em.x, xm.y - em.y) || 1;
    const dir = { x: (xm.x - em.x) / len, y: (xm.y - em.y) / len };
    if (z.pressure === 'phantom') {
      const sx = Math.max(PLAY.x + 20, Math.min(PLAY.x + PLAY.w - 20, em.x - dir.x * PHANTOM_SPAWN_DIST));
      const sy = Math.max(PLAY.y + 20, Math.min(PLAY.y + PLAY.h - 20, em.y - dir.y * PHANTOM_SPAWN_DIST));
      this.phantom = { x: sx, y: sy, r: this.def.cursorR + 2, alive: true, fade: 1, age: 0, trail: [], vx: 0, vy: 0 };
    } else if (z.pressure === 'purge') {
      this.purgeStartBeat = beat + 1;
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
      for (const p of z.poly) {
        mnx = Math.min(mnx, p.x);
        mxx = Math.max(mxx, p.x);
        mny = Math.min(mny, p.y);
        mxy = Math.max(mxy, p.y);
      }
      this.purge = { poly: z.poly, pos: { ...em }, dir, span: Math.max(mxx - mnx, mxy - mny) };
    } else if (z.pressure === 'decay') {
      this.decayLeft = z.decayBeats ?? 32;
    }
    this.publish();
  }

  private exitZone(z: ZoneDef) {
    if (this.activeZone !== z) return;
    this.activeZone = null;
    if (this.phantom) this.phantom.alive = false;
    this.purge = null;
    this.audio.sfxModifierEnd();
    const xm = Game.mid(z.exit);
    this.renderer.burst(xm.x, xm.y, ['#ffffff', this.zone.secondary], 40);
    this.renderer.ring(xm.x, xm.y, '#ffffff', 400, 2, 260);
    this.publish();
  }

  /** Integrates phantom / purge / decay. Returns the killer name when the pressure killed the player. */
  private updatePressure(dt: number, dBeat: number, beat: number): string | null {
    const z = this.activeZone;
    const p = this.phantom;
    if (p) {
      if (p.alive && (z || this.bossPhantom)) {
        p.age += dt;
        const arm = Math.min(1, p.age / PHANTOM_ARM);
        const mult = (z?.kind === 'TURBO' ? 2 : z?.kind === 'DRAG' ? 0.45 : 1) * this.mutators.phantom;
        const vmax = PHANTOM_BASE * (1 + Math.max(0, this.level - 5) * 0.02) * mult * arm;
        const dx = this.cursor.x - p.x;
        const dy = this.cursor.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, (dt * 420) / Math.max(1, vmax));
        p.vx += ((dx / len) * vmax - p.vx) * k;
        p.vy += ((dy / len) * vmax - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 14) p.trail.shift();
        if (arm >= 1 && len < p.r + this.cursor.r) return 'PHANTOM';
      } else {
        p.fade = Math.max(0, p.fade - dt * 2);
      }
    }
    if (z && z.pressure === 'purge' && this.purge) {
      const front = Math.max(0, (beat - this.purgeStartBeat) * PURGE_SPEED);
      const em = Game.mid(z.entry);
      this.purge.pos = { x: em.x + this.purge.dir.x * front, y: em.y + this.purge.dir.y * front };
      const along = (this.cursor.x - em.x) * this.purge.dir.x + (this.cursor.y - em.y) * this.purge.dir.y;
      if (front > 0 && along < front + this.cursor.r) return 'PURGE WAVE';
    }
    if (z && z.pressure === 'decay') {
      this.decayLeft -= dBeat;
      if (this.decayLeft <= 0) return 'SIGNAL DECAY';
    }
    return null;
  }

  private updateNear(moving: boolean) {
    const course = this.course!;
    const { x, y, r } = this.cursor;
    const near: { seg: Segment; d: number }[] = [];
    let minD = Infinity;
    for (const s of course.walls) {
      const d = distToSegment(x, y, s) - s.ht - r;
      if (d < 30) near.push({ seg: s, d: Math.max(0, d) });
      if (d < minD) minD = d;
    }
    for (const n of nearDynamic(this.obstacles, x, y, r, 30)) {
      near.push(n);
      if (n.d < minD) minD = n.d;
    }
    minD = Math.min(minD, nearestSurface(this.obstacles, x, y, r));
    if (this.phantom && this.phantom.alive && this.phantom.age >= PHANTOM_ARM) {
      minD = Math.min(minD, Math.hypot(x - this.phantom.x, y - this.phantom.y) - this.phantom.r - r);
    }
    this.near = near;
    const danger = Math.max(0, Math.min(1, 1 - minD / 30));
    if (this.phase === 'playing') {
      this.stage.style.setProperty('--danger', danger.toFixed(3));
      // graze: skim a hazard while moving
      if (this.inBand) {
        if (minD > GRAZE_LEAVE) this.inBand = false;
      } else if (moving && minD > 0 && minD < GRAZE_ENTER && this.levelT > 0.4 && this.grazeCooldown <= 0) {
        this.inBand = true;
        this.grazeCooldown = GRAZE_COOLDOWN;
        this.graze();
      }
    }
  }
}
