import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cylinder, sphere, barBetween, tube, plane, blobShadow } from './helpers.js';
import { randomGenerator, createFoliageTextures } from './textures.js';

const leafGeo = new THREE.PlaneGeometry(1, 1);
const needleGeo = new THREE.PlaneGeometry(1, 1);

function foliageMaterial(map) {
  // A touch of self-illumination and a strong sky response stands in for leaf
  // translucency, so canopies do not collapse into black masses when backlit.
  return new THREE.MeshStandardMaterial({
    map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82,
    metalness: 0, color: '#ffffff', envMapIntensity: 0.95,
    emissive: '#6d6a4c', emissiveMap: map, emissiveIntensity: 0.32,
  });
}

function barkMaterial(materials) {
  const mat = new THREE.MeshStandardMaterial({
    map: materials.soil.map, normalMap: materials.soil.normalMap,
    roughnessMap: materials.soil.roughnessMap, color: '#8d785d', roughness: 1,
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  mat.userData.uvMeters = 0.45;
  return mat;
}

/* ------------------------------------------------------------------ *
 *  Broadleaf trees — thousands of alpha-cut cards on a real branch armature
 * ------------------------------------------------------------------ */

function createTree(parent, {
  position, height = 4, crown = 1.7, seed = 1,
  palette = ['#33482c', '#41562f', '#53653a', '#66713d'],
  sparse = false, leaning = 0, leafMap, bark, density = 1, leafScale = 1,
}) {
  const rng = randomGenerator(seed);
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);

  const trunkTop = [leaning * 0.3, height * 0.6, leaning * 0.12];
  const mid = [leaning * 0.14, height * 0.3, leaning * 0.05];
  tube(group, [[0, 0, 0], mid, trunkTop], height * 0.036, bark);
  tube(group, [trunkTop, [leaning * 0.42, height * 0.78, leaning * 0.2], [leaning * 0.6, height * 0.92, leaning * 0.26]], height * 0.02, bark);

  const clusters = [];
  const branchCount = sparse ? 9 : 14;
  for (let i = 0; i < branchCount; i++) {
    const angle = i * 2.399 + rng() * 0.6;
    const level = 0.36 + (i / branchCount) * 0.5;
    const radial = crown * (0.42 + rng() * 0.62) * (1 - Math.max(0, level - 0.62) * 0.8);
    const end = [Math.cos(angle) * radial + leaning * 0.5, height * level + rng() * height * 0.08, Math.sin(angle) * radial];
    const start = [leaning * 0.12, height * (level - 0.18), leaning * 0.05];
    const elbow = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5 + 0.12, (start[2] + end[2]) * 0.5];
    tube(group, [start, elbow, end], height * (sparse ? 0.006 : 0.009) * (1 - level * 0.4), bark);
    clusters.push({ center: end, radius: crown * (0.3 + rng() * 0.16), squash: sparse ? 0.6 : 0.8 });
    if (!sparse) {
      for (const side of [-1, 1]) {
        const twigEnd = [
          end[0] + Math.cos(angle + side * 0.9) * crown * 0.3,
          end[1] + height * (0.06 + rng() * 0.06),
          end[2] + Math.sin(angle + side * 0.9) * crown * 0.3,
        ];
        barBetween(group, elbow, twigEnd, height * 0.004, bark, 5);
        clusters.push({ center: twigEnd, radius: crown * (0.22 + rng() * 0.1), squash: 0.75 });
      }
    }
  }
  clusters.push({ center: [leaning * 0.6, height * 0.9, leaning * 0.26], radius: crown * 0.36, squash: 0.85 });

  // dark interior mass so the crown reads solid from a distance
  const coreMat = new THREE.MeshStandardMaterial({ color: '#31452a', roughness: 1, envMapIntensity: 0.55 });
  const cores = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), coreMat, clusters.length * 2);
  const coreMatrix = new THREE.Matrix4(), coreQ = new THREE.Quaternion(), coreP = new THREE.Vector3(), coreS = new THREE.Vector3();
  let coreIndex = 0;
  for (const cluster of clusters) {
    for (let k = 0; k < 2; k++) {
      coreP.set(
        cluster.center[0] + (rng() - 0.5) * cluster.radius * 0.4,
        cluster.center[1] + (rng() - 0.5) * cluster.radius * 0.3,
        cluster.center[2] + (rng() - 0.5) * cluster.radius * 0.4,
      );
      coreQ.setFromEuler(new THREE.Euler(rng(), rng() * 6, rng()));
      const r = cluster.radius * (0.38 + rng() * 0.14);
      coreS.set(r, r * cluster.squash * 0.92, r);
      coreMatrix.compose(coreP, coreQ, coreS);
      cores.setMatrixAt(coreIndex++, coreMatrix);
    }
  }
  cores.castShadow = true;
  cores.receiveShadow = true;
  group.add(cores);

  const perCluster = Math.round((sparse ? 60 : 150) * density);
  const total = clusters.length * perCluster;
  const leaves = new THREE.InstancedMesh(leafGeo, foliageMaterial(leafMap), total);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  let index = 0;
  for (const cluster of clusters) {
    for (let j = 0; j < perCluster; j++) {
      const theta = rng() * Math.PI * 2;
      const u = rng() * 2 - 1;
      const r = Math.cbrt(0.08 + rng() * 0.92);
      const s = Math.sqrt(1 - u * u);
      pos.set(
        cluster.center[0] + Math.cos(theta) * s * r * cluster.radius,
        cluster.center[1] + u * r * cluster.radius * cluster.squash,
        cluster.center[2] + Math.sin(theta) * s * r * cluster.radius,
      );
      quaternion.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI));
      const size = (0.055 + rng() * 0.07) * leafScale;
      scale.set(size, size, size);
      matrix.compose(pos, quaternion, scale);
      leaves.setMatrixAt(index, matrix);
      color.set(palette[Math.floor(rng() * palette.length)]);
      color.offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.1);
      leaves.setColorAt(index++, color);
    }
  }
  leaves.castShadow = leaves.receiveShadow = true;
  group.add(leaves);
  return group;
}

