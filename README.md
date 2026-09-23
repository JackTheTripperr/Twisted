# TWISTED

Play at https://twisted-two.vercel.app/

Initial commit is a Fable 5.1 1-shot, exact prompt:

> Make a reactjs + vite, and launch  it on port 3004. A game called "Twisted" where you navigate your mouse cursor through a maze, except all mouse inputs are reversed. When the cursor touches a wall, the player "dies" and starts from level 1. Make it super creative and visually breathtaking. The visuals should take on a retro neon cyberpunk style, and the audio should blend 80's synthwave aesthetics with modern electronic production (inspired by "Total Nuclear Annihilation" by Scott Danesi). 
>
>There should be 20 levels, each level progressing in difficulty (narrow passages, complex turns to navigate, tight corridors, etc.). As the difficulty increases, introduce mechanics that make the gameplay more challenging for a short period...mouse movements return to normal, cursor speed change, cursor size increase). The visuals should pulse and flash in time with the soundtrack.

Version 2 turned the mazes into obstacle courses, made the glitch modifiers
spatial gate nodes, and added reboot cores. Version 3 added the graze and surge
systems, scoring and ranks, practice / daily / overdrive modes, a persistent
profile with achievements, ghosts, a story layer, and a full menu. Version 4
added the Warden boss fights (levels 21 and 41), sectors 06–10 with nine new
obstacle types, and the checkpoint the Warden leaves behind.

A neon cyberpunk obstacle course where your mouse is lying to you. Every
movement is inverted, everything neon is lethal, and dying sends you back to
level 01 unless you are carrying a reboot core.

Inspired by Mobasher Iqbal's [Reverse](https://www.addictinggames.com/puzzle/reverse)

## Run it

```bash
npm install
npm run dev
```

The dev server is pinned to **http://localhost:3004** (`--strictPort`).
`npm run build` type-checks and produces a static bundle in `dist/`;
`npm run preview` serves that bundle on the same port.

## How to play

- Pick **JACK IN** on the title menu. The game grabs the pointer (Pointer Lock)
  and hides the real cursor; the neon orb is you.
- Every level opens on a transmission from the WARDEN and waits for a click.
- Mouse input is **reversed on both axes**. Push right, the orb goes left.
- Guide the orb from the cyan start pad to the magenta portal. Touch a wall, a
  moving bar, a beam, a ring, a seeker, or the static of a collapsing hallway
  and you die.
- **Graze**: skim a hazard without touching it to score points, build a combo
  (×2 to ×8, decays if you play safe) and refill **Surge**.
- **Surge**: hold the mouse button to stretch time. Obstacles, phantoms and
  collapsing walls slow to 30 %; your cursor does not. The meter only refills by
  grazing.
- Each level hides one **signal fragment** (score, and a collection to complete)
  and every fifth level hides a **reboot core** off the route.
- **Esc** releases the mouse and opens the pause menu. **M** mutes.

## Modes

| Mode | What it is |
| --- | --- |
| **The Run** | All 41 levels, one life, reboot cores as your safety net, and one checkpoint: beat the Warden on level 21 and a lost run can respawn at level 22. Clearing it unlocks Overdrive. |
| **Practice** | Any of the ten sectors you have reached in a run. Deaths restart the level. Best times save a **ghost** you can race. |
| **Daily Twist** | A seeded 8-level gauntlet that changes every day, with mutators (mirrored, faster tempo, faster phantoms, gate overrides). One best score per day. |
| **Overdrive** | New Game+: every level mirrored, the soundtrack 12 % faster (obstacles follow the beat, so they are faster too), phantoms 25 % faster. |

## Scoring and records

Each cleared level scores a base amount, a time bonus for beating **par**, graze
points times combo, fragment and core bonuses, and earns an **S / A / B / C**
rank from its time. Clearing the run adds a bonus, and a deathless clear adds
another. Deaths without a core end the run with a recap: what killed you, how far
you got, and a word from the WARDEN. Results can be copied as a shareable
emoji grid.

