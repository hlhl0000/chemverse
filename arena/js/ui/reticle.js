// ═══════════════════════════════════════════════════════════
// reticle.js — U-1 크로스헤어 + 히트마커 (UX_EXPANSION_PLAN.md U-1)
// 모바일 FPS 표준 레티클: 4틱+중앙점, 발사 시 확산(반동 표현), 킬 확정 시 X 플래시.
// hud.js와 독립 — body 직속 오버레이, 스타일 자체 주입, pointer-events 없음.
// ═══════════════════════════════════════════════════════════

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
#ux-reticle { position: fixed; left: 50%; top: 50%; width: 0; height: 0; z-index: 15;
  pointer-events: none; opacity: 0; transition: opacity .25s; }
#ux-reticle.on { opacity: 1; }
#ux-reticle .rt-dot { position: absolute; left: -2px; top: -2px; width: 4px; height: 4px;
  border-radius: 50%; background: rgba(255,255,255,.95);
  box-shadow: 0 0 2px rgba(0,0,0,.9); }
#ux-reticle .rt-tick { position: absolute; background: rgba(255,255,255,.9);
  box-shadow: 0 0 2px rgba(0,0,0,.9); transition: transform .09s ease-out; }
#ux-reticle .rt-t { left: -1px; top: -14px; width: 2px; height: 8px; }
#ux-reticle .rt-b { left: -1px; top: 6px;   width: 2px; height: 8px; }
#ux-reticle .rt-l { left: -14px; top: -1px; width: 8px; height: 2px; }
#ux-reticle .rt-r { left: 6px;   top: -1px; width: 8px; height: 2px; }
#ux-reticle.fire .rt-t { transform: translateY(-7px); }
#ux-reticle.fire .rt-b { transform: translateY(7px); }
#ux-reticle.fire .rt-l { transform: translateX(-7px); }
#ux-reticle.fire .rt-r { transform: translateX(7px); }
#ux-reticle .rt-hit { position: absolute; left: -13px; top: -13px; width: 26px; height: 26px;
  opacity: 0; transform: rotate(45deg) scale(1.4); transition: opacity .16s, transform .16s; }
#ux-reticle .rt-hit::before, #ux-reticle .rt-hit::after { content: ''; position: absolute;
  background: #7fe3ff; box-shadow: 0 0 4px rgba(0,180,216,.9); }
#ux-reticle .rt-hit::before { left: 12px; top: 0; width: 2px; height: 26px; }
#ux-reticle .rt-hit::after  { left: 0; top: 12px; width: 26px; height: 2px; }
#ux-reticle.hit .rt-hit { opacity: 1; transform: rotate(45deg) scale(1); }
`;
  document.head.appendChild(st);
}

export class Reticle {
  constructor(parent) {
    injectStyle();
    this.root = document.createElement('div');
    this.root.id = 'ux-reticle';
    this.root.innerHTML = `
      <div class="rt-dot"></div>
      <div class="rt-tick rt-t"></div><div class="rt-tick rt-b"></div>
      <div class="rt-tick rt-l"></div><div class="rt-tick rt-r"></div>
      <div class="rt-hit"></div>`;
    (parent || document.body).appendChild(this.root);
    this._fireTimer = 0;
    this._hitTimer = 0;
  }

  setVisible(v) { this.root.classList.toggle('on', !!v); }

  // 발사 확산 — 짧게 벌어졌다 복귀(반동 느낌)
  pulseFire() {
    this.root.classList.add('fire');
    clearTimeout(this._fireTimer);
    this._fireTimer = setTimeout(() => this.root.classList.remove('fire'), 100);
  }

  // 명중 확정(킬 등) — 시안 X 플래시(물 테마, 비폭력)
  hitmark() {
    this.root.classList.add('hit');
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => this.root.classList.remove('hit'), 260);
  }

  dispose() {
    clearTimeout(this._fireTimer);
    clearTimeout(this._hitTimer);
    this.root.remove();
  }
}
