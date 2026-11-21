import * as THREE from 'three';
import { box, cylinder, sphere, barBetween, beamBetween, tube, blobShadow } from './helpers.js';
import { randomGenerator } from './textures.js';

function wickerChair(materials) {
  const chair = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({ map: materials.fabric.map, color: '#4a4b41', roughness: 0.97 });
  cylinder(chair, 0.49, 0.46, 0.12, [0, 0.52, 0], seatMat, 32);
  for (const x of [-0.34, 0.34]) for (const z of [-0.3, 0.3]) {
    beamBetween(chair, [x * 1.22, 0.03, z * 1.25], [x, 0.53, z], 0.052, 0.052, materials.blackMetal);
  }
  for (let i = 0; i <= 36; i++) {
    const angle = i / 36 * Math.PI;
    const x0 = Math.cos(angle) * 0.48, z0 = -Math.sin(angle) * 0.48;
    const x1 = Math.cos(angle) * 0.59, z1 = -Math.sin(angle) * 0.59;
    barBetween(chair, [x0, 0.51, z0], [x1, 1.32, z1], 0.0145, materials.wicker, 6);
  }
  for (const y of [0.61, 0.96, 1.29]) {
    const radius = THREE.MathUtils.lerp(0.49, 0.59, (y - 0.51) / 0.81);
    const points = [];
    for (let i = 0; i <= 36; i++) {
      const angle = i / 36 * Math.PI;
      points.push([Math.cos(angle) * radius, y, -Math.sin(angle) * radius]);
    }
    tube(chair, points, y === 1.29 ? 0.032 : 0.022, materials.wicker);
  }
  return chair;
}

function slattedTable(materials, width = 2.35, depth = 1.0, height = 0.62, dark = false) {
  const table = new THREE.Group();
  const mat = dark ? materials.darkWood : materials.wood;
  const count = Math.round(depth / 0.1);
  for (let i = 0; i < count; i++) {
    box(table, [width, 0.055, depth / count - 0.013], [0, height, -depth / 2 + (i + 0.5) * depth / count], mat);
  }
  for (const x of [-width * 0.38, width * 0.38]) {
    beamBetween(table, [x, 0.02, -depth * 0.42], [x, height - 0.03, depth * 0.35], 0.04, 0.04, materials.blackMetal);
    beamBetween(table, [x, 0.02, depth * 0.42], [x, height - 0.03, -depth * 0.35], 0.04, 0.04, materials.blackMetal);
    box(table, [0.055, 0.055, depth * 0.86], [x, height * 0.45, 0], materials.blackMetal);
  }
  return table;
}

function foldingChair(materials) {
  const chair = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#9a8056', roughness: 0.67, metalness: 0.16 });
  for (const x of [-0.38, 0.38]) {
    barBetween(chair, [x, 0.03, 0.47], [x, 1.29, -0.48], 0.025, frameMat, 10);
    barBetween(chair, [x, 0.03, -0.48], [x, 0.69, 0.43], 0.025, frameMat, 10);
    barBetween(chair, [x, 0.82, -0.35], [x, 0.82, 0.39], 0.027, frameMat, 10);
    barBetween(chair, [x, 0.55, 0.3], [x, 0.84, 0.3], 0.018, frameMat, 8);
    cylinder(chair, 0.045, 0.045, 0.025, [x, 0.54, 0], materials.aluminium, 12).rotation.z = Math.PI / 2;
  }
  barBetween(chair, [-0.38, 0.07, 0.45], [0.38, 0.07, 0.45], 0.022, frameMat);
  barBetween(chair, [-0.38, 0.07, -0.45], [0.38, 0.07, -0.45], 0.022, frameMat);

  const seatGeo = new THREE.PlaneGeometry(0.71, 0.72, 12, 12);
  const pos = seatGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -0.07 * (1 - (x / 0.36) ** 2) * (1 - (y / 0.37) ** 2));
  }
  seatGeo.computeVertexNormals();
  const seat = new THREE.Mesh(seatGeo, materials.fabric);
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 0.64, 0.03);
  seat.castShadow = true;
  chair.add(seat);

  const backGeo = new THREE.PlaneGeometry(0.71, 0.72, 12, 12);
  const bp = backGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i);
    bp.setZ(i, -0.055 * (1 - (x / 0.36) ** 2) + Math.sin(y * 5) * 0.01);
  }
  backGeo.computeVertexNormals();
  const back = new THREE.Mesh(backGeo, materials.fabric);
  back.position.set(0, 1.0, -0.37);
  back.rotation.x = -0.32;
  back.castShadow = true;
  chair.add(back);
  return chair;
}

