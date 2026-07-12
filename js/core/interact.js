// ═══════════════════════════════════════════════════════════
// Interactor — 탭 픽킹, 들기/놓기(carry), 스냅 배치 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';

const TAP_MAX_DIST = 10;   // px
const TAP_MAX_TIME = 300;  // ms
const CARRY_DIST = 0.8;    // m, 카메라 앞 거리
const SNAP_RADIUS = 3;     // m, 스냅 디스크 유효 거리

export class Interactor {
  constructor(engine, controls) {
    this.engine = engine;
    this.controls = controls;
    this.raycaster = new THREE.Raycaster();

    this.carrying = null;        // { object3d, data }
    this._snapTargets = null;    // [{id, object3d, accepts}]

    this._listeners = {};
    this._downId = null;
    this._downPos = null;
    this._downTime = 0;

    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    window.addEventListener('pointerdown', this._onDown, { passive: true });
    window.addEventListener('pointerup', this._onUp, { passive: true });
  }

  on(evt, cb) { (this._listeners[evt] ||= []).push(cb); return () => this.off(evt, cb); }
  off(evt, cb) { const a = this._listeners[evt]; if (!a) return; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); }
  _emit(evt, payload) { (this._listeners[evt] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error(e); } }); }

  setSnapTargets(list) { this._snapTargets = list; }

  dispose() {
    window.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
  }

  // ── 탭 판별 (조이스틱/룩 드래그와 구분) ──
  _onDown(e) {
    if (e.target?.closest?.('#hud')) return;
    if (this._downId !== null) return;
    this._downId = e.pointerId;
    this._downPos = { x: e.clientX, y: e.clientY };
    this._downTime = performance.now();
  }

  _onUp(e) {
    if (e.pointerId !== this._downId) return;
    this._downId = null;
    const start = this._downPos; this._downPos = null;
    if (!start) return;
    if (e.target?.closest?.('#hud')) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const dt = performance.now() - this._downTime;
    if (dist >= TAP_MAX_DIST || dt >= TAP_MAX_TIME) return; // 드래그 → 탭 아님
    this._handleTap(e.clientX, e.clientY);
  }

  _ndc(x, y) {
    return new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  }

  _handleTap(x, y) {
    if (this.carrying && this._snapTargets?.length) {
      const target = this._pickSnapDisc(x, y);
      if (target) { this._trySnap(target); return; }
    }
    const hit = this._pickInteractable(x, y);
    if (!hit) return;
    const data = hit.userData.interactable;
    if (data.kind === 'carry') {
      if (this.carrying) return; // 이미 들고 있으면 무시
      this._pickUp(hit, data);
    } else if (data.kind === 'tap') {
      this._pulseHighlight(hit);
      this._emit('tap', { object: hit, data });
    }
  }

  _pickInteractable(x, y) {
    this.raycaster.setFromCamera(this._ndc(x, y), this.engine.camera);
    const hits = this.raycaster.intersectObjects(this.engine.scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData?.interactable) return o;
        o = o.parent;
      }
    }
    return null;
  }

  _pickSnapDisc(x, y) {
    this.raycaster.setFromCamera(this._ndc(x, y), this.engine.camera);
    const objs = this._snapTargets.map((t) => t.object3d);
    const hits = this.raycaster.intersectObjects(objs, false);
    if (!hits.length || hits[0].distance > SNAP_RADIUS) return null;
    return this._snapTargets.find((t) => t.object3d === hits[0].object) || null;
  }

  // ── 들기 ──
  _pickUp(object3d, data) {
    const disc = object3d.userData.__placedFromDisc || null;

    object3d.userData.__origParent = object3d.parent;
    object3d.userData.__origPos = object3d.position.clone();
    object3d.userData.__origQuat = object3d.quaternion.clone();

    this.engine.camera.add(object3d);
    object3d.position.set(0, -0.15, -CARRY_DIST);
    object3d.quaternion.identity();
    object3d.userData.__carried = true;

    if (disc) {
      disc.userData.__placedObject = null;
      object3d.userData.__placedFromDisc = null;
    }

    this.carrying = { object3d, data };
    this._pulseHighlight(object3d);
    this._emit('pick', { object: object3d, data });
  }

  // ── 스냅 배치 ──
  _trySnap(target) {
    if (!target.accepts?.includes(this.carrying.data.equipmentId)) {
      this._shake(target.object3d);
      return;
    }
    const object3d = this.carrying.object3d;
    const data = this.carrying.data;
    const disc = target.object3d;
    const anchor = disc.parent;

    anchor.add(object3d);
    object3d.position.copy(disc.position);
    object3d.quaternion.identity();
    object3d.userData.__carried = false;
    object3d.userData.__placedFromDisc = disc;
    disc.userData.__placedObject = object3d;

    this.carrying = null;
    this._pulseHighlight(object3d);
    this._emit('place', { object: object3d, data, slotId: target.id });
  }

  cancelCarry() {
    if (!this.carrying) return;
    const { object3d } = this.carrying;
    const p = object3d.userData.__origParent;
    if (p) {
      p.add(object3d);
      if (object3d.userData.__origPos) object3d.position.copy(object3d.userData.__origPos);
      if (object3d.userData.__origQuat) object3d.quaternion.copy(object3d.userData.__origQuat);
    }
    object3d.userData.__carried = false;
    this.carrying = null;
  }

  // ── 피드백 애니메이션 ──
  _shake(object3d) {
    const start = performance.now();
    const base = object3d.position.x;
    const step = () => {
      const t = (performance.now() - start) / 260;
      if (t >= 1) { object3d.position.x = base; return; }
      object3d.position.x = base + Math.sin(t * Math.PI * 6) * 0.03 * (1 - t);
      requestAnimationFrame(step);
    };
    step();
  }

  _pulseHighlight(object3d) {
    const mats = [];
    object3d.traverse((o) => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if ('emissiveIntensity' in m) mats.push(m);
      });
    });
    if (!mats.length) return;
    const orig = mats.map((m) => m.emissiveIntensity);
    mats.forEach((m) => { m.emissiveIntensity = (m.emissiveIntensity ?? 1) + 1.2; });
    setTimeout(() => mats.forEach((m, i) => { m.emissiveIntensity = orig[i]; }), 180);
  }
}
