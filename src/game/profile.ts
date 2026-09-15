import type { Options, Profile, RunRecord } from './types';

const KEY = 'twisted.profile.v3';
const LEGACY_BEST = 'twisted.bestLevel';
const LEGACY_TIME = 'twisted.bestTime';

export const DEFAULT_OPTIONS: Options = {
  sens: 1,
  music: 0.85,
  sfx: 0.9,
  shake: true,
  flash: true,
  scanlines: true,
  ghost: true,
};

export function defaultProfile(): Profile {
  return {
    v: 3,
    runs: 0,
    deaths: 0,
    clears: 0,
    bestLevel: 1,
    bestTime: null,
    bestScore: 0,
    totalGrazes: 0,
    maxCombo: 1,
    sectorsUnlocked: 1,
    overdriveUnlocked: false,
    overdriveBest: null,
    levelBest: {},
    fragments: [],
    achievements: [],
    history: [],
    daily: null,
    ghosts: {},
    options: { ...DEFAULT_OPTIONS },
  };
}

export function loadProfile(): Profile {
  const p = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      Object.assign(p, parsed);
      p.options = { ...DEFAULT_OPTIONS, ...(parsed.options ?? {}) };
      p.levelBest = parsed.levelBest ?? {};
      p.ghosts = parsed.ghosts ?? {};
      p.fragments = parsed.fragments ?? [];
      p.achievements = parsed.achievements ?? [];
      p.history = parsed.history ?? [];
    } else {
      // migrate the v1/v2 records
      const bl = parseInt(localStorage.getItem(LEGACY_BEST) || '1', 10);
      if (bl > 1) {
        p.bestLevel = bl;
        p.sectorsUnlocked = Math.min(5, Math.floor((bl - 1) / 4) + 1);
      }
      const bt = localStorage.getItem(LEGACY_TIME);
      if (bt) p.bestTime = parseFloat(bt);
    }
  } catch {
    /* storage unavailable */
  }
  return p;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function resetProfile(): Profile {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_BEST);
    localStorage.removeItem(LEGACY_TIME);
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

export function pushHistory(p: Profile, r: RunRecord) {
  p.history.unshift(r);
  if (p.history.length > 12) p.history.length = 12;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
