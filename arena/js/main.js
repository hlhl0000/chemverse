// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA 부트스트랩·통합 허브 — 소유: Fable (하위 에이전트 수정 금지)
//
// 이 파일이 곧 "계약"이다. 임포트되는 모든 모듈은 여기서 호출하는 시그니처를
// 정확히 구현해야 한다. (상세: docs/AGENT_BRIEF_ARENA.md, docs/GAME_DESIGN.md)
//
// ── 에이전트 A 계약 ──────────────────────────────────────
//  Engine(canvas): .scene .camera .renderer .setQuality(q) .onUpdate(fn(dt)) .start() .stop()
//  TPSControls(engine,{joystickZone,lookZone,canvas}):
//        .object(발기준 루트) .setColliders([Box3]) .setBounds(b) .teleport([x,y,z],ry)
//        .getNetState()->{p,ry,an} .speedRatio(0~1) .update(dt)
//  buildVoxelCharacter(THREE,{teamColor,name,seed}) ->
//        { group, setAnim(m), update(dt,speedRatio), setName(s), dispose() }
//  buildArena(THREE, missionDef, seed) ->
//        { group, colliders:[Box3], bounds, spawns:{OX:[{pos,ry}…],RE:[…]},
//          zones:{assembly:{OX,RE}, supply:[{pos,itemId}…]}, dispose() }
//        ★ 시드 결정적(mulberry32) — 전 클라이언트 동일 맵
//  RemotePlayers(scene): .upsert(id,profile,state) .remove(id) .update(dt) .count
//
// ── 에이전트 B 계약 ──────────────────────────────────────
//  createNet(mode,CFG) -> adapter: .id .join(roomKey,profile) .leave()
//        .sendState(state/*스로틀 내장*/) .send(type,payload/*즉시*/)
//        .on('peer'|'msg'|'join'|'leave'|'status', cb)
//  RoomSession(adapter,myProfile): .players .isHost .myTeam .setTeam(t) .suggestTeam()
//        .start() .leave() .on('roster'|'host'|'start', cb)
//        'start' 페이로드 {seed,t0} — 로컬 1회만 발화, 호스트는 늦은 입장자에 재송신
//  Lobby(rootEl,missions): .onSubmit(cb(form)) .showWaiting({roomLabel,missionName})
//        .setRoster(players,{myId}) .setHost(b) .onTeamPick(cb) .onStart(cb) .onLeave(cb)
//        .countdown(n)->Promise .showError(m) .backToLogin() .hide()
//  HUD(rootEl): .setStatus(s) .setTimer(sec|null) .setScores({OX,RE}) .setObjective(t)
//        .setRoster(ps) .toast(m,ms?) .show() .hide() .update(dt)
//  미션 데이터: js/missions/registry.js 스키마 준수 + registerMission()
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { TPSControls } from './core/tps.js';
import { buildVoxelCharacter } from './core/voxel.js';
import { buildArena } from './world/arena.js';
import { RemotePlayers } from './world/players.js';
import { createNet } from './net/net.js';
import * as CFG from './net/config.js';
import { RoomSession } from './net/room.js';
import { Lobby } from './ui/lobby.js';
import { HUD } from './ui/hud.js';
import { getMission, listMissions } from './missions/registry.js';
// 미션 등록 (side-effect import) — 새 미션은 여기에 한 줄 추가
import './missions/idealgas.js';
import './missions/raoult.js';

const $ = (s) => document.querySelector(s);
export const TEAM_COLOR = { OX: 0xff8a3d, RE: 0x00b4d8 };
export const TEAM_NAME = { OX: '산화팀', RE: '환원팀' };

// ───────────────────────── 로비 ─────────────────────────
const lobby = new Lobby($('#lobby'), listMissions());
const hud = new HUD($('#hud'));

let joined = false;      // 중복 입장 방지
let matchStarted = false;

lobby.onSubmit(async (form) => {
  // form: { grade, cls, name, missionId, roomNo, solo }
  if (joined) return;
  joined = true;
  try {
    if (form.solo) await startSolo(form);
    else await joinRoom(form);
  } catch (err) {
    console.error('[arena] 입장 실패', err);
    joined = false;
    lobby.showError('접속에 실패했어요. 잠시 후 다시 시도하거나 "혼자 연습"을 눌러 주세요.');
  }
});

function netMode() {
  const q = new URLSearchParams(location.search).get('net');
  return (q === 'solo' || q === 'supabase' || q === 'wsrelay') ? q : CFG.DEFAULT_MODE;
}

function makeProfile(form) {
  return {
    name: form.name,
    cls: `${form.grade}학년 ${form.cls}반`,
    team: null,
    joinTs: Date.now(),
  };
}

