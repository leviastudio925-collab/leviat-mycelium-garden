// Own the handoff, restart and cancellation between two independently rendered worlds.
export function createExperienceFlow({ createCave, createGrowth, onStage, onProgress,
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = handle => clearTimeout(handle) }) {
  let active = null, stage = 'loading', playing = true, generation = 0, timer = null, disposed = false;
  const setStage = value => { stage = value; onStage(value); };
  function begin() {
    generation++; const run = generation;
    if (timer !== null) { cancel(timer); timer = null; }
    active?.dispose(); playing = true; onProgress(0); setStage('loading');
    const current = fn => (...args) => { if (!disposed && run === generation) fn(...args); };
    active = createCave({
      onReady: current(() => setStage('cave')),
      onArrive: current(() => setStage('chamber')),
      onError: current(() => { playing = false; setStage('error'); }),
      onHandoff: current(() => {
        if (stage === 'transition' || stage === 'growth') return;
        setStage('transition'); active.pause();
        timer = schedule(current(() => {
          timer = null; active.dispose(); active = createGrowth();
          playing = true; active.play(); setStage('growth');
        }), 1300);
      }),
    });
  }
  begin();
  return {
    get stage() { return stage; },
    get isPlaying() { return playing; },
    get activeWorld() { return active; },
    play() { if (stage === 'error') { begin(); return; } playing = true; active?.play(); },
    pause() { playing = false; active?.pause(); },
    reset() { if (!disposed) begin(); },
    setProgress(value) { if (stage === 'growth') active?.setProgress(value); },
    dispose() { disposed = true; generation++; if (timer !== null) cancel(timer); active?.dispose(); },
  };
}
