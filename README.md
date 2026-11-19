# ONLINE GYM 🏋️

웹 브라우저에서 바로 실행되는 로우폴리 3D 온라인 멀티플레이 헬스장 게임입니다.

> **현재 단계: Phase 1 (기본 3D 헬스장)**
> 아직 서버·멀티플레이·채팅·운동 미니게임·성장 시스템은 **없습니다**. 아래 "진행 현황"에 구현된 것과 안 된 것을 구분해 두었습니다.

---

## 진행 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 3D 헬스장, 로우폴리 캐릭터, 커스터마이징, 3인칭 카메라, WASD 이동, 운동기구 배치 | ✅ 완료 |
| 2 | Node.js + Socket.IO 서버, 닉네임 접속, 위치 동기화, 접속/퇴장 | ⏳ 예정 |
| 3 | 전체 채팅, 채팅 로그 저장, 귓속말, 명령어 | ⏳ 예정 |
| 4 | 벤치프레스 / 덤벨컬 / 러닝머신 미니게임, 결과 저장 | ⏳ 예정 |
| 5 | 레벨·경험치, 운동 기록, 근육 성장, 외형 변화 | ⏳ 예정 |
| 6 | 배포 및 20명 동시 접속 테스트 | ⏳ 예정 |

### Phase 1 에서 동작하는 것
- 캐릭터 생성 화면: 닉네임 입력(검증 포함) + 실시간 3D 미리보기(드래그로 회전)
- 커스터마이징: 체형 4종, 피부색 6종, 얼굴 형태 4종, 헤어스타일 7종, 헤어 컬러 8종, 의상 4종(상·하의 색상 각 9종), 신발 3종(색상 6종), 랜덤 버튼
- 게임 중 ESC → "캐릭터 커스터마이징"으로 외형 다시 변경
- 헬스장 공간(32m × 24m): 벤치프레스 2, 덤벨 랙 2, 러닝머신 4, 레그프레스, 숄더프레스, 랫풀다운 2, 거울(실시간 반사), 휴식 공간(벤치·정수기·자판기), 안내판, 구역 표지판
- 3인칭 카메라: 마우스 드래그 회전, 휠 줌, 벽 밖으로 나가지 않음
- WASD 이동(카메라 기준), Shift 달리기, 가속/감속, 기구·벽 충돌
- 절차적 애니메이션: 대기(숨쉬기) / 걷기 / 달리기 자동 전환
- 기구 근처에서 상호작용 안내 표시, E 키 입력 처리
- HUD(닉네임·레벨, 접속자 수, 상호작용 안내, 상태·현재 구역), ESC 메뉴, 설정(마우스 감도, 상하 반전, 그림자, 닉네임 표시)
- 프로필(닉네임·외형)과 설정을 브라우저에 저장 → 새로고침해도 유지

### Phase 1 에서 아직 안 되는 것 (화면에도 "Phase N 예정"으로 표시)
- E 키를 눌러도 미니게임은 실행되지 않고 "Phase 4에서 추가됩니다" 안내만 나옵니다.
- 레벨은 Lv.1 고정, 경험치·운동 기록 없음
- 채팅창 자리만 있고 채팅 기능 없음
- 다른 사용자가 보이지 않음 (서버 없음 · 오프라인 모드)
- 프로필은 **이 브라우저에만** 저장됩니다 (서버 DB 저장은 Phase 2)

---

## 실행 방법 (초보자용)

### 1) Node.js 설치
- https://nodejs.org 에서 **LTS** 버전을 설치합니다 (18 이상).
- 설치 확인: 터미널(윈도우는 "명령 프롬프트" 또는 "PowerShell")에서
  ```bash
  node -v
  ```
  `v18.x.x` 이상이 나오면 됩니다.

### 2) 프로젝트 폴더로 이동
압축을 푼 폴더에서 터미널을 엽니다.
```bash
cd online-gym
```

