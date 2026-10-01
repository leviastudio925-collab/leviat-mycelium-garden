import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGrowthPlan, originGlow, openingViewWeight } from '../src/growth-origins.js';

test('several separated origins awaken in sequence while their primary branches grow together', () => {
  const center = new THREE.Vector3(0, 0, -6);
  const { origins, primaryStarts } = createGrowthPlan(center);

  assert.equal(origins.length, 6);
  assert.equal(primaryStarts.length, 10);
  assert.ok(origins.every((origin, index) => index === 0 || origin.birth > origins[index - 1].birth));
  assert.ok(origins.at(-1).birth - origins[0].birth < .17);
  for (let i = 0; i < origins.length; i++) {
    assert.ok([1, 2].includes(primaryStarts.filter((start) => start.originIndex === i).length));
    for (let j = i + 1; j < origins.length; j++) {
      assert.ok(origins[i].position.distanceTo(origins[j].position) > 10);
    }
  }
  assert.ok(origins.some((origin) => origin.position.y > center.y));
  assert.ok(origins.some((origin) => origin.position.y < center.y));
  assert.ok(origins.some((origin) => origin.position.z < center.z));
  assert.ok(primaryStarts.every((start) => start.position.equals(origins[start.originIndex].position)));
});

test('the camera begins wide enough to show separated origins before following a branch', () => {
  assert.equal(openingViewWeight(0), 1);
  assert.equal(openingViewWeight(.12), 1);
  assert.ok(openingViewWeight(.20) > 0 && openingViewWeight(.20) < 1);
  assert.equal(openingViewWeight(.3), 0);
});

test('each origin lights up at its own start and softens after the network grows', () => {
  const birth = .04;
  assert.equal(originGlow(.03, birth).visible, false);
  assert.equal(originGlow(.04, birth).visible, true);
  assert.ok(originGlow(.07, birth).opacity > originGlow(.04, birth).opacity);
  assert.ok(originGlow(.30, birth).opacity < originGlow(.07, birth).opacity);
});
