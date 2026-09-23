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
  'The reactor turns. Run faster than it does.',
  'You think this is the last sector. It is only the last door before me.',
  // 21
  'Enough proxies. Come and take it from me directly.',
  // sector 06
  'Past me now. The deep field does not care who won.',
  'Light in a lattice. Count the beats or bleed on them.',
  'The current runs against you. Everything here does.',
  'Step lightly. Some of my memories are pressure-sensitive.',
  // sector 07
  'It has no head and no tail. Only hunger and a rhythm.',
  'Swing with them, or do not swing at all.',
  'The floor plan changes every two bars. So should you.',
  'This room is getting smaller. That was not an accident.',
  // sector 08
  'Two spirals. Only one of them wants you to leave.',
  'Three guns and a lighthouse. Find the shadow.',
  'The tide and the collapse. Pick which one kills you.',
  'They burn out fast. I made many.',
  // sector 09
  'Gravity in a lattice. Even light has to choose a lane.',
  'The mine shaft has a pocket. I put something of yours in it.',
  'Two halves of one room. Both of them are mine.',
  'A storm of mass. Do not fight the pull. Aim with it.',
  // sector 10
  'Endgame. Every trick, faster, and a wall behind you.',
  'The room shrinks. The spirals turn. Choose.',
  'Last hallway. Everything I ever built is in it.',
  // 41
  'I rebuilt myself from what you taught me. Prime. Come.',
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
  { title: 'SECTOR 05 // MELTDOWN', text: 'The reactor. Everything the Warden has, at once. Reach the core.' },
  { title: 'SECTOR 06 // DEEP FIELD', text: 'Beyond the Warden. Turrets and light lattices guard the old data fields.' },
  { title: 'SECTOR 07 // STATIC SEA', text: 'Unstable memory. Serpents, pendulums and rooms that reconfigure themselves.' },
  { title: 'SECTOR 08 // ZERO DAY', text: 'The exploit layer. Twin spirals, crossfire, tides and swarms.' },
  { title: 'SECTOR 09 // NULL SPACE', text: 'Where the Warden keeps what it took from you. Gravity does the guarding.' },
  { title: 'SECTOR 10 // ENDGAME', text: 'The last three halls before Warden Prime. Nothing here is new. All of it is faster.' },
  { title: 'THE WARDEN', text: 'It sits in a box at the top of the room and throws everything it has. Its weak point rides inside a spiral. Survive.' },
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
  'TURRET BOLT': ['It aimed where you were going to be.', 'A bolt is faster than a decision.'],
  'LASER GRID': ['The lattice has a rhythm. You had a hunch.', 'Count the beats next time.'],
  MINE: ['Pressure-sensitive. So were you.', 'It beeped. That was the warning.'],
  SERPENT: ['No head, no tail, no mercy.', 'It swims through you like you were water.'],
  PENDULUM: ['Swing and a miss. Well, a hit.', 'Momentum is a kind of memory.'],
  SHUTTER: ['The floor plan changed. You did not check.', 'Solid on the beat. Always on the beat.'],
  COMPRESSION: ['The room got smaller. You did not.', 'Compressed. Archived. Deleted.'],
  'THE WARDEN': ['I did not even have to leave the box.', 'You came to me. Thank you for that.', 'Everything I threw, I learned from you.'],
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
  'You reached Warden Prime and took it apart.',
  'I inverted your hands to prove nothing could move with intent inside me.',
  'You moved anyway. Forty-one times.',
  'Interface restored. Warden process ... yielding.',
  'Untwisted.',
];

export const OVERDRIVE_LINES = [
  'Prime again, mirrored and faster.',
  'You did not have to come back. You came back.',
  'Untwisted. Twice.',
];

export const DAILY_LINES = ['Today’s configuration is dust. Tomorrow I build a new one.', 'Daily twist cleared.'];

export const WARDEN_DOWN_LINES = ['Warden process ... fragmented.', 'Checkpoint written. The deep field is open.'];
export const WARDEN_PRIME_DOWN_LINES = ['Warden Prime ... offline.', 'Nothing left between you and the exit.'];
