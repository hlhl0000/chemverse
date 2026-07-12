// ═══════════════════════════════════════════════════════════
// HUD — 순수 DOM (three 임포트 절대 금지) — 소유: 에이전트 B
// js/main.js 상단 계약 그대로 구현한다:
//   HUD(rootEl): .setStatus(s) .toast(msg,ms?) .showExperimentPicker(list,onPick)
//        .startSession({def,model,placed}) .setChecklist(r) .setSimActive(b)
//        .showCarryHint(nameOrNull) .update(dt) .endSession()
// 배치(위치/좌표)는 css/main.css의 #hud-* 프레임이 담당한다.
// 이 파일은 각 #hud-* 컨테이너의 "내부" 마크업만 그려 넣는다.
//
// ── js/experiments/idealgas/index.js 실사용 스펙과의 관찰 ──
// registry.js의 스키마 주석은 control.type을 slider/toggle/buttons로만
// 적어두었지만, 실제 idealgas/index.js는 'stepper'(추 무게) 타입도 쓴다.
// 또한 "컨트롤 활성 조건"은 함수(enabledWhen)가 아니라
//   - control.requiresItem: string  (해당 기구가 placed에 없으면 비활성)
//   - control.options[].requiresItem: string (버튼 개별 옵션 단위 비활성)
//   - control.activeWhen: { bind, equals } (다른 입력값 조건부 비활성)
// 형태의 선언적 필드로 구현되어 있다. 아래 구현은 이 실제 필드를 따른다.
// (자세한 내용은 파일 하단 완료 보고 참고)
// ═══════════════════════════════════════════════════════════

import { Graph } from './graph.js';

const MODE_LABELS = { solo: '솔로', supabase: '온라인', wsrelay: '교내망' };

const READOUT_STEP = 0.1;   // s
const GRAPH_EVERY_N = 5;    // READOUT_STEP × 5 = 0.5s

function hasEquipment(placed, itemId) {
  if (!itemId) return true;
  for (const v of placed.values()) if (v === itemId) return true;
  return false;
}

// 슬라이더/스테퍼 표시 자릿수를 step 크기로부터 유도 (1→0자리, 0.5→1자리, 0.01→2자리)
function digitsFromStep(step) {
  const s = step ?? 1;
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.max(0, Math.min(3, -Math.floor(Math.log10(s))));
}

function formatCtlValue(value, ctl) {
  const d = digitsFromStep(ctl.step);
  return Number(value).toFixed(d);
}

export class HUD {
  constructor(rootEl) {
    this.root = rootEl;
    this.elStatus = rootEl.querySelector('#hud-status');
    this.elReadouts = rootEl.querySelector('#hud-readouts');
    this.elChecklist = rootEl.querySelector('#hud-checklist');
    this.elControls = rootEl.querySelector('#hud-controls');
    this.elGraphs = rootEl.querySelector('#hud-graphs');
    this.elToast = rootEl.querySelector('#hud-toast');
    this.elPicker = rootEl.querySelector('#exp-picker');
    this.elCarryHint = rootEl.querySelector('#carry-hint');

    // 세션이 없을 때는 4개 패널 모두 숨김(내용도 비어 있으므로 시각적 차이는 없지만
    // endSession()과 대칭을 이루도록 명시적으로 hidden을 건다)
    for (const el of [this.elReadouts, this.elChecklist, this.elControls, this.elGraphs]) {
      el.classList.add('hidden');
    }

    this._session = null;        // { def, model, placed }
    this._readoutEls = [];       // [{def, valueEl}]
    this._controlEntries = [];   // [{def, setEnabled(bool)}]
    this._graphDefs = [];
    this._graphTabBtns = [];
    this._graph = null;
    this._activeGraphIdx = 0;
    this._simActive = false;
    this._acc = 0;
    this._tick = 0;

    this._toastCard = null;
    this._toastHideT = null;
    this._toastRemoveT = null;
  }

