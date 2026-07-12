// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA game/combat.js — 발사·투사체·자가 피격 (소유: 에이전트 B)
// 순수 로직, three 임포트 금지. 벽 차단 판정은 core/tps.js의 raySlabAABB
// 알고리즘을 참고해 순수 산술로 재구현(콜라이더의 .min/.max 수치만 읽음).
//
// 피격 판정 철학(PHASE_B §0-1): 발사자는 'shot'만 브로드캐스트, 각 클라이언트가
// 투사체를 각자 시뮬레이션하고 "자기가 맞았을 때만" 심판에 req:hit을 보낸다.
// 따라서 클라이언트마다 시뮬레이션 결과가 달라도 무방하다(결정적일 필요 없음).
// ═══════════════════════════════════════════════════════════

// 무기 데이터 — PHASE_B §3 표 그대로(동결, 임의 변경 금지)
export const WEAPONS = {
  spoit: { id: 'spoit', name: '스포이트 물총', dmg: 25, speed: 18, cooldown: 0.5, mag: 3, reload: 1.5 },
  buret: { id: 'buret', name: '뷰렛 스나이퍼', dmg: 40, speed: 40, cooldown: 1.2, mag: 1, reload: 2.0 },
  spray: { id: 'spray', name: '시약 분무기', dmg: 12, pellets: 5, speed: 12, cooldown: 1.0, mag: 2, reload: 1.8, spread: 0.15, range: 7 },
  flask: { id: 'flask', name: '부피 플라스크', dmg: 50, speed: 11, cooldown: 2.0, mag: 1, reload: 2.2, blastRadius: 2 },
};

export const GRAVITY = 9.8;
const PROJECTILE_LIFE = 2.0;   // s — 기본 투사체 수명
const HIT_RADIUS = 0.5;        // m — 플레이어 캡슐 반경
const CAPSULE_Y = 0.9;         // m — 캡슐 중심 y 오프셋(플레이어 발 기준)

function now() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
function normalize(v) {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dist(a, b) { return len(sub(a, b)); }

// core/tps.js raySlabAABB 참고 이식(마진 없음, 정규화된 방향 + 이번 스텝 길이 L만 검사)
function segmentHitsAABB(o, d, box, L) {
  let tNear = 0, tFar = L;
  const mins = [box.min.x, box.min.y, box.min.z];
  const maxs = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return -1;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tNear) tNear = t1;
      if (t2 < tFar) tFar = t2;
      if (tNear > tFar) return -1;
    }
  }
  return tNear >= 0 ? tNear : -1;
}

function pointInsideAnyBox(p, colliders) {
  for (const box of colliders) {
    if (p[0] >= box.min.x && p[0] <= box.max.x &&
        p[1] >= box.min.y && p[1] <= box.max.y &&
        p[2] >= box.min.z && p[2] <= box.max.z) return true;
  }
  return false;
}

export class Combat {
  constructor({ colliders, getMyPos, myId }) {
    this.colliders = colliders || [];
    this.getMyPos = getMyPos || (() => [0, 0, 0]);
    this.myId = myId;

    this._weaponId = 'spoit';
    this._states = {};
    for (const id of Object.keys(WEAPONS)) {
      this._states[id] = { ammo: WEAPONS[id].mag, cdUntil: 0, reloadUntil: 0 };
    }
    this._n = 0;
    this._projectiles = []; // {id, w, shooter, pos, dir|vel, t, life, kind, done}
  }

  _cur() { return WEAPONS[this._weaponId]; }
  _state(id = this._weaponId) { return this._states[id]; }

  _refill(id) {
    const s = this._state(id);
    const w = WEAPONS[id];
    if (s.ammo <= 0 && s.reloadUntil > 0 && now() >= s.reloadUntil) {
      s.ammo = w.mag;
      s.reloadUntil = 0;
    }
  }

  setWeapon(id) {
    if (WEAPONS[id]) this._weaponId = id;
  }

  canFire() {
    this._refill(this._weaponId);
    const s = this._state();
    const t = now();
    return t >= s.cdUntil && t >= s.reloadUntil && s.ammo > 0;
  }

  ammo() {
    this._refill(this._weaponId);
    const w = this._cur();
    const s = this._state();
    return { id: this._weaponId, mag: w.mag, cur: s.ammo, reloading: s.reloadUntil > now() };
  }

  _genSid() { return `${this.myId}:${this._n++}`; }

  _pushLinear(sid, w, shooterId, origin, dir, speed, life) {
    this._projectiles.push({
      id: sid, w, shooter: shooterId, kind: 'linear',
      pos: origin.slice(), dir: normalize(dir), speed, t: 0, life, done: false,
    });
  }

  _pushArc(sid, w, shooterId, origin, dir, speed, life) {
    const nd = normalize(dir);
    this._projectiles.push({
      id: sid, w, shooter: shooterId, kind: 'arc',
      pos: origin.slice(), vel: [nd[0] * speed, nd[1] * speed, nd[2] * speed],
      t: 0, life, done: false,
    });
  }

