// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA ui/lobby.js — Lobby (신규 로직, three 임포트 금지)
// #lobby 내부 DOM을 전담 소유한다. index.html(Fable 소유)의 기존 id를 그대로
// 사용하고, 렌더는 arena.css(Fable 소유)에 정의된 클래스만 사용한다.
//
// 화면 전환: #scr-login → #scr-wait → #scr-count (모두 index.html에 이미 존재)
// ═══════════════════════════════════════════════════════════

import { MAX_PER_ROOM } from '../net/config.js';

const $q = (root, sel) => root.querySelector(sel);

export class Lobby {
  constructor(rootEl, missions) {
    this.root = rootEl;
    this.missions = missions || [];
    this.selectedMissionId = null;

    this.scrLogin = $q(rootEl, '#scr-login');
    this.scrWait = $q(rootEl, '#scr-wait');
    this.scrCount = $q(rootEl, '#scr-count');

    this.elGrade = $q(rootEl, '#in-grade');
    this.elCls = $q(rootEl, '#in-cls');
    this.elName = $q(rootEl, '#in-name');
    this.elMissionCards = $q(rootEl, '#mission-cards');
    this.elRoom = $q(rootEl, '#in-room');
    this.elBtnJoin = $q(rootEl, '#btn-join');
    this.elBtnSolo = $q(rootEl, '#btn-solo');
    this.elLoginMsg = $q(rootEl, '#login-msg');

    this.elWaitTitle = $q(rootEl, '#wait-title');
    this.elWaitSub = $q(rootEl, '#wait-sub');
    this.elRosterOx = $q(rootEl, '#roster-ox');
    this.elRosterRe = $q(rootEl, '#roster-re');
    this.elBtnTeamOx = $q(rootEl, '#btn-team-ox');
    this.elBtnTeamRe = $q(rootEl, '#btn-team-re');
    this.elBtnStart = $q(rootEl, '#btn-start');
    this.elWaitHint = $q(rootEl, '#wait-hint');
    this.elBtnLeave = $q(rootEl, '#btn-leave');

    this.elCountNum = $q(rootEl, '#count-num');

    this._isHost = false;
    this._overCapacity = false;

    this._submitCb = null;
    this._teamPickCb = null;
    this._startCb = null;
    this._leaveCb = null;

    this._fillClassOptions();
    this._renderMissionCards();
    this._wireLogin();
    this._wireWait();
  }

