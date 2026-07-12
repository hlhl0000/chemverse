// ═══════════════════════════════════════════════════════════
// createNet — 네트워크 어댑터 팩토리 + 공통 이벤트버스 + 공통 전송 스로틀
// (소유: 에이전트 A)
//
// mode: 'auto' | 'solo' | 'supabase' | 'wsrelay'
// 'auto' → SUPABASE 키가 있으면 supabase, 없고 wsrelay 단서가 있으면 wsrelay,
//          그 외에는 solo.
// ═══════════════════════════════════════════════════════════

const ADAPTER_PATH = {
  solo: './solo.js',
  supabase: './supabase.js',
  wsrelay: './wsrelay.js',
};

function resolveMode(mode, CFG) {
  if (mode !== 'auto') return mode;
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) return 'supabase';
  const hasWsHint = !!CFG.WSRELAY_URL || (typeof location !== 'undefined' && location.port === '8080');
  if (hasWsHint) return 'wsrelay';
  return 'solo';
}

// ── 공통 EventEmitter (on/off/emit) — 어댑터에 주입해 재사용 ──
function createEmitter() {
  const listeners = new Map();
  function on(evt, cb) {
    if (!listeners.has(evt)) listeners.set(evt, []);
    listeners.get(evt).push(cb);
    return () => off(evt, cb);
  }
  function off(evt, cb) {
    const a = listeners.get(evt);
    if (!a) return;
    const i = a.indexOf(cb);
    if (i >= 0) a.splice(i, 1);
  }
  function emit(evt, payload) {
    const a = listeners.get(evt);
    if (!a || !a.length) return;
    [...a].forEach((cb) => { try { cb(payload); } catch (e) { console.error('[net]', e); } });
  }
  return { on, off, emit };
}

function dist3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angleDiff(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * 공통 전송 스로틀:
 * - 직전 전송 대비 위치·시선 변화가 거의 없으면(|Δp|<0.05m && |Δry|<0.05rad)
 *   CFG.KEEPALIVE_MS 간격으로만 1회 전송(정지 유지 신호).
 * - 변화가 있으면 1000/CFG.SEND_HZ ms 간격으로 제한 전송.
 * - space가 바뀌면(공간 이동) 즉시 전송.
 */
function wrapAdapter(mode, adapter, emitter, CFG) {
  let last = null; // {p, ry, space, t}

  function reallySend(state) {
    try { adapter._rawSend(state); } catch (e) { console.error('[net] 전송 오류', e); }
  }

  function sendState(state) {
    const now = performance.now();
    if (!last || state.space !== last.space) {
      last = { p: state.p.slice(), ry: state.ry, space: state.space, t: now };
      reallySend(state);
      return;
    }
    const dp = dist3(state.p, last.p);
    const dry = angleDiff(state.ry, last.ry);
    const still = dp < 0.05 && dry < 0.05;
    const interval = still ? CFG.KEEPALIVE_MS : (1000 / CFG.SEND_HZ);
    if (now - last.t >= interval) {
      last = { p: state.p.slice(), ry: state.ry, space: state.space, t: now };
      reallySend(state);
    }
  }

  return {
    mode,
    join: (room, profile) => adapter.join(room, profile),
    leave: () => adapter.leave(),
    sendState,
    on: emitter.on,
    off: emitter.off,
  };
}

export async function createNet(mode, CFG) {
  const resolved = resolveMode(mode, CFG);
  const emitter = createEmitter();
  const modulePath = ADAPTER_PATH[resolved] || ADAPTER_PATH.solo;
  const { createAdapter } = await import(modulePath);
  const adapter = await createAdapter(CFG, emitter);
  return wrapAdapter(resolved, adapter, emitter, CFG);
}
