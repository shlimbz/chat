# ONLINE GYM 🏋️

웹 브라우저에서 바로 실행되는 로우폴리 3D 온라인 멀티플레이 헬스장 게임입니다.

> **현재 단계: Phase 3 완료 (기본 3D 헬스장 + 멀티플레이 + 채팅 + 점프) · DB: 로컬 SQLite 또는 Turso**
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
클라이언트 로직 8개 + 서버 로직 11개 테스트가 실행됩니다 (서버 패키지 설치 없이도 실행 가능). DB 테스트는 로컬 SQLite 와 Turso 방식 두 가지로 모두 실행됩니다.
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
│  │  ├─ db.js                 # DB 연결 (로컬 SQLite 또는 Turso) + 스키마 관리
│  │  ├─ services/UserService.js   # 계정·토큰(해시 저장)·외형·마지막 위치
│  │  ├─ services/ChatService.js   # 채팅 저장/조회, 명령어 해석, 도배 방지
│  │  ├─ game/PlayerRegistry.js    # 접속자 관리, 이동 검증, 변경분 스냅샷
│  │  └─ socket/handlers.js        # 접속 인증, 동기화, 채팅 이벤트
│  ├─ test/services.test.js  # 로컬/Turso 두 방식 모두 테스트
│  └─ test-utils/fakeLibsql.js # 테스트용 가짜 Turso 클라이언트
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

## 배포 (무료: GitHub Pages + Render + Turso)

| 역할 | 서비스 | 비용 |
|---|---|---|
| 게임 화면 | GitHub Pages | 무료 |
| 게임 서버 (Socket.IO) | Render 무료 Web Service | 무료 (15분간 접속 없으면 잠듦, 깨어나는 데 약 1분) |
| 데이터베이스 | Turso 무료 플랜 | 무료 (서버가 재시작돼도 계정·채팅 기록 유지) |

Socket.IO, Express, Turso 연결 부품은 Render 가 `npm install` 단계에서 자동으로 설치합니다. 따로 가입·설치할 필요가 없습니다.

### 1단계: GitHub 에 올리기
저장소에 압축을 푼 `online-gym` 폴더 **안의 내용물 전체**를 업로드(덮어쓰기)합니다.
`server/node_modules`, `server/data`, `.env` 파일은 올리지 마세요.

### 2단계: Turso 데이터베이스 만들기
1. https://turso.tech 접속 → **Sign up** (GitHub 계정으로 가입)
2. 대시보드에서 **Create Database** (이름: `online-gym`, 위치는 가능하면 Tokyo/Singapore 등 아시아 지역)
3. 만든 DB 화면에서 **URL** 복사 → `libsql://online-gym-내아이디.turso.io` 형태 → 메모장에 저장
4. 같은 화면에서 **Create Token**(또는 Generate Token) → 권한은 **Read & Write**, 만료는 **Never** → 나온 긴 문자열 복사 → 메모장에 저장
   - 토큰은 다시 볼 수 없으니 꼭 저장하세요. 비밀번호와 같으니 다른 사람에게 보여주거나 GitHub 에 올리지 마세요.

### 3단계: Render 에 게임 서버 올리기
1. https://render.com → GitHub 로 가입/로그인
2. **New + → Web Service** → `online-gym` 저장소 **Connect**
3. 설정
   | 항목 | 값 |
   |---|---|
   | Name | `online-gym-server` |
   | Region | `Singapore` |
   | Branch | `main` |
   | Root Directory | **비워두기** |
   | Runtime | `Node` |
   | Build Command | `npm install --prefix server` |
   | Start Command | `npm start --prefix server` |
   | Instance Type | **Free** |
4. **Environment Variables** 에 4개 추가
   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `CLIENT_ORIGIN` | `https://내아이디.github.io` (끝에 `/` 없이) |
   | `TURSO_DATABASE_URL` | 2단계에서 복사한 `libsql://...` 주소 |
   | `TURSO_AUTH_TOKEN` | 2단계에서 복사한 토큰 |
5. **Deploy Web Service** → 로그에 `ONLINE GYM 게임 서버 실행 중` 과 `DB : Turso (...)` 가 보이면 성공
6. 화면 왼쪽 위의 `https://online-gym-server-xxxx.onrender.com` 주소 복사 → 뒤에 `/health` 를 붙여 열었을 때 `"db":"turso"` 가 보이면 정상

