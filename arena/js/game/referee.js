// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA game/referee.js — 호스트 심판 (순수 로직, 소유: 에이전트 B)
// three 임포트 금지. req:* 를 수신해 규칙을 판정하고 ev/snap을 브로드캐스트한다.
// 호스트 승계 시 main.js가 fromSnap(GameClient.lastSnap)을 넘겨 이어서 심판한다.
//
// 로컬 루프백 규약은 game/state.js 상단 주석 참고: 이 파일은
//   adapter.__cvLocalReq(type,payload) — 호스트 자신의 req:* 즉시 처리용 훅 설정
// 을 제공하고, 자신의 ev/snap 브로드캐스트 직후 adapter.__cvLocalEv가 있으면
// 직접 호출해 호스트 자신의 GameClient도 즉시 갱신되도록 한다.
// ═══════════════════════════════════════════════════════════

import { rollCrates } from './loot.js';
import { WEAPONS } from './combat.js';

const SNAP_INTERVAL_MS = 2000;
const RESPAWN_MS = 3000;

function teamOf(roster, pid) {
  const p = (roster || []).find((x) => x.id === pid);
  if (!p) return null;
  return (p.profile && p.profile.team) || p.team || null;
}

export class Referee {
  constructor({ adapter, mission, seed, roster, cfg, fromSnap }) {
    this.adapter = adapter;
    this.mission = mission;
    this.seed = seed;
    this.roster = roster || [];
    this.cfg = {
      timeLimitSec: (cfg && cfg.timeLimitSec) ?? mission.timeLimitSec ?? 600,
      wrongPenalty: (cfg && cfg.wrongPenalty) ?? mission.wrongPenalty ?? 20,
      retryLockSec: (cfg && cfg.retryLockSec) ?? mission.retryLockSec ?? 30,
    };

    this._crateDefs = rollCrates(mission, seed); // [{id,kind,itemId,zone}] — 단일 소스(loot.js)
    this._dropSeq = 0;
    this._respawnTimers = new Set();
    this._snapTimer = null;
    this._processedHits = new Set();

    if (fromSnap) {
      this.crates = { ...(fromSnap.crates || {}) };
      this.drops = [...(fromSnap.drops || [])];
      this.inv = { ...(fromSnap.inv || {}) };
      this.weap = { ...(fromSnap.weap || {}) };
      this.prog = { OX: [...((fromSnap.prog && fromSnap.prog.OX) || [])], RE: [...((fromSnap.prog && fromSnap.prog.RE) || [])] };
      this.gauge = { ...(fromSnap.gauge || {}) };
      this.alive = { ...(fromSnap.alive || {}) };
      this.scores = { ...(fromSnap.scores || { OX: 0, RE: 0 }) };
      this.pers = { ...(fromSnap.pers || {}) };
      this.quizLock = { ...(fromSnap.quizLock || { OX: 0, RE: 0 }) };
      this.endAt = fromSnap.endAt || null;
      this.ended = fromSnap.ended || null;
      // 최대 드랍 id 시퀀스 이어가기
      for (const d of this.drops) {
        const m = /^d(\d+)$/.exec(d.id || '');
        if (m) this._dropSeq = Math.max(this._dropSeq, parseInt(m[1], 10) + 1);
      }
    } else {
      this.crates = {};
      for (const c of this._crateDefs) this.crates[c.id] = null;
      this.drops = [];
      this.inv = {};
      this.weap = {};
      this.prog = { OX: [], RE: [] };
      this.gauge = {};
      this.alive = {};
      this.scores = { OX: 0, RE: 0 };
      this.pers = {};
      this.quizLock = { OX: 0, RE: 0 };
      this.endAt = null;
      this.ended = null;
    }

    for (const p of this.roster) {
      if (this.inv[p.id] == null) this.inv[p.id] = [];
      if (this.weap[p.id] == null) this.weap[p.id] = 'spoit';
      if (this.gauge[p.id] == null) this.gauge[p.id] = 100;
      if (this.alive[p.id] == null) this.alive[p.id] = true;
      if (this.pers[p.id] == null) this.pers[p.id] = 0;
    }

    this._offMsg = adapter.on('msg', ({ id, type, payload }) => {
      if (typeof type === 'string' && type.startsWith('req:')) this._handleReq(id, type, payload);
    });
    // 호스트 자신의 req:* 로컬 루프백 훅(game/state.js 참고)
    adapter.__cvLocalReq = (type, payload) => this._handleReq(adapter.id, type, payload);
  }

