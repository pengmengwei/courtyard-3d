import * as THREE from 'three';
import { box, cylinder, barBetween, beamBetween, sphere, blobShadow } from './helpers.js';
import { randomGenerator } from './textures.js';

/* ------------------------------------------------------------------ *
 *  Roof
 * ------------------------------------------------------------------ */

function tileGeometry() {
  const positions = [], indices = [], uvs = [];
  const segments = 10;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // a shallow clay channel, slightly flared at the lower lip
      const profile = Math.sin(t * Math.PI) * 0.078 + (row === 0 ? -0.016 : 0);
      positions.push((t - 0.5) * 0.245, profile, row - 0.5);
      uvs.push(t, row);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i, b = i + 1, c = i + segments + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tiledSlope(parent, { width, z0, z1, y0, y1, x = 0, material }) {
  const rng = randomGenerator(Math.round((z0 + 20) * 100 + width));
  const run = Math.abs(z1 - z0), rise = y1 - y0;
  const rows = Math.max(2, Math.ceil(run / 0.42));
  const columns = Math.floor(width / 0.25);
  const slopeLength = Math.hypot(run, rise);
  const direction = Math.sign(z1 - z0);
  const angle = Math.atan2(-rise * direction, run);

  const tiles = new THREE.InstancedMesh(tileGeometry(), material, rows * columns);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle * direction, 0, 0));
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  let index = 0;
  for (let row = 0; row < rows; row++) {
    const t = (row + 0.5) / rows;
    for (let col = 0; col < columns; col++) {
      position.set(
        x + (col - (columns - 1) / 2) * 0.25,
        THREE.MathUtils.lerp(y0, y1, t) + 0.055 + rng() * 0.006,
        THREE.MathUtils.lerp(z0, z1, t),
      );
      scale.set(0.95 + rng() * 0.08, 0.82 + rng() * 0.28, slopeLength / rows * 1.16);
      matrix.compose(position, quaternion, scale);
      tiles.setMatrixAt(index, matrix);
      const v = 0.66 + rng() * 0.5;
      const moss = rng() > 0.88 ? 0.04 : 0;
      color.setRGB(v, v * 1.005 + moss, v * 0.97 + moss * 0.5);
      tiles.setColorAt(index++, color);
    }
  }
  tiles.castShadow = tiles.receiveShadow = true;
  parent.add(tiles);

  // solid bed beneath the channels so the roof reads as mass, not open ribs
  const underlay = box(parent, [width + 0.1, 0.085, slopeLength + 0.05], [x, (y0 + y1) / 2 - 0.04, (z0 + z1) / 2], material);
  underlay.rotation.x = angle * direction;

  eaveCaps(parent, material, { width, y: y1, z: z1, direction, count: columns });
  return tiles;
}

function eaveCaps(parent, material, { width, y, z, direction, count, size = 0.25 }) {
  if (count < 2) return;
  const rng = randomGenerator(Number((z * 1000 + width * 10).toFixed(0)) + 17);
  const discGeometry = new THREE.CylinderGeometry(0.148, 0.148, 0.055, 16);
  const discs = new THREE.InstancedMesh(discGeometry, material, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const position = new THREE.Vector3(), color = new THREE.Color();
  for (let col = 0; col < count; col++) {
    position.set((col - (count - 1) / 2) * size, y - 0.022, z + direction * 0.055);
    matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
    discs.setMatrixAt(col, matrix);
    color.setHSL(0.1, 0.02, 0.32 + rng() * 0.06);
    discs.setColorAt(col, color);
  }
  discs.castShadow = true;
  discs.receiveShadow = true;
  parent.add(discs);

  // drip tiles below each cap
  const drip = new THREE.InstancedMesh(new THREE.ConeGeometry(0.115, 0.19, 3), material, count);
  const dripQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI));
  for (let col = 0; col < count; col++) {
    position.set((col - (count - 1) / 2) * size, y - 0.075, z + direction * 0.075);
    matrix.compose(position, dripQ, new THREE.Vector3(1, 1, 1));
    drip.setMatrixAt(col, matrix);
  }
  drip.castShadow = true;
  parent.add(drip);
}