### 3) 실행
```bash
npm start
```
Phase 1 은 **설치할 패키지가 없습니다** (`npm install` 불필요). Three.js 는 인터넷(CDN)에서 자동으로 불러옵니다.

### 4) 브라우저에서 접속
```
http://localhost:5173
```
Chrome / Edge / Firefox 최신 버전을 권장합니다.

> ⚠️ `index.html` 파일을 더블클릭해서 열면 동작하지 않습니다(브라우저 보안 정책상 ES 모듈은 웹서버가 필요). 반드시 `npm start` 후 주소로 접속하세요.

**Node.js 없이 실행하고 싶다면** (Python 이 설치된 경우):
```bash
cd online-gym/client
python -m http.server 5173
```

포트를 바꾸려면: `node tools/serve.js 8080`

---

## 조작법

| 입력 | 동작 |
|---|---|
| W A S D (또는 방향키) | 이동 (카메라가 보는 방향 기준) |
| Shift + 이동 | 달리기 |
| 마우스 드래그 | 카메라 회전 |
| 마우스 휠 | 카메라 줌 |
| E | 가까운 운동기구 이용 |
| ESC | 메뉴 열기 / 닫기 |

---

## 테스트 방법

### 자동 테스트 (로직)
```bash
npm test
```
닉네임 검증, 외형 값 검증(허용되지 않은 값 차단), 충돌 처리, 각도 보간 등 8개 테스트가 실행됩니다. 모두 `ok` 가 나오면 정상입니다.

### 수동 테스트 체크리스트 (브라우저)
1. 접속하면 "캐릭터 만들기" 화면이 나온다.
2. 닉네임을 비우고 "헬스장 입장하기" → "2자 이상" 오류가 나온다. `a b` 처럼 공백·특수문자를 넣어도 오류가 나온다.
3. 체형/피부/얼굴/헤어/의상/신발을 바꾸면 오른쪽 3D 미리보기에 즉시 반영된다. 미리보기를 드래그하면 회전한다.
4. 닉네임 입력 후 입장 → 헬스장 입구에서 캐릭터 뒤쪽 시점으로 시작한다. 머리 위에 닉네임이 보인다.
5. W A S D 로 이동, Shift 로 달리기 → 걷기/달리기 애니메이션과 우하단 상태(걷는 중/달리는 중, 속도)가 바뀐다.
6. 운동기구·벽에 부딪히면 통과하지 않는다.
7. 마우스 드래그로 카메라가 돌고, 휠로 확대/축소된다. 카메라가 벽 밖으로 나가지 않는다.
8. 벤치프레스 발치 쪽으로 가면 하단에 `[E] 벤치프레스 이용하기` 가 뜨고, E 를 누르면 "Phase 4에서 추가됩니다" 안내가 뜬다.
9. 북쪽 벽 거울에 캐릭터가 비친다.
10. ESC → 메뉴. "설정"에서 그림자를 끄면 그림자가 사라진다. "캐릭터 커스터마이징"에서 외형을 바꾸고 저장하면 게임 속 캐릭터가 바로 바뀐다.
11. 새로고침(F5) → 캐릭터 만들기 화면에 이전 닉네임과 외형이 그대로 채워져 있다.

개발자 도구(F12) 콘솔에서 `__game` 으로 게임 객체를 확인할 수 있습니다. 예: `__game.player.position`, `__game.playerModel.setBodyStats({chest:1, arms:1})` (Phase 5 성장 표현 미리보기).

---

## 폴더 구조

