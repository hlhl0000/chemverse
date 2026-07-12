// ═══════════════════════════════════════════════════════════
// 실시간 선 그래프 — 순수 Canvas 2D (three 임포트 절대 금지)
// 소유: 에이전트 B. HUD가 그래프 탭 1개당 이 클래스 인스턴스를
// 하나만 만들어 재사용한다(탭 전환 시 reset()+setAxes()로 갈아끼움).
//
// 계약: constructor(canvas, opts:{x:{label,unit}, y:{label,unit}})
//        addPoint(x,y)  reset()  setAxes(opts)  draw()
//
// 주의: Canvas2D의 ctx.font는 CSS 변수(var(--mono) 등)를 해석하지
// 못하므로, css/main.css의 --mono/--sans 폰트 스택을 문자열 그대로
// 하드코딩해 둔다(디자인 토큰과 동일 값 유지).
// ═══════════════════════════════════════════════════════════

const MONO_FONT = `'SF Mono','Cascadia Code','Consolas',monospace`;
const SANS_FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Pretendard','Noto Sans KR',sans-serif`;

const BG = '#13161f';                       // var(--s1)
const GRID = 'rgba(255,255,255,.05)';
const LINE = '#00b4d8';                      // var(--data-cyan)
const AXIS_TEXT = 'rgba(255,255,255,.65)';   // var(--t2)
const TICK_TEXT = 'rgba(255,255,255,.38)';   // var(--t3)
const LAST_LABEL = 'rgba(255,255,255,.92)';  // var(--t1)

const CAP = 600;                 // 링버퍼 최대 샘플 수
const MAX_DPR = 1.5;              // 성능 규약: pixelRatio ≤ 1.5
const PAD = { l: 40, r: 14, t: 12, b: 26 };

function fmt(v) {
  if (!Number.isFinite(v)) return '—';
  const av = Math.abs(v);
  if (av >= 100) return v.toFixed(0);
  if (av >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export class Graph {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.xs = [];
    this.ys = [];
    this.axes = {
      x: { label: opts.x?.label ?? 'X', unit: opts.x?.unit ?? '' },
      y: { label: opts.y?.label ?? 'Y', unit: opts.y?.unit ?? '' },
    };
    this._cssW = 0;
    this._cssH = 0;
  }

  setAxes(opts = {}) {
    if (opts.x) this.axes.x = { label: opts.x.label ?? 'X', unit: opts.x.unit ?? '' };
    if (opts.y) this.axes.y = { label: opts.y.label ?? 'Y', unit: opts.y.unit ?? '' };
  }

  addPoint(x, y) {
    this.xs.push(x);
    this.ys.push(y);
    if (this.xs.length > CAP) {
      this.xs.shift();
      this.ys.shift();
    }
  }

  reset() {
    this.xs.length = 0;
    this.ys.length = 0;
  }

  // 캔버스가 접혀 있어(display:none) 크기가 0이면 false를 반환해 draw()가 건너뛰게 한다.
  _syncSize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this._cssW = rect.width;
    this._cssH = rect.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  draw() {
    if (!this._syncSize()) return;
    const ctx = this.ctx;
    const w = this._cssW, h = this._cssH;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const n = this.xs.length;
    if (n < 2) {
      ctx.fillStyle = TICK_TEXT;
      ctx.font = `12px ${SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('데이터 수집 중…', w / 2, h / 2);
      return;
    }

    const plotL = PAD.l, plotT = PAD.t;
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = Math.max(1, h - PAD.t - PAD.b);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = this.xs[i], y = this.ys[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // 자동 스케일 + 여유 10% (범위가 0이면 값 크기의 10% 또는 최소 1만큼 벌려준다)
    const padX = (maxX - minX) * 0.1 || Math.abs(maxX) * 0.1 || 1;
    const padY = (maxY - minY) * 0.1 || Math.abs(maxY) * 0.1 || 1;
    minX -= padX; maxX += padX;
    minY -= padY; maxY += padY;

    const toPx = (x, y) => [
      plotL + ((x - minX) / (maxX - minX)) * plotW,
      plotT + plotH - ((y - minY) / (maxY - minY)) * plotH,
    ];

    // 그리드 5×5
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const gx = plotL + (plotW * i) / 5;
      ctx.beginPath(); ctx.moveTo(gx, plotT); ctx.lineTo(gx, plotT + plotH); ctx.stroke();
      const gy = plotT + (plotH * i) / 5;
      ctx.beginPath(); ctx.moveTo(plotL, gy); ctx.lineTo(plotL + plotW, gy); ctx.stroke();
    }

    // 축 눈금(최소/최대값)
    ctx.fillStyle = TICK_TEXT;
    ctx.font = `10px ${MONO_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(fmt(minX), plotL, plotT + plotH + 4);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(maxX), plotL + plotW, plotT + plotH + 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(maxY), plotL - 4, plotT - 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(minY), plotL - 4, plotT + plotH);

    // 축 라벨 + 단위
    ctx.font = `11px ${SANS_FONT}`;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${this.axes.x.label} (${this.axes.x.unit})`, plotL + plotW / 2, h - 4);

    ctx.save();
    ctx.translate(11, plotT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`${this.axes.y.label} (${this.axes.y.unit})`, 0, 0);
    ctx.restore();

    // 데이터 선(가장 오래된 → 최신)
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [px, py] = toPx(this.xs[i], this.ys[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 최신 점(시안 원 + 수치 라벨)
    const lastX = this.xs[n - 1], lastY = this.ys[n - 1];
    const [lx, ly] = toPx(lastX, lastY);
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const nearRight = lx > plotL + plotW * 0.7;
    const nearTop = ly < plotT + plotH * 0.25;
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = LAST_LABEL;
    ctx.textAlign = nearRight ? 'right' : 'left';
    ctx.textBaseline = nearTop ? 'top' : 'bottom';
    const lox = nearRight ? -6 : 6;
    const loy = nearTop ? 6 : -6;
    ctx.fillText(`(${fmt(lastX)}, ${fmt(lastY)})`, lx + lox, ly + loy);
  }
}
