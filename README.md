# ONLINE GYM 🏋️

웹 브라우저에서 바로 실행되는 로우폴리 3D 온라인 멀티플레이 헬스장 게임입니다.

> **현재 버전: Phase 3 + 계정·관리자·전투·모바일 + 캐릭터·운동 동작 업데이트**
> 운동 미니게임(Phase 4)과 성장 시스템(Phase 5)은 아직 **없습니다**. 미니게임은 기획 확정 후 진행합니다.

---

## 진행 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 3D 헬스장, SD 캐릭터, 커스터마이징, 3인칭 카메라, 이동, 기구 배치, 최적화 | ✅ |
| 2 | Socket.IO 서버, 위치·동작 동기화, 접속/퇴장, 재접속 | ✅ |
| 3 | 전체 채팅, 기록 저장, 귓속말, 명령어 | ✅ |
| + | 점프, **계정(아이디/비밀번호) + 캐릭터 3개**, **관리자**, **주먹·발차기**, **높이 있는 물리**, **모바일** | ✅ |
| 4 | 운동 미니게임 | ⏸ 기획 확인 대기 |
| 5 | 레벨·경험치, 운동 기록, 근육 성장 | ⏳ 예정 |

### 동작하는 기능

**계정 / 캐릭터**
- 아이디 + 비밀번호로 회원가입·로그인 (비밀번호는 서버에 해시로만 저장)
- 한 번 로그인하면 30일 동안 자동 로그인 → 바로 **캐릭터 선택 화면**
- 계정당 캐릭터 **최대 3개**: 만들기 / 꾸미기 / 삭제, 마지막으로 플레이한 캐릭터가 맨 앞
- 예전 버전(계정 없이)에서 만든 캐릭터는 같은 브라우저로 로그인하면 자동으로 계정에 들어옴
- 게임 중 ESC → 캐릭터 변경 / 로그아웃

**캐릭터 (동물의숲 느낌)**
- 몸통은 "표면 하나"에 상의/하의를 색으로 나눈 구조 → 배·가슴이 커져도 옷을 뚫고 나오지 않음
- 팔·다리는 관 하나로 만들어 팔꿈치·무릎에서 부드럽게 굽음 (관절 사이 끊김 없음), 소매·바짓단도 같은 관
- 체형마다 팔이 몸에 묻히지 않을 만큼 자동으로 벌려 서 있음
- 머리카락·모자는 "얼굴 보호 구역" 아래로 내려오지 않음 → 눈·눈썹·코·입이 가려지지 않음 (헤어 13 × 얼굴형 4 × 모자 11 조합 자동 검사)

**캐릭터 꾸미기**
- 성별(남/여), 체형 예시(보통·슬림·근육질·통통) + **근육량·몸무게·키 슬라이더**
- 헤어 13종: 숏컷, 버즈컷, 스파이키, 롱헤어(등까지), 포니테일, 양갈래, 똥머리, **바가지머리, 헤이하치컷, 모히칸, 아프로, 상투**, 민머리
- 눈 9종(콩알·속눈썹·윙크 등) + 눈 색 6, 눈썹 4, 코 4, 입 6, 볼(볼터치·진한 볼터치·주근깨·없음), 피부색 8
- 말하면 캐릭터 머리 위에 **말풍선** (전체 채팅만, 귓속말은 표시 안 함)

**코인 · 치장 상점**
- 기구 운동 **3초마다 1코인**
- 샌드백은 좌우로 흔들림 → 바닥 불이 **초록색**(샌드백이 가운데)일 때 맞히면 **PERFECT**: 주먹 2코인 · 발차기 3코인, 옆으로 가 있을 때 치면 MISS (타이밍은 서버가 판정)
- 시간당 최대 1500코인
- 코인은 **서버가 직접 확인해서** 지급 (진짜 기구 자리에서 그 운동 중인지, 샌드백을 정면에서 쳤는지) → 조작으로 못 벌음
- 새 계정·기존 계정 모두 시작 코인 300
- **I 키 = 🎒 가방**: 가진 아이템만 모아 보고 착용/벗기
- **치장 상점은 서쪽 벽(레그프레스 옆) 가판대**에서 E (구매·판매는 가판대 앞에서만 — 서버가 위치 확인): 미리 입어보기 → 구매(바로 착용) / 착용·벗기 / 되팔기(50%)
- 아이템 49종: 모자 10, 안경 5, 목 5, 귀 2, 신발 4, 옷 디자인 6(상의 색 위에 그려짐), 등(가방·망토·제트팩·날개) 5, **트레일 5**(움직이면 빛이 남음), **오라 3**(발밑 빛나는 고리)
- 보유 아이템·코인은 **계정 단위** (같은 계정의 캐릭터끼리 공유)

