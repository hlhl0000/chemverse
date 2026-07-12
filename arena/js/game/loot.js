// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA game/loot.js — 크레이트 분배 (소유: 에이전트 B)
// 순수 로직, three 임포트 금지. 에이전트 A의 world/arena.js가 이 함수를 임포트해
// 크레이트 배치(pos)를 결정하고, referee.js도 동일 mission+seed로 재계산해
// 초기 크레이트 상태(taken 여부)를 맞춘다 — 분배 로직은 이 파일이 단일 소스.
// 시드 결정성은 missions/registry.js의 mulberry32만 사용한다(Math.random 금지).
// ═══════════════════════════════════════════════════════════
import { mulberry32 } from '../missions/registry.js';

// 무기 4개 = buret 1 + spray 2 + flask 1 (PHASE_B §0-4 동결)
const WEAPON_POOL = ['buret', 'spray', 'spray', 'flask'];

/**
 * mission(부품 정의 + arena 공급 수)과 seed로부터 크레이트 16개(부품 6종×2 + 무기 4개)를
 * 결정적으로 셔플해 zone(center/edge)까지 배정한다.
 * @returns {{id:string, kind:'part'|'weapon', itemId:string, zone:'center'|'edge'}[]}
 */
export function rollCrates(mission, seed) {
  const parts = (mission && mission.parts) || [];
  const pool = [];
  for (const p of parts) {
    pool.push({ kind: 'part', itemId: p.id });
    pool.push({ kind: 'part', itemId: p.id });
  }
  for (const w of WEAPON_POOL) pool.push({ kind: 'weapon', itemId: w });

  const rng = mulberry32((seed >>> 0) || 1);
  // Fisher-Yates 셔플 — mulberry32만 사용(결정적, 전 클라이언트 동일 결과)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  const arenaCfg = (mission && mission.arena) || {};
  const centerN = arenaCfg.supplyCenter != null
    ? arenaCfg.supplyCenter
    : Math.ceil(pool.length * 0.625); // 기본 10/16 비율

  return pool.map((it, i) => ({
    id: `c${i}`,
    kind: it.kind,
    itemId: it.itemId,
    zone: i < centerN ? 'center' : 'edge',
  }));
}
