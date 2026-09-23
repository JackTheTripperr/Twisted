/**
 * TWISTED audio engine.
 * Fully procedural Web Audio synthwave with four songs:
 *  - INVERSION (title, levels 1-20): A minor, reese bass, dark pads, breakdowns.
 *  - DEEP FIELD (levels 22-40): D minor, swung hats, galloping bass, 3-against-4
 *    plucks, brass stabs, a portamento lead and a half-time lift.
 *  - WARDEN (level 21): E phrygian, a grinding riff, alarm arps and a siren lead
 *    that react to the boss phase; the arrangement thins while the spiral is up.
 *  - WARDEN PRIME (level 41): C minor, vowel choir, 808 sub, trap hat rolls, a
 *    half-time backbeat, orchestral hits and a supersaw theme.
 * Every scheduled hit is timestamped so the renderer can pulse in lock-step.
 */

import type { ModifierKind } from '../game/types';

export interface BeatInfo {
  now: number;
  beat: number;
  bar: number;
  step: number;
  phase: number;
  barPhase: number;
  kick: number;
  snare: number;
  hat: number;
  rms: number;
  bpm: number;
  intensity: number;
  running: boolean;
}

export type MusicMode = 'title' | 'full' | 'death' | 'win';

interface Chord {
  root: number;
  minor: boolean;
  seventh: number;
  ninth: boolean;
}

const Am: Chord = { root: 57, minor: true, seventh: 10, ninth: true };
const F: Chord = { root: 53, minor: false, seventh: 11, ninth: true };
const Dm: Chord = { root: 50, minor: true, seventh: 10, ninth: true };
const E: Chord = { root: 52, minor: false, seventh: 10, ninth: false };
const Bb: Chord = { root: 58, minor: false, seventh: 11, ninth: false };
const Em: Chord = { root: 52, minor: true, seventh: 10, ninth: false };
const G: Chord = { root: 55, minor: false, seventh: 10, ninth: false };

/** Section A: Am F Dm E | Am F Bb E — Section B: Am Em F Dm | Am G Bb E */
const SECTION_A: Chord[] = [Am, F, Dm, E, Am, F, Bb, E];
const SECTION_B: Chord[] = [Am, Em, F, Dm, Am, G, Bb, E];

interface MelNote {
  bar: number;
  step: number;
  midi: number;
  len: number;
}

/** Dark lead over Section B. */
const MELODY: MelNote[] = [
  // bar 0 Am
  { bar: 0, step: 0, midi: 76, len: 3 }, { bar: 0, step: 3, midi: 72, len: 1 }, { bar: 0, step: 4, midi: 69, len: 4 },
  { bar: 0, step: 8, midi: 76, len: 2 }, { bar: 0, step: 10, midi: 74, len: 2 }, { bar: 0, step: 12, midi: 72, len: 4 },
  // bar 1 Em
  { bar: 1, step: 0, midi: 71, len: 4 }, { bar: 1, step: 4, midi: 76, len: 2 }, { bar: 1, step: 6, midi: 79, len: 2 },
  { bar: 1, step: 8, midi: 76, len: 6 }, { bar: 1, step: 14, midi: 71, len: 2 },
  // bar 2 F
  { bar: 2, step: 0, midi: 69, len: 2 }, { bar: 2, step: 2, midi: 72, len: 2 }, { bar: 2, step: 4, midi: 77, len: 4 },
  { bar: 2, step: 8, midi: 76, len: 2 }, { bar: 2, step: 10, midi: 72, len: 2 }, { bar: 2, step: 12, midi: 69, len: 4 },
  // bar 3 Dm
  { bar: 3, step: 0, midi: 74, len: 4 }, { bar: 3, step: 4, midi: 77, len: 2 }, { bar: 3, step: 6, midi: 81, len: 2 },
  { bar: 3, step: 8, midi: 77, len: 4 }, { bar: 3, step: 12, midi: 74, len: 4 },
  // bar 4 Am
  { bar: 4, step: 0, midi: 76, len: 4 }, { bar: 4, step: 4, midi: 81, len: 4 }, { bar: 4, step: 8, midi: 79, len: 2 },
  { bar: 4, step: 10, midi: 76, len: 2 }, { bar: 4, step: 12, midi: 72, len: 4 },
  // bar 5 G
  { bar: 5, step: 0, midi: 74, len: 2 }, { bar: 5, step: 2, midi: 71, len: 2 }, { bar: 5, step: 4, midi: 74, len: 4 },
  { bar: 5, step: 8, midi: 79, len: 4 }, { bar: 5, step: 12, midi: 77, len: 4 },
  // bar 6 Bb
  { bar: 6, step: 0, midi: 77, len: 4 }, { bar: 6, step: 4, midi: 74, len: 4 }, { bar: 6, step: 8, midi: 70, len: 4 },
  { bar: 6, step: 12, midi: 74, len: 2 }, { bar: 6, step: 14, midi: 77, len: 2 },
  // bar 7 E
  { bar: 7, step: 0, midi: 76, len: 2 }, { bar: 7, step: 2, midi: 80, len: 2 }, { bar: 7, step: 4, midi: 83, len: 4 },
  { bar: 7, step: 8, midi: 80, len: 4 }, { bar: 7, step: 12, midi: 76, len: 4 },
];

const ARP_A = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 6, 4, 3, 2, 1];
const ARP_B = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 2, 4, 2];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function chordTones(c: Chord): number[] {
  const t = [c.root, c.root + (c.minor ? 3 : 4), c.root + 7, c.root + c.seventh];
  if (c.ninth) t.push(c.root + 14);
  return t;
}

type BassPattern = 'straight' | 'sync' | 'pulse';

function bassNote(p: BassPattern, s: number, r: number): { midi: number; len: number; vel: number } | null {
  if (p === 'straight') {
    const midi = s === 14 ? r + 7 : s % 2 === 0 ? r : r + 12;
    return { midi, len: 0.95, vel: s % 4 === 0 ? 1 : s % 2 === 0 ? 0.85 : 0.62 };
  }
  if (p === 'sync') {
    const on = [0, 2, 3, 5, 7, 8, 10, 11, 13, 14];
    if (!on.includes(s)) return null;
    const midi = s === 5 || s === 11 ? r + 12 : s === 10 ? r + 7 : s === 13 ? r + 10 : r;
    const len = s === 3 || s === 8 || s === 14 ? 1.9 : 0.95;
    return { midi, len, vel: s % 4 === 0 ? 1 : 0.8 };
  }
  return { midi: s === 15 ? r + 12 : r, len: 0.9, vel: s % 4 === 0 ? 1 : s % 4 === 2 ? 0.72 : 0.5 };
}

// ---------------------------------------------------------------- DEEP FIELD (levels 22-40), D minor

const DF_Dm: Chord = { root: 50, minor: true, seventh: 10, ninth: true };
const DF_Bb: Chord = { root: 58, minor: false, seventh: 11, ninth: true };
const DF_F: Chord = { root: 53, minor: false, seventh: 11, ninth: false };
const DF_C: Chord = { root: 48, minor: false, seventh: 10, ninth: false };
const DF_Gm: Chord = { root: 55, minor: true, seventh: 10, ninth: false };
const DF_A7: Chord = { root: 57, minor: false, seventh: 10, ninth: false };
const DF_Eb: Chord = { root: 51, minor: false, seventh: 11, ninth: false };

/** Groove: Dm Dm Bb Bb F F C A7 · Lead: Gm Bb Dm C Gm Eb A7 A7 */
const DF_A: Chord[] = [DF_Dm, DF_Dm, DF_Bb, DF_Bb, DF_F, DF_F, DF_C, DF_A7];
const DF_B: Chord[] = [DF_Gm, DF_Bb, DF_Dm, DF_C, DF_Gm, DF_Eb, DF_A7, DF_A7];

const DF_BASS_A = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 0, 12, 10];
const DF_BASS_B = [0, 12, 0, 12, 0, 12, 3, 5, 0, 12, 0, 12, 7, 12, 10, 12];

const mel = (bar: number, notes: [number, number, number][]): MelNote[] => notes.map(([step, midi, len]) => ({ bar, step, midi, len }));