/* ------------------------------------------------------------------ *
 *  Shrubs & sculpted pine
 * ------------------------------------------------------------------ */

function shrub(parent, { position, radius = 0.65, color = '#354a2d', seed = 1, shape = [1, 1, 1], leafMap, density = 1 }) {
  const rng = randomGenerator(seed);
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const lobes = [
    [0, radius * 0.62 * shape[1], 0, 1],
    [radius * 0.38, radius * 0.52 * shape[1], radius * 0.2, 0.7],
    [-radius * 0.34, radius * 0.55 * shape[1], -radius * 0.18, 0.72],
  ];
  const coreMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), roughness: 0.98 });
  for (const [x, y, z, s] of lobes) {
    sphere(group, radius * s * 0.85, [x, y, z], coreMat, [shape[0], shape[1] * 0.78, shape[2]], 2).castShadow = true;
  }
  const count = Math.round(760 * density * radius);
  const leaves = new THREE.InstancedMesh(leafGeo, foliageMaterial(leafMap), count);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3(), normal = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const lobe = lobes[Math.floor(rng() * lobes.length)];
    const theta = rng() * Math.PI * 2, u = rng() * 2 - 1;
    const ring = Math.sqrt(1 - u * u);
    normal.set(Math.cos(theta) * ring, u, Math.sin(theta) * ring);
    p.set(
      lobe[0] + normal.x * radius * lobe[3] * shape[0] * 0.96,
      lobe[1] + normal.y * radius * lobe[3] * shape[1] * 0.78,
      lobe[2] + normal.z * radius * lobe[3] * shape[2] * 0.96,
    );
    q.setFromUnitVectors(up, normal);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)));
    const size = 0.055 + rng() * 0.07;
    s.set(size, size, size);
    matrix.compose(p, q, s);
    leaves.setMatrixAt(i, matrix);
    c.set(color).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.12);
    leaves.setColorAt(i, c);
  }
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);
  return group;
}