  // ── 상태 뱃지 ──────────────────────────────────────────
  setStatus({ mode, connected, count } = {}) {
    const root = this.elStatus;
    root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'hud-panel hud-status-badge';

    const dot = document.createElement('span');
    dot.className = 'hud-dot';
    dot.style.background = connected ? 'var(--data-teal)' : 'var(--data-amber)';
    panel.appendChild(dot);

    const modeSpan = document.createElement('span');
    modeSpan.className = 'hud-status-mode';
    modeSpan.textContent = MODE_LABELS[mode] || mode || '알 수 없음';
    panel.appendChild(modeSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'hud-status-count hud-mono';
    countSpan.textContent = `${count ?? 1}명`;
    panel.appendChild(countSpan);

    root.appendChild(panel);
  }

  // ── 토스트 ─────────────────────────────────────────────
  toast(msg, ms = 2500) {
    clearTimeout(this._toastHideT);
    clearTimeout(this._toastRemoveT);

    let card = this._toastCard;
    if (!card) {
      card = document.createElement('div');
      card.className = 'hud-toast-card';
      this.elToast.appendChild(card);
      this._toastCard = card;
    }
    card.textContent = msg;
    card.classList.remove('hide');
    void card.offsetWidth; // 강제 리플로우 → 연속 호출 시 트랜지션 재시작
    card.classList.add('show');

    this._toastHideT = setTimeout(() => {
      card.classList.remove('show');
      card.classList.add('hide');
      this._toastRemoveT = setTimeout(() => {
        card.remove();
        if (this._toastCard === card) this._toastCard = null;
      }, 300);
    }, ms);
  }

  // ── 들고 있는 기구 안내 ────────────────────────────────
  showCarryHint(text) {
    this.elCarryHint.innerHTML = '';
    if (text == null) {
      this.elCarryHint.classList.add('hidden');
      return;
    }
    this.elCarryHint.classList.remove('hidden');
    const card = document.createElement('div');
    card.className = 'hud-carry-card';
    card.textContent = text;
    this.elCarryHint.appendChild(card);
  }

  // ── 실험 선택 모달 ─────────────────────────────────────
  showExperimentPicker(list, onPick) {
    const root = this.elPicker;
    root.innerHTML = '';
    root.classList.remove('hidden');

    const close = () => {
      root.classList.add('hidden');
      root.innerHTML = '';
    };

    const modal = document.createElement('div');
    modal.className = 'hud-picker-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hud-picker-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.addEventListener('click', () => { close(); onPick(null); });
    modal.appendChild(closeBtn);

    const title = document.createElement('div');
    title.className = 'hud-picker-title';
    title.textContent = '실험 선택';
    modal.appendChild(title);

    const listEl = document.createElement('div');
    listEl.className = 'hud-picker-list';

    for (const item of list) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hud-picker-item' + (item.ready ? '' : ' dim');

      const nameRow = document.createElement('div');
      nameRow.className = 'hud-picker-item-name';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;
      nameRow.appendChild(nameSpan);

      const levelBadge = document.createElement('span');
      levelBadge.className = 'hud-badge hud-badge-level';
      levelBadge.textContent = item.level;
      nameRow.appendChild(levelBadge);

      if (!item.ready) {
        const waitBadge = document.createElement('span');
        waitBadge.className = 'hud-badge hud-badge-wait';
        waitBadge.textContent = '준비 중';
        nameRow.appendChild(waitBadge);
      }
      card.appendChild(nameRow);

      const desc = document.createElement('div');
      desc.className = 'hud-picker-item-desc';
      desc.textContent = item.description || '';
      card.appendChild(desc);

      card.addEventListener('click', () => {
        if (!item.ready) return;
        close();
        onPick(item.id);
      });
      listEl.appendChild(card);
    }
    modal.appendChild(listEl);
    root.appendChild(modal);
  }

  // ── 체크리스트 패널 ────────────────────────────────────
  setChecklist({ ready = false, missing = [], hints = [] } = {}) {
    const root = this.elChecklist;
    root.classList.remove('hidden');
    root.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'hud-panel hud-checklist';

    const head = document.createElement('div');
    head.className = 'hud-checklist-head';
    const title = document.createElement('span');
    title.textContent = '장치 구성';
    head.appendChild(title);
    if (ready) {
      const badge = document.createElement('span');
      badge.className = 'hud-badge hud-badge-teal';
      badge.textContent = '완성';
      head.appendChild(badge);
    }
    panel.appendChild(head);

    if (missing.length) {
      const ul = document.createElement('ul');
      ul.className = 'hud-missing-list';
      for (const name of missing) {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'hud-dot-coral';
        dot.textContent = '○';
        li.appendChild(dot);
        li.appendChild(document.createTextNode(' ' + name));
        ul.appendChild(li);
      }
      panel.appendChild(ul);
    }

    if (hints.length) {
      const ul = document.createElement('ul');
      ul.className = 'hud-hint-list';
      for (const hint of hints) {
        const li = document.createElement('li');
        li.textContent = `▸ ${hint}`;
        ul.appendChild(li);
      }
      panel.appendChild(ul);
    }

    root.appendChild(panel);
  }