**오늘의 랭킹** (한국 시간 자정마다 초기화)
- 💪 운동 시간 · 🥊 샌드백 명중 수 Top 10 — 서버가 검증한 기록만 집계
- 헬스장 한가운데 천장에 매달린 **양면 전광판**에 Top 5 실시간 표시 (바뀌면 5초 안에 갱신), 전광판 아래에서 E → Top 10 + 내 기록

**라운지**: 러그 위 소파 2개 + 1인 소파 2개가 커피 테이블을 둘러싸 서로 마주 보고 앉아 이야기 (8자리)

**기구 운동 · 벤치 앉기**
- 기구 앞에서 E → 그 기구에 맞는 동작을 E(또는 ESC)를 다시 누를 때까지 반복
  - 러닝머신(벨트가 흐름) / 벤치프레스(바벨 오르내림) / 덤벨컬(랙에서 덤벨을 들고 감) / 레그프레스(발판이 레일 따라 밀림) / 숄더프레스(손잡이·웨이트 스택) / 랫풀다운(바·케이블·웨이트 스택)
- 휴식 벤치에서 E → 앉기 (벤치 앞/뒤 서 있는 쪽을 보고 앉음)
- 다른 사람에게도 동작이 그대로 보이고, 누가 쓰고 있으면 "사용 중"
- 미니게임(점수·경험치)은 아직 없음 — 나중에 이 동작 위에 붙일 예정

**관리자** (환경 변수 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 로 만든 계정)
- 이름표가 금색 ★, 채팅에 [관리자] 표시
- ESC → 🛡️ 관리자 패널: 접속자별 뮤트·추방·차단·캐릭터 삭제, 전체 공지, 차단 해제
- 채팅 명령어: `/kick 닉네임 [사유]`, `/ban 닉네임 [사유]`, `/unban 계정아이디`, `/mute 닉네임 [분]`, `/unmute 닉네임`, `/notice 내용`, `/delchar 닉네임`, `/deluser 계정아이디`, `/give 닉네임 코인` (음수면 회수)
- 다른 관리자에게는 추방/차단/삭제 불가

**전투 (서로 때리며 놀기)**
- **J 주먹(좌우 번갈아), K 발차기** (ESC → 설정에서 다른 키로 변경 가능) / 모바일은 👊 🦵 버튼
- 주먹: 준비 → 뻗기 → 가드 자세, 발차기: 무릎 접기 → 뻗기 (팔꿈치·무릎 관절로 자연스럽게)
- 샌드백을 치면 흔들림
- 맞으면 뒤로 밀려나고 움찔, 짧은 시간에 여러 번 맞으면 **벌러덩 넘어져 2.5초 기절**(머리 위 별)
- 타격 이펙트 + 효과음(설정에서 끄기 가능)
- 판정은 서버가 함 (거리·방향·쿨다운 확인) → 조작으로 아무나 때릴 수 없음

**물리**
- 기구마다 높이가 있어서: 벤치 쿠션·휴식 벤치는 **점프로 넘거나 올라설 수 있고**, 거치대·머신처럼 높은 부분은 막힘
- 러닝머신 발판 같은 낮은 턱은 걸어서 올라감, 가장자리에서 걸어 나가면 떨어짐
- 점프 높이 약 1m

**모바일 (채팅 특화)**
- 왼쪽 아래 조이스틱(끝까지 밀면 달리기), 오른쪽 아래 점프·주먹·발차기, 기구 근처에서 [이용] 버튼
- 화면 드래그 = 카메라 회전, 두 손가락 = 확대/축소
- 💬 버튼 = **채팅 모드**: 채팅창이 화면 전체로 커지고 키보드에 가리지 않음, 3D 는 절전 모드
- 모바일 첫 실행 시 그래픽 품질 자동 "낮음"

