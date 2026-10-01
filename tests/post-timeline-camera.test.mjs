import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePostTimelineFollow, centerPull, followEyeOffsets } from '../src/post-timeline-camera.js';

test('after 100% the camera fully follows a moving tip and releases the static center', () => {
  let follow = 0;
  for (let frame = 0; frame < 300; frame++) follow = advancePostTimelineFollow(follow, 1 / 60);
  assert.equal(follow, 1);
  assert.equal(centerPull(1, follow), 0);
  assert.equal(centerPull(.5, 0), .78);
});

test('the following camera swings around the tip without passing through it', () => {
  const start = followEyeOffsets(0), middle = followEyeOffsets(.5), end = followEyeOffsets(1);
  assert.ok(start.along < 0);
  assert.ok(end.along > 0);
  assert.ok(middle.side > start.side && middle.side > end.side);
  assert.ok(Math.hypot(middle.along, middle.side) > 10);
});
