// 매끈한 몸통 · 팔 · 다리 (동물의숲 느낌의 둥근 몸)
//
// 핵심 아이디어: 몸통은 "표면 하나"로 만들고 상의/하의는 색(영역)으로만 나눕니다.
//  → 배·가슴이 커져도 상의와 하의가 같은 표면이라 배가 바지 밖으로 튀어나오는 일이 원리상 없음
// 팔·다리도 관 하나로 만들고 팔꿈치·무릎 근처는 두 관절에 나눠 붙여(스키닝 블렌드) 부드럽게 굽힙니다.
// 소매·바짓단도 같은 관의 색 영역 + 살짝 두꺼운 단으로 표현 → 옷과 팔다리가 겹칠 일이 없음
// 이 파일은 Three.js 없이 계산만 합니다 (테스트에서 직접 검사 가능).

const g = (t) => Math.exp(-t * t);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 몸통 모양 (골반 관절 기준 좌표, +z = 앞)
 * @param {{girthX:number, girthZ:number, waist:number, belly:number, bust:number, pecs:number}} o
 */
export function makeTorsoShape(o) {
  const cy = 0.22;
  const ry = 0.29;
  const R = 0.25;
  // 세로 단면: 위쪽(어깨)은 통통하게 각진 원(p=3), 아래쪽(엉덩이)은 둥글게(p=2.3) → 동물의숲 같은 통통한 몸
  const prof = (y) => {
    const t = Math.min(1, Math.abs((y - cy) / ry));
    const p = y > cy ? 3 : 2.3;
    return (1 - t ** p) ** (1 / p);
  };
  const rx = (y) => {
    // 아래쪽(골반)은 waist 배율로 넓어지거나 좁아짐
    const low = 1 + (o.waist - 1) * smooth(0.2, 0.02, y);
    return R * o.girthX * prof(y) * low;
  };
  const rz = (y) => R * o.girthZ * prof(y);
  /** 앞쪽 볼록함 (배·가슴) — 표면 하나에 더해지므로 옷과 따로 놀지 않음 */
  const bump = (x, y) => (
    o.belly * 0.07 * g((y - 0.1) / 0.12) * g(x / 0.17)
    + o.bust * 0.028 * (g((x - 0.075) / 0.05) + g((x + 0.075) / 0.05)) * g((y - 0.31) / 0.055)
    + o.pecs * 0.018 * (g((x - 0.075) / 0.07) + g((x + 0.075) / 0.07)) * g((y - 0.335) / 0.06)
  );
  const point = (y, th) => {
    const x = rx(y) * Math.sin(th);
    const c = Math.cos(th);
    const z = rz(y) * c + (c > 0 ? bump(x, y) * c ** 1.5 : 0);
    return [x, z];
  };
  /** 앞면 (x, y) 의 표면 z (없으면 -Infinity) */
  const frontZ = (x, y) => {
    const w = rx(y);
    if (Math.abs(x) >= w || w <= 0) return -Infinity;
    let lo = 0;
    let hi = Math.PI / 2;
    const s = Math.sign(x) || 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (Math.abs(point(y, s * mid)[0]) < Math.abs(x)) lo = mid; else hi = mid;
    }
    return point(y, s * (lo + hi) / 2)[1];
  };
  return {
    cy, ry, rx, rz, point, frontZ, yb: cy - ry, yt: cy + ry,
    /** 각도 th 방향 표면점을 바깥(수평)으로 out 만큼 띄운 위치 */
    outside(y, th, out = 0) {
      const [x, z] = point(y, th);
      const l = Math.hypot(x, z) || 1;
      return [x + (x / l) * out, y, z + (z / l) * out];
    },
  };
}

/** 인덱스 메쉬의 부드러운 법선 */
export function vertexNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a]; const vy = pos[c + 1] - pos[a + 1]; const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/**
 * 격자 표면 → 스킨 파츠
 * @param {number[][][]} rows rows[i][j] = [x,y,z] (j 는 둘레 방향, 마지막 = 처음과 같은 위치)
 * @param {(i:number,j:number)=>{a:string,b:string,w:number}} weightAt 정점의 관절 2개와 b 쪽 비율
 * @param {(cy:number, tri:number[][])=>string} colorOf 삼각형 색 (가운데 높이 등으로 결정)
 */