```
online-gym/
├─ client/                     # 프론트엔드 (정적 파일 → GitHub Pages / Vercel 배포 대상)
│  ├─ index.html               # 진입 HTML, Three.js importmap(CDN)
│  ├─ css/style.css
│  └─ js/
│     ├─ config.js             # ★ 서버 주소 등 환경 설정
│     ├─ main.js               # 진입점: 캐릭터 생성 → 게임 시작
│     ├─ core/
│     │  ├─ Game.js            # 렌더러/루프, 모듈 연결, 미니게임 등록 지점
│     │  ├─ Input.js           # 키보드 입력 (텍스트 입력 중엔 무시)
│     │  ├─ CameraController.js# 3인칭 카메라
│     │  └─ storage.js         # localStorage 저장/불러오기
│     ├─ world/
│     │  ├─ Gym.js             # 공간·조명·거울·기구 배치표(EQUIPMENT_LAYOUT)
│     │  ├─ equipment.js       # 운동기구/소품 로우폴리 모델
│     │  └─ CollisionWorld.js  # 충돌 처리 (Three.js 비의존)
│     ├─ character/
│     │  ├─ CharacterModel.js  # 캐릭터 모델·애니메이션·성장 반영
│     │  └─ PlayerController.js# 로컬 플레이어 이동
│     ├─ ui/
│     │  ├─ CharacterCreator.js# 캐릭터 생성/커스터마이징 화면
│     │  ├─ HUD.js             # 게임 HUD
│     │  ├─ Menu.js            # ESC 메뉴, 설정
│     │  └─ dom.js             # DOM 도우미
│     └─ shared/               # ★ 서버와 공유할 순수 로직 (Three.js 비의존)
│        ├─ appearance.js      # 외형 옵션 정의 + 검증, 닉네임 검증
│        └─ equipmentTypes.js  # 기구 종류·대상 근육 정의
├─ tools/serve.js              # 개발용 정적 서버 (의존성 없음)
├─ tests/phase1.test.js        # 단위 테스트
├─ index.html                # GitHub Pages 루트 → client/ 로 이동
├─ .nojekyll                 # GitHub Pages 가공(Jekyll) 비활성화
└─ package.json
```

Phase 2 에서 `server/` 폴더(Express + Socket.IO + SQLite)가 추가되고, `client/js/net/` 에 네트워크 모듈이 추가됩니다. 기존 파일 구조는 그대로 유지됩니다.

### 확장을 위한 설계 포인트
- **기구 추가/이동**: `world/Gym.js` 의 `EQUIPMENT_LAYOUT` 표에 한 줄 추가
- **미니게임 추가 (Phase 4)**: `game.registerMinigame('benchpress', 모듈)` — E 키 처리 코드는 이미 이 등록표를 확인합니다
- **서버 검증 (Phase 2~)**: `shared/appearance.js` 의 `sanitizeAppearance`, `validateNickname` 을 서버에서도 그대로 사용 → 클라이언트 값을 신뢰하지 않음
- **네트워크 동기화 (Phase 2)**: `PlayerController.getNetworkState()` 가 전송용 최소 상태 `{x, z, r, a}` 를 반환
- **성장 외형 (Phase 5)**: `CharacterModel.setBodyStats({chest, shoulders, arms, back, legs, bodyFat})` 이 이미 근육 파츠 크기에 반영됨

---

## 환경 설정 변경

`client/js/config.js` 한 곳에서 관리합니다.
```js
SERVER_URL: 'http://localhost:3000',   // Phase 2 게임 서버 주소
WALK_SPEED, RUN_SPEED, CAMERA_*, ...  // 이동·카메라 수치
```
배포 시 파일을 고치지 않고 `index.html` 에서 덮어쓸 수도 있습니다:
```html
<script>window.ONLINE_GYM_CONFIG = { SERVER_URL: 'https://내-게임서버.onrender.com' };</script>
```
(이 줄은 `<script type="module" src="./js/main.js">` 보다 **위**에 있어야 합니다.)

---

## GitHub 업로드 & GitHub Pages 배포

> Phase 1 은 프론트엔드만 있으므로 GitHub Pages(무료)만으로 배포·테스트할 수 있습니다. 게임 서버(Socket.IO) 별도 배포는 Phase 2/6 에서 안내합니다.
> 저장소 루트의 `index.html` 이 게임 화면(`client/`)으로 자동 이동시켜 주므로 별도 빌드가 필요 없습니다.