**맵**: 안내 데스크, 원판 거치대, 케틀벨, 스트레칭 매트·짐볼, 샌드백, 사물함, 수건 선반, 바닥 트랙, 포스터, 벽시계, 스피커, 화분 추가

**기존 기능**: 헬스장, 실시간 멀티플레이(보간), 전체 채팅·귓속말·기록, 재접속, 그래픽 품질

**성능 표시·자동 조절**: ESC → 설정 → "FPS 표시" 를 켜면 `FPS · 핑 · 해상도 · 드로우콜` 이 보입니다.
- FPS 가 낮다 → 내 기기(그래픽) 문제 → 그래픽 품질 낮추기 (해상도 자동 조절이 기본으로 켜져 있음)
- 핑이 높다(200ms 이상) → 서버·네트워크 문제 (무료 서버 지연)

### 아직 안 되는 것
- E/[이용] 을 눌러도 미니게임은 실행되지 않고 안내만 나옵니다 (Phase 4)
- 레벨은 Lv.1 고정, 경험치·운동 기록 없음 (Phase 4~5)
- 비밀번호 찾기/변경 기능 없음 (잊어버리면 관리자가 `/deluser` 후 다시 가입)

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
내 컴퓨터에서 관리자를 테스트하려면: `ADMIN_USERNAMES=내아이디 npm run server` (윈도우 PowerShell: `$env:ADMIN_USERNAMES="내아이디"; npm run server`)
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
| J / K | 주먹 / 발차기 (설정에서 변경) |
| E | 기구 운동 / 벤치 앉기 (다시 E 로 그만) |
| Enter | 채팅 입력 / 전송 |
| / | 명령어 입력 시작 |
| ESC | 채팅 닫기 → 메뉴 열기/닫기 |

### 채팅 명령어
| 명령어 | 설명 |
|---|---|
| `/w 닉네임 메시지` | 귓속말 (`/msg`, `/tell` 도 동일) |
| `/r 메시지` | 마지막 귓속말 상대에게 답장 |
| `/who` | 현재 접속자 목록 |
| `/help` | 명령어 안내 (관리자는 관리자 명령어도 표시) |

---

## 테스트 방법

### 자동 테스트
```bash
npm test
```
클라이언트 로직 8개 + 서버 로직 11개 테스트가 실행됩니다 (서버 패키지 설치 없이도 실행 가능). DB 테스트는 로컬 SQLite 와 Turso 방식 두 가지로 모두 실행됩니다.
- 서버 테스트 내용: 가입/토큰 재접속/닉네임 사칭 차단, 외형 검증, 채팅 명령어 해석, 채팅 저장·페이지 조회, 귓속말이 관련자에게만 조회되는지, 도배 방지, 이동 검증(순간이동·높이 제한)

### 수동 테스트 체크리스트
1. 접속 → 로그인 화면 → [회원가입] 으로 가입 → 캐릭터 선택 화면 → [+ 새 캐릭터 만들기] → 입장
2. 새로고침 → 로그인 없이 바로 캐릭터 선택 화면, 만든 캐릭터가 그대로 있음
3. 시크릿 창에서 다른 아이디로 가입 → 같은 닉네임으로 캐릭터를 만들면 "이미 사용 중인 닉네임" 오류
4. 두 캐릭터가 서로 보이고, 이동·점프가 부드럽게 따라옴
5. 서로 마주 보고 F/G → 맞은 쪽이 밀려남, 여러 번 맞으면 넘어져 별이 돎
6. 벤치 쿠션 쪽으로 걸어가면 막힘 → Space 로 점프하면 넘어가거나 올라섬
7. 관리자 아이디로 접속 → 이름표 ★, ESC 에 관리자 패널. `/mute`, `/kick`, `/ban`, `/unban`, `/notice` 확인
8. 휴대폰으로 접속 → 조이스틱·버튼으로 이동/공격, 💬 로 채팅 모드

