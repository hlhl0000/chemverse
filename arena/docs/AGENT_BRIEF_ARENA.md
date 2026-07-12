# ChemVerse ARENA — 하위 에이전트 작업 지시안 (설계: Fable)

> Sonnet 구현 에이전트에게 그대로 전달되는 명세. 먼저 `arena/docs/GAME_DESIGN.md`를 읽을 것.
> **자기 담당 파일 외에는 절대 수정 금지.** 특히 본편(`ChemVerse/` 루트의 js·css·index.html)은 읽기만 허용.

## 공통 규약 (전 에이전트 필수)

1. **파일 소유권**: 지정 파일만 생성·수정. `arena/index.html`·`arena/css/arena.css`·`arena/js/main.js`·
   `arena/js/net/config.js`·`arena/js/missions/registry.js`는 Fable 소유 — 계약(시그니처·DOM id·CSS 클래스)에 맞춰 구현만 한다.
2. **포팅 지침**: 본편 코드(`../../js/…`)는 **복사 후 수정**(임포트로 연결 금지 — arena는 자립 폴더).
   원본 파일 상단 주석에 "본편 X.js에서 포팅" 명시.
3. **임포트**: three는 `import * as THREE from 'three'`(import map). 순수 로직 파일(missions 데이터, net, room)은 three 임포트 금지.
4. **디자인**: 배경 #0e1117, 패널 #13161f, 데이터 시안 #00b4d8, 팀 OX=#ff8a3d·RE=#00b4d8.
   수치는 단위 포함. 장식색 금지. UI 문구 전부 한국어.
5. **성능**: 그림자맵·텍스처 금지(버텍스/플랫 컬러), InstancedMesh 활용, pixelRatio ≤1.5, dispose 경로 제공.
6. **모바일 우선**: 터치 우선, 마우스/키보드는 보조. iOS 사파리 더블탭 줌 방지 고려.
7. **에러 처리**: 네트워크 실패는 solo 폴백 + 상태 뱃지. 콘솔 에러 0 목표.
8. **완료 보고**: 생성 파일 목록 + 각 파일 export 목록 + 계약 이탈 여부 + 미구현 잔여물.

## 디렉터리 (계약)

```
arena/
├─ index.html            # Fable — DOM 계약(아래 §DOM)
├─ css/arena.css         # Fable — 픽셀 디자인 시스템(클래스 인벤토리 §CSS)
├─ js/
│  ├─ main.js            # Fable — 통합 허브(수정 금지, 상단 주석 = 계약 원본)
│  ├─ core/
│  │  ├─ engine.js       # A — 본편 포팅(품질 프리셋 유지)
│  │  ├─ tps.js          # A — TPSControls (3인칭)
│  │  └─ voxel.js        # A — 복셀 캐릭터 빌더
│  ├─ world/
│  │  ├─ arena.js        # A — buildArena 맵 생성기
│  │  └─ players.js      # A — RemotePlayers (원격 보간)
│  ├─ ui/
│  │  ├─ joystick.js     # A — 본편 포팅(수정 불필요 시 그대로)
│  │  ├─ lobby.js        # B — Lobby (로그인·대기실·카운트다운)
│  │  └─ hud.js          # B — HUD (게임 중 오버레이)
│  ├─ net/
│  │  ├─ config.js       # Fable
│  │  ├─ net.js          # B — createNet v2 (본편 포팅+확장)
│  │  ├─ solo.js / supabase.js / wsrelay.js   # B — 포팅+확장
│  │  └─ room.js         # B — RoomSession (로스터·팀·호스트·시작)
│  └─ missions/
│     ├─ registry.js     # Fable — 스키마·등록 API
│     ├─ idealgas.js     # B — 미션 데이터(부품·퀴즈·시드 기체)
│     └─ raoult.js       # B — 스텁+설계 주석
├─ server/relay.js       # B — 본편 포팅 + 'msg' 타입 중계 추가 (:8080, arena/ 상위 루트 정적 서빙)
└─ docs/ (본 문서들)
```

## 핵심 계약 인터페이스 (main.js 상단 주석과 동일 — 불일치 시 main.js가 정답)

### 에이전트 A

