// ═══════════════════════════════════════════════════════════
// waypoints.js — U-3 목표 웨이포인트 (UX_EXPANSION_PLAN.md U-3)
// Fortnite/CoD식 오프스크린 에지 마커: 3D 좌표를 카메라로 투영, 화면 밖이면
// 가장자리에 방향 화살표+거리 표시. "지금 뭘 해야 하는지"의 공간적 안내(교육 핵심 UX).
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약).
// ═══════════════════════════════════════════════════════════

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
.ux-wp { position: fixed; left: 0; top: 0; z-index: 13; pointer-events: none;
  transform: translate(-50%, -50%); display: none; text-align: center;
  font-family: inherit; }
.ux-wp.on { display: block; }
.ux-wp .wp-ico { display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 50%; font-size: 15px;
  background: rgba(9,12,19,.62); border: 2px solid currentColor;
  box-shadow: 0 0 8px rgba(0,0,0,.5); }
.ux-wp .wp-lbl { margin-top: 2px; font-size: 10px; color: #eaf6fb;
  background: rgba(9,12,19,.62); padding: 1px 5px; border-radius: 4px;
  white-space: nowrap; }
.ux-wp .wp-arrow { position: absolute; left: 50%; top: -14px; width: 0; height: 0;
  border-left: 6px solid transparent; border-right: 6px solid transparent;
  border-bottom: 9px solid currentColor; transform-origin: 50% 29px;
  margin-left: -6px; display: none; }
.ux-wp.edge .wp-arrow { display: block; }
.ux-wp.pulse .wp-ico { animation: ux-wp-pulse 1s infinite; }
@keyframes ux-wp-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
`;
  document.head.appendChild(st);
}

export class Waypoints {
  constructor(parent, camera, THREE) {
    injectStyle();
    this.camera = camera;
    this.THREE = THREE;
    this.root = parent || document.body;
    this._markers = new Map(); // id -> {el, ico, lbl, arrow, pos, icon, color, label, pulse}
    this._v = new THREE.Vector3();
    this._rel = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
  }

  // set(id, {pos:[x,y,z], icon, color(css), label, pulse}) — 같은 id는 갱신
  set(id, opts) {
    let m = this._markers.get(id);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'ux-wp';
      el.innerHTML = '<div class="wp-arrow"></div><div class="wp-ico"></div><div class="wp-lbl"></div>';
      this.root.appendChild(el);
      m = {
        el,
        arrow: el.querySelector('.wp-arrow'),
        ico: el.querySelector('.wp-ico'),
        lbl: el.querySelector('.wp-lbl'),
      };
      this._markers.set(id, m);
    }
    m.pos = opts.pos;
    if (m.icon !== opts.icon) { m.ico.textContent = opts.icon || '●'; m.icon = opts.icon; }
    if (m.color !== opts.color) { m.el.style.color = opts.color || '#7fd4e8'; m.color = opts.color; }
    m.label = opts.label || '';
    m.el.classList.toggle('pulse', !!opts.pulse);
    m.el.classList.add('on');
  }

  clear(id) {
    const m = this._markers.get(id);
    if (m) m.el.classList.remove('on');
  }

  clearAll() {
    for (const m of this._markers.values()) m.el.classList.remove('on');
  }

  // 매 프레임 호출 — myPos는 [x,y,z](거리 표기용)
  update(myPos) {
    if (this._markers.size === 0) return;
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this._fwd);
    const W = window.innerWidth, H = window.innerHeight;

    for (const m of this._markers.values()) {
      if (!m.el.classList.contains('on') || !m.pos) continue;

      this._rel.set(m.pos[0], m.pos[1] + 1.4, m.pos[2]).sub(cam.position);
      const behind = this._rel.dot(this._fwd) < 0;
      this._v.set(m.pos[0], m.pos[1] + 1.4, m.pos[2]).project(cam);
      let x = this._v.x, y = this._v.y;
      if (behind) { x = -x; y = -Math.abs(y) - 0.2; } // 뒤쪽은 화면 하단 방향으로

      const onscreen = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.82;
      if (!onscreen) {
        // 중심→방향 유지한 채 화면 가장자리 사각형에 클램프
        const kx = 0.9 / Math.max(1e-6, Math.abs(x));
        const ky = 0.82 / Math.max(1e-6, Math.abs(y));
        const k = Math.min(kx, ky, 1);
        x *= k; y *= k;
        m.el.classList.add('edge');
        m.arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
      } else {
        m.el.classList.remove('edge');
      }

      m.el.style.left = `${(x * 0.5 + 0.5) * W}px`;
      m.el.style.top = `${(-y * 0.5 + 0.5) * H}px`;

      const d = myPos
        ? Math.hypot(m.pos[0] - myPos.x, m.pos[2] - myPos.z)
        : 0;
      m.lbl.textContent = m.label ? `${m.label} ${Math.round(d)}m` : `${Math.round(d)}m`;
    }
  }

  dispose() {
    for (const m of this._markers.values()) m.el.remove();
    this._markers.clear();
  }
}
