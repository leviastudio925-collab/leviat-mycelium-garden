import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createOngoingGrowth } from '../src/ongoing-growth.js';

test('growth continues beyond the timeline with a thick primary and thinner secondary', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture();
  const growth = createOngoingGrowth(scene, material, texture, [
    { origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), radius: .12, speed: 3 },
    { origin: new THREE.Vector3(2, 0, 0), direction: new THREE.Vector3(1, 0, 0), radius: .035, speed: 2 },
  ]);

  growth.start();
  const before = growth.focusPoint.clone();
  growth.advance(.5);
  assert.ok(growth.focusPoint.distanceTo(before) > 1);

  const [primary, secondary] = scene.children.filter((child) => child.isMesh);
  const firstVertexRadius = (mesh, origin) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0).distanceTo(origin);
  assert.ok(firstVertexRadius(primary, new THREE.Vector3()) > firstVertexRadius(secondary, new THREE.Vector3(2, 0, 0)) * 2);

  growth.pause();
  const pausedAt = growth.focusPoint.clone();
  growth.advance(.5);
  assert.ok(growth.focusPoint.equals(pausedAt));

  growth.resume();
  growth.advance(.5);
  assert.ok(growth.focusPoint.distanceTo(pausedAt) > 1);

  growth.dispose();
  material.dispose();
  texture.dispose();
});

test('growth continues after one path fills its geometry and reset clears it', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture();
  const growth = createOngoingGrowth(scene, material, texture, [
    { origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1), radius: .09, speed: 3 },
  ]);

  growth.start();
  for (let i = 0; i < 820; i++) growth.advance(.05);
  const afterFirstBuffer = growth.focusPoint.clone();
  for (let i = 0; i < 160; i++) growth.advance(.05);
  assert.ok(growth.focusPoint.distanceTo(afterFirstBuffer) > 1);
  assert.ok(scene.children.filter((child) => child.isMesh).length <= 32);

  growth.reset();
  assert.equal(scene.children.filter((child) => child.isMesh).length, 0);

  growth.dispose();
  material.dispose();
  texture.dispose();
});