```js
// core/engine.js  (본편 포팅 — 시그니처 동일)
export class Engine {
  constructor(canvas); scene; camera; renderer;
  setQuality('tablet'|'high'); onUpdate(fn(dt)); start(); stop();
}

// core/tps.js — 3인칭 조작. 본편 controls.js 포팅 후 개조
export class TPSControls {
  constructor(engine, { joystickZone, lookZone, canvas });
  object;                       // THREE.Object3D — 플레이어 루트(발 기준 y=0). 캐릭터를 child로 붙임
  setColliders(box3Array); setBounds({minX,maxX,minZ,maxZ});
  teleport([x,y,z], ry);
  getNetState();                // {p:[x,y,z], ry, an}  an: 0=idle 1=run
  speedRatio;                   // 0~1 (현재 이동속도/최대속도) — 걷기 애니메이션용
  update(dt);
}
// 카메라: 어깨너머 붐 — 뒤 4.0m·높이 2.2m, 룩존 드래그로 yaw+pitch(-30°~+55°),
// 위치는 lerp 스무딩(계수 ~10/s). 이동 5m/s, 조이스틱 데드존 15%, WASD 보조.
// 충돌: Box3 vs 원기둥 r=0.35 (본편 로직 재사용), bounds 클램프.

// core/voxel.js — 복셀 캐릭터
export function buildVoxelCharacter(THREE, { teamColor, name, seed }) {
  // 반환: { group, setAnim('idle'|'run'), update(dt, speedRatio), setName(str), dispose() }
}
// 마인크래프트 비율 블록 캐릭터 총높이 ~1.7m: 머리(팀색 고글 밴드)·몸(팀색 조끼)·
// 팔다리 스윙 걷기 사이클(speedRatio 비례). 이름표: CanvasTexture 스프라이트(본편 avatar.js 포팅).
// seed로 피부톤/머리색 미세 변화(팀색은 불변). 전부 BoxGeometry+플랫 컬러.

// world/arena.js — 맵 생성기 (시드 결정적 — 전 클라이언트 동일 맵!)
export function buildArena(THREE, missionDef, seed) {
  // 반환: {
  //   group, colliders:[Box3], bounds:{minX,maxX,minZ,maxZ},
  //   spawns: { OX:[{pos:[x,y,z],ry}…×5], RE:[…×5] },     // 각 팀 기지 앞
  //   zones: {
  //     assembly: { OX:{pos,radius}, RE:{pos,radius} },     // 조립대 발광 패드(시각+Phase B용)
  //     supply:   [{pos, itemId}…]                          // 공급 상자(Phase A는 시각만)
  //   },
  //   dispose()
  // }
}
// 40×28m, x축 대칭. 바닥 그리드, 외벽(1.2m), 엄폐 블록 InstancedMesh(시드 배치, 대칭 미러),
// 팀 기지: 팀색 발광 조립 패드 + 깃대. 공급 상자: missionDef.parts 기반 중앙 다수·외곽 소수,
// 상자 위에 부품명 라벨 스프라이트. mulberry32(seed) 계열 결정적 RNG 필수(Math.random 금지).

// world/players.js — 원격 플레이어
export class RemotePlayers {
  constructor(scene);
  upsert(id, profile, state);   // profile:{name, team} → voxel 캐릭터 생성/갱신
  remove(id); update(dt);       // 300ms 지연 버퍼 보간(본편 avatar.js 로직 포팅), an으로 걷기 애니
  count;
}
```

### 에이전트 B

