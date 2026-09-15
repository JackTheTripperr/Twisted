import { useState } from 'react';
import type { Game } from '../game/engine';
import { LEVEL_COUNT } from '../game/levels';
import { describeMutators } from '../game/modes';
import { RANK_COLOR, fmtScore } from '../game/score';
import { DAILY_LINES, ENDING_LINES, OVERDRIVE_LINES } from '../game/story';
import type { Snapshot } from '../game/types';
import { Btn, Glitch, Typewriter, fmtTime, pad2 } from './bits';

function ResultsTable({ snap }: { snap: Snapshot }) {
  return (
    <div className="results">
      <div className="res-row head">
        <span>LVL</span>
        <span>SECTOR</span>
        <span>TIME</span>
        <span>GRAZE</span>
        <span>SCORE</span>
        <span>RANK</span>
      </div>
      <div className="res-scroll">
        {snap.results.map((r) => (
          <div className="res-row" key={r.level}>
            <span>{pad2(r.level)}</span>
            <span className="res-name">
              {r.name}
              {r.core && <i title="reboot core"> ⬢</i>}
              {r.fragment && <i title="fragment"> ◆</i>}
            </span>
            <span className="mono">{fmtTime(r.time)}</span>
            <span>{r.grazes}</span>
            <span className="mono">{fmtScore(r.score)}</span>
            <span className="res-rank" style={{ color: RANK_COLOR[r.rank] }}>
              {r.rank}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ game }: { game: Game }) {
  const [done, setDone] = useState(false);
  return (
    <Btn
      game={game}
      className="small"
      onClick={() => {
        const text = game.shareText();
        navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => setDone(false),
        );
      }}
    >
      {done ? 'COPIED ✓' : 'COPY RESULTS'}
    </Btn>
  );
}

export function WonScreen({ snap, game }: { snap: Snapshot; game: Game }) {
  const p = snap.profile;
  const lines = snap.mode === 'overdrive' ? OVERDRIVE_LINES : snap.mode === 'daily' ? DAILY_LINES : snap.mode === 'practice' ? [] : ENDING_LINES;
  const practice = snap.mode === 'practice';
  const nextOk = practice && snap.level < LEVEL_COUNT && Math.floor(snap.level / 4) + 1 <= p.sectorsUnlocked;
  return (
    <div className="overlay won" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="won-kicker">{practice ? `PRACTICE · LEVEL ${pad2(snap.level)} CLEARED` : snap.mode === 'daily' ? `DAILY TWIST ${snap.dailyKey} · CLEARED` : snap.mode === 'overdrive' ? 'OVERDRIVE · CLEARED' : 'RUN COMPLETE'}</div>
      <div className="won-title">
        <Glitch text={practice ? 'CLEARED' : 'UNTWISTED'} />
      </div>
      {lines.length > 0 && (
        <div className="ending">
          {lines.map((l, i) => (
            <div key={l} className="ending-line">
              <Typewriter text={l} speed={22} delay={400 + i * 1300} />
            </div>
          ))}
        </div>
      )}
      <div className="won-stats">
        <div>
          <span className="hud-label">SCORE</span>
          <span className="won-value mono">{fmtScore(snap.score)}</span>
        </div>
        <div>
          <span className="hud-label">TIME</span>
          <span className="won-value mono">{fmtTime(snap.winTime)}</span>
        </div>
        <div>
          <span className="hud-label">DEATHS</span>
          <span className="won-value">{snap.deaths}</span>
        </div>
        <div>
          <span className="hud-label">GRAZES</span>
          <span className="won-value">{snap.results.reduce((a, r) => a + r.grazes, 0)}</span>
        </div>
      </div>
      {snap.newRecords.length > 0 && <div className="records-line">◈ {snap.newRecords.join(' · ')}</div>}
      <ResultsTable snap={snap} />
      <div className="menu-row">
        <Btn game={game} primary onClick={() => void game.runAgain()}>
          {practice ? 'RETRY' : 'RUN AGAIN'}
        </Btn>
        {practice && (
          <Btn game={game} disabled={!nextOk} onClick={() => void game.practiceNext()}>
            NEXT LEVEL
          </Btn>
        )}
        {!practice && <CopyButton game={game} />}
        <Btn game={game} className="small" onClick={() => game.quitToTitle()}>
          TITLE
        </Btn>
      </div>
    </div>
  );
}

export function OverScreen({ snap, game }: { snap: Snapshot; game: Game }) {
  const label = snap.mode === 'daily' ? `DAILY TWIST ${snap.dailyKey}` : snap.mode === 'overdrive' ? 'OVERDRIVE' : 'THE RUN';
  return (
    <div className="overlay over" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="won-kicker">{label} · OVER</div>
      <div className="death-title">
        <Glitch text="SIGNAL LOST" className="glitch-hard" />
      </div>
      <div className="recap">
        <span>
          KILLED BY <b>{snap.killer || 'UNKNOWN'}</b>
        </span>
        <span>
          LEVEL <b>{pad2(snap.level)}</b> · {snap.levelName}
        </span>
        <span>
          <b>{Math.round(snap.progress * 100)}%</b> OF THE WAY
        </span>
        <span>
          <b>{snap.deaths}</b> DEATH{snap.deaths === 1 ? '' : 'S'}
        </span>
      </div>
      <div className="taunt">
        <Typewriter text={snap.taunt} speed={24} delay={300} />
      </div>
      <div className="won-stats">
        <div>
          <span className="hud-label">SCORE</span>
          <span className="won-value mono">{fmtScore(snap.score)}</span>
        </div>
        <div>
          <span className="hud-label">LEVELS</span>
          <span className="won-value">
            {snap.results.length}/{snap.runLength}
          </span>
        </div>
        <div>
          <span className="hud-label">TIME</span>
          <span className="won-value mono">{fmtTime(snap.runTime)}</span>
        </div>
        <div>
          <span className="hud-label">GRAZES</span>
          <span className="won-value">{snap.results.reduce((a, r) => a + r.grazes, 0) + snap.levelGrazes}</span>
        </div>
      </div>
      {snap.newRecords.length > 0 && <div className="records-line">◈ {snap.newRecords.join(' · ')}</div>}
      {snap.mutators && describeMutators(snap.mutators)[0] !== 'STANDARD' && <div className="mut-line">{describeMutators(snap.mutators).join(' · ')}</div>}
      {snap.results.length > 0 && <ResultsTable snap={snap} />}
      <div className="menu-row">
        <Btn game={game} primary onClick={() => void game.runAgain()}>
          RUN AGAIN
        </Btn>
        <CopyButton game={game} />
        <Btn game={game} className="small" onClick={() => game.quitToTitle()}>
          TITLE
        </Btn>
      </div>
    </div>
  );
}