function cloudPine(parent, { position, seed = 1, scale = 1, leafMap, materials }) {
  const rng = randomGenerator(seed);
  const group = new THREE.Group();
  group.position.set(...position);
  group.scale.setScalar(scale);
  parent.add(group);
  const bark = barkMaterial(materials);
  tube(group, [[0, 0, 0], [-0.22, 0.7, 0.1], [0.1, 1.4, 0], [0.02, 2.2, -0.08], [0.32, 2.9, 0]], 0.1, bark);
  const padColor = new THREE.MeshStandardMaterial({ color: '#2c422f', roughness: 0.95 });
  const tips = [[-1.2, 1.05, 0.1, 1.35], [0.98, 1.5, 0.2, 1.2], [-0.9, 2.0, -0.1, 1.15], [0.76, 2.5, 0.05, 1.0], [0.16, 3.0, 0, 0.8]];
  const total = 880;
  const needleCount = tips.length * total;
  const needles = new THREE.InstancedMesh(needleGeo, foliageMaterial(leafMap), needleCount);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  let index = 0;
  for (const [x, y, z, r] of tips) {
    tube(group, [[0, y - 0.6, 0], [x * 0.55, y - 0.16, z], [x, y, z]], 0.05, bark);
    sphere(group, 0.2 * r, [x, y, z], padColor, [1.6, 0.26, 1.0], 2);
    for (let j = 0; j < total; j++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * 0.62 * r;
      p.set(x + Math.cos(a) * rr * 1.5, y + (rng() - 0.35) * 0.12, z + Math.sin(a) * rr);
      q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (rng() - 0.5) * 0.5, rng() * 6.28, 0));
      const size = 0.06 + rng() * 0.07;
      s.set(size, size, size);
      matrix.compose(p, q, s);
      needles.setMatrixAt(index, matrix);
      c.setHSL(0.3 + rng() * 0.03, 0.22 + rng() * 0.1, 0.1 + rng() * 0.05);
      needles.setColorAt(index++, c);
    }
  }
  needles.castShadow = true;
  group.add(needles);
  return group;
}

/* ------------------------------------------------------------------ *
 *  Bamboo groves
 * ------------------------------------------------------------------ */

function bambooGrove(parent, materials, center, count = 55, seed = 1, spread = [4.6, 3.4]) {
  const rng = randomGenerator(seed);
  const group = new THREE.Group();
  group.position.set(...center);
  parent.add(group);
  const stalkMat = materials.bamboo.clone();
  stalkMat.color.set('#8f9a66');
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.034, 0.045, 1, 7), stalkMat, count);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const tops = [];
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * spread[0], z = (rng() - 0.5) * spread[1], h = 4.2 + rng() * 3.8;
    p.set(x, h / 2, z);
    q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06));
    s.set(0.7 + rng() * 0.7, h, 0.7 + rng() * 0.7);
    matrix.compose(p, q, s);
    stalks.setMatrixAt(i, matrix);
    c.setHSL(0.18 + rng() * 0.03, 0.1 + rng() * 0.14, 0.27 + rng() * 0.14);
    stalks.setColorAt(i, c);
    tops.push([x, h, z]);
  }
  stalks.castShadow = true;
  group.add(stalks);

  const perStalk = 58;
  const leaves = new THREE.InstancedMesh(needleGeo, foliageMaterial(materials.leafTextures.narrow), count * perStalk);
  let index = 0;
  for (const top of tops) {
    for (let j = 0; j < perStalk; j++) {
      const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.6) * 1.15;
      p.set(top[0] + Math.cos(a) * r, top[1] - rng() * rng() * 2.6, top[2] + Math.sin(a) * r);
      q.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI));
      const size = 0.18 + rng() * 0.24;
      s.set(size, size, size);
      matrix.compose(p, q, s);
      leaves.setMatrixAt(index, matrix);
      c.setHSL(0.23 + rng() * 0.03, 0.24 + rng() * 0.14, 0.08 + rng() * 0.08);
      leaves.setColorAt(index++, c);
    }
  }
  leaves.castShadow = true;
  group.add(leaves);
  return group;
}

/* ------------------------------------------------------------------ *
 *  Ground details
 * ------------------------------------------------------------------ */

function pathCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.9, 0, 3.55),
    new THREE.Vector3(-1.6, 0, 5.0),
    new THREE.Vector3(-5.0, 0, 6.15),
    new THREE.Vector3(-8.4, 0, 6.25),
    new THREE.Vector3(-11.3, 0, 6.5),
  ]);
}

