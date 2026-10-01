import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMushroomSystem } from './mushrooms';
import { createGuidedGrowth } from './guided-growth';
import { createOngoingGrowth } from './ongoing-growth';
import { createGrowthPlan, originGlow, openingViewWeight } from './growth-origins';
import { DEFAULT_CONFIG } from '../shared/runtime-config';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
function random(seed) { let a = seed; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.08, 'rgba(255,255,255,.92)');
  gradient.addColorStop(.24, 'rgba(255,255,255,.42)');
  gradient.addColorStop(.58, 'rgba(255,255,255,.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function fiberTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d'), noise = random(13884);
  context.fillStyle = '#d4d2cd'; context.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 2700; i++) {
    const y = noise() * 128, x = noise() * 512;
    context.strokeStyle = noise() > .5 ? `rgba(255,255,255,${.06 + noise() * .25})` : `rgba(32,43,36,${.06 + noise() * .24})`;
    context.lineWidth = .35 + noise() * 1.2;
    context.beginPath(); context.moveTo(x, y);
    context.bezierCurveTo(x + 20, y + (noise() - .5) * 2, x + 50, y + (noise() - .5) * 3, x + 60 + noise() * 130, y + (noise() - .5) * 5);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function taper(geometry, curve, segments, radial, endScale) {
  const position = geometry.attributes.position;
  const point = new THREE.Vector3(), center = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    center.copy(curve.getPointAt(t));
    const contour = 1 + .045 * Math.sin(t * 23) + .022 * Math.sin(t * 59 + .8);
    const scale = (1 - Math.pow(t, 1.5) * (1 - endScale)) * Math.min(1, .58 + t * 5) * contour;
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      point.fromBufferAttribute(position, n).sub(center).multiplyScalar(scale).add(center);
      position.setXYZ(n, point.x, point.y, point.z);
    }
  }
  position.needsUpdate = true; geometry.computeVertexNormals();
  return geometry;
}

// Interpolate the exposed end ring: the tip moves every frame, even between tube segments.
function revealTube(state, amount) {
  const { geometry, original, segments, radial } = state;
  const position = geometry.attributes.position;
  const array = position.array, ring = (radial + 1) * 3;
  if (state.lastRing >= 0) {
    const offset = state.lastRing * ring;
    array.set(original.subarray(offset, offset + ring), offset);
    state.lastRing = -1;
  }
  if (amount <= 0) { geometry.setDrawRange(0, 0); return; }
  if (amount >= 1) { geometry.setDrawRange(0, segments * radial * 6); position.needsUpdate = true; return; }
  const along = amount * segments, segment = Math.floor(along), fraction = along - segment;
  const tipRing = segment + 1, offset = tipRing * ring, previous = segment * ring;
  for (let k = 0; k < ring; k++) array[offset + k] = original[previous + k] + (original[offset + k] - original[previous + k]) * fraction;
  state.lastRing = tipRing;
  geometry.setDrawRange(0, (segment + 1) * radial * 6);
  position.needsUpdate = true;
}

