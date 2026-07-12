// ═══════════════════════════════════════════════════════════
// Joystick — #joystick-zone 터치 시 다이나믹 가상 조이스틱 (소유: 에이전트 A)
// 본편 js/ui/joystick.js에서 포팅 — 수정 불필요하여 그대로 이식.
// 터치 지점에 베이스+노브 생성, 손을 떼면 소멸. DOM+인라인 CSS, 시안 반투명.
// ═══════════════════════════════════════════════════════════

const RADIUS = 52; // px, 노브 이동 최대 반경(= 베이스 반경)

export class Joystick {
  constructor(zoneEl) {
    this.zone = zoneEl;
    this.active = false;
    this.vector = { x: 0, y: 0 }; // x:좌우(-1~1), y:전진(+1)/후진(-1)

    this._pointerId = null;
    this._center = { x: 0, y: 0 };
    this._base = null;
    this._knob = null;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    zoneEl.addEventListener('pointerdown', this._onDown);
  }

  getVector() { return this.active ? this.vector : { x: 0, y: 0 }; }

  _onDown(e) {
    if (this._pointerId !== null) return;
    this._pointerId = e.pointerId;
    try { this.zone.setPointerCapture(e.pointerId); } catch { /* noop */ }
    this._center = { x: e.clientX, y: e.clientY };
    this._spawn(e.clientX, e.clientY);
    this.active = true;
    this.zone.addEventListener('pointermove', this._onMove);
    this.zone.addEventListener('pointerup', this._onUp);
    this.zone.addEventListener('pointercancel', this._onUp);
  }

  _spawn(x, y) {
    const base = document.createElement('div');
    base.style.cssText = `position:fixed; left:${x - RADIUS}px; top:${y - RADIUS}px;
      width:${RADIUS * 2}px; height:${RADIUS * 2}px; border-radius:50%;
      background:rgba(0,180,216,.10); border:1.5px solid rgba(0,180,216,.35);
      pointer-events:none; z-index:21; box-sizing:border-box;`;
    const knob = document.createElement('div');
    const kr = RADIUS * 0.5;
    knob.style.cssText = `position:fixed; left:${x - kr}px; top:${y - kr}px;
      width:${kr * 2}px; height:${kr * 2}px; border-radius:50%;
      background:rgba(0,180,216,.32); border:1.5px solid rgba(0,180,216,.7);
      pointer-events:none; z-index:22; box-shadow:0 0 16px rgba(0,180,216,.4); box-sizing:border-box;`;
    document.body.appendChild(base);
    document.body.appendChild(knob);
    this._base = base;
    this._knob = knob;
    this._knobR = kr;
  }

  _onMove(e) {
    if (e.pointerId !== this._pointerId) return;
    let dx = e.clientX - this._center.x;
    let dy = e.clientY - this._center.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) { dx = (dx / dist) * RADIUS; dy = (dy / dist) * RADIUS; }
    this.vector.x = dx / RADIUS;
    this.vector.y = -dy / RADIUS; // 위로 밀면 전진
    if (this._knob) {
      this._knob.style.left = `${this._center.x + dx - this._knobR}px`;
      this._knob.style.top = `${this._center.y + dy - this._knobR}px`;
    }
  }

  _onUp(e) {
    if (e.pointerId !== this._pointerId) return;
    this._pointerId = null;
    this.active = false;
    this.vector.x = 0; this.vector.y = 0;
    this.zone.removeEventListener('pointermove', this._onMove);
    this.zone.removeEventListener('pointerup', this._onUp);
    this.zone.removeEventListener('pointercancel', this._onUp);
    this._base?.remove(); this._knob?.remove();
    this._base = null; this._knob = null;
  }

  dispose() {
    this.zone.removeEventListener('pointerdown', this._onDown);
    if (this._pointerId !== null) this._onUp({ pointerId: this._pointerId });
  }
}