function slabPath(parent, materials) {
  const rng = randomGenerator(5150);
  const curve = pathCurve();
  const count = 22;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const angle = Math.atan2(tangent.z, tangent.x);
    const geometry = new THREE.CylinderGeometry(1, 1.04, 0.075, 7);
    const slab = new THREE.Mesh(geometry, materials.stone);
    slab.position.set(point.x + (rng() - 0.5) * 0.34, 0.012, point.z + (rng() - 0.5) * 0.26);
    slab.scale.set(0.56 + rng() * 0.2, 1, 0.4 + rng() * 0.13);
    slab.rotation.y = angle + (rng() - 0.5) * 0.8;
    slab.receiveShadow = true;
    slab.castShadow = true;
    parent.add(slab);
  }
  // two slabs at the veranda step
  for (let i = 0; i < 2; i++) {
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.03, 0.07, 7), materials.stone);
    slab.position.set(-0.15 + i * 0.9, 0.008, 3.65 + i * 0.15);
    slab.scale.set(0.62, 1, 0.44);
    slab.rotation.y = 0.3 + i;
    slab.receiveShadow = true;
    parent.add(slab);
  }
}

function grassBlades(parent) {
  const rng = randomGenerator(8331);
  const count = 42000;
  const geometry = new THREE.BufferGeometry();
  const bend = 0.035;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.008, 0, 0, 0.008, 0, 0, -0.004 + bend, 0.09, 0,
    0.008, 0, 0, 0.002 + bend, 0.06, 0, -0.004 + bend, 0.09, 0,
  ], 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.4 });
  const grass = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), color = new THREE.Color();
  let index = 0;
  while (index < count) {
    const x = (rng() - 0.5) * 24.2, z = -7.6 + rng() * 21.6;
    if (Math.abs(x) < 7.2 && z < 3.4) continue;
    if (x > 0.15 && x < 8.15 && z > 3.35 && z < 7.9) continue;
    p.set(x, -0.03, z);
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.28));
    const h = 0.55 + rng() * 1.15;
    s.set(0.65 + rng() * 0.9, h, 1);
    matrix.compose(p, q, s);
    grass.setMatrixAt(index, matrix);
    if (rng() > 0.86) color.setHSL(0.15, 0.22, 0.13 + rng() * 0.06);
    else color.setHSL(0.2 + rng() * 0.035, 0.26 + rng() * 0.16, 0.045 + rng() * 0.05);
    grass.setColorAt(index++, color);
  }
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  parent.add(grass);
}

function fallenLeaves(parent, materials) {
  const rng = randomGenerator(4102);
  const count = 1700;
  const leaves = new THREE.InstancedMesh(leafGeo, foliageMaterial(materials.leafTextures.maple), count);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const palette = ['#b07a33', '#9a5f2b', '#c39a4a', '#7e6a33', '#8a7838', '#a85c30'];
  for (let i = 0; i < count; i++) {
    let x = (rng() - 0.5) * 23, z = -7 + rng() * 20.5;
    if (Math.abs(x) < 7.2 && z < 3.4) {
      // fewer leaves underneath the veranda
      z = 3.4 + rng() * 12;
    }
    p.set(x, -0.028 + rng() * 0.01, z);
    q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (rng() - 0.5) * 0.28, rng() * 6.28, 0));
    const size = 0.075 + rng() * 0.09;
    s.set(size, size, size);
    matrix.compose(p, q, s);
    leaves.setMatrixAt(i, matrix);
    c.set(palette[Math.floor(rng() * palette.length)]).offsetHSL(0, 0, (rng() - 0.5) * 0.08);
    leaves.setColorAt(i, c);
  }
  leaves.receiveShadow = true;
  leaves.castShadow = false;
  leaves.frustumCulled = false;
  parent.add(leaves);
}

