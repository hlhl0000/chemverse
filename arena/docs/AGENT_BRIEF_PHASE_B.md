# ChemVerse ARENA — Phase B 작업 지시안 (설계: Fable)

> 전제 문서: GAME_DESIGN.md(§3 매치 규칙) · AGENT_BRIEF_ARENA.md(공통 규약 8조 — 그대로 유효).
> Phase A 코드는 전부 실존·검증됨(HEAD 기준). **Fable 소유 파일(main.js·index.html·arena.css·config.js·
> missions/registry.js)은 수정 금지** — 단 arena.css는 B에 한해 하단 마킹 영역 추가 허용(아래 §CSS).

## 0. 확정 설계 (이번에 결정 — 재논의 불필요)

1. **피격 판정 = 피해자 자가 판정 + 심판 확정**: 발사자는 `shot` 이벤트만 브로드캐스트.
   각 클라이언트가 투사체를 결정적으로 시뮬레이션하고, **자기가 맞았을 때만** `req:hit`을 심판에게
   보낸다. 심판이 게이지 차감·킬 확정을 브로드캐스트. (관대한 판정 = 피해자에게 유리, 수업용으로 공정)
2. **호스트 승계**: 심판은 2초마다 `snap`(전체 상태) 브로드캐스트. 전 클라이언트는 마지막 snap을
   보관(GameClient). 매치 중 RoomSession 'host' 이벤트로 내가 새 호스트가 되면 마지막 snap으로
   Referee를 재구성해 이어서 심판.
3. **픽업·장착은 자동**: 상자/드랍 2.0m 근접 시 자동 `req:pickup`(거절 시 1초 쿨다운),
   자기 팀 조립대 반경 내에서 인벤에 부품이 있으면 자동 `req:deposit`. 버튼 없음(모바일 단순화).
4. **부품 희소성**: 크레이트 16개 = 부품 6종×2개 + 무기 4개. 양 팀이 같은 부품 풀을 쟁탈.
5. **솔로 모드**: 심판을 항상 로컬 실행 → 혼자서도 픽업→조립→퀴즈 전 흐름 연습 가능.

## 1. 메시지 프로토콜 (동결 — adapter.send(type, payload))

| type | 방향 | payload |
|---|---|---|
| `shot` | 발사자→전원 | `{sid, w, o:[x,y,z], d:[x,y,z]}` sid=`${myId}:${n}`, w=무기id |
| `req:pickup` | →호스트 | `{kind:'crate'\|'drop', id}` |
| `req:deposit` | →호스트 | `{}` (클라가 근접 확인 후 발송 — 심판은 신뢰) |
| `req:quiz` | →호스트 | `{answerId}` |
| `req:hit` | 피해자→호스트 | `{sid, shooter, w, pos:[x,y,z]}` pos=피격 위치(드랍 생성용) |
| `ev` | 호스트→전원 | `{kind, ...}` kind: 아래 표 |
| `snap` | 호스트→전원(2초) | §2 상태 전체 |

`ev.kind`: `pickup{pid,itemId,crateId?,dropId?,inv}` · `deny{pid,reason}` · `deposit{pid,team,itemId,prog}` ·
`complete{team}` · `quiz{team,correct,lockUntil,scores}` · `hp{pid,gauge}` ·
`kill{victim,shooter,drop:{id,itemId,pos}|null,scores,pers}` · `respawn{pid}` ·
`score{scores,pers}` · `end{winner:'OX'|'RE'|null,reason:'quiz'|'time',scores,pers}`
(호스트 자신도 모든 ev를 로컬 emit — 어댑터 self 미수신 주의)

## 2. 심판 상태 (snap 스키마 — 동결)

```js
{ crates: { [crateId]: takenBy|null }, drops: [{id,itemId,pos}],
  inv: { [pid]: [itemId…] /*최대 2*/ }, weap: { [pid]: weaponId /*기본 'spoit'*/ },
  prog: { OX:[itemId…], RE:[…] }, gauge: { [pid]: 0~100 }, alive: { [pid]: bool },
  scores: {OX,RE}, pers: { [pid]: n }, quizLock: {OX:ts,RE:ts}, endAt, ended: null|{winner,reason} }
```