function addRoof(parent, materials) {
  // upper hipped roof
  tiledSlope(parent, { width: 12.1, z0: -3.5, z1: 0.35, y0: 6.9, y1: 5.02, material: materials.tile });
  tiledSlope(parent, { width: 12.1, z0: -3.5, z1: -7.35, y0: 6.9, y1: 5.02, material: materials.tile });
  // deep veranda eave
  tiledSlope(parent, { width: 14.65, z0: 0.05, z1: 2.85, y0: 4.78, y1: 3.96, material: materials.tile });
  tiledSlope(parent, { width: 14.2, z0: -6.6, z1: -7.55, y0: 4.55, y1: 4.12, material: materials.tile });

  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      side * 5.95, 6.85, -3.5,
      side * 7.35, 5.0, 0.35,
      side * 7.35, 5.0, -7.35,
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    const hipMaterial = materials.tile.clone();
    hipMaterial.side = THREE.DoubleSide;
    const hip = new THREE.Mesh(geometry, hipMaterial);
    hip.castShadow = hip.receiveShadow = true;
    parent.add(hip);
    // hip rolls
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const z = THREE.MathUtils.lerp(-7.35, 0.35, t);
      barBetween(parent, [side * 5.98, 6.84, -3.5], [side * 7.32, 5.03, z], 0.042, materials.tile, 7);
    }
  }

  // ridge
  const ridge = cylinder(parent, 0.19, 0.19, 12.3, [0, 7.0, -3.5], materials.tileCap, 14);
  ridge.rotation.z = Math.PI / 2;
  box(parent, [0.26, 0.46, 0.46], [0, 7.17, -3.5], materials.tileCap);
  for (const side of [-1, 1]) {
    const end = box(parent, [0.2, 0.44, 0.42], [side * 6.06, 7.14, -3.5], materials.tileCap);
    end.rotation.z = side * 0.22;
    // upturned eave corners
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), materials.tileCap);
    tip.position.set(side * 7.3, 5.12, 0.34);
    tip.rotation.z = side * -0.9;
    tip.castShadow = true;
    parent.add(tip);
  }

  // rafter tails and a dark water-table make the deep eave read as built timber
  for (let i = 0; i < 25; i++) {
    const x = -7.1 + i * 0.59;
    const rafter = box(parent, [0.07, 0.1, 0.62], [x, 3.94, 2.62], materials.darkWood);
    rafter.rotation.x = -0.12;
  }
  box(parent, [14.9, 0.1, 0.24], [0, 3.88, 2.83], materials.darkWood);
  box(parent, [14.75, 0.18, 0.1], [0, 3.99, 2.9], materials.tileCap);
  box(parent, [12.4, 0.18, 0.22], [0, 4.92, 0.33], materials.darkWood);
  // white band between the two roofs
  box(parent, [12.35, 0.2, 0.34], [0, 5.06, 0.32], materials.plaster);
  box(parent, [12.6, 0.1, 0.16], [0, 5.17, 0.33], materials.tileCap);
}

/* ------------------------------------------------------------------ *
 *  Facade
 * ------------------------------------------------------------------ */

function addWindow(parent, materials, { x, width, height, centerY = 2.13, curtain = false, windowGlows }) {
  const group = new THREE.Group();
  group.position.set(x, centerY, 0.13);
  parent.add(group);

  // recess and dark interior
  box(group, [width + 0.22, height + 0.22, 0.1], [0, 0, -0.035], materials.darkFrame);
  const interior = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.16, height - 0.16),
    materials.windowGlow,
  );
  interior.position.set(0, 0, 0.015);
  group.add(interior);
  windowGlows.push(materials.windowGlow);

  // glass
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, height - 0.12), materials.glass);
  glass.position.z = 0.1;
  glass.material = materials.glass;
  group.add(glass);

  // frame + muntins
  const frame = 0.07;
  for (const px of [-width / 2, width / 2]) box(group, [frame, height, 0.13], [px, 0, 0.09], materials.darkFrame);
  for (const py of [-height / 2, height / 2]) box(group, [width + frame, frame, 0.13], [0, py, 0.09], materials.darkFrame);
  const panes = width > 2.8 ? 4 : 3;
  for (let i = 1; i < panes; i++) box(group, [0.045, height - 0.1, 0.12], [-width / 2 + width * i / panes, 0, 0.1], materials.darkFrame);
  box(group, [width - 0.08, 0.065, 0.11], [0, -height * 0.08, 0.1], materials.darkFrame);

  if (!curtain) {
    for (let pane = 0; pane < panes; pane++) {
      const cx = -width / 2 + width * (pane + 0.5) / panes;
      const pw = width / panes;
      for (const side of [-1, 1]) {
        const cy = side * height * 0.3;
        box(group, [pw * 0.72, 0.03, 0.055], [cx, cy, 0.15], materials.darkFrame);
        for (const sx of [-1, 1]) box(group, [0.03, 0.26, 0.055], [cx + sx * pw * 0.22, cy - 0.13, 0.15], materials.darkFrame);
        // small lattice diamonds
        for (const sx of [-1, 1]) {
          const bar = box(group, [0.02, 0.15, 0.05], [cx + sx * pw * 0.12, cy + height * 0.11, 0.15], materials.darkFrame);
          bar.rotation.z = sx * 0.7;
        }
      }
    }
  } else {
    // sheer curtain with soft folds
    const geometry = new THREE.PlaneGeometry(width * 0.8, height * 0.94, 64, 1);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      p.setZ(i, Math.sin(px * 9) * 0.05 + Math.sin(px * 3.7) * 0.028 + 0.02);
    }
    geometry.computeVertexNormals();
    const cloth = new THREE.Mesh(geometry, materials.sheer);
    cloth.position.set(0.02, 0, 0.05);
    group.add(cloth);
    // curtain rod
    const rod = cylinder(group, 0.022, 0.022, width * 0.94, [0, height * 0.47, 0.22], materials.darkFrame, 10);
    rod.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) sphere(group, 0.04, [sx * width * 0.47, height * 0.47, 0.22], materials.darkFrame, [1, 1, 1], 1);
  }

  // sill
  box(group, [width + 0.24, 0.07, 0.34], [0, -height / 2 - 0.05, 0.16], materials.darkWood);
}

