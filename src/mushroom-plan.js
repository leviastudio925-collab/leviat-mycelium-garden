import { Color, Vector3 } from 'three';

const capColors = ['#ff5123', '#ff6926', '#ff7c32', '#e9441d', '#ff8b3c', '#f75c26'];

// Deterministic colonies share the supplied cap model, with broad size variation.
export function createMushroomPlan(sites, rand, random, sizeMultiplier = 1) {
  const clusters = [];
  const selected = sites.filter((_, i) => i % 4 === 0 || (i % 5 === 0 && random() > .6));
  for (const site of selected) {
    const t = rand(.18, .94), center = site.curve.getPointAt(t);
    const count = Math.floor(rand(4, 11));
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2), spread = Math.pow(random(), .8) * rand(.35, 2.25);
      const scale = i === 0 ? rand(.8, 1.45) : i === 1 ? rand(.35, .8) : Math.pow(random(), 2) * .9 + .055;
      clusters.push({
        point: center.clone().add(new Vector3(Math.cos(angle) * spread, rand(-.16, .16), Math.sin(angle) * spread)),
        birth: Math.min(.9, Math.max(site.birth + site.spread * t * .7 + .02, .46 + random() * .36)),
        duration: rand(.045, .1),
        size: scale * rand(.58, 1.13) * sizeMultiplier,
        height: rand(.35, 1.5),
        variant: Math.floor(random() * 8),
        tiltX: rand(-.22, .22), tiltZ: rand(-.22, .22), rotation: rand(0, Math.PI * 2),
        color: new Color(capColors[Math.floor(random() * capColors.length)]),
      });
    }
  }
  return clusters;
}