## 3. 무기 데이터 (동결 — combat.js에 정의, 전 클라이언트 동일 상수)

| id | 이름 | dmg | 속도 m/s | 쿨다운 s | 장탄 | 재장전 s | 특성 |
|---|---|---|---|---|---|---|---|
| spoit | 스포이트 물총 | 25 | 18 | 0.5 | 3 | 1.5 | 기본 지급 |
| buret | 뷰렛 스나이퍼 | 40 | 40 | 1.2 | 1 | 2.0 | 직선 장거리 |
| spray | 시약 분무기 | 12×5 | 12 | 1.0 | 2 | 1.8 | 산탄 spread 0.15rad, 사거리 7m |
| flask | 부피 플라스크 | 50 | 11 | 2.0 | 1 | 2.2 | 포물선(g=9.8), 폭발 반경 2m |

투사체: 수명 2초, 히트 반경 0.5m(플레이어 중심 y+0.9 캡슐 근사), 벽(AABB 콜라이더) 차단.
점수: 부품 획득 +10 / 장착 +15 / 완성 +30(팀) / 퀴즈 오답 -20·30초 잠금 / 정답 즉시 승리 /
킬 시 **가해자 개인 -5(연구윤리 위반)**, 피해자 부품 1개 드랍·3초 후 리스폰(젖음 게이지 100 복구).

---

## 4. 에이전트 A (Sonnet) — 아이템 실물 그래픽·이펙트·맵 개편

담당: `world/items.js`(신규) · `world/effects.js`(신규) · `world/arena.js`(개편) · `core/voxel.js`(확장) · `core/tps.js`(메서드 1개 추가)

### A-1. items.js — 부품·무기 실물 메쉬 ★사용자 핵심 요구
**이름표 스프라이트 의존 금지.** 각 부품은 저폴리지만 **실물의 외형적 특징이 즉시 식별**되어야 한다:
- `thermo` 온도계: 흰 유리관 + 하단 붉은 구 + 관 내부 붉은 기둥 + 눈금 띠 3개
- `gascan` 휴대용 기체 통: 실린더 캔(시안) + 상단 노즐·밸브 손잡이
- `syringe` 주사기: 반투명 배럴(opacity 0.5) + 내부 피스톤 + 플런저 손잡이 + 눈금 링
- `tube` 투명 튜브 관: 반투명 토러스 2~3회 감김(TorusGeometry 활용)
- `balance` 전자저울: 납작 본체 + 은색 상판 + 전면 초록 디스플레이 패널
- `stand` 스탠드와 집게: 베이스판 + 수직 봉 + 가로 클램프 집게
- 무기 4종(`spoit` 고무 벌브+유리관 / `buret` 긴 눈금관+콕 / `spray` 병+분무 헤드+트리거 / `flask` 둥근 바닥 플라스크+긴 목)
```js
export function makePartMesh(THREE, partId)     // -> Group, 높이 ~0.5m, 원점=바닥 중심
export function makeWeaponMesh(THREE, weaponId) // -> Group, 손에 들 크기 ~0.4m
export class ItemManager {
  constructor(scene, arenaHandle /*buildArena 반환*/ , THREE)
  crateTaken(crateId)            // 상자 개봉 연출(내용물 소멸+빈 상자 어둡게)
  addDrop(id, itemId, pos)  removeDrop(id)
  nearestPickup(pos, r=2.0)      // -> {kind:'crate'|'drop', id, itemId, name}|null (미개봉/존재만)
  update(dt)                     // 내용물 부유 회전(y=0.75±0.08 사인 바운스, 0.8rad/s)
  dispose()
}
```
지오메트리·머티리얼 공유 캐시 필수(부품당 1회 생성 후 clone). 반투명은 depthWrite:false.

