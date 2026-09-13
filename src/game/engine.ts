import { AudioEngine } from '../audio/engine';
import { AREA, CLEAR_T, DEATH_T, INTRO_T, Renderer, type GameView } from '../render/renderer';
import { Input } from './input';
import { LEVELS, LEVEL_COUNT, ZONES, type LevelDef, type Zone } from './levels';
import { buildGeometry, collides, distToSegment } from './maze';
import type { LevelGeometry, ModifierKind, Phase, Segment, Snapshot, Vec } from './types';

const SENS = 1.0;
const STORAGE_BEST = 'twisted.bestLevel';
const STORAGE_TIME = 'twisted.bestTime';
const LEVEL_SEED = 0x7715;

interface Mod {
  kind: ModifierKind;
  state: 'warn' | 'active';
  endsAt: number;
  total: number;
}

export class Game implements GameView {
  // ---- GameView
  phase: Phase = 'title';
  phaseT = 0;
  level = 1;
  zone: Zone = ZONES[0];
  geo: LevelGeometry | null = null;
  cursor = { x: 0, y: 0, r: 8 };
  vel: Vec = { x: 0, y: 0 };
  deathPos: Vec | null = null;
  hasMoved = false;
  near: { seg: Segment; d: number }[] = [];
  get modifier() {
    if (!this.mod) return null;
    const remaining = Math.max(0, this.mod.endsAt - this.levelT);
    return { kind: this.mod.kind, state: this.mod.state, progress: 1 - remaining / this.mod.total };
  }

  // ---- internals
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  readonly input: Input;
  private stage: HTMLElement;
  private def: LevelDef = LEVELS[0];
  private levelT = 0;
  private runTime = 0;
  private deaths = 0;
  private lastDeathLevel = 0;
  private bestLevel = 1;
  private bestTime: number | null = null;
  private winTime = 0;
  private mod: Mod | null = null;
  private nextModAt = 0;
  private lastModKind: ModifierKind | null = null;
  private prevPhase: Phase = 'playing';
  private scale = 1;
  private raf = 0;
  private lastFrame = 0;
  private listeners = new Set<(s: Snapshot) => void>();
  private snapTimer = 0;
  private attractDist = 0;
  private attractLens: number[] = [];
  private attractTotal = 1;
  private destroyed = false;
  private rng = () => Math.random();

