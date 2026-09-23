import type { MenuScreen } from '../App';
import type { Game } from '../game/engine';
import { ACHIEVEMENTS } from '../game/achievements';
import { LEVEL_COUNT } from '../game/levels';
import { describeMutators, dailyPlan } from '../game/modes';
import { todayKey } from '../game/profile';
import { fmtScore } from '../game/score';
import { BOOT_LINES } from '../game/story';
import type { Snapshot } from '../game/types';
import { Btn, fmtTime, pad2 } from './bits';

export function Title({ snap, game, onMenu }: { snap: Snapshot; game: Game; onMenu: (m: MenuScreen) => void }) {
  const p = snap.profile;
  const key = todayKey();
  const daily = dailyPlan(key);
  const dailyBest = p.daily && p.daily.key === key ? p.daily : null;
  return (
    <div className="overlay title">
      <div className="boot">
        {BOOT_LINES.map((l, i) => (
          <div key={l} className="boot-line" style={{ animationDelay: `${0.15 + i * 0.22}s` }}>
            {l}
          </div>
        ))}
      </div>
      <h1 className="logo" data-text="TWISTED">
        TWISTED
      </h1>
      <div className="tagline">YOUR MOUSE IS LYING TO YOU</div>
      <div className="menu">
        <Btn game={game} primary onClick={() => void game.startRun('run')}>
          JACK IN
          <small>THE RUN · 41 LEVELS · TWO WARDENS</small>
        </Btn>
        <Btn game={game} onClick={() => onMenu('practice')}>
          PRACTICE
          <small>{p.sectorsUnlocked >= 10 ? 'ALL SECTORS OPEN' : `${p.sectorsUnlocked} OF 10 SECTORS OPEN`}</small>
        </Btn>
        <Btn game={game} onClick={() => void game.startRun('daily')}>
          DAILY TWIST
          <small>
            {key} · {describeMutators(daily.mutators).join(' · ')}
            {dailyBest && dailyBest.bestScore > 0 ? ` · BEST ${fmtScore(dailyBest.bestScore)}` : ''}
          </small>
        </Btn>
        <Btn game={game} disabled={!p.overdriveUnlocked} onClick={() => void game.startRun('overdrive')}>
          OVERDRIVE
          <small>{p.overdriveUnlocked ? 'MIRRORED · FASTER · MEANER' : 'CLEAR THE RUN TO UNLOCK'}</small>
        </Btn>
        <div className="menu-row">
          <Btn game={game} className="small" onClick={() => onMenu('records')}>
            RECORDS
          </Btn>
          <Btn game={game} className="small" onClick={() => onMenu('options')}>
            OPTIONS
          </Btn>
        </div>
      </div>
      <div className="title-foot">
        <span>BEST · LEVEL {pad2(p.bestLevel)}</span>
        {p.bestScore > 0 && <span>HIGH SCORE · {fmtScore(p.bestScore)}</span>}
        {p.bestTime !== null && <span>FASTEST CLEAR · {fmtTime(p.bestTime)}</span>}
        <span>
          {p.achievements.length}/{ACHIEVEMENTS.length} ACHIEVEMENTS · {p.fragments.length}/{LEVEL_COUNT} FRAGMENTS
        </span>
      </div>
    </div>
  );
}
