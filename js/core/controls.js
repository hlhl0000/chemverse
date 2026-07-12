// ═══════════════════════════════════════════════════════════
// PlayerControls — 카메라 리그, 조이스틱/터치룩/WASD, 충돌, 네트 상태 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';
import { Joystick } from '../ui/joystick.js';

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 4;       // m/s
const RADIUS = 0.3;         // 충돌 원기둥 반지름
const DEADZONE = 0.15;      // 조이스틱 데드존 15%
const PITCH_LIMIT = THREE.MathUtils.degToRad(75);
const LOOK_SENS_TOUCH = 0.0045;
const LOOK_SENS_MOUSE = 0.0028;

export class PlayerControls {
  constructor(engine, { joystickZone, lookZone, canvas } = {}) {
    this.engine = engine;

    // 카메라 리그: yaw(이동/회전) > pitch(고개) > camera
    this.yawObject = new THREE.Object3D();
    this.pitchObject = new THREE.Object3D();
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(engine.camera);
    engine.camera.position.set(0, 0, 0);
    this.yawObject.position.set(0, EYE_HEIGHT, 0);
    engine.scene.add(this.yawObject);

    this.object = this.yawObject; // 계약: PlayerControls.object

    this.colliders = [];
    this._groundFn = null;

    this.joystick = joystickZone ? new Joystick(joystickZone) : null;

    // 재사용 벡터 (GC 압력 회피)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();

    this._keys = new Set();
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // 터치 룩 (#look-zone)
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

    // 데스크톱: 캔버스 마우스 드래그 룩
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
  }

  _applyLook(dx, dy, sens) {
    this.yawObject.rotation.y -= dx * sens;
    this.pitchObject.rotation.x -= dy * sens;
    this.pitchObject.rotation.x = THREE.MathUtils.clamp(this.pitchObject.rotation.x, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /**
   * 콜라이더 목록 설정. list에 getGroundY(x,z) 함수가 실려 있으면(지형 공간)
   * 자동으로 setGroundFn 에 연결하고, 없으면(평지 공간) null 로 해제한다.
   * — main.js 는 spaces.go() 결과의 colliders만 넘기므로, 지형 훅은
   *   world/nature.js 가 colliders 배열에 getGroundY 를 실어 보내는 방식으로 전달된다.
   */
  setColliders(list) {
    this.colliders = list || [];
    this.setGroundFn(this.colliders.getGroundY || null);
  }

  /** 지형 등 평지가 아닌 공간에서 y = groundY(x,z) 를 계산할 함수. null이면 눈높이 고정. */
  setGroundFn(fn) { this._groundFn = fn || null; }

  teleport(pos, ry = 0) {
    const gy = this._groundFn ? this._groundFn(pos[0], pos[2]) : (pos[1] ?? 0);
    this.yawObject.position.set(pos[0], gy + EYE_HEIGHT, pos[2]);
    this.yawObject.rotation.y = ry;
    this.pitchObject.rotation.x = 0;
  }

  getNetState() {
    const p = this.yawObject.position;
    return {
      p: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100],
      ry: Math.round(this.yawObject.rotation.y * 100) / 100,
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

    if (mx !== 0 || mz !== 0) {
      this._forward.set(0, 0, -1).applyQuaternion(this.yawObject.quaternion);
      this._right.set(1, 0, 0).applyQuaternion(this.yawObject.quaternion);
      this._moveDir.set(0, 0, 0)
        .addScaledVector(this._forward, mz)
        .addScaledVector(this._right, mx);
      const dist = MOVE_SPEED * dt;
      this._moveWithCollision(this._moveDir.x * dist, this._moveDir.z * dist);
    }

    const pos = this.yawObject.position;
    if (this._groundFn) pos.y = this._groundFn(pos.x, pos.z) + EYE_HEIGHT;
  }

  _moveWithCollision(dx, dz) {
    const pos = this.yawObject.position;
    const nx = pos.x + dx;
    if (!this._collides(nx, pos.z)) pos.x = nx;
    const nz = pos.z + dz;
    if (!this._collides(pos.x, nz)) pos.z = nz;
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