The profile (saved in this browser) tracks runs, deaths, deepest level, high
score, fastest clear, grazes, max combo, fragments, per-level bests, run
history, the daily best, and 23 **achievements** that pop as toasts in play.
**Options** cover mouse sensitivity, music and SFX volume, screen shake, full or
reduced flashing, scanlines, and the best-run ghost.

## The 41 levels

Every course is hand-authored (`src/game/courses.ts` for 1–20, `courses2.ts`
for 21–41) and fixed between runs, so layouts can be learned. All obstacle
motion is expressed in **beats**, and the tempo climbs from 126 to 150 BPM
across the sectors, so everything gets faster as the soundtrack escalates.

| # | Level | New mechanic |
| --- | --- | --- |
| 01 | BOOT SEQUENCE | Open lane, static pillars. Learn the inversion. |
| 02 | MIRROR PROTOCOL | S-corridor with slow **pistons**. |
| 03 | PISTON ALLEY | Six pistons punching on the kick. |
| 04 | CAROUSEL | **Spinners**, one turn every two bars. |
| 05 | UNSTABLE SIGNAL | First **gate** (UNTWIST) with a **phantom**. Reboot core #1 inside a spinner. |
| 06 | PHASE GATES | Beat-timed **doors**; a blink means it slams on the next beat. |
| 07 | ORBITAL | **Orbiters** circling deadly cores. |
| 08 | THE SWEEP | **Laser sweepers**; pillars occlude the beam. |
| 09 | OVERCLOCK | TURBO and DRAG gates, pistons and doors between them. |
| 10 | PULSE | A **pulser** firing gapped rings every bar. Reboot core #2. |
| 11 | KERNEL PANIC | **Seekers** that hunt you through walls. |
| 12 | RECURSION | A slowly rotating **spiral**; the goal is at its centre. |
| 13 | SWELL SEASON | SWELL gate through doors and posts, then a **bouncer** box. |
| 14 | BLACK ICE | A **collapsing hallway**: static advances along the corridor behind you. |
| 15 | DAEMON | Seekers, orbiters and **gravity wells**. Reboot core #3 behind a laser. |
| 16 | SEGFAULT | The one maze, collapsing along your path, with doors at junctions. |
| 17 | EVENT HORIZON | A field of gravity wells; a BLACKOUT gate hides them. |
| 18 | TOTAL RECALL | Everything at once inside a corridor that **breathes** with the kick. |
| 19 | CORE MELTDOWN | The reactor: a three-arm spinner around the goal, rings from the centre, corner lasers, a TURBO gate with a decaying signal. |
| 20 | ANNIHILATION | Collapsing S-corridor, seekers, spinners, doors, two gates. Reboot core #4. |
| 21 | THE WARDEN | Boss. Three phases of **SURVIVE** for 30 s against aimed bolts, falling bars, seekers and a charging laser, then breach the core inside a roaming spiral. Writes the checkpoint. |
| 22 | AFTERSHOCK | **Turrets** that lead your movement; pillars block their bolts. |
| 23 | LATTICE | A **laser lattice** whose beam groups cycle on the beat. |
| 24 | UNDERTOW | **Currents** that push against you, plus pistons and doors. |
| 25 | MINEFIELD | **Proximity mines** with a DRAG gate. Reboot core #5 in the densest cluster. |
| 26 | SERPENT | Two **serpents** snaking across the arena. |
| 27 | PENDULUM | Four **pendulums** in a wide hall. |
| 28 | SHUTTER | **Phasing blocks** that reconfigure the room every two bars, with an UNTWIST gate. |
| 29 | COMPRESSION | A **shrinking arena** with orbiters and corner lasers; the goal is at the centre. |
| 30 | TWIN SPIRALS | Counter-rotating spirals. Reboot core #6 in the first, the goal in the second. |
| 31 | CROSSFIRE | Turrets and a laser over pillar cover, with a BLACKOUT gate. |
| 32 | RIPTIDE | Collapsing corridor with currents running against every leg. |
| 33 | SWARM | Short-lived seekers that keep respawning, and a door. |
| 34 | LATTICE II | A faster lattice with gravity wells inside the cells and a DRAG gate. |
| 35 | MINE SHAFT | Winding corridor of mines and pistons. Reboot core #7 in a pocket guarded by a pendulum. |
| 36 | REFLECTION | A room split in two: a serpent above, turrets below, a SWELL gate across both. |
| 37 | GRAVITY STORM | Four wells, an orbiter ring, vertical currents and two turrets. |
| 38 | ENDGAME I | Lattice, doors, turrets and a crush wall in one corridor. |
| 39 | ENDGAME II | Twin spirals and a vertical serpent inside a shrinking room. |
| 40 | ENDGAME III | The final hallway: mines, a pendulum, a turret, gates, doors, a serpent, a crush wall. Reboot core #8. |
| 41 | WARDEN PRIME | Final boss: four phases on the same rules, a sliding box, twin lasers, a blackout phase and a phantom. |

