import * as THREE from 'three';

// Four nearby colonies wake a few seconds apart, then grow concurrently.
export function createGrowthPlan(center) {
  const offsets = [
    [-2, -1, 0],
    [5, 2, -5],
    [-6, 3, -7],
    [2, -5, -10],
  ];
  const origins = offsets.map(([x, y, z], index) => ({
    position: center.clone().add(new THREE.Vector3(x, y, z)),
    birth: index * .035,
  }));
  const primaryStarts = origins.flatMap((origin, originIndex) => [0, 1].map((arm) => ({
    position: origin.position.clone(),
    birth: origin.birth + arm * .006,
    originIndex,
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