### 같은 PC 에서 두 창으로 테스트할 때 주의
브라우저는 **보이지 않거나 포커스가 없는 창**의 화면 갱신을 크게 줄이거나 멈춥니다. 그 창의 캐릭터는 위치를 자주 못 보내서 다른 창에서 버벅이는 것처럼 보일 수 있습니다. 두 창을 **나란히 둘 다 보이게** 놓고 테스트하거나, 휴대폰 + PC 처럼 다른 기기로 테스트하세요. 실제로 사람마다 다른 기기에서 접속하면 이 현상은 없습니다.

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
│     │  ├─ ApiClient.js       # 로그인·캐릭터 REST API
│     │  ├─ NetworkClient.js   # Socket.IO 연결·재접속 (웹소켓 전용)
│     │  └─ RemotePlayers.js   # 다른 플레이어 표시·서버 시각 기반 보간
│     ├─ ui/                   # AccountScreens(로그인·캐릭터 선택), CharacterCreator, CharacterPreview,
│     │                        # HUD, Menu(관리자 패널), ChatPanel, ConnectDialog, mobile(터치 조작)
│     └─ shared/               # ★ 서버와 공유 (Three.js 비의존)
│        ├─ appearance.js      # 외형·닉네임 검증
│        ├─ protocol.js        # 이벤트 이름, 동작 코드, 위치 범위, 채팅 규칙
│        └─ equipmentTypes.js
├─ server/                     # 게임 서버 (별도 호스팅)
│  ├─ package.json             # express, socket.io
│  ├─ .env.example             # 환경 변수 설명
│  ├─ src/
│  │  ├─ index.js              # 실행 진입점
│  │  ├─ app.js                # Express(로그인·캐릭터 API) + Socket.IO, /health
│  │  ├─ config.js             # PORT, DB_PATH, CLIENT_ORIGIN, MAX_PLAYERS
│  │  ├─ db.js                 # DB 연결 (로컬 SQLite 또는 Turso) + 스키마 관리
│  │  ├─ services/AccountService.js   # 계정·비밀번호(scrypt)·세션·차단
│  │  ├─ services/CharacterService.js # 캐릭터(계정당 3개)·외형·마지막 위치
│  │  ├─ services/ChatService.js   # 채팅 저장/조회, 명령어 해석, 도배 방지
│  │  ├─ game/PlayerRegistry.js    # 접속자 관리, 이동 검증, 변경분 스냅샷
│  │  ├─ game/combat.js            # 주먹/발차기 판정, 넉백, 기절
│  │  └─ socket/handlers.js        # 접속 인증(세션+캐릭터), 동기화, 채팅, 전투, 관리자 기능
│  ├─ test/services.test.js  # 로컬/Turso 두 방식 모두 테스트
│  └─ test-utils/fakeLibsql.js # 테스트용 가짜 Turso 클라이언트
├─ tools/serve.js              # 개발용 정적 서버
├─ tests/phase1.test.js
└─ package.json
```

### 네트워크 설계 (가볍게)
- 클라이언트 → 서버: 초당 최대 12회, **위치가 바뀌었을 때만** `[x, y, z, 방향, 동작번호]` 전송
- 서버 → 클라이언트: 초당 12회, **움직인 사람만** 묶어서 서버 시각과 함께 전송 (가만히 있으면 0바이트)
- 처음부터 웹소켓으로 연결 (HTTP 폴링 단계를 건너뛰어 지연·패킷 몰림 방지)
- 외형은 접속 때 한 번, 바뀔 때만 전송
- 다른 플레이어는 서버 시각 기준 130ms 전 시점을 보간, 데이터가 잠깐 끊기면 짧게 예측해서 멈칫하지 않게 표시
- 예상 전송량: 20명이 모두 움직여도 1인당 초당 약 6KB 수준

### 보안 설계
- 비밀번호는 scrypt 해시, 로그인 세션 토큰은 SHA-256 해시로만 저장
- 로그인/가입 시도 제한 (IP 당 10분에 20회)
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
4. **Environment Variables** 에 5개 추가
   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `CLIENT_ORIGIN` | `https://내아이디.github.io` (끝에 `/` 없이) |
   | `TURSO_DATABASE_URL` | 2단계에서 복사한 `libsql://...` 주소 |
   | `TURSO_AUTH_TOKEN` | 2단계에서 복사한 토큰 |
   | `ADMIN_USERNAME` | 관리자 계정 아이디 (예: `ADMING`) — 서버가 시작할 때 자동으로 만들어짐 |
   | `ADMIN_PASSWORD` | 관리자 계정 비밀번호 — **여기에만 입력, GitHub 파일에는 절대 적지 마세요** |

   > 관리자 비밀번호를 바꾸고 싶으면 `ADMIN_PASSWORD` 값만 바꾸고 저장하세요. 서버가 재시작되면서 새 비밀번호로 맞춰집니다.
   > 예전 방식인 `ADMIN_USERNAMES` 는 "그 아이디로 먼저 가입하는 사람이 관리자가 되는" 위험이 있어 이미 만들어진 계정에만 쓰세요.
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