### 4단계: 게임 화면에 서버 주소 연결
GitHub 저장소에서 `client/js/config.js` → 연필(✏️) 아이콘 → 맨 위 줄 수정 → **Commit changes**
```js
const DEPLOYED_SERVER_URL = 'https://online-gym-server-xxxx.onrender.com';
```

### 5단계: GitHub Pages 켜기 & 접속
1. 저장소 **Settings → Pages** → Source `Deploy from a branch`, Branch `main` / `(root)` → Save (이미 했다면 생략)
2. 1~3분 뒤 `https://내아이디.github.io/online-gym/` 접속 → `Ctrl+Shift+R`
3. 우상단 초록 점 `접속자 1 / 20명` 이면 성공. 시크릿 창으로 다른 닉네임 접속 → 서로 보임

> 💡 서버가 잠들어 있으면 첫 접속이 "서버 접속 실패" 로 나올 수 있습니다. 1분 정도 기다렸다가 "다시 시도" 를 누르거나, 미리 `서버주소/health` 를 열어 깨워 두세요.

### (선택) Railway 로 서버 옮기기
잠들지 않는 서버가 필요하면 Railway(유료, 월 5달러 수준)를 쓸 수 있습니다. Build/Start Command 와 환경 변수는 Render 와 동일하고, Turso 를 그대로 쓰면 볼륨 설정도 필요 없습니다.

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| "서버 접속 실패" | 서버 주소 확인(`주소/health` 가 열리는지). Render 무료는 첫 접속에 1분 정도 걸리므로 잠시 후 "다시 시도" |
| 서버 로그에 CORS 오류 / 연결 거부 | 서버 환경 변수 `CLIENT_ORIGIN` 이 GitHub Pages 주소(`https://내아이디.github.io`, 끝에 `/` 없이)와 같은지 확인 |
| `npm run server` 에서 `node:sqlite` 오류 | Node.js 가 22.13 미만입니다. LTS 최신 버전으로 업데이트 (Render 는 `NODE_VERSION=24` 설정) |
| Render 로그에 `[Turso] ... 401` / `Unauthorized` | `TURSO_AUTH_TOKEN` 이 틀렸거나 앞뒤에 공백이 있습니다. 토큰을 새로 만들어 다시 입력 |
| Render 로그에 `[Turso] ... fetch failed` / `404` | `TURSO_DATABASE_URL` 주소 오타. Turso 대시보드에서 다시 복사 |
| 닉네임이 이미 사용 중이라고 나옴 | 다른 사람이 쓰는 닉네임이거나, 예전에 다른 브라우저에서 만든 캐릭터입니다. 그 브라우저에서 접속하거나 새 닉네임 사용 |
| 다른 탭에서 "연결이 종료" | 같은 캐릭터로 다른 창에서 접속하면 이전 창은 종료됩니다 (정상 동작) |
| 계정·채팅이 사라짐 | Turso 환경 변수가 설정되지 않아 서버 내부 파일에 저장 중입니다. `주소/health` 의 `db` 값이 `turso` 인지 확인 |
| 화면이 하얗거나 "불러오는 중"에서 멈춤 | `index.html` 을 직접 열었거나 CDN(jsdelivr) 접근이 막힌 경우. `npm start` 후 접속 |
| 프레임이 낮음 | ESC → 설정 → 그래픽 품질 "낮음", "FPS 표시"로 확인 |

---

## 변경 파일 목록 (Turso 지원)

```
변경  server/src/db.js                      (로컬 SQLite / Turso 두 방식, 비동기)
변경  server/src/services/UserService.js    (비동기)
변경  server/src/services/ChatService.js    (비동기, 저장 시 DB 왕복 1회)
변경  server/src/socket/handlers.js         (비동기 처리, 오류 시 안내)
변경  server/src/app.js, index.js, config.js (Turso 환경 변수)
변경  server/package.json                   (@libsql/client 추가)
변경  server/.env.example, server/test/services.test.js
신규  server/test-utils/fakeLibsql.js
변경  README.md
```
게임 화면(client/) 파일은 바뀌지 않았습니다.

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
