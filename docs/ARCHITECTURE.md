# ChemVerse — 웹 기반 3D 가상 과학실 아키텍처 v1.0

> 용인고등학교 화학·통합과학용. MEL VR류 기능을 **앱 설치 없이 URL만으로** 태블릿에서 구동.
> 설계: Claude Fable / 구현: Sonnet 하위 에이전트 / 검수: Fable. 향후 확장: Opus 가능하도록 계약(인터페이스) 우선 설계.

---

## 1. 기술 스택 결정과 근거

| 항목 | 결정 | 근거 |
|---|---|---|
| 3D 렌더러 | **Three.js r170** (jsdelivr CDN + import map) | 빌드 도구 불필요 → 교사가 파일 수정 후 git push만으로 배포. 태블릿 WebGL 지원 안정적 |
| 모듈 방식 | 네이티브 ES Modules (번들러 없음) | iPadOS 16.4+/안드로이드 크롬 모두 import map 지원 |
| 호스팅 | GitHub Pages (정적) | 무료, CDN 기반이라 동시접속 수백 명도 무관. **서버가 존재하지 않으므로 "터질" 서버도 없음** |
| 물리 | 자체 경량 물리 (외부 물리엔진 금지) | 실험 물리는 해석적 수식(PV=nRT 등)이 정확하고 가벼움. 충돌은 AABB만 |
| UI | DOM 오버레이 + Canvas 2D 그래프 | 디자인매뉴얼 v2.0 (Scientific Precision Interface) 그대로 계승 |
| 멀티플레이 | NetAdapter 추상화 (3종 구현) | 아래 §3 |

### 성능 예산 (보급형 태블릿 기준)
- 드로우콜 ≤ 150, 총 삼각형 ≤ 200k, 텍스처 없음(vertex color/flat material 위주)
- 그림자맵 사용 금지(가짜 blob 그림자), `renderer.setPixelRatio(min(dpr, 1.5))`
- 입자는 `InstancedMesh` 단일 드로우콜, 최대 500개
- 목표 30fps 이상 유지

## 2. 디렉터리 구조 (계약)

```
ChemVerse/
├─ index.html              # 진입점: 로비 오버레이 + import map + HUD 컨테이너
├─ css/main.css            # 디자인 시스템 v2.0 팔레트
├─ js/
│  ├─ main.js              # 부트스트랩·통합 (Fable 작성, 수정 금지 영역)
│  ├─ core/
│  │  ├─ engine.js         # Engine: renderer/scene/camera/loop/resize
│  │  ├─ controls.js       # PlayerControls: 조이스틱+터치룩+WASD
│  │  └─ interact.js       # Interactor: 탭 픽킹, 하이라이트, 들기/놓기
│  ├─ world/
│  │  ├─ spaces.js         # SpaceManager: 공간 로드/해제/포털 이동
│  │  ├─ lab.js            # 실험실 (선반·실험대·콘솔·포털)
│  │  ├─ nature.js         # 자연 공간 (야외 언덕, 고도-기압 데모)
│  │  └─ avatar.js         # 로컬/원격 아바타 + 이름표 + 보간
│  ├─ net/
│  │  ├─ config.js         # 교사 수정 지점: Supabase 키, 기본 모드
│  │  ├─ net.js            # createNet(): 어댑터 팩토리 + 공통 이벤트
│  │  ├─ solo.js           # 오프라인 (항상 동작하는 폴백)
│  │  ├─ supabase.js       # Supabase Realtime broadcast/presence
│  │  └─ wsrelay.js        # 교사 PC 내부망 WebSocket 릴레이
│  ├─ experiments/
│  │  ├─ registry.js       # 실험 정의 스키마 + 등록 (Fable 작성)
│  │  ├─ idealgas/         # ★ 1차 완성 대상
│  │  │  ├─ model.js       # 순수 물리 모델 (three 임포트 금지 — 단독 테스트 가능)
│  │  │  ├─ equipment.js   # 기구 3D 메쉬 팩토리 + 스냅 규칙
│  │  │  └─ index.js       # 실험 정의(장비목록·조립규칙·UI 스펙)
│  │  ├─ raoult/index.js   # 스텁 + 상세 설계 주석 (Opus 확장용)
│  │  └─ kinetics/index.js # 스텁 + 상세 설계 주석 (Opus 확장용)
│  └─ ui/
│     ├─ hud.js            # 수치 패널(모노스페이스+단위), 실험 컨트롤
│     ├─ graph.js          # Canvas 2D 실시간 그래프
│     └─ joystick.js       # 가상 조이스틱 (멀티터치)
├─ server/
│  ├─ relay.js             # 선택: 교사 PC용 Node WS 릴레이 (~100줄)
│  └─ 실행방법.md
└─ docs/  (본 문서들)
```

## 3. 멀티플레이 아키텍처 — NetAdapter

정적 호스팅에서는 서버를 못 돌리므로, 네트워크 계층을 어댑터로 추상화한다.
**모든 어댑터는 동일한 인터페이스를 구현**하므로 상위 코드는 모드를 모른다.

```js
// 계약 (net.js)
adapter = await createNet(mode /* 'solo'|'supabase'|'wsrelay' */, config);
await adapter.join(roomCode, { name, color });   // 방 입장
adapter.sendState({ p:[x,y,z], ry, space });     // 내 상태 (내부에서 스로틀)
adapter.on('peer',  ({id, profile, state}) => …) // 원격 갱신
adapter.on('leave', ({id}) => …)
adapter.on('status', ({connected, count}) => …)
await adapter.leave();
```