function firePit(materials) {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({
    map: materials.concrete.map, normalMap: materials.concrete.normalMap,
    roughnessMap: materials.concrete.roughnessMap, color: '#8d8f87', roughness: 1,
  });
  const points = [
    new THREE.Vector2(0.22, 0), new THREE.Vector2(0.37, 0.06), new THREE.Vector2(0.48, 0.25),
    new THREE.Vector2(0.54, 0.48), new THREE.Vector2(0.54, 0.53), new THREE.Vector2(0.48, 0.54),
    new THREE.Vector2(0.44, 0.29), new THREE.Vector2(0.32, 0.14), new THREE.Vector2(0.1, 0.1),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(points, 40), concrete);
  bowl.castShadow = bowl.receiveShadow = true;
  group.add(bowl);
  const charcoal = new THREE.MeshStandardMaterial({ color: '#1b1c18', roughness: 1 });
  const rng = randomGenerator(773);
  for (let i = 0; i < 15; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.34;
    const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + rng() * 0.05, 0), charcoal);
    coal.position.set(Math.cos(a) * r, 0.25 + rng() * 0.06, Math.sin(a) * r);
    coal.scale.y = 0.6;
    group.add(coal);
  }
  const grill = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.018, 8, 48), materials.blackMetal);
  grill.rotation.x = Math.PI / 2;
  grill.position.y = 0.55;
  group.add(grill);
  for (let i = -7; i <= 7; i++) {
    const z = i * 0.06;
    const half = Math.sqrt(Math.max(0, 0.47 ** 2 - z ** 2));
    barBetween(group, [-half, 0.55, z], [half, 0.55, z], 0.007, materials.blackMetal, 5);
  }
  for (const side of [-1, 1]) box(group, [0.15, 0.075, 0.06], [side * 0.52, 0.34, 0], materials.blackMetal);
  return group;
}

function washingMachine(materials) {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#a9aaa4', roughness: 0.37, metalness: 0.55 });
  box(group, [0.88, 1.18, 0.77], [0, 0.59, 0], body);
  box(group, [0.82, 0.2, 0.04], [0, 1.05, 0.405], materials.aluminium);
  box(group, [0.24, 0.11, 0.025], [-0.23, 1.06, 0.435], materials.darkFrame);
  cylinder(group, 0.045, 0.045, 0.025, [0.22, 1.06, 0.44], materials.blackMetal, 16).rotation.x = Math.PI / 2;
  const drum = cylinder(group, 0.29, 0.29, 0.07, [0, 0.57, 0.42], materials.blackGlass, 40);
  drum.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.055, 12, 48), materials.aluminium);
  ring.position.set(0, 0.57, 0.47);
  group.add(ring);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.017, 8, 40), materials.darkFrame);
  innerRing.position.set(0, 0.57, 0.48);
  group.add(innerRing);
  const purple = new THREE.MeshStandardMaterial({ color: '#756276', roughness: 0.96, side: THREE.DoubleSide });
  box(group, [0.96, 0.055, 0.84], [0, 1.205, -0.01], purple);
  const drape = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.42, 12, 6), purple);
  const p = drape.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 19) * 0.025);
  drape.position.set(0.49, 1.02, -0.02);
  drape.rotation.y = Math.PI / 2;
  group.add(drape);
  return group;
}