function addDoor(parent, materials, centerX) {
  box(parent, [2.55, 3.2, 0.12], [centerX, 1.96, 0.11], materials.darkFrame);
  box(parent, [2.3, 3.0, 0.08], [centerX, 1.96, 0.16], new THREE.MeshStandardMaterial({ color: '#1a1712', roughness: 1 }));
  // warm interior visible through the open doors
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.9), materials.windowGlow);
  glow.position.set(centerX, 1.94, 0.175);
  parent.add(glow);
  box(parent, [1.08, 0.055, 2.1], [centerX, 0.44, -0.72], materials.darkWood);
  box(parent, [2.7, 0.12, 0.55], [centerX, 0.47, 0.3], materials.darkStone);

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(centerX + side * 1.15, 0.46, 0.29);
    pivot.rotation.y = side * 0.94;
    parent.add(pivot);
    const direction = -side;
    const cx = direction * 0.55;
    box(pivot, [1.1, 0.095, 0.085], [cx, 0.05, 0], materials.darkFrame);
    box(pivot, [1.1, 0.095, 0.085], [cx, 3.0, 0], materials.darkFrame);
    box(pivot, [0.085, 3.05, 0.085], [0, 1.5, 0], materials.darkFrame);
    box(pivot, [0.085, 3.05, 0.085], [direction * 1.1, 1.5, 0], materials.darkFrame);
    box(pivot, [0.9, 0.8, 0.05], [cx, 0.52, 0], materials.darkWood);
    box(pivot, [0.9, 1.88, 0.03], [cx, 1.92, 0], materials.blackGlass);
    for (const y of [1.0, 1.46, 2.36, 2.84]) box(pivot, [0.93, 0.03, 0.055], [cx, y, 0.035], materials.darkFrame);
    for (const dx of [-0.3, 0, 0.3]) box(pivot, [0.03, 1.85, 0.055], [cx + dx, 1.92, 0.035], materials.darkFrame);
    const handle = cylinder(pivot, 0.017, 0.017, 0.36, [direction * 0.93, 1.44, 0.1], materials.aluminium, 8);
    handle.rotation.x = Math.PI / 2;
    handle.castShadow = true;
  }
}

function addLantern(parent, materials, x, z, lanterns, lights) {
  const group = new THREE.Group();
  group.position.set(x, 3.42, z);
  parent.add(group);
  barBetween(group, [0, 0.56, 0], [0, 0.28, 0], 0.014, materials.blackMetal);
  const glow = new THREE.MeshStandardMaterial({
    color: '#c6ab74', roughness: 0.62, emissive: '#ffbf72', emissiveIntensity: 0.05, envMapIntensity: 0.5,
  });
  lanterns.push(glow);
  box(group, [0.24, 0.4, 0.2], [0, 0.04, 0], glow);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(group, [0.024, 0.44, 0.024], [sx * 0.125, 0.04, sz * 0.105], materials.darkWood);
  box(group, [0.3, 0.035, 0.25], [0, 0.28, 0], materials.darkWood);
  box(group, [0.28, 0.035, 0.24], [0, -0.19, 0], materials.darkWood);
  const tasselMat = new THREE.MeshStandardMaterial({ color: '#7d3b2c', roughness: 0.9 });
  barBetween(group, [0, -0.21, 0], [0, -0.48, 0], 0.011, tasselMat);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.23, 8), tasselMat);
  tassel.position.y = -0.56;
  group.add(tassel);
  const light = new THREE.PointLight('#ffca85', 0, 5.5, 2);
  light.position.set(x, 3.2, z + 0.42);
  parent.add(light);
  lights.push(light);
}