function rabbits(parent, materials) {
  const group = new THREE.Group();
  group.position.set(10.35, -0.02, 1.0);
  group.rotation.y = -Math.PI / 2;
  parent.add(group);
  const white = new THREE.MeshStandardMaterial({ color: '#dedcd0', roughness: 0.78 });
  for (const [x, z, scale] of [[-0.28, 0, 1], [0.3, 0.08, 0.83]]) {
    const rabbit = new THREE.Group();
    rabbit.position.set(x, 0, z);
    rabbit.scale.setScalar(scale);
    group.add(rabbit);
    sphere(rabbit, 0.22, [0, 0.29, 0], white, [0.78, 1.25, 0.92], 2);
    sphere(rabbit, 0.15, [0, 0.56, 0.07], white, [0.86, 1, 0.86], 2);
    for (const ex of [-0.07, 0.07]) {
      const ear = sphere(rabbit, 0.085, [ex, 0.8, 0.03], white, [0.44, 1.7, 0.4], 1);
      ear.rotation.z = ex * 2.4;
    }
    sphere(rabbit, 0.013, [-0.07, 0.6, 0.185], materials.blackGlass, [1, 1, 1], 1);
    sphere(rabbit, 0.013, [0.07, 0.6, 0.185], materials.blackGlass, [1, 1, 1], 1);
    sphere(rabbit, 0.02, [0, 0.565, 0.215], new THREE.MeshStandardMaterial({ color: '#c99c9a', roughness: 0.7 }), [1, 1, 1], 1);
  }
  sphere(group, 0.4, [0.12, 0.2, -0.22], materials.darkStone, [1.35, 0.62, 1], 1);

  const solar = new THREE.Group();
  solar.position.set(-0.8, 0.2, 0.1);
  solar.rotation.x = -0.55;
  group.add(solar);
  box(solar, [0.56, 0.035, 0.4], [0, 0, 0], materials.darkFrame);
  const panel = new THREE.MeshStandardMaterial({ color: '#1d3342', roughness: 0.18, metalness: 0.6, envMapIntensity: 1.4 });
  box(solar, [0.52, 0.04, 0.36], [0, 0.012, 0], panel);
  for (let i = -2; i <= 2; i++) box(solar, [0.008, 0.045, 0.36], [i * 0.1, 0.018, 0], materials.aluminium);
  for (let i = -1; i <= 1; i++) box(solar, [0.52, 0.045, 0.008], [0, 0.018, i * 0.11], materials.aluminium);
}

/* ------------------------------------------------------------------ *
 *  Background
 * ------------------------------------------------------------------ */

function hillHeight(x, z) {
  return -0.8
    + 7.5 * Math.exp(-((x + 18) ** 2) / 760 - ((z + 76) ** 2) / 520)
    + 10.5 * Math.exp(-((x - 26) ** 2) / 620 - ((z + 86) ** 2) / 600)
    + Math.sin(x * 0.16) * 1.2 + Math.cos(z * 0.19) * 0.9;
}

function hills(parent) {
  const rng = randomGenerator(2021);
  const geometry = new THREE.PlaneGeometry(210, 120, 96, 54);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - 72;
    const h = hillHeight(x, z);
    p.setXYZ(i, x, h, z);
    color.setHSL(0.24 + rng() * 0.025, 0.2 + rng() * 0.05, 0.05 + Math.max(0, h) * 0.0022 + rng() * 0.012);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const hill = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#7c8871', vertexColors: true, roughness: 1 }));
  hill.receiveShadow = true;
  parent.add(hill);

  const crownParts = [[-0.4, 0, 0, 0.75], [0.36, 0.1, 0.08, 0.85], [0, 0.46, -0.18, 0.7]].map(([x, y, z, size]) => {
    const part = new THREE.IcosahedronGeometry(size, 1);
    part.scale(1, 1.15, 1);
    part.translate(x, y, z);
    return part;
  });
  const crownGeo = mergeGeometries(crownParts);
  const crownMat = new THREE.MeshStandardMaterial({ color: '#4f6654', roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, 1100);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < 1100; i++) {
    const x = (rng() - 0.5) * 150, z = -20 - rng() * 80;
    const h = hillHeight(x, z);
    pos.set(x, h + 0.5, z);
    q.setFromEuler(new THREE.Euler(0, rng() * 6, 0));
    s.set(0.5 + rng() * 0.7, 0.6 + rng() * 0.8, 0.5 + rng() * 0.7);
    matrix.compose(pos, q, s);
    crowns.setMatrixAt(i, matrix);
    color.setHSL(0.23 + rng() * 0.04, 0.18 + rng() * 0.14, 0.05 + rng() * 0.04);
    crowns.setColorAt(i, color);
  }
  crowns.frustumCulled = false;
  parent.add(crowns);
}

