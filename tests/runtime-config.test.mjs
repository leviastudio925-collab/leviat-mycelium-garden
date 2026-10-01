import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG, validateRuntimeConfig } from '../shared/runtime-config.js';

test('accepts the documented growth and mushroom settings', () => {
  const config = {
    growth: { primaryThickness: 1.4, secondaryThickness: .8, speed: 1.25, density: .75 },
    mushrooms: { size: 1.2 },
  };
  assert.deepEqual(validateRuntimeConfig(config), config);
});

test('rejects unsafe or incomplete updates', () => {
  assert.throws(() => validateRuntimeConfig({ growth: DEFAULT_CONFIG.growth }), /mushrooms/);
  assert.throws(() => validateRuntimeConfig({
    ...DEFAULT_CONFIG,
    growth: { ...DEFAULT_CONFIG.growth, primaryThickness: 100 },
  }), /primaryThickness/);
  assert.throws(() => validateRuntimeConfig({ ...DEFAULT_CONFIG, injected: true }), /injected/);
});