function addPorchDetails(parent, materials) {
  // drying rail
  for (const x of [1.3, 2.85]) barBetween(parent, [x, 0.5, 0.72], [x, 1.55, 0.72], 0.024, materials.blackMetal);
  for (const y of [0.78, 1.5]) barBetween(parent, [1.3, y, 0.72], [2.85, y, 0.72], 0.023, materials.blackMetal);

  // aluminium step ladder
  const ladder = new THREE.Group();
  ladder.position.set(2.05, 0.43, 1.12);
  ladder.rotation.x = -0.12;
  parent.add(ladder);
  for (const x of [-0.29, 0.29]) {
    beamBetween(ladder, [x, 0, 0.3], [x, 2.28, 0], 0.05, 0.04, materials.aluminium);
    beamBetween(ladder, [x, 0, -0.58], [x, 2.28, 0], 0.042, 0.038, materials.aluminium);
  }
  for (let i = 0; i < 8; i++) box(ladder, [0.58, 0.035, 0.115], [0, 0.21 + i * 0.27, 0.26 - i * 0.035], materials.aluminium);

  // security cameras under the eave
  for (const x of [-6.5, 6.5]) {
    const camera = cylinder(parent, 0.06, 0.06, 0.16, [x, 3.67, 2.42], materials.whitePaint, 12);
    camera.rotation.x = Math.PI / 2;
    sphere(parent, 0.058, [x, 3.67, 2.52], materials.blackGlass, [1, 1, 0.55], 1);
  }

  // rain downpipe on the right corner
  const pipe = cylinder(parent, 0.055, 0.055, 3.6, [6.72, 1.95, 0.36], materials.whitePaint, 10);
  pipe.castShadow = true;
  cylinder(parent, 0.085, 0.085, 0.12, [6.72, 3.78, 0.36], materials.whitePaint, 10);

  // broom leaning against the wall
  const broom = new THREE.Group();
  broom.position.set(-2.35, 0.42, 1.25);
  broom.rotation.z = -0.16;
  parent.add(broom);
  cylinder(broom, 0.018, 0.022, 1.25, [0, 0.66, 0], materials.wood, 8);
  const bristles = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.3, 12), materials.thatch);
  bristles.position.y = 0.12;
  bristles.castShadow = true;
  broom.add(bristles);
}

/* ------------------------------------------------------------------ *
 *  Main house
 * ------------------------------------------------------------------ */

