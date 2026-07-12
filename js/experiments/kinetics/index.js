// ═══════════════════════════════════════════════════════════
// 반응 속도 (시계 반응) — 스텁 등록 + Opus 구현용 상세 설계
// 소유: 에이전트 B(스텁만) → 이후 Opus 세션이 model.js/equipment.js를
// idealgas와 동일한 파일 구조로 분리 구현할 것을 전제로 설계해 둔다.
//
// ── 반응 & 측정 원리 ────────────────────────────────────────
//   Na₂S₂O₃(aq) + 2HCl(aq) → 2NaCl(aq) + S(s, 콜로이드 황) + SO₂(g) + H₂O(l)
//   생성된 황(S) 콜로이드가 용액을 뿌옇게 흐리며, 비커 아래 놓은 "×" 표식이
//   특정 흐림 정도(임계 불투명도)에서 안 보이게 되는 시점 t를 스톱워치로 측정
//   → "시계 반응(clock reaction)". 반응 진행도 = 1 - 투명도(transmittance)
//   → 반응 속도의 대리 지표로 v ≈ 1/t (t: 표식이 가려지기까지 걸린 시간)
//
// ── 속도식 근사 (Ea ≈ 50 kJ/mol) ────────────────────────────
//   rate = k(T) · [S₂O₃²⁻]^1                      … [S₂O₃²⁻]에 대해 1차 근사
//   k(T) = A · exp(-Ea / (R·T))                    … 아레니우스식, R=8.314 J/(mol·K)
//   1/t ∝ rate  ⇒  1/t vs [S₂O₃²⁻] 는 원점을 지나는 직선(1차 반응 확인)
//   ln(1/t) vs 1/T 는 기울기 -Ea/R인 직선(아레니우스 플롯) — t를 k의 대리로 사용
//
// ── 장비 구성 (equipment, idealgas와 동일 패턴으로 분리 예정) ──
//   - 비커: 반응 용액을 담는 용기
//   - 십자 카드: 비커 아래 놓아 흐림 정도(가림 시점)를 시각적으로 판단하는 표식
//   - 온도조절기(항온조): 반응 온도를 설정(예: 10~50°C)
//   - 농도별 용액: Na₂S₂O₃ 스톡 용액을 물로 희석한 여러 농도 세트(비커에 부어 사용)
//
// ── 시각화 아이디어 ─────────────────────────────────────────
//   - 비커 내부를 반투명 재질로 표현하고, 시간이 지남에 따라 opacity/탁도를
//     진행도(1-투명도)에 비례해 증가시켜 "뿌옇게 흐려지는" 효과 연출
//   - 십자 카드 스프라이트는 비커 너머로 보이도록 배치, 카드 자체의 가시성을
//     (1 - 진행도)로 연동해 "표식이 사라지는" 순간을 시각적으로 재현
//   - 콜로이드 황 입자를 옅은 노란색 InstancedMesh 파티클로 표현해 부유시킴
//
// ── UI 스펙 (registry.js 스키마 그대로) ─────────────────────
//   controls: 농도 slider(스톡 대비 희석 비율 또는 [S₂O₃²⁻] mol/L),
//             온도 slider(10~50 °C), 반응 시작 toggle/button
//   readouts: 경과 시간 t(s), 진행도(%), 가림 시점 t(s, requiresItem: 십자 카드)
//   graphs: 1/t – [S₂O₃²⁻] (반응차수 확인용 직선),
//           ln(1/t) – 1/T (아레니우스 플롯, 기울기로 Ea 추정)
//
// ── 검증 시나리오 3개 ────────────────────────────────────────
//   ① 온도 고정, 농도를 2배로 하면 1/t(속도)도 약 2배가 되는가(1차 반응 확인)
//   ② 농도 고정, 온도를 10°C 올리면 반응 속도가 경험적으로 약 2~3배
//      빨라지는가(아레니우스식과 대략적인 Q10 법칙의 일치 확인)
//   ③ 여러 온도에서 측정한 ln(1/t) vs 1/T 그래프의 기울기로부터 역산한
//      활성화 에너지 Ea가 설정값(50 kJ/mol)과 허용 오차 내로 일치하는가
// ═══════════════════════════════════════════════════════════

import { registerExperiment } from '../registry.js';

const STUB_COLOR = 0x555a6e;

function makeStubMesh(THREE) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.05),
    new THREE.MeshStandardMaterial({ color: STUB_COLOR, roughness: 0.85, metalness: 0.05 })
  );
}

const EQUIPMENT = [
  { id: 'beaker', name: '비커', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 반응 용액을 담는 비커입니다.' },
  { id: 'crossCard', name: '십자 카드', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 흐림 정도를 판단하는 표식 카드입니다.' },
  { id: 'thermostat', name: '온도조절기', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 반응 온도를 설정합니다.' },
  { id: 'solutionSet', name: '농도별 용액', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 농도별로 희석된 티오황산나트륨 용액 세트입니다.' },
];

function checkAssembly(_placed) {
  return {
    ready: false,
    missing: ['준비 중인 실험입니다'],
    hints: ['다음 업데이트에서 공개됩니다'],
  };
}

function createModel() {
  return {
    inputs: {},
    step() {},
    outputs() { return {}; },
  };
}

function createVisuals(_THREE, _anchor, _model, _placed) {
  return {
    update() {},
    dispose() {},
  };
}

const kinetics = {
  id: 'kinetics',
  name: '반응 속도 (시계 반응)',
  level: '화학Ⅰ·Ⅱ',
  description: '티오황산나트륨과 염산의 반응으로 생기는 흐림을 이용해 반응 속도를 측정하는 실험입니다. (준비 중)',
  stub: true,

  equipment: EQUIPMENT,
  snapSlots: [],
  checkAssembly,
  createModel,
  createVisuals,

  ui: {
    controls: [],
    readouts: [],
    graphs: [],
  },
};

registerExperiment(kinetics);
