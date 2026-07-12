// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA net/room.js — RoomSession (신규 로직, three 임포트 금지)
// net.js가 제공하는 adapter(v2: id/join/leave/sendState/send/on) 위에서
// 로스터·팀 배정·호스트 선출/승계·시작 신호를 관리하는 순수 상태 머신.
//
// 호스트 판정: 참가자 profile.joinTs 최솟값(동률 시 id 사전순) = 호스트.
// 'start' 이벤트는 msg 채널('start' 타입)로 전파되며, 각 RoomSession 인스턴스는
// 로컬에서 정확히 1회만 발화한다(중복 수신 시 무시). 호스트는 자신이 시작한 뒤
// 늦게 입장한 피어를 감지하면 동일 payload로 재전송해 따라잡게 한다.
// ═══════════════════════════════════════════════════════════

import { MAX_PER_ROOM } from './config.js';

function comparePlayers(a, b) {
  const ta = (a.profile && a.profile.joinTs) || 0;
  const tb = (b.profile && b.profile.joinTs) || 0;
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class RoomSession {
  constructor(adapter, myProfile) {
    this.adapter = adapter;
    this.myProfile = myProfile;

    this._listeners = { roster: [], host: [], start: [] };
    this._byId = new Map();     // id -> {id, profile, me}
    this._hostId = null;
    this._startFired = false;
    this._startPayload = null;

    // 자신을 즉시 로스터에 등록(다른 피어의 join 이벤트를 기다릴 필요 없음)
    this._byId.set(adapter.id, { id: adapter.id, profile: { ...myProfile }, me: true });

    adapter.on('join', ({ id, profile }) => this._onPeerJoin(id, profile));
    adapter.on('peer', ({ id, profile }) => { if (profile) this._onPeerJoin(id, profile); });
    adapter.on('leave', ({ id }) => this._onPeerLeave(id));
    adapter.on('msg', ({ id, type, payload }) => this._onMsg(id, type, payload));

    // 최초 상태 발화 — main.js가 room.on(...)을 등록하는 시점은 생성자 반환 직후이므로
    // _recompute()의 이벤트 발화는 항상 매크로/마이크로태스크로 지연시켜(아래 _recompute 참고)
    // 리스너 등록 이전에 유실되지 않게 한다.
    this._recompute();
  }

  // ── 공개 프로퍼티 ────────────────────────────────
  get players() {
    const arr = [...this._byId.values()].map((p) => ({
      id: p.id,
      profile: p.profile,
      isHost: p.id === this._hostId,
      me: p.id === this.adapter.id,
    }));
    arr.sort(comparePlayers);
    return arr;
  }

  get isHost() { return this._hostId === this.adapter.id; }

  get myTeam() {
    const me = this._byId.get(this.adapter.id);
    return me ? (me.profile.team || null) : null;
  }

  // 정원 초과 여부(RoomSession이 자체 인지 — UI 안내는 lobby.js가 setRoster에서 처리)
  get isFull() { return this._byId.size > MAX_PER_ROOM; }

  // ── 공개 메서드 ────────────────────────────────
  setTeam(team) {
    const me = this._byId.get(this.adapter.id);
    if (!me) return;
    me.profile = { ...me.profile, team };
    this.myProfile = me.profile;
    this.adapter.send('team', { team });
    this._recompute();
  }

  suggestTeam() {
    let ox = 0, re = 0;
    for (const p of this._byId.values()) {
      if (p.profile.team === 'OX') ox++;
      else if (p.profile.team === 'RE') re++;
    }
    return ox <= re ? 'OX' : 'RE';
  }

  start() {
    if (!this.isHost) return;
    if (!this._startPayload) {
      this._startPayload = { seed: (Math.random() * 1e9) | 0, t0: Date.now() };
    }
    this.adapter.send('start', this._startPayload);
    this._fireStartOnce(this._startPayload);
  }

  leave() {
    return this.adapter.leave();
  }

  on(evt, cb) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(cb);
    return () => {
      const a = this._listeners[evt];
      const i = a.indexOf(cb);
      if (i >= 0) a.splice(i, 1);
    };
  }

  // ── 내부 ────────────────────────────────────────
  _emit(evt, payload) {
    const a = this._listeners[evt];
    if (!a || !a.length) return;
    [...a].forEach((cb) => { try { cb(payload); } catch (e) { console.error('[room]', e); } });
  }

  _onPeerJoin(id, profile) {
    if (!id || id === this.adapter.id) return;
    const existed = this._byId.get(id);
    const incoming = profile || {};
    // team은 msg 'team' 브로드캐스트로만 갱신되는 값이므로, presence/peer 재발화가
    // 오래된(팀 미배정) 프로필을 다시 실어올 때 이미 알고 있는 team을 덮어쓰지 않는다.
    const mergedTeam = incoming.team != null ? incoming.team : (existed ? existed.profile.team : null);
    const merged = { ...(existed ? existed.profile : {}), ...incoming, team: mergedTeam };
    this._byId.set(id, { id, profile: merged, me: false });

    if (this._byId.size > MAX_PER_ROOM) {
      console.warn(`[room] 정원 초과: ${this._byId.size}/${MAX_PER_ROOM}`);
    }
    this._recompute();

    // 늦은 입장자 감지 → 호스트가 시작 신호 재송신(늦게 들어온 사람도 카운트다운을 따라가도록)
    if (!existed && this.isHost && this._startFired && this._startPayload) {
      this.adapter.send('start', this._startPayload);
    }
  }

  _onPeerLeave(id) {
    if (!this._byId.has(id)) return;
    this._byId.delete(id);
    this._recompute();
  }

  _onMsg(id, type, payload) {
    if (id === this.adapter.id) return;
    if (type === 'team') {
      const existed = this._byId.get(id);
      const merged = { ...(existed ? existed.profile : {}), team: payload && payload.team };
      this._byId.set(id, { id, profile: merged, me: false });
      this._recompute();
    } else if (type === 'start') {
      this._fireStartOnce(payload);
    }
    // Phase B의 'req:*'/'ev:*' 타입은 이번 세션에서는 처리하지 않는다(계약 인지만).
  }

  _recompute() {
    const list = [...this._byId.values()].sort(comparePlayers);
    const newHostId = list.length ? list[0].id : null;
    const hostChanged = newHostId !== this._hostId;
    this._hostId = newHostId;
    // 리스너 등록 타이밍 경합 방지: main.js는 `new RoomSession(...)` 직후
    // 동기적으로 room.on(...)을 등록하므로, 이벤트 발화는 항상 마이크로태스크로
    // 미뤄 등록이 끝난 뒤에 전달되도록 한다.
    queueMicrotask(() => {
      this._emit('roster', this.players);
      if (hostChanged) {
        this._emit('host', { hostId: this._hostId, me: this._hostId === this.adapter.id });
      }
    });
  }

  _fireStartOnce(payload) {
    if (this._startFired) return;
    this._startFired = true;
    this._startPayload = payload;
    this._emit('start', payload);
  }
}
