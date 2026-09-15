# TWISTED

Play at https://twisted-two.vercel.app/

Initial commit is a Fable 5.1 1-shot, exact prompt:

> Make a reactjs + vite, and launch  it on port 3004. A game called "Twisted" where you navigate your mouse cursor through a maze, except all mouse inputs are reversed. When the cursor touches a wall, the player "dies" and starts from level 1. Make it super creative and visually breathtaking. The visuals should take on a retro neon cyberpunk style, and the audio should blend 80's synthwave aesthetics with modern electronic production (inspired by "Total Nuclear Annihilation" by Scott Danesi). 
>
>There should be 20 levels, each level progressing in difficulty (narrow passages, complex turns to navigate, tight corridors, etc.). As the difficulty increases, introduce mechanics that make the gameplay more challenging for a short period...mouse movements return to normal, cursor speed change, cursor size increase). The visuals should pulse and flash in time with the soundtrack.

Version 2 turned the mazes into obstacle courses, made the glitch modifiers
spatial (you cannot wait them out), and added reboot cores.

A neon cyberpunk obstacle course where your mouse is lying to you. Every
movement is inverted, everything neon is lethal, and dying sends you back to
level 01 unless you are carrying a reboot core.

## Run it

```bash
npm install
npm run dev
```

The dev server is pinned to **http://localhost:3004** (`--strictPort`).
`npm run build` type-checks and produces a static bundle in `dist/`;
`npm run preview` serves that bundle on the same port.

## How to play

- Click **JACK IN** on the title screen. The game grabs the pointer (Pointer Lock)
  and hides the real cursor; the neon orb is you.
- Every level opens on its name and waits for a click, so you can read the course
  and the rhythm before the clock starts.
- Mouse input is **reversed on both axes**. Push right, the orb goes left.
- Guide the orb from the cyan start pad to the magenta portal.
- Touch a wall, a moving bar, a beam, a ring, a seeker, or the static of a
  collapsing hallway and you die.
- **Esc** releases the mouse (pauses, the level restarts from its pad). **M** mutes.
- Best level reached and fastest full clear are stored in `localStorage`.

## The 20 sectors

Every course is hand-authored in `src/game/courses.ts` and fixed between runs,
so layouts can be learned. All obstacle motion is expressed in **beats**, and the
tempo climbs from 126 to 142 BPM across the five zones, so everything gets faster
as the soundtrack escalates.

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
| 19 | CORE MELTDOWN | SPIN gate into a spiral with a decaying signal. |
| 20 | ANNIHILATION | Collapsing S-corridor, seekers, spinners, doors, two gates. Reboot core #4. |

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
| SPIN | Inputs rotated 90° on top of the inversion |

### Reboot cores

Levels 05, 10, 15 and 20 each hide one **reboot core**, always off the main
route and behind extra hazards. Cores stack up to three and carry forward. Dying
with a core consumes it and resumes the same level from its start pad (that
level's core does not reappear). Dying without one restarts from level 01 with
nothing.

## Audio

There are no audio files. `src/audio/engine.ts` is a fully procedural Web Audio
synthwave engine with a dark, bass-heavy mix: a deep saturated kick with its own
sub layer, dark claps, 16th-note hats, a reese-style detuned octave bass over a
fat sine sub with three alternating patterns, side-chained pads with a triangle
body and a sub drone two octaves down, a mid-register arp and a sparse vibrato
lead. The track runs in A minor through two alternating 8-bar sections (Am F Dm
E / Am F Bb E and Am Em F Dm / Am G Bb E) with a breakdown every fourth phrase
where the drums drop to a sustained sub and swell back in. The arrangement
thickens with the level (arp at 5, lead at 9, drive and syncopation at 13,
risers at 17), and the master gets a low-shelf boost and a high-shelf cut. A
phantom adds a proximity drone; a collapsing hallway adds a rumble. Death slams
a low-pass filter over the mix; a reboot dips it and powers back up; level
clears fire a rising run.

Every scheduled kick, clap and hat is timestamped, and the renderer reads that
clock every frame, so the grid, walls, obstacles, bloom, portal and HUD pulse on
the beat. Pistons punch on the kick and doors slam on the bar.

## Visuals

Canvas 2D at a logical 1280×720, scaled to the window. Static walls are
pre-rendered per level into a glow layer and a core layer; obstacles, zones,
gates, the phantom and the reboot core are drawn every frame. The scene is
composited through a cheap down-sampled bloom, per-channel chromatic aberration
(SVG colour matrices via `ctx.filter`), glitch slice displacement, screen shake
and flashes, under CSS scanlines and a vignette.

## Dev tools

In dev builds (`npm run dev`):

- `?level=N` starts a run at level N.
- **G** toggles ghost mode (nothing kills you), **N** / **P** jump to the next /
  previous level.
- Each level load runs a static reachability check and warns in the console if
  the goal or the reboot core cannot be reached through the walls.
- The live game instance is exposed as `window.__twisted`.

## Project layout

```
src/
  audio/engine.ts     procedural music + SFX + beat clock
  game/engine.ts      state machine, movement, gates, phantom, reboots
  game/entities.ts    obstacle catalog: definitions, evaluation, collision
  game/courses.ts     the 20 hand-authored courses
  game/levels.ts      level names, zones, palettes, modifier info
  game/maze.ts        maze carving (level 16), capsule collision helpers
  game/reach.ts       dev reachability check
  game/input.ts       pointer-lock input with fallback
  render/renderer.ts  canvas rendering and post-processing
  ui/                 React HUD, title and overlays
```