  constructor(canvas: HTMLCanvasElement, stage: HTMLElement, lockEl: HTMLElement) {
    this.stage = stage;
    this.renderer = new Renderer(canvas);
    this.input = new Input(lockEl);
    this.input.onLockChange = (locked) => {
      if (!locked && (this.phase === 'playing' || this.phase === 'intro')) this.pause();
      this.publish();
    };
    try {
      this.bestLevel = Math.max(1, parseInt(localStorage.getItem(STORAGE_BEST) || '1', 10) || 1);
      const bt = localStorage.getItem(STORAGE_TIME);
      this.bestTime = bt ? parseFloat(bt) : null;
    } catch {
      /* storage unavailable */
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
    const m = this.mod;
    return {
      phase: this.phase,
      level: this.level,
      levelName: this.def.name,
      zoneName: this.zone.name,
      deaths: this.deaths,
      runTime: this.runTime,
      bestLevel: this.bestLevel,
      bestTime: this.bestTime,
      modifier: m
        ? { kind: m.kind, state: m.state, remaining: Math.max(0, m.endsAt - this.levelT), total: m.total }
        : null,
      locked: this.input.locked,
      fallbackInput: this.input.fallback,
      lastDeathLevel: this.lastDeathLevel,
      winTime: this.winTime,
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
    this.deaths = 0;
    this.runTime = 0;
    await this.input.requestLock();
    this.startLevel(1);
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
    this.phase = 'intro';
    this.phaseT = 0;
    this.cursor.x = this.geo!.start.x;
    this.cursor.y = this.geo!.start.y;
    this.hasMoved = false;
    this.mod = null;
    this.publish();
  }

  async restart() {
    if (this.phase !== 'won' && this.phase !== 'title') return;
    this.deaths = 0;
    this.runTime = 0;
    await this.audio.start();
    if (!this.input.fallback) await this.input.requestLock();
    this.startLevel(1);
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    return this.audio.muted;
  }

  private pause() {
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.phaseT = 0;
    this.publish();
  }

  private startLevel(n: number) {
    this.level = n;
    this.def = LEVELS[n - 1];
    this.zone = ZONES[this.def.zone];
    this.geo = buildGeometry(this.def, LEVEL_SEED + n * 101, AREA);
    this.cursor = { x: this.geo.start.x, y: this.geo.start.y, r: this.def.cursorR };
    this.vel = { x: 0, y: 0 };
    this.phase = 'intro';
    this.phaseT = 0;
    this.levelT = 0;
    this.hasMoved = false;
    this.mod = null;
    this.near = [];
    this.nextModAt = 3 + this.rng() * 2;
    this.renderer.setLevel(this.geo, this.zone);
    this.renderer.ring(this.geo.start.x, this.geo.start.y, this.zone.primary, 300, 3, 200);
    this.audio.setMode('full', n);
    if (n > this.bestLevel) {
      this.bestLevel = n;
      this.save();
    }
    this.applyPalette();
    this.input.clear();
    // Lock lost during the death/clear animation (Esc): wait for a click before the next level.
    if (this.input.supported && !this.input.locked && !this.input.fallback) {
      this.pause();
      return;
    }
    this.publish();
  }

  private die() {
    if (this.phase !== 'playing') return;
    this.phase = 'dying';
    this.phaseT = 0;
    this.deaths++;
    this.lastDeathLevel = this.level;
    this.deathPos = { x: this.cursor.x, y: this.cursor.y };
    this.mod = null;
    this.renderer.explode(this.cursor.x, this.cursor.y, [this.zone.primary, this.zone.secondary, '#ffffff', '#ff2d55'], 170);
    this.renderer.ring(this.cursor.x, this.cursor.y, '#ff2d55', 700, 6, 900);
    this.renderer.ring(this.cursor.x, this.cursor.y, '#ffffff', 420, 3, 600);
    this.renderer.shake(1.2);
    this.renderer.glitch(1.2);
    this.renderer.chroma(14);
    this.renderer.flash('#ff2d55', 0.75);
    this.audio.sfxDeath();
    this.stage.style.setProperty('--danger', '1');
    this.publish();
  }

  private clearLevel() {
    if (this.phase !== 'playing') return;
    this.phase = 'clear';
    this.phaseT = 0;
    this.mod = null;
    const e = this.geo!.exit;
    this.renderer.burst(e.x, e.y, [this.zone.secondary, this.zone.accent, this.zone.primary], 120);
    this.renderer.ring(e.x, e.y, this.zone.secondary, 900, 5, 1100);
    this.renderer.ring(e.x, e.y, '#ffffff', 500, 2, 700);
    this.renderer.flash(this.zone.secondary, 0.5);
    this.renderer.shake(0.35);
    this.renderer.chroma(6);
    this.audio.sfxClear();
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
    const def = LEVELS[7];
    this.def = LEVELS[0];
    this.geo = buildGeometry(def, LEVEL_SEED + 8 * 101, AREA);
    this.zone = ZONES[0];
    this.cursor = { x: this.geo.start.x, y: this.geo.start.y, r: def.cursorR };
    const p = this.geo.solution;
    this.attractLens = [0];
    let total = 0;
    for (let i = 1; i < p.length; i++) {
      total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      this.attractLens.push(total);
    }
    this.attractTotal = Math.max(1, total);
    this.attractDist = 0;
    this.renderer.setLevel(this.geo, this.zone);
  }

  private updateAttract(dt: number) {
    const p = this.geo!.solution;
    this.attractDist += dt * 190;
    if (this.attractDist > this.attractTotal + 40) {
      const e = this.geo!.exit;
      this.renderer.burst(e.x, e.y, [this.zone.secondary, this.zone.accent], 50);
      this.attractDist = -60;
    }
    const d = Math.max(0, Math.min(this.attractTotal, this.attractDist));
    let i = 1;
    while (i < this.attractLens.length - 1 && this.attractLens[i] < d) i++;
    const l0 = this.attractLens[i - 1];
    const l1 = this.attractLens[i];
    const t = l1 > l0 ? (d - l0) / (l1 - l0) : 0;
    const nx = p[i - 1].x + (p[i].x - p[i - 1].x) * t;
    const ny = p[i - 1].y + (p[i].y - p[i - 1].y) * t;
    this.vel = { x: nx - this.cursor.x, y: ny - this.cursor.y };
    this.cursor.x = nx;
    this.cursor.y = ny;
  }

  // ------------------------------------------------------------------ loop

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.update(dt);
    const beat = this.audio.beatInfo();
    const s = this.stage.style;
    s.setProperty('--kick', beat.kick.toFixed(3));
    s.setProperty('--snare', beat.snare.toFixed(3));
    s.setProperty('--hat', beat.hat.toFixed(3));
    const beatN = String(Math.floor(beat.beat) % 4);
    if (this.stage.dataset.beat !== beatN) this.stage.dataset.beat = beatN;
    const m = this.modifier;
    s.setProperty('--modp', m ? m.progress.toFixed(3) : '0');
    this.renderer.frame(this, beat, dt);
    this.snapTimer += dt;
    if (this.snapTimer > 0.2) {
      this.snapTimer = 0;
      if (this.phase === 'playing') this.publish();
    }
  };

  private update(dt: number) {
    this.phaseT += dt;
    const { dx, dy } = this.input.consume();
    switch (this.phase) {
      case 'title':
        this.updateAttract(dt);
        break;
      case 'intro':
        if (this.phaseT >= INTRO_T) {
          this.phase = 'playing';
          this.phaseT = 0;
          this.input.clear();
          this.publish();
        }
        break;
      case 'playing':
        this.levelT += dt;
        this.runTime += dt;
        this.updateModifiers();
        this.move(dx, dy, dt);
        break;
      case 'dying':
        this.vel = { x: 0, y: 0 };
        if (this.phaseT >= DEATH_T) {
          this.stage.style.setProperty('--danger', '0');
          this.startLevel(1);
        }
        break;
      case 'clear':
        this.vel = { x: 0, y: 0 };
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

  private pickModifier(): ModifierKind {
    const pool = this.def.modifiers.filter((k) => k !== this.lastModKind);
    const src = pool.length ? pool : this.def.modifiers;
    return src[(this.rng() * src.length) | 0];
  }

  private updateModifiers() {
    if (!this.def.modifiers.length) return;
    const t = this.levelT;
    if (!this.mod) {
      if (t >= this.nextModAt) {
        const kind = this.pickModifier();
        this.lastModKind = kind;
        this.mod = { kind, state: 'warn', endsAt: t + this.def.warnTime, total: this.def.warnTime };
        this.audio.sfxWarn();
        this.renderer.chroma(3);
        this.publish();
      }
      return;
    }
    if (t < this.mod.endsAt) return;
    if (this.mod.state === 'warn') {
      const dur = this.def.modDuration + (this.mod.kind === 'SWELL' || this.mod.kind === 'BLACKOUT' ? 0.5 : 0);
      this.mod = { kind: this.mod.kind, state: 'active', endsAt: t + dur, total: dur };
      this.audio.sfxActivate(this.mod.kind);
      this.renderer.shake(0.5);
      this.renderer.glitch(0.6);
      this.renderer.chroma(8);
      this.renderer.ring(this.cursor.x, this.cursor.y, '#ffffff', 600, 4, 500);
      this.publish();
    } else {
      this.audio.sfxModifierEnd();
      this.mod = null;
      const [a, b] = this.def.modInterval;
      this.nextModAt = t + a + this.rng() * (b - a);
      this.publish();
    }
  }

  private move(dxCss: number, dyCss: number, dt: number) {
    const geo = this.geo!;
    const active = this.mod && this.mod.state === 'active' ? this.mod.kind : null;
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

    // cursor radius eases toward its target so SWELL is visible before it bites
    const targetR = this.def.cursorR * (active === 'SWELL' ? 1.9 : 1);
    this.cursor.r += (targetR - this.cursor.r) * Math.min(1, dt * 5);
    this.vel = { x: vx, y: vy };

    const len = Math.hypot(vx, vy);
    const steps = len > 0 ? Math.ceil(len / Math.max(2, this.cursor.r * 0.5)) : 0;
    const minX = geo.ox - 4;
    const maxX = geo.ox + geo.w + 4;
    const minY = geo.oy - 4;
    const maxY = geo.oy + geo.h + 4;
    for (let i = 0; i < steps; i++) {
      this.cursor.x = Math.max(minX, Math.min(maxX, this.cursor.x + vx / steps));
      this.cursor.y = Math.max(minY, Math.min(maxY, this.cursor.y + vy / steps));
      if (!this.hasMoved && Math.hypot(this.cursor.x - geo.start.x, this.cursor.y - geo.start.y) > 3) this.hasMoved = true;
      if (this.hasMoved && collides(this.cursor.x, this.cursor.y, this.cursor.r, geo.segs)) {
        this.updateNear();
        this.die();
        return;
      }
      if (Math.hypot(this.cursor.x - geo.exit.x, this.cursor.y - geo.exit.y) < geo.exitR) {
        this.updateNear();
        this.clearLevel();
        return;
      }
    }
    // radius growth can also kill a stationary cursor
    if (steps === 0 && this.hasMoved && collides(this.cursor.x, this.cursor.y, this.cursor.r, geo.segs)) {
      this.updateNear();
      this.die();
      return;
    }
    this.updateNear();
  }

  private updateNear() {
    const geo = this.geo!;
    const { x, y, r } = this.cursor;
    const near: { seg: Segment; d: number }[] = [];
    let minD = Infinity;
    for (const s of geo.segs) {
      const d = distToSegment(x, y, s) - s.ht - r;
      if (d < 30) near.push({ seg: s, d: Math.max(0, d) });
      if (d < minD) minD = d;
    }
    this.near = near;
    const danger = Math.max(0, Math.min(1, 1 - minD / 30));
    if (this.phase === 'playing') this.stage.style.setProperty('--danger', danger.toFixed(3));
  }
}
