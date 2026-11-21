import * as THREE from 'three';

function metersOf(material) {
  return material?.userData?.uvMeters || 0;
}

function scaleBoxUV(geometry, width, height, depth, meters) {
  if (!meters) return;
  const uv = geometry.attributes.uv;
  if (!uv) return;
  // BoxGeometry vertex order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const faces = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  let index = 0;
  for (const [fw, fh] of faces) {
    for (let i = 0; i < 4; i++, index++) {
      uv.setXY(index, uv.getX(index) * fw / meters, uv.getY(index) * fh / meters);
    }
  }
  uv.needsUpdate = true;
}

function scaleCylinderUV(geometry, radius, height, meters) {
  if (!meters) return;
  const uv = geometry.attributes.uv;
  if (!uv) return;
  const circumference = Math.PI * 2 * radius;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circumference / meters, uv.getY(i) * height / meters);
  }
  uv.needsUpdate = true;
}

function scalePlaneUV(geometry, width, height, meters) {
  if (!meters) return;
  const uv = geometry.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * width / meters, uv.getY(i) * height / meters);
  }
  uv.needsUpdate = true;
}

export function box(parent, size, position, material, name = '') {
  const geometry = new THREE.BoxGeometry(...size);
  scaleBoxUV(geometry, size[0], size[1], size[2], metersOf(material));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function cylinder(parent, radiusTop, radiusBottom, height, position, material, segments = 16) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  scaleCylinderUV(geometry, Math.max(radiusTop, radiusBottom), height, metersOf(material));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function plane(parent, width, height, position, material, name = '') {
  const geometry = new THREE.PlaneGeometry(width, height);
  scalePlaneUV(geometry, width, height, metersOf(material));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function sphere(parent, radius, position, material, scale = [1, 1, 1], detail = 2) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function barBetween(parent, start, end, radius, material, segments = 8) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), segments);
  scaleCylinderUV(geometry, radius, direction.length(), metersOf(material));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function beamBetween(parent, start, end, width, depth, material) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const geometry = new THREE.BoxGeometry(width, direction.length(), depth);
  scaleBoxUV(geometry, width, direction.length(), depth, metersOf(material));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function tube(parent, points, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 3), radius, 6, closed), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Soft contact darkening beneath objects — grounds them when the sun is behind.
let shadowMap = null;
function contactShadowMap() {
  if (!shadowMap) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,.62)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,.3)');
    gradient.addColorStop(0.8, 'rgba(0,0,0,.07)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    shadowMap = new THREE.CanvasTexture(canvas);
  }
  return shadowMap;
}

export function blobShadow(parent, [x, z], radiusX, radiusZ, y = 0.012, opacity = 0.5) {
  const material = new THREE.MeshBasicMaterial({
    map: contactShadowMap(), color: '#10130e', transparent: true, opacity,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

export function setShadow(group) {
  group.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}
