import { Capsule } from 'three/addons/math/Capsule.js';
import { Ray, Vector3 } from 'three';

export const CAVE_ROUTE = [
  [-24,-7.939,15],[-22.5,-7.573,15],[-21,-7.075,15],[-19.5,-6.8,15],
  [-18,-6.581,15],[-16.5,-6.837,15],[-15,-6.67,15],[-13.5,-6.649,15],
  [-12,-6.542,13.5],[-10.5,-6.479,13.5],[-9,-5.896,12],[-7.5,-5.928,12],
  [-6,-5.947,12],[-4.5,-6.075,12],[-3,-5.825,12],[-1.5,-5.628,12],
  [0,-5.577,12],[1.5,-5.774,10.5],[3,-6.307,9],[4.5,-6.595,7.5],
  [6,-6.316,6],[7.5,-6.107,4.5],[9,-5.216,3],[10.5,-5.269,1.5],
  [12,-6.34,0],[12,-6.135,-1.5],[12,-6.38,-3],[10.5,-6.436,-4.5],
  [10.5,-6.727,-6],[9,-7.237,-7.5],[7.5,-7.189,-9],[6,-7.401,-10.5],
  [4.5,-7.641,-12],[3,-7.585,-13.5],[1.5,-7.698,-15],[0,-7.654,-16.5],
  [-1.5,-7.859,-18],[-3,-7.776,-18],[-4.5,-7.943,-18],[-6,-7.991,-18],
  [-7.5,-8.11,-18],[-9,-8.615,-19.5],[-10.5,-8.915,-21],[-12,-9.227,-21],
  [-13.5,-9.472,-21],[-15,-9.997,-21],[-16.5,-10.251,-21],[-18,-11.452,-21],
  [-19.5,-12.14,-21],[-21,-13.244,-21],[-22.5,-14.438,-21],[-24,-15.75,-21],
  [-25.5,-16.754,-21],[-27,-18.103,-21],[-28.5,-19.156,-21],[-30,-19.97,-21],
  [-31.5,-21.107,-22.5],[-33,-21.182,-24],[-34.5,-21.212,-25.5],[-36,-21.248,-27],
  [-37.5,-21.247,-28.5],[-39,-21.054,-30],[-40.5,-20.686,-31.5],[-42,-21.073,-33],
  [-43.5,-21.049,-33],[-45,-20.998,-33],
];

export const CAVE_START = Object.freeze({ spawn: CAVE_ROUTE[0], yaw: -Math.PI / 2,
  goal: [-45, -21, -33], goalRadius: 7, minimumWalkTime: 8, minimumTravel: 22 });

const down = new Vector3(0, -1, 0);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Grounded first-person walking. The collider slides against real cave triangles;
// support rays prevent stepping off holes or climbing sheer rock faces.
export function createCaveNavigator(octree, {
  spawn = CAVE_START.spawn, yaw: initialYaw = 0, goal = CAVE_START.goal,
  goalRadius = 7, minimumWalkTime = 8, minimumTravel = 22, speed = 3.6,
} = {}) {
  const eyeHeight = 1.7, radius = .32, sensitivity = .0022;
  const position = new Vector3(...spawn).add(new Vector3(0, eyeHeight, 0));
  const velocity = new Vector3(), desired = new Vector3(), next = new Vector3();
  const capsule = new Capsule(new Vector3(), new Vector3(), radius);
  const supportRay = new Ray(new Vector3(), down);
  const goalPoint = new Vector3(...goal);
  let yaw = initialYaw, pitch = 0, traveled = 0, elapsed = 0;

  function supportAt(point, currentFootY) {
    supportRay.origin.set(point.x, currentFootY + .85, point.z);
    const hit = octree.rayIntersect(supportRay);
    if (!hit || hit.distance > 2.6) return null;
    const normal = hit.triangle.getNormal(new Vector3());
    if (normal.y < .42) return null;
    return { height: hit.position.y, lift: radius * (1 / normal.y - 1) + .015 };
  }

  function moveStep(step) {
    const footY = position.y - eyeHeight;
    next.copy(position).addScaledVector(velocity, step);
    let floor = supportAt(next, footY);
    if (floor === null) return;
    next.y = floor.height + eyeHeight + floor.lift;
    for (let i = 0; i < 3; i++) {
      capsule.start.set(next.x, next.y - eyeHeight + radius, next.z);
      capsule.end.set(next.x, next.y - .28, next.z);
      const collision = octree.capsuleIntersect(capsule);
      if (!collision || collision.depth < .001) break;
      if (collision.normal.y < -.55) return; // low ceiling
      if (collision.normal.y > .5) next.y += collision.depth / collision.normal.y + .001;
      else next.addScaledVector(collision.normal, collision.depth + .001);
    }
    floor = supportAt(next, footY);
    if (floor === null) return;
    next.y = floor.height + eyeHeight + floor.lift;
    traveled += Math.hypot(next.x - position.x, next.z - position.z);
    position.copy(next);
  }

  return {
    position,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get traveled() { return traveled; },
    get elapsed() { return elapsed; },
    get moving() { return velocity.lengthSq() > .03; },
    get reachedChamber() {
      return elapsed >= minimumWalkTime && traveled >= minimumTravel
        && Math.hypot(position.x - goalPoint.x, position.z - goalPoint.z) <= goalRadius
        && Math.abs(position.y - eyeHeight - goalPoint.y) < 5;
    },
    look(dx, dy) {
      yaw -= dx * sensitivity;
      pitch = clamp(pitch - dy * sensitivity, -1.2, 1.25);
    },
    advance(dt, keys, playing = true) {
      if (!playing) { velocity.set(0, 0, 0); return; }
      dt = clamp(dt, 0, .05);
      elapsed += dt;
      const forward = Number(keys.has('w')) - Number(keys.has('s'));
      const sideways = Number(keys.has('d')) - Number(keys.has('a'));
      desired.set(-Math.sin(yaw) * forward + Math.cos(yaw) * sideways, 0,
        -Math.cos(yaw) * forward - Math.sin(yaw) * sideways);
      if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(speed);
      velocity.lerp(desired, 1 - Math.exp(-dt * 11));
      const steps = Math.max(1, Math.ceil(dt / .012));
      for (let i = 0; i < steps; i++) moveStep(dt / steps);
    },
    reset() {
      position.set(...spawn).add(new Vector3(0, eyeHeight, 0));
      velocity.set(0, 0, 0); yaw = initialYaw; pitch = 0; traveled = 0; elapsed = 0;
    },
  };
}
