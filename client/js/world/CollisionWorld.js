// 충돌 처리: 캐릭터(원기둥) vs 운동기구/벽(높이가 있는 상자)
// - 각 상자에는 윗면 높이(top)가 있음 → 그보다 높이 떠 있으면 부딪히지 않고 위로 넘어갈 수 있음
// - 발 높이 + STEP_HEIGHT 이하의 낮은 상자(러닝머신 발판 등)는 걸어서 올라감
// - groundHeight(): 발밑에서 가장 높은 윗면 → 상자 위에 올라설 수 있음
// Three.js 에 의존하지 않는 순수 모듈
export const STEP_HEIGHT = 0.25;

export class CollisionWorld {
  /**
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds 이동 가능한 방 내부 영역
   */
  constructor(bounds) {
    this.bounds = { ...bounds };
    this.boxes = [];
  }

  /** top 을 생략하면 무한히 높은 벽 */
  addBox(minX, maxX, minZ, maxZ, tag = '', top = Infinity) {
    this.boxes.push({
      minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), top, tag,
    });
  }

  /**
   * 로컬 좌표 박스를 (위치, Y회전) 으로 변환해 월드 AABB로 추가
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number,top?:number}} local
   */
  addLocalBox(local, x, z, rotY, tag = '') {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const corners = [
      [local.minX, local.minZ], [local.maxX, local.minZ],
      [local.minX, local.maxZ], [local.maxX, local.maxZ],
    ];
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const [lx, lz] of corners) {
      // Three.js 의 Y축 회전과 동일한 변환
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
      minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
    }
    this.addBox(minX, maxX, minZ, maxZ, tag, local.top ?? Infinity);
  }

  /**
   * 원(pos, r)을 장애물 밖으로 밀어낸 위치를 반환 (입력 객체를 직접 수정)
   * @param {{x:number,z:number}} pos
   * @param {number} r 반지름
   * @param {number} feetY 발 높이 — 이 높이 + STEP_HEIGHT 보다 낮은 상자는 무시 (넘어가거나 올라섬)
   */
  resolveCircle(pos, r, feetY = 0) {
    const clearY = feetY + STEP_HEIGHT;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (b.top <= clearY) continue;
        const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
        const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          // 중심이 박스 안: 가장 가까운 면으로 밀어냄
          const pushes = [
            { v: pos.x - b.minX + r, ax: 'x', sign: -1 },
            { v: b.maxX - pos.x + r, ax: 'x', sign: 1 },
            { v: pos.z - b.minZ + r, ax: 'z', sign: -1 },
            { v: b.maxZ - pos.z + r, ax: 'z', sign: 1 },
          ];
          pushes.sort((a, b2) => a.v - b2.v);
          pos[pushes[0].ax] += pushes[0].sign * pushes[0].v;
        }
      }
      if (!moved) break;
    }
    // 방 경계
    const B = this.bounds;
    pos.x = Math.min(Math.max(pos.x, B.minX + r), B.maxX - r);
    pos.z = Math.min(Math.max(pos.z, B.minZ + r), B.maxZ - r);
    return pos;
  }

  /**
   * (x, z) 에서 발밑 바닥 높이: 발 높이 + STEP_HEIGHT 이하인 상자 윗면 중 가장 높은 값 (없으면 0)
   * @param {number} r 발 판정 반지름 (몸보다 작게 → 모서리에 살짝 걸쳐서는 올라서지 않음)
   */
  groundHeight(x, z, feetY, r = 0.2) {
    let ground = 0;
    const limit = feetY + STEP_HEIGHT;
    for (const b of this.boxes) {
      if (b.top === Infinity || b.top > limit || b.top <= ground) continue;
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      ground = b.top;
    }
    return ground;
  }

  /** 원이 장애물과 겹치는지 여부 (스폰 위치 검사 등) */
  overlaps(pos, r, feetY = 0) {
    const clearY = feetY + STEP_HEIGHT;
    for (const b of this.boxes) {
      if (b.top <= clearY) continue;
      const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
}