  start(t0) {
    if (!this.endAt) this.endAt = t0 + this.cfg.timeLimitSec * 1000;
    this._broadcastSnap();
    this._snapTimer = setInterval(() => {
      if (this.ended) return;
      this._broadcastSnap();
      if (Date.now() >= this.endAt) this._finish('time');
    }, SNAP_INTERVAL_MS);
  }

  stop() {
    if (this._snapTimer) { clearInterval(this._snapTimer); this._snapTimer = null; }
    for (const t of this._respawnTimers) clearTimeout(t);
    this._respawnTimers.clear();
    if (this._offMsg) this._offMsg();
    if (this.adapter.__cvLocalReq) delete this.adapter.__cvLocalReq;
  }

  // ── 브로드캐스트 헬퍼 ────────────────────────────────
  _broadcast(type, payload) {
    this.adapter.send(type, payload);
    if (typeof this.adapter.__cvLocalEv === 'function') {
      this.adapter.__cvLocalEv(type, payload);
    }
  }

  _ev(kind, payload) { this._broadcast('ev', { kind, ...payload }); }

  _buildSnap() {
    return {
      crates: { ...this.crates },
      drops: this.drops.map((d) => ({ ...d })),
      inv: Object.fromEntries(Object.entries(this.inv).map(([k, v]) => [k, [...v]])),
      weap: { ...this.weap },
      prog: { OX: [...this.prog.OX], RE: [...this.prog.RE] },
      gauge: { ...this.gauge },
      alive: { ...this.alive },
      scores: { ...this.scores },
      pers: { ...this.pers },
      quizLock: { ...this.quizLock },
      endAt: this.endAt,
      ended: this.ended,
    };
  }

  _broadcastSnap() { this._broadcast('snap', this._buildSnap()); }

  _emitScore() { this._ev('score', { scores: { ...this.scores }, pers: { ...this.pers } }); }

  // ── 요청 처리 ────────────────────────────────
  _handleReq(pid, type, payload) {
    if (this.ended) return;
    payload = payload || {};
    try {
      if (type === 'req:pickup') this._reqPickup(pid, payload);
      else if (type === 'req:deposit') this._reqDeposit(pid);
      else if (type === 'req:quiz') this._reqQuiz(pid, payload);
      else if (type === 'req:hit') this._reqHit(pid, payload);
    } catch (e) {
      console.error('[referee]', type, e);
    }
  }

  _deny(pid, reason) { this._ev('deny', { pid, reason }); }

  _reqPickup(pid, { kind, id }) {
    if (kind === 'crate') {
      const def = this._crateDefs.find((c) => c.id === id);
      if (!def) return this._deny(pid, 'not_found');
      if (this.crates[id]) return this._deny(pid, 'taken');
      if (def.kind === 'part' && (this.inv[pid] || []).length >= 2) return this._deny(pid, 'inv_full');

      this.crates[id] = pid;
      if (def.kind === 'weapon') {
        this.weap[pid] = def.itemId;
      } else {
        this.inv[pid] = [...(this.inv[pid] || []), def.itemId];
      }
      this.pers[pid] = (this.pers[pid] || 0) + 10;
      this._ev('pickup', { pid, itemId: def.itemId, crateId: id, inv: [...(this.inv[pid] || [])] });
      this._emitScore();
    } else if (kind === 'drop') {
      const idx = this.drops.findIndex((d) => d.id === id);
      if (idx < 0) return this._deny(pid, 'not_found');
      if ((this.inv[pid] || []).length >= 2) return this._deny(pid, 'inv_full');
      const drop = this.drops[idx];
      this.drops = [...this.drops.slice(0, idx), ...this.drops.slice(idx + 1)];
      this.inv[pid] = [...(this.inv[pid] || []), drop.itemId];
      this.pers[pid] = (this.pers[pid] || 0) + 10;
      this._ev('pickup', { pid, itemId: drop.itemId, dropId: id, inv: [...(this.inv[pid] || [])] });
      this._emitScore();
    } else {
      this._deny(pid, 'bad_kind');
    }
  }

