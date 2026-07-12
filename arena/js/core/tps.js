// ═══════════════════════════════════════════════════════════
// TPSControls — 3인칭 어깨너머 카메라, 조이스틱/터치룩/WASD, 충돌, 네트 상태
// 본편 js/core/controls.js(PlayerControls, 1인칭)에서 포팅 후 3인칭으로 개조 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';
import { Joystick } from '../ui/joystick.js';

const MOVE_SPEED = 5;        // m/s
const RADIUS = 0.35;         // 충돌 원기둥 반지름
const DEADZONE = 0.15;       // 조이스틱 데드존 15%
const EYE_HEIGHT = 1.5;      // 카메라 피벗(캐릭터 눈높이 근사)
const BOOM_DIST = 4.0;       // 어깨너머 붐 거리 4.0m
const BOOM_HEIGHT = 2.2;     // 붐 높이 2.2m (피치 0 기준)
const PITCH_MIN = THREE.MathUtils.degToRad(-30);
const PITCH_MAX = THREE.MathUtils.degToRad(55);
const CAM_LERP_K = 10;       // 카메라 위치 lerp 스무딩 계수(~10/s)
const LOOK_SENS_TOUCH = 0.0045;
const LOOK_SENS_MOUSE = 0.0028;
const CAM_COLLIDE_MARGIN = 0.3; // 카메라 오클루전: 벽 표면에서 띄울 여유(m)
const CAM_MIN_DIST = 0.6;       // 카메라가 피벗에 붙을 수 있는 최소 거리(m)

// 선분(원점 o, 단위방향 d, 길이 L) vs 마진 m 확장 AABB 슬랩 교차 — 첫 진입 t 반환(미교차/내부 시작은 -1)
// 카메라 오클루전용 (Fable 검수 추가). THREE.Raycaster 없이 순수 산술 — 프레임당 할당 0.
function raySlabAABB(ox, oy, oz, dx, dy, dz, box, m, L) {
  let tNear = 0, tFar = L;
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.min.x - m || ox > box.max.x + m) return -1;
  } else {
    let t1 = (box.min.x - m - ox) / dx, t2 = (box.max.x + m - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < box.min.y - m || oy > box.max.y + m) return -1;
  } else {
    let t1 = (box.min.y - m - oy) / dy, t2 = (box.max.y + m - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.min.z - m || oz > box.max.z + m) return -1;
  } else {
    let t1 = (box.min.z - m - oz) / dz, t2 = (box.max.z + m - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tNear) tNear = t1;
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return -1;
  }
  return tNear > 0 ? tNear : -1;
}

