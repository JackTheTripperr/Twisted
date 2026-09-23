import type { AchievementDef } from './types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_steps', name: 'FIRST STEPS', desc: 'Clear level 01.' },
  { id: 'first_blood', name: 'FIRST BLOOD', desc: 'Die. Everyone does.' },
  { id: 'deep_dive', name: 'DEEP DIVE', desc: 'Reach level 10 in a run.' },
  { id: 'breach', name: 'BREACH', desc: 'Reach the core sector.' },
  { id: 'untwisted', name: 'UNTWISTED', desc: 'Clear all 20 levels.' },
  { id: 'iron_will', name: 'IRON WILL', desc: 'Clear the run without dying.' },
  { id: 'speedrunner', name: 'SPEEDRUNNER', desc: 'Clear the run in under 12 minutes.' },
  { id: 'graze_50', name: 'CLOSE SHAVE', desc: '50 grazes in one run.' },
  { id: 'combo_8', name: 'FLOW STATE', desc: 'Hit a ×8 graze combo.' },
  { id: 'core_collector', name: 'CORE COLLECTOR', desc: 'Hold three reboot cores at once.' },
  { id: 'core_saved', name: 'SAVED BY THE CORE', desc: 'Consume a reboot core.' },
  { id: 'all_cores', name: 'FULL BACKUP', desc: 'Collect all four cores in one run.' },
  { id: 'fragment_10', name: 'SIGNAL HUNTER', desc: 'Collect 10 signal fragments in one run.' },
  { id: 'full_signal', name: 'FULL SIGNAL', desc: 'Collect every signal fragment, across any runs.' },
  { id: 'phantom_dance', name: 'PHANTOM DANCE', desc: 'Survive 8 seconds with a phantom on your tail.' },
  { id: 'surge_master', name: 'TIME THIEF', desc: 'Spend 10 seconds in surge during one run.' },
  { id: 'daily_clear', name: "TODAY'S TWIST", desc: 'Clear a Daily Twist.' },
  { id: 'overdrive_clear', name: 'OVERDRIVEN', desc: 'Clear Overdrive.' },
  { id: 'perfect_sector', name: 'FLAWLESS SECTOR', desc: 'S-rank all four levels of a sector in one run.' },
  { id: 'warden_down', name: 'WARDEN DOWN', desc: 'Defeat the Warden.' },
  { id: 'warden_prime', name: 'PRIME DIRECTIVE', desc: 'Defeat Warden Prime.' },
  { id: 'no_checkpoint', name: 'NO SAFETY NET', desc: 'Clear the run without respawning at the checkpoint.' },
  { id: 'untouched_boss', name: 'UNTOUCHABLE', desc: 'Beat a Warden fight in under 60 seconds.' },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
