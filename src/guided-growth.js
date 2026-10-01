import * as THREE from 'three';

// A reusable tube buffer lets the keyboard-guided tip move continuously.
export function createGuidedGrowth(scene, barkMaterial, glowTexture, { radius = .043, maxRings = 760 } = {}) {
  const radial = 7, stride = radial + 1;
  const positions = new Float32Array((maxRings + 1) * stride * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array((maxRings + 1) * stride * 2);
  const indices = new Uint16Array(maxRings * radial * 6);
  for (let i = 0; i < maxRings; i++) {
    for (let j = 0; j < radial; j++) {
      const n = (i * radial + j) * 6, a = i * stride + j, b = (i + 1) * stride + j;
      indices.set([a, b, a + 1, b, b + 1, a + 1], n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = barkMaterial.clone();
  material.color.set('#eaf2e9');
  material.emissive.set('#a9c6af');
  material.emissiveIntensity = .48;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  const tipMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: '#e1ffe8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const tip = new THREE.Sprite(tipMaterial);
  tip.scale.set(.7, .7, 1); tip.visible = false; scene.add(tip);
  const point = new THREE.Vector3(), heading = new THREE.Vector3(0, 0, -1), committed = new THREE.Vector3();
  const side = new THREE.Vector3(), other = new THREE.Vector3(), radialVector = new THREE.Vector3();
  let active = false, paused = false, rings = 1, traveled = 0;

  function writeRing(index, center, tangent, length, tipRing = false) {
    side.set(0, 1, 0).cross(tangent).normalize();
    if (side.lengthSq() < .001) side.set(1, 0, 0);
    other.crossVectors(tangent, side).normalize();
    const width = radius * (1 + .28 * Math.sin(length * .9)) * (tipRing ? .7 : 1);
    for (let j = 0; j <= radial; j++) {
      const angle = j * Math.PI * 2 / radial, vertex = index * stride + j;
      radialVector.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(other, Math.sin(angle));
      positions[vertex * 3] = center.x + radialVector.x * width;
      positions[vertex * 3 + 1] = center.y + radialVector.y * width;
      positions[vertex * 3 + 2] = center.z + radialVector.z * width;
      normals[vertex * 3] = radialVector.x;
      normals[vertex * 3 + 1] = radialVector.y;
      normals[vertex * 3 + 2] = radialVector.z;
      uvs[vertex * 2] = length / 6;
      uvs[vertex * 2 + 1] = j / radial;
    }
  }
  function upload() {
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
    geometry.setDrawRange(0, rings * radial * 6);
    tip.position.copy(point);
  }

  return {
    get active() { return active; },
    get exhausted() { return rings >= maxRings - 1; },
    point,
    heading,
    start(origin, direction) {
      active = true; paused = false; rings = 1; traveled = 0;
      point.copy(origin); committed.copy(origin); heading.copy(direction).normalize();
      writeRing(0, point, heading, 0);
      writeRing(1, point, heading, 0, true);
      geometry.setDrawRange(0, 0);
      mesh.visible = true; tip.visible = true; tip.position.copy(point);
    },
    advance(desiredDirection, distance) {
      if (!active || paused || rings >= maxRings - 1 || distance <= 0) return;
      heading.lerp(desiredDirection, Math.min(1, distance * .38)).normalize();
      point.addScaledVector(heading, distance);
      traveled += distance;
      while (committed.distanceTo(point) >= .12 && rings < maxRings - 1) {
        committed.addScaledVector(point.clone().sub(committed).normalize(), .12);
        writeRing(rings, committed, heading, traveled);
        rings++;
      }
      writeRing(rings, point, heading, traveled, true);
      upload();
    },
    pause() { paused = true; tip.visible = false; },
    resume() { paused = false; tip.visible = active; },
    reset() {
      active = false; paused = false; rings = 1; traveled = 0;
      geometry.setDrawRange(0, 0); mesh.visible = false; tip.visible = false;
    },
    dispose() { scene.remove(mesh, tip); geometry.dispose(); material.dispose(); tipMaterial.dispose(); },
  };
}
