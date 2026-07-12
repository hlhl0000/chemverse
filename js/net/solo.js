// ═══════════════════════════════════════════════════════════
// solo 어댑터 — 오프라인/폴백 모드. 전송 없이 즉시 성공한다.
// (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════

export async function createAdapter(_CFG, emitter) {
  return {
    async join(_room, _profile) {
      emitter.emit('status', { connected: false, count: 1 });
    },
    async leave() { /* no-op */ },
    _rawSend(_state) { /* no-op: 솔로 모드는 아무도 없으므로 전송하지 않음 */ },
  };
}
