// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA 부트스트랩·통합 허브 — 소유: Fable (하위 에이전트 수정 금지)
//
// 이 파일이 곧 "계약"이다. 임포트되는 모든 모듈은 여기서 호출하는 시그니처를
// 정확히 구현해야 한다. (Phase A 계약: docs/AGENT_BRIEF_ARENA.md /
//  Phase B 계약: docs/AGENT_BRIEF_PHASE_B.md — 프로토콜·스키마·무기 수치 동결)
//
// ── Phase A 계약 요약 ────────────────────────────────────
//  Engine / TPSControls(+getAimRay) / buildVoxelCharacter(+setHeld) /
//  buildArena(+crates, +setAssembled) / RemotePlayers / createNet / RoomSession /
//  Lobby / HUD(Phase B 메서드 확장) — 상세는 각 브리프 문서.
//
// ── Phase B 계약 요약 ────────────────────────────────────
//  GameClient({adapter,myId,myTeam,mission,seed}): try*·reportHit·게터·on(ev)·lastSnap
//  Referee({adapter,mission,seed,roster,cfg,fromSnap}): start(t0)·stop() — 호스트만
//  Combat({colliders,getMyPos,myId}): fire→{sid,w,o,d}|null, onRemoteShot,
//        update(dt)→{projectiles,myHits,impacts}, ammo()→{id,mag,cur,reloading}
//  ItemManager(scene,arenaHandle,THREE): crateTaken/addDrop/removeDrop/nearestPickup
//  Effects(scene,THREE): syncProjectiles/splash/burst/respawnRing
//  ev 필드(수신): pickup{pid,itemId,crateId?,dropId?,inv} deposit{pid,team,itemId,prog[]}
//        complete{team} quiz{team,correct,lockUntil,scores} kill{victim,shooter,drop,scores,pers}
//        respawn{pid} score{scores,pers} end{winner,reason,scores,pers}
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { TPSControls } from './core/tps.js';
import { buildVoxelCharacter } from './core/voxel.js';
import { buildArena } from './world/arena.js';
import { RemotePlayers } from './world/players.js';
import { ItemManager, makeWeaponMesh, itemName, isWeaponItem } from './world/items.js';
import { Effects } from './world/effects.js';
import { createNet } from './net/net.js';
import * as CFG from './net/config.js';
import { RoomSession } from './net/room.js';
import { GameClient } from './game/state.js';
import { Referee } from './game/referee.js';
import { Combat, WEAPONS } from './game/combat.js';
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
      mission, adapter, seed, t0, room,
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
    mission, adapter, room: null,
    seed: (Math.random() * 1e9) | 0, // 솔로는 공유 불필요
    t0: Date.now(),
    profile, team: 'OX',
    roster: [{ id: adapter.id, profile, isHost: true, me: true }],
  });
}

