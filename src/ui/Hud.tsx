import { LEVEL_COUNT, MAX_REBOOTS, MODIFIER_INFO, PRESSURE_INFO } from '../game/levels';
import { fmtScore } from '../game/score';
import type { Snapshot } from '../game/types';
import { fmtTime, pad2 } from './bits';

export { fmtTime } from './bits';

const PHASES = ['I', 'II', 'III', 'IV', 'V'];

export function Hud({ snap, muted }: { snap: Snapshot; muted: boolean }) {
  const z = snap.zone;
  const info = z ? MODIFIER_INFO[z.kind] : null;
  const modeTag = snap.mode === 'daily' ? 'DAILY' : snap.mode === 'overdrive' ? 'OVERDRIVE' : snap.mode === 'practice' ? 'PRACTICE' : null;
  const boss = snap.boss;
  return (
    <>
      <div className="hud">
        <div className="hud-block hud-left">
          <span className="hud-label">
            LEVEL{modeTag && <em className="mode-tag">{modeTag}</em>}
          </span>
          <span className="hud-value">
            {pad2(snap.level)}
            <small>{snap.mode === 'daily' ? ` · ${snap.runIndex + 1}/${snap.runLength}` : `/${LEVEL_COUNT}`}</small>
          </span>
          <span className="hud-sub">{snap.levelName}</span>
          {snap.pickupAvailable && <span className="core-badge">⬢ REBOOT CORE IN THIS SECTOR</span>}
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
          <div className="score-line">
            <span className="score-val mono">{fmtScore(snap.score + snap.levelScore)}</span>
            {snap.combo > 1 && (
              <span className={`combo ${snap.combo >= 6 ? 'hot' : ''}`}>
                ×{snap.combo}
                <span className="combo-bar">
                  <span className="combo-fill" />
                </span>
              </span>
            )}
          </div>
          {boss && (
            <div className={`boss-bar ${boss.dead ? 'dead' : ''}`}>
              <span className="boss-name">{snap.level === 41 ? 'WARDEN PRIME' : 'THE WARDEN'}</span>
              <span className="shells" aria-label={`${boss.hp} of ${boss.maxHp}`}>
                {Array.from({ length: boss.maxHp }, (_, i) => (
                  <span key={i} className={`shell ${i < boss.hp ? 'on' : ''}`} />
                ))}
              </span>
              <span className="boss-phase">{boss.dead ? 'OFFLINE' : `PHASE ${PHASES[boss.phase - 1] ?? boss.phase}`}</span>
              {!boss.dead && (
                <span className={`boss-stage stage-${boss.stage}`}>
                  {boss.stage === 'survive' ? (
                    <>
                      SURVIVE <b className="mono">{Math.ceil(boss.timeLeft)}</b>
                      <span className="survive-bar">
                        <span className="survive-fill" style={{ width: `${(boss.timeLeft / 30) * 100}%` }} />
                      </span>
                    </>
                  ) : boss.stage === 'warn' ? (
                    'SPIRAL INBOUND'
                  ) : boss.stage === 'breach' ? (
                    'BREACH THE CORE'
                  ) : boss.stage === 'intro' ? (
                    'STANDBY'
                  ) : (
                    'REBOOTING DEFENCES'
                  )}
                </span>
              )}
            </div>
          )}
          {z && info && (
            <div className="mod-chip mod-active" style={{ ['--mod' as string]: info.color }}>
              <span className="mod-name">{info.label} GATE</span>
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
            <span className="hud-value">{pad2(snap.deaths)}</span>
          </div>
          <div className="stat">
            <span className="hud-label">RUN</span>
            <span className="hud-value mono">{fmtTime(snap.runTime)}</span>
          </div>
          {snap.mode !== 'practice' && (
            <div className="stat">
              <span className="hud-label">REBOOTS</span>
              <span className="reboots" aria-label={`${snap.reboots} reboots`}>
                {Array.from({ length: MAX_REBOOTS }, (_, i) => (
                  <span key={i} className={`slot ${i < snap.reboots ? 'on' : ''}`} />
                ))}
              </span>
            </div>
          )}
          <div className="stat">
            <span className="hud-label">FRAGMENT</span>
            <span className={`frag ${snap.fragmentAvailable ? '' : 'got'}`}>{snap.fragmentAvailable ? '◇' : '◆'}</span>
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
        <span className={`surge ${snap.surgeActive ? 'active' : ''}`}>
          <span className="prox-label">SURGE · HOLD CLICK</span>
          <span className="surge-bar">
            <span className="surge-fill" />
          </span>
        </span>
        <span className="hint">
          {snap.fallbackInput ? 'POINTER LOCK UNAVAILABLE · FALLBACK INPUT' : 'ESC · PAUSE'} &nbsp;·&nbsp; M · {muted ? 'UNMUTE' : 'MUTE'}
        </span>
      </div>
    </>
  );
}