  _reqDeposit(pid) {
    const team = teamOf(this.roster, pid);
    if (!team) return this._deny(pid, 'no_team');
    const inv = this.inv[pid] || [];
    const already = new Set(this.prog[team] || []);
    const idx = inv.findIndex((itemId) => !already.has(itemId));
    if (idx < 0) return this._deny(pid, 'no_new_part');

    const itemId = inv[idx];
    this.inv[pid] = [...inv.slice(0, idx), ...inv.slice(idx + 1)];
    this.prog[team] = [...this.prog[team], itemId];
    this.pers[pid] = (this.pers[pid] || 0) + 15;
    this._ev('deposit', { pid, team, itemId, prog: [...this.prog[team]] });
    this._emitScore();

    const partsCount = (this.mission.parts || []).length;
    if (this.prog[team].length >= partsCount) {
      this.scores[team] = (this.scores[team] || 0) + 30;
      this._ev('complete', { team });
      this._emitScore();
    }
  }

  _reqQuiz(pid, { answerId }) {
    const team = teamOf(this.roster, pid);
    if (!team) return this._deny(pid, 'no_team');
    const partsCount = (this.mission.parts || []).length;
    if ((this.prog[team] || []).length < partsCount) return this._deny(pid, 'not_complete');
    const now = Date.now();
    if (this.quizLock[team] && now < this.quizLock[team]) return this._deny(pid, 'locked');

    const secret = this.mission.makeSecret(this.seed);
    const correct = answerId === this.mission.quiz.answerId(secret);
    if (correct) {
      this._ev('quiz', { team, correct: true, lockUntil: 0, scores: { ...this.scores } });
      this._finish('quiz', team);
    } else {
      this.scores[team] = (this.scores[team] || 0) - this.cfg.wrongPenalty;
      this.quizLock[team] = now + this.cfg.retryLockSec * 1000;
      this._ev('quiz', { team, correct: false, lockUntil: this.quizLock[team], scores: { ...this.scores } });
    }
  }

  _reqHit(pid, { sid, shooter, w, pos }) {
    const hitKey = `${sid}>${pid}`;
    if (this._processedHits.has(hitKey)) return;
    this._processedHits.add(hitKey);
    if (this._processedHits.size > 2000) this._processedHits.clear();

    const victim = pid;
    if (!this.alive[victim]) return;
    if (!shooter || shooter === victim) return;
    const wdef = WEAPONS[w];
    if (!wdef) return;

    const gauge = Math.max(0, (this.gauge[victim] ?? 100) - wdef.dmg);
    this.gauge[victim] = gauge;
    this._ev('hp', { pid: victim, gauge });

    if (gauge <= 0) {
      this.alive[victim] = false;
      let drop = null;
      const inv = this.inv[victim] || [];
      if (inv.length > 0) {
        const itemId = inv[inv.length - 1];
        this.inv[victim] = inv.slice(0, -1);
        drop = { id: `d${this._dropSeq++}`, itemId, pos: pos || [0, 0, 0] };
        this.drops = [...this.drops, drop];
      }
      this.pers[shooter] = (this.pers[shooter] || 0) - 5;
      this._ev('kill', { victim, shooter, drop, scores: { ...this.scores }, pers: { ...this.pers } });

      const timer = setTimeout(() => {
        this._respawnTimers.delete(timer);
        if (this.ended) return;
        this.alive[victim] = true;
        this.gauge[victim] = 100;
        this._ev('respawn', { pid: victim });
      }, RESPAWN_MS);
      this._respawnTimers.add(timer);
    }
  }

  _finish(reason, winnerOverride) {
    if (this.ended) return;
    let winner = winnerOverride || null;
    if (!winner) {
      if (this.scores.OX > this.scores.RE) winner = 'OX';
      else if (this.scores.RE > this.scores.OX) winner = 'RE';
      else winner = null;
    }
    this.ended = { winner, reason };
    this._ev('end', { winner, reason, scores: { ...this.scores }, pers: { ...this.pers } });
    if (this._snapTimer) { clearInterval(this._snapTimer); this._snapTimer = null; }
  }
}
