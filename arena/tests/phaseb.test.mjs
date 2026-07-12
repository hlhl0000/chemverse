// ═══════════════════════════════════════════════════════════
// ChemVerse ARENA — Phase B 자가 검증 스크립트 (에이전트 B)
// node --experimental-vm-modules 불필요(순수 ESM). 실행: node tests/phaseb.test.mjs
// 검증 범위: referee 상태 전이(픽업->장착->완성->퀴즈 정답/오답), 킬->드랍->리스폰,
// 시간 종료 시 점수 비교. GameClient의 호스트 로컬 루프백(adapter.__cvLocalReq/Ev)도 함께 검증.
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { Referee } from '../js/game/referee.js';
import { GameClient } from '../js/game/state.js';
import { rollCrates } from '../js/game/loot.js';
import { getMission } from '../js/missions/registry.js';
import '../js/missions/idealgas.js'; // registerMission 부수효과

let pass = 0;
function ok(name) { pass++; console.log('  OK ' + name); }

// -- 가짜 net.js v2 어댑터 버스: send는 자신을 제외한 다른 어댑터의 'msg' 리스너에 전달 --
function makeBus() {
  const adapters = new Map();
  function create(id) {
    const listeners = { msg: [] };
    const adapter = {
      id,
      on(evt, cb) {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(cb);
        return () => {
          const a = listeners[evt];
          const i = a.indexOf(cb);
          if (i >= 0) a.splice(i, 1);
        };
      },
      send(type, payload) {
        // self:false -- 자기 자신에게는 전달하지 않는다(실제 어댑터와 동일 제약).
        for (const [otherId, other] of adapters) {
          if (otherId === id) continue;
          (other._listeners.msg || []).forEach((cb) => cb({ id, type, payload }));
        }
      },
    };
    adapter._listeners = listeners;
    adapters.set(id, adapter);
    return adapter;
  }
  return { create };
}

async function scenarioPickupDepositQuiz() {
  console.log('\n[시나리오 1] 픽업 -> 장착 -> 완성 -> 퀴즈 오답 -> 정답');
  const mission = getMission('idealgas');
  const seed = 12345;
  const bus = makeBus();
  const hostAdapter = bus.create('host');
  const peerAdapter = bus.create('peer');
  const roster = [
    { id: 'host', profile: { team: 'OX' } },
    { id: 'peer', profile: { team: 'RE' } },
  ];

  const referee = new Referee({ adapter: hostAdapter, mission, seed, roster, cfg: {}, fromSnap: null });
  const hostGC = new GameClient({ adapter: hostAdapter, myId: 'host', myTeam: 'OX', mission, seed });
  const peerGC = new GameClient({ adapter: peerAdapter, myId: 'peer', myTeam: 'RE', mission, seed });

  referee.start(Date.now());
  ok('Referee.start() 후 초기 snap 브로드캐스트(루프백 포함) 정상');
  assert.equal(hostGC.lastSnap != null, true);
  assert.equal(peerGC.lastSnap != null, true);
  ok('host/peer 양쪽 GameClient 모두 초기 snap 수신(호스트 로컬 루프백 검증)');

  // host가 자기 팀(OX) 부품 6종을 전부 크레이트에서 직접 집는다.
  const crates = rollCrates(mission, seed);
  const partIds = mission.parts.map((p) => p.id);
  const taken = new Set();
  for (const partId of partIds) {
    const crate = crates.find((c) => c.kind === 'part' && c.itemId === partId && !taken.has(c.id));
    assert.ok(crate, 'crate exists for ' + partId);
    taken.add(crate.id);
    hostGC.tryPickup('crate', crate.id);
    if (hostGC.myInv().length >= 2) hostGC.tryDeposit();
  }
  // 인벤에 남은 것 마저 장착
  while (hostGC.myInv().length > 0) hostGC.tryDeposit();

  assert.deepEqual([...referee.prog.OX].sort(), [...partIds].sort());
  ok('부품 6종 전부 조립대(OX)에 장착 완료(referee.prog.OX)');
  assert.equal(hostGC.teamProg('OX').length, partIds.length);
  ok('GameClient(host)도 deposit ev로 팀 진행도 동기화됨');

  // 오답 제출
  const secret = mission.makeSecret(seed);
  const correctId = mission.quiz.answerId(secret);
  const wrongId = mission.quiz.options.find((o) => o.id !== correctId).id;
  const scoreBefore = referee.scores.OX;
  hostGC.tryQuiz(wrongId);
  assert.equal(referee.scores.OX, scoreBefore - mission.wrongPenalty);
  assert.ok(referee.quizLock.OX > Date.now());
  ok('오답 시 -20점 및 30초 잠금 적용');
  assert.ok(hostGC.state.quizLock.OX > Date.now());
  ok('GameClient에도 quizLock 반영');

  // 잠금 중 재시도 -> 거부(점수 변화 없음)
  const scoreDuringLock = referee.scores.OX;
  hostGC.tryQuiz(correctId);
  assert.equal(referee.scores.OX, scoreDuringLock);
  assert.equal(referee.ended, null);
  ok('잠금 중 재시도는 거부되어 점수/종료 상태 불변');

  // 잠금 해제 후 정답
  referee.quizLock.OX = 0; // 테스트 편의상 즉시 해제(실제로는 30초 대기)
  hostGC.tryQuiz(correctId);
  assert.ok(referee.ended && referee.ended.winner === 'OX' && referee.ended.reason === 'quiz');
  ok('정답 제출 시 즉시 승리 처리(ended.winner=OX, reason=quiz)');
  assert.ok(hostGC.ended() && hostGC.ended().winner === 'OX');
  ok('GameClient에도 end ev 반영');
  assert.ok(peerGC.ended() && peerGC.ended().winner === 'OX');
  ok('원격(peer) GameClient도 end ev 수신(네트워크 브로드캐스트 검증)');

  referee.stop();
}

