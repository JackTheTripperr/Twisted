/**
 * TWISTED audio engine.
 * Fully procedural Web Audio synthwave: four-on-the-floor kicks, claps, hats,
 * a driving 16th-note octave bass, side-chained pads, a delayed arpeggio and a
 * lead line, all scheduled with a look-ahead clock. Every scheduled hit is also
 * recorded so the renderer can pulse in lock-step with the music.
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
}

// A minor: Am F C G | Am F Dm E
const PROG: Chord[] = [
  { root: 57, minor: true, seventh: 10 },
  { root: 53, minor: false, seventh: 11 },
  { root: 60, minor: false, seventh: 11 },
  { root: 55, minor: false, seventh: 11 },
  { root: 57, minor: true, seventh: 10 },
  { root: 53, minor: false, seventh: 11 },
  { root: 62, minor: true, seventh: 10 },
  { root: 64, minor: false, seventh: 10 },
];

interface MelNote {
  bar: number;
  step: number;
  midi: number;
  len: number;
}

const MELODY: MelNote[] = [
  // bar 0 Am
  { bar: 0, step: 0, midi: 76, len: 2 }, { bar: 0, step: 2, midi: 81, len: 2 }, { bar: 0, step: 4, midi: 79, len: 2 },
  { bar: 0, step: 6, midi: 76, len: 4 }, { bar: 0, step: 10, midi: 72, len: 2 }, { bar: 0, step: 12, midi: 74, len: 4 },
  // bar 1 F
  { bar: 1, step: 0, midi: 72, len: 4 }, { bar: 1, step: 4, midi: 69, len: 2 }, { bar: 1, step: 6, midi: 72, len: 2 },
  { bar: 1, step: 8, midi: 77, len: 6 }, { bar: 1, step: 14, midi: 76, len: 2 },
  // bar 2 C
  { bar: 2, step: 0, midi: 76, len: 4 }, { bar: 2, step: 4, midi: 79, len: 2 }, { bar: 2, step: 6, midi: 76, len: 2 },
  { bar: 2, step: 8, midi: 72, len: 4 }, { bar: 2, step: 12, midi: 74, len: 2 }, { bar: 2, step: 14, midi: 76, len: 2 },
  // bar 3 G
  { bar: 3, step: 0, midi: 74, len: 6 }, { bar: 3, step: 6, midi: 71, len: 2 }, { bar: 3, step: 8, midi: 74, len: 2 },
  { bar: 3, step: 10, midi: 79, len: 6 },
  // bar 4 Am
  { bar: 4, step: 0, midi: 81, len: 2 }, { bar: 4, step: 2, midi: 79, len: 2 }, { bar: 4, step: 4, midi: 76, len: 4 },
  { bar: 4, step: 8, midi: 81, len: 2 }, { bar: 4, step: 10, midi: 79, len: 2 }, { bar: 4, step: 12, midi: 76, len: 2 },
  { bar: 4, step: 14, midi: 72, len: 2 },
  // bar 5 F
  { bar: 5, step: 0, midi: 69, len: 4 }, { bar: 5, step: 4, midi: 72, len: 4 }, { bar: 5, step: 8, midi: 77, len: 4 },
  { bar: 5, step: 12, midi: 76, len: 2 }, { bar: 5, step: 14, midi: 74, len: 2 },
  // bar 6 Dm
  { bar: 6, step: 0, midi: 74, len: 4 }, { bar: 6, step: 4, midi: 77, len: 2 }, { bar: 6, step: 6, midi: 81, len: 6 },
  { bar: 6, step: 12, midi: 77, len: 4 },
  // bar 7 E
  { bar: 7, step: 0, midi: 80, len: 4 }, { bar: 7, step: 4, midi: 76, len: 2 }, { bar: 7, step: 6, midi: 71, len: 2 },
  { bar: 7, step: 8, midi: 80, len: 4 }, { bar: 7, step: 12, midi: 83, len: 4 },
];

const ARP_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 1, 3];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function chordTones(c: Chord): number[] {
  return [c.root, c.root + (c.minor ? 3 : 4), c.root + 7, c.root + c.seventh];
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
    return { drums: false, bass: false, pad: true, arp: true, arpHigh: false, lead: false, hats16: false, openHat: false, drive: false, sync: false, riser: false };
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
      // Never block game start on the autoplay policy: resume in the background
      // and retry on the next user gesture if the browser refused.
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

    this.deathFilter.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(c.destination);

    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.9;
    this.drumBus.connect(this.deathFilter);

    this.duck = c.createGain();
    this.duck.connect(this.deathFilter);

    this.bassBus = c.createGain();
    this.bassBus.gain.value = 0.55;
    this.bassBus.connect(this.duck);
    this.padBus = c.createGain();
    this.padBus.gain.value = 0.32;
    this.padBus.connect(this.duck);
    this.arpBus = c.createGain();
    this.arpBus.gain.value = 0.28;
    this.arpBus.connect(this.duck);
    this.leadBus = c.createGain();
    this.leadBus.gain.value = 0.3;
    this.leadBus.connect(this.duck);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.comp); // SFX bypass the death filter so they stay crisp

    // reverb
    const conv = c.createConvolver();
    conv.buffer = this.makeImpulse(2.4, 3.2);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 1;
    const reverbReturn = c.createGain();
    reverbReturn.gain.value = 0.5;
    this.reverbSend.connect(conv);
    conv.connect(reverbReturn);
    reverbReturn.connect(this.duck);

    // ping-pong delay (dotted eighth)
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
    delayTone.frequency.value = 3600;
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

    // noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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

  setMode(mode: MusicMode, level: number) {
    this.mode = mode;
    this.level = level;
    this.layers = layersFor(level, mode);
    this.intensity = mode === 'title' ? 0.15 : mode === 'win' ? 1 : Math.min(1, 0.25 + (level - 1) / 19);
    if (mode === 'title') this.targetBpm = 126;
    else if (mode === 'win') this.targetBpm = 132;
    else this.targetBpm = 126 + Math.min(4, Math.floor((level - 1) / 4)) * 4;
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

  // ---------------------------------------------------------------- clock

  private stepDur() {
    return 60 / this.bpm / 4;
  }

  private tick() {
    const c = this.ctx!;
    const ahead = c.currentTime + 0.16;
    while (this.nextStepTime < ahead) {
      // tempo drifts smoothly toward the zone tempo at bar boundaries
      if (this.step % 16 === 0 && this.bpm !== this.targetBpm) {
        this.bpm = this.targetBpm;
        const dt = (60 / this.bpm) * 0.75;
        this.delayL.delayTime.linearRampToValueAtTime(dt, this.nextStepTime + 0.3);
        this.delayR.delayTime.linearRampToValueAtTime(dt, this.nextStepTime + 0.3);
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
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = PROG[bar % PROG.length];
    const L = this.layers;
    const dur = this.stepDur();
    const I = this.intensity;
    if (this.mode === 'death') return;

    if (L.drums) {
      // kick
      if (s % 4 === 0) this.kick(t, 1);
      if (L.sync && s === 14 && bar % 4 === 3) this.kick(t, 0.85);
      if (L.sync && s === 11 && bar % 2 === 1) this.kick(t, 0.7);
      // clap / snare
      if (s === 4 || s === 12) this.clap(t, 1);
      if (I > 0.55 && bar % 4 === 3 && (s === 13 || s === 15)) this.clap(t, 0.4);
      if (bar % 8 === 7 && s >= 8) this.clap(t, 0.3 + (s - 8) * 0.07); // roll into next phrase
      // hats
      if (L.hats16) this.hat(t, s % 2 === 0 ? 0.5 : 0.28, false);
      else if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.5 : 0.35, false);
      if (L.openHat && (s === 6 || s === 14)) this.hat(t, 0.55, true);
      if (L.riser && bar % 4 === 3 && s === 0) this.riser(t, dur * 16);
    }

    if (L.bass) {
      const root = chord.root - 12;
      let midi = s % 2 === 0 ? root : root + 12;
      if (s === 14) midi = root + 7;
      if (s === 15) midi = root + 12;
      const vel = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.85 : 0.62;
      this.bass(t, midi, dur * 0.95, vel, L.drive);
    }

    if (L.pad && s === 0) this.pad(t, chordTones(chord), dur * 16);

    if (L.arp) {
      const tones = chordTones(chord);
      const ext = [tones[0], tones[1], tones[2], tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[3] + 12];
      const idx = ARP_PATTERN[(step + bar * 3) % ARP_PATTERN.length] % ext.length;
      const soft = this.mode === 'title';
      this.arp(t, ext[idx] + 12, soft ? 0.5 : 0.85, soft);
      if (L.arpHigh && s % 2 === 1) this.arp(t, ext[(idx + 2) % ext.length] + 24, 0.4, false);
    }

    if (L.lead) {
      const b8 = bar % 8;
      for (const n of MELODY) {
        if (n.bar === b8 && n.step === s) this.lead(t, n.midi, dur * n.len * 0.92, 0.9);
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
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.075);
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 1.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const sat = c.createWaveShaper();
    sat.curve = makeDriveCurve(6);
    o.connect(sat);
    sat.connect(g);
    g.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.42);
    // click transient
    const n = this.noiseSource(t, 0.02);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vel * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.drumBus);
    // side-chain duck for everything melodic
    const d = this.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(1, t);
    d.linearRampToValueAtTime(0.32, t + 0.012);
    d.linearRampToValueAtTime(1, t + 0.32);
  }

  private clap(t: number, vel: number) {
    const c = this.ctx!;
    if (vel >= 0.9) this.snareTimes.push(t);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      g.gain.setValueAtTime(vel * 0.9, tt);
      g.gain.exponentialRampToValueAtTime(0.15, tt + 0.01);
    }
    g.gain.setValueAtTime(vel * 0.9, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    const n = this.noiseSource(t, 0.3);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
    const rs = c.createGain();
    rs.gain.value = 0.35 * vel;
    g.connect(rs);
    rs.connect(this.reverbSend);
    // snare body
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = c.createGain();
    og.gain.setValueAtTime(vel * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(og);
    og.connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.15);
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
    pk.gain.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp);
    hp.connect(pk);
    pk.connect(g);
    g.connect(this.drumBus);
  }

  private riser(t: number, dur: number) {
    const c = this.ctx!;
    const n = this.noiseSource(t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + dur);
    g.gain.setValueAtTime(0.001, t + dur + 0.01);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drumBus);
  }

  private bass(t: number, midi: number, dur: number, vel: number, drive: boolean) {
    const c = this.ctx!;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = mtof(midi);
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = mtof(midi);
    o2.detune.value = -6;
    const o2g = c.createGain();
    o2g.gain.value = 0.35;
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(midi - 12);
    const subg = c.createGain();
    subg.gain.value = 0.6;

    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    const peak = 420 + this.intensity * 2600 + vel * 400;
    f.frequency.setValueAtTime(peak, t);
    f.frequency.exponentialRampToValueAtTime(170, t + dur * 0.85);

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setValueAtTime(vel, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o1.connect(f);
    o2.connect(o2g);
    o2g.connect(f);
    f.connect(g);
    sub.connect(subg);
    subg.connect(g);
    g.connect(drive ? this.driveShaper : this.bassBus);
    o1.start(t);
    o2.start(t);
    sub.start(t);
    o1.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private pad(t: number, tones: number[], dur: number) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500 + this.intensity * 900, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(700, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.25);
    g.gain.setValueAtTime(0.5, t + dur - 0.15);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    f.connect(g);
    g.connect(this.padBus);
    const rs = c.createGain();
    rs.gain.value = 0.6;
    g.connect(rs);
    rs.connect(this.reverbSend);
    for (const m of tones) {
      for (const det of [-9, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.12;
        o.connect(og);
        og.connect(f);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
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
    f.frequency.setValueAtTime(soft ? 1800 : 4200, t);
    f.frequency.exponentialRampToValueAtTime(soft ? 500 : 900, t + 0.18);
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
    rs.gain.value = 0.25;
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
    // vibrato
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.6;
    const lfog = c.createGain();
    lfog.gain.setValueAtTime(0, t);
    lfog.gain.linearRampToValueAtTime(9, t + 0.2);
    lfo.connect(lfog);
    lfog.connect(o.detune);
    lfog.connect(o2.detune);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + dur);
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
    rs.gain.value = 0.4;
    g.connect(rs);
    rs.connect(this.reverbSend);
    o.start(t);
    o2.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
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

  sfxActivate(kind: ModifierKind) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    // stab chord
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
    // crash noise
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
    // falling detuned saws
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
    // sub thud
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
    // final chord hit
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
