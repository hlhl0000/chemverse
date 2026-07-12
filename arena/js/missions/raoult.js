// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA missions/raoult.js — "증기 압력의 비밀" (스텁)
// 신규 데이터 파일(순수 로직, three 임포트 금지). Phase C에서 완성 예정.
// ready:false → 로비 카드는 '준비 중' 뱃지(.mcard.locked)로 표시되고 선택 불가.
//
// ── 설계 메모 (GAME_DESIGN.md §7 참조) ──────────────────────
// 부품: 밀폐 용기 · 마노미터 · 용매 · 비휘발성 용질 · 온도계 · 항온조
// 규칙: 부품을 모두 조립하면 라울 법칙 실험 장치가 완성된다.
//   순수 용매의 증기압 p° 대비 용액의 증기압 내림 Δp = p° · x_용질 을 측정해
//   용질의 몰분율 x_용질을 구하고, 이를 몰질량으로 역산해 보기 중 정체를 판별한다.
// 측정 콘솔에 공개할 값(안): p°(순수 용매 증기압, kPa) · Δp(내림량, kPa) ·
//   용매 질량 m_용매(g, 몰질량 기지) · 용질 질량 m_용질(g).
//   x_용질 = Δp / p°
//   n_용매 = m_용매 / M_용매
//   n_용질 = n_용매 · x_용질 / (1 - x_용질)   (라울 법칙: p = p°·x_용매, x_용매 = 1 - x_용질)
//   M_용질 = m_용질 / n_용질
// makeSecret(seed)/quiz는 idealgas.js와 동일하게 registry.js의 mulberry32로
// 시드 결정적으로 구현할 예정(Math.random 금지). ready:false인 동안에는
// main.js/Phase B 로직이 이 미션을 실제 매치에 로드하지 않으므로 아직 정의하지 않는다.
// ═══════════════════════════════════════════════════════════

import { registerMission } from './registry.js';

registerMission({
  id: 'raoult',
  name: '증기 압력의 비밀',
  tagline: '라울 법칙 — 용액의 증기압 내림',
  ready: false,
  timeLimitSec: 600,
  objective: '(준비 중) 용액의 증기압 내림을 측정해 용질의 정체를 밝히는 미션입니다.',
  parts: [
    { id: 'chamber', name: '밀폐 용기', color: 0x8b93a7 },
    { id: 'manometer', name: '마노미터', color: 0x00b4d8 },
    { id: 'solvent', name: '용매', color: 0x35d07f },
    { id: 'solute', name: '비휘발성 용질', color: 0xff8a3d },
    { id: 'thermo', name: '온도계', color: 0xffd166 },
    { id: 'bath', name: '항온조', color: 0xef476f },
  ],
  arena: { supplyCenter: 6, supplyEdge: 4 },
});
