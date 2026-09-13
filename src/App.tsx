import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/engine';
import type { Snapshot } from './game/types';
import { H, W } from './render/renderer';
import { Hud } from './ui/Hud';
import { Overlays } from './ui/Overlays';
import { Title } from './ui/Title';

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);

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
      if (e.key === 'm' || e.key === 'M') setMuted(game.toggleMute());
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const onClick = useCallback(() => {
    const g = gameRef.current;
    if (!g || !snap) return;
    if (snap.phase === 'title') void g.begin();
    else if (snap.phase === 'paused') void g.resume();
    else if (snap.phase === 'won') void g.restart();
  }, [snap]);

  const phase = snap?.phase ?? 'title';

  return (
    <div className={`viewport phase-${phase}`} onClick={onClick}>
      <div
        ref={stageRef}
        className={`stage phase-${phase}`}
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <canvas ref={canvasRef} className="game-canvas" style={{ width: W, height: H }} />
        {snap && phase !== 'title' && <Hud snap={snap} muted={muted} />}
        {snap && phase === 'title' && <Title snap={snap} muted={muted} />}
        {snap && <Overlays snap={snap} />}
        <div className="scanlines" />
        <div className="vignette" />
        <div className="danger-vignette" />
      </div>
    </div>
  );
}
