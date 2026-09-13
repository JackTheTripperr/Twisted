# TWISTED

A neon cyberpunk maze game where your mouse is lying to you. Every movement is
inverted, the walls are lethal, and dying sends you back to level 01.

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
- Mouse input is **reversed on both axes**. Push right, the orb goes left.
- Guide the orb from the cyan start pad to the magenta portal.
- Touch any wall and you die: back to **level 01**, deaths counter up.
- **Esc** releases the mouse (pauses). **M** mutes.
- Best level reached and fastest full clear are stored in `localStorage`.

## The 20 levels

Levels are procedurally carved (seeded recursive backtracker, so layouts are
stable between runs and can be learned). Each level scores 14 candidate mazes and
keeps the one with the longest, twistiest left-to-right solution.

| Levels | Zone          | Grid       | What changes                                   |
| ------ | ------------- | ---------- | ---------------------------------------------- |
| 1–4    | Neon Dawn     | 5×3 → 9×5  | Learn the inversion. Wide corridors.           |
| 5–8    | Violet Drift  | 10×6 → 13×7 | UNTWIST glitches; chokepoint "teeth" appear.  |
| 9–12   | Grid Runner   | 14×8 → 17×9 | TURBO and DRAG speed glitches. Lead synth.    |
| 13–16  | Solar Flare   | 18×10 → 21×11 | SWELL (cursor ×1.9). Bass distortion.       |
| 17–20  | Meltdown      | 22×12 → 28×15 | BLACKOUT fog, then SPIN (axes rotated 90°). |

Corridors narrow from ~190 px to ~32 px, wall tubes thin out, and the cursor
shrinks slightly, so late levels demand real precision.

### Glitch modifiers

From level 05 a modifier fires every few seconds. A yellow **INCOMING** warning
blinks for 1.3 s, then the effect holds for 3–4 s:

| Modifier | Effect                                  |
| -------- | --------------------------------------- |
| UNTWIST  | Controls become **normal** (yes, that is harder now) |
| TURBO    | Cursor speed ×2                         |
| DRAG     | Cursor speed ×0.4                       |
| SWELL    | Cursor grows ×1.9 (can kill you standing still) |
| BLACKOUT | Only a small radius around the orb is visible |
| SPIN     | Inputs rotated 90° on top of the inversion |

## Audio

There are no audio files. `src/audio/engine.ts` is a fully procedural Web Audio
synthwave engine: four-on-the-floor kick with a saturated sub, layered claps,
16th-note hats, a driving octave-bouncing sawtooth bass with a filter envelope,
side-chained detuned pads, a ping-pong-delayed arpeggio and a vibrato lead. The
arrangement thickens with the level (arp at 5, lead at 9, drive and syncopation
at 13, risers at 17) and the tempo climbs from 126 to 142 BPM across the zones.
Death slams a low-pass filter over the mix; level clears fire a rising run.

Every scheduled kick, clap and hat is timestamped, and the renderer reads that
clock every frame, so the grid, walls, bloom, portal and HUD pulse exactly on the
beat.

## Visuals

Canvas 2D at a logical 1280×720, scaled to the window. The scene is composited
through a cheap down-sampled bloom, per-channel chromatic aberration (SVG colour
matrices via `ctx.filter`), glitch slice displacement, screen shake and flashes,
under CSS scanlines and a vignette. Walls are pre-rendered per level into a glow
layer and a core layer, and revealed with an expanding clip circle at level start.

## Project layout

```
src/
  audio/engine.ts     procedural music + SFX + beat clock
  game/engine.ts      state machine, movement, collisions, modifiers
  game/maze.ts        maze carving, solving, geometry, capsule collision
  game/levels.ts      the 20 level definitions, zones, modifier pools
  game/input.ts       pointer-lock input with fallback
  render/renderer.ts  canvas rendering and post-processing
  ui/                 React HUD, title and overlays
```

In dev mode the live game instance is exposed as `window.__twisted` for
debugging.