## 변경 내용 (위치 어긋남·채팅 지연·샌드백 미니게임)
> ⚠️ 통신 버전 7. 게임 화면과 서버를 둘 다 올려야 접속됩니다.
- 다른 사람이 기구에 앉을 때 위치가 어긋나 보이던 문제 수정 (순간이동을 "걷는 중"으로 잘못 예측하던 부분)
- 채팅: 서버가 DB 저장을 기다리지 않고 바로 전달, 내 메시지는 보내는 즉시 화면에 표시
- 샌드백 PERFECT 타이밍 미니게임, 랭킹도 PERFECT 횟수 기준

## 변경 내용 (메뉴 정리·상점 가판대·실시간 랭킹·모바일 채팅·캐릭터 충돌)
> ⚠️ 통신 버전 6. 게임 화면과 서버를 둘 다 올려야 접속됩니다.
- ESC 메뉴: 계속하기 / 캐릭터 정보(꾸미기·캐릭터 변경) / 가방 / 설정 / 로그아웃 (관리자는 관리자 패널 추가)
- 캐릭터끼리 충돌: 걸어가 부딪히면 상대를 천천히 밀고 감 (운동·앉기 중인 사람은 제외)
- 모바일: 왼쪽 위 채팅을 누르면 바로 입력(반투명 화면, [전송] 버튼), 🎮 버튼으로 게임 복귀 / 발차기 버튼 = 발바닥 / 오른쪽 위 💬 🎒 ☰ / 30fps 제한(설정에서 끄기) / 빈 화면 드래그로 카메라 회전
- 설정: "30fps 제한", "다른 사람 트레일·오라 보기" 추가

## 변경 파일 목록 (동물의숲 스타일 캐릭터·라운지·랭킹·가방 업데이트)
> ⚠️ 통신 버전이 5 로 올라갔습니다. 게임 화면과 서버를 둘 다 새 버전으로 올려야 접속됩니다. DB 는 자동으로 v5 (랭킹 테이블 추가).

| 파일 | 내용 |
|---|---|
| `client/js/character/bodyMesh.js`, `prim.js` (새 파일) | 매끈한 몸통·팔·다리, 캐릭터용 도형 생성 |
| `client/js/character/CharacterModel.js`, `headShape.js`, `accessoryParts.js` | 새 몸, 얼굴 보호 구역, 눈/볼 옵션, 아이템을 새 몸에 맞춤 |
| `server/src/services/StatsService.js` (새 파일), `db.js`, `socket/handlers.js` | 오늘의 랭킹 |
| `client/js/ui/Ranking.js` (새 파일), `Shop.js`(가방 모드), `HUD.js`, `Menu.js` | 랭킹 창, 가방(I) |
| `client/js/world/Gym.js`, `decor.js` | 매트 깜빡임 수정, 샌드백 높이, 라운지, 랭킹 전광판 |

## 변경 파일 목록 (코인·치장 상점·기구 움직임 업데이트)
> ⚠️ 통신 버전이 4 로 올라갔습니다. **게임 화면(GitHub Pages)과 서버(Render)를 둘 다 새 버전으로** 올려야 접속됩니다.
> DB 는 서버가 시작할 때 자동으로 v4 로 바뀌고(기존 계정에 300코인 지급) 기존 데이터는 그대로입니다.

