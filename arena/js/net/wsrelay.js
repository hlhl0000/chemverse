// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA net/wsrelay.js — 본편 js/net/wsrelay.js에서 포팅
// (server/relay.js와 짝을 이룸)
// 확장:
//  - {t:'msg'} 프로토콜 추가 — 즉시 이벤트 채널(send(type,payload)/on('msg'))
//  - 최초로 관측되는 피어에 대해 'join' 이벤트 합성 발화(seen 집합, 중복 방지)
//
// 프로토콜:
//  클라→서버 {t:'join', room, id, profile} / {t:'state', d:state} / {t:'msg', d:{type,payload}}
//  서버→클라 {t:'peers', list} / {t:'peer', id, profile?, d} / {t:'msg', id, d:{type,payload}} / {t:'leave', id}
//
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
  const seen = new Set(); // 'join' 합성 발화 중복 방지

  function markJoin(id, pf) {
    if (!id || id === myId || seen.has(id)) return;
    seen.add(id);
    emitter.emit('join', { id, profile: pf });
  }

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
      list.forEach((p) => {
        markJoin(p.id, p.profile);
        emitter.emit('peer', { id: p.id, profile: p.profile, state: p.state });
      });
      emitter.emit('status', { connected: true, count: list.length + 1 });
    } else if (msg.t === 'peer') {
      markJoin(msg.id, msg.profile);
      emitter.emit('peer', { id: msg.id, profile: msg.profile, state: msg.d });
    } else if (msg.t === 'msg') {
      if (msg.id === myId) return;
      const d = msg.d || {};
      emitter.emit('msg', { id: msg.id, type: d.type, payload: d.payload });
    } else if (msg.t === 'leave') {
      seen.delete(msg.id);
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
    id: myId,

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

    _rawSendMsg(type, payload) {
      send({ t: 'msg', d: { type, payload } });
    },
  };
}
