// ═══════════════════════════════════════════════════════════
// settings.js — U-5 인게임 설정 (UX_EXPANSION_PLAN.md U-5)
// 대전 게임 필수 옵션 1순위: 조준(시선) 감도 슬라이더. localStorage 저장·자동 적용.
// 우하단 기어 버튼(발사 96/무기 178 위 246px — 버튼 열 정렬). 향후 토글(사운드·좌손
// 모드 등)은 이 패널에 행 추가로 확장(U-10·U-11 접점).
// ═══════════════════════════════════════════════════════════

const LS_KEY = 'cv.sens';

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
#ux-gear { position: fixed; right: 24px; bottom: 246px; z-index: 12; width: 46px; height: 46px;
  border-radius: 50%; border: 2px solid rgba(120,150,200,.55); background: rgba(9,12,19,.62);
  color: #eaf6fb; font-size: 20px; display: none; align-items: center; justify-content: center;
  pointer-events: auto; touch-action: manipulation; }
#ux-gear.on { display: flex; }
#ux-gear:active { transform: scale(.94); }
#ux-settings { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%);
  z-index: 42; min-width: 240px; padding: 16px 18px; border-radius: 10px;
  background: rgba(9,12,19,.94); border: 1px solid rgba(120,150,200,.5);
  color: #eaf6fb; display: none; pointer-events: auto; }
#ux-settings.on { display: block; }
#ux-settings h3 { font-size: 14px; margin: 0 0 12px; }
#ux-settings .row { margin-bottom: 12px; font-size: 12px; }
#ux-settings .row label { display: flex; justify-content: space-between; margin-bottom: 5px; }
#ux-settings input[type=range] { width: 100%; }
#ux-settings .close { width: 100%; padding: 8px; border: 1px solid rgba(120,150,200,.5);
  border-radius: 6px; background: rgba(0,180,216,.18); color: #eaf6fb; font-size: 13px; }
`;
  document.head.appendChild(st);
}

function loadSens() {
  const v = parseFloat(localStorage.getItem(LS_KEY));
  return Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1;
}

export class Settings {
  // cbs: { onSens(k) } — 생성 시 저장값을 즉시 1회 적용
  constructor(parent, cbs = {}) {
    injectStyle();
    const root = parent || document.body;
    this.cbs = cbs;

    this.gear = document.createElement('button');
    this.gear.id = 'ux-gear';
    this.gear.textContent = '⚙';
    root.appendChild(this.gear);

    this.panel = document.createElement('div');
    this.panel.id = 'ux-settings';
    this.panel.innerHTML = `
      <h3>⚙ 설정</h3>
      <div class="row">
        <label><span>시선 감도</span><span class="sens-val"></span></label>
        <input type="range" min="0.5" max="2" step="0.05">
      </div>
      <button class="close">닫기</button>`;
    root.appendChild(this.panel);

    this.slider = this.panel.querySelector('input');
    this.valEl = this.panel.querySelector('.sens-val');

    const sens = loadSens();
    this.slider.value = String(sens);
    this._applySens(sens, false);

    this.gear.addEventListener('click', () => this.panel.classList.toggle('on'));
    this.panel.querySelector('.close').addEventListener('click', () => this.panel.classList.remove('on'));
    this.slider.addEventListener('input', () => this._applySens(parseFloat(this.slider.value), true));
  }

  _applySens(k, save) {
    this.valEl.textContent = `${k.toFixed(2)}x`;
    if (save) { try { localStorage.setItem(LS_KEY, String(k)); } catch { /* 사파리 프라이빗 등 */ } }
    this.cbs.onSens?.(k);
  }

  setVisible(v) {
    this.gear.classList.toggle('on', !!v);
    if (!v) this.panel.classList.remove('on');
  }

  dispose() { this.gear.remove(); this.panel.remove(); }
}
