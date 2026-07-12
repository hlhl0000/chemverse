# ChemVerse 하위 에이전트 작업 지시안 (설계: Fable)

> 이 문서는 Sonnet(구현)·Opus(확장) 에이전트에게 그대로 전달되는 작업 명세다.
> 에이전트는 반드시 `docs/ARCHITECTURE.md`를 먼저 읽고, **자기 담당 파일 외에는 절대 수정하지 않는다.**

## 공통 규약 (모든 에이전트 필수)

1. **파일 소유권**: 지정된 파일 목록만 생성·수정. `js/main.js`, `js/experiments/registry.js`, `index.html`의 계약(함수 시그니처, DOM id)은 변경 금지 — 거기에 맞춰 구현한다.
2. **임포트**: three는 `import * as THREE from 'three'` (import map이 해석). 물리 모델 파일(`model.js`)은 three 임포트 금지.
3. **디자인**: 디자인매뉴얼 v2.0 준수 — 배경 #0e1117, 패널 --s1 #13161f, 데이터 시안 #00b4d8, 수치는 반드시 모노스페이스+단위. 장식색 금지, colorblind-safe.
4. **성능**: 그림자맵 금지, 텍스처 금지(재질 색상만), InstancedMesh 활용, pixelRatio ≤ 1.5. 지오메트리·머티리얼은 dispose 경로 제공.
5. **한국어 UI**: 모든 라벨·힌트는 한국어, 물리량 기호는 국제 표기 (P, V, n, T, kPa, L, mol, K).
6. **모바일 우선**: 모든 인터랙션은 터치 탭/드래그로 동작해야 하며 마우스는 보조.
7. **에러 처리**: 네트워크 실패는 조용히 solo 모드로 폴백하고 HUD에 상태 뱃지만 표시. 콘솔 에러 0 목표.
8. 완료 보고에는 생성 파일 목록, 각 파일의 export 목록, 계약 위반 여부, 미구현 잔여물을 명시한다.

---

## 에이전트 A (Sonnet) — 3D 월드·조작·네트워크

담당 파일: `js/core/engine.js`, `js/core/controls.js`, `js/core/interact.js`,
`js/world/spaces.js`, `js/world/lab.js`, `js/world/nature.js`, `js/world/avatar.js`,
`js/net/net.js`, `js/net/solo.js`, `js/net/supabase.js`, `js/net/wsrelay.js`,
`js/ui/joystick.js`, `server/relay.js`

### A-1. Engine (`core/engine.js`)
```js
export class Engine {
  constructor(canvas)         // WebGLRenderer(antialias:false→FXAA 없음, alpha:false)
  scene; camera;              // PerspectiveCamera(70), near .1 far 300
  onUpdate(fn); start(); stop();
  setQuality('tablet'|'high') // pixelRatio, fog 거리
}
```
- 배경: scene.fog + 배경색 #0e1117 계열, 헤미스피어+디렉셔널 라이트(그림자 없음)
- resize: devicePixelRatio 캡 1.5

### A-2. PlayerControls (`core/controls.js`)
- 카메라 리그: yawObject(이동) > pitchObject > camera. 눈높이 1.6m
- 좌측 가상 조이스틱(= `ui/joystick.js`)으로 이동(최대 4m/s), 화면 우측 드래그로 시점 회전
- 데스크톱: WASD + 캔버스 드래그 룩 (pointer lock은 클릭 시 선택적)
- 충돌: SpaceManager가 주는 AABB 목록과 원기둥 충돌(반지름 0.3m), 바닥 y 고정
- `getNetState()` → `{p:[x,y,z], ry, space}` / `teleport(pos, ry)`

### A-3. Interactor (`core/interact.js`)
- 탭 → raycast → `userData.interactable` 있는 최상위 오브젝트 선택
- 하이라이트: emissive 펄스. 상호작용 종류: `tap`(콘솔/밸브), `carry`(기구 들기/놓기)
- carry: 오브젝트를 카메라 앞 0.8m에 부착 → 스냅 포인트(월드가 제공) 3m 내 탭 시 안착
- 이벤트 버스: `interact.on('placed'|'picked'|'tapped', cb)` — 실험 시스템(B)이 구독

### A-4. 공간 (`world/spaces.js`, `lab.js`, `nature.js`)
- `SpaceManager.register(id, builderFn)` / `await go(id)` — 이전 공간 dispose 보장
- **실험실**: 12×16m, 벽·바닥(그리드 라인 머티리얼), 실험대 4개(모둠), 기구 선반 1식,
  각 실험대에 콘솔 패널(탭→실험 선택 UI 호출 콜백), 자연 공간 포털(발광 게이트)
- **자연 공간**: 저폴리 언덕 지형(사인 합성 높이맵), 하늘 그라데이션, 나무 10여 그루(InstancedMesh),
  고도 표지판 3개(0m/1000m/3000m), 각 표지판 옆 "밀봉 풍선" 데모 스팟(B의 모델 연동용 훅 `nature.onAltitudeZone(cb)`), 실험실 복귀 포털
- 빌더 반환 계약: `{ group, colliders:[Box3], spawn:{pos,ry}, dispose() }`

### A-5. 아바타 (`world/avatar.js`)
- 저폴리 캡슐+헤드, 프로필 색, 이름표(CanvasTexture 스프라이트)
- `RemoteAvatar.pushState(state, t)` → 300ms 지연 보간 재생, 1초 무갱신 시 idle

