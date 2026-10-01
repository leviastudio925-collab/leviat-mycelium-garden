import { useEffect, useRef, useState } from 'react';
import { createWorld } from './scene';
import { connectOscStart } from './osc-control';
import { loadRuntimeConfig } from './runtime-config';

export function App() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let playing = false;
    let world = null, disposed = false;
    let disconnectOsc = () => {};

    const start = () => {
      if (!world) return;
      world.reset();
      world.play();
      playing = true;
      setProgress(0);
    };
    const keydown = (event) => {
      if (!world) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;
        if (playing) { world.pause(); playing = false; }
        else { world.play(); playing = true; }
      }
      if (event.key.toLowerCase() === 'r' && !event.repeat) start();
    };
    void loadRuntimeConfig().then((runtime) => {
      if (disposed) return;
      world = createWorld(canvasRef.current, setProgress, runtime);
      worldRef.current = world;
      disconnectOsc = connectOscStart(start);
      window.addEventListener('keydown', keydown);
    });
    return () => {
      disposed = true;
      window.removeEventListener('keydown', keydown);
      disconnectOsc();
      world?.dispose();
      worldRef.current = null;
    };
  }, []);

  return (
    <main className="experience">
      <canvas ref={canvasRef} className="world-canvas" aria-label="可用 WASD 引导生长的三维菌丝场景" />
      <div className="vignette" aria-hidden="true" />
      <footer className="timeline-shell">
        <input
          className="timeline"
          type="range" min="0" max="1" step="0.001" value={progress}
          onChange={(event) => {
            const value = Number(event.target.value);
            worldRef.current?.setProgress(value);
            setProgress(value);
          }}
          aria-label="生长进度"
          style={{ '--progress': `${progress * 100}%` }}
        />
      </footer>
    </main>
  );
}
