import { createWorld } from './scene';
import { createCaveWorld } from './cave-world';
import { createExperienceFlow } from './experience-flow';

export function createExperience(canvas, onProgress, runtime, onStage, onLockChange) {
  const flow = createExperienceFlow({
    createCave: callbacks => createCaveWorld(canvas, { ...callbacks, onLockChange }),
    createGrowth: () => createWorld(canvas, onProgress, runtime),
    onStage, onProgress,
  });
  return flow;
}
