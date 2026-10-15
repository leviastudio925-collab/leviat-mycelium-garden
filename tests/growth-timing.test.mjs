import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTimeline, growthPhase } from '../src/growth-timing.js';

test('the growth timeline lasts 120 playing seconds and stays at 100 percent', () => {
  let timeline = 0;
  for (let i = 0; i < 1190; i++) timeline = advanceTimeline(timeline, .1);
  assert.ok(timeline < 1 && timeline > .99);
  for (let i = 0; i < 11; i++) timeline = advanceTimeline(timeline, .1);
  assert.equal(timeline, 1);
  assert.equal(advanceTimeline(timeline, 30), 1);
  assert.equal(advanceTimeline(.4, 0), .4);
  assert.ok(Math.abs(advanceTimeline(0, 60, 2) - 1) < 1e-10);
});

test('growth is continuous, begins gently and accelerates through the two minute timeline', () => {
  assert.equal(growthPhase(0), 0);
  assert.equal(growthPhase(1), 1);
  assert.ok(growthPhase(.25) > .05 && growthPhase(.25) < .15);
  const quarters = Array.from({ length: 4 }, (_, i) => growthPhase((i + 1) / 4) - growthPhase(i / 4));
  for (let i = 1; i < quarters.length; i++) assert.ok(quarters[i] > quarters[i - 1]);
  assert.ok(quarters[3] > quarters[0] * 2);
});