  _register(sid, weaponId, origin, dir, shooterId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    if (weaponId === 'spray') {
      for (let i = 0; i < w.pellets; i++) {
        // 자체 산탄 확산(비결정 영역 — 각자 로컬 시각 시뮬레이션이므로 Math.random 허용)
        const spreadYaw = (Math.random() - 0.5) * 2 * w.spread;
        const spreadPitch = (Math.random() - 0.5) * 2 * w.spread;
        const [dx, dy, dz] = normalize(dir);
        // 간이 회전: yaw(y축)·pitch(x축) 근사 확산 — 기존 dir 기준 소각도 섭동
        const cy = Math.cos(spreadYaw), sy = Math.sin(spreadYaw);
        const rx = dx * cy + dz * sy;
        const rz = -dx * sy + dz * cy;
        const ry = dy + spreadPitch;
        const pelletDir = normalize([rx, ry, rz]);
        const life = Math.min(PROJECTILE_LIFE, w.range / w.speed);
        this._pushLinear(`${sid}:p${i}`, weaponId, shooterId, origin, pelletDir, w.speed, life);
      }
    } else if (weaponId === 'flask') {
      this._pushArc(sid, weaponId, shooterId, origin, dir, w.speed, PROJECTILE_LIFE);
    } else {
      this._pushLinear(sid, weaponId, shooterId, origin, dir, w.speed, PROJECTILE_LIFE);
    }
  }

  fire(origin, dir) {
    if (!this.canFire()) return null;
    const w = this._cur();
    const s = this._state();
    const t = now();
    s.ammo -= 1;
    s.cdUntil = t + w.cooldown;
    if (s.ammo <= 0) s.reloadUntil = t + w.reload;

    const sid = this._genSid();
    this._register(sid, this._weaponId, origin, dir, this.myId);
    return { sid, w: this._weaponId, o: origin.slice(), d: normalize(dir) };
  }

  onRemoteShot({ sid, w, o, d, shooter }) {
    if (!WEAPONS[w]) return;
    this._register(sid, w, o, d, shooter);
  }

  update(dt) {
    const myPos = this.getMyPos();
    const myCapsule = [myPos[0], myPos[1] + CAPSULE_Y, myPos[2]];
    const myHits = [];
    const impacts = [];
    const alive = [];

    for (const p of this._projectiles) {
      p.t += dt;
      if (p.t > p.life) continue; // 만료 — 제거(impact 없음)

      if (p.kind === 'linear') {
        const step = p.speed * dt;
        let hitT = -1;
        for (const box of this.colliders) {
          const t = segmentHitsAABB(p.pos, p.dir, box, step);
          if (t >= 0 && (hitT < 0 || t < hitT)) hitT = t;
        }
        if (hitT >= 0) {
          p.pos = [p.pos[0] + p.dir[0] * hitT, p.pos[1] + p.dir[1] * hitT, p.pos[2] + p.dir[2] * hitT];
          impacts.push({ pos: p.pos.slice(), w: p.w });
          p.done = true;
        } else {
          p.pos = [p.pos[0] + p.dir[0] * step, p.pos[1] + p.dir[1] * step, p.pos[2] + p.dir[2] * step];
        }
        if (!p.done && p.shooter !== this.myId && dist(p.pos, myCapsule) <= HIT_RADIUS) {
          myHits.push({ sid: p.id, shooter: p.shooter, w: p.w, pos: p.pos.slice() });
          p.done = true;
        }
      } else if (p.kind === 'arc') {
        p.vel[1] -= GRAVITY * dt;
        p.pos = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt, p.pos[2] + p.vel[2] * dt];
        const grounded = p.pos[1] <= 0;
        const walled = pointInsideAnyBox(p.pos, this.colliders);
        if (grounded) p.pos[1] = 0;
        if (grounded || walled) {
          impacts.push({ pos: p.pos.slice(), w: p.w });
          const blastR = WEAPONS.flask.blastRadius;
          if (p.shooter !== this.myId && dist(p.pos, myCapsule) <= blastR) {
            myHits.push({ sid: p.id, shooter: p.shooter, w: p.w, pos: p.pos.slice() });
          }
          p.done = true;
        } else if (p.shooter !== this.myId && dist(p.pos, myCapsule) <= HIT_RADIUS) {
          myHits.push({ sid: p.id, shooter: p.shooter, w: p.w, pos: p.pos.slice() });
          p.done = true;
        }
      }

      if (!p.done) alive.push(p);
    }
    this._projectiles = alive;

    return {
      projectiles: this._projectiles.map((p) => ({ id: p.id, pos: p.pos.slice(), w: p.w })),
      myHits,
      impacts,
    };
  }
}
