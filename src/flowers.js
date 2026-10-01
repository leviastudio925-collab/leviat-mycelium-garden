import * as THREE from 'three';

function makePetalGeometry() {
  const vertices = [], indices = [], colors = [], uvs = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, w = Math.sin(Math.PI * t) * (0.23 + 0.08 * t);
    vertices.push(-w, t, Math.sin(Math.PI * t) * 0.16, w, t, Math.sin(Math.PI * t) * 0.16);
    uvs.push(0, t, 1, t);
    const shade = 1 - .22 * t; colors.push(1, 1 - .05 * t, shade, 1, 1 - .05 * t, shade);
    if (i < 8) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

function makePetalTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63, t = 1 - y / 127, edge = Math.abs(u - .5) * 2;
    const central = Math.exp(-Math.pow((u - .5) * 11, 2)) * .14;
    const veins = Math.pow(Math.max(0, Math.cos((u - .5) * 27 + t * 7)), 18) * .09 * Math.sin(t * Math.PI);
    const sheen = .83 + .16 * (1 - edge) + central - veins + .035 * Math.sin(t * 16 + u * 12);
    const i = (y * 64 + x) * 4, c = Math.max(0, Math.min(255, Math.round(255 * sheen)));
    image.data[i] = 255; image.data[i + 1] = c; image.data[i + 2] = Math.min(255, c + 8);
    image.data[i + 3] = Math.round(255 * (.76 + .22 * (1 - edge)));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// Keep the blossom geometry and instancing here so a later model swap only touches this module.
export function createFlowerSystem(scene, blossomSites, rand, random, glowTexture) {
  const flowerPalettes = [
    ['#ff3f85', '#fa5fa1', '#ff87b3'],
    ['#a765f2', '#c37dff', '#e1a3ff'],
    ['#6684ff', '#84adff', '#9cd5ff'],
    ['#ffab59', '#ffd274', '#f37e71'],
  ];
  const petalGeo = makePetalGeometry(), centerGeo = new THREE.IcosahedronGeometry(.1, 1), petalTexture = makePetalTexture();
  const petalMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', map: petalTexture, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .84, depthWrite: false, toneMapped: false });
  const centerMaterial = new THREE.MeshBasicMaterial({ color: '#fff1a0' });
  const flowers = [], glows = [];
  for (const site of blossomSites) {
    const palette = flowerPalettes[Math.floor(random() * flowerPalettes.length)];
    const clustered = random() < (site.depth === 2 ? .28 : .12);
    const count = site.count + (clustered ? (site.depth === 2 ? 13 : 8) + Math.floor(random() * 8) : 0);
    const anchorT = rand(.68, .97), anchor = site.curve.getPointAt(anchorT);
    const glowBirth = Math.min(.96, .51 + site.birth * .34 + site.spread * .15 + rand(0, .07));
    if (clustered) glows.push({ pos: anchor, color: new THREE.Color(palette[1]), birth: glowBirth });
    for (let i = 0; i < count; i++) {
      const t = clustered ? Math.max(.5, Math.min(1, anchorT + rand(-.17, .17))) : rand(.48, 1);
      const pos = site.curve.getPointAt(t), tangent = site.curve.getTangentAt(t);
      if (clustered) pos.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(.05, site.depth === 2 ? 1.1 : .65)));
      const normal = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).addScaledVector(tangent, .3).normalize();
      const bloom = Math.min(.96, glowBirth + rand(0, clustered ? .05 : .12));
      flowers.push({ pos, normal, bloom, size: clustered ? rand(.2, .48) : rand(.24, .72), color: new THREE.Color(palette[Math.floor(random() * palette.length)]), phase: rand(0, 10) });
    }
  }
  const petals = new THREE.InstancedMesh(petalGeo, petalMaterial, flowers.length * 5);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); petals.frustumCulled = false; scene.add(petals);
  const centers = new THREE.InstancedMesh(centerGeo, centerMaterial, flowers.length);
  centers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); centers.frustumCulled = false; scene.add(centers);
  const up = new THREE.Vector3(0, 0, 1), flowerBases = flowers.map(f => new THREE.Quaternion().setFromUnitVectors(up, f.normal));
  const petalRotations = Array.from({ length: 5 }, (_, k) => new THREE.Quaternion().setFromAxisAngle(up, k * Math.PI * 2 / 5));
  const dummy = new THREE.Object3D(), baseQuat = new THREE.Quaternion();
  flowers.forEach((f, i) => { for (let k = 0; k < 5; k++) petals.setColorAt(i * 5 + k, f.color); });
  petals.instanceColor.needsUpdate = true;
  glows.sort((a, b) => a.birth - b.birth);
  const glowPositions = new Float32Array(glows.length * 3), glowColors = new Float32Array(glows.length * 3);
  glows.forEach((g, i) => { glowPositions.set(g.pos.toArray(), i * 3); glowColors.set(g.color.toArray(), i * 3); });
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
  glowGeometry.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
  const glowMaterial = new THREE.PointsMaterial({ size: 4.6, map: glowTexture, vertexColors: true, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const glowPoints = new THREE.Points(glowGeometry, glowMaterial); scene.add(glowPoints);
  return {
    update(progress) {
      let lo = 0, hi = glows.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (glows[mid].birth <= progress) lo = mid + 1; else hi = mid; }
      glowGeometry.setDrawRange(0, lo);
      flowers.forEach((f, i) => {
        const t = Math.max(0, Math.min(1, (progress - f.bloom) / .07));
        const growth = t * t * (3 - 2 * t), size = f.size * growth;
        dummy.position.copy(f.pos); dummy.quaternion.copy(flowerBases[i]); dummy.scale.setScalar(Math.max(.00001, size * .27)); dummy.updateMatrix(); centers.setMatrixAt(i, dummy.matrix);
        for (let k = 0; k < 5; k++) {
          dummy.position.copy(f.pos); baseQuat.copy(flowerBases[i]).multiply(petalRotations[k]); dummy.quaternion.copy(baseQuat);
          dummy.scale.setScalar(Math.max(.00001, size)); dummy.updateMatrix(); petals.setMatrixAt(i * 5 + k, dummy.matrix);
        }
      });
      petals.instanceMatrix.needsUpdate = true; centers.instanceMatrix.needsUpdate = true;
    },
    dispose() { petalMaterial.dispose(); centerMaterial.dispose(); petalTexture.dispose(); glowMaterial.dispose(); },
  };
}
