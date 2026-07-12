// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA ui/hud.js — HUD (신규 로직, three 임포트 금지)
// #hud 내부 DOM을 전담 소유한다(index.html에는 빈 <div id="hud">만 존재).
// 렌더는 arena.css(Fable 소유)에 정의된 클래스만 사용한다:
// .hud-top .hud-timer(+.low) .hud-score-ox .hud-score-re .hud-objective
// .hud-roster .toast .badge(+.ok,.warn,.off)
// ═══════════════════════════════════════════════════════════

const MODE_LABEL = { solo: '솔로', supabase: 'Supabase', wsrelay: '교내망' };
const TEAM_NAME = { OX: '산화팀', RE: '환원팀' };

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
    `;

    this.elTimer = this.root.querySelector('[data-hud="timer"]');
    this.elScoreOx = this.root.querySelector('[data-hud="score-ox"]');
    this.elScoreRe = this.root.querySelector('[data-hud="score-re"]');
    this.elStatus = this.root.querySelector('[data-hud="status"]');
    this.elObjective = this.root.querySelector('[data-hud="objective"]');
    this.elRoster = this.root.querySelector('[data-hud="roster"]');

    this._objectiveTimer = null;
    this._toasts = [];
  }

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

  // Phase A는 정적 표시(각 setter 호출)만으로 충분해 update(dt)는 자리표시자로 둔다.
  // Phase B에서 프레임 단위로 갱신해야 하는 요소(젖음 게이지 등)가 생기면 여기서 처리.
  update(_dt) { /* no-op (Phase A) */ }
}
