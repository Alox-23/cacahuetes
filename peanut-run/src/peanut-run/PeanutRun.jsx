import { useEffect, useRef } from 'react';
import { createPeanutRun } from './index.js';
import './peanut-run.css';

/**
 * React wrapper for Peanut Run. Mounts the framework-agnostic game into a div
 * and destroys it on unmount (safe under StrictMode's mount/unmount/mount).
 *
 * @param {{ onGameOver?: (score: number, highScore: number) => void,
 *           onExit?: (score: number) => void,
 *           sound?: boolean,
 *           className?: string }} props
 */
export default function PeanutRun({ onGameOver, onExit, sound = true, className }) {
  const containerRef = useRef(null);
  // Latest callbacks live in a ref so changing them does not recreate the game.
  const callbacksRef = useRef({ onGameOver, onExit });
  useEffect(() => {
    callbacksRef.current = { onGameOver, onExit };
  });

  useEffect(() => {
    const game = createPeanutRun(containerRef.current, {
      sound,
      onGameOver: (score, highScore) => callbacksRef.current.onGameOver?.(score, highScore),
      onExit: (score) => callbacksRef.current.onExit?.(score),
    });
    return () => game.destroy();
  }, [sound]);

  return <div ref={containerRef} className={className} />;
}
