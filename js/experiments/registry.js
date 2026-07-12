// ═══════════════════════════════════════════════════════════
// 실험 레지스트리 — 계약 파일 (소유: Fable, 하위 에이전트 수정 금지)
//
// 새 실험 추가 절차:
//   1) js/experiments/<id>/index.js 에서 정의 객체를 만들고
//   2) registerExperiment(def) 호출
//   3) js/main.js 상단에 import './experiments/<id>/index.js' 한 줄 추가
//
// ── 실험 정의 스키마 ──────────────────────────────────────
// {
//   id: string, name: string, level: string, description: string,
//   stub?: true,                       // 준비 중 실험 표시
//   equipment: [{
//     id, name, required:bool, desc,
//     makeMesh(THREE) => Object3D      // 저폴리, 들었을 때 최대 0.3m
//   }],
//   snapSlots: [{ id, accepts:[equipmentId…], pos:[x,y,z] }],
//                                      // pos는 실험대 anchor 기준 상대좌표(m)
//   checkAssembly(placed) => { ready, missing:[name…], hints:[str…] },
//                                      // placed = Map<slotId, equipmentId>
//   createModel() => {
//     inputs: {…},                     // 외부에서 직접 대입하는 조작 변수
//     step(dt),                        // dt초 물리 적분 (three 의존 금지!)
//     outputs() => {…}                 // 표시용 물리량
//   },
//   createVisuals(THREE, anchorObj, model, placed) => {
//     update(dt), dispose()
//   },
//   ui: {
//     controls: [{ id, type:'slider'|'toggle'|'buttons', label, unit,
//                  min, max, step, bind /* model.inputs 키 */, options? }],
//     readouts: [{ id, label, unit, digits, bind /* outputs 키 */,
//                  requiresItem /* 이 기구 없으면 '—' 표시 */ }],
//     graphs:   [{ id, label, x:{bind,label,unit}, y:{bind,label,unit} }]
//   }
// }
// ═══════════════════════════════════════════════════════════

const _registry = new Map();

export function registerExperiment(def) {
  if (!def || !def.id) throw new Error('experiment def에 id가 없습니다');
  if (_registry.has(def.id)) console.warn(`중복 등록: ${def.id}`);
  _registry.set(def.id, def);
}

export function getExperiment(id) { return _registry.get(id) || null; }

export function listExperiments() {
  return [..._registry.values()].map(d => ({
    id: d.id, name: d.name, level: d.level,
    description: d.description, ready: !d.stub,
  }));
}
