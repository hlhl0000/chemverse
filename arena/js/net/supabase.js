// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA net/supabase.js — 본편 js/net/supabase.js에서 포팅
// 확장:
//  - broadcast 'msg' 이벤트 추가(즉시 전송, send(type,payload)/on('msg'))
//  - presence 최초 등장 시 'join' 이벤트 발화(seen 집합으로 중복 방지)
//  - presence(profile 포함) + broadcast 는 'state'/'msg' 2종. self:false.
// 구독 실패/5초 타임아웃 시 throw → main.js가 solo로 폴백한다.
// ═══════════════════════════════════════════════════════════

const SUBSCRIBE_TIMEOUT_MS = 5000;

export async function createAdapter(CFG, emitter) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const client = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const myId = crypto.randomUUID();

  let channel = null;
  const profileCache = new Map(); // id -> profile
  const seen = new Set();         // 'join' 중복 발화 방지
  let lastSentSpace = null;

  function presenceCount() {
    try { return Object.keys(channel.presenceState()).length; } catch { return 1; }
  }

  function handlePresenceSync() {
    let state;
    try { state = channel.presenceState(); } catch { return; }
    let count = 0;
    for (const key of Object.keys(state)) {
      count++;
      if (key === myId) continue;
      const metas = state[key];
      const meta = metas && metas[metas.length - 1];
      if (!meta) continue;
      if (meta.profile) profileCache.set(key, meta.profile);
      if (!seen.has(key)) {
        seen.add(key);
        emitter.emit('join', { id: key, profile: meta.profile });
      }
      emitter.emit('peer', { id: key, profile: meta.profile, state: meta.state });
    }
    emitter.emit('status', { connected: true, count });
  }

  return {
    id: myId,

    join(room, profile) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); fn(arg); };

        channel = client.channel(`chemverse:${room}`, {
          config: { broadcast: { self: false }, presence: { key: myId } },
        });

        channel.on('presence', { event: 'sync' }, handlePresenceSync);
        channel.on('presence', { event: 'join' }, handlePresenceSync);
        channel.on('presence', { event: 'leave' }, ({ key }) => {
          if (key === myId) return;
          profileCache.delete(key);
          seen.delete(key);
          emitter.emit('leave', { id: key });
          emitter.emit('status', { connected: true, count: presenceCount() });
        });
        channel.on('broadcast', { event: 'state' }, ({ payload }) => {
          if (!payload || payload.id === myId) return;
          emitter.emit('peer', { id: payload.id, profile: profileCache.get(payload.id), state: payload.state });
        });
        channel.on('broadcast', { event: 'msg' }, ({ payload: msg }) => {
          if (!msg || msg.id === myId) return;
          emitter.emit('msg', { id: msg.id, type: msg.type, payload: msg.payload });
        });

        const timer = setTimeout(() => {
          finish(reject, new Error('[supabase] 채널 구독 시간 초과(5초)'));
        }, SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            if (settled) return;
            profileCache.set(myId, profile);
            try {
              await channel.track({ profile, state: {} });
            } catch (e) { finish(reject, e); return; }
            finish(resolve);
            // 구독 타이밍 경합 방지: join() 반환 직후(동기 계속부에서 RoomSession이
            // 리스너를 등록) 매크로태스크로 미뤄 presence 전체 스냅샷을 한 번 더
            // 재발화한다 — 이미 처리된 id는 seen 집합에서 걸러지므로 중복 무해.
            setTimeout(handlePresenceSync, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            emitter.emit('status', { connected: false, count: 1 });
            finish(reject, new Error(`[supabase] 채널 구독 실패: ${status}`));
          }
        });
      });
    },

    leave() {
      try { channel?.unsubscribe(); } catch { /* 무시 */ }
      channel = null;
    },

    _rawSend(state) {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'state', payload: { id: myId, state } });
      // 트래픽 절약: presence track()은 join 시 1회 + space 변경 시에만
      if (state.space !== lastSentSpace) {
        lastSentSpace = state.space;
        channel.track({ profile: profileCache.get(myId), state }).catch(() => {});
      }
    },

    _rawSendMsg(type, payload) {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'msg', payload: { id: myId, type, payload } });
    },
  };
}
