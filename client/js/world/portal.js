// 맵 이동 포탈: 빛나는 고리 + 소용돌이 원판 + 위에 떠 있는 이름표
// 소용돌이 원판만 매 프레임 돌아감 (텍스처 1장, 드로우콜 몇 개)
import * as THREE from 'three';

let swirlTex = null;
function swirlTexture() {
  if (swirlTex) return swirlTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  // 나선 줄무늬
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 9;
  g.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = arm * (Math.PI / 2) + t * Math.PI * 2.2;
      const r = 10 + t * 112;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  swirlTex = new THREE.CanvasTexture(c);
  swirlTex.colorSpace = THREE.SRGBColorSpace;
  return swirlTex;
}

function labelSprite(text, bg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(6, 10, 500, 108, 54);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}

/**
 * @param {{color:string, label:string, radius?:number}} opts
 * @returns {{group:THREE.Group, update:(dt:number)=>void}}
 */
export function createPortal({ color, label, radius = 1.05 }) {
  const g = new THREE.Group();
  const cy = radius + 0.2;
  // 받침대
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, 0.16, 20), new THREE.MeshLambertMaterial({ color: '#3a3f4b', flatShading: true }));
  base.position.y = 0.08;
  base.scale.z = 0.45;
  g.add(base);
  // 빛나는 고리
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.position.y = cy;
  g.add(ring);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.13, 0.04, 6, 32),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  );
  rim.position.y = cy;
  g.add(rim);
  // 소용돌이 (앞뒤 양면)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.05, 32),
    new THREE.MeshBasicMaterial({
      map: swirlTexture(), color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  disc.position.y = cy;
  disc.userData.noBatch = true;
  g.add(disc);
  const tag = labelSprite(label, color);
  tag.position.y = cy * 2 + 0.45;
  tag.userData.noBatch = true;
  g.add(tag);
  let t = 0;
  return {
    group: g,
    update(dt) {
      t += dt;
      disc.rotation.z -= dt * 2.4;
      const s = 1 + Math.sin(t * 3) * 0.04;
      disc.scale.set(s, s, 1);
      tag.position.y = cy * 2 + 0.45 + Math.sin(t * 2) * 0.06;
    },
  };
}