| 파일 | 내용 |
|---|---|
| `client/js/shared/economy.js` (새 파일) | 코인 규칙 (운동/샌드백 지급량, 시간당 상한, 판매 비율) |
| `client/js/shared/gymLayout.js` (새 파일) | 기구·샌드백 배치 (서버가 코인 판정에 같은 배치 사용) |
| `client/js/shared/appearance.js` | 치장 아이템 49종 카탈로그 |
| `server/src/services/EconomyService.js` (새 파일) | 지갑(메모리+DB), 벌기·구매·판매·관리자 지급 |
| `server/src/socket/handlers.js` | 운동/샌드백 코인 지급, 상점 요청, `/give` |
| `server/src/db.js` | v4 마이그레이션 |
| `client/js/ui/Shop.js` (새 파일), `HUD.js`, `Menu.js`, `css/style.css` | 상점 화면, 코인 표시 |
| `client/js/character/accessoryParts.js`, `CosmeticFx.js`, `polygons.js` (새 파일) | 아이템 모델, 트레일/오라 이펙트 |
| `client/js/character/headShape.js` (새 파일) | 머리·헤어·얼굴 파츠가 같은 머리 표면을 쓰도록 (겹침 방지) |
| `client/js/world/equipment.js`, `Gym.js` | 기구 디테일 + 움직이는 부품 |

## 변경 파일 목록 (캐릭터·운동 동작·말풍선·맵·최적화 업데이트)

```
변경  client/js/character/CharacterModel.js  (스킨드 메시 1개 + 팔꿈치·무릎 관절, 성별·체형 슬라이더, 새 헤어,
                                           악세사리 모양, 펀치·킥 개선, 앉기·운동 자세, 말풍선, 실루엣 다듬기)
변경  client/js/character/PlayerController.js (운동/앉기 상태, 메모리 재사용)
변경  client/js/shared/appearance.js (성별·슬라이더·헤어·악세사리 카탈로그, 예전 데이터 호환)
변경  client/js/shared/protocol.js (앉기·운동 동작 코드, 핑), shared/equipmentTypes.js (운동 자세 위치)
신규  client/js/world/decor.js (소품)
변경  client/js/world/Gym.js (벤치 앉을 자리, 기구 부품 움직임, 샌드백, 소품 배치)
변경  client/js/core/Game.js (운동/앉기, 말풍선, 공격 키 설정, 핑, 해상도 자동 조절)
변경  client/js/net/RemotePlayers.js (다른 사람 동작 동기화), net/NetworkClient.js (핑)
변경  client/js/ui/CharacterCreator.js (성별·체형 슬라이더), Menu.js (키 설정), HUD.js, mobile.js, dom.js
변경  client/js/core/Input.js, CameraController.js, storage.js, client/css/style.css, client/js/main.js
변경  server/src/services/AccountService.js (관리자 자동 생성, 예약 아이디, 세션 정리), app.js, config.js, index.js
변경  server/src/db.js (스키마 v3: 재화·보유 아이템 칸), socket/handlers.js (핑, 악세사리 검증),
      game/PlayerRegistry.js, services/CharacterService.js, server/test/services.test.js, tests/phase1.test.js
```

## 변경 파일 목록 (계정·관리자·전투·물리·모바일 업데이트)

```
신규  server/src/services/AccountService.js, server/src/services/CharacterService.js (UserService.js 대체)
신규  server/src/game/combat.js
변경  server/src/db.js (스키마 v2: accounts, sessions — 기존 DB 는 서버 시작 시 자동 변환)
변경  server/src/app.js (로그인·캐릭터 API, CORS), server/src/socket/handlers.js (세션 인증, 전투, 관리자)
변경  server/src/config.js, index.js (ADMIN_USERNAMES), server/src/game/PlayerRegistry.js, services/ChatService.js
변경  server/test/services.test.js
신규  client/js/net/ApiClient.js, client/js/ui/AccountScreens.js, client/js/ui/CharacterPreview.js, client/js/ui/mobile.js
신규  client/js/core/Effects.js
변경  client/js/main.js, core/Game.js, core/Input.js, core/CameraController.js, core/storage.js
변경  client/js/character/CharacterModel.js (공격·피격·기절 모션), PlayerController.js (높이 물리, 넉백)
변경  client/js/world/CollisionWorld.js (높이 충돌), world/equipment.js, world/Gym.js
변경  client/js/net/NetworkClient.js, net/RemotePlayers.js (버벅임 개선)
변경  client/js/ui/CharacterCreator.js, ChatPanel.js, HUD.js, Menu.js
변경  client/js/shared/protocol.js, client/js/config.js, client/index.html, client/css/style.css
변경  tests/phase1.test.js, README.md
```

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
