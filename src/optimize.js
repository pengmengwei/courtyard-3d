import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Batch static pieces by material without sacrificing the instanced tiles, leaves and grass.
export function mergeStaticGroup(scene, root) {
  root.updateWorldMatrix(true, true);
  const batches = new Map();
  const originals = [];
  root.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || !object.visible || Array.isArray(object.material) || object.material.transparent) return;
    const attributes = Object.keys(object.geometry.attributes).sort().join(',');
    const key = [object.material.uuid, attributes, Boolean(object.geometry.index), object.castShadow, object.receiveShadow].join('|');
    if (!batches.has(key)) batches.set(key, { material: object.material, cast: object.castShadow, receive: object.receiveShadow, geometries: [] });
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    batches.get(key).geometries.push(geometry);
    originals.push(object);
  });
  for (const batch of batches.values()) {
    if (!batch.geometries.length) continue;
    const geometry = batch.geometries.length === 1 ? batch.geometries[0] : mergeGeometries(batch.geometries, false);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = batch.cast;
    mesh.receiveShadow = batch.receive;
    mesh.name = '静态材质合批';
    scene.add(mesh);
  }
  originals.forEach(mesh => mesh.removeFromParent());
}