### A-6. 네트워크 (`net/*`)
- §3 계약 그대로. supabase.js는 `@supabase/supabase-js@2` ESM CDN 동적 import,
  channel broadcast(`self:false`) + presence로 입퇴장 감지
- sendState 내부 스로틀: 이동 감지 시 2Hz, 정지 시 5초 keepalive 1회
- wsrelay: 순수 WebSocket JSON `{t:'state'|'join'|'leave', id, d}` / `server/relay.js`는 ws 패키지 하나만 사용, 룸별 브로드캐스트, 40클라이언트 무리 없게 단순 유지

---

## 에이전트 B (Sonnet) — 실험 시스템·이상기체·HUD

담당 파일: `js/experiments/idealgas/model.js`, `…/idealgas/equipment.js`, `…/idealgas/index.js`,
`js/experiments/raoult/index.js`(스텁), `js/experiments/kinetics/index.js`(스텁),
`js/ui/hud.js`, `js/ui/graph.js`, `tests/idealgas.test.mjs`

### B-1. 물리 모델 (`idealgas/model.js`) — three 임포트 금지
- 상태 {n, T, V, P}, `P = nRT/V` (R=8.314 J/mol·K, 단위 환산 주석 필수)
- inputs: `heaterPower(0~1)`, `valveOpen(bool)`, `pistonMode('free'|'locked'|'weight')`, `pistonPush(-1~1)`, `weightMass(kg)`
- step(dt): 열 유입/냉각(뉴턴 냉각으로 실온 300K 수렴), 밸브 열리면 n 증가(0.05mol/s), 피스톤 동역학(감쇠 스프링으로 P_내부 vs P_외부+추 평형) — 진동 발산 금지(임계 감쇠)
- `outputs()` → {P, V, n, T, meanSpeed, history 없음(그래프는 HUD가 샘플링)}
- 검증 테스트(`tests/idealgas.test.mjs`, node 단독 실행): ① 등적 가열 시 P/T 일정 ② 등온 압축 시 PV 일정(±1%) ③ 등압 가열 시 V/T 일정 ④ 발산 없음(1000스텝 후 유한값). console.assert 사용, 실패 시 exit 1

### B-2. 기구 (`idealgas/equipment.js`)
프리미티브 조합 저폴리 메쉬 팩토리. 목록:
투명 실린더+피스톤(핵심), 가열판, 가스통+밸브, 압력 센서(디지털 표시 스프라이트), 온도계, 추(1kg×n), 고정핀. 각 기구 `makeMesh(THREE)` + 들었을 때 크기 0.25m 내외로 축소 규칙

### B-3. 실험 정의 (`idealgas/index.js`)
- ARCHITECTURE §5 스키마 구현. 필수 기구: 실린더, 가열판. 선택: 압력센서/온도계(없으면 해당 readout "—"), 추/핀(모드 전환)
- `createVisuals`: 실린더 내부 InstancedMesh 입자(개수 = n×150, ≤400), 속도 ∝ √T, 벽 반사, 피스톤 높이 = V 반영, 가열판 발광 강도 = heaterPower
- 자연공간 훅: `altitudeDemo(alt)` → 외기압 P0(고도별 30%↓/1000m 근사) 반영한 풍선 부피 계산 export

### B-4. HUD (`ui/hud.js`, `ui/graph.js`)
- 우측 수치 패널: P/V/n/T 모노스페이스 + 단위, requiresItem 미충족 시 "—" 표시
- 하단 컨트롤: 히터 슬라이더, 밸브 토글, 피스톤 모드 버튼, 추 +/-
- 그래프 패널(접이식): P–V / V–T / P–T 탭, 500ms 샘플링, 등온선 참조곡선 점선, 디자인매뉴얼 그래프 스타일(그리드·축 라벨·단위)
- 체크리스트 패널: checkAssembly 결과 표시("압력 센서가 없어 P를 측정할 수 없습니다" 등 힌트)

### B-5. 스텁 (`raoult/index.js`, `kinetics/index.js`)
등록 가능한 최소 정의(id/name/설명/장비 목록/"준비 중" 패널) + 파일 상단에 **Opus 구현용 상세 설계 주석** (모델 수식, 장비, UI, 검증 시나리오)

---

## 향후 확장 과업 (Opus 세션용 백로그)

- **C. 라울 법칙**: x_용질 조절 → P_증기 = x_용매·P°. 분자 수준 표면 증발 입자 시각화, 온도별 P° 테이블, 끓는점 오름 연계
- **D. 반응 속도**: 티오황산나트륨+HCl 흐림 반응(불투명도 = 진행도), 농도·온도 변인, 1/t 분석 그래프, 아레니우스 플롯
- **E. 멀티플레이 강화**: 공동 실험 조작 동기화(호스트 권한 모델), PartyKit 어댑터, 교사 대시보드(학생 진행 현황)
- **F. 평가 연동**: 실험 보고서 자동 생성(측정 데이터 CSV 내보내기), 탐구 미션 시스템

## 검수 절차 (Fable 담당)
1. `npx esbuild js/main.js --bundle --external:three --external:@supabase/* --outfile=/dev/null`
2. `node tests/idealgas.test.mjs`
3. 계약 준수 diff 검토 → 위반 시 직접 수정
