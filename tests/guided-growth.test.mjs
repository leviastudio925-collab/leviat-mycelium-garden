import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGuidedGrowth } from '../src/guided-growth.js';

test('pausing growth preserves its branch and ignores movement until resumed', () => {
  const scene = new THREE.Scene();
  const bark = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture();
  const guide = createGuidedGrowth(scene, bark, texture);
  const direction = new THREE.Vector3(0, 0, -1);

  guide.start(new THREE.Vector3(), direction);
  guide.advance(direction, 1);
  const endpoint = guide.point.clone();
  const branch = scene.children.find((child) => child.isMesh);
  const visibleLength = branch.geometry.drawRange.count;

  guide.pause();
  guide.advance(direction, 2);

  assert.ok(guide.point.equals(endpoint));
  assert.equal(branch.geometry.drawRange.count, visibleLength);
  assert.equal(branch.visible, true);

  guide.resume();
  guide.advance(direction, 1);
  assert.ok(guide.point.z < endpoint.z);

  guide.dispose();
  bark.dispose();
  texture.dispose();
});
