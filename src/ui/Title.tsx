import type { Snapshot } from '../game/types';
import { fmtTime } from './Hud';

export function Title({ snap, muted }: { snap: Snapshot; muted: boolean }) {
  return (
    <div className="overlay title">
      <div className="title-top">
        <span className="title-tag">// NEURAL OBSTACLE PROTOCOL v2.0</span>
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
          <b>FRAGILE</b> · touch anything neon and you restart from level 01
        </li>
        <li>
          <b>20 SECTORS</b> · pistons, spinners, lasers, seekers, collapsing halls, a spiral or two
        </li>
        <li>
          <b>GATES</b> · pass a gate node and your controls are rewritten until the next one · a phantom hunts anyone who stalls
        </li>
        <li>
          <b className="white">REBOOT CORES</b> · every fifth sector hides a core that lets you retry the sector you die on · it is never on the way
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