async function scenarioKillDropRespawn() {
  console.log('\n[시나리오 2] 킬 -> 드랍 -> 리스폰');
  const mission = getMission('idealgas');
  const seed = 777;
  const bus = makeBus();
  const hostAdapter = bus.create('host');
  const peerAdapter = bus.create('peer');
  const roster = [
    { id: 'host', profile: { team: 'OX' } },
    { id: 'peer', profile: { team: 'RE' } },
  ];
  const referee = new Referee({ adapter: hostAdapter, mission, seed, roster, cfg: {} });
  const hostGC = new GameClient({ adapter: hostAdapter, myId: 'host', myTeam: 'OX', mission, seed });
  const peerGC = new GameClient({ adapter: peerAdapter, myId: 'peer', myTeam: 'RE', mission, seed });
  referee.start(Date.now());

  // peer가 부품 하나를 인벤에 넣어둔다(킬 드랍 확인용)
  const crates = rollCrates(mission, seed);
  const crate = crates.find((c) => c.kind === 'part');
  peerGC.tryPickup('crate', crate.id);
  assert.equal(peerGC.myInv().length, 1);
  ok('peer 사전 부품 1개 보유');

  const persBefore = referee.pers.host || 0;
  // 피격 판정은 "피해자 자가 판정" 규약이므로 맞은 쪽(peer)의 GameClient가
  // req:hit을 보고한다. host가 peer를 buret(40dmg)로 세 번 맞혀
  // gauge 100->60->20->0 킬 확정(테스트 편의상 반복 타격).
  peerGC.reportHit('host:0', 'host', 'buret', [1, 1, 1]);
  assert.equal(referee.alive.peer, true);
  assert.equal(referee.gauge.peer, 60);
  peerGC.reportHit('host:1', 'host', 'buret', [1, 1, 1]);
  assert.equal(referee.gauge.peer, 20);
  peerGC.reportHit('host:2', 'host', 'buret', [1, 1, 1]);
  assert.equal(referee.alive.peer, false);
  assert.equal(referee.gauge.peer, 0);
  ok('3연속 피격으로 gauge 100->60->20->0, alive=false 전이');

  assert.equal(referee.pers.host, persBefore - 5);
  ok('가해자(host) 개인 점수 -5(연구윤리 위반 페널티) 적용');
  assert.equal(referee.drops.length, 1);
  assert.equal(referee.drops[0].itemId, crate.itemId);
  ok('피해자(peer) 부품 1개 드랍 생성');
  assert.equal(peerGC.myAlive(), false);
  ok('peer(원격) GameClient에도 kill ev로 사망 상태 반영');

  await new Promise((res) => setTimeout(res, 3100));
  assert.equal(referee.alive.peer, true);
  assert.equal(referee.gauge.peer, 100);
  ok('3초 후 referee가 respawn 처리(alive=true, gauge=100)');
  assert.equal(peerGC.myAlive(), true);
  assert.equal(peerGC.myGauge(), 100);
  ok('peer GameClient도 respawn ev 반영');

  referee.stop();
}

async function scenarioTimeEnd() {
  console.log('\n[시나리오 3] 시간 종료 시 점수 비교');
  const mission = getMission('idealgas');
  const seed = 999;
  const bus = makeBus();
  const hostAdapter = bus.create('host');
  const roster = [
    { id: 'host', profile: { team: 'OX' } },
    { id: 'peer', profile: { team: 'RE' } },
  ];
  const referee = new Referee({ adapter: hostAdapter, mission, seed, roster, cfg: { timeLimitSec: 600 } });
  const hostGC = new GameClient({ adapter: hostAdapter, myId: 'host', myTeam: 'OX', mission, seed });
  referee.start(Date.now());

  referee.scores.OX = 40;
  referee.scores.RE = 25;
  referee._finish('time');
  assert.ok(referee.ended.winner === 'OX' && referee.ended.reason === 'time');
  ok('OX(40) > RE(25) -> OX 승리, reason=time');
  assert.ok(hostGC.ended().winner === 'OX' && hostGC.ended().reason === 'time');
  ok('GameClient에도 end(time) 반영');

  // 무승부 케이스
  const referee2 = new Referee({ adapter: bus.create('host2'), mission, seed, roster, cfg: {} });
  referee2.scores.OX = 30;
  referee2.scores.RE = 30;
  referee2._finish('time');
  assert.equal(referee2.ended.winner, null);
  ok('동점이면 winner=null(무승부)');

  referee.stop();
}

async function main() {
  console.log('ChemVerse ARENA Phase B 자가 검증 시작');
  await scenarioPickupDepositQuiz();
  await scenarioKillDropRespawn();
  await scenarioTimeEnd();
  console.log('\n전체 통과: ' + pass + '개 단언 성공');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n자가 검증 실패:', e);
  process.exit(1);
});