### 모드별 특성
| 모드 | 서버 | 40명 수용 | 준비 |
|---|---|---|---|
| `solo` | 없음 | ∞ (각자 독립) | 없음. 네트워크 실패 시 자동 폴백 |
| `supabase` | Supabase Realtime (무료) | 동시 200접속. 월 2백만 메시지 → **이동 시에만 2Hz 전송 + 정지 시 전송 중단 + 모둠별 룸 분리(권장 룸당 ≤10명)** | 무료 가입 5분, config.js에 URL/anon key |
| `wsrelay` | 교사 PC Node 1개 | LAN이라 사실상 무제한, 지연 최소 | `node server/relay.js` + 교내망 허용 필요 |

### 트래픽 설계 (supabase 모드)
- 전송: 위치·회전만 (±0.05m 변화 없으면 전송 안 함), 2Hz, 페이로드 < 60B
- 수신 보간: 원격 아바타는 300ms 지연 버퍼로 lerp → 2Hz여도 부드러움
- 실험 상태는 **동기화하지 않음** (각자 자기 실험 수행 = 트래픽 최소 + 학습 개별성)
- 산정: 40명 · 수업 중 이동률 20% · 2Hz · 50분 → 전송 4.8만, 팬아웃 포함 약 190만/수업.
  → 전교 상시 사용이면 초과. **모둠 룸(≤10명) 분리 시 수업당 약 43만**으로 안전.
  → Phase 2에서 wsrelay(내부망) 또는 Cloudflare PartyKit 이전 권장.

## 4. 자유 기구 세팅 시스템 (핵심 UX)

"실험이 미리 차려져 있는" 방식을 금지한다. 흐름:

1. 실험대 콘솔 탭 → 실험 선택 (예: 이상기체)
2. **선반에서 기구를 직접 탭 → 손에 듦 → 실험대 스냅 포인트에 탭 → 배치**
3. 어떤 기구든 배치 가능(자유도). 단, 물리량 측정은 해당 기구가 있어야만 가능
   - 압력계 없이 가열 → P 값이 "— kPa"로 표시 (측정 불가를 체험)
   - 잘못된/불필요한 기구도 놓을 수 있음 → 체크리스트가 힌트만 제공
4. 필수 기구 충족 시 "장치 완성" → 시뮬레이션 활성화
5. 밸브·슬라이더·히터로 변인 조작 → HUD 수치 + 실시간 그래프

구현 계약: 기구는 `userData.equipment = { expId, itemId, slot }`,
실험대는 `snapPoints[]` (위치+허용 slot 타입) 보유. Interactor가 들기/놓기만 담당하고
조립 판정은 experiment definition의 `checkAssembly(placedItems)`가 담당.

## 5. 실험 레지스트리 스키마 (확장 계약)

새 실험 추가 = 폴더 하나 + registry 등록 한 줄. Opus 확장 시 이 계약만 지키면 됨.

```js
export default {
  id, name, level, description,
  equipment: [{ id, name, required, makeMesh(THREE), desc }],
  snapSlots:  [{ id, accepts:[itemId…], pos:[x,y,z] }],
  checkAssembly(placed) => { ready:bool, missing:[], hints:[] },
  createModel() => { state, inputs, step(dt), outputs() },   // 순수 JS
  createVisuals(THREE, bench, model) => { update(dt), dispose() },
  ui: { controls:[{ id, label, unit, min, max, step, bind }],
        readouts:[{ id, label, unit, requiresItem }],
        graphs:[{ id, x, y, label }] }
}
```

## 6. 물리 모델 명세 — 이상기체 (1차 완성)

- 상태: n(mol), T(K), V(L), P(kPa) — `P = nRT/V`, R=8.314
- 조작: 히터(T 300–600K), 피스톤 추 또는 고정핀(등압/등적 전환), 가스 주입 밸브(n 0.1–2.0mol), 피스톤 수동(V 1–10L)
- 모드: 등온(피스톤 자유+수동 V), 등압(추 무게로 P 고정 → T 올리면 V 증가), 등적(핀 고정 → T 올리면 P 증가)
- 입자 뷰: 실린더 내부 InstancedMesh 구체. 속도 ∝ √T (맥스웰 분포 근사), 개수 ∝ n, 벽 충돌 반사. **장식이 아니라 P의 미시적 원인 시각화**
- 그래프: P–V (등온선 비교), V–T (샤를), P–T (게이뤼삭) 선택 탭
- 자연 공간 연계: 언덕 고도에 따른 대기압 변화 → 밀봉 풍선 부피 팽창 데모

## 7. 검증 체계
- 물리 모델은 three 의존 금지 → node로 단위 테스트 (`node tests/model.test.mjs`)
- esbuild dry-bundle로 문법·임포트 누락 검사
- 최종: 로컬 http 서버 + 실기기(태블릿) 확인은 교사 수행

## 8. 알려진 제약 (정직한 고지)
- 3일 범위에서 멀티플레이는 **아바타 존재감(위치·이름) 동기화까지**. 공동 실험 조작 동기화는 Phase 2
- Supabase 무료 티어로 40명 단일 룸 상시 사용은 월 한도 초과 위험 → 모둠 룸 분리 또는 wsrelay 사용
- iOS Safari는 첫 터치 전 오디오 재생 불가 → 효과음은 첫 인터랙션 후 활성화
