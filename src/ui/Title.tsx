import type { Snapshot } from '../game/types';
import { fmtTime } from './Hud';

export function Title({ snap, muted }: { snap: Snapshot; muted: boolean }) {
  return (
    <div className="overlay title">
      <div className="title-top">
        <span className="title-tag">// NEURAL MAZE PROTOCOL v2.0</span>
      </div>
      <h1 className="logo" data-text="TWISTED">
        TWISTED
      </h1>
      <div className="tagline">YOUR MOUSE IS LYING TO YOU</div>
      <div className="cta blink">CLICK TO JACK IN</div>
      <ul className="rules">
        <li>
          <b>INVERTED</b> · every mouse movement is reversed
        </li>
        <li>
          <b>FRAGILE</b> · touch a wall and you reboot to level 01
        </li>
        <li>
          <b>20 SECTORS</b> · corridors narrow, turns multiply, the grid fights back
        </li>
        <li>
          <b>GLITCHES</b> · from sector 05 the rules mutate for a few seconds at a time
        </li>
      </ul>
      <div className="title-foot">
        <span>BEST · LEVEL {String(snap.bestLevel).padStart(2, '0')}</span>
        {snap.bestTime !== null && <span>FASTEST CLEAR · {fmtTime(snap.bestTime)}</span>}
        <span>ESC RELEASES THE MOUSE · M {muted ? 'UNMUTES' : 'MUTES'} · HEADPHONES RECOMMENDED</span>
      </div>
    </div>
  );
}
