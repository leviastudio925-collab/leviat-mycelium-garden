import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAVE_ROUTE, CAVE_START, createCaveNavigator } from './cave-navigation.js';

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.16, 'rgba(255,255,255,.85)');
  gradient.addColorStop(.4, 'rgba(255,255,255,.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function disposeObject(root) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

export function createCaveWorld(canvas, { onReady, onArrive, onHandoff, onLockChange, onError }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#071013');
  scene.fog = new THREE.FogExp2('#071013', .019);
  const camera = new THREE.PerspectiveCamera(72, 1, .07, 260);
  camera.rotation.order = 'YXZ';
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .68, .58, .65);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  scene.add(new THREE.AmbientLight('#87a5ac', .55));
  const lamp = new THREE.PointLight('#dce8df', 180, 28, 2);
  const chamberLamp = new THREE.PointLight('#96e6dc', 650, 44, 2);
  const ceilingLamp = new THREE.PointLight('#c6d7c8', 1100, 40, 2);
  ceilingLamp.position.set(-43, -3, -33);
  chamberLamp.position.set(-45, -15, -33);
  scene.add(lamp, chamberLamp, ceilingLamp);
  const keys = new Set();
  let player = null, ready = false, disposed = false, playing = true, arriving = false;
  let frameId = 0, last = performance.now(), time = 0, arrivalTime = 0, handedOff = false;
  let dragging = false, smoothedY = CAVE_START.spawn[1] + 1.7;
  const chamberEntry = new THREE.Vector3();
  const chamberEye = new THREE.Vector3(-45, -19.3, -33);
  const chamberLook = new THREE.Vector3(-58, -8, -44);
  const glow = glowTexture();
  const particleCount = 480;
  const positions = new Float32Array(particleCount * 3), colors = new Float32Array(particleCount * 3);
  const bases = [], phases = [];
  // A reproducible, sparse stream of spores follows a collision-checked route.
  let seed = 948317;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < particleCount; i++) {
    const index = Math.floor(rand() * (CAVE_ROUTE.length - 1)), a = CAVE_ROUTE[index], b = CAVE_ROUTE[index + 1];
    const t = rand(), guide = i < 180;
    const spread = guide ? .7 : 3.4;
    const base = new THREE.Vector3(
      THREE.MathUtils.lerp(a[0], b[0], t) + (rand() - .5) * spread,
      THREE.MathUtils.lerp(a[1], b[1], t) + .85 + rand() * (guide ? .9 : 2.2),
      THREE.MathUtils.lerp(a[2], b[2], t) + (rand() - .5) * spread,
    );
    if (i >= 380) {
      const angle = rand() * Math.PI * 2, radius = 2 + rand() * 9;
      base.set(-45 + Math.cos(angle) * radius, -20 + rand() * 11, -33 + Math.sin(angle) * radius);
    }
    bases.push(base);
    phases.push(rand() * Math.PI * 2);
    const color = new THREE.Color(i % 5 === 0 ? '#edc68d' : '#b6ecdf');
    color.multiplyScalar(guide ? 2.4 : 1.5);
    colors.set(color.toArray(), i * 3);
    positions.set(bases[i].toArray(), i * 3);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
    map: glow, vertexColors: true, size: .095, transparent: true, opacity: .6,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  particles.frustumCulled = false; scene.add(particles);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#b2ffe1', transparent: true,
    opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.position.set(-45, -18.3, -33); beacon.scale.set(1.8, 1.8, 1);
  scene.add(beacon);

  const loader = new GLTFLoader();
  void loader.loadAsync('/models/cave.glb').then(gltf => {
    if (disposed) { disposeObject(gltf.scene); return; }
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      const material = object.material;
      material.map ||= material.emissiveMap;
      material.color.set('#b1bfc0');
      material.emissive.set('#657e87');
      material.emissiveIntensity = .12;
      material.roughness = .94;
      material.metalness = 0;
      material.side = THREE.DoubleSide;
    });
    scene.add(gltf.scene);
    const octree = new Octree().fromGraphNode(gltf.scene);
    player = createCaveNavigator(octree, CAVE_START);
    ready = true;
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    onReady();
  }).catch(error => { if (!disposed) { console.error('Could not load the cave model:', error); onError(); } });

  const locked = () => document.pointerLockElement === canvas;
  const clearKeys = () => keys.clear();
  const down = event => {
    if (!ready || arriving || event.button !== 0) return;
    dragging = true;
    if (!locked()) {
      try { const request = canvas.requestPointerLock?.(); request?.catch(() => {}); } catch { /* dragging remains available */ }
    }
  };
  const up = () => { dragging = false; };
  const move = event => {
    if (player && !arriving && (locked() || dragging)) player.look(event.movementX, event.movementY);
  };
  const lockChange = () => { if (!locked()) clearKeys(); onLockChange(locked()); };
  const keyDown = event => {
    const key = event.key.toLowerCase();
    if (!ready || arriving || !playing || !['w', 'a', 's', 'd'].includes(key) || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault(); keys.add(key);
  };
  const keyUp = event => keys.delete(event.key.toLowerCase());
  const contextMenu = event => event.preventDefault();
  canvas.addEventListener('pointerdown', down);
  document.addEventListener('pointerup', up);
  document.addEventListener('mousemove', move);
  document.addEventListener('pointerlockchange', lockChange);
  canvas.addEventListener('contextmenu', contextMenu);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearKeys);

  function resize() {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    composer.setSize(canvas.clientWidth, canvas.clientHeight);
    camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function tick(now) {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (playing) time += dt;
    if (player) {
      player.advance(dt, keys, playing && !arriving);
      smoothedY = THREE.MathUtils.damp(smoothedY, player.position.y, 12, dt);
      camera.position.set(player.position.x, smoothedY + (player.moving ? Math.sin(player.traveled * 5.8) * .024 : 0), player.position.z);
      if (!arriving) camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      if (!arriving && player.reachedChamber) {
        chamberEntry.copy(camera.position);
        arriving = true; clearKeys(); onArrive();
        if (locked()) document.exitPointerLock();
      }
      if (arriving) {
        if (playing) arrivalTime += dt;
        camera.position.lerpVectors(chamberEntry, chamberEye, THREE.MathUtils.smoothstep(arrivalTime, 0, 2.8));
        const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, chamberLook, camera.up));
        camera.quaternion.slerp(orientation, 1 - Math.exp(-dt * 1.35));
        if (arrivalTime > 3.1 && !handedOff) { handedOff = true; onHandoff(); }
      }
      lamp.position.copy(camera.position).add(new THREE.Vector3(0, .3, 0));
    }
    for (let i = 0; i < particleCount; i++) {
      const base = bases[i], phase = phases[i];
      positions[i * 3] = base.x + Math.sin(time * .37 + phase) * .22;
      positions[i * 3 + 1] = base.y + Math.sin(time * .51 + phase * 2) * .28;
      positions[i * 3 + 2] = base.z + Math.cos(time * .32 + phase) * .2;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    beacon.material.opacity = .6 + Math.sin(time * 1.8) * .12;
    composer.render();
    frameId = requestAnimationFrame(tick);
  }
  frameId = requestAnimationFrame(tick);
  return {
    play() { playing = true; last = performance.now(); },
    pause() { playing = false; clearKeys(); },
    get player() { return player; },
    dispose() {
      disposed = true; cancelAnimationFrame(frameId); observer.disconnect();
      if (locked()) document.exitPointerLock();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('contextmenu', contextMenu);
      document.removeEventListener('pointerup', up); document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChange);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearKeys);
      onLockChange(false); disposeObject(scene); composer.dispose(); renderer.dispose();
    },
  };
}
