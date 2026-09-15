import { LEVEL_COUNT } from '../game/levels';
import type { Snapshot } from '../game/types';
import { fmtTime } from './Hud';

function Glitch({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`glitch ${className}`} data-text={text}>
      {text}
    </span>
  );
}

export function Overlays({ snap }: { snap: Snapshot }) {
  switch (snap.phase) {
    case 'intro':
      return (
        <div className="overlay intro" key={`intro-${snap.level}-${snap.deaths}`}>
          <div className="intro-zone">{snap.zoneName}</div>
          <div className="intro-level">
            <Glitch text={`LEVEL ${String(snap.level).padStart(2, '0')}`} />
          </div>
          <div className="intro-name">{snap.levelName}</div>
          <div className="cta blink">CLICK TO START</div>
        </div>
      );
    case 'dying':
      return snap.rebootUsed ? (
        <div className="overlay death reboot" key={`death-${snap.deaths}`}>
          <div className="death-title">
            <Glitch text="REBOOT CONSUMED" />
          </div>
          <div className="death-sub">
            RESUMING LEVEL {String(snap.level).padStart(2, '0')} · {snap.reboots} REBOOT{snap.reboots === 1 ? '' : 'S'} LEFT
          </div>
          <div className="death-count">DEATHS {String(snap.deaths).padStart(2, '0')}</div>
        </div>
      ) : (
        <div className="overlay death" key={`death-${snap.deaths}`}>
          <div className="death-title">
            <Glitch text="SIGNAL LOST" className="glitch-hard" />
          </div>
          <div className="death-sub">
            TERMINATED ON LEVEL {String(snap.lastDeathLevel).padStart(2, '0')} · NO REBOOTS · RESTARTING FROM LEVEL 01
          </div>
          <div className="death-count">DEATHS {String(snap.deaths).padStart(2, '0')}</div>
        </div>
      );
    case 'clear':
      return (
        <div className="overlay clear" key={`clear-${snap.level}`}>
          <div className="clear-title">
            <Glitch text={snap.level >= LEVEL_COUNT ? 'SYSTEM LIBERATED' : 'SECTOR CLEARED'} />
          </div>
          <div className="clear-sub">
            {snap.level >= LEVEL_COUNT ? 'ALL 20 SECTORS UNTWISTED' : `NEXT · LEVEL ${String(snap.level + 1).padStart(2, '0')}`}
          </div>
        </div>
      );
    case 'won':
      return (
        <div className="overlay won">
          <div className="won-kicker">RUN COMPLETE</div>
          <div className="won-title">
            <Glitch text="UNTWISTED" />
          </div>
          <div className="won-stats">
            <div>
              <span className="hud-label">RUN TIME</span>
              <span className="won-value mono">{fmtTime(snap.winTime)}</span>
            </div>
            <div>
              <span className="hud-label">DEATHS</span>
              <span className="won-value">{snap.deaths}</span>
            </div>
            <div>
              <span className="hud-label">BEST TIME</span>
              <span className="won-value mono">{snap.bestTime !== null ? fmtTime(snap.bestTime) : '--'}</span>
            </div>
          </div>
          <div className="cta blink">CLICK TO RUN AGAIN</div>
        </div>
      );
    case 'paused':
      return (
        <div className="overlay paused">
          <div className="paused-title">
            <Glitch text="LINK SEVERED" />
          </div>
          <div className="paused-sub">THE MOUSE ESCAPED · LEVEL {String(snap.level).padStart(2, '0')} RESTARTS FROM ITS START PAD</div>
          <div className="cta blink">CLICK TO RESUME</div>
        </div>
      );
    default:
      return null;
  }
}
