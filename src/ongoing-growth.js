import * as THREE from 'three';
import { createGuidedGrowth } from './guided-growth.js';

// Continue the network after the timeline reaches 100%, with a small fixed
// geometry budget so an installation can remain open for hours.
export function createOngoingGrowth(scene, barkMaterial, glowTexture, seeds) {
  const initial = seeds.map((seed) => ({
    origin: seed.origin.clone(), direction: seed.direction.clone().normalize(),
    radius: seed.radius, speed: seed.speed,
  }));
  let walkers = [];
  let active = false, paused = false, elapsed = 0, nextFork = 7;

  function makeWalker(seed) {
    const walker = {
      point: seed.origin.clone(), heading: seed.direction.clone(),
      radius: seed.radius, speed: seed.speed, segments: [],
      phase: walkers.length * 2.39996,
    };
    walkers.push(walker);
    addSegment(walker);
    return walker;
  }

  function addSegment(walker) {
    const guide = createGuidedGrowth(scene, barkMaterial, glowTexture, { radius: walker.radius });
    guide.start(walker.point, walker.heading);
    walker.segments.push(guide);
    if (walker.segments.length > 4) walker.segments.shift().dispose();
  }

  function start() {
    if (active) return;
    active = true;
    paused = false;
    for (const seed of initial) makeWalker(seed);
  }

  function advance(dt) {
    if (!active || paused || dt <= 0) return;
    elapsed += dt;
    for (const walker of walkers) {
      const guide = walker.segments.at(-1);
      const phase = elapsed * .72 + walker.phase;
      const drift = new THREE.Vector3(
        Math.sin(phase * .91) + Math.sin(phase * .37) * .5,
        Math.cos(phase * .67) * .72,
        Math.cos(phase * .83) + Math.sin(phase * .43) * .4,
      ).normalize();
      const desired = guide.heading.clone().multiplyScalar(.78).addScaledVector(drift, .22).normalize();
      guide.advance(desired, dt * walker.speed);
      walker.point.copy(guide.point);
      walker.heading.copy(guide.heading);
      if (guide.exhausted) {
        guide.pause();
        addSegment(walker);
      }
    }
    if (elapsed >= nextFork && walkers.length < 8) {
      const parent = walkers[(walkers.length - initial.length) % Math.min(2, initial.length)];
      const direction = parent.heading.clone().add(new THREE.Vector3(
        Math.sin(elapsed * 1.7), Math.cos(elapsed * 1.1), Math.sin(elapsed * .9),
      )).normalize();
      makeWalker({ origin: parent.point, direction, radius: Math.max(.012, parent.radius * .34), speed: parent.speed * .8 });
      nextFork += 7;
    }
  }

  function reset() {
    for (const walker of walkers) for (const segment of walker.segments) segment.dispose();
    walkers = [];
    active = false; paused = false; elapsed = 0; nextFork = 7;
  }

  return {
    get active() { return active; },
    get focusPoint() { return walkers[0]?.point ?? initial[0].origin; },
    get focusHeading() { return walkers[0]?.heading ?? initial[0].direction; },
    start,
    advance,
    pause() { paused = true; for (const walker of walkers) walker.segments.at(-1).pause(); },
    resume() { paused = false; for (const walker of walkers) walker.segments.at(-1).resume(); },
    reset,
    dispose: reset,
  };
}
