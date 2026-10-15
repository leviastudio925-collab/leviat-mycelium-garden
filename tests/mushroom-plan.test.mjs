import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMushroomPlan } from '../src/mushroom-plan.js';

test('mushroom colonies are plentiful with juveniles, large caps and delayed unfolding', () => {
  let state = 289031;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rand = (a, b) => a + random() * (b - a);
  const sites = Array.from({ length: 100 }, (_, i) => ({
    curve: { getPointAt: t => new Vector3(i, 0, -t * 10) }, birth: .18, spread: .15,
  }));
  const plan = createMushroomPlan(sites, rand, random);
  assert.ok(plan.length >= 180 && plan.length <= 300, `${plan.length} mushrooms per 100 eligible branches`);
  assert.ok(plan.filter(item => item.size < .2).length > plan.length * .12, 'many small juveniles');
  assert.ok(plan.filter(item => item.size > .8).length > 12, 'large caps punctuate the colonies');
  assert.ok(Math.max(...plan.map(item => item.size)) > 1.2);
  for (const item of plan) {
    assert.ok(item.birth >= .46, 'mycelium establishes before fruiting');
    assert.ok(item.birth + item.duration <= 1, 'all caps can unfold before the timeline ends');
    assert.ok(Number.isFinite(item.point.x) && item.variant >= 0 && item.variant < 8);
  }
});
