# ONLINE GYM 🏋️

웹 브라우저에서 바로 실행되는 로우폴리 3D 온라인 멀티플레이 헬스장 게임입니다.

> **현재 단계: Phase 3 완료 (기본 3D 헬스장 + 멀티플레이 + 채팅 + 점프)**
> 운동 미니게임(Phase 4)과 성장 시스템(Phase 5)은 아직 **없습니다**. 미니게임은 기획 확정 후 진행합니다.

---

## 진행 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 3D 헬스장, SD 캐릭터, 커스터마이징, 3인칭 카메라, WASD 이동, 기구 배치, 성능 최적화 | ✅ 완료 |
| 2 | Node.js + Socket.IO 서버, 닉네임 접속(토큰 인증), 위치·방향·동작 동기화, 접속/퇴장, 재접속 | ✅ 완료 |
| 3 | 전체 채팅, 채팅 기록 저장/불러오기, 귓속말, 명령어, 닉네임 클릭 귓속말, 상대별 귓속말 기록 | ✅ 완료 |
| + | 점프 (Space) — 다른 사용자에게도 표시 | ✅ 완료 |
| 4 | 운동 미니게임 | ⏸ 기획 확인 대기 |
| 5 | 레벨·경험치, 운동 기록, 근육 성장, 외형 변화 | ⏳ 예정 |
| 6 | 배포 및 20명 동시 접속 테스트 | ⏳ 예정 (배포 방법은 아래에 미리 안내) |

### 동작하는 기능

**캐릭터 / 공간**
- 동글동글한 SD 캐릭터, 커스터마이징(체형·피부·얼굴·헤어·헤어컬러·의상·상하의 색·신발), 게임 중 외형 변경
- 헬스장(32m × 24m), 운동기구 12대, 거울, 휴식 공간, 안내판
- WASD 이동, Shift 달리기, **Space 점프**, 마우스 드래그 카메라, 휠 줌, 충돌 처리
- 그래픽 품질(낮음/보통/높음), FPS 표시

**멀티플레이**
- 닉네임으로 접속 → 서버가 계정 생성 + **비밀 토큰** 발급 (브라우저에 저장)
- 재접속 시 토큰으로 본인 확인 → **닉네임만 알아서는 다른 사람을 사칭할 수 없음**
- 다른 사용자 실시간 표시(이동·방향·걷기/달리기/점프), 보간으로 부드럽게 표시
- 접속/퇴장 알림, 접속자 수, 접속자 목록(ESC 메뉴)
- 연결이 끊기면 자동 재접속 + 상태 재동기화, 같은 캐릭터로 다른 창에서 접속하면 이전 창 종료
- 서버가 이동을 검증(순간이동·범위 밖·비정상 값 차단), 외형 값도 서버에서 검증
- 서버 재시작 후에도 캐릭터 외형, 마지막 위치, 채팅 기록 유지 (DB 영구 저장 시)
- 서버에 접속할 수 없으면 "다시 시도 / 오프라인으로 플레이" 선택

**채팅**
- 좌측 하단 채팅창, `Enter` 로 입력 시작 → `Enter` 로 전송, `ESC` 로 닫기, `/` 키로 바로 명령어 입력
- 시간 표시, 닉네임/메시지 구분, 스크롤, 접기/펼치기, 한동안 조용하면 반투명
- 접속 시 최근 50개 + 내 최근 귓속말 불러오기, "↑ 이전 기록 불러오기" 로 더 오래된 기록 조회
- 귓속말: `/w 닉네임 메시지`, `/msg 닉네임 메시지`, `/r 메시지`(답장)
  - **서버가 수신자를 확인해 보낸 사람과 받는 사람에게만 전송** (전체 브로드캐스트 안 함)
  - 보라색으로 일반 채팅과 구분, [귓속말] 탭에서 상대별 기록 조회
- 채팅창 닉네임 클릭 → 귓속말 시작
- `/help`, `/who` 명령어
- 도배 방지(5초에 5개), 200자 제한, HTML 은 글자 그대로 표시(스크립트 실행 불가)
- 저장 항목: 발신자 ID, 수신자 ID, 메시지, 전송 시각, 메시지 유형

### 아직 안 되는 것
- E 키를 눌러도 미니게임은 실행되지 않고 안내만 나옵니다 (Phase 4)
- 레벨은 Lv.1 고정, 경험치·운동 기록 없음 (Phase 4~5)

---

## 실행 방법 (내 컴퓨터에서)

