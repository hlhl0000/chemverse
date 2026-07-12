// ═══════════════════════════════════════════════════════════
// AvatarManager — 원격 아바타(캡슐+헤드+이름표) 생성/보간/가시성 관리
// (소유: 에이전트 A). 로컬 아바타는 만들지 않음(1인칭 시점).
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';

const INTERP_DELAY = 300; // ms — 네트워크 지터 흡수용 지연 재생
const BOB_AMP = 0.03;     // m
const BOB_HZ = 8;         // Hz
const MAX_BUFFER = 30;

function disposeObject(o) {
  o.geometry?.dispose();
  if (o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
  }
}

// 이름표 스프라이트 (CanvasTexture)
function makeNameSprite(name, colorCss) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 34, pad = 12;
  ctx.font = `700 ${fontSize}px sans-serif`;
  const w = Math.ceil(ctx.measureText(name).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(9,12,19,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = colorCss || 'rgba(0,180,216,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#eaf6fb';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(name, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.36;
  const aspect = w / h;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

// 최단 각도 보간 (−π~π 랩어라운드 대응)
function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

class RemoteAvatar {
  constructor(scene, profile) {
    this.scene = scene;
    this.profile = profile || {};
    this.space = null;
    this.buffer = []; // {t, p:[x,y,z], ry, space}

    this._curPos = new THREE.Vector3();
    this._curRy = 0;

    this.group = new THREE.Group();

    const color = this.profile.color || '#00b4d8';
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.7, 4, 8),
      new THREE.MeshLambertMaterial({ color })
    );
    this.body.position.y = 0.75;
    this.group.add(this.body);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xf1d8bd })
    );
    this.head.position.y = 1.42;
    this.group.add(this.head);

    this.nameSprite = makeNameSprite(this.profile.name || '무명의 과학자', color);
    this.nameSprite.position.y = 1.42 + 0.22 + 0.4; // 머리 위 0.4m
    this.group.add(this.nameSprite);

    scene.add(this.group);
  }

  setInitial(p, ry, space) {
    const pos = Array.isArray(p) ? p : [0, 0, 0];
    this.group.position.set(pos[0], pos[1], pos[2]);
    this.group.rotation.y = ry || 0;
    this._curPos.set(pos[0], pos[1], pos[2]);
    this._curRy = ry || 0;
    if (space !== undefined) this.space = space;
  }

  push(state) {
    if (!state || !Array.isArray(state.p)) return; // 불완전한 상태는 무시(안전)
    this.buffer.push({ t: performance.now(), p: state.p, ry: state.ry || 0, space: state.space });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    if (state.space !== undefined) this.space = state.space;
  }

  update(dt, localSpace) {
    const renderT = performance.now() - INTERP_DELAY;
    const buf = this.buffer;
    while (buf.length > 2 && buf[1].t <= renderT) buf.shift();

    let px, py, pz, ry, moving = false;
    if (buf.length === 0) {
      px = this._curPos.x; py = this._curPos.y; pz = this._curPos.z; ry = this._curRy;
    } else if (buf.length === 1) {
      [px, py, pz] = buf[0].p; ry = buf[0].ry;
    } else {
      const a = buf[0], b = buf[1];
      const span = Math.max(1, b.t - a.t);
      const t = THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1);
      px = THREE.MathUtils.lerp(a.p[0], b.p[0], t);
      py = THREE.MathUtils.lerp(a.p[1], b.p[1], t);
      pz = THREE.MathUtils.lerp(a.p[2], b.p[2], t);
      ry = lerpAngle(a.ry, b.ry, t);
      const dist = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
      moving = dist > 0.01;
    }

    this._curPos.set(px, py, pz);
    this._curRy = ry;

    const bob = moving ? Math.sin((performance.now() / 1000) * BOB_HZ * Math.PI * 2) * BOB_AMP : 0;
    this.group.position.set(px, py + bob, pz);
    this.group.rotation.y = ry;

    // 로컬 공간과 다르면 숨김(공간 정보 미수신 시에는 표시 유지)
    this.group.visible = !(localSpace != null && this.space != null && this.space !== localSpace);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(disposeObject);
  }
}

export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    this._avatars = new Map(); // id -> RemoteAvatar
    this._localSpace = null;
  }

  upsert(id, profile, state) {
    let av = this._avatars.get(id);
    if (!av) {
      av = new RemoteAvatar(this.scene, profile);
      this._avatars.set(id, av);
      av.setInitial(state?.p, state?.ry, state?.space);
      av.group.visible = !(this._localSpace != null && av.space != null && av.space !== this._localSpace);
    } else {
      if (profile) av.profile = { ...av.profile, ...profile };
      if (state) av.push(state);
    }
  }

  update(dt) {
    for (const av of this._avatars.values()) av.update(dt, this._localSpace);
  }

  setLocalSpace(spaceId) {
    this._localSpace = spaceId;
    for (const av of this._avatars.values()) {
      av.group.visible = !(av.space != null && av.space !== spaceId);
    }
  }

  remove(id) {
    const av = this._avatars.get(id);
    if (!av) return;
    av.dispose();
    this._avatars.delete(id);
  }

  get count() { return this._avatars.size + 1; }
}