### 방법 1) 웹사이트에서 끌어다 놓기 (Git 설치 불필요)
1. https://github.com 로그인 → 우측 상단 `+` → **New repository**
2. Repository name: `online-gym`, **Public** 선택 → **Create repository**
3. 생성된 페이지에서 **uploading an existing file** 링크 클릭
4. 압축을 푼 `online-gym` 폴더를 **열고**, 안의 내용물(`client`, `tests`, `tools`, `index.html`, `README.md`, `package.json` …)을 **전부 선택해서** 업로드 창에 끌어다 놓기
   - ⚠️ `online-gym` 폴더 자체를 끌어다 놓으면 한 단계 안쪽에 들어가서 Pages 가 동작하지 않습니다. 업로드 후 저장소 첫 화면에 `index.html` 이 바로 보여야 합니다.
   - `.nojekyll`, `.gitignore` 는 숨김 파일이라 안 올라가도 괜찮습니다.
5. 아래 **Commit changes** 클릭
6. 저장소 **Settings** → 왼쪽 **Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` / `/ (root)` → **Save**
7. 1~3분 뒤 같은 Pages 화면 위쪽에 주소가 표시됩니다: `https://<내아이디>.github.io/online-gym/`
   (저장소 **Actions** 탭에서 "pages build and deployment" 가 초록색 ✓ 가 되면 완료)

### 방법 2) Git 명령어로 올리기 (Git 설치: https://git-scm.com)
```bash
cd online-gym
git init
git add .
git commit -m "Phase 1: 기본 3D 헬스장"
git branch -M main
git remote add origin https://github.com/<내아이디>/online-gym.git
git push -u origin main
```
그다음 위 6~7번(Settings → Pages)과 동일하게 설정합니다.

### 수정 사항 반영
파일을 다시 업로드(같은 이름이면 덮어쓰기)하거나 `git push` 하면 1~3분 뒤 자동으로 다시 배포됩니다. 브라우저에 예전 화면이 보이면 `Ctrl + Shift + R`(강력 새로고침).

### (참고) Vercel 로 배포
https://vercel.com → GitHub 로 로그인 → **Add New… → Project** → `online-gym` Import → Root Directory 를 `client` 로 지정 → Framework `Other` → **Deploy**

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| GitHub Pages 주소가 404 | Settings → Pages 에서 Branch 를 `main` / `(root)` 로 저장했는지, 저장소 첫 화면에 `index.html` 이 있는지 확인. 배포 후 1~3분 기다리기 |
| "불러오는 중…"에서 멈춤, Three.js 오류 | 인터넷 연결 또는 회사/학교 방화벽이 `cdn.jsdelivr.net` 을 막는 경우입니다. 다른 네트워크에서 시도하세요. |
| 화면이 하얗고 아무것도 안 나옴 | `index.html` 을 직접 연 경우입니다. `npm start` 후 `http://localhost:5173` 접속 |
| `npm start` 시 포트 사용 중 오류 | `node tools/serve.js 8080` 처럼 다른 포트 사용 |
| 프레임이 낮음 | ESC → 설정 → 그림자 끄기 |
| 저장된 캐릭터 초기화 | 개발자 도구 콘솔에서 `localStorage.clear()` 후 새로고침 |

---

## Phase 1 변경 파일 목록 (신규)

```
package.json
README.md
.gitignore
index.html
.nojekyll
tools/serve.js
tests/phase1.test.js
client/index.html
client/css/style.css
client/js/config.js
client/js/main.js
client/js/core/Game.js
client/js/core/Input.js
client/js/core/CameraController.js
client/js/core/storage.js
client/js/world/Gym.js
client/js/world/equipment.js
client/js/world/CollisionWorld.js
client/js/character/CharacterModel.js
client/js/character/PlayerController.js
client/js/ui/CharacterCreator.js
client/js/ui/HUD.js
client/js/ui/Menu.js
client/js/ui/dom.js
client/js/shared/appearance.js
client/js/shared/equipmentTypes.js
```