export class TPSControls {
  constructor(engine, { joystickZone, lookZone, canvas } = {}) {
    this.engine = engine;

    // 플레이어 루트: 발 기준 y=0. 회전 = 정면(카메라 요와 동일 — 향후 조준 방향으로 사용)
    this.object = new THREE.Object3D();
    engine.scene.add(this.object);

    this.colliders = [];
    this.bounds = null;

    this._yaw = 0;
    this._pitch = 0;

    this.joystick = joystickZone ? new Joystick(joystickZone) : null;

    // 재사용 벡터/오브젝트 (GC 압력 회피)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this._camOffset = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._idealPos = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.speedRatio = 0; // 계약: 0~1, 걷기 애니메이션용
    this._an = 0;

    this._aimDir = new THREE.Vector3(); // getAimRay() 재사용 벡터(할당 회피)

    this._keys = new Set();
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // 터치 룩 (#look-zone) — 드래그로 yaw+pitch
    this._lookZone = lookZone || null;
    this._lookPointerId = null;
    this._lookLast = { x: 0, y: 0 };
    if (lookZone) {
      this._onLookDown = (e) => {
        if (this._lookPointerId !== null) return;
        this._lookPointerId = e.pointerId;
        this._lookLast = { x: e.clientX, y: e.clientY };
        try { lookZone.setPointerCapture(e.pointerId); } catch { /* noop */ }
      };
      this._onLookMove = (e) => {
        if (e.pointerId !== this._lookPointerId) return;
        const dx = e.clientX - this._lookLast.x;
        const dy = e.clientY - this._lookLast.y;
        this._lookLast = { x: e.clientX, y: e.clientY };
        this._applyLook(dx, dy, LOOK_SENS_TOUCH);
      };
      this._onLookUp = (e) => { if (e.pointerId === this._lookPointerId) this._lookPointerId = null; };
      lookZone.addEventListener('pointerdown', this._onLookDown);
      lookZone.addEventListener('pointermove', this._onLookMove);
      lookZone.addEventListener('pointerup', this._onLookUp);
      lookZone.addEventListener('pointercancel', this._onLookUp);
    }

    // 데스크톱: 캔버스 마우스 드래그 룩 (WASD 보조 조작과 짝)
    this._canvas = canvas || null;
    this._mouseDown = false;
    this._mouseLast = { x: 0, y: 0 };
    if (canvas) {
      this._onMouseDown = (e) => {
        if (e.pointerType !== 'mouse') return;
        this._mouseDown = true;
        this._mouseLast = { x: e.clientX, y: e.clientY };
      };
      this._onMouseMove = (e) => {
        if (!this._mouseDown || e.pointerType !== 'mouse') return;
        const dx = e.clientX - this._mouseLast.x;
        const dy = e.clientY - this._mouseLast.y;
        this._mouseLast = { x: e.clientX, y: e.clientY };
        this._applyLook(dx, dy, LOOK_SENS_MOUSE);
      };
      this._onMouseUp = (e) => { if (e.pointerType === 'mouse') this._mouseDown = false; };
      canvas.addEventListener('pointerdown', this._onMouseDown);
      window.addEventListener('pointermove', this._onMouseMove);
      window.addEventListener('pointerup', this._onMouseUp);
    }

    this._syncCameraInstant();
  }

  _applyLook(dx, dy, sens) {
    this._yaw -= dx * sens;
    this._pitch -= dy * sens;
    this._pitch = THREE.MathUtils.clamp(this._pitch, PITCH_MIN, PITCH_MAX);
    this.object.rotation.y = this._yaw;
  }

  setColliders(list) { this.colliders = list || []; }
  setBounds(b) { this.bounds = b || null; }

  teleport(pos, ry = 0) {
    this.object.position.set(pos[0], pos[1] || 0, pos[2]);
    this._yaw = ry;
    this._pitch = 0;
    this.object.rotation.y = this._yaw;
    this._syncCameraInstant();
  }