```js
// net/net.js — createNet v2. 본편 계약 + msg 채널 확장
adapter = await createNet(mode /* 'auto'|'solo'|'supabase'|'wsrelay' */, CFG);
adapter.id;                            // 내 고유 id (uuid)
await adapter.join(roomKey, profile);  // profile: {name, cls, team, joinTs}
adapter.sendState(state);              // 스로틀: 이동 시 CFG.SEND_HZ, 정지 시 KEEPALIVE 1회
adapter.send(type, payload);           // ★신규: 즉시 이벤트 브로드캐스트(스로틀 없음)
adapter.on('peer',  ({id, profile, state}));
adapter.on('msg',   ({id, type, payload}));   // ★신규
adapter.on('join',  ({id, profile}));         // presence 입장
adapter.on('leave', ({id}));
adapter.on('status',({connected, count, mode}));
await adapter.leave();
// supabase: broadcast 이벤트명 'state'/'msg' 2종 + presence(profile 포함). self:false.
// wsrelay: {t:'join'|'state'|'msg'|'peers'|'leave', id, d}. solo: 전송 no-op, status만 발화.
// 구독 실패/5초 타임아웃 throw → main.js가 solo 폴백.

// net/room.js — RoomSession (three 금지, 순수 로직)
export class RoomSession {
  constructor(adapter, myProfile);
  players;                       // [{id, profile:{name,cls,team,joinTs}, isHost, me}] 정렬: joinTs,id
  isHost; myTeam;
  setTeam('OX'|'RE');            // profile 갱신 재브로드캐스트(msg 'team')
  suggestTeam();                 // 인원 밸런스 기준 추천 팀 반환
  start();                       // 호스트만: msg 'start' {seed:(1e9난수|0), t0:Date.now()} 브로드캐스트+자신도 발화
  on('roster', cb(players));     // 입장·퇴장·팀변경 시
  on('host',   cb({hostId, me}));// 호스트 확정·승계 시
  on('start',  cb({seed, t0}));  // 로컬 1회만 발화(중복 무시). 호스트는 늦은 입장자의 join 감지 시 start 재송신
  leave();
}

// ui/lobby.js — Lobby. index.html의 #lobby 내부 DOM 소유
export class Lobby {
  constructor(rootEl, missions /* listMissions() 결과 */);
  onSubmit(cb({grade, cls, name, missionId, roomNo, solo:boolean}));  // 검증 후 호출(이름 필수)
  showWaiting({roomLabel, missionName});   // 로그인 화면 → 대기실 전환
  setRoster(players, {myId});              // 팀 열 2개 렌더 + 호스트 왕관 + 나 강조
  setHost(isHost);                         // 시작 버튼 vs "호스트 대기 중" 문구 전환
  onTeamPick(cb('OX'|'RE'));  onStart(cb);  onLeave(cb);
  async countdown(n);                      // 3·2·1 풀스크린 → resolve
  showError(msg); backToLogin(); hide();
}
// 미션 카드: missions로 .mcard 렌더(선택 토글, 기본 idealgas). raoult 카드는 "준비 중" 뱃지+선택 불가.

// ui/hud.js — HUD. #hud 내부 DOM 소유
export class HUD {
  constructor(rootEl);
  setStatus({connected, count, mode});   // 우상단 뱃지 (오프라인=회색)
  setTimer(sec|null);                    // 상단 중앙 mm:ss (60초 미만 경고색)
  setScores({OX, RE});                   // 타이머 양옆 팀 점수
  setObjective(text);                    // 스폰 시 미션 목표 배너(4초 후 축소)
  setRoster(players);                    // 접이식 팀 명단
  toast(msg, ms=2200);
  show(); hide(); update(dt);
}

// missions/idealgas.js — 데이터(three 금지). registry.js 스키마 준수, registerMission() 호출
// 부품 6종(교과서 20쪽): thermo 온도계 / gascan 휴대용 기체 통 / syringe 주사기 /
// tube 투명 튜브 관 / balance 전자저울 / stand 스탠드와 집게
// quiz: 시드→기체 결정(He·N₂·O₂·CO₂·C₄H₁₀), 측정값 생성(w,V,T,P — 현실 범위),
// compute로 M=wRT/PV 검증치 포함. Phase B에서 사용하므로 데이터·순수함수 완비할 것.
// missions/raoult.js — 스텁: registerMission 호출하되 ready:false, 설계 주석(GAME_DESIGN §7) 포함.

// server/relay.js — 본편 server/relay.js 포팅: 정적 서빙 루트는 ChemVerse 루트 유지(arena/ 하위 접근 가능),
// WS 프로토콜에 {t:'msg'} 중계 추가(룸 브로드캐스트, 발신자 제외). 포트 8080 동일.
```

### DOM 계약 (index.html — Fable 소유)

`#gl`(캔버스) `#lobby`>`#scr-login`(#in-grade,#in-cls,#in-name,#mission-cards,#in-room,#btn-join,#btn-solo,#login-msg)
· `#scr-wait`(#wait-title,#wait-sub,#roster-ox,#roster-re,#btn-team-ox,#btn-team-re,#btn-start,#wait-hint,#btn-leave)
· `#scr-count`(#count-num) · `#loading` · `#hud`(내부는 HUD가 렌더) · `#joystick-zone` `#look-zone`

### CSS 클래스 인벤토리 (arena.css — Fable 소유, B는 이 클래스로 렌더)

`.mcard`(+`.on`,`.locked`) `.roster-item`(+`.me`,`.host`) `.badge`(+`.ok`,`.warn`,`.off`)
`.pxbtn`(+`.primary`,`.ghost`,`.ox`,`.re`) `.hud-top` `.hud-timer`(+`.low`) `.hud-score-ox` `.hud-score-re`
`.hud-objective` `.hud-roster` `.toast` `.kicker`

## Phase A 완료 기준 (이번 세션)

1. 로그인→미션 선택→대기실(팀·호스트)→시작→카운트다운→스폰 전 과정 동작
2. 복셀 캐릭터 TPS 이동·시점(터치+WASD), 아레나 맵(시드 결정적) 렌더
3. 원격 플레이어 보간 표시(supabase/wsrelay), solo 폴백
4. HUD: 타이머 표시(종료 시 토스트만)·점수 0:0·로스터·상태 뱃지
5. `node --check` 전 파일 통과, 콘솔 에러 0 설계

## 백로그 (Phase B~D — 착수 금지, 계약만 인지)

B: 부품 획득/조립/퀴즈(호스트 판정), 무기 4종·젖음 게이지·리스폰, 점수. host 이벤트 규약:
`msg 'req:pickup'|'req:hit'` → 호스트 검증 → `msg 'ev:pickup'|'ev:kill'|'ev:score'` 브로드캐스트.
C: 관찰 페이즈(본편 model.js 복사 사용)·결과 화면·raoult 완성. D: 교사 대시보드·사운드.
