// ═══════════════════════════════════════════════════════════
// supabase 어댑터 — Realtime 채널의 broadcast(self:false) + presence로
// 입퇴장·상태 동기화. (소유: 에이전트 A)
// 구독 실패/5초 타임아웃 시 throw → main.js가 solo로 폴백한다.
// ═══════════════════════════════════════════════════════════

const SUBSCRIBE_TIMEOUT_MS = 5000;

export async function createAdapter(CFG, emitter) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const client = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const myId = crypto.randomUUID();

  let channel = null;
  const profileCache = new Map(); // id -> profile
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
      emitter.emit('peer', { id: key, profile: meta.profile, state: meta.state });
    }
    emitter.emit('status', { connected: true, count });
  }

  return {
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
          emitter.emit('leave', { id: key });
          emitter.emit('status', { connected: true, count: presenceCount() });
        });
        channel.on('broadcast', { event: 'state' }, ({ payload }) => {
          if (!payload || payload.id === myId) return;
          emitter.emit('peer', { id: payload.id, profile: profileCache.get(payload.id), state: payload.state });
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
  };
}
