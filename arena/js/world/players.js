// ═══════════════════════════════════════════════════════════
// RemotePlayers — 원격 플레이어 렌더링 (300ms 지연 버퍼 보간)
// 본편 js/world/avatar.js(AvatarManager/RemoteAvatar)의 보간 로직을 포팅,
// 복셀 캐릭터(core/voxel.js)로 표현하도록 개조 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';
import { buildVoxelCharacter } from '../core/voxel.js';

const INTERP_DELAY = 300; // ms — 네트워크 지터 흡수용 지연 재생 (본편과 동일)
const MAX_BUFFER = 30;

const TEAM_COLOR = { OX: 0xff8a3d, RE: 0x00b4d8 };

// 최단 각도 보간 (−π~π 랩어라운드 대응) — 본편 js/world/avatar.js에서 포팅
function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// id 문자열 → 결정론적 숫자 시드 (캐릭터 외형 변주용, Math.random 미사용)
function idToSeed(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

class RemoteEntry {
  constructor(scene, id, profile) {
    this.scene = scene;
    this.id = id;
    this.profile = profile || {};
    this.buffer = []; // {t, p:[x,y,z], ry, an}
    this._curPos = new THREE.Vector3();
    this._curRy = 0;

    const team = this.profile.team === 'RE' ? 'RE' : 'OX';
    this.avatar = buildVoxelCharacter(THREE, {
      teamColor: TEAM_COLOR[team],
      name: this.profile.name || '참가자',
      seed: idToSeed(id),
    });
    scene.add(this.avatar.group);
  }

  setProfile(profile) {
    if (!profile) return;
    const prevName = this.profile.name;
    this.profile = { ...this.profile, ...profile };
    if (profile.name && profile.name !== prevName) this.avatar.setName(profile.name);
  }

  setInitial(state) {
    const p = Array.isArray(state?.p) ? state.p : [0, 0, 0];
    const ry = state?.ry || 0;
    this._curPos.set(p[0], p[1], p[2]);
    this._curRy = ry;
    this.avatar.group.position.set(p[0], p[1], p[2]);
    this.avatar.group.rotation.y = ry;
  }

  push(state) {
    if (!state || !Array.isArray(state.p)) return; // 불완전한 상태는 무시(안전)
    this.buffer.push({ t: performance.now(), p: state.p, ry: state.ry || 0, an: state.an || 0 });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  update(dt) {
    const renderT = performance.now() - INTERP_DELAY;
    const buf = this.buffer;
    while (buf.length > 2 && buf[1].t <= renderT) buf.shift();

    let px, py, pz, ry, an = 0, speedRatio = 0;
    if (buf.length === 0) {
      px = this._curPos.x; py = this._curPos.y; pz = this._curPos.z; ry = this._curRy;
    } else if (buf.length === 1) {
      [px, py, pz] = buf[0].p; ry = buf[0].ry; an = buf[0].an;
      speedRatio = an ? 1 : 0;
    } else {
      const a = buf[0], b = buf[1];
      const span = Math.max(1, b.t - a.t);
      const t = THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1);
      px = THREE.MathUtils.lerp(a.p[0], b.p[0], t);
      py = THREE.MathUtils.lerp(a.p[1], b.p[1], t);
      pz = THREE.MathUtils.lerp(a.p[2], b.p[2], t);
      ry = lerpAngle(a.ry, b.ry, t);
      an = (a.an === 1 || b.an === 1) ? 1 : 0;
      speedRatio = an ? 1 : 0;
    }

    this._curPos.set(px, py, pz);
    this._curRy = ry;

    this.avatar.group.position.set(px, py, pz);
    this.avatar.group.rotation.y = ry;
    this.avatar.setAnim(an ? 'run' : 'idle');
    this.avatar.update(dt, speedRatio);
  }

  dispose() {
    this.scene.remove(this.avatar.group);
    this.avatar.dispose();
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this._entries = new Map(); // id -> RemoteEntry
  }

  upsert(id, profile, state) {
    let entry = this._entries.get(id);
    if (!entry) {
      entry = new RemoteEntry(this.scene, id, profile);
      this._entries.set(id, entry);
      if (state) entry.setInitial(state);
    } else {
      entry.setProfile(profile);
      if (state) entry.push(state);
    }
  }

  remove(id) {
    const entry = this._entries.get(id);
    if (!entry) return;
    entry.dispose();
    this._entries.delete(id);
  }

  update(dt) {
    for (const entry of this._entries.values()) entry.update(dt);
  }

  get count() { return this._entries.size; }
}