### Gates

From level 05 the route runs through **gate nodes**: glowing membranes that span
the passage and cannot be avoided. Touching one rewrites your controls and the
node vanishes; touching the matching **RESTORE** node further along puts them
back and vanishes too. Position does not matter, so backing out does not undo
the flip. A **phantom** materialises well behind the entry node and homes on you
through walls, so stalling is fatal. Two gates use other pressure: a collapsing
hallway (level 14) and a decaying signal bar (level 19).

| Gate | Effect |
| --- | --- |
| UNTWIST | Controls become **normal** (yes, that is harder now) |
| TURBO | Cursor speed ×2 (the phantom speeds up too) |
| DRAG | Cursor speed ×0.4 |
| SWELL | Cursor grows ×1.9 |
| BLACKOUT | Only a small radius around the orb is visible |
| SPIN | Inputs rotated 90° on top of the inversion (Daily Twist only) |

### Reboot cores and the checkpoint

Every fifth level hides one **reboot core**, always off the main route and behind
extra hazards. Cores stack up to three and carry forward. Dying with a core
consumes it and resumes the same level from its start pad (that level's core
does not reappear). Dying without one ends the run, unless the Warden has
already fallen this run: then the game-over screen offers a respawn at level 22
that keeps your score and results.

### The Warden fights

Levels 21 and 41 are boss arenas, and every phase follows the same rules:

1. **Survive** for 30 seconds. The Warden fires aimed bolts, drops falling bars
   and, in later phases, releases seekers. There are no expanding rings.
2. At the 15-second mark of phase 2 onwards, its **laser charges**: a dashed,
   harmless guide that thickens and flickers for about two seconds before the
   beam turns lethal and starts sweeping.
3. At 30 seconds the Warden **stops firing**, the laser powers down, and a
   **spiral fades in** where it is about to appear: a dashed footprint, ghosted
   arms and a countdown. It is harmless until the countdown ends.
4. Once live, the spiral roams and rotates with the glowing **breach core** at its
   centre. Grab it and a lightning arc strips one shell off the Warden's box.
   After a short respite the next, harder phase begins.

The Warden takes three hits. Warden Prime takes four, slides its box along the
top, charges twin lasers in its later phases, blacks out the room in phase 3 and
releases a phantom in phase 4. Its blackout and phantom only last through the
survive windows, never the spiral. The HUD shows the phase, the survive
countdown and what is coming next.

## Story

The WARDEN, the security intelligence of the system you were couriering
through, hijacked your neural link and inverted the interface. The first five
sectors are the layers of its outer core; you meet it in person on level 21,
then push through the five sectors beyond it to Warden Prime. The phantoms are
cut from your own movement logs; the reboot cores are cached copies of your
unhijacked self. It talks to you at every level, briefs you at every sector, and
has something to say about every way you die.

## Audio

