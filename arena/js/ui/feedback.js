// ═══════════════════════════════════════════════════════════
// feedback.js — U-2 피격 피드백 (UX_EXPANSION_PLAN.md U-2)
// Overwatch식 피격 방향 원호 + 젖음 비네트(저체력 경고). 물 테마 — 시안/블루만 사용.
// 방향각은 main.js가 계산해 전달(화면 기준: 0=정면/상단, 시계+, 라디안).
// hud.js와 독립 — body 직속 오버레이, pointer-events 없음.
// ═══════════════════════════════════════════════════════════

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
#ux-vignette { position: fixed; inset: 0; z-index: 14; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 52%, rgba(0,130,200,.55) 100%);
  opacity: 0; transition: opacity .35s; }
#ux-flash { position: fixed; inset: 0; z-index: 14; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(80,190,255,.5) 100%);
  opacity: 0; }
#ux-flash.go { opacity: 1; transition: none; }
#ux-flash.fade { opacity: 0; transition: opacity .5s; }
.ux-dmgarc { position: fixed; left: 50%; top: 50%; width: 0; height: 0; z-index: 14;
  pointer-events: none; opacity: 0; }
.ux-dmgarc .arc { position: absolute; left: -60px; top: -34vmin; width: 120px; height: 26px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  background: linear-gradient(to bottom, rgba(90,200,255,.85), rgba(90,200,255,0));
  filter: drop-shadow(0 0 6px rgba(0,180,216,.8)); }
`;
  document.head.appendChild(st);
}

const ARC_POOL = 4;
const ARC_LIFE = 1.1; // s

export class Feedback {
  constructor(parent) {
    injectStyle();
    const root = parent || document.body;
    this.vignette = document.createElement('div');
    this.vignette.id = 'ux-vignette';
    this.flash = document.createElement('div');
    this.flash.id = 'ux-flash';
    root.appendChild(this.vignette);
    root.appendChild(this.flash);

    // 방향 원호 풀
    this._arcs = [];
    for (let i = 0; i < ARC_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'ux-dmgarc';
      el.innerHTML = '<div class="arc"></div>';
      root.appendChild(el);
      this._arcs.push({ el, life: 0 });
    }
    this._flashTimer = 0;
  }

  // 피격: angle(화면각, 라디안)이 null이면 방향 없는 전면 플래시만.
  // strength 0~1: 플래시 지속·원호 수명 가중(플라스크=1, 스프레이/뷰렛=0.6 권장)
  damageFrom(angle, strength = 0.6) {
    this.flash.classList.remove('fade');
    this.flash.classList.add('go');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.flash.classList.remove('go');
      this.flash.classList.add('fade');
    }, 60 + strength * 120);

    if (angle === null || angle === undefined) return;
    // 가장 오래된 원호 재사용
    let slot = this._arcs[0];
    for (const a of this._arcs) if (a.life < slot.life) slot = a;
    slot.life = ARC_LIFE * (0.7 + strength * 0.5);
    slot.el.style.transform = `rotate(${angle}rad)`;
    slot.el.style.opacity = '1';
  }

  // 젖음 게이지 → 저체력 비네트(50 미만부터 점진 강화)
  setGauge(gauge) {
    const g = Math.max(0, Math.min(100, gauge ?? 100));
    const a = g >= 50 ? 0 : (50 - g) / 50; // 0~1
    this.vignette.style.opacity = String(a * 0.85);
  }

  update(dt) {
    for (const a of this._arcs) {
      if (a.life <= 0) continue;
      a.life -= dt;
      const t = Math.max(0, a.life) / ARC_LIFE;
      a.el.style.opacity = String(Math.min(1, t * 1.4));
      if (a.life <= 0) a.el.style.opacity = '0';
    }
  }

  dispose() {
    clearTimeout(this._flashTimer);
    this.vignette.remove();
    this.flash.remove();
    for (const a of this._arcs) a.el.remove();
  }
}
