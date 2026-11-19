// 지오메트리 병합 도우미 (성능 최적화의 핵심)
// 여러 도형을 "정점 색상"을 가진 하나의 BufferGeometry 로 합쳐
// 머티리얼 1개 · 드로우콜 1번으로 그릴 수 있게 합니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** 병합 가능한 형태(비인덱스, position/normal/color 만)로 정리 */
export function normalizeForMerge(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  if (color !== undefined) setVertexColor(g, color);
  return g;
}

export function setVertexColor(g, color) {
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * 도형을 하나씩 추가한 뒤 build() 로 하나의 지오메트리를 얻습니다.
 *   pb.add(new THREE.SphereGeometry(0.3, 16, 12), '#ffccaa', { y: 1, sx: 1.1 })
 */
export class PartBuilder {
  constructor() {
    this.list = [];
  }

  /**
   * @param {THREE.BufferGeometry} geo  (소유권이 넘어오며 내부에서 dispose 됨)
   * @param {string|number|THREE.Color} color
   * @param {{x?:number,y?:number,z?:number,rx?:number,ry?:number,rz?:number,sx?:number,sy?:number,sz?:number,s?:number,quat?:THREE.Quaternion}} t
   */
  add(geo, color, t = {}) {
    const g = normalizeForMerge(geo, color);
    _p.set(t.x || 0, t.y || 0, t.z || 0);
    if (t.quat) _q.copy(t.quat);
    else _q.setFromEuler(_e.set(t.rx || 0, t.ry || 0, t.rz || 0));
    const s = t.s ?? 1;
    _s.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    this.list.push(g);
    return this;
  }

  get empty() {
    return this.list.length === 0;
  }

  build() {
    if (this.list.length === 0) return null;
    const merged = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (this.list.length > 1) for (const g of this.list) g.dispose();
    this.list = [];
    return merged;
  }
}
