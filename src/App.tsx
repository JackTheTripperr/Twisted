import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/engine';
import type { Snapshot } from './game/types';
import { H, W } from './render/renderer';
import { Hud } from './ui/Hud';
import { OptionsPanel, PauseMenu, PracticePanel, RecordsPanel } from './ui/Menus';
import { Overlays, Toast } from './ui/Overlays';
import { OverScreen, WonScreen } from './ui/Summary';
import { Title } from './ui/Title';

export type MenuScreen = 'main' | 'practice' | 'records' | 'options';

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const [menu, setMenu] = useState<MenuScreen>('main');
  const [pauseOptions, setPauseOptions] = useState(false);

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const game = new Game(canvas, stage, stage);
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __twisted: Game }).__twisted = game;
    const unsub = game.subscribe(setSnap);
    const onResize = () => {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H);
      setScale(s);
      game.setScale(s);
    };
    onResize();
    window.addEventListener('resize', onResize);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'm') setMuted(game.toggleMute());
      if (e.key === 'Escape') {
        setMenu('main');
        setPauseOptions(false);
      }
      if (!import.meta.env.DEV) return;
      if (k === 'g') game.toggleGhost();
      if (k === 'n') game.devJump(1);
      if (k === 'p') game.devJump(-1);
    };
    window.addEventListener('keydown', onKey);
    const onUp = () => game.setSurgeHeld(false);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const phase = snap?.phase ?? 'title';

  const onClick = useCallback(() => {
    const g = gameRef.current;
    if (!g || !snap) return;
    if (snap.phase === 'intro') g.startPlay();
  }, [snap]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const g = gameRef.current;
      if (!g || e.button !== 0) return;
      if (phase === 'playing') g.setSurgeHeld(true);
    },
    [phase],
  );

  useEffect(() => {
    if (phase === 'title') setPauseOptions(false);
    if (phase !== 'title') setMenu('main');
  }, [phase]);

  const game = gameRef.current;
  const scan = snap?.profile.options.scanlines ?? true;

  return (
    <div className={`viewport phase-${phase}`} onClick={onClick} onMouseDown={onMouseDown}>
      <div
        ref={stageRef}
        className={`stage phase-${phase} ${scan ? '' : 'no-scanlines'}`}
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <canvas ref={canvasRef} className="game-canvas" style={{ width: W, height: H }} />
        {snap && game && phase !== 'title' && phase !== 'won' && phase !== 'over' && <Hud snap={snap} muted={muted} />}
        {snap && game && phase === 'title' && menu === 'main' && <Title snap={snap} game={game} onMenu={setMenu} />}
        {snap && game && phase === 'title' && menu === 'practice' && <PracticePanel snap={snap} game={game} onClose={() => setMenu('main')} />}
        {snap && game && phase === 'title' && menu === 'records' && <RecordsPanel snap={snap} game={game} onClose={() => setMenu('main')} />}
        {snap && game && phase === 'title' && menu === 'options' && <OptionsPanel snap={snap} game={game} onClose={() => setMenu('main')} />}
        {snap && game && phase === 'paused' && !pauseOptions && <PauseMenu snap={snap} game={game} onOptions={() => setPauseOptions(true)} />}
        {snap && game && phase === 'paused' && pauseOptions && <OptionsPanel snap={snap} game={game} onClose={() => setPauseOptions(false)} />}
        {snap && game && phase === 'won' && <WonScreen snap={snap} game={game} />}
        {snap && game && phase === 'over' && <OverScreen snap={snap} game={game} />}
        {snap && <Overlays snap={snap} />}
        {snap && <Toast snap={snap} />}
        <div className="scanlines" />
        <div className="vignette" />
        <div className="danger-vignette" />
      </div>
    </div>
  );
}
