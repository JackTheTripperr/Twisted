import { AudioEngine, type BeatInfo } from '../audio/engine';
import { CLEAR_T, DEATH_T, REBOOT_T, Renderer, type GameView, type PhantomView, type PurgeView } from '../render/renderer';
import { getCourse, PLAY, type Course } from './courses';
import { createObstacle, hitsObstacle, nearDynamic, updateObstacle, wellPull, type Clock, type Obstacle } from './entities';
import { Input } from './input';
import { LEVELS, LEVEL_COUNT, MAX_REBOOTS, ZONES, type LevelDef, type Zone } from './levels';
import { collides, distToSegment } from './maze';
import { checkReachable } from './reach';
import type { GateState, Phase, Segment, Snapshot, Vec, ZoneDef, ZoneState } from './types';

const SENS = 1.0;
const SUBSTEPS = 4;
const PHANTOM_BASE = 115; // px/s at level 5
const PHANTOM_SPAWN_DIST = 170; // px behind the entry gate
const PHANTOM_ARM = 0.6; // seconds of harmless materialisation
const PURGE_SPEED = 36; // px per beat
const STORAGE_BEST = 'twisted.bestLevel';
const STORAGE_TIME = 'twisted.bestTime';
const DEV = import.meta.env.DEV;

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
  hasMoved = false;
  near: { seg: Segment; d: number }[] = [];
  ghost = false;
  clock: Clock = { beat: 0, bars: 0, dt: 0, kick: 0 };
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
  private stage: HTMLElement;
  private def: LevelDef = LEVELS[0];
  private levelT = 0;
  private clockT = 0;
  private runTime = 0;
  private deaths = 0;
  private lastDeathLevel = 0;
  private bestLevel = 1;
  private bestTime: number | null = null;
  private winTime = 0;
  private reboots = 0;
  private collected = new Set<number>();
  private rebootUsed = false;
  private scale = 1;
  private raf = 0;
  private lastFrame = 0;
  private listeners = new Set<(s: Snapshot) => void>();
  private snapTimer = 0;
  private destroyed = false;
  private levelStartBeat = 0;
  private lastBeat = 0;
  private decayLeft = 0;
  private purgeStartBeat = 0;
  private startOverride = 0;

  constructor(canvas: HTMLCanvasElement, stage: HTMLElement, lockEl: HTMLElement) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.input = new Input(lockEl);
    this.input.onLockChange = (locked) => {
      // A lost lock pauses the run; a late lock error after we already fell back to raw input must not.
      if (!locked && !this.input.fallback && (this.phase === 'playing' || this.phase === 'intro')) this.pause();
      this.publish();
    };
    try {
      this.bestLevel = Math.max(1, parseInt(localStorage.getItem(STORAGE_BEST) || '1', 10) || 1);
      const bt = localStorage.getItem(STORAGE_TIME);
      this.bestTime = bt ? parseFloat(bt) : null;
    } catch {
      /* storage unavailable */
    }
    if (DEV) {
      const q = new URLSearchParams(location.search).get('level');
      const n = q ? parseInt(q, 10) : 0;
      if (n >= 1 && n <= LEVEL_COUNT) this.startOverride = n;
    }
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
    return {
      phase: this.phase,
      level: this.level,
      levelName: this.def.name,
      zoneName: this.zone.name,
      deaths: this.deaths,
      runTime: this.runTime,
      bestLevel: this.bestLevel,
      bestTime: this.bestTime,
      zone: this.zoneState,
      reboots: this.reboots,
      pickupAvailable: !!this.course?.pickup && !this.pickupTaken,
      rebootUsed: this.rebootUsed,
      locked: this.input.locked,
      fallbackInput: this.input.fallback,
      lastDeathLevel: this.lastDeathLevel,
      winTime: this.winTime,
      ghost: this.ghost,
    };
  }

  private publish() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  setScale(s: number) {
    this.scale = s;
  }

  // ------------------------------------------------------------------ flow

  /** Called from the title screen click (a user gesture, so audio may start). */
  async begin() {
    if (this.phase !== 'title') return;
    await this.audio.start();
    this.audio.sfxStart();
    this.renderer.flash('#ffffff', 0.9);
    this.renderer.shake(0.6);
    this.renderer.glitch(0.8);
    this.resetRun();
    await this.input.requestLock();
    this.startLevel(this.startOverride || 1);
  }

  /** The level intro holds until the player clicks. */
  startPlay() {
    if (this.phase !== 'intro') return;
    this.phase = 'playing';
    this.phaseT = 0;
    this.levelT = 0;
    this.clockT = 0;
    // re-anchor the obstacle clock so waiting on the intro cannot let a crush wall reach the pad
    this.levelStartBeat = this.audio.beatInfo().beat;
    this.lastBeat = 0;
    this.input.clear();
    this.renderer.flash('#ffffff', 0.35);
    this.renderer.ring(this.cursor.x, this.cursor.y, this.zone.primary, 500, 3, 260);
    this.audio.sfxGo();
    this.publish();
  }

  async resume() {
    if (this.phase !== 'paused') return;
    await this.audio.start();
    if (!this.input.fallback) {
      const ok = await this.input.requestLock();
      // Chrome refuses a re-lock for ~1s after Esc; stay paused and let the user click again.
      if (!ok && !this.input.fallback) {
        this.publish();
        return;
      }
    }
    this.input.clear();
    this.startLevel(this.level);
  }

  async restart() {
    if (this.phase !== 'won' && this.phase !== 'title') return;
    this.resetRun();
    await this.audio.start();
    if (!this.input.fallback) await this.input.requestLock();
    this.startLevel(this.startOverride || 1);
  }

  private resetRun() {
    this.deaths = 0;
    this.runTime = 0;
    this.reboots = 0;
    this.collected.clear();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    return this.audio.muted;
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
    const n = Math.max(1, Math.min(LEVEL_COUNT, this.level + delta));
    this.startLevel(n);
  }

  private pause() {
    this.phase = 'paused';
    this.phaseT = 0;
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    this.publish();
  }

  private startLevel(n: number) {
    this.level = n;
    this.def = LEVELS[n - 1];
    this.zone = ZONES[this.def.zone];
    this.course = getCourse(n);
    this.obstacles = this.course.obstacles.map(createObstacle);
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
    this.pickupTaken = this.collected.has(n);
    this.rebootUsed = false;
    this.near = [];
    const b = this.audio.beatInfo();
    this.levelStartBeat = b.beat;
    this.lastBeat = 0;
    this.clock = { beat: 0, bars: 0, dt: 0, kick: b.kick };
    this.renderer.setLevel(this.course.walls, this.course.start, this.zone);
    this.renderer.ring(this.course.start.x, this.course.start.y, this.zone.primary, 300, 3, 200);
    this.audio.setMode('full', n);
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    if (n > this.bestLevel) {
      this.bestLevel = n;
      this.save();
    }
    this.applyPalette();
    this.input.clear();
    if (DEV) {
      const rr = checkReachable(this.course, this.def.cursorR);
      if (!rr.goal) console.warn(`[twisted] level ${n}: goal not statically reachable`);
      if (rr.pickup === false) console.warn(`[twisted] level ${n}: reboot core not statically reachable`);
    }
    // Lock lost during the death/clear animation (Esc): wait for a click before the next level.
    if (this.input.supported && !this.input.locked && !this.input.fallback) {
      this.pause();
      return;
    }
    this.publish();
  }

  private die() {
    if (this.phase !== 'playing' || this.ghost) return;
    this.deaths++;
    this.lastDeathLevel = this.level;
    this.phase = 'dying';
    this.phaseT = 0;
    this.activeZone = null;
    this.purge = null;
    if (this.phantom) this.phantom.alive = false;
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    this.rebootUsed = this.reboots > 0;
    if (this.rebootUsed) {
      this.reboots--;
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
    this.publish();
  }

  private clearLevel() {
    if (this.phase !== 'playing') return;
    this.phase = 'clear';
    this.phaseT = 0;
    this.activeZone = null;
    this.purge = null;
    if (this.phantom) this.phantom.alive = false;
    this.audio.setDrone(0);
    this.audio.setRumble(0);
    const e = this.course!.goal;
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
    const p = this.course!.pickup!;
    this.renderer.burst(p.x, p.y, ['#ffffff', this.zone.primary, this.zone.accent], 70);
    this.renderer.ring(p.x, p.y, '#ffffff', 500, 4, 400);
    this.renderer.flash('#ffffff', 0.35);
    this.renderer.chroma(4);
    this.audio.sfxPickup();
    this.publish();
  }

  private win() {
    this.phase = 'won';
    this.phaseT = 0;
    this.winTime = this.runTime;
    if (this.bestTime === null || this.runTime < this.bestTime) {
      this.bestTime = this.runTime;
      this.save();
    }
    this.audio.setMode('win', LEVEL_COUNT);
    this.audio.sfxWin();
    this.renderer.flash('#ffffff', 1);
    this.input.releaseLock();
    this.publish();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_BEST, String(this.bestLevel));
      if (this.bestTime !== null) localStorage.setItem(STORAGE_TIME, String(this.bestTime));
    } catch {
      /* ignore */
    }
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
    this.renderer.frame(this, beat, dt);
    this.snapTimer += dt;
    if (this.snapTimer > 0.2) {
      this.snapTimer = 0;
      if (this.phase === 'playing') this.publish();
    }
  };

  /** Level-relative beat clock; falls back to wall time if the audio context is suspended. */
  private levelBeat(beat: BeatInfo): number {
    const ctx = this.audio.ctx;
    if (ctx && ctx.state !== 'running') return (this.clockT * beat.bpm) / 60;
    return Math.max(0, beat.beat - this.levelStartBeat);
  }

  private update(dt: number, beat: BeatInfo) {
    this.phaseT += dt;
    this.clockT += dt;
    const { dx, dy } = this.input.consume();
    const b1 = this.levelBeat(beat);
    const b0 = this.lastBeat;
    this.lastBeat = b1;
    this.clock = { beat: b1, bars: b1 / 4, dt, kick: beat.kick };
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
        this.animateObstacles(b1, dt, beat.kick, false);
        if (this.phaseT >= (this.rebootUsed ? REBOOT_T : DEATH_T)) {
          this.stage.style.setProperty('--danger', '0');
          if (this.rebootUsed) this.startLevel(this.level);
          else {
            this.reboots = 0;
            this.collected.clear();
            this.startLevel(1);
          }
        }
        break;
      case 'clear':
        this.vel = { x: 0, y: 0 };
        this.animateObstacles(b1, dt, beat.kick, false);
        if (this.phaseT >= CLEAR_T) {
          if (this.level >= LEVEL_COUNT) this.win();
          else this.startLevel(this.level + 1);
        }
        break;
      case 'won':
      case 'paused':
        break;
    }
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
    let vx = (dxCss / this.scale) * SENS;
    let vy = (dyCss / this.scale) * SENS;
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

    const minX = PLAY.x - 4;
    const maxX = PLAY.x + PLAY.w + 4;
    const minY = PLAY.y - 4;
    const maxY = PLAY.y + PLAY.h + 4;
    const sdt = dt / SUBSTEPS;
    const dBeat = (b1 - b0) / SUBSTEPS;

    for (let i = 0; i < SUBSTEPS; i++) {
      const beat = b0 + dBeat * (i + 1);
      const clock: Clock = { beat, bars: beat / 4, dt: sdt, kick };
      const px = this.cursor.x;
      const py = this.cursor.y;
      const pull = wellPull(this.obstacles, this.cursor, sdt);
      this.cursor.x = Math.max(minX, Math.min(maxX, this.cursor.x + vx / SUBSTEPS + pull.x));
      this.cursor.y = Math.max(minY, Math.min(maxY, this.cursor.y + vy / SUBSTEPS + pull.y));
      if (!this.hasMoved && Math.hypot(this.cursor.x - course.start.x, this.cursor.y - course.start.y) > 3) this.hasMoved = true;

      const ctx = { cursor: this.cursor, cursorR: this.cursor.r, walls: course.walls, live: true };
      for (const o of this.obstacles) updateObstacle(o, clock, ctx);
      this.updateGates(px, py, beat);
      if (this.updatePressure(sdt, dBeat, beat)) {
        this.updateNear();
        this.die();
        return;
      }

      const { x, y, r } = this.cursor;
      let hit = collides(x, y, r, course.walls) !== null;
      if (!hit) for (const o of this.obstacles) if (hitsObstacle(o, x, y, r)) { hit = true; break; }
      if (hit) {
        this.updateNear();
        this.die();
        return;
      }
      if (Math.hypot(x - course.goal.x, y - course.goal.y) < course.goalR) {
        this.updateNear();
        this.clearLevel();
        return;
      }
      if (course.pickup && !this.pickupTaken && Math.hypot(x - course.pickup.x, y - course.pickup.y) < 16 + r) this.collect();
    }
    this.updateNear();
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
      // materialise well behind the entry node so the player sees it coming
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

  /** Integrates phantom / purge / decay. Returns true when the pressure killed the player. */
  private updatePressure(dt: number, dBeat: number, beat: number): boolean {
    const z = this.activeZone;
    const p = this.phantom;
    if (p) {
      if (p.alive && z) {
        p.age += dt;
        const arm = Math.min(1, p.age / PHANTOM_ARM);
        const mult = z.kind === 'TURBO' ? 2 : z.kind === 'DRAG' ? 0.45 : 1;
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
        if (arm >= 1 && len < p.r + this.cursor.r) return true;
      } else {
        p.fade = Math.max(0, p.fade - dt * 2);
      }
    }
    if (z && z.pressure === 'purge' && this.purge) {
      const front = Math.max(0, (beat - this.purgeStartBeat) * PURGE_SPEED);
      const em = Game.mid(z.entry);
      this.purge.pos = { x: em.x + this.purge.dir.x * front, y: em.y + this.purge.dir.y * front };
      const along = (this.cursor.x - em.x) * this.purge.dir.x + (this.cursor.y - em.y) * this.purge.dir.y;
      if (front > 0 && along < front + this.cursor.r) return true;
    }
    if (z && z.pressure === 'decay') {
      this.decayLeft -= dBeat;
      if (this.decayLeft <= 0) return true;
    }
    return false;
  }

  private updateNear() {
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
    this.near = near;
    const danger = Math.max(0, Math.min(1, 1 - minD / 30));
    if (this.phase === 'playing') this.stage.style.setProperty('--danger', danger.toFixed(3));
  }
}