export function buildArchitecture(scene, materials) {
  const house = new THREE.Group();
  house.name = '山居建筑';
  scene.add(house);

  box(house, [13.1, 4.7, 6.4], [0, 2.52, -3.2], materials.plaster, '白墙主体');
  box(house, [13.35, 0.78, 6.62], [0, 0.47, -3.21], materials.brick, '青砖墙基');
  box(house, [13.8, 0.28, 3.05], [0, 0.24, 1.25], materials.darkStone, '门廊石台');
  // poured-slab joints across the veranda floor
  for (let i = 0; i < 9; i++) box(house, [0.018, 0.006, 3.0], [-6.4 + i * 1.6, 0.385, 1.25], materials.darkStone);
  box(house, [13.4, 0.006, 0.018], [0, 0.385, 1.55], materials.darkStone);
  box(house, [13.95, 0.1, 0.42], [0, 0.12, 2.92], materials.stone);
  box(house, [4.1, 0.1, 0.5], [-0.55, 0.03, 3.28], materials.darkStone);
  addRoof(house, materials);

  const windowGlows = [];
  addWindow(house, materials, { x: -4.65, width: 3.15, height: 2.6, curtain: true, windowGlows });
  addWindow(house, materials, { x: 4.15, width: 2.85, height: 2.6, windowGlows });
  addDoor(house, materials, -0.55);

  // veranda columns
  for (const x of [-6.35, -2.72, 1.52, 6.35]) {
    cylinder(house, 0.155, 0.185, 3.5, [x, 2.14, 2.2], materials.whitePaint, 28);
    cylinder(house, 0.24, 0.28, 0.18, [x, 0.43, 2.2], materials.stone, 22);
    cylinder(house, 0.2, 0.17, 0.12, [x, 3.88, 2.2], materials.whitePaint, 20);
    blobShadow(house, [x, 2.2], 0.34, 0.34, 0.255, 0.32);
  }
  box(house, [13.5, 0.18, 0.22], [0, 3.8, 2.16], materials.darkWood);

  const lanterns = [], lanternLights = [];
  for (const x of [-1.84, 0.67, 2.55, 5.35]) addLantern(house, materials, x, 0.72, lanterns, lanternLights);
  addPorchDetails(house, materials);

  // side windows so free-orbit views stay believable
  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Group();
    sideWindow.position.set(side * 6.58, 2.3, -3.1);
    sideWindow.rotation.y = side * Math.PI / 2;
    house.add(sideWindow);
    box(sideWindow, [2.1, 1.72, 0.09], [0, 0, 0], materials.darkFrame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.58), materials.windowGlow);
    glow.position.z = 0.05;
    sideWindow.add(glow);
    windowGlows.push(materials.windowGlow);
    box(sideWindow, [0.06, 1.6, 0.12], [0, 0, 0.08], materials.darkFrame);
    box(sideWindow, [1.98, 0.06, 0.12], [0, 0, 0.08], materials.darkFrame);
    box(sideWindow, [2.24, 0.07, 0.3], [0, -0.9, 0.1], materials.darkWood);
  }

  // air-conditioner condenser tucked behind the right column
  const ac = new THREE.Group();
  ac.position.set(5.5, 0.42, 0.95);
  house.add(ac);
  box(ac, [0.76, 0.56, 0.3], [0, 0, 0], new THREE.MeshStandardMaterial({ color: '#b9bab2', roughness: 0.55, metalness: 0.3 }));
  const fan = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 28), materials.blackMetal);
  fan.position.set(-0.08, 0, 0.16);
  ac.add(fan);
  for (let i = 0; i < 7; i++) box(ac, [0.36, 0.012, 0.02], [-0.08, -0.15 + i * 0.05, 0.155], materials.blackMetal);

  return { house, lanterns, lanternLights, windowGlows };
}

/* ------------------------------------------------------------------ *
 *  Bamboo fence
 * ------------------------------------------------------------------ */

function bambooFence(parent, materials, start, end, options = {}) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const length = a.distanceTo(b);
  const direction = b.clone().sub(a).normalize();
  const spacing = 0.076;
  const count = Math.floor(length / spacing);
  const rng = randomGenerator(Math.round(length * 97 + a.x * 13 - a.z * 5));
  const stemMaterial = materials.bamboo.clone();
  stemMaterial.color.set('#ded0b2');
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.041, 0.046, 1, 8), stemMaterial, count);
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  let visible = 0;
  for (let i = 0; i < count; i++) {
    const p = a.clone().addScaledVector(direction, (i + 0.5) * length / count);
    if (options.gap && p.distanceTo(options.gap.center) < options.gap.radius) continue;
    const h = 1.44 + rng() * 0.14;
    matrix.makeScale(0.9 + rng() * 0.22, h, 0.9 + rng() * 0.22);
    matrix.setPosition(p.x, h / 2 - 0.01, p.z);
    stems.setMatrixAt(visible, matrix);
    const weathered = rng();
    color.setHSL(0.11, 0.08 + weathered * 0.08, 0.42 + rng() * 0.18);
    stems.setColorAt(visible++, color);
  }
  stems.count = visible;
  stems.castShadow = stems.receiveShadow = true;
  parent.add(stems);

  // horizontal bindings
  const segments = options.gap
    ? [[a, a.clone().lerp(b, 0.36)], [a.clone().lerp(b, 0.64), b]]
    : [[a, b]];
  for (const [s0, s1] of segments) {
    for (const y of [0.3, 1.08]) {
      barBetween(parent, [s0.x, y, s0.z], [s1.x, y, s1.z], 0.026, materials.darkWood, 6);
    }
  }

  // thicker posts every few metres
  const posts = Math.max(2, Math.round(length / 2.6));
  for (let i = 0; i <= posts; i++) {
    const p = a.clone().lerp(b, i / posts);
    if (options.gap && p.distanceTo(options.gap.center) < options.gap.radius) continue;
    const post = cylinder(parent, 0.055, 0.062, 1.62, [p.x, 0.81, p.z], stemMaterial, 9);
    post.castShadow = true;
  }
}