function teaSet(parent, materials, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  const ceramic = new THREE.MeshStandardMaterial({ color: '#d7d0b9', roughness: 0.32, metalness: 0.02 });
  sphere(group, 0.12, [0, 0.12, 0], ceramic, [1, 0.8, 1], 2);
  cylinder(group, 0.065, 0.085, 0.035, [0, 0.215, 0], ceramic, 20);
  sphere(group, 0.028, [0, 0.25, 0], ceramic, [1, 1, 1], 1);
  const spout = cylinder(group, 0.035, 0.055, 0.19, [0.14, 0.16, 0], ceramic, 16);
  spout.rotation.z = -0.8;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 8, 24, Math.PI * 1.55), ceramic);
  handle.position.set(-0.11, 0.13, 0);
  handle.rotation.z = Math.PI * 0.72;
  group.add(handle);
  for (const [x, z] of [[0.28, 0.13], [-0.22, 0.22], [0.15, -0.24]]) {
    cylinder(group, 0.055, 0.045, 0.075, [x, 0.04, z], ceramic, 20);
    cylinder(group, 0.047, 0.047, 0.006, [x, 0.08, z], new THREE.MeshStandardMaterial({ color: '#59452b', roughness: 0.2 }), 20);
  }
}

function cardboardBox(parent, materials, position, scale = 1) {
  const cardboard = new THREE.MeshStandardMaterial({ color: '#a98b56', roughness: 1 });
  const tape = new THREE.MeshStandardMaterial({ color: '#c3af7c', roughness: 0.9 });
  const group = new THREE.Group();
  group.position.set(...position);
  group.scale.setScalar(scale);
  parent.add(group);
  box(group, [0.55, 0.4, 0.45], [0, 0.2, 0], cardboard);
  box(group, [0.07, 0.008, 0.46], [0, 0.405, 0], tape);
  box(group, [0.07, 0.4, 0.008], [0, 0.2, 0.23], tape);
  return group;
}

function smallDog(parent, materials) {
  const group = new THREE.Group();
  group.position.set(-0.65, 0.02, 3.62);
  group.rotation.y = -0.4;
  parent.add(group);
  const fur = new THREE.MeshStandardMaterial({ color: '#242720', roughness: 1 });
  sphere(group, 0.19, [0, 0.28, 0], fur, [0.8, 1.15, 1.25], 1);
  sphere(group, 0.14, [0, 0.52, 0.09], fur, [0.9, 1, 0.9], 1);
  for (const x of [-0.09, 0.09]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 5), fur);
    ear.position.set(x, 0.66, 0.07);
    ear.rotation.z = x * 2;
    group.add(ear);
    barBetween(group, [x, 0.03, 0.11], [x, 0.26, 0.08], 0.035, fur);
    barBetween(group, [x, 0.03, -0.12], [x, 0.25, -0.1], 0.035, fur);
  }
  sphere(group, 0.027, [0, 0.51, 0.22], materials.blackGlass, [1, 0.8, 1], 1);
  tube(group, [[0, 0.3, -0.15], [0.03, 0.42, -0.32], [0.09, 0.51, -0.35]], 0.026, fur);
}

