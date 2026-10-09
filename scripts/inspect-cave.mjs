import fs from 'node:fs';
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

export function readGlbCollisionScene(file) {
  const bytes = fs.readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  function accessor(index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const dimensions = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1 }[a.type];
    const types = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
    const ArrayType = types[a.componentType], width = ArrayType.BYTES_PER_ELEMENT;
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (view.byteStride && view.byteStride !== width * dimensions) throw new Error('Interleaved cave accessor is not supported');
    return { array: new ArrayType(binary.buffer.slice(binary.byteOffset + offset, binary.byteOffset + offset + a.count * dimensions * width)), dimensions };
  }
  const root = new THREE.Group();
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const group = new THREE.Group();
    if (node.matrix) group.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    if (node.translation) group.position.fromArray(node.translation);
    if (node.rotation) group.quaternion.fromArray(node.rotation);
    if (node.scale) group.scale.fromArray(node.scale);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry(), positions = accessor(primitive.attributes.POSITION);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions.array, positions.dimensions));
      if (primitive.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(accessor(primitive.indices).array, 1));
      group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    }
    root.add(group);
  }
  root.updateMatrixWorld(true);
  return root;
}

if (process.argv[1]?.endsWith('inspect-cave.mjs')) {
  const file = process.argv[2];
  const root = readGlbCollisionScene(file);
  const box = new THREE.Box3().setFromObject(root), octree = new Octree().fromGraphNode(root);
  const cells = [], directions = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 6), 0, Math.sin(i * Math.PI / 6)));
  for (let x = Math.ceil(box.min.x); x < box.max.x; x += 3) for (let z = Math.ceil(box.min.z); z < box.max.z; z += 3) {
    const floor = octree.rayIntersect(new THREE.Ray(new THREE.Vector3(x, box.max.y + 5, z), new THREE.Vector3(0, -1, 0)));
    if (!floor) continue;
    const eye = floor.position.clone().add(new THREE.Vector3(0, 2, 0));
    const ceiling = octree.rayIntersect(new THREE.Ray(eye, new THREE.Vector3(0, 1, 0)));
    if (!ceiling || ceiling.distance < 3 || floor.position.y > 12) continue;
    const walls = directions.map(direction => octree.rayIntersect(new THREE.Ray(eye, direction))?.distance ?? 100);
    cells.push({ x, z, y: floor.position.y, height: ceiling.distance, clearance: Math.min(...walls), openness: walls.reduce((a, b) => a + Math.min(b, 40), 0) / walls.length });
  }
  fs.mkdirSync('cave-inspection', { recursive: true });
  fs.writeFileSync('cave-inspection/floors.json', JSON.stringify({ bounds: { min: box.min.toArray(), max: box.max.toArray() }, cells }));
  console.log('Bounds', box.min.toArray(), box.max.toArray(), 'interior cells', cells.length);
  console.log('Spacious', cells.toSorted((a,b)=>b.clearance-a.clearance).slice(0,12));
  console.log('Narrow', cells.filter(c=>c.clearance>1&&c.clearance<4).toSorted((a,b)=>a.openness-b.openness).slice(0,12));
}
