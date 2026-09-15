import { LEVEL_COUNT } from '../game/levels';
import type { Snapshot } from '../game/types';
import { Glitch, Typewriter, pad2 } from './bits';

export function Overlays({ snap }: { snap: Snapshot }) {
  switch (snap.phase) {
    case 'intro':
      return (
        <div className="overlay intro" key={`intro-${snap.level}-${snap.deaths}-${snap.runIndex}`}>
          {snap.sectorBrief ? (
            <div className="sector-brief">
              <div className="sector-title">
                <Glitch text={snap.sectorBrief.title} />
              </div>
              <div className="sector-text">{snap.sectorBrief.text}</div>
            </div>
          ) : (
            <div className="intro-zone">{snap.zoneName}</div>
          )}
          <div className="intro-level">
            <Glitch text={`LEVEL ${pad2(snap.level)}`} />
          </div>
          <div className="intro-name">{snap.levelName}</div>
          <div className="transmission">
            <span className="tx-tag">WARDEN ▸</span> <Typewriter text={snap.transmission} speed={26} delay={350} />
          </div>
          <div className="cta blink">CLICK TO START</div>
        </div>
      );
    case 'dying':
      if (snap.mode === 'practice') {
        return (
          <div className="overlay death reboot" key={`death-${snap.deaths}`}>
            <div className="death-title">
              <Glitch text="RESET" />
            </div>
            <div className="death-sub">
              KILLED BY {snap.killer || 'UNKNOWN'} · {Math.round(snap.progress * 100)}% · RESTARTING LEVEL {pad2(snap.level)}
            </div>
          </div>
        );
      }
      return snap.rebootUsed ? (
        <div className="overlay death reboot" key={`death-${snap.deaths}`}>
          <div className="death-title">
            <Glitch text="REBOOT CONSUMED" />
          </div>
          <div className="death-sub">
            KILLED BY {snap.killer || 'UNKNOWN'} · RESUMING LEVEL {pad2(snap.level)} · {snap.reboots} REBOOT{snap.reboots === 1 ? '' : 'S'} LEFT
          </div>
          <div className="death-count">DEATHS {pad2(snap.deaths)}</div>
        </div>
      ) : (
        <div className="overlay death" key={`death-${snap.deaths}`}>
          <div className="death-title">
            <Glitch text="SIGNAL LOST" className="glitch-hard" />
          </div>
          <div className="death-sub">
            KILLED BY {snap.killer || 'UNKNOWN'} · LEVEL {pad2(snap.lastDeathLevel)} · {Math.round(snap.progress * 100)}% OF THE WAY
          </div>
          <div className="death-count">NO REBOOTS · DEATHS {pad2(snap.deaths)}</div>
        </div>
      );
    case 'clear':
      return (
        <div className="overlay clear" key={`clear-${snap.level}`}>
          <div className="clear-title">
            <Glitch text={snap.runIndex + 1 >= snap.runLength ? (snap.mode === 'practice' ? 'CLEARED' : 'SYSTEM LIBERATED') : 'SECTOR CLEARED'} />
          </div>
          <div className="clear-sub">
            {snap.runIndex + 1 >= snap.runLength
              ? snap.mode === 'practice'
                ? snap.levelName
                : `ALL ${snap.runLength === LEVEL_COUNT ? '20 SECTORS' : `${snap.runLength} LEVELS`} UNTWISTED`
              : `NEXT · LEVEL ${pad2(snap.level + (snap.mode === 'daily' ? 0 : 1))}`}
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function Toast({ snap }: { snap: Snapshot }) {
  const t = snap.toast;
  if (!t) return null;
  return (
    <div className="toast" key={t.id}>
      <span className="toast-icon">◈</span>
      <span className="toast-body">
        <span className="toast-kicker">ACHIEVEMENT</span>
        <span className="toast-name">{t.name}</span>
        <span className="toast-desc">{t.desc}</span>
      </span>
    </div>
  );
}