  // ── 실험 세션 시작: 리드아웃/컨트롤/그래프 렌더 ────────
  startSession({ def, model, placed }) {
    this._session = { def, model, placed };
    this._acc = 0;
    this._tick = 0;
    this._simActive = false;

    this._buildReadouts(def.ui?.readouts || []);
    this._buildControls(def.ui?.controls || []);
    this._buildGraphs(def.ui?.graphs || []);
    this._refreshControlStates();
  }

  _buildReadouts(readouts) {
    const root = this.elReadouts;
    root.innerHTML = '';
    root.classList.remove('hidden');
    this._readoutEls = [];

    const panel = document.createElement('div');
    panel.className = 'hud-panel hud-readouts';

    for (const r of readouts) {
      const row = document.createElement('div');
      row.className = 'hud-ro-row';

      const label = document.createElement('span');
      label.className = 'hud-ro-label';
      label.textContent = r.label;

      const value = document.createElement('span');
      value.className = 'hud-ro-value hud-mono';
      value.textContent = '—';

      const unit = document.createElement('span');
      unit.className = 'hud-ro-unit';
      unit.textContent = r.unit || '';

      row.append(label, value, unit);
      panel.appendChild(row);
      this._readoutEls.push({ def: r, valueEl: value });
    }
    root.appendChild(panel);
  }

  _renderReadouts(out) {
    const { placed } = this._session;
    for (const { def: r, valueEl } of this._readoutEls) {
      if (r.requiresItem && !hasEquipment(placed, r.requiresItem)) {
        valueEl.textContent = '—';
        continue;
      }
      const v = out[r.bind];
      valueEl.textContent = (typeof v === 'number' && Number.isFinite(v))
        ? v.toFixed(r.digits ?? 1)
        : '—';
    }
  }

  _buildControls(controls) {
    const root = this.elControls;
    root.innerHTML = '';
    root.classList.remove('hidden');
    root.classList.remove('inactive');
    this._controlEntries = [];

    const { model, placed } = this._session;
    const bar = document.createElement('div');
    bar.className = 'hud-panel hud-controls-bar';

    for (const c of controls) {
      const wrap = document.createElement('div');
      wrap.className = `hud-ctl hud-ctl-${c.type}`;
      wrap.dataset.id = c.id;
      const entry = { def: c, setEnabled: null };

      if (c.type === 'slider') this._buildSlider(wrap, c, model, entry);
      else if (c.type === 'toggle') this._buildToggle(wrap, c, model, entry);
      else if (c.type === 'buttons') this._buildButtons(wrap, c, model, placed, entry);
      else if (c.type === 'stepper') this._buildStepper(wrap, c, model, entry);
      else continue; // 알 수 없는 타입은 조용히 건너뜀(콘솔 에러 0 원칙)

      bar.appendChild(wrap);
      this._controlEntries.push(entry);
    }
    root.appendChild(bar);
  }