  getNetState() {
    const p = this.object.position;
    return {
      p: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100],
      ry: Math.round(this._yaw * 100) / 100,
      an: this._an, // 0=idle 1=run
    };
  }

  update(dt) {
    let mx = 0, mz = 0; // mx:좌우(strafe), mz:전진(+)
    const jv = this.joystick?.getVector() || { x: 0, y: 0 };
    if (Math.hypot(jv.x, jv.y) > DEADZONE) {
      mx = jv.x; mz = jv.y;
    } else {
      if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) mz += 1;
      if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) mz -= 1;
      if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) mx += 1;
      if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) mx -= 1;
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
    }

    const inputMag = THREE.MathUtils.clamp(Math.hypot(mx, mz), 0, 1);
    this.speedRatio = inputMag;
    this._an = inputMag > 0.05 ? 1 : 0;

    if (inputMag > 0) {
      this._forward.set(0, 0, -1).applyQuaternion(this.object.quaternion);
      this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
      this._moveDir.set(0, 0, 0)
        .addScaledVector(this._forward, mz)
        .addScaledVector(this._right, mx);
      const dist = MOVE_SPEED * dt;
      this._moveWithCollision(this._moveDir.x * dist, this._moveDir.z * dist);
    }

    this._updateCamera(dt);
  }

  _moveWithCollision(dx, dz) {
    const pos = this.object.position;
    const nx = pos.x + dx;
    if (!this._collides(nx, pos.z)) pos.x = nx;
    const nz = pos.z + dz;
    if (!this._collides(pos.x, nz)) pos.z = nz;
    if (this.bounds) {
      pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX, this.bounds.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
    }
  }

  _collides(x, z) {
    for (const box of this.colliders) {
      const cx = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  // 붐 카메라 이상적 위치 계산 → this._idealPos에 기록 (할당 회피)
  _computeIdealCameraPos() {
    this._pivot.copy(this.object.position);
    this._pivot.y += EYE_HEIGHT;
    this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
    this._camOffset.set(0, BOOM_HEIGHT - EYE_HEIGHT, BOOM_DIST).applyEuler(this._euler);
    this._idealPos.copy(this._pivot).add(this._camOffset);
  }

  // 카메라 오클루전(Fable 검수 추가): pivot→target 선분이 콜라이더와 교차하면
  // target을 첫 교차 지점 앞(CAM_COLLIDE_MARGIN)으로 당긴다. 벽에 가까울수록
  // 붐이 즉시 짧아지므로(클램프는 스냅) 벽 너머로 시야가 가려지지 않는다.
  _occludeToward(target) {
    const o = this._pivot;
    let dx = target.x - o.x, dy = target.y - o.y, dz = target.z - o.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-6) return;
    dx /= L; dy /= L; dz /= L;
    let tHit = L;
    for (const box of this.colliders) {
      const t = raySlabAABB(o.x, o.y, o.z, dx, dy, dz, box, CAM_COLLIDE_MARGIN, L);
      if (t >= 0 && t < tHit) tHit = t;
    }
    if (tHit < L) {
      const d = Math.max(CAM_MIN_DIST, tHit - 0.05);
      target.set(o.x + dx * d, Math.max(0.25, o.y + dy * d), o.z + dz * d);
    }
  }

  _updateCamera(dt) {
    this._pivot.copy(this.object.position);
    this._pivot.y += EYE_HEIGHT;
    this._computeIdealCameraPos();
    this._occludeToward(this._idealPos);          // 목표 지점을 가림 없는 곳으로
    const t = 1 - Math.exp(-CAM_LERP_K * dt);
    this._camPos.lerp(this._idealPos, t);
    this._occludeToward(this._camPos);            // 보간 중간 위치도 벽 통과 금지
    this.engine.camera.position.copy(this._camPos);
    this.engine.camera.lookAt(this._pivot);
  }

  _syncCameraInstant() {
    this._pivot.copy(this.object.position);
    this._pivot.y += EYE_HEIGHT;
    this._computeIdealCameraPos();
    this._occludeToward(this._idealPos);
    this._camPos.copy(this._idealPos);
    this.engine.camera.position.copy(this._camPos);
    this.engine.camera.lookAt(this._pivot);
  }

  // getAimRay() -> {origin:[x,y,z], dir:[x,y,z]} — 카메라 위치·전방 단위벡터(월드).
  // 기존 오클루전 로직(raySlabAABB, _occludeToward 등)은 변경하지 않고 메서드만 추가(Fable 계약 §A-5).
  getAimRay() {
    const cam = this.engine.camera;
    cam.getWorldDirection(this._aimDir);
    return {
      origin: [cam.position.x, cam.position.y, cam.position.z],
      dir: [this._aimDir.x, this._aimDir.y, this._aimDir.z],
    };
  }

  dispose() {
    this.joystick?.dispose();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._lookZone) {
      this._lookZone.removeEventListener('pointerdown', this._onLookDown);
      this._lookZone.removeEventListener('pointermove', this._onLookMove);
      this._lookZone.removeEventListener('pointerup', this._onLookUp);
      this._lookZone.removeEventListener('pointercancel', this._onLookUp);
    }
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onMouseDown);
      window.removeEventListener('pointermove', this._onMouseMove);
      window.removeEventListener('pointerup', this._onMouseUp);
    }
  }
}
