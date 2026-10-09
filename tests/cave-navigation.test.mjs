import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { createCaveNavigator, CAVE_START, CAVE_ROUTE } from '../src/cave-navigation.js';
import { readGlbCollisionScene } from '../scripts/inspect-cave.mjs';

function room() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 5, .4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2.5, -5);
  root.add(wall);
  return new Octree().fromGraphNode(root);
}

test('WASD movement is relative to mouse heading and cannot walk through stone walls', () => {
  const player = createCaveNavigator(room(), { spawn: [0, 0, 0], yaw: 0, goal: [10, 0, 10] });
  for (let i = 0; i < 300; i++) player.advance(1 / 60, new Set(['w']));
  assert.ok(player.position.z > -4.55 && player.position.z < -3.9, `wall stopped player at ${player.position.z}`);
  assert.ok(Math.abs(player.position.y - 1.7) < .15, 'eye remains above the cave floor');
  player.look(-Math.PI / 2 / .0022, 0);
  const before = player.position.x;
  for (let i = 0; i < 60; i++) player.advance(1 / 60, new Set(['w']));
  assert.ok(player.position.x < before - 1.5, 'rotated view changes the forward movement direction');
});

test('diagonal movement has the same speed and looking up cannot turn the player upside down', () => {
  const a = createCaveNavigator(room(), { spawn: [0, 0, 5], goal: [10, 0, 10] });
  const b = createCaveNavigator(room(), { spawn: [0, 0, 5], goal: [10, 0, 10] });
  for (let i = 0; i < 60; i++) { a.advance(1 / 60, new Set(['w'])); b.advance(1 / 60, new Set(['w', 'd'])); }
  assert.ok(Math.abs(a.traveled - b.traveled) < .05);
  b.look(0, -10000);
  assert.ok(b.pitch <= 1.25);
});

test('the growth handoff requires reaching the chamber after actually walking', () => {
  const player = createCaveNavigator(room(), { spawn: [0, 0, 5], yaw: -Math.PI / 2,
    goal: [19, 0, 5], goalRadius: 3, minimumWalkTime: 5, minimumTravel: 12 });
  assert.equal(player.reachedChamber, false);
  for (let i = 0; i < 180; i++) player.advance(1 / 60, new Set(['w']));
  assert.equal(player.reachedChamber, false);
  for (let i = 0; i < 180; i++) player.advance(1 / 60, new Set(['w']));
  assert.equal(player.reachedChamber, true);
});

test('pausing and reset preserve the start-before-growth sequence', () => {
  const player = createCaveNavigator(room(), { spawn: [0, 0, 5], goal: [10, 0, 10] });
  player.advance(.05, new Set(['w']));
  const before = player.position.clone();
  player.advance(.05, new Set(['w']), false);
  assert.ok(player.position.equals(before));
  player.reset();
  assert.ok(player.position.distanceTo(new THREE.Vector3(0, 1.7, 5)) < .001);
  assert.equal(player.reachedChamber, false);
});

test('the supplied cave has a walkable route from the tunnel spawn to the large chamber', () => {
  const geometry = readGlbCollisionScene(new URL('../public/models/cave.glb', import.meta.url));
  const player = createCaveNavigator(new Octree().fromGraphNode(geometry), CAVE_START);
  for (const waypoint of CAVE_ROUTE.slice(1)) {
    let frames = 0;
    while (Math.hypot(waypoint[0] - player.position.x, waypoint[2] - player.position.z) > .7 && frames < 900) {
      const dx = waypoint[0] - player.position.x, dz = waypoint[2] - player.position.z;
      const desiredYaw = Math.atan2(-dx, -dz);
      const delta = Math.atan2(Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw));
      player.look(-delta / .0022, 0);
      player.advance(1 / 60, new Set(['w']));
      frames++;
    }
    assert.ok(frames < 900, `blocked before ${waypoint} at ${player.position.toArray()}`);
  }
  assert.equal(player.reachedChamber, true);
  assert.ok(player.traveled > 70, 'the chamber follows a substantial walk through the model');
});
