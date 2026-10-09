import { useEffect, useRef, useState } from 'react';
import { createExperience } from './experience';
import { connectOscStart } from './osc-control';
import { loadRuntimeConfig } from './runtime-config';

export function App() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('loading');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let world = null, disposed = false;
    let disconnectOsc = () => {};

    const start = () => {
      if (!world) return;
      world.reset();
      setProgress(0);
    };
    const keydown = (event) => {
      if (!world) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;
        if (world.stage === 'transition' || world.stage === 'loading') return;
        if (world.isPlaying) world.pause();
        else world.play();
      }
      if (event.key.toLowerCase() === 'r' && !event.repeat) start();
    };
    void loadRuntimeConfig().then((runtime) => {
      if (disposed) return;
      world = createExperience(canvasRef.current, setProgress, runtime, setStage, setLocked);
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
    <main className="experience" data-stage={stage}>
      <canvas ref={canvasRef} className="world-canvas" aria-label={stage === 'growth'
        ? '可用 WASD 引导生长的三维菌丝场景' : '地下洞窟：WASD 行走，点击画面后用鼠标控制视角'} />
      <div className="vignette" aria-hidden="true" />
      <div className={`phase-veil ${['loading', 'transition', 'error'].includes(stage) ? 'is-dark' : ''}`} aria-hidden="true" />
      {stage === 'loading' && <p className="cave-hint" role="status">正在进入地下洞窟</p>}
      {stage === 'cave' && !locked && <p className="cave-hint">点击画面 · WASD 行走 · 鼠标控制视角</p>}
      {stage === 'error' && <button className="cave-hint cave-retry" onClick={() => worldRef.current?.reset()}>洞窟未能载入，点击重试</button>}
      {stage === 'growth' && <footer className="timeline-shell">
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
      </footer>}
    </main>
  );
}
