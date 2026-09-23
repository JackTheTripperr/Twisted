import type { Rank } from './types';

/** Par time in seconds per level; beating par earns the time bonus and the rank. */
export const PAR: number[] = [
  12, 22, 24, 20, 32, 26, 28, 30, 36, 32, 30, 34, 38, 44, 42, 52, 46, 48, 50, 80,
  // 21 the Warden, sectors 06-10, 41 Warden Prime
  90, 34, 36, 38, 40, 30, 34, 40, 36, 60, 40, 46, 34, 44, 48, 38, 44, 44, 60, 90, 140,
];

export const GRAZE_POINTS = 50;
export const FRAGMENT_POINTS = 750;
export const CORE_POINTS = 1000;
export const CLEAR_BONUS = 5000;
export const NO_DEATH_BONUS = 3000;
export const MAX_COMBO = 8;
export const COMBO_WINDOW = 2.5;

export function levelBase(level: number): number {
  return 500 + level * 100;
}

export function timeBonus(level: number, t: number): number {
  const par = PAR[level - 1] ?? 40;
  return Math.round(Math.max(0, (par - t) / par) * 1500);
}

export function rankFor(level: number, t: number): Rank {
  const r = t / (PAR[level - 1] ?? 40);
  if (r <= 0.75) return 'S';
  if (r <= 1) return 'A';
  if (r <= 1.45) return 'B';
  return 'C';
}

export const RANK_COLOR: Record<Rank, string> = { S: '#ffe14d', A: '#19f0ff', B: '#3dff8f', C: '#b04dff' };

export function rankSquare(rank: Rank | 'X' | '-'): string {
  switch (rank) {
    case 'S':
      return '🟨';
    case 'A':
      return '🟦';
    case 'B':
      return '🟩';
    case 'C':
      return '🟪';
    case 'X':
      return '🟥';
    default:
      return '⬛';
  }
}

export function fmtScore(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
