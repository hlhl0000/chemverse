// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA net/net.js — 본편 js/net/net.js에서 포팅 + v2 확장
// createNet(mode, CFG) -> adapter
//
// 확장점(본편 대비):
//  - adapter.id 노출 (각 어댑터가 발급하는 고유 id 통과)
//  - adapter.send(type, payload) / on('msg', …) — 즉시(스로틀 없음) 이벤트 채널
//  - status 이벤트에 mode 자동 삽입: {connected, count, mode} — 어댑터 구현은
//    mode를 몰라도 되도록 emit 래퍼(withModeEmitter)에서 주입한다.
//  - 'join'(presence 입장) 이벤트는 각 어댑터가 emitter.emit('join', …)로 발화한다.
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
  // ★ 우선순위 계약(config.js §주석): wsrelay 단서 → supabase → solo.
  // Supabase 키는 항상 설정돼 있으므로 supabase를 먼저 검사하면 교내망 릴레이가
  // 페이지를 서빙 중이어도 supabase로 붙어 수업 트래픽이 무료 티어를 초과한다. (Fable 검수 수정)
  const hasWsHint = !!CFG.WSRELAY_URL || (typeof location !== 'undefined' && location.port === '8080');
  if (hasWsHint) return 'wsrelay';
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) return 'supabase';
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

// status 이벤트에만 mode를 자동 주입하는 emit 래퍼. 어댑터 내부 코드는 그대로
// emitter.emit('status', {connected, count})만 호출하면 된다.
function withModeEmitter(emitter, mode) {
  return {
    on: emitter.on,
    off: emitter.off,
    emit(evt, payload) {
      if (evt === 'status') {
        emitter.emit(evt, { mode, ...(payload || {}) });
      } else {
        emitter.emit(evt, payload);
      }
    },
  };
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
 * 공통 전송 스로틀(본편과 동일 로직):
 * - 직전 전송 대비 위치·시선 변화가 거의 없으면(|Δp|<0.05m && |Δry|<0.05rad)
 *   CFG.KEEPALIVE_MS 간격으로만 1회 전송(정지 유지 신호).
 * - 변화가 있으면 1000/CFG.SEND_HZ ms 간격으로 제한 전송.
 * - space가 바뀌면(공간 이동) 즉시 전송. (ARENA 상태에는 space가 없으므로 항상 undefined로 취급되어도 무해)
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

  // ★신규: 즉시 이벤트 브로드캐스트(스로틀 없음)
  function send(type, payload) {
    try { adapter._rawSendMsg(type, payload); } catch (e) { console.error('[net] msg 전송 오류', e); }
  }

  return {
    mode,
    id: adapter.id,
    join: (room, profile) => adapter.join(room, profile),
    leave: () => adapter.leave(),
    sendState,
    send,
    on: emitter.on,
    off: emitter.off,
  };
}

export async function createNet(mode, CFG) {
  const resolved = resolveMode(mode, CFG);
  const emitter = createEmitter();
  const modeEmitter = withModeEmitter(emitter, resolved);
  const modulePath = ADAPTER_PATH[resolved] || ADAPTER_PATH.solo;
  const { createAdapter } = await import(modulePath);
  const adapter = await createAdapter(CFG, modeEmitter);
  return wrapAdapter(resolved, adapter, emitter, CFG);
}