### A-2. arena.js 개편 — 크레이트 시스템
- 기존 이름표 라벨 스프라이트 크레이트 제거 → **열린 나무상자(테두리 프레임) + 내용물 실물 메쉬 부유** 조합은 items.js가 렌더하도록, arena.js는 **배치 데이터만** 생성:
  `crates: [{id:'c0'…, pos:[x,y,z], kind:'part'|'weapon', itemId}]` 를 반환 객체에 추가
- 내용물 분배(시드 결정적, mulberry32): 부품 6종×2 + 무기 [buret,spray,spray,flask] 셔플 → 16개.
  중앙 지대 10개·외곽 6개. **기존 반환 계약(group/colliders/bounds/spawns/zones/dispose)은 유지**하고
  `zones.supply`는 crates에서 파생해 하위 호환 유지
- 조립대: 팀색 발광 패드 위에 **부품 장착 진행 표시** — 장착된 부품의 실물 메쉬가 패드 위 원형으로
  배열되도록 `setAssembled(team, itemIds)` 메서드를 반환 객체에 추가(items.js의 makePartMesh 재사용)

### A-3. effects.js — 전투·게임 이펙트
```js
export class Effects {
  constructor(scene, THREE)
  syncProjectiles(list)   // [{id, pos:[3], w}] — 매 프레임, 무기별 색·크기 구체(InstancedMesh 권장)
  splash(pos, colorHex)   // 물방울 파티클 버스트(8~12개, 0.4s, 중력 낙하)
  burst(pos)              // flask 폭발 링
  respawnRing(pos, colorHex)
  update(dt)  dispose()
}
```
파티클은 풀링(최대 64), 프레임당 신규 할당 금지.

### A-4. voxel.js 확장 — `setHeld(meshGroup|null)`
오른손 위치(몸 옆 팔 끝)에 무기/부품 메쉬 부착·교체. 걷기 스윙과 함께 흔들림.

### A-5. tps.js 추가 — `getAimRay() -> {origin:[x,y,z], dir:[x,y,z]}`
카메라 위치·전방 단위벡터(월드). 기존 코드(오클루전 포함) 변경 금지, 메서드만 추가.

---

## 5. 에이전트 B (Sonnet) — 심판·전투·게임 클라이언트·HUD

담당: `game/referee.js`(신규) · `game/state.js`(신규) · `game/combat.js`(신규) · `ui/hud.js`(확장) ·
`missions/idealgas.js`(arena 크레이트 수 조정: `arena:{supplyCenter:10, supplyEdge:6}`)
전부 **three 임포트 금지**(hud.js는 DOM만). 벽 차단 판정은 colliders의 `.min/.max` 수치만 읽는 순수 산술
(tps.js의 raySlabAABB 로직 참조·복사 가능).

### B-1. referee.js — 호스트 심판 (순수 로직)
```js
export class Referee {
  constructor({ adapter, mission, seed, roster, cfg, fromSnap /*승계 시 마지막 snap|null*/ })
  start(t0)   // endAt=t0+timeLimit*1000. req:* 구독, 2초 snap, endAt 도달 시 ev end(점수 비교)
  stop()
}
```
- 규칙 판정은 §1~§3 그대로. 크레이트 초기 상태는 mission+seed로 buildArena와 동일 분배를 재계산
  (분배 함수는 A의 arena.js와 중복 구현하지 말 것 — **분배 로직은 B가 `game/loot.js`로 분리 export,
  A의 arena.js가 임포트해 사용**: `export function rollCrates(mission, seed)` → [{id,kind,itemId,zone:'center'|'edge'}])
- 호스트 자신의 req/ev도 처리되도록 로컬 루프백 필수(adapter가 self 미수신인 어댑터 대비)
- 퀴즈 정답 판정: `mission.quiz.answerId(mission.makeSecret(seed))`
- 킬: gauge≤0 → alive=false, 피해자 inv에서 부품 1개 pop → drops 추가(id 증가 시퀀스), pers[shooter]-=5,
  3초 뒤 ev respawn(gauge 100, alive true)

