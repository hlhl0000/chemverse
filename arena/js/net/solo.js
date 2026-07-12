// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA net/solo.js — 본편 js/net/solo.js에서 포팅
// 오프라인/폴백 모드. 전송은 전부 no-op이며 status 이벤트만 발화한다.
// ═══════════════════════════════════════════════════════════

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `solo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createAdapter(_CFG, emitter) {
  const myId = makeId();

  return {
    id: myId,
    async join(_room, _profile) {
      emitter.emit('status', { connected: false, count: 1 });
    },
    async leave() { /* no-op */ },
    _rawSend(_state) { /* no-op: 솔로 모드는 아무도 없으므로 전송하지 않음 */ },
    _rawSendMsg(_type, _payload) { /* no-op: 솔로 모드는 즉시 이벤트도 전송하지 않음 */ },
  };
}