function gridPart(rows, weightAt, colorOf, key) {
  const R = rows.length;
  const C = rows[0].length;
  const pos = [];
  const wts = [];
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
      pos.push(...rows[i][j]);
      wts.push(weightAt(i, j));
    }
  }
  const idx = [];
  const tcol = [];
  const id = (i, j) => i * C + j;
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < C - 1; j++) {
      const a = id(i, j); const b = id(i + 1, j); const c = id(i + 1, j + 1); const d = id(i, j + 1);
      for (const tri of [[a, b, d], [b, c, d]]) {
        const P = tri.map((v) => pos.slice(v * 3, v * 3 + 3));
        const area = Math.hypot(...cross3(sub3(P[1], P[0]), sub3(P[2], P[0])));
        if (area < 1e-10) continue;
        idx.push(...tri);
        tcol.push(colorOf(key(tri.map((v) => [Math.floor(v / C), v % C])), P));
      }
    }
  }
  return { pos, idx, wts, tcol };
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/**
 * 몸통 메쉬 (골반 좌표). y 링에 허리선·목깃 선을 정확히 넣어 색 경계가 깔끔함
 * @param {object} shape makeTorsoShape 결과
 * @param {{waistY:number, collarY?:number, top:string, bottom:string, collar?:string}} paint
 */
export function torsoPart(shape, paint, cols = 32) {
  const phis = [];
  const N = 22;
  for (let i = 0; i <= N; i++) phis.push((i / N) * Math.PI);
  const extraY = [paint.waistY, paint.waistY + 0.012, paint.collarY].filter((v) => v !== undefined && v !== null);
  for (const y of extraY) phis.push(Math.acos(Math.min(1, Math.max(-1, (y - shape.cy) / shape.ry))));
  phis.sort((a, b) => a - b);
  const ys = phis.map((p) => shape.cy + shape.ry * Math.cos(p)).filter((y, i, arr) => i === 0 || Math.abs(y - arr[i - 1]) > 1e-4);
  const rows = ys.map((y) => {
    const ring = [];
    for (let j = 0; j <= cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      const [x, z] = shape.point(y, th);
      ring.push([x, y, z]);
    }
    return ring;
  });
  const colorOf = (cy) => {
    if (paint.collarY !== undefined && paint.collarY !== null && cy > paint.collarY) return paint.collar;
    if (cy < paint.waistY) return paint.bottom;
    if (paint.hem && cy < paint.waistY + 0.012) return paint.hem;
    return paint.top;
  };
  return gridPart(
    rows,
    (i) => ({ a: 'hips', b: 'chest', w: smooth(0.06, 0.28, ys[i]) }),
    (cyKey) => colorOf(cyKey),
    (ij) => ij.reduce((s, [i]) => s + ys[i], 0) / 3,
  );
}

/**
 * 팔·다리 관: pivot(관절) 에서 -y 방향으로 len 만큼. 위·아래 끝은 반구로 닫힘
 * 위 반구는 관절 위치를 중심으로 → 관절이 돌아도 어깨/엉덩이 모양이 그대로
 * @param {{pivot:number[], len:number, radius:(s:number)=>number, bones:[string,string], joint:number, blend?:number,
 *          paint:(s:number)=>string, cols?:number}} o  s = 관절에서 아래로 내려간 거리(0~len)
 */
export function tubePart(o) {
  const cols = o.cols || 12;
  const blend = o.blend ?? 0.035;
  const ss = [];
  const r0 = o.radius(0);
  const r1 = o.radius(o.len);
  // 위 반구
  const CAP = 5;
  for (let i = 0; i <= CAP; i++) {
    const a = (i / CAP) * (Math.PI / 2);
    ss.push({ s: -r0 * Math.cos(a), r: r0 * Math.sin(a) });
  }
  const BODY = 16;
  for (let i = 1; i < BODY; i++) {
    const s = (i / BODY) * o.len;
    ss.push({ s, r: o.radius(s) });
  }
  for (let i = 0; i <= CAP; i++) {
    const a = (i / CAP) * (Math.PI / 2);
    ss.push({ s: o.len + r1 * Math.sin(a), r: r1 * Math.cos(a) });
  }
  const rows = ss.map(({ s, r }) => {
    const ring = [];
    for (let j = 0; j <= cols; j++) {
      const th = (j / cols) * Math.PI * 2;
      ring.push([o.pivot[0] + r * Math.sin(th), o.pivot[1] - s, o.pivot[2] + r * Math.cos(th)]);
    }
    return ring;
  });
  const [ba, bb] = o.bones;
  return gridPart(
    rows,
    (i) => ({ a: ba, b: bb, w: smooth(o.joint - blend, o.joint + blend, ss[i].s) }),
    (sMid) => o.paint(sMid),
    (ij) => ij.reduce((acc, [i]) => acc + ss[i].s, 0) / 3,
  );
}

/** 단(소매·바짓단)처럼 살짝 두꺼워지는 반경 배율: s < edge 구간에서 thick 배 */
export function hemRadius(base, edge, thick = 1.12, soft = 0.008) {
  return (s) => base(s) * (1 + (thick - 1) * smooth(edge + soft, edge - soft, s));
}

export { smooth };
