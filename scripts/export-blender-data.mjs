import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createGrowthPlan } from '../src/growth-origins.js';
import { DEFAULT_CONFIG } from '../shared/runtime-config.js';
import { centerPull, followEyeOffsets } from '../src/post-timeline-camera.js';

// Snapshot the deterministic installation for editing and rendering in Blender.
// The browser continues to generate geometry at runtime; this export has a finite
// 30-second continuation after its 54-second timeline reaches 100%.
const out = process.argv[2] ?? path.resolve('exports/mycelium-scene.json');
const fps = 30, timelineSeconds = 54, continuationSeconds = 30;
const settings = DEFAULT_CONFIG.growth;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
function random(seed) { let a = seed; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = random(184721), rand = (a, b) => a + (b - a) * R();
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xyz = p => [Number(p.x.toFixed(5)), Number(p.y.toFixed(5)), Number(p.z.toFixed(5))];
const root = v(0, 0, -6), { origins, primaryStarts } = createGrowthPlan(root);
const colonyCenter = origins.reduce((center, origin) => center.add(origin.position), v(0, 0, 0)).multiplyScalar(1 / origins.length);
const branches = [], companions = [], primaries = [], blossomSites = [], filaments = [];

function pathCurve(start, direction, length, bends = 5) {
  const points = [start.clone()], heading = direction.clone().normalize();
  const sideways = v(0, 1, 0).cross(heading).normalize();
  if (sideways.lengthSq() < .01) sideways.set(1, 0, 0);
  const other = heading.clone().cross(sideways).normalize();
  const frequencyA = rand(4, 8), frequencyB = rand(5, 9), phaseA = rand(0, Math.PI * 2), phaseB = rand(0, Math.PI * 2);
  const amplitudeA = length * rand(.065, .14), amplitudeB = length * rand(.04, .105);
  for (let i = 1; i <= bends; i++) {
    const t = i / bends;
    points.push(start.clone().addScaledVector(heading, length * t)
      .addScaledVector(sideways, (Math.sin(t * frequencyA + phaseA) - Math.sin(phaseA)) * amplitudeA)
      .addScaledVector(other, (Math.sin(t * frequencyB + phaseB) - Math.sin(phaseB)) * amplitudeB));
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

function addBranch(curve, radius, birth, duration, depth, attach = 0) {
  const branch = { curve, radius, birth, duration, depth, attach, children: [] };
  branches.push(branch);
  if (depth === 0 && radius > .04) {
    const phase = rand(0, Math.PI * 2);
    const points = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, point = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
      const side = v(0, 1, 0).cross(tangent).normalize();
      if (side.lengthSq() < .01) side.set(1, 0, 0);
      const other = tangent.clone().cross(side).normalize();
      const offset = .14 * Math.min(1, t * 9);
      point.addScaledVector(side, Math.sin(t * 25 + phase) * offset);
      point.addScaledVector(other, Math.cos(t * 25 + phase) * offset);
      points.push(point);
    }
    const companionCurve = new THREE.CatmullRomCurve3(points);
    companions.push({ name: `Companion_${String(companions.length).padStart(2, '0')}`,
      points: Array.from({ length: 65 }, (_, j) => xyz(companionCurve.getPointAt(j / 64))),
      birth, duration, radius: radius * .27 });
  }
  if (depth >= 2 && depth < 4) blossomSites.push({ curve, birth, spread: duration, depth });
  return branch;
}

function fork(parent, count) {
  for (let j = 0; j < count; j++) {
    const attach = clamp((j + .55 + rand(-.21, .21)) / count, .18, .91);
    const start = parent.curve.getPointAt(attach), tangent = parent.curve.getTangentAt(attach).normalize();
    const azimuth = rand(0, Math.PI * 2);
    const side = v(Math.cos(azimuth), Math.sin(azimuth) * .38, rand(-1, 1)).projectOnPlane(tangent).normalize();
    const direction = side.multiplyScalar(rand(.65, 1.25)).addScaledVector(tangent, rand(-.15, .48)).normalize();
    const length = parent.depth === 0 ? rand(12, 23) : parent.depth === 1 ? rand(6, 12) : rand(3, 7);
    const curve = pathCurve(start, direction, length, parent.depth === 0 ? 5 : 4);
    const birth = parent.birth + parent.duration * attach * rand(.76, .94);
    const duration = parent.depth === 0 ? rand(.15, .24) : parent.depth === 1 ? rand(.10, .16) : rand(.06, .11);
    const radius = parent.radius * (parent.depth === 0 ? rand(.28, .46) * settings.secondaryThickness : rand(.26, .55));
    const child = addBranch(curve, radius, birth, duration, parent.depth + 1, attach);
    parent.children.push(child);
    if (child.depth < 3) fork(child, Math.round(2 * settings.density));
    if (child.depth >= 2) {
      for (let n = 0; n < 2; n++) {
        const f = rand(.22, .95), origin = curve.getPointAt(f), direction = v(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        const tip = origin.clone().addScaledVector(direction, rand(2.3, 6.5));
        const filament = new THREE.CatmullRomCurve3([origin, origin.clone().lerp(tip, .5).add(v(rand(-.8, .8), rand(-.8, .8), rand(-.8, .8))), tip]);
        filaments.push({ points: Array.from({ length: 9 }, (_, k) => xyz(filament.getPointAt(k / 8))), birth: birth + duration * f, radius: .0025 });
      }
    }
  }
}

for (let i = 0; i < primaryStarts.length; i++) {
  const start = primaryStarts[i], y = 1 - 2 * (i + .5) / primaryStarts.length, angle = i * 2.39996;
  const direction = i === 0 ? v(.12, .04, -1) : v(Math.cos(angle) * Math.sqrt(1 - y * y), y * .25, Math.sin(angle) * Math.sqrt(1 - y * y));
  if (i > 1 && start.arm === 0) direction.lerp(colonyCenter.clone().sub(start.position).normalize(), .44).normalize();
  const radius = rand(.085, .13) * settings.primaryThickness;
  const primary = addBranch(pathCurve(start.position, direction, rand(27, 39), 10), radius, start.birth, rand(.25, .35), 0);
  primaries.push(primary); fork(primary, Math.round(3 * settings.density));
}

function addCoreShoot(parent, attach, length, radius) {
  const start = parent.curve.getPointAt(attach), tangent = parent.curve.getTangentAt(attach).normalize();
  const sideways = v(rand(-1, 1), rand(-1, 1), rand(-1, 1)).projectOnPlane(tangent).normalize();
  const direction = sideways.multiplyScalar(rand(.7, 1.3)).addScaledVector(tangent, rand(-.35, .5)).normalize();
  const curve = pathCurve(start, direction, length, 4);
  const birth = parent.birth + parent.duration * attach * rand(.65, .9);
  const duration = rand(.09, .2);
  branches.push({ curve, radius, birth, duration, depth: 4, children: [] });
}
for (const primary of primaries) {
  for (let i = 0; i < 6; i++) addCoreShoot(primary, rand(.035, .29), rand(2.2, 8.5), rand(.003, .025));
  for (const child of primary.children) addCoreShoot(child, rand(.06, .34), rand(1.8, 5.8), rand(.002, .018));
}

const capColors = ['#ff5123', '#ff6926', '#ff7c32', '#e9441d', '#ff8b3c', '#f75c26'];
const mushrooms = [];
const selected = blossomSites.filter((_, i) => i % 6 === 0 || (i % 5 === 0 && R() > .48));
for (const site of selected) {
  const t = rand(.18, .94), center = site.curve.getPointAt(t), count = Math.floor(rand(3, 9));
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2), spread = Math.pow(R(), .8) * rand(.35, 2.25);
    const scale = i === 0 ? rand(.55, .93) : Math.pow(R(), 1.8) * .64 + .09;
    mushrooms.push({
      point: xyz(center.clone().add(v(Math.cos(angle) * spread, rand(-.16, .16), Math.sin(angle) * spread))),
      birth: Math.min(.93, Math.max(site.birth + site.spread * t * .7 + .02, .61 + R() * .29)),
      duration: rand(.045, .11), size: scale * rand(.58, 1.13) * DEFAULT_CONFIG.mushrooms.size,
      height: rand(.35, 1.5), variant: Math.floor(R() * 8),
      tiltX: rand(-.22, .22), tiltZ: rand(-.22, .22), rotation: rand(0, Math.PI * 2),
      color: capColors[Math.floor(R() * capColors.length)],
    });
  }
}

const journey = [], first = primaries[0];
let current = first, from = 0, at = first.birth;
for (let depth = 0; depth < 4; depth++) {
  const options = current.children.filter(c => c.attach > from + .08);
  const next = depth < 3 && options.length ? options[Math.floor(R() * options.length)] : null;
  const to = next ? next.attach : 1;
  const until = current.birth + current.duration * to;
  journey.push({ branch: current, from, to, at, until });
  if (!next) break;
  current = next; from = 0; at = Math.max(until, next.birth);
}
function routePoint(p) {
  let step = journey.at(-1), t = step.to;
  for (const part of journey) if (p <= part.until) { step = part; t = THREE.MathUtils.lerp(part.from, part.to, smooth((p - part.at) / Math.max(.001, part.until - part.at))); break; }
  return { point: step.branch.curve.getPointAt(t), tangent: step.branch.curve.getTangentAt(t).normalize() };
}

const ongoingSeeds = [
  { branch: primaries[0], radius: .082, speed: 3.1 },
  { branch: primaries[3], radius: .072, speed: 2.7 },
  ...[primaries[1].children[0], primaries[4].children[1], primaries[6].children[0]].map((branch, i) => ({ branch, radius: [.034, .029, .025][i], speed: [2.3, 2.1, 1.9][i] })),
];
const walkers = ongoingSeeds.map((seed, i) => ({
  point: seed.branch.curve.getPointAt(1), heading: seed.branch.curve.getTangentAt(1).normalize(),
  radius: seed.radius, speed: seed.speed, phase: i * 2.39996, birth: 1, points: [],
}));
walkers.forEach(walker => walker.points.push(xyz(walker.point)));
let nextFork = 7;
const ongoingFrames = continuationSeconds * fps;
const focusFrames = [];
for (let frame = 0; frame <= ongoingFrames; frame++) {
  const elapsed = frame / fps;
  if (frame > 0) {
    for (const walker of walkers) {
      const phase = elapsed * .72 + walker.phase;
      const drift = v(Math.sin(phase * .91) + Math.sin(phase * .37) * .5, Math.cos(phase * .67) * .72,
        Math.cos(phase * .83) + Math.sin(phase * .43) * .4).normalize();
      const desired = walker.heading.clone().multiplyScalar(.78).addScaledVector(drift, .22).normalize();
      const distance = walker.point.distanceTo(colonyCenter);
      const inwardWeight = clamp((distance - 36 * .55) / (36 * .4));
      if (inwardWeight > 0) desired.lerp(colonyCenter.clone().sub(walker.point).normalize(), inwardWeight * .9).normalize();
      const step = walker.speed / fps;
      walker.heading.lerp(desired, Math.min(1, step * .38)).normalize();
      walker.point.addScaledVector(walker.heading, step);
      if (frame % 3 === 0) walker.points.push(xyz(walker.point));
    }
    if (elapsed >= nextFork && walkers.length < 8) {
      const parent = walkers[(walkers.length - ongoingSeeds.length) % Math.min(2, ongoingSeeds.length)];
      const direction = parent.heading.clone().add(v(Math.sin(elapsed * 1.7), Math.cos(elapsed * 1.1), Math.sin(elapsed * .9))).normalize();
      const walker = { point: parent.point.clone(), heading: direction, radius: Math.max(.012, parent.radius * .34), speed: parent.speed * .8,
        phase: walkers.length * 2.39996, birth: 1 + elapsed / timelineSeconds, points: [xyz(parent.point)] };
      walkers.push(walker); nextFork += 7;
    }
  }
  focusFrames.push({ point: walkers[0].point.clone(), heading: walkers[0].heading.clone() });
}

const overviewEye = colonyCenter.clone().add(v(-10, 9, 36));
const cameraFrames = [];
let eyeActual = v(1, 1, 0), targetActual = v(0, 0, -6), follow = 0;
for (let frame = 1; frame <= (timelineSeconds + continuationSeconds) * fps + 1; frame += 3) {
  const time = (frame - 1) / fps, progress = clamp(time / timelineSeconds);
  if (time >= timelineSeconds) follow = clamp((time - timelineSeconds) * .24);
  const route = routePoint(progress);
  if (progress >= 1) {
    const focus = focusFrames[Math.min(focusFrames.length - 1, Math.round((time - timelineSeconds) * fps))];
    route.point.lerp(focus.point, follow);
    route.tangent.lerp(focus.heading, follow * .75).normalize();
  }
  const forward = route.tangent, point = route.point;
  const side = v(0, 1, 0).cross(forward).normalize();
  if (side.lengthSq() < .001) side.set(1, 0, 0);
  const drift = Math.sin(progress * 31) * .52 + Math.sin(progress * 57) * .23;
  const proximity = 1 - .27 * smooth((progress - .14) / .14) * (1 - smooth((progress - .38) / .25));
  const offsets = followEyeOffsets(follow);
  const eye = point.clone().addScaledVector(forward, offsets.along * proximity)
    .addScaledVector(side, (offsets.side + drift) * proximity).add(v(0, 3.6 * proximity, 0));
  const target = point.clone().addScaledVector(forward, 3.4 - 7 * follow).addScaledVector(side, drift * .45);
  target.lerp(colonyCenter, centerPull(progress, follow));
  // Keep the established colony in frame beside the growing tip in the baked
  // camera pass; Blender has a fixed shot while the browser can be steered live.
  if (progress >= 1) target.lerp(colonyCenter, .72 * follow);
  const opening = 1 - smooth((progress - .13) / .15);
  eye.lerp(overviewEye, opening); target.lerp(colonyCenter, opening);
  const alpha = frame === 1 ? 1 : 1 - Math.exp(-.1 * 3.5);
  eyeActual.lerp(eye, alpha); targetActual.lerp(target, alpha);
  cameraFrames.push({ frame, eye: xyz(eyeActual), target: xyz(targetActual) });
}

const samplesForDepth = [72, 38, 22, 12, 18];
const data = {
  version: 1, fps, timelineSeconds, continuationSeconds,
  center: xyz(colonyCenter),
  origins: origins.map(origin => ({ point: xyz(origin.position), birth: origin.birth })),
  branches: branches.map((branch, i) => ({
    name: `Hypha_${String(i).padStart(4, '0')}`, depth: branch.depth,
    radius: Number(branch.radius.toFixed(6)), birth: branch.birth, duration: branch.duration,
    points: Array.from({ length: samplesForDepth[branch.depth] + 1 }, (_, j) => xyz(branch.curve.getPointAt(j / samplesForDepth[branch.depth]))),
  })),
  companions, filaments, mushrooms,
  ongoing: walkers.map((walker, i) => ({ name: `Continuing_${String(i).padStart(2, '0')}`, radius: walker.radius, birth: walker.birth,
    duration: continuationSeconds / timelineSeconds - (walker.birth - 1), points: walker.points })),
  cameraFrames,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data));
console.log(`Exported ${data.branches.length} curves, ${companions.length} companion fibers, ${filaments.length} filaments, ${mushrooms.length} mushrooms, ${walkers.length} continuing tips to ${out}`);
