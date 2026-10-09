import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceFlow } from '../src/experience-flow.js';

function setup() {
  const stages = [], caves = [], growths = [], scheduled = new Map();
  let id = 0;
  const world = () => ({ plays: 0, disposed: false, play() { this.plays++; }, pause() {}, dispose() { this.disposed = true; }, setProgress() {} });
  const flow = createExperienceFlow({
    createCave(callbacks) { const cave = { ...world(), callbacks }; caves.push(cave); return cave; },
    createGrowth() { const growth = world(); growths.push(growth); return growth; },
    onStage: stage => stages.push(stage), onProgress() {},
    schedule(fn) { scheduled.set(++id, fn); return id; }, cancel(handle) { scheduled.delete(handle); },
  });
  return { flow, stages, caves, growths, scheduled };
}

test('the cave and chamber reveal finish before the original growth world starts', () => {
  const { flow, stages, caves, growths, scheduled } = setup();
  assert.equal(flow.stage, 'loading');
  caves[0].callbacks.onReady();
  assert.equal(flow.stage, 'cave');
  assert.equal(growths.length, 0);
  caves[0].callbacks.onArrive();
  assert.equal(flow.stage, 'chamber');
  caves[0].callbacks.onHandoff();
  assert.equal(flow.stage, 'transition');
  assert.equal(growths.length, 0);
  scheduled.values().next().value();
  assert.equal(flow.stage, 'growth');
  assert.equal(caves[0].disposed, true);
  assert.equal(growths[0].plays, 1);
  assert.deepEqual(stages, ['loading', 'cave', 'chamber', 'transition', 'growth']);
});

test('restart cancels an old handoff and begins in the cave; late loading callbacks are ignored', () => {
  const { flow, caves, growths, scheduled } = setup();
  caves[0].callbacks.onHandoff();
  flow.reset();
  assert.equal(scheduled.size, 0);
  assert.equal(flow.stage, 'loading');
  assert.equal(caves[0].disposed, true);
  caves[0].callbacks.onReady();
  assert.equal(flow.stage, 'loading');
  caves[1].callbacks.onReady();
  assert.equal(flow.stage, 'cave');
  assert.equal(growths.length, 0);
});