### B-2. state.js — GameClient (전 클라이언트 미러 + 요청 헬퍼)
```js
export class GameClient {
  constructor({ adapter, myId, myTeam, mission, seed })
  // ev·snap 수신 → 로컬 상태 갱신 + 이벤트 재발화. lastSnap 보관(호스트 승계용)
  tryPickup(kind, id)  tryDeposit()  tryQuiz(answerId)  reportHit(sid, shooter, w, pos)
  myInv(); myGauge(); myAlive(); myWeapon(); teamProg(team); scores(); ended()
  on('pickup'|'deny'|'deposit'|'complete'|'quiz'|'hp'|'kill'|'respawn'|'score'|'end'|'snap', cb)
  lastSnap
}
```
자동 픽업·장착 쿨다운(거절 후 1초)은 여기서 관리.

### B-3. combat.js — 발사·투사체·자가 피격
```js
export const WEAPONS = { …§3 표 그대로… }
export class Combat {
  constructor({ colliders, getMyPos /*()=>[x,y,z]*/, myId })
  setWeapon(id)  canFire()  ammo()
  fire(origin, dir)        // -> {sid,w,o,d}|null(쿨다운·재장전 중) — 발사자 로컬용
  onRemoteShot({sid,w,o,d,shooter})   // 원격 발사 등록
  update(dt) -> { projectiles:[{id,pos,w}], myHits:[{sid,shooter,w,pos}], impacts:[{pos,w}] }
  // spray는 fire 1회가 pellets 5개(sid에 :p0~:p4 접미사), flask는 중력 포물선+착탄 시 blast 반경 판정
}
```
결정적일 필요 없음(각자 자기 피격만 판정). 내 캡슐: 중심 y+0.9, 반경 0.5.

### B-4. hud.js 확장 (기존 Phase A API 유지 + 추가)
```js
setGauge(v)                          // 젖음 게이지 바(하단 좌, 30 이하 경고색)
setInventory(items /*[{id,name}]*/)  // 부품 슬롯 2칸(하단 중앙)
setWeapon({id,name,ammo,mag,reloading})  // 무기 슬롯+탄수(발사 버튼 위)
killfeed(text)                       // 우측 상단 스택, 4초 후 소멸 ("A ⚗→ B · 연구윤리 -5")
setPickupHint(nameOrNull)  setDepositHint(bool)
showQuizButton(onClick|null)         // 장치 완성 팀에게만
showQuiz({prompt, values:{w,V,T,P}, options, lockRemainSec}, onAnswer)  closeQuiz()
showRespawn(secOrNull)               // 중앙 "실험복 교체 중… n"
showResult({winner,reason,scores,pers,myTeam,myId}, onRetry)  // 승/패/무 + 점수표 + 다시하기
onFire(cb)  onSwitchWeapon(cb)       // 발사 버튼(우하단, look-zone 위 z-index)·무기 전환 탭
update(dt)                           // 퀴즈 잠금 카운트다운 등
```
발사 버튼은 look-zone 터치룩과 충돌하지 않게 stopPropagation. 수치는 단위 표기(w g, V L, T K, P kPa).

### B-5. CSS — arena.css 하단에 다음 마킹으로만 추가
`/* ═══ Phase B (소유: 에이전트 B — Fable 승인 하 추가) ═══ */` 이후 영역.
기존 변수(--ox --re --warn --bad --s1 --line --f)와 픽셀 스타일(radius 0, 계단 그림자) 준수.

---

## 6. main.js 배선 (Fable 담당 — 에이전트는 참고만)

startMatch 확장: GameClient·Combat·ItemManager·Effects 생성 → 루프에서
근접 자동 픽업/장착, combat.update 결과를 effects·state로 라우팅, HUD 갱신,
RoomSession 'host' 승계 시 Referee(fromSnap) 기동, ev end → showResult.

## 7. 완료 기준·보고 (공통 규약 8조 + 추가)

- `node --check` 자기 파일 전부 통과. three 금지 파일에 three 임포트 없음
- **계약 시그니처 정확 일치**(본 문서 §4·§5). loot.js 분배는 A·B 공용 단일 소스(B 작성, A 임포트)
- 보고: 파일·export 목록, 계약 이탈, 미구현 잔여물, (B) referee 상태 전이 자가 점검 결과