function distantRoof(parent, materials) {
  const group = new THREE.Group();
  group.position.set(17.5, 0, -6.5);
  group.rotation.y = -0.28;
  parent.add(group);
  box(group, [7.2, 2.6, 5], [0, 1.3, 0], materials.plaster);
  const roofMat = materials.tile.clone();
  roofMat.color.set('#8f9088');
  for (const side of [-1, 1]) {
    const slope = box(group, [7.9, 0.16, 3.1], [0, 3.35, side * 1.35], roofMat);
    slope.rotation.x = side * 0.42;
  }
  const ridge = cylinder(group, 0.14, 0.14, 7.9, [0, 4.0, 0], roofMat, 10);
  ridge.rotation.z = Math.PI / 2;
}

function powerLines(parent) {
  const material = new THREE.LineBasicMaterial({ color: '#3b4346', transparent: true, opacity: 0.34 });
  for (let wire = 0; wire < 3; wire++) {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = -46 + t * 92;
      const z = -14 + t * 20 + wire * 0.7;
      const y = 19 - wire * 0.9 - Math.sin(t * Math.PI) * 2.6;
      points.push(new THREE.Vector3(x, y, z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    parent.add(new THREE.Line(geometry, material));
  }
}


function hedge(parent, materials) {
  const rng = randomGenerator(770);
  const blobs = [];
  for (const x of [-13.6, 13.6]) {
    for (let z = -9.5; z < 13; z += 1.5 + rng() * 0.8) {
      blobs.push([x + (rng() - 0.5) * 1.1, 0.9 + rng() * 0.7, z, 1.1 + rng() * 0.8, 1.3 + rng() * 1.1]);
    }
  }
  for (let x = -13; x < 14; x += 1.5 + rng() * 0.7) {
    blobs.push([x, 0.9 + rng() * 0.7, -10.2 - rng() * 1.2, 1.1 + rng() * 0.9, 1.3 + rng() * 1.2]);
  }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: '#35512f', roughness: 1, envMapIntensity: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, blobs.length);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  blobs.forEach(([x, y, z, r, h], i) => {
    p.set(x, y, z);
    q.setFromEuler(new THREE.Euler(rng(), rng() * 6, rng()));
    s.set(r * 0.9, h * 0.62, r * 0.9);
    matrix.compose(p, q, s);
    mesh.setMatrixAt(i, matrix);
    c.setHSL(0.28 + rng() * 0.04, 0.22 + rng() * 0.1, 0.12 + rng() * 0.06);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
}

/* ------------------------------------------------------------------ *
 *  Assemble
 * ------------------------------------------------------------------ */

export function buildGarden(scene, materials) {
  const garden = new THREE.Group();
  garden.name = '庭院植被与山石';
  scene.add(garden);
  materials.leafTextures = createFoliageTextures();

  const lawnGeo = new THREE.PlaneGeometry(25, 23, 44, 40);
  const lawnUv = lawnGeo.attributes.uv;
  for (let i = 0; i < lawnUv.count; i++) lawnUv.setXY(i, lawnUv.getX(i) * 25 / 2.6, lawnUv.getY(i) * 23 / 2.6);
  const lawnColors = [];
  const lawnPos = lawnGeo.attributes.position;
  const lawnColor = new THREE.Color();
  for (let i = 0; i < lawnPos.count; i++) {
    const x = lawnPos.getX(i), y = lawnPos.getY(i);
    const patch = 0.5 + 0.26 * Math.sin(x * 0.42 + y * 0.27) + 0.16 * Math.sin(x * 1.13 - y * 0.76 + 2.1) + 0.1 * Math.sin(x * 2.4 + y * 1.9);
    const dry = Math.max(0, 0.5 + 0.5 * Math.sin(x * 0.21 + y * 0.37 + 1.3)) * 0.14;
    lawnColor.setRGB(0.82 + patch * 0.28 + dry, 0.86 + patch * 0.2 + dry * 0.7, 0.8 + patch * 0.16 + dry * 0.3);
    lawnColors.push(lawnColor.r, lawnColor.g, lawnColor.b);
  }
  lawnGeo.setAttribute('color', new THREE.Float32BufferAttribute(lawnColors, 3));
  const lawnMat = materials.grass.clone();
  lawnMat.vertexColors = true;
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.position.set(0, -0.045, 2.5);
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  lawn.name = '草坪';
  garden.add(lawn);

  // the ground keeps going beyond the fence so the world never ends in mid-air
  const outerTexture = materials.grass.map.clone();
  outerTexture.repeat.set(40, 32);
  outerTexture.needsUpdate = true;
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(130, 100),
    new THREE.MeshStandardMaterial({ map: outerTexture, color: '#6d6c50', roughness: 1, envMapIntensity: 0.3 }),
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(0, -0.075, -14);
  outerGround.receiveShadow = true;
  garden.add(outerGround);
  grassBlades(garden);
  fallenLeaves(garden, materials);
  slabPath(garden, materials);
  hills(garden);
  distantRoof(garden, materials);
  powerLines(garden);

  const bark = barkMaterial(materials);
  const leaf = materials.leafTextures.broad;
  const autumnLeaf = materials.leafTextures.maple;

  // bamboo backdrop beyond the fence
  bambooGrove(garden, materials, [-18.2, 0, -1.5], 58, 12, [5.4, 8.5]);
  bambooGrove(garden, materials, [15.4, 0, 0.5], 66, 24, [5.4, 9]);
  bambooGrove(garden, materials, [-3.5, 0, -12.5], 42, 31, [12, 3.4]);
  bambooGrove(garden, materials, [7.5, 0, -12.8], 30, 36, [7, 3.2]);

  // trees outside the fence — the dense autumn hillside
  const backdrop = [
    [-18.6, -5.0, 6.4, 2.3, 41], [-17.9, 3.2, 5.6, 2.0, 42], [-18.8, 10.5, 6.0, 2.2, 43],
    [16.2, -4.2, 6.0, 2.1, 44], [16.8, 4.0, 5.4, 1.9, 45], [16.2, 11.0, 5.6, 2.0, 46],
    [-9.5, -13.5, 7.2, 2.6, 47], [4.0, -14.5, 7.6, 2.7, 48], [12.0, -14.0, 6.8, 2.4, 49],
  ];
  backdrop.forEach(([x, z, height, crown, seed], i) => createTree(garden, {
    position: [x, 0, z], height, crown, seed, bark, leafMap: leaf, density: 0.8,
    palette: i % 3 === 0
      ? ['#4c5c33', '#5d6a3a', '#6f7439', '#837a3c']
      : ['#2d4229', '#3a5030', '#475c33', '#57653a'],
  }));

  // trees inside the garden, matching the photographs
  createTree(garden, {
    position: [-11.75, 0, 10.4], height: 5.6, crown: 1.5, seed: 80, bark, leafMap: autumnLeaf,
    palette: ['#a8802f', '#c39a3e', '#8d6a2c', '#6c6b30'], sparse: true, leaning: 0.5, density: 1.15, leafScale: 0.9,
  });
  createTree(garden, {
    position: [-11.1, 0, 11.6], height: 3.1, crown: 1.45, seed: 81, bark, leafMap: autumnLeaf,
    palette: ['#8a3f22', '#a8552a', '#b96a33', '#7b4024'], density: 0.95, leafScale: 0.92,
  });
  createTree(garden, {
    position: [10.6, 0, 1.2], height: 4.4, crown: 1.45, seed: 82, bark, leafMap: autumnLeaf,
    palette: ['#7a5c2a', '#94692f', '#5c5b2c', '#a67a35'], density: 1.05,
  });
  createTree(garden, {
    position: [10.4, 0, -3.6], height: 4.0, crown: 1.7, seed: 83, bark, leafMap: leaf,
    palette: ['#41562f', '#53663a', '#64703c'], density: 0.85,
  });
  createTree(garden, {
    position: [-8.8, 0, -4.4], height: 4.6, crown: 1.8, seed: 84, bark, leafMap: leaf,
    palette: ['#34492c', '#435a31', '#53653a'], density: 0.8,
  });

  cloudPine(garden, { position: [-10.7, 0, 4.0], seed: 90, scale: 1.06, leafMap: materials.leafTextures.narrow, materials });
  cloudPine(garden, { position: [10.5, 0, 9.4], seed: 91, scale: 1.12, leafMap: materials.leafTextures.narrow, materials });

  const shrubs = [
    [-10.9, 9.0, 0.72, '#2c402c'], [-9.9, 9.4, 0.62, '#3c472d'], [-10.9, 10.4, 0.6, '#283c2a'],
    [-10.9, 5.0, 0.6, '#3a3a2c'], [-11.0, 3.4, 0.55, '#31462e'], [10.9, 1.9, 0.7, '#2a3f2b'],
    [9.8, 1.6, 0.55, '#39472c'], [10.9, 6.6, 0.66, '#2c412d'], [9.9, 7.5, 0.55, '#3a482e'],
    [10.8, 10.6, 0.62, '#2d3f2b'], [8.9, 9.4, 0.44, '#3f512e'], [-8.9, 10.9, 0.6, '#30432c'],
    [-7.4, 2.0, 0.5, '#36492e'], [7.4, -4.6, 0.55, '#33472c'],
  ];
  shrubs.forEach(([x, z, r, color], i) => {
    shrub(garden, {
      position: [x, 0, z], radius: r, color, seed: 120 + i, leafMap: leaf,
      shape: i === 5 ? [1, 0.72, 1] : [1, 1, 1],
      density: i > 12 ? 1.1 : 1,
    });
    blobShadow(garden, [x, z], r * 1.25, r * 1.1, -0.024, 0.28);
  });

  for (const [x, z, r, ry] of [[8.9, 8.3, 0.46, 3], [9.6, 2.1, 0.36, 4], [-9.0, 6.1, 0.3, 2], [7.9, 9.0, 0.28, 5], [-10.7, 11.0, 0.38, 6], [8.4, -0.4, 0.34, 1]]) {
    const rock = sphere(garden, r, [x, r * 0.32, z], materials.stone, [1.4, 0.72, 1.02], 1);
    rock.rotation.y = ry;
    blobShadow(garden, [x, z], r * 1.5, r * 1.2, -0.02, 0.26);
  }

  // planted beds along the fence
  box(garden, [1.3, 0.05, 9.8], [11.05, -0.02, 3.8], materials.soil);
  box(garden, [1.0, 0.05, 8.0], [-11.1, -0.02, 1.0], materials.soil);
  const bedLeaf = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9 });
  const rng = randomGenerator(600);
  const bedCount = 170;
  const bedLeaves = new THREE.InstancedMesh(leafGeo, bedLeaf, bedCount);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < bedCount; i++) {
    const leftSide = i > 78;
    p.set(leftSide ? -11.1 + (rng() - 0.5) * 0.9 : 11.05 + (rng() - 0.5) * 1.1, 0.08 + rng() * 0.1, leftSide ? -2.8 + rng() * 7.6 : -0.9 + rng() * 9.4);
    q.setFromEuler(new THREE.Euler(-0.5 + rng(), rng() * 6.28, 0));
    const size = 0.1 + rng() * 0.09;
    s.set(size, size, size);
    matrix.compose(p, q, s);
    bedLeaves.setMatrixAt(i, matrix);
    c.setHSL(0.23 + rng() * 0.04, 0.3, 0.1 + rng() * 0.07);
    bedLeaves.setColorAt(i, c);
  }
  bedLeaves.castShadow = true;
  garden.add(bedLeaves);

  // taller canopy behind the house so the roof silhouette sits against trees
  [[-6.5, -11.5, 7.6, 2.9, 61], [1.0, -12.5, 8.4, 3.1, 62], [7.5, -11.8, 7.0, 2.7, 63]].forEach(([x, z, height, crown, seed]) => createTree(garden, {
    position: [x, 0, z], height, crown, seed, bark, leafMap: leaf, density: 0.75,
    palette: ['#33482b', '#42582f', '#50602f', '#6b6a32'],
  }));

  hedge(garden, materials);

  rabbits(garden, materials);

  // soft ground darkening under the two big garden trees
  blobShadow(garden, [-11.75, 10.4], 2.6, 2.6, -0.026, 0.24);
  blobShadow(garden, [10.6, 1.2], 2.1, 2.1, -0.026, 0.24);
  blobShadow(garden, [-11.1, 11.6], 1.7, 1.7, -0.026, 0.22);
  return garden;
}
