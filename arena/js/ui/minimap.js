// ═══════════════════════════════════════════════════════════
// minimap.js — U-4 미니맵 (UX_EXPANSION_PLAN.md U-4, GRAPHICS_PLAN G-5 이행)
// Canvas 2D 좌상단, 4Hz 갱신. 내 위치(방향 화살표)·아군 점·크레이트·드랍·조립대 마름모.
// 적군 미표시(정보전 유지 — 실전 관례). hud.js와 독립, pointer-events 없음.
// ═══════════════════════════════════════════════════════════

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
#ux-minimap { position: fixed; left: 8px; top: 108px; z-index: 11; pointer-events: none;
  background: rgba(9,12,19,.55); border: 1px solid rgba(80,100,140,.5);
  border-radius: 6px; display: none; }
#ux-minimap.on { display: block; }
`;
  document.head.appendChild(st);
}

const W = 150, H = 108, PAD = 6;

export class Minimap {
  // halfX/halfZ: 월드 절반 치수(아레나 40×28 → 20/14)
  constructor(parent, { halfX = 20, halfZ = 14 } = {}) {
    injectStyle();
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'ux-minimap';
    this.canvas.width = W * 2;   // 레티나 대응 2x
    this.canvas.height = H * 2;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    (parent || document.body).appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.hx = halfX; this.hz = halfZ;
    this.pads = []; // [{x, z, color}]
  }

  setVisible(v) { this.canvas.classList.toggle('on', !!v); }
  setPads(pads) { this.pads = pads || []; }

  _sx(x) { return (PAD + ((x + this.hx) / (this.hx * 2)) * (W - PAD * 2)) * 2; }
  _sz(z) { return (PAD + ((z + this.hz) / (this.hz * 2)) * (H - PAD * 2)) * 2; }

  // update({me:{x,z,yaw,color}, mates:[{x,z}], points:[{pos,kind}]}) — 4Hz 권장
  update({ me, mates = [], points = [] } = {}) {
    const c = this.ctx;
    c.clearRect(0, 0, W * 2, H * 2);

    // 외곽
    c.strokeStyle = 'rgba(120,150,200,.45)';
    c.lineWidth = 2;
    c.strokeRect(PAD * 2, PAD * 2, (W - PAD * 2) * 2, (H - PAD * 2) * 2);
    // 중앙선
    c.strokeStyle = 'rgba(120,150,200,.18)';
    c.beginPath(); c.moveTo(this._sx(0), this._sz(-this.hz)); c.lineTo(this._sx(0), this._sz(this.hz)); c.stroke();

    // 조립대 마름모
    for (const p of this.pads) {
      c.fillStyle = p.color || '#7fd4e8';
      const x = this._sx(p.x), z = this._sz(p.z);
      c.beginPath();
      c.moveTo(x, z - 9); c.lineTo(x + 7, z); c.lineTo(x, z + 9); c.lineTo(x - 7, z);
      c.closePath(); c.fill();
    }

    // 크레이트(미개봉)·드랍
    for (const pt of points) {
      const x = this._sx(pt.pos[0]), z = this._sz(pt.pos[2]);
      if (pt.kind === 'drop') {
        c.fillStyle = '#ffd166';
        c.beginPath(); c.arc(x, z, 4, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = '#d9b23a';
        c.fillRect(x - 4, z - 4, 8, 8);
      }
    }

    // 아군 점
    c.fillStyle = 'rgba(180,235,255,.95)';
    for (const m of mates) {
      c.beginPath(); c.arc(this._sx(m.x), this._sz(m.z), 4, 0, Math.PI * 2); c.fill();
    }

    // 나: 방향 화살표
    if (me) {
      const x = this._sx(me.x), z = this._sz(me.z);
      c.save();
      c.translate(x, z);
      c.rotate(-(me.yaw || 0)); // 월드 yaw → 맵 방위(북쪽 = -z = 화면 위)
      c.fillStyle = me.color || '#ffffff';
      c.strokeStyle = 'rgba(0,0,0,.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  dispose() { this.canvas.remove(); }
}