const DF_MELODY: MelNote[] = [
  ...mel(0, [[0, 74, 3], [3, 77, 1], [4, 79, 4], [8, 81, 2], [10, 82, 2], [12, 81, 4]]),
  ...mel(1, [[0, 77, 6], [6, 74, 2], [8, 77, 2], [10, 79, 2], [12, 77, 2], [14, 74, 2]]),
  ...mel(2, [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 74, 4]]),
  ...mel(3, [[0, 76, 2], [2, 79, 2], [4, 84, 6], [10, 82, 2], [12, 81, 2], [14, 79, 2]]),
  ...mel(4, [[0, 82, 4], [4, 81, 2], [6, 79, 2], [8, 86, 6], [14, 84, 2]]),
  ...mel(5, [[0, 82, 4], [4, 79, 4], [8, 75, 4], [12, 79, 4]]),
  ...mel(6, [[0, 81, 3], [3, 85, 1], [4, 88, 4], [8, 85, 2], [10, 81, 2], [12, 76, 4]]),
  ...mel(7, [[0, 81, 8], [8, 79, 2], [10, 77, 2], [12, 76, 2], [14, 73, 2]]),
];

// ---------------------------------------------------------------- WARDEN (level 21), E phrygian

const WD_Em: Chord = { root: 52, minor: true, seventh: 10, ninth: false };
const WD_F: Chord = { root: 53, minor: false, seventh: 11, ninth: false };
const WD_C: Chord = { root: 48, minor: false, seventh: 11, ninth: false };
const WD_B7: Chord = { root: 47, minor: false, seventh: 10, ninth: false };

const WD_PROG: Chord[] = [WD_Em, WD_Em, WD_F, WD_Em, WD_Em, WD_C, WD_F, WD_B7];
/** The flat second (F over E) is the Warden's grind. */
const WD_RIFF = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 3, 1, 0, 12];
const WD_RIFF_PLAIN = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 0, 12, 0];
const WD_ARP = [0, 3, 1, 3, 2, 3, 1, 3, 0, 3, 1, 3, 2, 3, 4, 3];

const WD_MELODY: MelNote[] = [
  ...mel(0, [[0, 71, 6], [6, 67, 2], [8, 76, 8]]),
  ...mel(1, [[0, 74, 4], [4, 71, 4], [8, 67, 4], [12, 69, 4]]),
  ...mel(2, [[0, 72, 6], [6, 69, 2], [8, 77, 8]]),
  ...mel(3, [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 64, 8]]),
  ...mel(4, [[0, 67, 2], [2, 71, 2], [4, 76, 4], [8, 77, 4], [12, 76, 4]]),
  ...mel(5, [[0, 79, 6], [6, 76, 2], [8, 72, 8]]),
  ...mel(6, [[0, 81, 4], [4, 77, 4], [8, 72, 4], [12, 69, 4]]),
  ...mel(7, [[0, 75, 4], [4, 78, 4], [8, 83, 8]]),
];

// ---------------------------------------------------------------- WARDEN PRIME (level 41), C minor

const PR_Cm: Chord = { root: 48, minor: true, seventh: 10, ninth: true };
const PR_Ab: Chord = { root: 56, minor: false, seventh: 11, ninth: false };
const PR_Fm: Chord = { root: 53, minor: true, seventh: 10, ninth: false };
const PR_G7: Chord = { root: 55, minor: false, seventh: 10, ninth: false };
const PR_Db: Chord = { root: 49, minor: false, seventh: 11, ninth: false };

const PR_A: Chord[] = [PR_Cm, PR_Cm, PR_Ab, PR_Ab, PR_Fm, PR_Fm, PR_G7, PR_G7];
const PR_B: Chord[] = [PR_Cm, PR_Db, PR_Cm, PR_Db, PR_Ab, PR_Fm, PR_G7, PR_G7];

/** 808 hits: step, offset from the chord root, length in steps. */
const PR_808: { s: number; o: number; l: number }[] = [
  { s: 0, o: 0, l: 3 },
  { s: 3, o: 0, l: 5 },
  { s: 8, o: 0, l: 3 },
  { s: 11, o: -2, l: 3 },
  { s: 14, o: 12, l: 2 },
];

const PR_MELODY: MelNote[] = [
  ...mel(0, [[0, 67, 4], [4, 72, 4], [8, 75, 4], [12, 74, 4]]),
  ...mel(1, [[0, 72, 4], [4, 68, 4], [8, 65, 6], [14, 68, 2]]),
  ...mel(2, [[0, 67, 6], [6, 63, 2], [8, 67, 2], [10, 72, 2], [12, 75, 4]]),
  ...mel(3, [[0, 77, 6], [6, 75, 2], [8, 73, 4], [12, 72, 4]]),
  ...mel(4, [[0, 72, 4], [4, 75, 4], [8, 80, 8]]),
  ...mel(5, [[0, 77, 4], [4, 75, 2], [6, 72, 2], [8, 68, 4], [12, 72, 4]]),
  ...mel(6, [[0, 71, 4], [4, 74, 4], [8, 79, 4], [12, 77, 4]]),
  ...mel(7, [[0, 75, 4], [4, 74, 4], [8, 71, 8]]),
];

export type SongId = 'inversion' | 'deepfield' | 'warden' | 'prime';

export function songFor(mode: MusicMode, level: number): SongId {
  if (mode === 'title' || mode === 'win') return 'inversion';
  if (level === 21) return 'warden';
  if (level === 41) return 'prime';
  if (level >= 22) return 'deepfield';
  return 'inversion';
}

interface Layers {
  drums: boolean;
  bass: boolean;
  pad: boolean;
  arp: boolean;
  arpHigh: boolean;
  lead: boolean;
  hats16: boolean;
  openHat: boolean;
  drive: boolean;
  sync: boolean;
  riser: boolean;
}

function layersFor(level: number, mode: MusicMode): Layers {
  if (mode === 'title') {
    return { drums: false, bass: true, pad: true, arp: true, arpHigh: false, lead: false, hats16: false, openHat: false, drive: false, sync: false, riser: false };
  }
  if (mode === 'win') {
    return { drums: true, bass: true, pad: true, arp: true, arpHigh: true, lead: true, hats16: true, openHat: true, drive: false, sync: true, riser: false };
  }
  return {
    drums: true,
    bass: true,
    pad: true,
    arp: level >= 5,
    arpHigh: level >= 13,
    lead: level >= 9,
    hats16: level >= 9,
    openHat: level >= 5,
    drive: level >= 13,
    sync: level >= 13,
    riser: level >= 17,
  };
}

function makeDriveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private deathFilter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private analyserBuf = new Uint8Array(256);
  private drumBus!: GainNode;
  private duck!: GainNode;
  private bassBus!: GainNode;
  private padBus!: GainNode;
  private arpBus!: GainNode;
  private leadBus!: GainNode;
  private sfxBus!: GainNode;
  private reverbSend!: GainNode;
  private delaySend!: GainNode;
  private delayL!: DelayNode;
  private delayR!: DelayNode;
  private noise!: AudioBuffer;
  private driveShaper!: WaveShaperNode;
  private droneGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private musicGain!: GainNode;
  private surgeFilter!: BiquadFilterNode;
  private surgeHum!: GainNode;
  tempoMult = 1;
  private musicVol = 0.85;
  private sfxVol = 0.9;

  private timer: number | null = null;
  private step = 0;
  private nextStepTime = 0;
  private scheduled: { t: number; step: number }[] = [];
  private kickTimes: number[] = [];
  private snareTimes: number[] = [];
  private hatTimes: number[] = [];

  bpm = 126;
  private targetBpm = 126;
  level = 0;
  mode: MusicMode = 'title';
  intensity = 0;
  private layers: Layers = layersFor(0, 'title');
  /** the song being played, and the one queued to start on the next bar */
  song: SongId = 'inversion';
  private pendingSong: SongId | null = null;
  private songStart = 0;
  /** boss fight state for the Warden songs (phase 0 = level intro) */
  private bossPhase = 0;
  private bossStage = 'none';
  private lastLeadMidi = 76;
  private started = false;
  muted = false;

  get running() {
    return this.started && !!this.ctx;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.started) {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.build();
    this.started = true;
    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.tick(), 30);
    const isRunning = () => ctx.state === 'running';
    if (!isRunning()) {
      const tryResume = () => ctx.resume().catch(() => undefined);
      await Promise.race([tryResume(), new Promise((r) => setTimeout(r, 150))]);
      if (!isRunning()) {
        const onGesture = () => {
          void tryResume().then(() => {
            if (isRunning()) {
              window.removeEventListener('pointerdown', onGesture);
              window.removeEventListener('keydown', onGesture);
            }
          });
        };
        window.addEventListener('pointerdown', onGesture);
        window.addEventListener('keydown', onGesture);
      }
    }
  }

  private build() {
    const c = this.ctx!;
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.16;
    this.deathFilter = c.createBiquadFilter();
    this.deathFilter.type = 'lowpass';
    this.deathFilter.frequency.value = 1400; // muffled on the title screen; opens on the drop
    this.deathFilter.Q.value = 0.7;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.6;

    // master tone: weight below 100 Hz, take the edge off the top
    const lowShelf = c.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 100;
    lowShelf.gain.value = 4.5;
    const highShelf = c.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 6500;
    highShelf.gain.value = -3.5;

    this.surgeFilter = c.createBiquadFilter();
    this.surgeFilter.type = 'lowpass';
    this.surgeFilter.frequency.value = 20000;
    this.surgeFilter.Q.value = 0.8;
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.deathFilter.connect(this.surgeFilter);
    this.surgeFilter.connect(this.musicGain);
    this.musicGain.connect(this.comp);
    this.comp.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(c.destination);

    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.95;
    this.drumBus.connect(this.deathFilter);

    this.duck = c.createGain();
    this.duck.connect(this.deathFilter);

    this.bassBus = c.createGain();
    this.bassBus.gain.value = 0.72;
    this.bassBus.connect(this.duck);
    this.padBus = c.createGain();
    this.padBus.gain.value = 0.26;
    this.padBus.connect(this.duck);
    this.arpBus = c.createGain();
    this.arpBus.gain.value = 0.22;
    this.arpBus.connect(this.duck);
    this.leadBus = c.createGain();
    this.leadBus.gain.value = 0.26;
    this.leadBus.connect(this.duck);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.comp); // SFX bypass the death filter so they stay crisp

    const conv = c.createConvolver();
    conv.buffer = this.makeImpulse(2.8, 3.0);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 1;
    const reverbReturn = c.createGain();
    reverbReturn.gain.value = 0.5;
    const reverbTone = c.createBiquadFilter();
    reverbTone.type = 'lowpass';
    reverbTone.frequency.value = 3200;
    this.reverbSend.connect(conv);
    conv.connect(reverbTone);
    reverbTone.connect(reverbReturn);
    reverbReturn.connect(this.duck);

    this.delaySend = c.createGain();
    this.delayL = c.createDelay(2);
    this.delayR = c.createDelay(2);
    const dt = (60 / this.bpm) * 0.75;
    this.delayL.delayTime.value = dt;
    this.delayR.delayTime.value = dt;
    const fbL = c.createGain();
    const fbR = c.createGain();
    fbL.gain.value = 0.42;
    fbR.gain.value = 0.42;
    const panL = c.createStereoPanner();
    const panR = c.createStereoPanner();
    panL.pan.value = -0.65;
    panR.pan.value = 0.65;
    const delayTone = c.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 3000;
    const delayReturn = c.createGain();
    delayReturn.gain.value = 0.45;
    this.delaySend.connect(this.delayL);
    this.delayL.connect(fbL);
    fbL.connect(this.delayR);
    this.delayR.connect(fbR);
    fbR.connect(this.delayL);
    this.delayL.connect(panL);
    this.delayR.connect(panR);
    panL.connect(delayTone);
    panR.connect(delayTone);
    delayTone.connect(delayReturn);
    delayReturn.connect(this.duck);

    this.driveShaper = c.createWaveShaper();
    this.driveShaper.curve = makeDriveCurve(18);
    this.driveShaper.oversample = '2x';
    const driveOut = c.createGain();
    driveOut.gain.value = 0.7;
    this.driveShaper.connect(driveOut);
    driveOut.connect(this.bassBus);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // phantom drone: detuned saws through a wobbling low-pass, silent until a phantom spawns
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0;
    const df = c.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 520;
    df.Q.value = 5;
    const dlfo = c.createOscillator();
    dlfo.frequency.value = 3.3;
    const dlg = c.createGain();
    dlg.gain.value = 260;
    dlfo.connect(dlg);
    dlg.connect(df.frequency);
    dlfo.start();
    const droneVoices: [number, number, OscillatorType][] = [
      [55, 0, 'sawtooth'],
      [55, 9, 'sawtooth'],
      [110, -7, 'square'],
    ];
    for (const [freq, det, type] of droneVoices) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(df);
      o.start();
    }
    df.connect(this.droneGain);
    this.droneGain.connect(this.sfxBus);

    // crush-wall rumble: looping low-passed noise
    this.rumbleGain = c.createGain();
    this.rumbleGain.gain.value = 0;
    const rsrc = c.createBufferSource();
    rsrc.buffer = this.noise;
    rsrc.loop = true;
    const rlp = c.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 140;
    rlp.Q.value = 1.2;
    rsrc.connect(rlp);
    rlp.connect(this.rumbleGain);
    this.rumbleGain.connect(this.sfxBus);
    rsrc.start();

    // surge (time dilation) hum: a low detuned pair that swells while time is stretched
    this.surgeHum = c.createGain();
    this.surgeHum.gain.value = 0;
    for (const [freq, det] of [
      [82.4, -5],
      [123.5, 6],
    ]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(this.surgeHum);
      o.start();
    }
    this.surgeHum.connect(this.sfxBus);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- control

  setMode(mode: MusicMode, level: number, bpm?: number) {
    this.mode = mode;
    this.level = level;
    this.layers = layersFor(level, mode);
    this.intensity = mode === 'title' ? 0.15 : mode === 'win' ? 1 : Math.min(1, 0.25 + (level - 1) / 19);
    const base = bpm ?? (mode === 'title' ? 126 : mode === 'win' ? 132 : 126 + Math.min(4, Math.floor((level - 1) / 4)) * 4);
    this.targetBpm = Math.round(base * this.tempoMult);
    if (mode !== 'death') {
      const id = songFor(mode, level);
      this.pendingSong = id === this.song ? null : id;
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.deathFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    if (mode === 'title') f.exponentialRampToValueAtTime(1400, t + 0.6);
    else if (mode === 'death') f.exponentialRampToValueAtTime(140, t + 0.22);
    else f.exponentialRampToValueAtTime(20000, t + 0.5);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(m ? 0 : 0.85, t + 0.1);
  }

  /** Boss fight state, set every frame by the game while a Warden is present. */
  setBoss(phase: number, stage: string) {
    this.bossPhase = phase;
    this.bossStage = stage;
  }

  setTempoMult(m: number) {
    this.tempoMult = m;
    this.setMode(this.mode, this.level);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
  }

  /** Time dilation: muffle the track and swell the hum. */
  setSurge(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.surgeFilter.frequency.cancelScheduledValues(t);
    this.surgeFilter.frequency.setValueAtTime(this.surgeFilter.frequency.value, t);
    this.surgeFilter.frequency.exponentialRampToValueAtTime(on ? 520 : 20000, t + (on ? 0.12 : 0.25));
    this.surgeHum.gain.setTargetAtTime(on ? 0.16 : 0, t, on ? 0.08 : 0.15);
    if (on) this.blip(t, 1760, 0.12, 0.12, 'sine');
    else this.blip(t, 880, 0.1, 0.1, 'sine');
  }

  // ---------------------------------------------------------------- clock

  private stepDur() {
    return 60 / this.bpm / 4;
  }

  private tick() {
    const c = this.ctx!;
    const ahead = c.currentTime + 0.16;
    while (this.nextStepTime < ahead) {
      if (this.step % 16 === 0 && this.bpm !== this.targetBpm) {
        this.bpm = this.targetBpm;
        const dt = (60 / this.bpm) * 0.75;
        this.delayL.delayTime.linearRampToValueAtTime(dt, this.nextStepTime + 0.3);
        this.delayR.delayTime.linearRampToValueAtTime(dt, this.nextStepTime + 0.3);
      }
      if (this.step % 16 === 0 && this.pendingSong) {
        this.song = this.pendingSong;
        this.pendingSong = null;
        this.songStart = this.step;
        this.lastLeadMidi = 76;
      }
      this.scheduleStep(this.step, this.nextStepTime);
      this.scheduled.push({ t: this.nextStepTime, step: this.step });
      this.nextStepTime += this.stepDur();
      this.step++;
    }
    const cutoff = c.currentTime - 2;
    while (this.scheduled.length > 2 && this.scheduled[0].t < cutoff) this.scheduled.shift();
    const prune = (arr: number[]) => {
      while (arr.length && arr[0] < cutoff) arr.shift();
    };
    prune(this.kickTimes);
    prune(this.snareTimes);
    prune(this.hatTimes);
  }

  private scheduleStep(step: number, t: number) {
    if (this.mode === 'death') return;
    const rel = Math.max(0, step - this.songStart);
    switch (this.song) {
      case 'deepfield':
        this.scheduleDeepField(rel, t);
        break;
      case 'warden':
        this.scheduleWarden(rel, t);
        break;
      case 'prime':
        this.schedulePrime(rel, t);
        break;
      default:
        this.scheduleInversion(rel, t);
    }
  }

  // ---------------------------------------------------------------- DEEP FIELD

  private scheduleDeepField(rel: number, t: number) {
    const s = rel % 16;
    const bar = Math.floor(rel / 16);
    const phrase = Math.floor(bar / 8);
    const pb = bar % 8;
    const sec = phrase % 4; // 0 groove · 1 lead · 2 counter (stabs) · 3 half-time lift
    const chord = (sec === 1 || sec === 3 ? DF_B : DF_A)[pb];
    const tones = chordTones(chord);
    const dur = this.stepDur();
    const ts = t + (s % 2 === 1 ? dur * 0.16 : 0); // swing
    const lvl = this.level;
    const drive = lvl >= 30;
    const half = sec === 3 && pb < 6;

    if (half) {
      if (s === 0 || s === 10) this.kick(t, 1);
      if (s === 8) this.snare(t, 1);
      if (s % 2 === 0) this.hat(ts, s % 4 === 2 ? 0.4 : 0.22, false);
      if (s === 12) this.hat(t, 0.4, true);
      if (pb === 0 && s === 0) this.crash(t, 0.6);
      if (pb === 4 && s === 0) this.riser(t, dur * 32);
    } else {
      if (s % 4 === 0) this.kick(t, 1);
      if (s === 7 && pb % 2 === 1) this.kick(t, 0.7);
      if (s === 14 && pb % 4 === 3) this.kick(t, 0.8);
      if (s === 4 || s === 12) this.snare(t, 1);
      if (sec !== 0 && (s === 7 || s === 15)) this.snare(ts, 0.22);
      this.hat(ts, s % 4 === 2 ? 0.5 : s % 2 === 0 ? 0.28 : 0.18, false);
      if (sec >= 1 && s === 10) this.hat(t, 0.45, true);
      if (pb === 0 && s === 0) this.crash(t, 0.7);
      if (pb === 7 && s >= 10) this.tom(t, 50 - (s - 10) * 2, 0.55 + (s - 10) * 0.06);
      if (sec === 3 && s % 2 === 0) this.snare(t, 0.3 + (pb - 6) * 0.2 + s * 0.02);
    }

    const r = chord.root - 12;
    if (half) {
      if (s === 0) this.bass(t, r, dur * 9, 1, drive);
      if (s === 10) this.bass(t, r + 12, dur * 5, 0.8, drive);
    } else {
      const off = (sec === 1 ? DF_BASS_B : DF_BASS_A)[s];
      this.bass(ts, r + off, dur * 0.9, off >= 12 ? 0.72 : s % 4 === 0 ? 1 : 0.84, drive);
    }

    if (s === 0) this.pad(t, tones, dur * 16, half);

    if ((sec === 2 || (sec === 0 && pb >= 4)) && [0, 3, 6, 10, 12].includes(s)) {
      this.stab(ts, tones.slice(0, 4).map((m) => m + 12), dur * 1.4, s === 0 ? 0.85 : 0.6);
    }

    if (sec !== 1 || lvl >= 34) {
      const ext = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24, tones[1] + 24];
      const idx = (rel % 3) + (Math.floor(rel / 3) % 2 ? 2 : 0);
      this.pluck(ts, ext[idx], half ? 0.35 : sec === 1 ? 0.3 : 0.55);
    }

    if (sec === 1) {
      for (const n of DF_MELODY) if (n.bar === pb && n.step === s) this.glide(t, n.midi, dur * n.len * 0.94, 0.85);
    } else if (sec === 3 && pb >= 4) {
      for (const n of DF_MELODY) if (n.bar === pb && n.step === s && n.len >= 3) this.glide(t, n.midi - 12, dur * n.len * 0.94, 0.55);
    }
  }

  // ---------------------------------------------------------------- WARDEN

  private scheduleWarden(rel: number, t: number) {
    const s = rel % 16;
    const bar = Math.floor(rel / 16);
    const pb = bar % 8;
    const phrase = Math.floor(bar / 8);
    const chord = WD_PROG[pb];
    const tones = chordTones(chord);
    const dur = this.stepDur();
    const ph = this.bossPhase;
    const st = this.bossStage;
    const tense = st === 'warn' || st === 'breach';
    const r = chord.root - 12;

    if (ph === 0) {
      // the level intro: a heartbeat and a ticking clock under a dark pad, and the Warden's voice in the distance
      if (s === 0 || s === 3) this.kick(t, s === 0 ? 0.8 : 0.5);
      if (s % 4 === 2) this.hat(t, 0.25, false);
      if (s === 0 && pb % 2 === 0) this.bassDrone(t, r - 12, dur * 32);
      if (s === 0) this.pad(t, tones, dur * 16, false);
      if (s === 0 && pb % 4 === 0) this.siren(t, 64, dur * 14, 0.35);
      return;
    }

    if (tense) {
      if (s % 4 === 0) this.kick(t, 0.85);
      this.hat(t, s % 2 === 0 ? 0.3 : 0.16, false);
      if (s === 0) this.tom(t, 38, 0.7);
      if (st === 'warn' && s === 0 && pb % 2 === 0) this.riser(t, dur * 32);
    } else {
      if (s % 4 === 0) this.kick(t, 1);
      if (ph >= 2 && (s === 14 || s === 15)) this.kick(t, 0.75);
      if (ph >= 3 && s === 11) this.kick(t, 0.7);
      if (s === 4 || s === 12) {
        this.clap(t, 1);
        this.snare(t, 0.6);
      }
      this.hat(t, s % 4 === 2 ? 0.55 : s % 2 === 0 ? 0.32 : 0.22, false);
      if (ph >= 2 && (s === 6 || s === 14)) this.hat(t, 0.5, true);
      if (pb === 0 && s === 0) this.crash(t, 0.8);
      if (pb === 7 && s >= 8) this.tom(t, 52 - (s - 8) * 2, 0.5 + (s - 8) * 0.06);
      if (pb === 3 && s >= 12) this.snare(t, 0.35 + (s - 12) * 0.15);
    }

    if (tense) {
      if (s % 8 === 0) this.bass(t, r, dur * 7.5, 0.95, false);
    } else {
      const off = (chord === WD_Em ? WD_RIFF : WD_RIFF_PLAIN)[s];
      this.bass(t, r + off, dur * 0.9, off >= 12 ? 0.75 : s % 4 === 0 ? 1 : 0.86, ph >= 3);
    }

    if (s === 0) this.pad(t, tones, dur * 16, tense);

    const ext = [tones[0], tones[1], tones[2], tones[0] + 12, tones[3]];
    this.arp(t, ext[WD_ARP[s] % ext.length] + 12, tense ? 0.9 : 0.7, false);

    if (ph >= 3 && !tense && (s === 0 || s === 6 || s === 12)) this.stab(t, tones.slice(0, 4).map((m) => m + 12), dur * 1.5, 0.75);

    if (ph >= 2 && !tense && phrase % 2 === 1) {
      for (const n of WD_MELODY) if (n.bar === pb && n.step === s) this.siren(t, n.midi, dur * n.len * 0.94, 0.8);
    }
    if (ph === 1 && !tense && s === 0 && pb % 4 === 0) this.siren(t, 71, dur * 12, 0.5);
  }

  // ---------------------------------------------------------------- WARDEN PRIME

  private schedulePrime(rel: number, t: number) {
    const s = rel % 16;
    const bar = Math.floor(rel / 16);
    const pb = bar % 8;
    const phrase = Math.floor(bar / 8);
    const secB = phrase % 2 === 1;
    const chord = (secB ? PR_B : PR_A)[pb];
    const tones = chordTones(chord);
    const dur = this.stepDur();
    const ph = this.bossPhase;
    const st = this.bossStage;
    const tense = st === 'warn' || st === 'breach';
    const r = chord.root - 12;

    if (s === 0) this.choir(t, tones.slice(0, 4), dur * 16);

    if (ph === 0) {
      if (s === 0 && pb % 2 === 0) this.sub808(t, r, dur * 30, 0.8);
      if (s === 0 || s === 8) this.kick(t, 0.7);
      if (s % 4 === 2) this.hat(t, 0.22, false);
      if (s === 0 && pb % 4 === 0) this.tom(t, 36, 0.8);
      return;
    }

    if (tense) {
      if (s === 0 || s === 8) this.kick(t, 0.9);
      if (s % 2 === 0) this.hat(t, 0.28, false);
      if (st === 'warn' && s === 0 && pb % 2 === 0) this.riser(t, dur * 32);
    } else {
      if (s % 4 === 0) this.kick(t, 1);
      if (ph >= 3 && s === 0) this.tom(t, 36, 0.9);
      if (s === 8) {
        this.snare(t, 1);
        this.clap(t, 0.9);
      }
      if (ph >= 2 && (s === 4 || s === 12)) this.clap(t, 0.35);
      if (s === 7 || s === 15) this.hatRoll(t, 2, dur, 0.3);
      else if (pb % 2 === 1 && s >= 12) this.hatRoll(t, 3, dur, 0.26);
      else this.hat(t, s % 4 === 2 ? 0.5 : 0.3, false);
      if (pb === 0 && s === 0) this.crash(t, 0.9);
      if (pb === 7 && s >= 12) this.tom(t, 48 - (s - 12) * 3, 0.7);
    }

    if (tense) {
      if (s % 8 === 0) this.sub808(t, r, dur * 7.5, 0.9);
    } else {
      for (const n of PR_808) if (n.s === s) this.sub808(t, r + n.o, dur * n.l, n.s === 0 ? 1 : 0.85);
      if (ph >= 3 && s % 2 === 0) this.bass(t, r + (s % 4 === 2 ? 12 : 0), dur * 0.9, 0.55, true);
    }

    if (!tense || st === 'breach') {
      const ext = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24, tones[1] + 24];
      const idx = (rel % 3) + (Math.floor(rel / 3) % 2 ? 2 : 0);
      this.pluck(t, ext[idx], tense ? 0.4 : 0.5);
    }

    if (ph >= 3 && !tense && s === 0) this.stab(t, tones.slice(0, 4).map((m) => m + 12), dur * 3, 0.9);

    if (ph >= 2 && !tense && secB) {
      for (const n of PR_MELODY) if (n.bar === pb && n.step === s) this.supersaw(t, n.midi, dur * n.len * 0.94, 0.85);
    }
  }

  // ---------------------------------------------------------------- INVERSION

  private scheduleInversion(rel: number, t: number) {
    const s = rel % 16;
    const bar = Math.floor(rel / 16);
    const phrase = Math.floor(bar / 8);
    const pb = bar % 8;
    const sec = phrase % 4; // 0 A, 1 B, 2 A, 3 breakdown (B chords)
    const chords = sec === 0 || sec === 2 ? SECTION_A : SECTION_B;
    const chord = chords[pb];
    const L = this.layers;
    const dur = this.stepDur();
    const I = this.intensity;
    const breakdown = sec === 3 && this.mode === 'full';
    const drop = breakdown && pb < 4;

    if (L.drums && !drop) {
      if (s % 4 === 0) this.kick(t, 1);
      if (L.sync && s === 14 && pb % 4 === 3) this.kick(t, 0.85);
      if (L.sync && s === 11 && pb % 2 === 1) this.kick(t, 0.7);
      if (pb === 7 && this.level >= 9 && (s === 12 || s === 14)) this.kick(t, 0.75);
      if (s === 4 || s === 12) this.clap(t, 1);
      if (sec === 1 && pb % 2 === 1 && s === 10 && I > 0.4) this.clap(t, 0.5);
      if (I > 0.55 && pb % 4 === 3 && (s === 13 || s === 15)) this.clap(t, 0.4);
      if (pb === 7 && s >= 8) this.clap(t, 0.3 + (s - 8) * 0.08);
      if (L.hats16) this.hat(t, s % 2 === 0 ? 0.5 : 0.28, false);
      else if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.5 : 0.35, false);
      if (L.openHat && s === (sec === 1 ? 6 : 14)) this.hat(t, 0.55, true);
      if (pb === 0 && s === 0) this.crash(t, 0.7);
      if (L.riser && pb === 3 && s === 0 && !breakdown) this.riser(t, dur * 16);
    } else if (L.drums && drop) {
      if (s % 4 === 2) this.hat(t, 0.3, false);
      if (pb === 0 && s === 0) {
        this.crash(t, 0.5);
        this.riser(t, dur * 64);
      }
      if (pb === 3 && s >= 8 && s % 2 === 0) this.clap(t, 0.25 + (s - 8) * 0.09);
    }

    if (L.bass) {
      const r = chord.root - 12;
      if (drop) {
        if (s === 0) this.bassDrone(t, r - 12, dur * 16);
      } else {
        let pattern: BassPattern;
        if (this.mode === 'title') pattern = 'pulse';
        else if (sec === 1) pattern = pb % 4 < 2 ? 'pulse' : 'straight';
        else if (sec === 3) pattern = pb === 7 ? 'straight' : 'sync';
        else pattern = pb % 2 === 0 ? 'straight' : 'sync';
        const n = bassNote(pattern, s, r);
        if (n) this.bass(t, n.midi, dur * n.len, n.vel * (this.mode === 'title' ? 0.5 : 1), L.drive);
      }
    }

    if (L.pad && s === 0) this.pad(t, chordTones(chord), dur * 16, drop);

    if (L.arp && (sec === 1 || pb >= 4 || this.mode === 'title')) {
      const tones = chordTones(chord);
      const ext = [tones[0], tones[1], tones[2], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[3] + 12];
      const pat = phrase % 2 === 0 ? ARP_A : ARP_B;
      const idx = pat[s] % ext.length;
      const soft = this.mode === 'title' || drop;
      this.arp(t, ext[idx] + 12, soft ? 0.45 : 0.8, soft);
      if (L.arpHigh && s % 2 === 1 && !drop) this.arp(t, ext[(idx + 2) % ext.length] + 24, 0.35, false);
    }

    if (L.lead) {
      if (sec === 1) {
        for (const n of MELODY) if (n.bar === pb && n.step === s) this.lead(t, n.midi, dur * n.len * 0.92, 0.9);
      } else if (sec === 3 && pb >= 4) {
        for (const n of MELODY) if (n.bar === pb && n.step === s && n.len >= 4) this.lead(t, n.midi - 12, dur * n.len * 0.92, 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- instruments

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = 2;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  private kick(t: number, vel: number) {
    const c = this.ctx!;
    this.kickTimes.push(t);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const sat = c.createWaveShaper();
    sat.curve = makeDriveCurve(7);
    o.connect(sat);
    sat.connect(g);
    g.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.52);
    // sub weight
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(52, t);
    sub.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const sg = c.createGain();
    sg.gain.setValueAtTime(vel * 0.6, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    sub.connect(sg);
    sg.connect(this.drumBus);
    sub.start(t);
    sub.stop(t + 0.35);
    // click transient
    const n = this.noiseSource(t, 0.02);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vel * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.drumBus);
    // side-chain duck for everything melodic
    const d = this.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(1, t);
    d.linearRampToValueAtTime(0.25, t + 0.012);
    d.linearRampToValueAtTime(1, t + 0.34);
  }

  private clap(t: number, vel: number) {
    const c = this.ctx!;
    if (vel >= 0.9) this.snareTimes.push(t);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1150;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      g.gain.setValueAtTime(vel * 0.9, tt);
      g.gain.exponentialRampToValueAtTime(0.15, tt + 0.01);
    }
    g.gain.setValueAtTime(vel * 0.9, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    const n = this.noiseSource(t, 0.32);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    const rs = c.createGain();
    rs.gain.value = 0.4 * vel;
    g.connect(rs);
    rs.connect(this.reverbSend);
    // dark snare body
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(185, t);
    o.frequency.exponentialRampToValueAtTime(115, t + 0.09);
    const og = c.createGain();
    og.gain.setValueAtTime(vel * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(og);
    og.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.18);
  }

  private hat(t: number, vel: number, open: boolean) {
    const c = this.ctx!;
    this.hatTimes.push(t);
    const dur = open ? 0.28 : 0.045;
    const n = this.noiseSource(t, dur);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    const pk = c.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 10500;
    pk.Q.value = 1.5;
    pk.gain.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp);
    hp.connect(pk);
    pk.connect(g);
    g.connect(this.drumBus);
  }

  private crash(t: number, vel: number) {
    const c = this.ctx!;
    const n = this.noiseSource(t, 0.9);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.drumBus);
    const rs = c.createGain();
    rs.gain.value = 0.5;
    g.connect(rs);
    rs.connect(this.reverbSend);
  }

  private riser(t: number, dur: number) {
    const c = this.ctx!;
    const n = this.noiseSource(t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur);
    g.gain.setValueAtTime(0.001, t + dur + 0.01);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
  }

  /** Reese-style octave bass over a fat sub. */
  private bass(t: number, midi: number, dur: number, vel: number, drive: boolean) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    const peak = 380 + this.intensity * 2200 + vel * 380;
    f.frequency.setValueAtTime(peak, t);
    f.frequency.exponentialRampToValueAtTime(150, t + dur * 0.85);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setValueAtTime(vel, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const voices: [OscillatorType, number, number][] = [
      ['sawtooth', 0, 0.55],
      ['sawtooth', 14, 0.45],
      ['square', -6, 0.3],
    ];
    for (const [type, det, gain] of voices) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi);
      o.detune.value = det;
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og);
      og.connect(f);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    f.connect(g);
    g.connect(drive ? this.driveShaper : this.bassBus);
    // sub, unfiltered
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(midi - 12);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(vel * 0.85, t + 0.006);
    sg.gain.setValueAtTime(vel * 0.85, t + dur * 0.5);
    sg.gain.exponentialRampToValueAtTime(0.001, t + dur);
    sub.connect(sg);
    sg.connect(this.bassBus);
    sub.start(t);
    sub.stop(t + dur + 0.02);
  }

  /** Breakdown: a single sustained sub note with a slow filtered swell. */
  private bassDrone(t: number, midi: number, dur: number) {
    const c = this.ctx!;
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(midi);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.9, t + 0.05);
    sg.gain.setValueAtTime(0.9, t + dur - 0.1);
    sg.gain.linearRampToValueAtTime(0, t + dur);
    sub.connect(sg);
    sg.connect(this.bassBus);
    sub.start(t);
    sub.stop(t + dur + 0.05);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi + 12);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(120, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur * 0.9);
    const og = c.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.35, t + dur * 0.5);
    og.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f);
    f.connect(og);
    og.connect(this.bassBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, tones: number[], dur: number, open: boolean) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.4;
    const top = open ? 1600 : 900 + this.intensity * 500;
    f.frequency.setValueAtTime(420, t);
    f.frequency.linearRampToValueAtTime(top, t + dur * 0.55);
    f.frequency.linearRampToValueAtTime(420, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(open ? 0.7 : 0.5, t + 0.3);
    g.gain.setValueAtTime(open ? 0.7 : 0.5, t + dur - 0.15);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    f.connect(g);
    g.connect(this.padBus);
    const rs = c.createGain();
    rs.gain.value = 0.7;
    g.connect(rs);
    rs.connect(this.reverbSend);
    for (const m of tones) {
      for (const det of [-10, 9]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.1;
        o.connect(og);
        og.connect(f);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
    // low body an octave under the root
    const body = c.createOscillator();
    body.type = 'triangle';
    body.frequency.value = mtof(tones[0] - 12);
    const bg = c.createGain();
    bg.gain.value = 0.2;
    body.connect(bg);
    bg.connect(f);
    body.start(t);
    body.stop(t + dur + 0.15);
    // sub drone two octaves under the root
    const drone = c.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = mtof(tones[0] - 24);
    const dg = c.createGain();
    dg.gain.setValueAtTime(0, t);
    dg.gain.linearRampToValueAtTime(0.22, t + 0.3);
    dg.gain.setValueAtTime(0.22, t + dur - 0.15);
    dg.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    drone.connect(dg);
    dg.connect(this.padBus);
    drone.start(t);
    drone.stop(t + dur + 0.15);
  }

  private arp(t: number, midi: number, vel: number, soft: boolean) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = soft ? 'triangle' : 'sawtooth';
    o.frequency.value = mtof(midi);
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = mtof(midi);
    o2.detune.value = 7;
    const o2g = c.createGain();
    o2g.gain.value = soft ? 0.15 : 0.3;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(soft ? 1500 : 3200, t);
    f.frequency.exponentialRampToValueAtTime(soft ? 450 : 700, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.32 : 0.2));
    o.connect(f);
    o2.connect(o2g);
    o2g.connect(f);
    f.connect(g);
    g.connect(this.arpBus);
    const ds = c.createGain();
    ds.gain.value = 0.5;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.3;
    g.connect(rs);
    rs.connect(this.reverbSend);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.35);
    o2.stop(t + 0.35);
  }

  private lead(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = mtof(midi);
    o2.detune.value = -10;
    const o2g = c.createGain();
    o2g.gain.value = 0.35;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.4;
    const lfog = c.createGain();
    lfog.gain.setValueAtTime(0, t);
    lfog.gain.linearRampToValueAtTime(9, t + 0.2);
    lfo.connect(lfog);
    lfog.connect(o.detune);
    lfog.connect(o2.detune);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(1300, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.012);
    g.gain.setValueAtTime(vel * 0.5, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    o.connect(f);
    o2.connect(o2g);
    o2g.connect(f);
    f.connect(g);
    g.connect(this.leadBus);
    const ds = c.createGain();
    ds.gain.value = 0.45;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.45;
    g.connect(rs);
    rs.connect(this.reverbSend);
    o.start(t);
    o2.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }

  /** Tight snare: a bright noise crack over a short tuned body. */
  private snare(t: number, vel: number) {
    const c = this.ctx!;
    if (vel >= 0.9) this.snareTimes.push(t);
    const n = this.noiseSource(t, 0.22);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const pk = c.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 3800;
    pk.Q.value = 1;
    pk.gain.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(hp);
    hp.connect(pk);
    pk.connect(g);
    g.connect(this.drumBus);
    const rs = c.createGain();
    rs.gain.value = 0.3 * vel;
    g.connect(rs);
    rs.connect(this.reverbSend);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
    const og = c.createGain();
    og.gain.setValueAtTime(vel * 0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og);
    og.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.13);
  }

  /** Pitched tom for fills and orchestral hits. */
  private tom(t: number, midi: number, vel: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(midi) * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g);
    g.connect(this.drumBus);
    const rs = c.createGain();
    rs.gain.value = 0.25;
    g.connect(rs);
    rs.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.4);
  }

  private hatRoll(t: number, n: number, span: number, vel: number) {
    for (let i = 0; i < n; i++) this.hat(t + (span * i) / n, vel * (0.7 + (0.3 * i) / n), false);
  }

  /** Brassy chord stab. */
  private stab(t: number, tones: number[], dur: number, vel: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.005);
    g.gain.setValueAtTime(vel * 0.32, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g);
    g.connect(this.arpBus);
    const ds = c.createGain();
    ds.gain.value = 0.25;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.35;
    g.connect(rs);
    rs.connect(this.reverbSend);
    for (const m of tones) {
      for (const det of [-11, 11]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.14;
        o.connect(og);
        og.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  /** Short bright pluck: a square with an octave triangle and a snappy filter. */
  private pluck(t: number, midi: number, vel: number) {
    const c = this.ctx!;
    const o1 = c.createOscillator();
    o1.type = 'square';
    o1.frequency.value = mtof(midi);
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = mtof(midi + 12);
    const o2g = c.createGain();
    o2g.gain.value = 0.5;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(5200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.45, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o1.connect(f);
    o2.connect(o2g);
    o2g.connect(f);
    f.connect(g);
    g.connect(this.arpBus);
    const ds = c.createGain();
    ds.gain.value = 0.55;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.2;
    g.connect(rs);
    rs.connect(this.reverbSend);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.25);
    o2.stop(t + 0.25);
  }

  /** Portamento lead: every note glides in from the previous one. */
  private glide(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx!;
    const from = this.lastLeadMidi;
    this.lastLeadMidi = midi;
    const voices: [OscillatorType, number, number, number][] = [
      ['sawtooth', 0, 0, 0.55],
      ['square', 0, 7, 0.35],
      ['sawtooth', 12, -5, 0.16],
    ];
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2800, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.45, t + 0.015);
    g.gain.setValueAtTime(vel * 0.45, t + Math.max(0.02, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lfog = c.createGain();
    lfog.gain.setValueAtTime(0, t);
    lfog.gain.linearRampToValueAtTime(10, t + 0.3);
    lfo.connect(lfog);
    for (const [type, oct, det, gain] of voices) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(mtof(from + oct), t);
      o.frequency.exponentialRampToValueAtTime(mtof(midi + oct), t + 0.07);
      o.detune.value = det;
      lfog.connect(o.detune);
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og);
      og.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    f.connect(g);
    g.connect(this.leadBus);
    const ds = c.createGain();
    ds.gain.value = 0.4;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.4;
    g.connect(rs);
    rs.connect(this.reverbSend);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }

  /** The Warden's voice: a detuned, driven lead that bends down into every note. */
  private siren(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx!;
    const sat = c.createWaveShaper();
    sat.curve = makeDriveCurve(8);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(3400, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.02);
    g.gain.setValueAtTime(vel * 0.32, t + Math.max(0.03, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    const lfo = c.createOscillator();
    lfo.frequency.value = 6.5;
    const lfog = c.createGain();
    lfog.gain.setValueAtTime(0, t);
    lfog.gain.linearRampToValueAtTime(22, t + 0.35);
    lfo.connect(lfog);
    for (const det of [-16, 16]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(midi + 1), t);
      o.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.22);
      o.detune.value = det;
      lfog.connect(o.detune);
      const og = c.createGain();
      og.gain.value = 0.4;
      o.connect(og);
      og.connect(sat);
      o.start(t);
      o.stop(t + dur + 0.12);
    }
    sat.connect(f);
    f.connect(g);
    g.connect(this.leadBus);
    const ds = c.createGain();
    ds.gain.value = 0.3;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.5;
    g.connect(rs);
    rs.connect(this.reverbSend);
    lfo.start(t);
    lfo.stop(t + dur + 0.12);
  }

  /** Warden Prime's theme: five detuned saws over an octave-down square. */
  private supersaw(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.02);
    g.gain.setValueAtTime(vel * 0.4, t + Math.max(0.03, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    for (const det of [-22, -11, 0, 11, 22]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi);
      o.detune.value = det;
      const og = c.createGain();
      og.gain.value = 0.12;
      o.connect(og);
      og.connect(f);
      o.start(t);
      o.stop(t + dur + 0.15);
    }
    const sub = c.createOscillator();
    sub.type = 'square';
    sub.frequency.value = mtof(midi - 12);
    const sg = c.createGain();
    sg.gain.value = 0.16;
    sub.connect(sg);
    sg.connect(f);
    sub.start(t);
    sub.stop(t + dur + 0.15);
    f.connect(g);
    g.connect(this.leadBus);
    const ds = c.createGain();
    ds.gain.value = 0.35;
    g.connect(ds);
    ds.connect(this.delaySend);
    const rs = c.createGain();
    rs.gain.value = 0.55;
    g.connect(rs);
    rs.connect(this.reverbSend);
  }

  /** A vowel-formant choir: detuned saws through three "ah" formant filters. */
  private choir(t: number, tones: number[], dur: number) {
    const c = this.ctx!;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.55, t + 0.5);
    out.gain.setValueAtTime(0.55, t + Math.max(0.5, dur - 0.3));
    out.gain.linearRampToValueAtTime(0, t + dur + 0.2);
    const formants: [number, number, number][] = [
      [730, 8, 1],
      [1090, 10, 0.7],
      [2440, 12, 0.25],
    ];
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.35;
    const lfog = c.createGain();
    lfog.gain.value = 60;
    lfo.connect(lfog);
    const bands = formants.map(([freq, q, gain], i) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      if (i === 0) lfog.connect(bp.frequency);
      const bg = c.createGain();
      bg.gain.value = gain;
      bp.connect(bg);
      bg.connect(out);
      return bp;
    });
    for (const m of tones) {
      for (const det of [-8, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.22;
        o.connect(og);
        for (const bp of bands) og.connect(bp);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
    out.connect(this.padBus);
    const rs = c.createGain();
    rs.gain.value = 0.9;
    out.connect(rs);
    rs.connect(this.reverbSend);
    lfo.start(t);
    lfo.stop(t + dur + 0.3);
  }

  /** 808-style sub: a saturated sine that drops into pitch. */
  private sub808(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(midi) * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.045);
    const sat = c.createWaveShaper();
    sat.curve = makeDriveCurve(4);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.95, t + 0.004);
    g.gain.setValueAtTime(vel * 0.95, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(sat);
    sat.connect(g);
    g.connect(this.bassBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- SFX

  private blip(t: number, freq: number, dur: number, vel: number, type: OscillatorType = 'square') {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
    return { o, g };
  }

  sfxWarn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.blip(t + i * 0.16, i % 2 ? 880 : 1320, 0.09, 0.25);
  }

  /** Level start (the player clicked). */
  sfxGo() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const { g } = this.blip(t, 660, 0.08, 0.22, 'square');
    const { g: g2 } = this.blip(t + 0.09, 990, 0.18, 0.24, 'square');
    for (const x of [g, g2]) {
      const rs = c.createGain();
      rs.gain.value = 0.4;
      x.connect(rs);
      rs.connect(this.reverbSend);
    }
  }

  sfxActivate(kind: ModifierKind) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const roots: Record<ModifierKind, number> = { UNTWIST: 69, TURBO: 74, DRAG: 57, SWELL: 62, BLACKOUT: 55, SPIN: 67 };
    const root = roots[kind];
    for (const iv of [0, 7, 12, 19]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f0 = mtof(root + iv);
      o.frequency.setValueAtTime(f0, t);
      if (kind === 'TURBO') o.frequency.exponentialRampToValueAtTime(f0 * 2, t + 0.3);
      if (kind === 'DRAG') o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.35);
      if (kind === 'SWELL') o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.4);
      if (kind === 'SPIN') {
        o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.24);
      }
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(6000, t);
      f.frequency.exponentialRampToValueAtTime(400, t + 0.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 0.5);
    }
    const n = this.noiseSource(t, 0.35);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(kind === 'UNTWIST' ? 400 : 5000, t);
    bp.frequency.exponentialRampToValueAtTime(kind === 'UNTWIST' ? 5000 : 300, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
  }

  sfxModifierEnd() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 660, 0.08, 0.2, 'triangle');
    this.blip(t + 0.09, 440, 0.12, 0.2, 'triangle');
  }

  sfxDeath() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.setMode('death', this.level);
    const n = this.noiseSource(t, 1.1);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    for (const det of [0, 12, -12]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(57 + det), t);
      o.frequency.exponentialRampToValueAtTime(mtof(33 + det), t + 0.8);
      const og = c.createGain();
      og.gain.setValueAtTime(0.18, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      const sat = c.createWaveShaper();
      sat.curve = makeDriveCurve(30);
      o.connect(sat);
      sat.connect(og);
      og.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 1);
    }
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(120, t);
    s.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const sg = c.createGain();
    sg.gain.setValueAtTime(1, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.65);
  }

  sfxClear() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const run = [69, 72, 76, 79, 81, 84, 88, 91, 93, 96, 100, 103];
    run.forEach((m, i) => {
      const { g } = this.blip(t + i * 0.04, mtof(m), 0.25, 0.14, 'square');
      const rs = c.createGain();
      rs.gain.value = 0.5;
      g.connect(rs);
      rs.connect(this.reverbSend);
      g.connect(this.delaySend);
    });
    const n = this.noiseSource(t, 0.6);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(8000, t + 0.55);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    const tt = t + 0.5;
    for (const m of [69, 76, 81, 88]) {
      const { g: cg } = this.blip(tt, mtof(m), 0.6, 0.12, 'sawtooth');
      const rs = c.createGain();
      rs.gain.value = 0.7;
      cg.connect(rs);
      rs.connect(this.reverbSend);
    }
  }

  sfxStart() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noiseSource(t, 0.7);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + 0.6);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(200, t + 0.6);
    s.frequency.exponentialRampToValueAtTime(35, t + 0.9);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.setValueAtTime(1, t + 0.6);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(t + 1.2);
  }

  sfxWin() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const chords = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [55, 59, 62, 67],
      [57, 60, 64, 69, 72, 76],
    ];
    chords.forEach((ch, i) => {
      const tt = t + i * 0.32;
      ch.forEach((m, j) => {
        const { g } = this.blip(tt + j * 0.03, mtof(m + 12), i === 3 ? 1.6 : 0.5, 0.1, 'sawtooth');
        const rs = c.createGain();
        rs.gain.value = 0.8;
        g.connect(rs);
        rs.connect(this.reverbSend);
        g.connect(this.delaySend);
      });
    });
  }

  sfxHover() {
    if (!this.ctx) return;
    this.blip(this.ctx.currentTime, 1500, 0.05, 0.08, 'sine');
  }

  /** Continuous phantom drone loudness, 0..1 (proximity). */
  setDrone(level: number) {
    if (!this.ctx || !this.droneGain) return;
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.22, t, 0.08);
  }

  /** Continuous crush-wall rumble loudness, 0..1 (proximity). */
  setRumble(level: number) {
    if (!this.ctx || !this.rumbleGain) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.6, t, 0.1);
  }

  sfxPickup() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    [76, 80, 83, 88, 95].forEach((m, i) => {
      const { g } = this.blip(t + i * 0.055, mtof(m), 0.35, 0.14, i === 4 ? 'sine' : 'triangle');
      const rs = c.createGain();
      rs.gain.value = 0.6;
      g.connect(rs);
      rs.connect(this.reverbSend);
      g.connect(this.delaySend);
    });
    const n = this.noiseSource(t, 0.4);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t);
    hp.frequency.exponentialRampToValueAtTime(12000, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.sfxBus);
  }

  /** A reboot core absorbs the death: filter dip, reverse riser, power-on hit. */
  sfxReboot() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const f = this.deathFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(260, t + 0.12);
    f.exponentialRampToValueAtTime(20000, t + 1.1);
    const n = this.noiseSource(t, 0.6);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.48);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    const tt = t + 0.5;
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(140, tt);
    s.frequency.exponentialRampToValueAtTime(38, tt + 0.35);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.setValueAtTime(1, tt);
    sg.gain.exponentialRampToValueAtTime(0.001, tt + 0.5);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(tt + 0.55);
    for (const m of [57, 64, 69, 76]) {
      const { g: cg } = this.blip(tt, mtof(m), 0.7, 0.1, 'sawtooth');
      const rs = c.createGain();
      rs.gain.value = 0.7;
      cg.connect(rs);
      rs.connect(this.reverbSend);
    }
  }

  sfxGraze(combo: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const f = 880 * Math.pow(2, Math.min(7, combo - 1) / 12);
    const { g } = this.blip(t, f, 0.09, 0.16, 'triangle');
    const ds = c.createGain();
    ds.gain.value = 0.35;
    g.connect(ds);
    ds.connect(this.delaySend);
    if (combo >= 4) this.blip(t + 0.03, f * 2, 0.06, 0.06, 'sine');
  }

  sfxComboLost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 520, 0.07, 0.1, 'square');
    this.blip(t + 0.08, 380, 0.12, 0.1, 'square');
  }

  sfxFragment() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    [88, 95].forEach((m, i) => {
      const { g } = this.blip(t + i * 0.06, mtof(m), 0.28, 0.12, 'sine');
      const rs = c.createGain();
      rs.gain.value = 0.5;
      g.connect(rs);
      rs.connect(this.reverbSend);
    });
  }

  sfxAchievement() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    [76, 79, 83, 88].forEach((m, i) => {
      const { g } = this.blip(t + i * 0.09, mtof(m), 0.5, 0.11, 'triangle');
      const rs = c.createGain();
      rs.gain.value = 0.7;
      g.connect(rs);
      rs.connect(this.reverbSend);
      g.connect(this.delaySend);
    });
  }

  sfxMenu(kind: 'hover' | 'click' | 'back') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'hover') this.blip(t, 1400, 0.04, 0.05, 'sine');
    else if (kind === 'click') {
      this.blip(t, 900, 0.06, 0.12, 'square');
      this.blip(t + 0.05, 1350, 0.1, 0.1, 'square');
    } else {
      this.blip(t, 700, 0.06, 0.1, 'square');
      this.blip(t + 0.05, 480, 0.1, 0.1, 'square');
    }
  }

  /** Boss phase alarm: a two-tone siren sweep. */
  sfxBossAlarm() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.28;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(520, tt);
      o.frequency.exponentialRampToValueAtTime(780, tt + 0.14);
      o.frequency.exponentialRampToValueAtTime(520, tt + 0.27);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400;
      const g = c.createGain();
      g.gain.setValueAtTime(0.14, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.27);
      o.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(tt);
      o.stop(tt + 0.3);
    }
    this.crash(t, 0.5);
  }

  /** The weak point was grabbed: impact, then a descending stab. */
  sfxBossHit() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noiseSource(t, 0.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(110, t);
    s.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    const sg = c.createGain();
    sg.gain.setValueAtTime(1, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.55);
    for (const m of [64, 67, 71]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(m), t + 0.05);
      o.frequency.exponentialRampToValueAtTime(mtof(m - 12), t + 0.6);
      const og = c.createGain();
      og.gain.setValueAtTime(0.12, t + 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      o.connect(og);
      og.connect(this.sfxBus);
      og.connect(this.reverbSend);
      o.start(t + 0.05);
      o.stop(t + 0.7);
    }
  }

  /** The Warden dies: a long detonation and a chord that hangs in the reverb. */
  sfxBossDie() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noiseSource(t, 2.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 2);
    const g = c.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.reverbSend);
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(90, t);
    s.frequency.exponentialRampToValueAtTime(25, t + 1.2);
    const sg = c.createGain();
    sg.gain.setValueAtTime(1.2, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(t + 1.5);
    [57, 64, 69, 76, 81].forEach((m, i) => {
      const { g: cg } = this.blip(t + 0.4 + i * 0.08, mtof(m), 2.4, 0.09, 'sawtooth');
      const rs = c.createGain();
      rs.gain.value = 1;
      cg.connect(rs);
      rs.connect(this.reverbSend);
      cg.connect(this.delaySend);
    });
  }

  /** The Warden's laser starts charging: a rising whine under a crackle, then a lock-on blip. */
  sfxLaserCharge() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const T = 2.2;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(880, t + T);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + T);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + T);
    g.gain.exponentialRampToValueAtTime(0.001, t + T + 0.08);
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + T + 0.1);
    const n = this.noiseSource(t, T);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 2;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.02, t);
    ng.gain.linearRampToValueAtTime(0.12, t + T);
    ng.gain.linearRampToValueAtTime(0, t + T + 0.05);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(this.sfxBus);
    this.blip(t + T, 1760, 0.1, 0.16, 'square');
    this.blip(t + T + 0.07, 2640, 0.12, 0.12, 'square');
  }

  /** The spiral starts to materialise: a reversed swell and an accelerating tick. */
  sfxSpiralWarn() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const T = 2.6;
    const n = this.noiseSource(t, T);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + T);
    const g = c.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + T);
    g.gain.exponentialRampToValueAtTime(0.001, t + T + 0.05);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    let tt = t;
    let gap = 0.5;
    while (tt < t + T - 0.05) {
      this.blip(tt, 1320, 0.05, 0.1, 'square');
      tt += gap;
      gap = Math.max(0.1, gap * 0.78);
    }
  }

  /** The spiral is live and the core is exposed. */
  sfxBreach() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(95, t);
    s.frequency.exponentialRampToValueAtTime(34, t + 0.4);
    const sg = c.createGain();
    sg.gain.setValueAtTime(1, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(sg);
    sg.connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.55);
    this.crash(t, 0.7);
    for (const m of [64, 71, 76]) {
      const { g } = this.blip(t, mtof(m), 0.7, 0.08, 'sawtooth');
      const rs = c.createGain();
      rs.gain.value = 0.8;
      g.connect(rs);
      rs.connect(this.reverbSend);
    }
  }

  /** New sector: crash and a short riser. */
  sfxSector() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crash(t, 0.8);
    this.riser(t, 1.2);
  }

  // ---------------------------------------------------------------- beat query

  private energy(times: number[], now: number, decay: number): number {
    let e = 0;
    for (let i = times.length - 1; i >= 0; i--) {
      const dt = now - times[i];
      if (dt < -0.005) continue;
      const v = Math.exp(-Math.max(0, dt) * decay);
      if (v > e) e = v;
      if (dt > 1) break;
    }
    return e;
  }

  beatInfo(): BeatInfo {
    if (!this.ctx || !this.started) {
      const t = performance.now() / 1000;
      const beat = (t * 126) / 60;
      return {
        now: t,
        beat,
        bar: Math.floor(beat / 4),
        step: Math.floor(beat * 4) % 16,
        phase: beat % 1,
        barPhase: (beat % 4) / 4,
        kick: Math.pow(1 - (beat % 1), 6) * 0.6,
        snare: 0,
        hat: 0,
        rms: 0.1,
        bpm: 126,
        intensity: 0.15,
        running: false,
      };
    }
    const now = this.ctx.currentTime;
    let cur = this.scheduled[0];
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (this.scheduled[i].t <= now) {
        cur = this.scheduled[i];
        break;
      }
    }
    const sd = this.stepDur();
    let stepF = 0;
    if (cur) stepF = cur.step + Math.min(1, Math.max(0, (now - cur.t) / sd));
    const beat = stepF / 4;
    this.analyser.getByteTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      const v = (this.analyserBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.analyserBuf.length);
    return {
      now,
      beat,
      bar: Math.floor(beat / 4),
      step: Math.floor(stepF) % 16,
      phase: beat % 1,
      barPhase: (beat % 4) / 4,
      kick: this.energy(this.kickTimes, now, 9),
      snare: this.energy(this.snareTimes, now, 12),
      hat: this.energy(this.hatTimes, now, 30),
      rms,
      bpm: this.bpm,
      intensity: this.intensity,
      running: true,
    };
  }
}
