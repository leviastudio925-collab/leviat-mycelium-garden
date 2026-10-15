import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMushroomPlan } from './mushroom-plan';

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };

// The supplied GLB remains the cap source. These deterministic variants change
// its rim, width, depth and profile while retaining the sculpted original.
function capVariant(source, variant) {
  const geometry = source.clone();
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const centerX = (box.min.x + box.max.x) * .5;
  const centerZ = (box.min.z + box.max.z) * .5;
  const height = Math.max(.001, box.max.y - box.min.y);
  const width = Math.max(.001, box.max.x - box.min.x, box.max.z - box.min.z);
  for (let i = 0; i < positions.count; i++) {
    const x = (positions.getX(i) - centerX) * 2 / width;
    const y = (positions.getY(i) - box.min.y) * 1.5 / height;
    const z = (positions.getZ(i) - centerZ) * 2 / width;
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x, z);
    const irregularity = 1 + Math.sin(angle * (5 + variant % 4) + variant * 1.7) * (.025 + variant % 3 * .014)
      + Math.cos(angle * 9 - variant * 2.1) * .016;
    const wide = [.78, 1.02, 1.18, .92, 1.3, 1.06, .86, 1.23][variant];
    const profile = [.9, 1.05, .76, 1.18, .84, 1.1, .95, .8][variant];
    positions.setXYZ(i, x * wide * irregularity, y * profile + Math.sin(angle * 6 + variant) * .035 * radial, z * (2 - wide) * irregularity);
    const rim = ease((radial - .18) / .75);
    const fleck = Math.sin(angle * 17 + radial * 23 + variant) * .035;
    colors[i * 3] = .72 + rim * .28 + fleck;
    colors[i * 3 + 1] = .4 + rim * .5 + fleck;
    colors[i * 3 + 2] = .31 + rim * .43;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function createMushroomSystem(scene, sites, rand, random, modelUrl = '/models/3mushroom.glb', sizeMultiplier = 1) {
  const clusters = createMushroomPlan(sites, rand, random, sizeMultiplier);
  const capMaterial = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: .33, metalness: .02, clearcoat: .65, clearcoatRoughness: .24, side: THREE.DoubleSide, emissive: '#b33911', emissiveIntensity: .38 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#c8afa0', roughness: .86, emissive: '#684739', emissiveIntensity: .12 });
  const stemGeometry = new THREE.CylinderGeometry(.06, .11, 1, 7, 1);
  const stemMesh = new THREE.InstancedMesh(stemGeometry, stemMaterial, clusters.length);
  stemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stemMesh.frustumCulled = false;
  scene.add(stemMesh);
  const meshes = [];
  const dummy = new THREE.Object3D();
  let progress = 0, disposed = false;

  const loader = new GLTFLoader();
  loader.load(modelUrl, (gltf) => {
    if (disposed) return;
    let source = null;
    gltf.scene.traverse((object) => { if (!source && object.isMesh) source = object.geometry; });
    if (!source) { console.error('The mushroom GLB has no mesh.'); return; }
    for (let variant = 0; variant < 8; variant++) {
      const members = clusters.filter((cluster) => cluster.variant === variant);
      const mesh = new THREE.InstancedMesh(capVariant(source, variant), capMaterial, members.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      members.forEach((cluster, index) => mesh.setColorAt(index, cluster.color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      meshes.push({ mesh, members });
    }
    update(progress);
  }, undefined, (error) => console.error('Could not load the supplied mushroom GLB:', error));

  function update(value) {
    progress = value;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i], growth = ease((progress - cluster.birth) / cluster.duration);
      const stalkHeight = cluster.height * cluster.size * growth;
      dummy.position.copy(cluster.point).add(new THREE.Vector3(0, stalkHeight * .5, 0));
      dummy.rotation.set(cluster.tiltX, cluster.rotation, cluster.tiltZ);
      dummy.scale.set(Math.max(.00001, cluster.size * growth), Math.max(.00001, stalkHeight), Math.max(.00001, cluster.size * growth));
      dummy.updateMatrix(); stemMesh.setMatrixAt(i, dummy.matrix);
    }
    stemMesh.instanceMatrix.needsUpdate = true;
    for (const { mesh, members } of meshes) {
      members.forEach((cluster, index) => {
        const growth = ease((progress - cluster.birth) / cluster.duration);
        dummy.position.copy(cluster.point).add(new THREE.Vector3(0, cluster.height * cluster.size * growth, 0));
        dummy.rotation.set(cluster.tiltX, cluster.rotation, cluster.tiltZ);
        const s = Math.max(.00001, cluster.size * growth);
        dummy.scale.set(s, s * (.72 + cluster.height * .12), s);
        dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    update,
    dispose() {
      disposed = true;
      scene.remove(stemMesh); stemGeometry.dispose(); stemMaterial.dispose();
      meshes.forEach(({ mesh }) => { scene.remove(mesh); mesh.geometry.dispose(); });
      capMaterial.dispose();
    },
  };
}