  _buildSlider(wrap, c, model, entry) {
    const label = document.createElement('label');
    label.className = 'hud-ctl-label';
    const labelText = document.createElement('span');
    labelText.textContent = c.label;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'hud-ctl-value hud-mono';
    label.append(labelText, valueSpan);
    wrap.appendChild(label);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(c.min ?? 0);
    input.max = String(c.max ?? 1);
    input.step = String(c.step ?? 1);
    const scale = c.scale ?? 1;

    const curBind = model.inputs[c.bind];
    const initialUi = (typeof curBind === 'number') ? curBind / scale : (c.default ?? 0);
    input.value = String(initialUi);
    wrap.appendChild(input);

    const applyDisplay = (uiValue) => {
      const unit = c.unit ? ` ${c.unit}` : '';
      valueSpan.textContent = `${formatCtlValue(uiValue, c)}${unit}`;
    };
    applyDisplay(initialUi);

    input.addEventListener('input', () => {
      const uiValue = Number(input.value);
      model.inputs[c.bind] = uiValue * scale;
      applyDisplay(uiValue);
    });

    // momentary: 손을 떼면 0으로 복귀(스프링 피스톤 밀기 등)
    if (c.momentary) {
      const resetToZero = () => {
        input.value = '0';
        model.inputs[c.bind] = 0;
        applyDisplay(0);
      };
      input.addEventListener('pointerup', resetToZero);
      input.addEventListener('pointercancel', resetToZero);
    }

    entry.setEnabled = (enabled) => {
      input.disabled = !enabled;
      wrap.classList.toggle('disabled', !enabled);
    };
  }

