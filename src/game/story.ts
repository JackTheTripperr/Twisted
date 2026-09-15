/**
 * Story layer. The WARDEN is the security intelligence that hijacked the
 * runner's neural link and inverted the interface. Everything it says is short,
 * in-world flavour: never a hint.
 */

export const BOOT_LINES = [
  'NEURAL LINK ... ESTABLISHED',
  'INTERFACE INTEGRITY ... COMPROMISED',
  'OPERATOR ID ... REDACTED',
  'WARDEN PROCESS ... LISTENING',
  'INPUT VECTOR ... INVERTED',
];

/** One line per level, spoken by the WARDEN at the intro. */
export const TRANSMISSIONS: string[] = [
  'I turned your hands around. Let us see if you can still walk.',
  'The corridors remember their old shape. You do not.',
  'Everything here keeps time. You are the only thing off-beat.',
  'Round and round. I have all the cycles in the world.',
  'This node will give your hands back. You will hate it.',
  'Doors open for those who listen. You never listened.',
  'My satellites have orbited this core longer than you have been alive.',
  'The light is not looking for you. It has already found you.',
  'Faster. Slower. Which one of us is really in control?',
  'A pulse for every bar. Feel it in your teeth.',
  'I made those from your own movement logs. They know where you flinch.',
  'Recursion: to go inward until there is nowhere left to go.',
  'You take up too much space. Let me make that literal.',
  'Do not look back. It would not help.',
  'The daemons are not angry. They are thorough.',
  'A maze. The old shape. It is collapsing along your path.',
  'Mass bends light. It also bends couriers.',
  'Everything I have shown you, at once. Recall it.',
  'Your axes are mine now. Reach the core anyway.',
  'This is the last sector. There is no sector after it.',
];

export interface SectorBrief {
  title: string;
  text: string;
}

export const SECTOR_BRIEFS: SectorBrief[] = [
  { title: 'SECTOR 01 // NEON DAWN', text: 'Outer shell. The Warden inverted your link here. Learn the new shape of your hands.' },
  { title: 'SECTOR 02 // VIOLET DRIFT', text: 'Gate nodes rewrite the interface. A phantom, cut from your own logs, follows anyone who stalls.' },
  { title: 'SECTOR 03 // GRID RUNNER', text: 'Processing layer. The Warden hunts in the open now. Do not stop moving.' },
  { title: 'SECTOR 04 // SOLAR FLARE', text: 'Thermal layer. The halls collapse behind you and gravity is a weapon.' },
  { title: 'SECTOR 05 // MELTDOWN', text: 'The core. Everything the Warden has, at once. Reach the centre and untwist.' },
];

/** Death lines keyed by killer, plus generic ones. */
export const TAUNTS: Record<string, string[]> = {
  WALL: ['The walls have not moved in years. You did.', 'Even the static parts of me are enough.'],
  PISTON: ['The piston keeps time. You did not.', 'It punches on the kick. It always punches on the kick.'],
  SPINNER: ['Round and round. You were in the way.', 'The arm was never hidden.'],
  DOOR: ['It blinked. You did not.', 'Doors close. That is what doors are for.'],
  LASER: ['Light does not negotiate.', 'You stood in the beam like it was a spotlight.'],
  'PULSE RING': ['A gap every bar, and you missed every one.', 'The rings are the rhythm. You are the noise.'],
  ORBITER: ['Satellites do not swerve.', 'Orbit is a promise. You broke it.'],
  SEEKER: ['It was built from your reflexes. It knew.', 'You cannot outrun a record of yourself.'],
  PHANTOM: ['You stopped. It did not.', 'The phantom only wants what you had.'],
  'CRUSH WALL': ['I told you not to look back.', 'The hallway was patient. Then it was not.'],
  'PURGE WAVE': ['Purged. Nothing personal.'],
  'SIGNAL DECAY': ['Your signal faded. So did you.', 'Silence is also a wall.'],
  BOUNCER: ['They never stop. Why did you?'],
  'GRAVITY CORE': ['Mass wins. Mass always wins.', 'You leaned into the well.'],
  SPIRAL: ['Inward, inward, into the wall.', 'The spiral turned. You did not turn with it.'],
  'BREATHER WALL': ['The walls breathe with the kick. You held your breath.'],
  SLIDER: ['It slides on rails. You slid into it.'],
};

export const GENERIC_TAUNTS = [
  'Signal lost. I will remember this shape too.',
  'Again. I have all the cycles in the world.',
  'You were closer than the last version of you.',
  'Every run teaches me something. This one taught me patience.',
  'Reboot, courier. Or do not.',
];

export function tauntFor(killer: string, deaths: number): string {
  const pool = TAUNTS[killer];
  const all = pool ? [...pool, ...GENERIC_TAUNTS] : GENERIC_TAUNTS;
  return all[deaths % all.length];
}

export const ENDING_LINES = [
  'You reached the core.',
  'I inverted your hands to prove nothing could move with intent inside me.',
  'You moved anyway. Twenty times.',
  'Interface restored. Warden process ... yielding.',
  'Untwisted.',
];

export const OVERDRIVE_LINES = [
  'The core again, mirrored and faster.',
  'You did not have to come back. You came back.',
  'Untwisted. Twice.',
];

export const DAILY_LINES = ['Today’s configuration is dust. Tomorrow I build a new one.', 'Daily twist cleared.'];
