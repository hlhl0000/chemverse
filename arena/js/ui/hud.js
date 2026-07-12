// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA ui/hud.js — HUD (Phase A + Phase B, three 임포트 금지)
// #hud 내부 DOM을 전담 소유한다(index.html에는 빈 <div id="hud">만 존재).
// 렌더는 arena.css(Fable 소유)에 정의된 클래스만 사용한다:
// Phase A: .hud-top .hud-timer(+.low) .hud-score-ox .hud-score-re .hud-objective
//          .hud-roster .toast .badge(+.ok,.warn,.off)
// Phase B: .pb-gauge(+.warn) .pb-gauge-fill .pb-gauge-label
//          .pb-inv .pb-inv-slot(+.filled)
//          .pb-weapon .pb-weapon-name .pb-weapon-ammo(+.reloading)
//          .pb-killfeed .pb-killfeed-item
//          .pb-hint(+.pb-hint-deposit)
//          .pb-quizbtn
//          .pb-quiz .pb-quiz-card .pb-quiz-prompt .pb-quiz-values
//          .pb-quiz-options .pb-quiz-opt(+.disabled) .pb-quiz-lock
//          .pb-respawn
//          .pb-result .pb-result-card .pb-result-title .pb-result-scores .pb-result-pers
//          .pb-fire .pb-weaponswitch
// ═══════════════════════════════════════════════════════════

const MODE_LABEL = { solo: '솔로', supabase: 'Supabase', wsrelay: '교내망' };
const TEAM_NAME = { OX: '산화팀', RE: '환원팀' };
const WEAPON_NAME = { spoit: '스포이트 물총', buret: '뷰렛 스나이퍼', spray: '시약 분무기', flask: '부피 플라스크' };

function fmtVal(kind, n) {
  const v = Number(n) || 0;
  switch (kind) {
    case 'w': return `${v.toFixed(3)} g`;
    case 'V': return `${v.toFixed(3)} L`;
    case 'T': return `${v.toFixed(1)} K`;
    case 'P': return `${v.toFixed(1)} kPa`;
    default: return String(v);
  }
}