export function createWorld(canvas, onProgress, runtime = { config: DEFAULT_CONFIG, modelUrl: '/models/3mushroom.glb' }) {
  const R = random(184721), rand = (a, b) => a + (b - a) * R();
  const growthSettings = runtime.config.growth;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.16;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#020303'); scene.fog = new THREE.FogExp2('#050606', .007);
  const camera = new THREE.PerspectiveCamera(66, 1, .5, 210);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .63, .48, .78));
  composer.addPass(new OutputPass());
  scene.add(new THREE.AmbientLight('#ced1ca', .58));
  const warm = new THREE.PointLight('#fff2dc', 11, 31, 2), cool = new THREE.PointLight('#9daec4', 7, 27, 2), pink = new THREE.PointLight('#d73c21', 5, 26, 2);
  scene.add(warm, cool, pink);
  const root = v(0, 0, -6), { origins, primaryStarts } = createGrowthPlan(root);
  const colonyCenter = origins.reduce((center, origin) => center.add(origin.position), v(0, 0, 0)).multiplyScalar(1 / origins.length);
  const overviewEye = colonyCenter.clone().add(v(-10, 9, 36));
  const branches = [], primaries = [], blossomSites = [], filamentSegments = [];
  const bloomMap = glowTexture(), barkMap = fiberTexture();
  const bark = new THREE.MeshStandardMaterial({ color: '#d9dad3', map: barkMap, bumpMap: barkMap, bumpScale: .034, emissive: '#b6c3b8', emissiveIntensity: .29, roughness: .83 });
  const fineBark = new THREE.MeshStandardMaterial({ color: '#e4e6dc', map: barkMap, bumpMap: barkMap, bumpScale: .021, emissive: '#cbd4ca', emissiveIntensity: .26, roughness: .8 });
  const threadMat = new THREE.MeshStandardMaterial({ color: '#f2f3e9', map: barkMap, bumpMap: barkMap, bumpScale: .009, emissive: '#bbc9bd', emissiveIntensity: .35, roughness: .75 });
  const haloMat = new THREE.MeshBasicMaterial({ color: '#e5efe4', transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const innerMat = new THREE.MeshBasicMaterial({ color: '#efffef', transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending });
  const violetFiber = new THREE.MeshStandardMaterial({ color: '#aab5ad', emissive: '#8c9e95', emissiveIntensity: .28, roughness: .71, transparent: true, opacity: .78 });
  const tipMat = new THREE.SpriteMaterial({ map: bloomMap, color: '#e1ffe8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  function path(start, direction, length, bends = 5) {
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

  function tube(curve, radius, segments, radial, endScale, material) {
    const geometry = taper(new THREE.TubeGeometry(curve, segments, radius, radial, false), curve, segments, radial, endScale);
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
    return { geometry, original: geometry.attributes.position.array.slice(), segments, radial, lastRing: -1 };
  }

  function companionPath(curve, separation, phase) {
    const points = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, point = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
      const side = v(0, 1, 0).cross(tangent).normalize();
      if (side.lengthSq() < .01) side.set(1, 0, 0);
      const other = tangent.clone().cross(side).normalize();
      const offset = separation * Math.min(1, t * 9);
      point.addScaledVector(side, Math.sin(t * 25 + phase) * offset);
      point.addScaledVector(other, Math.cos(t * 25 + phase) * offset);
      points.push(point);
    }
    return new THREE.CatmullRomCurve3(points);
  }

  function addBranch(curve, radius, birth, duration, depth, attach = 0) {
    const segments = depth === 0 ? 110 : depth === 1 ? 64 : depth === 2 ? 36 : 20;
    const radial = depth < 2 ? 7 : 5, endScale = depth === 0 ? .17 : .035;
    const body = tube(curve, radius, segments, radial, endScale, depth < 2 ? bark : depth === 2 ? fineBark : threadMat);
    const halo = null;
    const inner = depth === 0 && radius > .04 ? tube(curve, radius * .16, segments, 5, endScale, innerMat) : null;
    const companion = depth === 0 && radius > .04 ? tube(companionPath(curve, .14, rand(0, Math.PI * 2)), radius * .27, segments, 5, .06, violetFiber) : null;
    const tip = depth < 2 ? new THREE.Sprite(tipMat) : null;
    if (tip) { tip.visible = false; scene.add(tip); }
    const branch = { curve, radius, birth, duration, depth, attach, body, halo, inner, companion, tip, children: [] };
    branches.push(branch);
    if (depth >= 2) blossomSites.push({ curve, birth, spread: duration, depth, count: depth === 2 ? 3 : 2 });
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
      const curve = path(start, direction, length, parent.depth === 0 ? 5 : 4);
      const birth = parent.birth + parent.duration * attach * rand(.76, .94);
      const duration = parent.depth === 0 ? rand(.15, .24) : parent.depth === 1 ? rand(.10, .16) : rand(.06, .11);
      const radius = parent.radius * (parent.depth === 0 ? rand(.28, .46) * growthSettings.secondaryThickness : rand(.26, .55));
      const child = addBranch(curve, radius, birth, duration, parent.depth + 1, attach);
      parent.children.push(child);
      if (child.depth < 3) fork(child, Math.round(2 * growthSettings.density));
      if (child.depth >= 2) {
        for (let n = 0; n < 2; n++) {
          const f = rand(.22, .95), origin = curve.getPointAt(f), direction = v(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
          const tip = origin.clone().addScaledVector(direction, rand(2.3, 6.5));
          const filament = new THREE.CatmullRomCurve3([origin, origin.clone().lerp(tip, .5).add(v(rand(-.8, .8), rand(-.8, .8), rand(-.8, .8))), tip]);
          for (let k = 0; k < 8; k++) filamentSegments.push({ a: filament.getPointAt(k / 8), b: filament.getPointAt((k + 1) / 8), birth: birth + duration * f + k * .0025 });
        }
      }
    }
  }

  // Two broad paths leave each colony; some turn inward and weave through the others.
  for (let i = 0; i < primaryStarts.length; i++) {
    const start = primaryStarts[i], y = 1 - 2 * (i + .5) / primaryStarts.length, angle = i * 2.39996;
    const direction = i === 0 ? v(.12, .04, -1) : v(Math.cos(angle) * Math.sqrt(1 - y * y), y * .25, Math.sin(angle) * Math.sqrt(1 - y * y));
    if (i > 1 && start.arm === 0) direction.lerp(colonyCenter.clone().sub(start.position).normalize(), .44).normalize();
    const radius = rand(.085, .13) * growthSettings.primaryThickness;
    const primary = addBranch(path(start.position, direction, rand(27, 39), 10), radius, start.birth, rand(.25, .35), 0);
    primaries.push(primary); fork(primary, Math.round(3 * growthSettings.density));
  }
  // Short, unevenly sized hyphae fill the space near the seed and early forks.
  function addCoreShoot(parent, attach, length, radius) {
    const start = parent.curve.getPointAt(attach), tangent = parent.curve.getTangentAt(attach).normalize();
    const sideways = v(rand(-1, 1), rand(-1, 1), rand(-1, 1)).projectOnPlane(tangent).normalize();
    const direction = sideways.multiplyScalar(rand(.7, 1.3)).addScaledVector(tangent, rand(-.35, .5)).normalize();
    const curve = path(start, direction, length, 4);
    const birth = parent.birth + parent.duration * attach * rand(.65, .9);
    const duration = rand(.09, .2);
    const body = tube(curve, radius, 26, 5, .025, radius > .018 ? fineBark : threadMat);
    branches.push({ curve, radius, birth, duration, depth: 4, body, halo: null, inner: null, companion: null, tip: null, children: [] });
  }
  for (const primary of primaries) {
    for (let i = 0; i < 6; i++) addCoreShoot(primary, rand(.035, .29), rand(2.2, 8.5), rand(.003, .025));
    for (const child of primary.children) {
      addCoreShoot(child, rand(.06, .34), rand(1.8, 5.8), rand(.002, .018));
    }
  }
  filamentSegments.sort((a, b) => a.birth - b.birth);
  const filamentPositions = new Float32Array(filamentSegments.length * 6);
  filamentSegments.forEach((s, i) => filamentPositions.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6));
  const filamentGeometry = new THREE.BufferGeometry(); filamentGeometry.setAttribute('position', new THREE.BufferAttribute(filamentPositions, 3));
  const filamentMaterial = new THREE.LineBasicMaterial({ color: '#dfe9dc', transparent: true, opacity: .68, depthWrite: false });
  scene.add(new THREE.LineSegments(filamentGeometry, filamentMaterial));
  const mushroomSystem = createMushroomSystem(scene, blossomSites, rand, R, runtime.modelUrl, runtime.config.mushrooms.size);

  // A seeded, connected route turns at three forks. The network continues growing around it.
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
  const routePoint = (p) => {
    let step = journey[journey.length - 1], t = step.to;
    for (const part of journey) {
      if (p <= part.until) { step = part; t = THREE.MathUtils.lerp(part.from, part.to, smooth((p - part.at) / Math.max(.001, part.until - part.at))); break; }
    }
    return { point: step.branch.curve.getPointAt(t), tangent: step.branch.curve.getTangentAt(t).normalize() };
  };
  const guide = createGuidedGrowth(scene, bark, bloomMap);
  const ongoing = createOngoingGrowth(scene, bark, bloomMap, [
    { origin: primaries[0].curve.getPointAt(1), direction: primaries[0].curve.getTangentAt(1), radius: .082 * growthSettings.primaryThickness, speed: 3.1 * growthSettings.speed },
    { origin: primaries[3].curve.getPointAt(1), direction: primaries[3].curve.getTangentAt(1), radius: .072 * growthSettings.primaryThickness, speed: 2.7 * growthSettings.speed },
    ...[primaries[1].children[0], primaries[4].children[1], primaries[6].children[0]].map((branch, index) => ({
      origin: branch.curve.getPointAt(1), direction: branch.curve.getTangentAt(1),
      radius: [.034, .029, .025][index] * growthSettings.secondaryThickness, speed: [2.3, 2.1, 1.9][index] * growthSettings.speed,
    })),
  ]);

  const dustCount = 960, dustPositions = new Float32Array(dustCount * 3), dustColors = new Float32Array(dustCount * 3);
  const dustPalette = ['#d0dac9', '#788d83', '#a7aeb2', '#f68253'];
  for (let i = 0; i < dustCount; i++) {
    const branch = branches[Math.floor(R() * branches.length)], center = branch.curve.getPointAt(R());
    const offset = v(rand(-7, 7), rand(-7, 7), rand(-7, 7));
    dustPositions.set([center.x + offset.x, center.y + offset.y, center.z + offset.z], i * 3);
    const c = new THREE.Color(dustPalette[Math.floor(R() * dustPalette.length)]); dustColors.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: .16, map: bloomMap, vertexColors: true, transparent: true, opacity: .51, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  scene.add(dust);
  const seedCoreMaterial = new THREE.MeshBasicMaterial({ color: '#edf7e9' });
  const seedEntries = origins.map((origin) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: bloomMap, color: '#eaffed', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(origin.position); scene.add(glow);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.09, 2), seedCoreMaterial);
    core.position.copy(origin.position); scene.add(core);
    return { birth: origin.birth, glow, core };
  });

  let progress = 0, playing = false, activated = false, speed = growthSettings.speed, last = performance.now(), frameId = 0, lastUI = 0;
  let ongoingFollow = 0;
  let lastGeometryProgress = NaN;
  let yaw = 0, pitch = 0, distance = 1, dragging = false, pointer = null;
  const heldDirections = new Set();
  let guidePulse = 0, guidePulseKey = '', guideFocus = 0;
  const activeBursts = [], cameraTarget = v(0, 0, -6), cameraEye = v(1, 1, 0);
  const warmColor = new THREE.Color('#e0e4dc'), fineColor = new THREE.Color('#eef0e8'), threadColor = new THREE.Color('#f3f5ed');
  const warmEmissive = new THREE.Color('#bdcdbd'), fineEmissive = new THREE.Color('#cdd9cd');
  const haloGold = new THREE.Color('#dfefdf'), innerGold = new THREE.Color('#f0fff0'), filamentGold = new THREE.Color('#e1eadd');

  function updateGeometry() {
    if (progress === lastGeometryProgress) return;
    lastGeometryProgress = progress;
    const season = smooth((progress - .05) / .4);
    bark.color.set('#a5ada5').lerp(warmColor, season); fineBark.color.set('#b3beb3').lerp(fineColor, season);
    threadMat.color.set('#c3d0c4').lerp(threadColor, season);
    bark.emissive.set('#8a9a89').lerp(warmEmissive, season); fineBark.emissive.set('#9caa9b').lerp(fineEmissive, season);
    bark.emissiveIntensity = .34; fineBark.emissiveIntensity = .36;
    haloMat.color.set('#b2c9b4').lerp(haloGold, season);
    innerMat.color.set('#d6e7d5').lerp(innerGold, season);
    filamentMaterial.color.set('#a6baa6').lerp(filamentGold, season);
    let lo = 0, hi = filamentSegments.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (filamentSegments[mid].birth <= progress) lo = mid + 1; else hi = mid; }
    filamentGeometry.setDrawRange(0, lo * 2);
    for (const branch of branches) {
      const amount = smooth((progress - branch.birth) / branch.duration);
      revealTube(branch.body, amount);
      if (branch.halo) revealTube(branch.halo, amount);
      if (branch.inner) revealTube(branch.inner, amount);
      if (branch.companion) revealTube(branch.companion, amount);
      if (branch.tip) {
        branch.tip.visible = amount > .002 && amount < .999;
        if (branch.tip.visible) {
          branch.tip.position.copy(branch.curve.getPointAt(amount));
          const size = branch.depth === 0 ? .42 : .27;
          branch.tip.scale.set(size, size, 1);
        }
      }
    }
    mushroomSystem.update(progress);
  }

  function updateCamera(time, dt = .016, immediate = false) {
    const route = routePoint(progress), focus = guide.active ? guideFocus : 0;
    if (progress >= 1 && ongoing.active) {
      route.point.lerp(ongoing.focusPoint, ongoingFollow);
      route.tangent.lerp(ongoing.focusHeading, ongoingFollow * .75).normalize();
    }
    const forward = route.tangent.clone().lerp(guide.heading, focus).normalize();
    const point = route.point.clone().lerp(guide.point, focus);
    const side = v(0, 1, 0).cross(forward).normalize();
    if (side.lengthSq() < .001) side.set(1, 0, 0);
    const drift = Math.sin(progress * 31) * .52 + Math.sin(progress * 57) * .23;
    const proximity = 1 - .27 * smooth((progress - .14) / .14) * (1 - smooth((progress - .38) / .25));
    const eye = point.clone().addScaledVector(forward, -14 * distance * proximity).addScaledVector(side, (7 + drift) * distance * proximity).add(v(0, 3.6 * distance * proximity, 0));
    const target = point.clone().addScaledVector(forward, 3.4).addScaledVector(side, drift * .45);
    target.lerp(colonyCenter, smooth((progress - .2) / .3) * (.78 - ongoingFollow * .85) * (1 - focus));
    const overview = openingViewWeight(progress) * (1 - focus);
    eye.lerp(overviewEye, overview);
    target.lerp(colonyCenter, overview);
    const offset = eye.clone().sub(target), spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += yaw; spherical.phi = clamp(spherical.phi + pitch, .2, Math.PI - .2);
    eye.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    const alpha = immediate ? 1 : 1 - Math.exp(-dt * 3.5);
    cameraEye.lerp(eye, alpha); cameraTarget.lerp(target, alpha);
    camera.position.copy(cameraEye); camera.lookAt(cameraTarget);
    warm.position.copy(point).add(v(1, 2, 1)); cool.position.copy(point).add(v(-4, 4, -3)); pink.position.copy(point).add(v(4, -2, 2));
    dust.rotation.y = Math.sin(time * .00011) * .012;
    dust.material.opacity = .17 + smooth(progress / .52) * .28;
    for (const entry of seedEntries) {
      const appearance = originGlow(progress, entry.birth);
      entry.glow.visible = entry.core.visible = appearance.visible;
      entry.glow.material.opacity = appearance.opacity;
      entry.glow.scale.setScalar(3 * appearance.scale);
      entry.core.scale.setScalar(appearance.scale);
    }
  }

  function burst() {
    const focus = routePoint(progress).point, count = 60, positions = new Float32Array(count * 3), velocities = [];
    for (let i = 0; i < count; i++) { positions.set([focus.x, focus.y, focus.z], i * 3); velocities.push(v(rand(-3, 3), rand(-2.5, 2.5), rand(-3, 3))); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ size: .3, map: bloomMap, color: '#e6ffe9', transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, material); scene.add(points); activeBursts.push({ points, velocities, age: 0 });
  }
  function resize() { const width = canvas.clientWidth, height = canvas.clientHeight; renderer.setSize(width, height, false); composer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  const down = (e) => { dragging = true; pointer = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!dragging || !pointer) return; const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y; if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true; yaw -= dx * .004; pitch = clamp(pitch + dy * .003, -.85, .85); pointer.x = e.clientX; pointer.y = e.clientY; };
  const upPointer = () => { if (pointer && !pointer.moved) burst(); dragging = false; pointer = null; };
  const wheel = (e) => { e.preventDefault(); distance = clamp(distance + Math.sign(e.deltaY) * .1, .62, 2.5); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', upPointer); canvas.addEventListener('pointercancel', upPointer); canvas.addEventListener('wheel', wheel, { passive: false });
  const keyDown = (event) => {
    const key = event.key.toLowerCase();
    if (!activated || !playing || !['w', 'a', 's', 'd'].includes(key) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); heldDirections.add(key);
    guidePulse = .2; guidePulseKey = key;
    if (!guide.active) { const route = routePoint(progress); guide.start(route.point, route.tangent); }
  };
  const keyUp = (event) => { heldDirections.delete(event.key.toLowerCase()); };
  const clearKeys = () => { heldDirections.clear(); guidePulse = 0; };
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', clearKeys);

  function updateGuidedGrowth(dt) {
    if (!playing) return;
    const keys = heldDirections.size ? heldDirections : guidePulse > 0 ? new Set([guidePulseKey]) : null;
    if (keys && guide.active) {
      const horizontal = Number(keys.has('d')) - Number(keys.has('a'));
      const vertical = Number(keys.has('w')) - Number(keys.has('s'));
      const right = v(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = v(0, 1, 0).applyQuaternion(camera.quaternion);
      const desired = guide.heading.clone().multiplyScalar(.55)
        .addScaledVector(right, horizontal).addScaledVector(up, vertical).normalize();
      guide.advance(desired, dt * 3.8);
      guidePulse = Math.max(0, guidePulse - dt);
    }
    guideFocus = THREE.MathUtils.damp(guideFocus, keys ? .86 : 0, 3.2, dt);
  }

  function tick(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (playing) {
      if (progress < 1) {
        progress = clamp(progress + dt * speed / 54);
        if (progress >= 1 || now - lastUI > 90) { onProgress(progress); lastUI = now; }
      }
      if (progress >= 1) {
        if (!ongoing.active) ongoing.start();
        ongoing.advance(dt);
        ongoingFollow = Math.min(.3, ongoingFollow + dt * .028);
      }
    }
    updateGuidedGrowth(dt); updateGeometry(); updateCamera(now, dt);
    for (let i = activeBursts.length - 1; i >= 0; i--) {
      const b = activeBursts[i]; b.age += dt; const a = b.points.geometry.attributes.position;
      for (let j = 0; j < b.velocities.length; j++) a.setXYZ(j, a.getX(j) + b.velocities[j].x * dt, a.getY(j) + b.velocities[j].y * dt, a.getZ(j) + b.velocities[j].z * dt);
      a.needsUpdate = true; b.points.material.opacity = Math.max(0, 1 - b.age / 1.4);
      if (b.age > 1.4) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose(); activeBursts.splice(i, 1); }
    }
    composer.render(); frameId = requestAnimationFrame(tick);
  }
  updateGeometry(); updateCamera(0, .016, true); frameId = requestAnimationFrame(tick);
  return {
    play() { activated = true; playing = true; guide.resume(); ongoing.resume(); last = performance.now(); },
    pause() { playing = false; clearKeys(); guide.pause(); ongoing.pause(); },
    reset() { progress = 0; playing = false; activated = false; clearKeys(); guideFocus = 0; ongoingFollow = 0; guide.reset(); ongoing.reset(); yaw = 0; pitch = 0; distance = 1; onProgress(0); updateGeometry(); updateCamera(performance.now(), .016, true); },
    setSpeed(value) { speed = value; },
    setProgress(value) {
      const wasComplete = progress >= 1;
      progress = clamp(value);
      if (wasComplete && progress < 1) { ongoing.reset(); guide.reset(); guideFocus = 0; ongoingFollow = 0; clearKeys(); }
      if (progress >= 1 && playing && !ongoing.active) ongoing.start();
      updateGeometry(); updateCamera(performance.now(), .016, true); onProgress(progress);
    },
    dispose() {
      cancelAnimationFrame(frameId); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', upPointer); canvas.removeEventListener('pointercancel', upPointer); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearKeys);
      scene.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
      mushroomSystem.dispose();
      guide.dispose();
      ongoing.dispose();
      [bark, fineBark, threadMat, haloMat, innerMat, violetFiber, tipMat, filamentMaterial, bloomMap, barkMap, dust.material, seedCoreMaterial].forEach(x => x.dispose());
      seedEntries.forEach((entry) => entry.glow.material.dispose());
      composer.dispose();
      renderer.dispose();
    },
  };
}
