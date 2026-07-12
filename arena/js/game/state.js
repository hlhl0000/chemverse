// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA game/state.js — GameClient (전 클라이언트 미러 + 요청 헬퍼)
// 순수 로직, three 임포트 금지. adapter(net.js v2)의 ev/snap 'msg'를 구독해
// 로컬 상태를 갱신하고, 동일 이벤트를 재발화한다(HUD·main.js 소비용).
//
// ── 호스트 로컬 루프백 규약(PHASE_B §5 B-1 "self 미수신 주의") ──
// adapter는 자기 자신에게 보낸 메시지를 되돌려주지 않는다. 호스트 자신이
// GameClient로도 참여하는 경우를 위해, 이 파일과 game/referee.js는 공유
// adapter 객체에 숨은 훅을 서로 등록해 로컬 배달을 보완한다:
//   adapter.__cvLocalEv(type, payload)  — referee.js가 설정, ev/snap을
//     "자기 자신에게도" 즉시 전달하기 위해 GameClient가 호출한다(반대 방향은
//     referee.js가 자신의 브로드캐스트 직후 직접 호출).
//   adapter.__cvLocalReq(type, payload) — referee.js가 설정(존재하면 자신이
//     호스트라는 뜻). GameClient는 req:* 전송 직후 존재 시 직접 호출해
//     심판이 자신의 요청도 즉시 처리하도록 한다.
// 둘 다 optional(호스트가 아니면 존재하지 않으므로 평범한 네트워크 송수신만 일어난다).
// ═══════════════════════════════════════════════════════════

import { rollCrates } from './loot.js';
import { WEAPONS } from './combat.js';

const REQ_TYPES = new Set(['req:pickup', 'req:deposit', 'req:quiz', 'req:hit']);
const DENY_COOLDOWN_MS = 1000;

export class GameClient {
  constructor({ adapter, myId, myTeam, mission, seed }) {
    this.adapter = adapter;
    this.myId = myId;
    this.myTeam = myTeam;
    this.mission = mission;
    this.seed = seed;

    this._listeners = {};
    this._denyUntil = 0;

    // rollCrates(mission,seed)로 초기 크레이트 상태를 선구성(첫 snap 도착 전 표시용).
    const initialCrates = {};
    for (const c of rollCrates(mission, seed)) initialCrates[c.id] = null;

    this.state = {
      crates: initialCrates,
      drops: [],
      inv: { [myId]: [] },
      weap: { [myId]: 'spoit' },
      prog: { OX: [], RE: [] },
      gauge: { [myId]: 100 },
      alive: { [myId]: true },
      scores: { OX: 0, RE: 0 },
      pers: { [myId]: 0 },
      quizLock: { OX: 0, RE: 0 },
      endAt: mission && mission.timeLimitSec ? Date.now() + mission.timeLimitSec * 1000 : null,
      ended: null,
    };
    this.lastSnap = null;

    this._offMsg = adapter.on('msg', ({ id, type, payload }) => this._handleMsg(id, type, payload));

    // 호스트 자신이 GameClient로도 동작할 경우, referee.js가 설정한 훅으로 자신의
    // ev/snap 발화를 직접 받을 수 있도록 등록(존재하지 않으면 평범히 네트워크만 사용).
    adapter.__cvLocalEv = (type, payload) => this._handleMsg(adapter.id, type, payload);
  }

  // ── 요청 헬퍼 ────────────────────────────────
  _send(type, payload) {
    this.adapter.send(type, payload);
    if (typeof this.adapter.__cvLocalReq === 'function') {
      this.adapter.__cvLocalReq(type, payload);
    }
  }

  tryPickup(kind, id) {
    if (Date.now() < this._denyUntil) return;
    this._send('req:pickup', { kind, id });
  }

  tryDeposit() {
    // 자동 장착 쿨다운은 픽업과 동일하게 "거절 후 1초"만 적용한다(PHASE_B §5 B-2).
    if (Date.now() < this._denyUntil) return;
    this._send('req:deposit', {});
  }

  tryQuiz(answerId) {
    this._send('req:quiz', { answerId });
  }

  reportHit(sid, shooter, w, pos) {
    this._send('req:hit', { sid, shooter, w, pos });
  }

  // ── 접근자 ────────────────────────────────
  myInv() { return this.state.inv[this.myId] || []; }
  myGauge() { return this.state.gauge[this.myId] ?? 100; }
  myAlive() { return this.state.alive[this.myId] ?? true; }
  myWeapon() { return this.state.weap[this.myId] || 'spoit'; }
  teamProg(team) { return this.state.prog[team] || []; }
  scores() { return this.state.scores; }
  ended() { return this.state.ended; }