  _buildToggle(wrap, c, model, entry) {
    const label = document.createElement('span');
    label.className = 'hud-ctl-label';
    label.textContent = c.label;
    wrap.appendChild(label);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-toggle-btn';
    let state = !!model.inputs[c.bind];
    const render = () => {
      btn.textContent = state ? '켜짐' : '꺼짐';
      btn.classList.toggle('on', state);
    };
    render();
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      state = !state;
      model.inputs[c.bind] = state;
      render();
    });
    wrap.appendChild(btn);

    entry.setEnabled = (enabled) => {
      btn.disabled = !enabled;
      wrap.classList.toggle('disabled', !enabled);
    };
  }

  _buildButtons(wrap, c, model, placed, entry) {
    const label = document.createElement('span');
    label.className = 'hud-ctl-label';
    label.textContent = c.label;
    wrap.appendChild(label);

    const seg = document.createElement('div');
    seg.className = 'hud-seg';
    const optionBtns = [];

    for (const opt of c.options || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.classList.toggle('on', model.inputs[c.bind] === opt.value);
      b.addEventListener('click', () => {
        if (b.disabled) return;
        model.inputs[c.bind] = opt.value;
        for (const ob of optionBtns) ob.el.classList.toggle('on', ob.opt.value === opt.value);
      });
      seg.appendChild(b);
      optionBtns.push({ opt, el: b });
    }
    wrap.appendChild(seg);

    entry.setEnabled = (enabled) => {
      wrap.classList.toggle('disabled', !enabled);
      for (const { opt, el } of optionBtns) {
        const itemOk = !opt.requiresItem || hasEquipment(placed, opt.requiresItem);
        el.disabled = !enabled || !itemOk;
      }
    };
  }

  _buildStepper(wrap, c, model, entry) {
    const label = document.createElement('span');
    label.className = 'hud-ctl-label';
    label.textContent = c.label;
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.className = 'hud-stepper-row';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    const valSpan = document.createElement('span');
    valSpan.className = 'hud-ctl-value hud-mono';
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';

    const step = c.step ?? 1;
    const min = c.min ?? -Infinity, max = c.max ?? Infinity;
    let val = (typeof model.inputs[c.bind] === 'number') ? model.inputs[c.bind] : (c.default ?? 0);

    const render = () => {
      const unit = c.unit ? ` ${c.unit}` : '';
      valSpan.textContent = `${formatCtlValue(val, c)}${unit}`;
    };
    render();

    const setVal = (nv) => {
      val = Math.min(max, Math.max(min, nv));
      model.inputs[c.bind] = val;
      render();
    };
    minus.addEventListener('click', () => { if (!minus.disabled) setVal(val - step); });
    plus.addEventListener('click', () => { if (!plus.disabled) setVal(val + step); });

    row.append(minus, valSpan, plus);
    wrap.appendChild(row);

    entry.setEnabled = (enabled) => {
      minus.disabled = !enabled;
      plus.disabled = !enabled;
      wrap.classList.toggle('disabled', !enabled);
    };
  }

  // requiresItem / activeWhen 재평가 (매 update 호출)
  _refreshControlStates() {
    if (!this._session || !this._controlEntries.length) return;
    const { model, placed } = this._session;
    for (const entry of this._controlEntries) {
      const c = entry.def;
      let enabled = true;
      if (c.requiresItem && !hasEquipment(placed, c.requiresItem)) enabled = false;
      if (c.activeWhen) {
        const cur = model.inputs[c.activeWhen.bind];
        if (cur !== c.activeWhen.equals) enabled = false;
      }
      entry.setEnabled?.(enabled);
    }
  }

  _buildGraphs(graphs) {
    const root = this.elGraphs;
    root.innerHTML = '';
    root.classList.remove('hidden');
    this._graphDefs = graphs || [];
    this._graphTabBtns = [];
    this._graph = null;
    this._activeGraphIdx = 0;

    if (!this._graphDefs.length) return;

    const panel = document.createElement('div');
    panel.className = 'hud-panel hud-graphs-panel';

    const head = document.createElement('div');
    head.className = 'hud-graph-head';

    const tabs = document.createElement('div');
    tabs.className = 'hud-seg hud-graph-tabs';
    this._graphDefs.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = g.label;
      b.classList.toggle('on', i === 0);
      b.addEventListener('click', () => this._selectGraphTab(i));
      tabs.appendChild(b);
      this._graphTabBtns.push(b);
    });
    head.appendChild(tabs);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'hud-graph-toggle-btn';
    toggleBtn.textContent = '▸ 그래프';
    head.appendChild(toggleBtn);
    panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'hud-graph-body collapsed'; // 기본 접힘(태블릿 화면 절약)
    const canvas = document.createElement('canvas');
    canvas.className = 'hud-graph-canvas';
    body.appendChild(canvas);
    panel.appendChild(body);

    let collapsed = true;
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      body.classList.toggle('collapsed', collapsed);
      toggleBtn.textContent = collapsed ? '▸ 그래프' : '▾ 그래프';
      if (!collapsed) this._graph?.draw();
    });

    root.appendChild(panel);

    const first = this._graphDefs[0];
    this._graph = new Graph(canvas, { x: first.x, y: first.y });
  }

  _selectGraphTab(i) {
    this._activeGraphIdx = i;
    this._graphTabBtns.forEach((b, idx) => b.classList.toggle('on', idx === i));
    const g = this._graphDefs[i];
    if (!g || !this._graph) return;
    this._graph.setAxes({ x: g.x, y: g.y });
    this._graph.reset();
    this._graph.draw();
  }

  _sampleActiveGraph(out) {
    if (!this._graph || !this._graphDefs.length) return;
    const g = this._graphDefs[this._activeGraphIdx];
    if (!g) return;
    const x = out[g.x.bind];
    const y = out[g.y.bind];
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      this._graph.addPoint(x, y);
      this._graph.draw();
    }
  }

  // ── 컨트롤 바 활성/비활성(반투명+입력차단) ─────────────
  setSimActive(active) {
    this._simActive = !!active;
    this.elControls.classList.toggle('inactive', !this._simActive);
  }

  // ── 매 프레임 ───────────────────────────────────────────
  update(dt) {
    this._refreshControlStates();
    if (!this._session) return;

    this._acc += dt;
    while (this._acc >= READOUT_STEP) {
      this._acc -= READOUT_STEP;
      this._tick += 1;
      const out = this._session.model.outputs();
      this._renderReadouts(out);
      // 0.5s(READOUT_STEP × 5)마다, 시뮬레이션이 실제로 진행 중일 때만 그래프 샘플 추가
      if (this._simActive && this._tick % GRAPH_EVERY_N === 0) {
        this._sampleActiveGraph(out);
      }
    }
  }

  // ── 세션 종료 ───────────────────────────────────────────
  endSession() {
    this._session = null;
    this._readoutEls = [];
    this._controlEntries = [];
    this._graphDefs = [];
    this._graphTabBtns = [];
    this._graph = null;
    this._acc = 0;
    this._tick = 0;
    this._simActive = false;

    this.elReadouts.innerHTML = '';
    this.elReadouts.classList.add('hidden');
    this.elControls.innerHTML = '';
    this.elControls.classList.add('hidden');
    this.elControls.classList.remove('inactive');
    this.elGraphs.innerHTML = '';
    this.elGraphs.classList.add('hidden');
    this.elChecklist.innerHTML = '';
    this.elChecklist.classList.add('hidden');
  }
}