  // ═══════════ 화면 1: 로그인 + 미션 선택 ═══════════
  _fillClassOptions() {
    if (!this.elCls) return;
    this.elCls.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === 1) opt.selected = true;
      this.elCls.appendChild(opt);
    }
  }

  _renderMissionCards() {
    if (!this.elMissionCards) return;
    this.elMissionCards.innerHTML = '';

    // 기본 선택: idealgas(준비 완료) 우선, 없으면 준비 완료된 첫 미션
    const defaultM = this.missions.find((m) => m.id === 'idealgas' && m.ready !== false)
      || this.missions.find((m) => m.ready !== false);
    this.selectedMissionId = defaultM ? defaultM.id : null;

    this.missions.forEach((m) => {
      const locked = m.ready === false;
      const card = document.createElement('div');
      card.className = 'mcard' + (locked ? ' locked' : '');
      card.dataset.id = m.id;
      card.innerHTML =
        `<div class="m-name">${m.name}</div><div class="m-tag">${m.tagline || ''}</div>`;
      if (!locked) {
        card.addEventListener('click', () => this._selectMission(m.id));
      }
      this.elMissionCards.appendChild(card);
    });
    this._refreshMissionCardUI();
  }

  _refreshMissionCardUI() {
    if (!this.elMissionCards) return;
    [...this.elMissionCards.children].forEach((el) => {
      el.classList.toggle('on', el.dataset.id === this.selectedMissionId);
    });
  }

  _selectMission(id) {
    this.selectedMissionId = id;
    this._refreshMissionCardUI();
  }

  _wireLogin() {
    const submit = (solo) => {
      const grade = this.elGrade ? this.elGrade.value : '2';
      const cls = this.elCls ? this.elCls.value : '1';
      const name = this.elName ? this.elName.value.trim() : '';
      const roomNo = this.elRoom ? this.elRoom.value : '1';

      if (!name) {
        this.showError('이름을 입력해 주세요.');
        return;
      }
      if (!this.selectedMissionId) {
        this.showError('미션을 선택해 주세요.');
        return;
      }
      this.showError('');
      if (this._submitCb) {
        this._submitCb({ grade, cls, name, missionId: this.selectedMissionId, roomNo, solo: !!solo });
      }
    };
    this.elBtnJoin && this.elBtnJoin.addEventListener('click', () => submit(false));
    this.elBtnSolo && this.elBtnSolo.addEventListener('click', () => submit(true));
  }

  onSubmit(cb) { this._submitCb = cb; }

  showError(msg) {
    if (this.elLoginMsg) this.elLoginMsg.textContent = msg || '';
  }

  backToLogin() {
    this.scrLogin && this.scrLogin.classList.remove('hidden');
    this.scrWait && this.scrWait.classList.add('hidden');
    this.scrCount && this.scrCount.classList.add('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  // ═══════════ 화면 2: 대기실 ═══════════
  showWaiting({ roomLabel, missionName } = {}) {
    this.scrLogin && this.scrLogin.classList.add('hidden');
    this.scrWait && this.scrWait.classList.remove('hidden');
    this.scrCount && this.scrCount.classList.add('hidden');
    if (this.elWaitTitle) this.elWaitTitle.textContent = '대기실';
    if (this.elWaitSub) this.elWaitSub.textContent = `${roomLabel || ''} · ${missionName || ''}`;
  }

  _wireWait() {
    this.elBtnTeamOx && this.elBtnTeamOx.addEventListener('click', () => this._teamPickCb && this._teamPickCb('OX'));
    this.elBtnTeamRe && this.elBtnTeamRe.addEventListener('click', () => this._teamPickCb && this._teamPickCb('RE'));
    this.elBtnStart && this.elBtnStart.addEventListener('click', () => this._startCb && this._startCb());
    this.elBtnLeave && this.elBtnLeave.addEventListener('click', () => this._leaveCb && this._leaveCb());
  }

  onTeamPick(cb) { this._teamPickCb = cb; }
  onStart(cb) { this._startCb = cb; }
  onLeave(cb) { this._leaveCb = cb; }

  setRoster(players, { myId } = {}) {
    const list = players || [];
    this._overCapacity = list.length > MAX_PER_ROOM;
    this._renderRosterCol(this.elRosterOx, list.filter((p) => (p.profile.team || 'OX') === 'OX'), myId);
    this._renderRosterCol(this.elRosterRe, list.filter((p) => p.profile.team === 'RE'), myId);
    this._refreshHint();
  }

  _renderRosterCol(el, players, myId) {
    if (!el) return;
    el.innerHTML = '';
    players.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'roster-item' + (p.id === myId ? ' me' : '') + (p.isHost ? ' host' : '');
      const nameEl = document.createElement('span');
      nameEl.textContent = (p.profile && p.profile.name) || '이름없음';
      item.appendChild(nameEl);
      el.appendChild(item);
    });
  }

  setHost(isHost) {
    this._isHost = !!isHost;
    if (this.elBtnStart) this.elBtnStart.classList.toggle('hidden', !this._isHost);
    this._refreshHint();
  }

  _refreshHint() {
    if (!this.elWaitHint) return;
    if (this._overCapacity) {
      this.elWaitHint.textContent = `⚠ 정원 초과(최대 ${MAX_PER_ROOM}명) — 다른 방 번호를 이용해 주세요.`;
      return;
    }
    this.elWaitHint.textContent = this._isHost ? '' : '호스트 대기 중…';
  }

  // ═══════════ 화면 3: 카운트다운 ═══════════
  async countdown(n) {
    [this.scrLogin, this.scrWait].forEach((el) => el && el.classList.add('hidden'));
    this.scrCount && this.scrCount.classList.remove('hidden');
    for (let i = n; i >= 1; i--) {
      if (this.elCountNum) this.elCountNum.textContent = String(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    this.scrCount && this.scrCount.classList.add('hidden');
  }
}