There are no audio files. `src/audio/engine.ts` is a fully procedural Web Audio
synthwave engine with four original songs:

| Song | Plays on | Character |
| --- | --- | --- |
| **Inversion** | Title, levels 1–20, the win screen | A minor, described below. |
| **Deep Field** | Levels 22–40 | D minor, swung hats, a galloping octave bass, three-against-four plucks, brass stabs, a portamento lead and a half-time lift every fourth phrase. |
| **The Warden** | Level 21 | E Phrygian at 150 BPM: a grinding riff on the flat second, alarm arps, a siren lead that bends into every note, and toms. It follows the fight: a heartbeat intro, new layers each phase, and a thinned-out tension mix while the spiral is up. |
| **Warden Prime** | Level 41 | C minor at 156 BPM: a vowel-formant choir, an 808 sub, trap hat rolls, a half-time backbeat, orchestral hits and a supersaw theme, also layered by phase. |

Inversion, the first-half theme, has a dark, bass-heavy mix: a deep saturated kick with its own
sub layer, dark claps, 16th-note hats, a reese-style detuned octave bass over a
fat sine sub with three alternating patterns, side-chained pads with a triangle
body and a sub drone two octaves down, a mid-register arp and a sparse vibrato
lead. The track runs in A minor through two alternating 8-bar sections (Am F Dm
E / Am F Bb E and Am Em F Dm / Am G Bb E) with a breakdown every fourth phrase
where the drums drop to a sustained sub and swell back in. The arrangement
thickens with the level (arp at 5, lead at 9, drive and syncopation at 13,
risers at 17), and the master gets a low-shelf boost and a high-shelf cut.
Surge muffles the track and swells a hum; a phantom adds a proximity drone; a
collapsing hallway adds a rumble; grazes chirp up the combo; achievements chime.

Every scheduled kick, clap and hat is timestamped, and the renderer reads that
clock every frame, so the grid, walls, obstacles, bloom, portal and HUD pulse on
the beat. Pistons punch on the kick and doors slam on the bar.

## Visuals

Canvas 2D at a logical 1280×720, scaled to the window. Static walls are
pre-rendered per level into a glow layer and a core layer; obstacles, gates, the
phantom, fragments, cores, the ghost and score popups are drawn every frame.
The scene is composited through a cheap down-sampled bloom, per-channel
chromatic aberration (SVG colour matrices via `ctx.filter`), glitch slice
displacement, screen shake, flashes, a cinematic zoom (death cam, portal warp,
level entry) and a cool time-dilation tint, under CSS scanlines and a vignette.

## Dev tools

In dev builds (`npm run dev`):

- `?level=N` starts the run at level N.
- **G** toggles ghost mode (nothing kills you), **N** / **P** jump to the next /
  previous level of the current run.
- Each level load runs a static reachability check and warns in the console if
  the goal or the reboot core cannot be reached through the walls.
- The live game instance is exposed as `window.__twisted`.

## Project layout

```
src/
  audio/engine.ts       procedural music + SFX + beat clock
  game/engine.ts        state machine, modes, movement, gates, graze, surge, records
  game/entities.ts      obstacle catalog: definitions, evaluation, collision
  game/courses.ts       levels 1–20 (+ fragments)
  game/courses2.ts      levels 21–41: the Warden, sectors 06–10, Warden Prime
  game/modes.ts         daily plan, Overdrive mutators, course mirroring
  game/score.ts         par times, scoring, ranks
  game/story.ts         transmissions, briefings, taunts, ending
  game/achievements.ts  achievement definitions
  game/profile.ts       persistent profile + options
  game/levels.ts        level names, sectors, palettes, gate info
  game/maze.ts          maze carving (level 16), capsule collision helpers
  game/reach.ts         dev reachability check
  game/input.ts         pointer-lock input with fallback
  render/renderer.ts    canvas rendering and post-processing
  ui/                   React title menu, panels, HUD, overlays, summaries
```
