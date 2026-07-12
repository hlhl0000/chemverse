// ═══════════════════════════════════════════════════════════
// wsrelay 어댑터 — 순수 WebSocket JSON 프로토콜 (server/relay.js와 짝을 이룸)
// (소유: 에이전트 A)
// 클라→서버 {t:'join', room, id, profile} / {t:'state', d:state}
// 서버→클라 {t:'peers', list} / {t:'peer', id, profile?, d} / {t:'leave', id}
// 연결 실패 시 join에서 throw. onclose 시 3초 후 1회 재접속 시도.
// ═══════════════════════════════════════════════════════════

const CONNECT_TIMEOUT_MS = 5000;
const RECONNECT_DELAY_MS = 3000;

export async function createAdapter(CFG, emitter) {
  const url = CFG.WSRELAY_URL || `ws://${location.host}`;
  const myId = crypto.randomUUID();

  let ws = null;
  let room = null;
  let profile = null;
  let reconnectTried = false;

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { console.error('[wsrelay] 전송 실패', e); }
    }
  }

  function handleMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'peers') {
      const list = msg.list || [];
      list.forEach((p) => emitter.emit('peer', { id: p.id, profile: p.profile, state: p.state }));
      emitter.emit('status', { connected: true, count: list.length + 1 });
    } else if (msg.t === 'peer') {
      emitter.emit('peer', { id: msg.id, profile: msg.profile, state: msg.d });
    } else if (msg.t === 'leave') {
      emitter.emit('leave', { id: msg.id });
    }
  }

  function scheduleReconnect() {
    if (reconnectTried) return;
    reconnectTried = true;
    setTimeout(() => {
      try {
        const socket = new WebSocket(url);
        socket.addEventListener('open', () => {
          ws = socket;
          reconnectTried = false;
          attach(socket);
          send({ t: 'join', room, id: myId, profile });
          emitter.emit('status', { connected: true, count: 1 });
        });
        socket.addEventListener('error', () => emitter.emit('status', { connected: false }));
      } catch {
        emitter.emit('status', { connected: false });
      }
    }, RECONNECT_DELAY_MS);
  }

  function attach(socket) {
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', () => {
      emitter.emit('status', { connected: false });
      scheduleReconnect();
    });
    socket.addEventListener('error', () => { /* close 이벤트가 뒤따름 */ });
  }

  return {
    join(r, p) {
      room = r; profile = p;
      return new Promise((resolve, reject) => {
        let settled = false;
        let socket;
        try {
          socket = new WebSocket(url);
        } catch (e) { reject(e); return; }

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { socket.close(); } catch { /* 무시 */ }
          reject(new Error('[wsrelay] 연결 시간 초과'));
        }, CONNECT_TIMEOUT_MS);

        socket.addEventListener('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws = socket;
          attach(socket);
          send({ t: 'join', room, id: myId, profile });
          resolve();
        });
        socket.addEventListener('error', (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error('[wsrelay] 연결 오류'));
        });
      });
    },

    leave() {
      if (ws) { try { ws.close(); } catch { /* 무시 */ } ws = null; }
    },

    _rawSend(state) {
      send({ t: 'state', d: state });
    },
  };
}
