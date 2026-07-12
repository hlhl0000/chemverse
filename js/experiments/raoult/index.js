// ═══════════════════════════════════════════════════════════
// 라울 법칙 (증기압 내림) — 스텁 등록 + Opus 구현용 상세 설계
// 소유: 에이전트 B(스텁만) → 이후 Opus 세션이 model.js/equipment.js를
// idealgas와 동일한 파일 구조로 분리 구현할 것을 전제로 설계해 둔다.
//
// ── 모델 수식 ──────────────────────────────────────────────
// 비휘발성·비전해질 용질을 물에 녹인 "이상 용액" 가정:
//   P_용액 = x_용매 · P°_용매(T)                      … 라울 법칙
//   x_용매 = n_용매 / (n_용매 + i·n_용질)               … 용매 몰분율
//   (i = 반트호프 인자: 설탕(자당, 비전해질) i≈1, 소금(NaCl) i≈2 — 이온화로
//    유효 입자 수가 늘어나 동일 몰수라도 증기압 내림 폭이 더 커짐)
//   n_용매 = m_물[g] / 18.02,  n_용질(설탕) = m/342.3,  n_용질(소금) = m/58.44
//
// ── 온도별 물의 포화증기압 P°(kPa) 참고표 ──────────────────
//   20°C: 2.34   40°C: 7.38   60°C: 19.9   80°C: 47.4   100°C: 101.3
//   (표 사이 값은 선형 보간, 또는 정밀도가 필요하면 Antoine식
//    log10 P[mmHg] = 8.07131 - 1730.63/(T[°C]+233.426) 로 대체 가능)
//
// ── 장비 구성 (equipment, idealgas와 동일 패턴으로 분리 예정) ──
//   - 밀폐 용기: 물 + 용질을 담는 투명 용기(실린더 재사용 가능)
//   - 압력계: 용기 상부 기상의 증기압(P_용액)을 표시
//   - 용질 투입기: 설탕/소금 중 선택 + 정량(g 또는 mol) 투입
//   - 히터: 온도 조절(20~100°C), idealgas heater 메쉬 재사용 가능
//
// ── 시각화 아이디어 ─────────────────────────────────────────
//   - 액면 아래는 물+용질 입자(용질은 살짝 다른 색), 액면 위는 InstancedMesh로
//     표현한 "증발 입자"가 액면에서 위로 튀어 오르는 애니메이션
//   - 증발 속도(단위시간당 액면→기상 전이 입자 수) ∝ P_용액(온도·x_용매가 클수록
//     활발) → 평형 근사를 위해 응축(기상→액면 복귀) 입자도 동시에 표현해
//     정상상태에서 겉보기 증기 밀도가 P_용액에 비례하도록 균형을 맞춘다
//   - 소금을 넣으면 이온쌍(Na+/Cl-) 표시로 색을 구분해 반트호프 인자 시각화
//
// ── UI 스펙 (registry.js 스키마 그대로) ─────────────────────
//   controls: 용질 종류 buttons(설탕/소금), 용질 몰수 slider(0~2 mol),
//             온도 slider(20~100 °C)
//   readouts: P_용액(kPa, requiresItem: 압력계), x_용매, T(°C)
//   graphs: P–x_용매(라울 법칙 직선 확인), P–T(순수 용매 P° 곡선과 비교)
//
// ── 검증 시나리오 3개 ────────────────────────────────────────
//   ① 용질 0 mol(x_용매=1)일 때 임의 온도에서 P_용액이 위 표의 P°_물 값과
//      일치하는가 (예: 60°C → 19.9 kPa)
//   ② 동일 온도에서 용질 몰수를 늘릴 때 P_용액이 x_용매에 선형 비례해
//      감소하는가(라울 법칙의 직선성 — 기울기 = P°)
//   ③ 동일 몰수의 설탕과 소금을 각각 투입했을 때, 소금 쪽 P_용액 감소폭이
//      반트호프 인자(i≈2)만큼 설탕보다 더 큰가(약 2배 차이)
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
  { id: 'sealedContainer', name: '밀폐 용기', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 물과 용질을 담는 밀폐 용기입니다.' },
  { id: 'pressureGauge', name: '압력계', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 용액의 증기압을 측정합니다.' },
  { id: 'soluteDispenser', name: '용질 투입기', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 설탕·소금 등 비휘발성 용질을 정량 투입합니다.' },
  { id: 'heater', name: '히터', required: false, makeMesh: makeStubMesh,
    desc: '(준비 중) 용액의 온도를 조절합니다.' },
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

const raoult = {
  id: 'raoult',
  name: '라울 법칙 (증기압 내림)',
  level: '화학Ⅱ',
  description: '비휘발성 용질을 녹인 용액의 증기압 내림 현상을 관찰하는 실험입니다. (준비 중)',
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

registerExperiment(raoult);