### 준비물
- **Node.js 22.13 이상** (https://nodejs.org 에서 **LTS** 설치. 서버 DB 에 Node.js 내장 SQLite 를 사용하므로 22.13 이상 필요)
- 확인: `node -v`

### 1) 게임 서버 실행 (터미널 1)
```bash
cd online-gym
npm run server:install   # 처음 한 번만 (express, socket.io 설치)
npm run server
```
`ONLINE GYM 게임 서버 실행 중 ▶ 주소: http://localhost:3000` 이 나오면 성공입니다.
데이터는 `server/data/online-gym.sqlite` 에 저장됩니다.

### 2) 게임 화면 실행 (터미널 2)
```bash
cd online-gym
npm start
```
브라우저에서 **http://localhost:5173** 접속.
localhost 로 접속하면 자동으로 `http://localhost:3000` 서버에 연결됩니다.

### 3) 멀티플레이 테스트
- 브라우저 창을 하나 더 열되 **시크릿 창(Ctrl+Shift+N)** 이나 다른 브라우저를 사용하세요.
  (같은 브라우저의 일반 탭은 같은 캐릭터 토큰을 공유하므로, 같은 닉네임이면 이전 탭이 종료됩니다)
- 같은 와이파이의 다른 PC에서 접속하려면: `http://내PC의IP:5173/?server=http://내PC의IP:3000`

### 서버 없이 실행
`npm start` 만 실행하고 서버를 켜지 않으면 접속 실패 창에서 "오프라인으로 플레이" 를 누르면 됩니다.
항상 오프라인으로 하려면 주소 뒤에 `?server=off` 를 붙이세요.

---

## 조작법

| 입력 | 동작 |
|---|---|
| W A S D (방향키) | 이동 (카메라 기준) |
| Shift + 이동 | 달리기 |
| Space | 점프 |
| 마우스 드래그 / 휠 | 카메라 회전 / 줌 |
| E | 가까운 운동기구 이용 |
| Enter | 채팅 입력 / 전송 |
| / | 명령어 입력 시작 |
| ESC | 채팅 닫기 → 메뉴 열기/닫기 |

### 채팅 명령어
| 명령어 | 설명 |
|---|---|
| `/w 닉네임 메시지` | 귓속말 (`/msg`, `/tell` 도 동일) |
| `/r 메시지` | 마지막 귓속말 상대에게 답장 |
| `/who` | 현재 접속자 목록 |
| `/help` | 명령어 안내 |

---

## 테스트 방법

### 자동 테스트
```bash
npm test
```
클라이언트 로직 8개 + 서버 로직 6개 테스트가 실행됩니다 (서버 패키지 설치 없이도 실행 가능).
- 서버 테스트 내용: 가입/토큰 재접속/닉네임 사칭 차단, 외형 검증, 채팅 명령어 해석, 채팅 저장·페이지 조회, 귓속말이 관련자에게만 조회되는지, 도배 방지, 이동 검증(순간이동·높이 제한)

### 수동 테스트 체크리스트 (서버 + 브라우저 2개)
1. 창 A 에서 `철수` 로 입장 → 우상단 `접속자 1 / 20명` (초록 점)
2. 창 B(시크릿) 에서 `철수` 입력 → "이미 다른 사람이 사용 중인 닉네임" 오류. `영희` 로 입장 → 두 창 모두 `접속자 2` 명, 서로 캐릭터가 보임
3. A 에서 이동/달리기/점프 → B 에서 부드럽게 따라 움직임
4. A 에서 Enter → `안녕하세요` → 두 창에 모두 표시
5. B 에서 `/w 철수 비밀` → A·B 에만 보라색 귓속말 표시. 창 C(세 번째) 에는 안 보임
6. A 에서 `/r 답장`, `/who`, `/help` 확인. 채팅창의 `영희` 클릭 → 입력창에 `/w 영희 `
7. A 를 새로고침 → 캐릭터 화면에서 바로 입장 → 같은 계정으로 재접속, 이전 채팅·귓속말 기록이 보임
8. 서버 터미널에서 Ctrl+C → 두 창에 "재연결 중…" → 서버 다시 실행 → 자동으로 다시 연결
9. A 에서 ESC → 설정 → 캐릭터 커스터마이징 → 저장 → B 화면의 A 외형도 바뀜
10. [귓속말] 탭 → 상대 선택 → 그 사람과의 귓속말 기록

---

## 폴더 구조

```
online-gym/
├─ index.html                  # GitHub Pages 루트 → client/ 로 이동
├─ client/                     # 프론트엔드 (정적 파일 → GitHub Pages)
│  ├─ index.html               # importmap(Three.js, Socket.IO 클라이언트 CDN)
│  ├─ css/style.css
│  └─ js/
│     ├─ config.js             # ★ 서버 주소(DEPLOYED_SERVER_URL) 등 설정
│     ├─ main.js               # 캐릭터 생성 → 서버 접속 → 게임 시작
│     ├─ core/                 # Game, Input, CameraController, storage, geometryUtils
│     ├─ world/                # Gym, equipment, StaticBatcher, CollisionWorld
│     ├─ character/            # CharacterModel(SD 캐릭터·애니메이션), PlayerController(이동·점프)
│     ├─ net/
│     │  ├─ NetworkClient.js   # Socket.IO 연결·재접속
│     │  └─ RemotePlayers.js   # 다른 플레이어 표시·보간
│     ├─ ui/                   # CharacterCreator, HUD, Menu, ChatPanel, ConnectDialog
│     └─ shared/               # ★ 서버와 공유 (Three.js 비의존)
│        ├─ appearance.js      # 외형·닉네임 검증
│        ├─ protocol.js        # 이벤트 이름, 동작 코드, 위치 범위, 채팅 규칙
│        └─ equipmentTypes.js
├─ server/                     # 게임 서버 (별도 호스팅)
│  ├─ package.json             # express, socket.io
│  ├─ .env.example             # 환경 변수 설명
│  ├─ src/
│  │  ├─ index.js              # 실행 진입점
│  │  ├─ app.js                # Express + Socket.IO 생성, /health
│  │  ├─ config.js             # PORT, DB_PATH, CLIENT_ORIGIN, MAX_PLAYERS
│  │  ├─ db.js                 # SQLite (node:sqlite) + 스키마 마이그레이션
│  │  ├─ services/UserService.js   # 계정·토큰(해시 저장)·외형·마지막 위치
│  │  ├─ services/ChatService.js   # 채팅 저장/조회, 명령어 해석, 도배 방지
│  │  ├─ game/PlayerRegistry.js    # 접속자 관리, 이동 검증, 변경분 스냅샷
│  │  └─ socket/handlers.js        # 접속 인증, 동기화, 채팅 이벤트
│  └─ test/services.test.js
├─ tools/serve.js              # 개발용 정적 서버
├─ tests/phase1.test.js
└─ package.json
```

### 네트워크 설계 (가볍게)
- 클라이언트 → 서버: 초당 최대 10회, **위치가 바뀌었을 때만** `[x, y, z, 방향, 동작번호]` 전송
- 서버 → 클라이언트: 초당 10회, **움직인 사람만** 묶어서 한 번에 전송 (가만히 있으면 0바이트)
- 외형은 접속 때 한 번, 바뀔 때만 전송
- 다른 플레이어는 150ms 전 시점을 보간해 그려 끊김 없이 표시
- 예상 전송량: 20명이 모두 움직여도 1인당 초당 약 6KB 수준

### 보안 설계
- 토큰 원문은 서버에 저장하지 않고 SHA-256 해시만 저장
- 닉네임 중복 불가(대소문자 무시) → 기존 닉네임으로 가입 시도는 거절
- 외형/위치/채팅 등 클라이언트가 보낸 값은 서버에서 모두 검증
- 귓속말은 `io.to(수신자소켓)` 으로 두 사람에게만 전송
- 채팅은 화면에 `textContent` 로만 표시

---

## 배포 (GitHub Pages + 게임 서버)

GitHub Pages 는 정적 파일만 제공하므로 **게임 서버는 별도 호스팅**이 필요합니다.

### 1) 게임 서버 배포

어느 서비스든 설정은 같습니다:

| 항목 | 값 |
|---|---|
| 저장소 | GitHub 의 `online-gym` |
| Root Directory | **비워두기** (서버가 `client/js/shared` 의 검증 코드를 함께 사용하므로 저장소 전체가 필요) |
| Build Command | `npm install --prefix server` |
| Start Command | `npm start --prefix server` |
| 환경 변수 `CLIENT_ORIGIN` | GitHub Pages 주소, 예: `https://내아이디.github.io` |
| 환경 변수 `DB_PATH` | 영구 디스크 경로 (아래 참고) |

Node 버전은 `package.json` 의 `engines` (22.13 이상) 를 보고 자동 선택됩니다.

#### A. Render — 빠른 테스트용 (무료, 데이터 유지 안 됨)
1. https://render.com 가입(GitHub 로그인) → **New → Web Service** → `online-gym` 저장소 선택
2. 위 표대로 Build/Start Command 입력, Instance Type **Free** → **Create Web Service**
3. **Environment** 에 `CLIENT_ORIGIN` 추가
4. 배포가 끝나면 `https://online-gym-xxxx.onrender.com` 형태의 주소가 생깁니다. `주소/health` 로 확인

⚠️ 무료 플랜은 **15분간 접속이 없으면 잠들고, 다시 깨어날 때 약 1분** 걸립니다. 또한 **재시작·잠들기·재배포 때마다 SQLite 파일이 지워져** 계정·채팅 기록이 사라집니다. 무료로는 영구 디스크를 붙일 수 없으므로 기능 테스트용으로만 쓰세요.

#### B. Railway — 데이터 유지 (볼륨 지원)
1. https://railway.com 가입 → **New Project → Deploy from GitHub repo** → `online-gym`
2. 서비스 **Settings**: Build Command `npm install --prefix server`, Start Command `npm start --prefix server`
3. 서비스에서 **Volume** 추가 → Mount Path `/data`
4. **Variables**: `DB_PATH=/data/online-gym.sqlite`, `CLIENT_ORIGIN=https://내아이디.github.io`
5. **Settings → Networking → Generate Domain** 으로 공개 주소 생성 → `주소/health` 확인

Railway 의 무료 플랜은 30일 체험 크레딧 이후 사용량이 제한적이므로, 계속 운영하려면 Hobby 플랜(월 5달러 수준)을 고려하세요. 요금은 바뀔 수 있으니 가입 시 공식 요금표를 확인하세요.

### 2) 프론트엔드에 서버 주소 연결
`client/js/config.js` 맨 위의 한 줄을 서버 주소로 바꿉니다 (GitHub 웹에서 연필 아이콘으로 바로 수정 가능):
```js
const DEPLOYED_SERVER_URL = 'https://online-gym-xxxx.onrender.com';
```
수정 없이 테스트만 해보려면 게임 주소 뒤에 붙이면 됩니다 (브라우저에 기억됨):
```
https://내아이디.github.io/online-gym/?server=https://online-gym-xxxx.onrender.com
```

### 3) GitHub 에 올리기 / GitHub Pages 켜기
1. 저장소에 압축을 푼 `online-gym` 폴더 **안의 내용물 전체**를 업로드(덮어쓰기)
   - `server/node_modules`, `server/data` 는 올리지 마세요 (`.gitignore` 에 포함)
2. **Settings → Pages** → Source `Deploy from a branch`, Branch `main` / `(root)` → Save
3. 1~3분 뒤 `https://내아이디.github.io/online-gym/` 접속 → 우상단 초록 점 `접속자 1 / 20명` 이면 서버 연결 성공

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| "서버 접속 실패" | 서버 주소 확인(`주소/health` 가 열리는지). Render 무료는 첫 접속에 1분 정도 걸리므로 잠시 후 "다시 시도" |
| 서버 로그에 CORS 오류 / 연결 거부 | 서버 환경 변수 `CLIENT_ORIGIN` 이 GitHub Pages 주소(`https://내아이디.github.io`, 끝에 `/` 없이)와 같은지 확인 |
| `npm run server` 에서 `node:sqlite` 오류 | Node.js 가 22.13 미만입니다. LTS 최신 버전으로 업데이트 |
| 닉네임이 이미 사용 중이라고 나옴 | 다른 사람이 쓰는 닉네임이거나, 예전에 다른 브라우저에서 만든 캐릭터입니다. 그 브라우저에서 접속하거나 새 닉네임 사용 |
| 다른 탭에서 "연결이 종료" | 같은 캐릭터로 다른 창에서 접속하면 이전 창은 종료됩니다 (정상 동작) |
| 계정·채팅이 사라짐 | Render 무료처럼 영구 디스크가 없는 호스팅입니다. Railway 볼륨 등 사용 |
| 화면이 하얗거나 "불러오는 중"에서 멈춤 | `index.html` 을 직접 열었거나 CDN(jsdelivr) 접근이 막힌 경우. `npm start` 후 접속 |
| 프레임이 낮음 | ESC → 설정 → 그래픽 품질 "낮음", "FPS 표시"로 확인 |

---

## 변경 파일 목록 (Phase 2 + 3 + 점프)

```
신규  server/ (전체)
신규  client/js/shared/protocol.js
신규  client/js/net/NetworkClient.js
신규  client/js/net/RemotePlayers.js
신규  client/js/ui/ChatPanel.js
신규  client/js/ui/ConnectDialog.js
변경  client/js/main.js                    (서버 접속 흐름, 닉네임 중복 처리, 오프라인 선택)
변경  client/js/core/Game.js               (네트워크·원격 플레이어·채팅 연결)
변경  client/js/core/storage.js            (서버별 토큰 저장)
변경  client/js/config.js                  (서버 주소 설정, 점프 수치)
변경  client/js/character/PlayerController.js (점프, 전송 상태 형식)
변경  client/js/character/CharacterModel.js   (점프 포즈, 착지 효과)
변경  client/js/ui/HUD.js, Menu.js, CharacterCreator.js
변경  client/js/world/Gym.js               (안내판 문구)
변경  client/index.html                    (socket.io-client importmap)
변경  client/css/style.css                 (채팅·접속 창)
변경  package.json                         (서버 스크립트, Node 22.13+)
변경  README.md
```
