import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeConfig } from '../src/runtime-config.js';

test('loads validated settings and uploaded model location', async () => {
  const settings = await loadRuntimeConfig(async () => Response.json({
    config: {
      growth: { primaryThickness: 1.6, secondaryThickness: .8, speed: 1.3, density: .7 },
      mushrooms: { size: 1.2 },
    },
    modelUrl: '/api/model',
  }));
  assert.equal(settings.config.growth.primaryThickness, 1.6);
  assert.equal(settings.modelUrl, '/api/model');
});

test('uses bundled model and default settings when API is unavailable', async () => {
  const settings = await loadRuntimeConfig(async () => { throw new Error('offline'); });
  assert.equal(settings.config.growth.primaryThickness, 1);
  assert.equal(settings.modelUrl, '/models/3mushroom.glb');
});
