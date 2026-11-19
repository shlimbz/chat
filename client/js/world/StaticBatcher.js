// 정적 오브젝트 병합기
// 움직이지 않는 바닥/벽/운동기구 메시 수백 개를 정점 색상 지오메트리 2개(조명 O / 조명 X)로 합칩니다.
// → 드로우콜이 수백 번에서 몇 번으로 줄어 프레임이 크게 안정됩니다.
// 제외 대상: 텍스처가 있는 메시(안내판·글씨), 반투명 메시, userData.dynamic / noBatch 가 표시된 메시와 그 자식
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeForMerge } from '../core/geometryUtils.js';

function isExcluded(obj, root) {
  for (let o = obj; o && o !== root; o = o.parent) {
    if (o.userData.dynamic || o.userData.noBatch) return true;
  }
  return false;
}

/**
 * @param {THREE.Object3D} root 병합할 루트 (이 루트의 자식으로 병합 결과가 추가됨)
 * @returns {{before:number, after:number}} 병합 전/후 메시 수
 */
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const mat4 = new THREE.Matrix4();
  const color = new THREE.Color();
  const lit = [];
  const unlit = [];
  const targets = [];
  let before = 0;

  // 움직이는 부품(바벨 등)은 월드 병합에서 빼되, 부품 하나 = 메시 하나로 묶음
  const dynamicRoots = [];
  root.traverse((o) => { if (o.userData.dynamic) dynamicRoots.push(o); });
  for (const d of dynamicRoots) mergeGroupInPlace(d);

  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    const m = o.material;
    if (Array.isArray(m) || m.map || m.transparent || isExcluded(o, root)) return;
    if (!m.isMeshLambertMaterial && !m.isMeshBasicMaterial && !m.isMeshStandardMaterial) return;
    targets.push(o);
  });

  for (const o of targets) {
    const m = o.material;
    color.copy(m.color);
    if (m.emissive && m.emissiveIntensity > 0) {
      // 발광 재질은 색을 밝게 해서 비슷한 느낌 유지
      color.r = Math.min(1, color.r + m.emissive.r * m.emissiveIntensity);
      color.g = Math.min(1, color.g + m.emissive.g * m.emissiveIntensity);
      color.b = Math.min(1, color.b + m.emissive.b * m.emissiveIntensity);
    }
    const g = normalizeForMerge(o.geometry.clone(), color);
    mat4.multiplyMatrices(toLocal, o.matrixWorld);
    g.applyMatrix4(mat4);
    (m.isMeshBasicMaterial ? unlit : lit).push(g);
    o.removeFromParent();
    o.geometry.dispose();
  }

  // 빈 그룹 정리
  const empties = [];
  root.traverse((o) => {
    if (o !== root && !o.isMesh && o.children.length === 0 && o.type === 'Group' && !o.userData.dynamic) empties.push(o);
  });
  for (const e of empties) e.removeFromParent();

  let after = before - targets.length;
  if (lit.length) {
    const geo = mergeGeometries(lit, false);
    for (const g of lit) g.dispose();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'StaticLit';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    after++;
  }
  if (unlit.length) {
    const geo = mergeGeometries(unlit, false);
    for (const g of unlit) g.dispose();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    mesh.name = 'StaticUnlit';
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    after++;
  }
  return { before, after };
}

/** 그룹 안의 메시들을 그룹 로컬 좌표 기준 메시 1개로 합침 (그룹은 계속 움직일 수 있음) */
export function mergeGroupInPlace(group) {
  group.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const mat4 = new THREE.Matrix4();
  const color = new THREE.Color();
  const parts = [];
  const meshes = [];
  group.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.map || o.material.transparent) return;
    meshes.push(o);
  });
  if (meshes.length < 2) return;
  for (const o of meshes) {
    color.copy(o.material.color);
    const g = normalizeForMerge(o.geometry.clone(), color);
    mat4.multiplyMatrices(toLocal, o.matrixWorld);
    g.applyMatrix4(mat4);
    parts.push(g);
    o.removeFromParent();
    o.geometry.dispose();
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, getDynamicMaterial());
  mesh.castShadow = true;
  mesh.name = `${group.name || 'part'}-merged`;
  group.add(mesh);
}

let dynamicMaterial = null;
function getDynamicMaterial() {
  if (!dynamicMaterial) dynamicMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return dynamicMaterial;
}