// ─────────────────────── 멀티 입장 ───────────────────────
async function joinRoom(form) {
  const profile = makeProfile(form);
  const roomKey = `arena:${form.grade}-${form.cls}-${form.roomNo}-${form.missionId}`;
  const mission = getMission(form.missionId);

  let adapter;
  try {
    adapter = await createNet(netMode(), CFG);
    await adapter.join(roomKey, profile);
  } catch (err) {
    console.warn('[arena] 네트워크 실패 → 솔로 폴백', err);
    lobby.showError('온라인 접속 실패 — 오프라인 연습 모드로 시작합니다.');
    await startSolo(form);
    return;
  }

  const room = new RoomSession(adapter, profile);
  room.setTeam(room.suggestTeam());

  lobby.showWaiting({
    roomLabel: `${form.grade}학년 ${form.cls}반 · ${form.roomNo}번 방`,
    missionName: mission.name,
  });

  room.on('roster', (players) => lobby.setRoster(players, { myId: adapter.id }));
  room.on('host', ({ me }) => lobby.setHost(me));
  lobby.onTeamPick((t) => room.setTeam(t));
  lobby.onStart(() => room.start());
  lobby.onLeave(async () => {
    try { await room.leave(); } catch { /* 무시 */ }
    location.reload(); // 상태 초기화는 리로드가 가장 안전
  });

  room.on('start', ({ seed, t0 }) => {
    startMatch({
      mission, adapter, seed, t0,
      profile, team: room.myTeam || 'OX',
      roster: room.players,
    });
  });
}

// ─────────────────────── 솔로 연습 ───────────────────────
async function startSolo(form) {
  const profile = makeProfile(form);
  const mission = getMission(form.missionId);
  const adapter = await createNet('solo', CFG);
  await adapter.join('solo', profile);
  await startMatch({
    mission, adapter,
    seed: (Math.random() * 1e9) | 0, // 솔로는 공유 불필요
    t0: Date.now(),
    profile, team: 'OX',
    roster: [{ id: adapter.id, profile, isHost: true, me: true }],
  });
}

// ─────────────────────── 매치 시작 ───────────────────────
async function startMatch({ mission, adapter, seed, t0, profile, team, roster }) {
  if (matchStarted) return;
  matchStarted = true;

  await lobby.countdown(3);
  lobby.hide();
  $('#loading').classList.remove('hidden');

  // 1) 엔진·월드
  const engine = new Engine($('#gl'));
  engine.setQuality('tablet');
  const arena = buildArena(THREE, mission, seed);
  engine.scene.add(arena.group);

  // 2) 내 캐릭터 + 조작
  const controls = new TPSControls(engine, {
    joystickZone: $('#joystick-zone'),
    lookZone: $('#look-zone'),
    canvas: $('#gl'),
  });
  controls.setColliders(arena.colliders);
  controls.setBounds(arena.bounds);

  const chr = buildVoxelCharacter(THREE, {
    teamColor: TEAM_COLOR[team], name: profile.name, seed,
  });
  controls.object.add(chr.group);

  // 스폰: 같은 팀 로스터에서 내 순번(id 사전순) → 겹치지 않는 스폰 포인트
  const mates = roster.filter((p) => (p.profile.team || 'OX') === team)
                      .map((p) => p.id).sort();
  const idx = Math.max(0, mates.indexOf(adapter.id)) % arena.spawns[team].length;
  const sp = arena.spawns[team][idx];
  controls.teleport(sp.pos, sp.ry);

  // 3) 원격 플레이어
  // ★ 팀 정보 보강(Fable 검수 수정): presence/join의 profile은 입장 시점 것(team:null)이라
  //   'peer' 이벤트만으로는 팀색을 알 수 없다. 팀 확정치는 msg 'team'을 병합해 온
  //   RoomSession 로스터가 원본이므로, 매치 시작 시점 로스터로 id→team 맵을 만들어 병합한다.
  const rp = new RemotePlayers(engine.scene);
  const teamById = new Map((roster || []).map((p) => [p.id, p.profile && p.profile.team]));
  adapter.on('peer', ({ id, profile: pf, state }) => {
    if (id === adapter.id || !state) return;
    const merged = { ...(pf || {}) };
    if (!merged.team && teamById.has(id)) merged.team = teamById.get(id);
    rp.upsert(id, merged, state);
  });
  adapter.on('leave', ({ id }) => rp.remove(id));

  // 4) HUD
  hud.show();
  hud.setObjective(`[${mission.name}] ${mission.objective}`);
  hud.setScores({ OX: 0, RE: 0 });
  hud.setRoster(roster);
  adapter.on('status', (s) => hud.setStatus(s));

  const endAt = t0 + (mission.timeLimitSec || CFG.MATCH_SECONDS) * 1000;
  let timeUp = false;

  // 5) 루프
  engine.onUpdate((dt) => {
    controls.update(dt);
    chr.update(dt, controls.speedRatio);
    rp.update(dt);
    hud.update(dt);
    adapter.sendState(controls.getNetState());

    const remain = Math.max(0, (endAt - Date.now()) / 1000);
    hud.setTimer(remain);
    if (remain <= 0 && !timeUp) {
      timeUp = true;
      hud.toast('⏱ 제한시간 종료! (점수 판정·전투·조립은 Phase B에서 열립니다)', 5000);
    }
  });

  engine.start();
  $('#loading').classList.add('hidden');
  hud.toast(`${TEAM_NAME[team]} 소속으로 참전! 부품 상자를 정찰해 보세요.`, 3500);
}
