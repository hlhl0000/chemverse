#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// ChemVerse 로컬 릴레이 서버 — 정적 파일 서빙 + WebSocket 룸 브로드캐스트
// 의존성: ws 패키지 하나만 사용(`npm install ws`). (소유: 에이전트 A)
// 실행: node server/relay.js  (포트 8080)
// ═══════════════════════════════════════════════════════════
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = 8080;
const ROOT = path.resolve(__dirname, '..'); // 프로젝트 루트 (server/의 상위 폴더)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// 경로 정규화 + 상위 디렉터리 탈출 차단
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const normalized = path.normalize(decoded);
  const full = path.join(root, normalized);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // 루트 밖 접근 차단
  return full;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const full = safeJoin(ROOT, urlPath);
  if (!full) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('잘못된 경로'); return; }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('찾을 수 없음: ' + urlPath);
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(full).pipe(res).on('error', () => res.end());
  });
});

const wss = new WebSocketServer({ server });

// room(string) -> Map<id, {ws, profile, state}>
const rooms = new Map();

function roomOf(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* 무시 */ }
  }
}

function broadcast(room, exceptId, obj) {
  const members = rooms.get(room);
  if (!members) return;
  for (const [id, peer] of members) {
    if (id === exceptId) continue;
    send(peer.ws, obj);
  }
}

wss.on('connection', (ws) => {
  let joinedRoom = null;
  let myId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      joinedRoom = String(msg.room || 'chemverse');
      myId = String(msg.id || Math.random().toString(36).slice(2));
      const members = roomOf(joinedRoom);

      // 본인에게 기존 피어 목록 회신
      const list = [...members.entries()].map(([id, p]) => ({ id, profile: p.profile, state: p.state }));
      send(ws, { t: 'peers', list });

      members.set(myId, { ws, profile: msg.profile, state: null });
      console.log(`[relay] 입장: room="${joinedRoom}" id=${myId} (현재 ${members.size}명 접속 중)`);

      // 룸의 다른 사람들에게 신규 피어 알림
      broadcast(joinedRoom, myId, { t: 'peer', id: myId, profile: msg.profile });
    } else if (msg.t === 'state') {
      if (!joinedRoom || !myId) return;
      const members = rooms.get(joinedRoom);
      const me = members && members.get(myId);
      if (me) me.state = msg.d;
      broadcast(joinedRoom, myId, { t: 'peer', id: myId, d: msg.d });
    }
  });

  ws.on('close', () => {
    if (!joinedRoom || !myId) return;
    const members = rooms.get(joinedRoom);
    if (!members) return;
    members.delete(myId);
    broadcast(joinedRoom, myId, { t: 'leave', id: myId });
    console.log(`[relay] 퇴장: room="${joinedRoom}" id=${myId} (남은 ${members.size}명)`);
    if (members.size === 0) rooms.delete(joinedRoom);
  });

  ws.on('error', () => { /* close 이벤트가 뒤따름 — 별도 처리 불필요 */ });
});

function localIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const it of ifaces[name] || []) {
      if (it.family === 'IPv4' && !it.internal) ips.push(it.address);
    }
  }
  return ips;
}

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════');
  console.log(' ChemVerse 로컬 릴레이 서버가 실행되었습니다.');
  console.log(` 이 PC에서 접속:      http://localhost:${PORT}/`);
  localIPs().forEach((ip) => console.log(` 같은 Wi-Fi 학생 접속: http://${ip}:${PORT}/`));
  console.log(' 종료하려면 Ctrl+C 를 누르세요.');
  console.log('═══════════════════════════════════════════════════');
});