function addGate(parent, materials) {
  const gate = new THREE.Group();
  gate.name = '茅草木门';
  gate.position.set(-12.0, 0, 6.5);
  gate.rotation.y = Math.PI / 2;
  parent.add(gate);

  box(gate, [3.15, 0.16, 1.2], [0, 0.07, 0.32], materials.stone);
  box(gate, [3.3, 0.1, 0.62], [0, 0.03, 0.95], materials.stone);

  for (const x of [-1.42, 1.42]) box(gate, [0.17, 3.0, 0.2], [x, 1.5, 0], materials.darkWood);
  box(gate, [3.08, 0.18, 0.2], [0, 2.86, 0], materials.darkWood);

  const rng = randomGenerator(905);
  for (let i = 0; i < 13; i++) {
    const x = (i - 6) * 0.215;
    const plank = box(gate, [0.207, 2.68, 0.085], [x, 1.38, 0], materials.wood);
    plank.material = materials.wood;
    plank.position.z = (rng() - 0.5) * 0.012;
  }
  box(gate, [0.04, 2.7, 0.1], [0, 1.38, 0.06], materials.darkWood);
  // latch bars and vertical pulls from the photograph
  for (const y of [1.06, 1.9]) box(gate, [1.15, 0.075, 0.09], [0, y, 0.12], materials.darkWood);
  for (const x of [-0.34, 0.34]) {
    box(gate, [0.075, 0.62, 0.08], [x, 1.5, 0.14], materials.darkWood);
    box(gate, [0.16, 0.05, 0.06], [x, 1.83, 0.15], materials.darkWood);
  }
  // iron hinges
  for (const x of [-1.3, 1.3]) for (const y of [0.62, 2.1]) box(gate, [0.34, 0.06, 0.05], [x, y, 0.13], materials.blackMetal);

  // thatched roof: two slopes with a shaggy woven fringe
  const underThatch = materials.thatch.clone();
  underThatch.color.set('#9d8a66');
  for (const side of [-1, 1]) {
    const roof = box(gate, [3.7, 0.1, 1.06], [0, 3.06, side * 0.46], materials.thatch);
    roof.rotation.x = side * 0.3;
    const under = box(gate, [3.58, 0.055, 0.94], [0, 2.975, side * 0.43], underThatch);
    under.rotation.x = side * 0.3;
    for (let i = 0; i < 210; i++) {
      const x = -1.8 + i * 3.6 / 209;
      const length = 0.82 + rng() * 0.24;
      barBetween(
        gate,
        [x, 3.22, 0],
        [x + (rng() - 0.5) * 0.06, 2.84 - rng() * 0.12, side * length],
        0.008 + rng() * 0.005,
        materials.thatch, 4,
      );
    }
  }
  // second, shaggier layer under the first so the thatch reads as depth
  for (const side of [-1, 1]) {
    for (let i = 0; i < 150; i++) {
      const x = -1.75 + i * 3.5 / 149;
      barBetween(gate, [x, 3.06, side * 0.08], [x + (rng() - 0.5) * 0.09, 2.74 - rng() * 0.1, side * (0.66 + rng() * 0.2)], 0.006 + rng() * 0.005, materials.thatch, 4);
    }
  }
  const ridge = cylinder(gate, 0.11, 0.11, 3.75, [0, 3.24, 0], materials.thatch, 10);
  ridge.rotation.z = Math.PI / 2;
  // dark shadow under the thatch
  box(gate, [3.1, 0.14, 0.1], [0, 2.83, 0.02], materials.darkWood);
  blobShadow(gate, [0, 0.6], 1.9, 0.7, 0.17, 0.3);
  return gate;
}

export function buildFence(scene, materials) {
  const fence = new THREE.Group();
  fence.name = '竹篱与院门';
  scene.add(fence);
  bambooFence(fence, materials, [-12, 0, -8], [-12, 0, 13], { gap: { center: new THREE.Vector3(-12, 0, 6.5), radius: 1.55 } });
  bambooFence(fence, materials, [12, 0, -8], [12, 0, 13]);
  bambooFence(fence, materials, [-12, 0, -8], [12, 0, -8]);
  const gate = addGate(fence, materials);
  return { fence, gate };
}