// ─────────────────────── 매치 시작 ───────────────────────
async function startMatch({ mission, adapter, seed, t0, room, profile, team, roster }) {
  if (matchStarted) return;
  matchStarted = true;

  await lobby.countdown(3);
  lobby.hide();
  $('#loading').classList.remove('hidden');

  const myId = adapter.id;
  const nameById = new Map(roster.map((p) => [p.id, p.profile.name]));
  const partsTotal = (mission.parts || []).length;
  const refereeCfg = {
    timeLimitSec: mission.timeLimitSec || CFG.MATCH_SECONDS,
    wrongPenalty: mission.wrongPenalty ?? 20,
    retryLockSec: mission.retryLockSec ?? 30,
  };

  // 1) 엔진·월드
  const engine = new Engine($('#gl'));
  engine.setQuality('tablet');
  const arena = buildArena(THREE, mission, seed);
  engine.scene.add(arena.group);
  if (arena.env) { // G-1 테마: 안개·배경색을 지평선(노을) 색과 일치
    engine.scene.fog.color.set(arena.env.fogColor);
    engine.scene.background.set(arena.env.fogColor);
  }
  const items = new ItemManager(engine.scene, arena, THREE);
  const effects = new Effects(engine.scene, THREE);

  // 2) 내 캐릭터 + 조작
  const controls = new TPSControls(engine, {
    joystickZone: $('#joystick-zone'),
    lookZone: $('#look-zone'),
    canvas: $('#gl'),
  });
  controls.setColliders(arena.colliders);
  controls.setBounds(arena.bounds);
  controls.setFirstPerson(true); // 매치 중 상시 1인칭(입장~제한시간 종료, 사용자 결정)

  const chr = buildVoxelCharacter(THREE, {
    teamColor: TEAM_COLOR[team], name: profile.name, seed,
  });
  controls.object.add(chr.group);

  // 1인칭 뷰모델: 카메라 우하단에 현재 무기 실물 메쉬 부착
  engine.scene.add(engine.camera); // 카메라 자식(뷰모델) 렌더를 위해 씬에 등록
  const vmSlot = new THREE.Group();
  vmSlot.position.set(0.26, -0.22, -0.5);
  vmSlot.rotation.set(-0.05, 0, 0);
  engine.camera.add(vmSlot);

  // 스폰: 같은 팀 로스터에서 내 순번(id 사전순)
  const mates = roster.filter((p) => (p.profile.team || 'OX') === team)
                      .map((p) => p.id).sort();
  const idx = Math.max(0, mates.indexOf(myId)) % arena.spawns[team].length;
  const sp = arena.spawns[team][idx];
  controls.teleport(sp.pos, sp.ry);

  // 3) 원격 플레이어 (팀 병합: 로스터가 팀 확정치의 원본)
  const rp = new RemotePlayers(engine.scene);
  const teamById = new Map(roster.map((p) => [p.id, p.profile && p.profile.team]));
  adapter.on('peer', ({ id, profile: pf, state }) => {
    if (id === myId || !state) return;
    const merged = { ...(pf || {}) };
    if (!merged.team && teamById.has(id)) merged.team = teamById.get(id);
    rp.upsert(id, merged, state);
  });
  adapter.on('leave', ({ id }) => rp.remove(id));

  // 4) 게임 상태(GameClient) + 심판(호스트) + 전투
  const gc = new GameClient({ adapter, myId, myTeam: team, mission, seed });
  let referee = null;
  function startReferee(fromSnap) {
    if (referee || gc.ended()) return;
    referee = new Referee({
      adapter, mission, seed, cfg: refereeCfg, fromSnap: fromSnap || null,
      roster: room ? room.players : roster,
    });
    referee.start(t0);
  }
  if (!room || room.isHost) startReferee(null);
  if (room) room.on('host', ({ me }) => { if (me && matchStarted) startReferee(gc.lastSnap); });

  const combat = new Combat({
    colliders: arena.colliders,
    getMyPos: () => controls.getNetState().p,
    myId,
  });
  adapter.on('msg', ({ id, type, payload }) => {
    if (type === 'shot' && id !== myId) combat.onRemoteShot({ ...payload, shooter: id });
  });

  // 5) HUD 초기화 + 무기 UI
  hud.show();
  hud.setObjective(`[${mission.name}] ${mission.objective}`);
  hud.setScores({ OX: 0, RE: 0 });
  hud.setRoster(roster);
  hud.setGauge(100);
  hud.setInventory([]);
  adapter.on('status', (s) => hud.setStatus(s));

  let usingPicked = true;   // 획득 무기 ↔ 기본 스포이트 토글
  function currentWeaponId() {
    const picked = gc.myWeapon();
    return usingPicked ? picked : 'spoit';
  }
  function applyWeapon() {
    const w = currentWeaponId();
    combat.setWeapon(w);
    chr.setHeld(makeWeaponMesh(THREE, w));       // 3인칭·원격 시점용(캐릭터 손)
    while (vmSlot.children.length > 0) vmSlot.remove(vmSlot.children[0]);
    vmSlot.add(makeWeaponMesh(THREE, w));        // 1인칭 뷰모델(공유 캐시 — dispose 금지)
    refreshWeaponHud();
  }
  function refreshWeaponHud() {
    const a = combat.ammo();
    hud.setWeapon({ id: a.id, name: WEAPONS[a.id].name, ammo: a.cur, mag: a.mag, reloading: a.reloading });
  }
  applyWeapon();

  // 6) 전투·게임 로컬 상태
  let myDead = false;
  let deadUntil = 0;
  let matchEnded = false;
  let quizLockUntil = 0;
  const knownDrops = new Set();

  hud.onFire(() => {
    if (myDead || matchEnded) return;
    const ray = controls.getAimRay();
    const shot = combat.fire(ray.origin, ray.dir);
    if (shot) { adapter.send('shot', shot); refreshWeaponHud(); }
  });
  hud.onSwitchWeapon(() => {
    if (gc.myWeapon() === 'spoit') return; // 획득 무기 없으면 무의미
    usingPicked = !usingPicked;
    applyWeapon();
  });

  function openQuiz() {
    const secret = mission.makeSecret(seed);
    hud.showQuiz({
      prompt: mission.quiz.prompt,
      values: { w: secret.w_g, V: secret.V_L, T: secret.T_K, P: secret.P_kPa },
      options: mission.quiz.options,
      lockRemainSec: Math.max(0, (quizLockUntil - Date.now()) / 1000),
    }, (answerId) => gc.tryQuiz(answerId));
  }

  // 7) GameClient 이벤트 → 시각·HUD 반영
  gc.on('pickup', (e) => {
    if (e.crateId) items.crateTaken(e.crateId);
    if (e.dropId) { items.removeDrop(e.dropId); knownDrops.delete(e.dropId); }
    if (e.pid === myId) {
      hud.toast(`${itemName(e.itemId)} 획득! +10`);
      hud.setInventory(gc.myInv().map((id) => ({ id, name: itemName(id) })));
      if (isWeaponItem(e.itemId)) { usingPicked = true; applyWeapon(); }
    }
  });
  gc.on('deposit', (e) => {
    arena.setAssembled(e.team, e.prog);
    if (e.pid === myId) {
      hud.toast(`${itemName(e.itemId)} 장착! +15`);
      hud.setInventory(gc.myInv().map((id) => ({ id, name: itemName(id) })));
    }
  });
  gc.on('complete', (e) => {
    hud.toast(`⚗ ${TEAM_NAME[e.team]} 장치 완성! +30`, 3000);
    if (e.team === team) hud.showQuizButton(openQuiz);
  });
  gc.on('quiz', (e) => {
    if (e.team !== team) return;
    if (!e.correct) {
      quizLockUntil = e.lockUntil || 0;
      hud.closeQuiz();
      hud.toast('❌ 오답! -20점 · 30초 후 재도전', 3000);
    }
  });
  gc.on('hp', (e) => { if (e.pid === myId) hud.setGauge(e.gauge); });
  gc.on('kill', (e) => {
    const a = nameById.get(e.shooter) || '?';
    const v = nameById.get(e.victim) || '?';
    hud.killfeed(`${a} ⚗→ ${v} · 연구윤리 위반 -5`);
    if (e.drop && !knownDrops.has(e.drop.id)) {
      items.addDrop(e.drop.id, e.drop.itemId, e.drop.pos);
      knownDrops.add(e.drop.id);
    }
    if (e.victim === myId) {
      myDead = true;
      deadUntil = Date.now() + CFG.RESPAWN_SECONDS * 1000;
      hud.setInventory(gc.myInv().map((id) => ({ id, name: itemName(id) })));
    }
  });
  gc.on('respawn', (e) => {
    if (e.pid !== myId) return;
    myDead = false;
    hud.showRespawn(null);
    hud.setGauge(100);
    controls.teleport(sp.pos, sp.ry);
    effects.respawnRing(sp.pos, TEAM_COLOR[team]);
  });
  gc.on('score', (e) => hud.setScores(e.scores));
  gc.on('end', (e) => {
    if (matchEnded) return;
    matchEnded = true;
    controls.setFirstPerson(false); // 매치 종료 → 3인칭 복귀(결과 화면 배경)
    if (referee) referee.stop();
    hud.closeQuiz();
    hud.showRespawn(null);
    hud.showResult({
      winner: e.winner, reason: e.reason, scores: e.scores, pers: e.pers,
      myTeam: team, myId,
    }, () => location.reload());
  });
  gc.on('snap', (st) => {
    hud.setScores(st.scores);
    for (const [cid, takenBy] of Object.entries(st.crates || {})) {
      if (takenBy) items.crateTaken(cid);
    }
    for (const d of st.drops || []) {
      if (!knownDrops.has(d.id)) { items.addDrop(d.id, d.itemId, d.pos); knownDrops.add(d.id); }
    }
    for (const t of ['OX', 'RE']) arena.setAssembled(t, (st.prog && st.prog[t]) || []);
    if ((st.quizLock) && st.quizLock[team]) quizLockUntil = st.quizLock[team];
    if (st.prog && (st.prog[team] || []).length >= partsTotal && !matchEnded) {
      hud.showQuizButton(openQuiz);
    }
  });

  // 8) 루프
  const endAtLocal = t0 + refereeCfg.timeLimitSec * 1000;
  let pickupAcc = 0, depositAcc = 0, weapHudAcc = 0;
  const asmZone = arena.zones.assembly[team];

  engine.onUpdate((dt) => {
    if (!myDead) controls.update(dt);
    chr.update(dt, myDead ? 0 : controls.speedRatio);
    // 1인칭이면 내 캐릭터 숨김 + 뷰모델 표시(전환 블렌드 기준 0.6)
    const fpAmt = controls.fpAmount();
    chr.group.visible = fpAmt < 0.6;
    vmSlot.visible = fpAmt >= 0.6 && !myDead && !matchEnded;
    rp.update(dt);
    items.update(dt);
    hud.update(dt);
    adapter.sendState(controls.getNetState());

    // 전투 시뮬 → 이펙트·피격 보고
    const res = combat.update(dt);
    effects.syncProjectiles(res.projectiles);
    for (const im of res.impacts) {
      if (im.w === 'flask') effects.burst(im.pos);
      else effects.splash(im.pos);
    }
    if (!myDead && !matchEnded) {
      for (const h of res.myHits) gc.reportHit(h.sid, h.shooter, h.w, h.pos);
    }
    effects.update(dt);

    // 자동 픽업(0.25s) · 자동 장착(0.5s)
    if (!myDead && !matchEnded) {
      pickupAcc += dt;
      if (pickupAcc >= 0.25) {
        pickupAcc = 0;
        const me = controls.object.position;
        const cand = items.nearestPickup([me.x, me.y, me.z], 2.0);
        hud.setPickupHint(cand ? cand.name : null);
        if (cand) gc.tryPickup(cand.kind, cand.id);

        const dx = me.x - asmZone.pos[0], dz = me.z - asmZone.pos[2];
        const nearAsm = Math.hypot(dx, dz) <= (asmZone.radius + 0.5);
        hud.setDepositHint(nearAsm && gc.myInv().length > 0);
        depositAcc += 0.25;
        if (nearAsm && gc.myInv().length > 0 && depositAcc >= 0.5) {
          depositAcc = 0;
          gc.tryDeposit();
        }
      }
    }

    // 리스폰 카운트다운 표시
    if (myDead) hud.showRespawn(Math.max(1, Math.ceil((deadUntil - Date.now()) / 1000)));

    // 무기 HUD(탄·재장전) 주기 갱신
    weapHudAcc += dt;
    if (weapHudAcc >= 0.2) { weapHudAcc = 0; refreshWeaponHud(); }

    // 타이머 표시(판정은 심판이 ev end로)
    hud.setTimer(Math.max(0, (endAtLocal - Date.now()) / 1000));
  });

  engine.start();
  $('#loading').classList.add('hidden');
  hud.toast(`${TEAM_NAME[team]} 소속으로 참전! 부품 상자를 정찰해 보세요.`, 3500);
}