  // ── 이벤트 구독 ────────────────────────────────
  on(evt, cb) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(cb);
    return () => {
      const a = this._listeners[evt];
      const i = a.indexOf(cb);
      if (i >= 0) a.splice(i, 1);
    };
  }

  _emit(evt, payload) {
    const a = this._listeners[evt];
    if (!a || !a.length) return;
    [...a].forEach((cb) => { try { cb(payload); } catch (e) { console.error('[state]', e); } });
  }

  dispose() {
    if (this._offMsg) this._offMsg();
  }

  // ── 내부: msg 라우팅 ────────────────────────────────
  _handleMsg(_id, type, payload) {
    if (type === 'snap') { this._applySnap(payload); return; }
    if (type === 'ev') { this._applyEv(payload); return; }
    // 'shot'과 req:* 타입은 GameClient의 관심사가 아니다(main.js가 combat.js로 직접 라우팅).
  }

  _applySnap(snap) {
    if (!snap) return;
    this.lastSnap = snap;
    this.state = {
      crates: { ...(snap.crates || {}) },
      drops: [...(snap.drops || [])],
      inv: { ...(snap.inv || {}) },
      weap: { ...(snap.weap || {}) },
      prog: { OX: [...((snap.prog && snap.prog.OX) || [])], RE: [...((snap.prog && snap.prog.RE) || [])] },
      gauge: { ...(snap.gauge || {}) },
      alive: { ...(snap.alive || {}) },
      scores: { ...(snap.scores || { OX: 0, RE: 0 }) },
      pers: { ...(snap.pers || {}) },
      quizLock: { ...(snap.quizLock || { OX: 0, RE: 0 }) },
      endAt: snap.endAt ?? this.state.endAt,
      ended: snap.ended ?? null,
    };
    this._emit('snap', this.state);
  }

  _applyEv(ev) {
    if (!ev || !ev.kind) return;
    const st = this.state;
    switch (ev.kind) {
      case 'pickup': {
        if (ev.crateId != null) st.crates[ev.crateId] = ev.pid;
        if (ev.dropId != null) st.drops = st.drops.filter((d) => d.id !== ev.dropId);
        if (WEAPONS[ev.itemId]) {
          st.weap[ev.pid] = ev.itemId;
        } else {
          st.inv[ev.pid] = ev.inv ? [...ev.inv] : (st.inv[ev.pid] || []);
        }
        break;
      }
      case 'deny': {
        if (ev.pid === this.myId) this._denyUntil = Date.now() + DENY_COOLDOWN_MS;
        break;
      }
      case 'deposit': {
        st.prog[ev.team] = ev.prog ? [...ev.prog] : (st.prog[ev.team] || []);
        if (st.inv[ev.pid]) {
          const idx = st.inv[ev.pid].indexOf(ev.itemId);
          if (idx >= 0) st.inv[ev.pid] = [...st.inv[ev.pid].slice(0, idx), ...st.inv[ev.pid].slice(idx + 1)];
        }
        break;
      }
      case 'complete': {
        break; // prog 갱신은 deposit ev로 이미 반영됨. HUD가 showQuizButton 트리거용으로만 사용.
      }
      case 'quiz': {
        st.scores = { ...(ev.scores || st.scores) };
        if (!ev.correct) st.quizLock[ev.team] = ev.lockUntil || 0;
        break;
      }
      case 'hp': {
        st.gauge[ev.pid] = ev.gauge;
        break;
      }
      case 'kill': {
        st.alive[ev.victim] = false;
        st.gauge[ev.victim] = 0;
        if (ev.drop) st.drops = [...st.drops, ev.drop];
        st.scores = { ...(ev.scores || st.scores) };
        st.pers = { ...(ev.pers || st.pers) };
        break;
      }
      case 'respawn': {
        st.alive[ev.pid] = true;
        st.gauge[ev.pid] = 100;
        break;
      }
      case 'score': {
        st.scores = { ...(ev.scores || st.scores) };
        st.pers = { ...(ev.pers || st.pers) };
        break;
      }
      case 'end': {
        st.ended = { winner: ev.winner, reason: ev.reason };
        st.scores = { ...(ev.scores || st.scores) };
        st.pers = { ...(ev.pers || st.pers) };
        break;
      }
      default:
        break;
    }
    this._emit(ev.kind, ev);
  }
}