export class HUD {
  constructor(rootEl) {
    this.root = rootEl;
    this.root.innerHTML = `
      <div class="hud-top">
        <span class="hud-score-ox" data-hud="score-ox">OX 0</span>
        <span class="hud-timer" data-hud="timer">--:--</span>
        <span class="hud-score-re" data-hud="score-re">RE 0</span>
      </div>
      <div class="badge off" data-hud="status">오프라인</div>
      <div class="hud-objective min" data-hud="objective"></div>
      <div class="hud-roster hidden" data-hud="roster"></div>

      <div class="pb-gauge hidden" data-hud="gauge">
        <div class="pb-gauge-fill" data-hud="gauge-fill" style="width:100%"></div>
        <div class="pb-gauge-label" data-hud="gauge-label">100%</div>
      </div>

      <div class="pb-inv hidden" data-hud="inv"></div>

      <div class="pb-weapon hidden" data-hud="weapon">
        <div class="pb-weapon-name" data-hud="weapon-name">-</div>
        <div class="pb-weapon-ammo" data-hud="weapon-ammo">-</div>
      </div>

      <div class="pb-killfeed" data-hud="killfeed"></div>

      <div class="pb-hint hidden" data-hud="hint-pickup"></div>
      <div class="pb-hint pb-hint-deposit hidden" data-hud="hint-deposit">조립대 근접 · 자동 장착</div>

      <button type="button" class="pxbtn primary pb-quizbtn hidden" data-hud="quizbtn">장치 완성 · 퀴즈 응시</button>

      <div class="pb-respawn hidden" data-hud="respawn"></div>

      <button type="button" class="pb-fire" data-hud="fire">FIRE</button>
      <button type="button" class="pb-weaponswitch" data-hud="weaponswitch">무기 전환</button>
    `;

    this.elTimer = this.root.querySelector('[data-hud="timer"]');
    this.elScoreOx = this.root.querySelector('[data-hud="score-ox"]');
    this.elScoreRe = this.root.querySelector('[data-hud="score-re"]');
    this.elStatus = this.root.querySelector('[data-hud="status"]');
    this.elObjective = this.root.querySelector('[data-hud="objective"]');
    this.elRoster = this.root.querySelector('[data-hud="roster"]');

    this.elGauge = this.root.querySelector('[data-hud="gauge"]');
    this.elGaugeFill = this.root.querySelector('[data-hud="gauge-fill"]');
    this.elGaugeLabel = this.root.querySelector('[data-hud="gauge-label"]');

    this.elInv = this.root.querySelector('[data-hud="inv"]');
    this.elWeapon = this.root.querySelector('[data-hud="weapon"]');
    this.elWeaponName = this.root.querySelector('[data-hud="weapon-name"]');
    this.elWeaponAmmo = this.root.querySelector('[data-hud="weapon-ammo"]');

    this.elKillfeed = this.root.querySelector('[data-hud="killfeed"]');
    this.elHintPickup = this.root.querySelector('[data-hud="hint-pickup"]');
    this.elHintDeposit = this.root.querySelector('[data-hud="hint-deposit"]');
    this.elQuizBtn = this.root.querySelector('[data-hud="quizbtn"]');
    this.elRespawn = this.root.querySelector('[data-hud="respawn"]');
    this.elFire = this.root.querySelector('[data-hud="fire"]');
    this.elWeaponSwitch = this.root.querySelector('[data-hud="weaponswitch"]');

    this._objectiveTimer = null;
    this._toasts = [];

    this._quizModal = null;
    this._quizOptEls = [];
    this._quizLockEl = null;
    this._quizLockRemain = 0;
    this._quizOnAnswer = null;
    this._quizAnswered = false;
    this._quizBtnHandler = null;

    this._resultModal = null;

    this._fireCb = null;
    this._switchCb = null;

    this.elFire.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (this._fireCb) this._fireCb();
    });
    this.elWeaponSwitch.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (this._switchCb) this._switchCb();
    });
  }

  // ───────────────────── Phase A API ─────────────────────

  setStatus({ connected, count, mode } = {}) {
    if (!this.elStatus) return;
    const modeLabel = MODE_LABEL[mode] || mode || '';
    if (!connected) {
      this.elStatus.textContent = `오프라인${modeLabel ? ' · ' + modeLabel : ''}`;
      this.elStatus.className = 'badge off';
      return;
    }
    this.elStatus.textContent = `접속${count != null ? ' ' + count + '명' : ''}${modeLabel ? ' · ' + modeLabel : ''}`;
    this.elStatus.className = 'badge ok';
  }

  setTimer(sec) {
    if (!this.elTimer) return;
    if (sec == null) {
      this.elTimer.textContent = '--:--';
      this.elTimer.classList.remove('low');
      return;
    }
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.elTimer.textContent = `${mm}:${ss}`;
    this.elTimer.classList.toggle('low', s < 60);
  }

  setScores({ OX = 0, RE = 0 } = {}) {
    if (this.elScoreOx) this.elScoreOx.textContent = `OX ${OX}`;
    if (this.elScoreRe) this.elScoreRe.textContent = `RE ${RE}`;
  }

  setObjective(text) {
    if (!this.elObjective) return;
    this.elObjective.textContent = text || '';
    this.elObjective.classList.remove('min');
    if (this._objectiveTimer) clearTimeout(this._objectiveTimer);
    this._objectiveTimer = setTimeout(() => {
      this.elObjective.classList.add('min');
    }, 4000);
  }

  setRoster(players) {
    if (!this.elRoster) return;
    const list = players || [];
    this.elRoster.classList.remove('hidden');
    if (!list.length) {
      this.elRoster.innerHTML = '<div>참가자 없음</div>';
      return;
    }
    this.elRoster.innerHTML = list.map((p) => {
      const team = (p.profile && p.profile.team) || 'OX';
      const crown = p.isHost ? ' \u{1F451}' : '';
      const name = (p.profile && p.profile.name) || '?';
      return `<div>[${TEAM_NAME[team] || team}] ${name}${crown}</div>`;
    }).join('');
  }

  toast(msg, ms = 2200) {
    if (!this.root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    const offset = this._toasts.length * 46;
    el.style.transform = `translate(-50%, -${offset}px)`;
    this.root.appendChild(el);
    this._toasts.push(el);
    setTimeout(() => {
      el.remove();
      this._toasts = this._toasts.filter((t) => t !== el);
    }, ms);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  // ───────────────────── Phase B API ─────────────────────

  setGauge(v) {
    if (!this.elGauge) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    this.elGauge.classList.remove('hidden');
    this.elGaugeFill.style.width = `${pct}%`;
    this.elGaugeLabel.textContent = `젖음 ${pct}%`;
    this.elGauge.classList.toggle('warn', pct <= 30);
  }

  setInventory(items) {
    if (!this.elInv) return;
    const list = items || [];
    this.elInv.classList.remove('hidden');
    const slots = [];
    for (let i = 0; i < 2; i++) {
      const it = list[i];
      if (it) {
        slots.push(`<div class="pb-inv-slot filled">${it.name || it.id}</div>`);
      } else {
        slots.push('<div class="pb-inv-slot">빈 슬롯</div>');
      }
    }
    this.elInv.innerHTML = slots.join('');
  }

  setWeapon({ id, name, ammo, mag, reloading } = {}) {
    if (!this.elWeapon) return;
    this.elWeapon.classList.remove('hidden');
    const label = name || WEAPON_NAME[id] || id || '-';
    this.elWeaponName.textContent = label;
    this.elWeaponAmmo.textContent = reloading ? '재장전 중…' : `${ammo != null ? ammo : '-'} / ${mag != null ? mag : '-'}`;
    this.elWeaponAmmo.classList.toggle('reloading', !!reloading);
  }

  killfeed(text) {
    if (!this.elKillfeed) return;
    const el = document.createElement('div');
    el.className = 'pb-killfeed-item';
    el.textContent = text;
    this.elKillfeed.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  setPickupHint(nameOrNull) {
    if (!this.elHintPickup) return;
    if (!nameOrNull) {
      this.elHintPickup.classList.add('hidden');
      this.elHintPickup.textContent = '';
      return;
    }
    this.elHintPickup.textContent = `근접 · 자동 획득: ${nameOrNull}`;
    this.elHintPickup.classList.remove('hidden');
  }

  setDepositHint(bool) {
    if (!this.elHintDeposit) return;
    this.elHintDeposit.classList.toggle('hidden', !bool);
  }

  showQuizButton(onClick) {
    if (!this.elQuizBtn) return;
    if (this._quizBtnHandler) {
      this.elQuizBtn.removeEventListener('click', this._quizBtnHandler);
      this._quizBtnHandler = null;
    }
    if (!onClick) {
      this.elQuizBtn.classList.add('hidden');
      return;
    }
    this._quizBtnHandler = (ev) => { ev.stopPropagation(); onClick(); };
    this.elQuizBtn.addEventListener('click', this._quizBtnHandler);
    this.elQuizBtn.classList.remove('hidden');
  }

  showQuiz({ prompt, values, options, lockRemainSec } = {}, onAnswer) {
    this.closeQuiz();
    this._quizOnAnswer = typeof onAnswer === 'function' ? onAnswer : null;
    this._quizAnswered = false;
    this._quizLockRemain = Math.max(0, Number(lockRemainSec) || 0);

    const v = values || {};
    const valuesHtml = ['w', 'V', 'T', 'P']
      .filter((k) => v[k] != null)
      .map((k) => `<span>${k} = ${fmtVal(k, v[k])}</span>`)
      .join('');

    const opts = options || [];
    const optsHtml = opts.map((o, i) => {
      const label = typeof o === 'string' ? o : (o.label != null ? o.label : o.text);
      const oid = typeof o === 'string' ? i : (o.id != null ? o.id : i);
      return `<button type="button" class="pxbtn pb-quiz-opt" data-oid="${oid}">${label}</button>`;
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'pb-quiz';
    modal.innerHTML = `
      <div class="pb-quiz-card">
        <div class="pb-quiz-prompt">${prompt || ''}</div>
        <div class="pb-quiz-values">${valuesHtml}</div>
        <div class="pb-quiz-options">${optsHtml}</div>
        <div class="pb-quiz-lock hidden" data-hud="quiz-lock"></div>
      </div>
    `;
    this.root.appendChild(modal);
    this._quizModal = modal;
    this._quizLockEl = modal.querySelector('[data-hud="quiz-lock"]');
    this._quizOptEls = Array.from(modal.querySelectorAll('.pb-quiz-opt'));

    this._quizOptEls.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this._quizAnswered || this._quizLockRemain > 0) return;
        this._quizAnswered = true;
        this._quizOptEls.forEach((b) => b.classList.add('disabled'));
        const oidRaw = btn.getAttribute('data-oid');
        const oid = /^\d+$/.test(oidRaw) ? Number(oidRaw) : oidRaw;
        if (this._quizOnAnswer) this._quizOnAnswer(oid);
      });
    });

    this._applyQuizLockUI();
  }

  _applyQuizLockUI() {
    if (!this._quizModal) return;
    const locked = this._quizLockRemain > 0;
    this._quizOptEls.forEach((b) => b.classList.toggle('disabled', locked || this._quizAnswered));
    if (this._quizLockEl) {
      if (locked) {
        this._quizLockEl.classList.remove('hidden');
        this._quizLockEl.textContent = `오답 페널티 · ${Math.ceil(this._quizLockRemain)}초 후 재시도 가능`;
      } else {
        this._quizLockEl.classList.add('hidden');
      }
    }
  }

  closeQuiz() {
    if (this._quizModal) {
      this._quizModal.remove();
      this._quizModal = null;
    }
    this._quizOptEls = [];
    this._quizLockEl = null;
    this._quizOnAnswer = null;
    this._quizLockRemain = 0;
    this._quizAnswered = false;
  }

  showRespawn(secOrNull) {
    if (!this.elRespawn) return;
    if (secOrNull == null) {
      this.elRespawn.classList.add('hidden');
      this.elRespawn.textContent = '';
      return;
    }
    const s = Math.max(0, Math.ceil(Number(secOrNull) || 0));
    this.elRespawn.textContent = `실험복 교체 중… ${s}`;
    this.elRespawn.classList.remove('hidden');
  }

  showResult({ winner, reason, scores, pers, myTeam, myId } = {}, onRetry) {
    if (this._resultModal) {
      this._resultModal.remove();
      this._resultModal = null;
    }
    const sc = scores || { OX: 0, RE: 0 };
    const reasonLabel = reason === 'quiz' ? '정답 판정 승리' : reason === 'time' ? '시간 종료' : '';

    let titleText;
    let titleColor;
    if (!winner) {
      titleText = '무승부';
      titleColor = 'var(--tx)';
    } else if (winner === myTeam) {
      titleText = '승리!';
      titleColor = 'var(--ok)';
    } else {
      titleText = '패배';
      titleColor = 'var(--bad)';
    }

    const persList = pers || {};
    const persHtml = Object.keys(persList).length
      ? Object.entries(persList).map(([pid, n]) => `${pid === myId ? '나' : pid}: ${n}`).join(' · ')
      : '';

    const modal = document.createElement('div');
    modal.className = 'pb-result';
    modal.innerHTML = `
      <div class="pb-result-card">
        <div class="pb-result-title" style="color:${titleColor}">${titleText}${reasonLabel ? ` · ${reasonLabel}` : ''}</div>
        <div class="pb-result-scores">
          <span style="color:var(--ox)">OX ${sc.OX || 0}</span>
          <span style="color:var(--re)">RE ${sc.RE || 0}</span>
        </div>
        <div class="pb-result-pers">${persHtml}</div>
        <button type="button" class="pxbtn primary" data-hud="retry">다시하기</button>
      </div>
    `;
    this.root.appendChild(modal);
    this._resultModal = modal;
    const retryBtn = modal.querySelector('[data-hud="retry"]');
    retryBtn.addEventListener('click', () => {
      if (typeof onRetry === 'function') onRetry();
    });
  }

  onFire(cb) { this._fireCb = typeof cb === 'function' ? cb : null; }
  onSwitchWeapon(cb) { this._switchCb = typeof cb === 'function' ? cb : null; }

  update(dt) {
    if (this._quizModal && this._quizLockRemain > 0) {
      this._quizLockRemain = Math.max(0, this._quizLockRemain - (dt || 0));
      this._applyQuizLockUI();
    }
  }
}
