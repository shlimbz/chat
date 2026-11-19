// 안내 NPC: 제자리에 서서 가까이 온 플레이어 쪽을 바라보고, 처음 다가오면 말풍선으로 인사
// E 로 말을 걸면 Game 이 대화창(NpcDialog)을 엽니다.
import { CharacterModel } from '../character/CharacterModel.js';
import { lerpAngle } from '../character/PlayerController.js';
import { isMobile } from '../ui/mobile.js';

export const NPC_LOOKS = {
  coach: {
    gender: 'male', muscle: 0.85, weight: 0.4, height: 0.6, skin: '#e2ad80', hair: 'spiky', hairColor: '#221b17',
    face: 'square', eyes: 'smile', eyeColor: '#2b2420', cheeks: 'blush', brows: 'angled', nose: 'button', mouth: 'grin',
    outfit: 'tracksuit', topColor: '#e8505b', bottomColor: '#2b2d33', shoes: 'sneakers', shoeColor: '#ffffff',
    acc: { hat: 'cap', neck: 'medal' },
  },
  tower: {
    gender: 'female', muscle: 0.35, weight: 0.3, height: 0.4, skin: '#ffe3cc', hair: 'ponytail', hairColor: '#f08bb4',
    face: 'round', eyes: 'sparkle', eyeColor: '#3d7dd8', cheeks: 'rosy', brows: 'soft', nose: 'dot', mouth: 'open',
    outfit: 'tank_shorts', topColor: '#f6d55c', bottomColor: '#3d7dd8', shoes: 'hightop', shoeColor: '#e8505b',
    acc: { hat: 'headband' },
  },
};

export class Npc {
  /**
   * @param {THREE.Object3D} parent
   * @param {{id:string, name:string, look:string, x:number, y?:number, z:number, r:number, greet?:string, greetMobile?:string}} opts
   */
  constructor(parent, opts) {
    this.id = opts.id;
    this.name = opts.name;
    // 모바일은 E 키 대신 [말 걸기] 버튼
    this.greet = (isMobile() ? opts.greetMobile : opts.greet) || opts.greet || '말을 걸어 주세요!';
    this.pos = { x: opts.x, y: opts.y || 0, z: opts.z };
    this.baseR = opts.r;
    this.rot = opts.r;
    // CharacterModel 이 외형 값을 검증하고, 적힌 악세사리는 그대로 보여 줌
    this.model = new CharacterModel(NPC_LOOKS[opts.look] || NPC_LOOKS.coach, { nickname: `💬 ${opts.name}` });
    this.model.setNickname(`💬 ${opts.name}`, '#9ff3c8');
    this.model.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.model.root.rotation.y = this.rot;
    this.model.root.userData.noBatch = true; // 정적 병합에서 제외 (애니메이션 캐릭터)
    parent.add(this.model.root);
    this._greeted = false;
    this._t = Math.random() * 5;
  }

  /** @param {{x:number,y:number,z:number}|null} viewer 내 캐릭터 위치 */
  update(dt, viewer) {
    this._t += dt;
    let target = this.baseR;
    if (viewer) {
      const dx = viewer.x - this.pos.x;
      const dz = viewer.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 5 && Math.abs(viewer.y - this.pos.y) < 2) {
        target = Math.atan2(dx, dz);
        if (!this._greeted && d < 3.2) {
          this._greeted = true;
          this.model.say(this.greet);
        }
      } else if (d > 9) {
        this._greeted = false; // 멀리 갔다 다시 오면 또 인사
      }
    }
    this.rot = lerpAngle(this.rot, target, Math.min(1, dt * 4));
    this.model.root.rotation.y = this.rot;
    this.model.update(dt, 0, false);
  }

  say(text) {
    this.model.say(text);
  }
}
