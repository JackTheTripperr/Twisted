import { useState } from 'react';
import { ACHIEVEMENTS } from '../game/achievements';
import type { Game } from '../game/engine';
import { LEVELS, ZONES } from '../game/levels';
import { RANK_COLOR, fmtScore } from '../game/score';
import type { Options, Snapshot } from '../game/types';
import { Btn, fmtTime, pad2 } from './bits';

function Panel({ title, sub, onClose, game, children, wide = false }: { title: string; sub?: string; onClose: () => void; game: Game; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="overlay panel-wrap" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className={`panel ${wide ? 'wide' : ''}`}>
        <div className="panel-head">
          <div>
            <div className="panel-title">{title}</div>
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          <Btn game={game} className="small ghost-btn" onClick={onClose}>
            ✕ BACK
          </Btn>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

export function PracticePanel({ snap, game, onClose }: { snap: Snapshot; game: Game; onClose: () => void }) {
  const p = snap.profile;
  const [sector, setSector] = useState(Math.min(p.sectorsUnlocked, 5) - 1);
  const levels = LEVELS.filter((l) => l.zone === sector);
  const zone = ZONES[sector];
  return (
    <Panel title="PRACTICE" sub="Any sector you have reached in a run. Deaths restart the level. Best times save a ghost." onClose={onClose} game={game} wide>
      <div className="tabs">
        {ZONES.map((z, i) => {
          const locked = i + 1 > p.sectorsUnlocked;
          return (
            <button
              type="button"
              key={z.name}
              className={`tab ${i === sector ? 'on' : ''} ${locked ? 'locked' : ''}`}
              style={{ ['--tab' as string]: z.primary }}
              disabled={locked}
              onMouseEnter={() => !locked && game.audio.sfxMenu('hover')}
              onClick={() => {
                if (locked) return;
                game.audio.sfxMenu('click');
                setSector(i);
              }}
            >
              <span className="tab-num">0{i + 1}</span>
              <span className="tab-name">{locked ? 'LOCKED' : z.name}</span>
            </button>
          );
        })}
      </div>
      <div className="tiles" style={{ ['--tile' as string]: zone.primary, ['--tile2' as string]: zone.secondary }}>
        {levels.map((l) => {
          const best = p.levelBest[String(l.level)];
          const hasGhost = !!p.ghosts[String(l.level)];
          return (
            <button
              type="button"
              key={l.level}
              className="tile"
              onMouseEnter={() => game.audio.sfxMenu('hover')}
              onClick={() => {
                game.audio.sfxMenu('click');
                void game.startPractice(l.level);
              }}
            >
              <span className="tile-num">{pad2(l.level)}</span>
              <span className="tile-name">{l.name}</span>
              <span className="tile-meta">
                {best ? (
                  <>
                    <b style={{ color: RANK_COLOR[best.rank] }}>{best.rank}</b> {fmtTime(best.time)} · {fmtScore(best.score)}
                  </>
                ) : (
                  'NO RECORD'
                )}
              </span>
              <span className="tile-flags">
                {p.fragments.includes(l.level) && <span title="fragment collected">◆</span>}
                {hasGhost && <span title="ghost saved">◌</span>}
                {l.pickup && <span title="reboot core here">⬢</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export function RecordsPanel({ snap, game, onClose }: { snap: Snapshot; game: Game; onClose: () => void }) {
  const p = snap.profile;
  const [confirm, setConfirm] = useState(false);
  const stats: [string, string][] = [
    ['RUNS', String(p.runs)],
    ['CLEARS', String(p.clears)],
    ['DEATHS', String(p.deaths)],
    ['DEEPEST', `LEVEL ${pad2(p.bestLevel)}`],
    ['HIGH SCORE', fmtScore(p.bestScore)],
    ['FASTEST CLEAR', p.bestTime !== null ? fmtTime(p.bestTime) : '--'],
    ['GRAZES', String(p.totalGrazes)],
    ['MAX COMBO', `×${p.maxCombo}`],
    ['FRAGMENTS', `${p.fragments.length}/20`],
    ['OVERDRIVE', p.overdriveBest ? `${fmtScore(p.overdriveBest.score)} · L${pad2(p.overdriveBest.level)}` : p.overdriveUnlocked ? 'UNLOCKED' : 'LOCKED'],
  ];
  return (
    <Panel title="RECORDS" sub="Everything the Warden remembers about you." onClose={onClose} game={game} wide>
      <div className="stats">
        {stats.map(([k, v]) => (
          <div className="stat-cell" key={k}>
            <span className="hud-label">{k}</span>
            <span className="stat-val">{v}</span>
          </div>
        ))}
      </div>
      <div className="section-label">ACHIEVEMENTS · {p.achievements.length}/{ACHIEVEMENTS.length}</div>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const on = p.achievements.includes(a.id);
          return (
            <div className={`ach ${on ? 'on' : ''}`} key={a.id}>
              <span className="ach-icon">{on ? '◈' : '◇'}</span>
              <span className="ach-name">{a.name}</span>
              <span className="ach-desc">{a.desc}</span>
            </div>
          );
        })}
      </div>
      {p.history.length > 0 && (
        <>
          <div className="section-label">RECENT RUNS</div>
          <div className="history">
            {p.history.map((h, i) => (
              <div className="hist-row" key={i}>
                <span>{h.date}</span>
                <span className="hist-mode">{h.mode.toUpperCase()}</span>
                <span>{h.cleared ? 'UNTWISTED' : `LOST L${pad2(h.level)}`}</span>
                <span className="mono">{fmtScore(h.score)}</span>
                <span className="mono">{fmtTime(h.time)}</span>
                <span>{h.deaths} ✕</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="panel-actions">
        {!confirm ? (
          <Btn game={game} className="small danger" onClick={() => setConfirm(true)}>
            RESET PROGRESS
          </Btn>
        ) : (
          <>
            <span className="confirm-text">WIPE EVERYTHING? THE WARDEN WILL FORGET YOU.</span>
            <Btn
              game={game}
              className="small danger"
              onClick={() => {
                game.resetProgress();
                setConfirm(false);
              }}
            >
              YES · WIPE
            </Btn>
            <Btn game={game} className="small" onClick={() => setConfirm(false)}>
              KEEP
            </Btn>
          </>
        )}
      </div>
    </Panel>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="opt-row">
      <span className="opt-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="opt-val mono">{format(value)}</span>
    </label>
  );
}

function Toggle({ label, value, onChange, game, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; game: Game; hint?: string }) {
  return (
    <div className="opt-row">
      <span className="opt-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        type="button"
        className={`toggle ${value ? 'on' : ''}`}
        onMouseEnter={() => game.audio.sfxMenu('hover')}
        onClick={() => {
          game.audio.sfxMenu('click');
          onChange(!value);
        }}
      >
        <span className="knob" />
        <span className="toggle-text">{value ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}

export function OptionsPanel({ snap, game, onClose }: { snap: Snapshot; game: Game; onClose: () => void }) {
  const o = snap.profile.options;
  const set = (patch: Partial<Options>) => game.setOptions(patch);
  return (
    <Panel title="OPTIONS" sub="Saved to this browser." onClose={onClose} game={game}>
      <Slider label="MOUSE SENSITIVITY" value={o.sens} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ sens: v })} />
      <Slider label="MUSIC" value={o.music} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ music: v })} />
      <Slider label="SFX" value={o.sfx} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ sfx: v })} />
      <Toggle label="SCREEN SHAKE" value={o.shake} onChange={(v) => set({ shake: v })} game={game} />
      <Toggle label="FULL FLASHING" hint="off softens flashes, glitches and colour splits" value={o.flash} onChange={(v) => set({ flash: v })} game={game} />
      <Toggle label="SCANLINES" value={o.scanlines} onChange={(v) => set({ scanlines: v })} game={game} />
      <Toggle label="BEST-RUN GHOST" hint="a translucent replay of your fastest clear" value={o.ghost} onChange={(v) => set({ ghost: v })} game={game} />
      <div className="opt-help">
        <b>SURGE</b> · hold the mouse button to stretch time. Grazing hazards refills it.
        <br />
        <b>M</b> mutes · <b>ESC</b> releases the mouse and pauses.
      </div>
    </Panel>
  );
}

export function PauseMenu({ snap, game, onOptions }: { snap: Snapshot; game: Game; onOptions: () => void }) {
  return (
    <div className="overlay paused" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="paused-title">
        <span className="glitch" data-text="LINK SEVERED">
          LINK SEVERED
        </span>
      </div>
      <div className="paused-sub">
        LEVEL {pad2(snap.level)} · {snap.levelName} · RESUMING RESTARTS THE LEVEL FROM ITS PAD
      </div>
      <div className="menu compact">
        <Btn game={game} primary onClick={() => void game.resume()}>
          RESUME
        </Btn>
        {snap.mode === 'practice' && (
          <Btn game={game} onClick={() => void game.restartLevel()}>
            RESTART LEVEL
          </Btn>
        )}
        <Btn game={game} onClick={onOptions}>
          OPTIONS
        </Btn>
        <Btn game={game} className="danger" onClick={() => game.quitToTitle()}>
          {snap.mode === 'practice' ? 'BACK TO TITLE' : 'ABANDON RUN'}
        </Btn>
      </div>
    </div>
  );
}
