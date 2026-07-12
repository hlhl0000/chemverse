// ═══════════════════════════════════════════════════════════
// ARENA 미션 레지스트리 — 스키마 + 등록 API (소유: Fable)
// three 임포트 금지(순수 JS). 미션 추가 = 파일 1개 + main.js import 한 줄.
//
// 미션 정의 스키마 (registerMission(def)):
// {
//   id: 'idealgas',
//   name: '미지 기체를 밝혀라',
//   tagline: '이상 기체 방정식 M = wRT/PV',   // 로비 카드 부제
//   ready: true,                               // false → 카드 '준비 중' 잠금
//   timeLimitSec: 600,
//   objective: '스폰 직후 HUD 배너에 띄울 목표 문장(한국어)',
//   parts: [ { id:'thermo', name:'온도계', color:0xffd166 }, … ],
//     // 획득 대상 부품. color는 공급 상자 라벨·부품 표시색(16진 정수)
//   arena: { supplyCenter: 6, supplyEdge: 4 }, // 공급 상자 수(중앙/외곽) — buildArena가 사용
//
//   ── Phase B에서 사용 (이번 세션은 데이터·순수 함수만 완비) ──
//   makeSecret(seed) => { gasId, w_g, V_L, T_K, P_kPa },
//     // 시드 결정적으로 미지 기체·측정값 생성 (mulberry32 등, Math.random 금지)
//   quiz: {
//     prompt: '측정값으로 분자량을 구해 기체의 정체를 밝혀라!',
//     options: [ { id:'He', label:'헬륨 He (4 g/mol)' }, … ],
//     compute(secret) => M_g_per_mol,          // M = wRT/PV (R=8.314, 단위 환산 주석 필수)
//     answerId(secret) => 'CO2',
//   },
//   wrongPenalty: 20, retryLockSec: 30,
// }
// ═══════════════════════════════════════════════════════════

const _missions = new Map();

export function registerMission(def) {
  if (!def || !def.id) throw new Error('[missions] id 없는 미션 정의');
  _missions.set(def.id, def);
  return def;
}

export function getMission(id) {
  const d = _missions.get(id);
  if (!d) throw new Error(`[missions] 미등록 미션: ${id}`);
  return d;
}

export function listMissions() {
  return [..._missions.values()];
}

// 시드 결정적 RNG — 맵 생성·미지 기체 결정 등 전 클라이언트 동일 결과가 필요한 곳은 반드시 이것 사용
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
