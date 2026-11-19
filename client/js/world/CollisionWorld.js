// 2D(XZ 평면) 충돌 처리: 캐릭터(원) vs 운동기구/벽(축 정렬 박스)
// Three.js 에 의존하지 않는 순수 모듈 (서버에서 위치 검증 시 재사용 가능)

export class CollisionWorld {
  /**
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds 이동 가능한 방 내부 영역
   */
  constructor(bounds) {
    this.bounds = { ...bounds };
    this.boxes = [];
  }

  addBox(minX, maxX, minZ, maxZ, tag = '') {
    this.boxes.push({ minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), tag });
  }

  /**
   * 로컬 좌표 박스를 (위치, Y회전) 으로 변환해 월드 AABB로 추가
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
    this.addBox(minX, maxX, minZ, maxZ, tag);
  }

  /**
   * 원(pos, r)을 장애물 밖으로 밀어낸 위치를 반환 (입력 객체를 직접 수정)
   * @param {{x:number,z:number}} pos
   */
  resolveCircle(pos, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
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

  /** 원이 장애물과 겹치는지 여부 (스폰 위치 검사 등) */
  overlaps(pos, r) {
    for (const b of this.boxes) {
      const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
}
