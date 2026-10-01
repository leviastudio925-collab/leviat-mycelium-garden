export const DEFAULT_CONFIG = Object.freeze({
  growth: Object.freeze({ primaryThickness: 1, secondaryThickness: 1, speed: 1, density: 1 }),
  mushrooms: Object.freeze({ size: 1 }),
});

const limits = {
  growth: {
    primaryThickness: [.5, 2],
    secondaryThickness: [.3, 1.5],
    speed: [.25, 3],
    density: [.5, 1.25],
  },
  mushrooms: { size: [.5, 2] },
};

export function validateRuntimeConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a config object');
  for (const key of Object.keys(value)) if (!(key in limits)) throw new Error(`Unknown setting: ${key}`);
  const result = {};
  for (const [group, fields] of Object.entries(limits)) {
    const section = value[group];
    if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error(`Missing or invalid ${group}`);
    for (const key of Object.keys(section)) if (!(key in fields)) throw new Error(`Unknown setting: ${group}.${key}`);
    result[group] = {};
    for (const [key, [min, max]] of Object.entries(fields)) {
      const number = section[key];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
        throw new Error(`${group}.${key} must be between ${min} and ${max}`);
      }
      result[group][key] = number;
    }
  }
  return result;
}
