import { useEffect, useState, type ReactNode } from 'react';
import type { Game } from '../game/engine';

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Menu button: stops the click from reaching the stage handlers and plays UI sounds. */
export function Btn({
  game,
  onClick,
  children,
  className = '',
  disabled = false,
  primary = false,
}: {
  game: Game;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`menu-btn ${primary ? 'primary' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      disabled={disabled}
      onMouseEnter={() => !disabled && game.audio.sfxMenu('hover')}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        game.audio.sfxMenu('click');
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/** Types text out character by character; restarts when the text changes. */
export function Typewriter({ text, speed = 28, delay = 0, className = '' }: { text: string; speed?: number; delay?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        i++;
        setN(i);
        if (i >= text.length) window.clearInterval(timer);
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [text, speed, delay]);
  return (
    <span className={`typewriter ${className}`}>
      {text.slice(0, n)}
      {n < text.length && <span className="caret">▌</span>}
    </span>
  );
}

export function Glitch({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`glitch ${className}`} data-text={text}>
      {text}
    </span>
  );
}
