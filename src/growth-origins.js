import * as THREE from 'three';

// Separated colonies wake a few seconds apart, then grow concurrently.
export function createGrowthPlan(center) {
  const offsets = [
    [-5, -2, 0],
    [6, 3, -5],
    [-9, 6, -12],
    [9, -5, -14],
    [-3, -8, -20],
    [4, 9, -23],
  ];
  const armsPerOrigin = [2, 2, 1, 2, 1, 2];
  const origins = offsets.map(([x, y, z], index) => ({
    position: center.clone().add(new THREE.Vector3(x, y, z)),
    birth: index * .028,
  }));
  const primaryStarts = origins.flatMap((origin, originIndex) => Array.from({ length: armsPerOrigin[originIndex] }, (_, arm) => ({
    position: origin.position.clone(),
    birth: origin.birth + arm * .006,
    originIndex,
    arm,
  })));
  return { origins, primaryStarts };
}

export function originGlow(progress, birth) {
  const elapsed = progress - birth;
  if (elapsed < 0) return { visible: false, opacity: 0, scale: 0 };
  const rise = Math.min(1, elapsed / .025);
  const fade = Math.max(.16, 1 - elapsed / .23);
  return { visible: true, opacity: (.28 + .55 * rise) * fade, scale: .65 + .5 * rise };
}

export function openingViewWeight(progress) {
  const t = Math.max(0, Math.min(1, (progress - .13) / .15));
  return 1 - t * t * (3 - 2 * t);
}