export function buildFurniture(scene, materials) {
  const group = new THREE.Group();
  group.name = '户外家具与器物';
  scene.add(group);
  const deck = new THREE.Group();
  deck.name = '户外木平台';
  deck.position.set(4.15, 0.055, 5.65);
  group.add(deck);
  const deckWidth = 7.4, deckDepth = 4.15;
  for (let i = 0; i < 38; i++) {
    const plank = box(deck, [deckWidth / 38 - 0.012, 0.065, deckDepth], [-deckWidth / 2 + (i + 0.5) * deckWidth / 38, 0, 0], materials.deck);
    const uv = plank.geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) + i * 0.37);
    plank.position.y = (i % 3) * 0.002;
  }
  for (const z of [-deckDepth / 2, deckDepth / 2]) box(deck, [deckWidth + 0.08, 0.09, 0.07], [0, -0.01, z], materials.darkWood);
  for (const x of [-deckWidth / 2, deckWidth / 2]) box(deck, [0.07, 0.09, deckDepth], [x, -0.01, 0], materials.darkWood);

  const table = slattedTable(materials);
  table.position.set(2.8, 0.09, 5.65);
  group.add(table);
  teaSet(table, materials, [-0.25, 0.66, 0]);
  const tissue = new THREE.MeshStandardMaterial({ color: '#d5c8a5', roughness: 0.9 });
  box(table, [0.29, 0.15, 0.19], [0.62, 0.74, -0.12], tissue);

  const chairData = [
    [1.15, 5.65, -Math.PI / 2], [4.42, 5.68, Math.PI / 2],
    [2.72, 4.36, Math.PI], [2.75, 6.97, 0],
  ];
  for (const [x, z, rotation] of chairData) {
    const chair = wickerChair(materials);
    chair.position.set(x, 0.09, z);
    chair.rotation.y = rotation;
    group.add(chair);
  }

  const fire = firePit(materials);
  fire.position.set(5.43, 0.12, 4.63);
  group.add(fire);
  blobShadow(group, [5.43, 4.63], 0.72, 0.66, 0.105, 0.42);
  const foldingData = [[5.43, 6.18, -2.62], [6.65, 6.08, -2.85]];
  for (const [x, z, rotation] of foldingData) {
    const chair = foldingChair(materials);
    chair.position.set(x, 0.09, z);
    chair.rotation.y = rotation;
    group.add(chair);
    blobShadow(group, [x, z], 0.6, 0.55, 0.1, 0.34);
  }

  for (const [x, z, rx, rz] of [[1.15, 5.65, 0.62, 0.6], [4.42, 5.68, 0.62, 0.6], [2.72, 4.36, 0.62, 0.6], [2.75, 6.97, 0.62, 0.6], [2.8, 5.65, 1.15, 0.5]]) {
    blobShadow(group, [x, z], rx, rz, 0.1, 0.3);
  }

  const highTable = slattedTable(materials, 2.55, 1.03, 1.08, true);
  highTable.position.set(6.95, 0.09, 4.15);
  group.add(highTable);
  // Replace the low table's crossed legs with the photograph's square steel frame.
  highTable.children.slice(10).forEach(child => { child.visible = false; });
  for (const x of [-1.18, 1.18]) for (const z of [-0.43, 0.43]) box(highTable, [0.055, 1.08, 0.055], [x, 0.54, z], materials.blackMetal);
  cardboardBox(highTable, materials, [0.38, 1.12, 0], 0.85);
  const redCrate = new THREE.MeshStandardMaterial({ color: '#6d261f', roughness: 0.88 });
  box(group, [0.55, 0.55, 0.46], [6.7, 0.36, 4.57], redCrate);
  for (let i = 0; i < 4; i++) box(group, [0.36, 0.025, 0.015], [6.7, 0.22 + i * 0.09, 4.81], materials.darkWood);

  const washer = washingMachine(materials);
  washer.position.set(5.55, 0.38, 1.25);
  group.add(washer);
  blobShadow(group, [5.55, 1.25], 0.62, 0.56, 0.018, 0.4);
  blobShadow(group, [6.95, 4.15], 1.35, 0.62, 0.1, 0.28);
  cardboardBox(group, materials, [1.0, 0.38, 1.65], 0.9);
  cardboardBox(group, materials, [6.6, 0.02, 7.8], 0.8);

  const sack = new THREE.MeshStandardMaterial({ color: '#ddd9c9', roughness: 1 });
  sphere(group, 0.32, [-2.18, 0.54, 1.2], sack, [1.1, 0.8, 0.75], 1);
  sphere(group, 0.26, [-2.48, 0.49, 1.45], sack, [1.2, 0.65, 0.85], 1);
  const bagMat = new THREE.MeshStandardMaterial({ color: '#1d211e', roughness: 0.94 });
  sphere(group, 0.38, [0.48, 0.12, 4.25], bagMat, [2.5, 0.25, 0.8], 1);
  sphere(group, 0.32, [8.55, 0.13, 6.7], bagMat, [1.7, 0.3, 1.0], 1);

  // Low timber stool and stacked firewood beside the tea table.
  box(group, [0.56, 0.08, 0.36], [0.75, 0.48, 3.73], materials.wood);
  for (const x of [0.54, 0.96]) for (const z of [3.6, 3.86]) box(group, [0.06, 0.43, 0.06], [x, 0.24, z], materials.wood);
  const logMat = new THREE.MeshStandardMaterial({ color: '#4b3927', roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const log = cylinder(group, 0.045, 0.055, 0.55, [3.6 + (i % 4) * 0.12, 0.19 + Math.floor(i / 4) * 0.1, 4.15], logMat, 7);
    log.rotation.x = Math.PI / 2;
  }
  smallDog(group, materials);
  return { group, table, fire };
}
