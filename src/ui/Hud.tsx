import { LEVEL_COUNT, MAX_REBOOTS, MODIFIER_INFO, PRESSURE_INFO } from '../game/levels';
import type { Snapshot } from '../game/types';

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function Hud({ snap, muted }: { snap: Snapshot; muted: boolean }) {
  const z = snap.zone;
  const info = z ? MODIFIER_INFO[z.kind] : null;
  return (
    <>
      <div className="hud">
        <div className="hud-block hud-left">
          <span className="hud-label">LEVEL</span>
          <span className="hud-value">
            {String(snap.level).padStart(2, '0')}
            <small>/{LEVEL_COUNT}</small>
          </span>
          <span className="hud-sub">{snap.levelName}</span>
          {snap.pickupAvailable && <span className="core-badge">◈ REBOOT CORE IN THIS SECTOR</span>}
          {snap.ghost && <span className="ghost-badge">GHOST MODE · DEV</span>}
        </div>
        <div className="hud-block hud-center">
          <div className="pips" aria-hidden="true">
            <span className="pip" />
            <span className="pip" />
            <span className="pip" />
            <span className="pip" />
          </div>
          <span className="hud-zone">{snap.zoneName}</span>
          {z && info && (
            <div className="mod-chip mod-active" style={{ ['--mod' as string]: info.color }}>
              <span className="mod-name">{info.label} ZONE</span>
              <span className="mod-blurb">
                {info.blurb} · {PRESSURE_INFO[z.pressure]}
              </span>
              {z.pressure === 'decay' && (
                <span className="mod-bar">
                  <span className="mod-fill decay" />
                </span>
              )}
            </div>
          )}
        </div>
        <div className="hud-block hud-right">
          <div className="stat">
            <span className="hud-label">DEATHS</span>
            <span className="hud-value">{String(snap.deaths).padStart(2, '0')}</span>
          </div>
          <div className="stat">
            <span className="hud-label">RUN</span>
            <span className="hud-value mono">{fmtTime(snap.runTime)}</span>
          </div>
          <div className="stat">
            <span className="hud-label">REBOOTS</span>
            <span className="reboots" aria-label={`${snap.reboots} reboots`}>
              {Array.from({ length: MAX_REBOOTS }, (_, i) => (
                <span key={i} className={`slot ${i < snap.reboots ? 'on' : ''}`} />
              ))}
            </span>
          </div>
          <div className="stat">
            <span className="hud-label">BEST</span>
            <span className="hud-value">L{String(snap.bestLevel).padStart(2, '0')}</span>
          </div>
        </div>
      </div>
      <div className="footer">
        <span className="proximity">
          <span className="prox-label">HAZARD PROXIMITY</span>
          <span className="prox-bar">
            <span className="prox-fill" />
          </span>
        </span>
        <span className="hint">
          {snap.fallbackInput ? 'POINTER LOCK UNAVAILABLE · FALLBACK INPUT' : 'ESC · RELEASE MOUSE'} &nbsp;·&nbsp; M · {muted ? 'UNMUTE' : 'MUTE'}
        </span>
      </div>
    </>
  );
}
