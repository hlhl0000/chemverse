// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA missions/idealgas.js — "미지 기체를 밝혀라"
// 신규 데이터 파일(순수 로직, three 임포트 금지). registry.js 스키마 준수.
// 부품 6종은 교과서 '물질과 에너지' 20쪽 준비물 그대로:
//   온도계 · 휴대용 기체 통 · 주사기(100~200 mL) · 투명 튜브 관 · 전자저울 · 스탠드와 집게
// 시드 결정성은 registry.js가 제공하는 mulberry32만 사용한다(Math.random 금지).
// ═══════════════════════════════════════════════════════════

import { registerMission, mulberry32 } from './registry.js';

// R = 8.314 kPa·L/(mol·K)  — 본편 js/experiments/idealgas/model.js와 동일한 단위 관례.
// (1 kPa·L = 1 J 이므로 J 단위 R을 그대로 kPa·L 단위에 사용할 수 있다.)
const R = 8.314;

const GASES = [
  { id: 'He', label: '헬륨 He (4 g/mol)', M: 4.0 },
  { id: 'N2', label: '질소 N₂ (28 g/mol)', M: 28.0 },
  { id: 'O2', label: '산소 O₂ (32 g/mol)', M: 32.0 },
  { id: 'CO2', label: '이산화 탄소 CO₂ (44 g/mol)', M: 44.0 },
  { id: 'C4H10', label: '부탄 C₄H₁₀ (58 g/mol)', M: 58.0 },
];

const PARTS = [
  { id: 'thermo', name: '온도계', color: 0xffd166 },
  { id: 'gascan', name: '휴대용 기체 통', color: 0x00b4d8 },
  { id: 'syringe', name: '주사기(100~200 mL)', color: 0x35d07f },
  { id: 'tube', name: '투명 튜브 관', color: 0xef476f },
  { id: 'balance', name: '전자저울', color: 0xff8a3d },
  { id: 'stand', name: '스탠드와 집게', color: 0x8b93a7 },
];

/**
 * 시드 결정적으로 미지 기체와 측정값(w, V, T, P)을 생성한다.
 * - V: 100~200 mL 주사기 범위 → 0.10~0.20 L
 * - T: 상온 부근 → 293~303 K
 * - P: 대기압 부근 → 98~104 kPa
 * w는 위 값들과 이상기체식(M = wRT/PV)이 정합되도록 역산해서 생성한다.
 * (w[g], R[8.314 kPa·L/(mol·K)], T[K], P[kPa], V[L] → M[g/mol])
 */
function makeSecret(seed) {
  const rng = mulberry32(seed >>> 0);
  const gas = GASES[Math.floor(rng() * GASES.length) % GASES.length];
  const V_L = 0.10 + rng() * 0.10;
  const T_K = 293 + rng() * 10;
  const P_kPa = 98 + rng() * 6;
  const n = (P_kPa * V_L) / (R * T_K); // mol
  const w_g = n * gas.M;               // g

  return {
    gasId: gas.id,
    w_g: Math.round(w_g * 1000) / 1000,
    V_L: Math.round(V_L * 1000) / 1000,
    T_K: Math.round(T_K * 10) / 10,
    P_kPa: Math.round(P_kPa * 10) / 10,
  };
}

/** M = wRT/PV. 단위: w[g], R[8.314 kPa·L/(mol·K)], T[K], P[kPa], V[L] → M[g/mol] */
function computeM(secret) {
  const { w_g, T_K, P_kPa, V_L } = secret;
  return (w_g * R * T_K) / (P_kPa * V_L);
}

registerMission({
  id: 'idealgas',
  name: '미지 기체를 밝혀라',
  tagline: '이상 기체 방정식 M = wRT/PV',
  ready: true,
  timeLimitSec: 600,
  objective: '부품 6종을 모아 조립대에서 측정 장치를 완성하고, 측정값으로 미지 기체의 분자량을 구해 정체를 밝히세요!',
  parts: PARTS,
  arena: { supplyCenter: 10, supplyEdge: 6 },

  makeSecret,

  quiz: {
    prompt: '측정값으로 분자량을 구해 기체의 정체를 밝혀라!',
    options: GASES.map((g) => ({ id: g.id, label: g.label })),
    compute: computeM,
    answerId: (secret) => secret.gasId,
  },

  wrongPenalty: 20,
  retryLockSec: 30,
});