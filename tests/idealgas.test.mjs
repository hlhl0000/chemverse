// ═══════════════════════════════════════════════════════════
// 이상기체 모델 검증 — node 단독 실행: node tests/idealgas.test.mjs
// three 의존 없음(js/experiments/idealgas/model.js는 순수 JS).
// ═══════════════════════════════════════════════════════════
import { createIdealGasModel, balloonScaleAtAltitude } from '../js/experiments/idealgas/model.js';

let fails = 0;
function check(cond, msg) {
  console.assert(cond, msg);
  if (!cond) {
    fails++;
    console.error('  x FAIL:', msg);
  } else {
    console.log('  ok', msg);
  }
}

// (1) 등적(locked) 가열: P/T 비 일정 (+-2%)
{
  console.log('(1) 등적(locked) 가열 -> P/T 일정');
  const m = createIdealGasModel();
  m.inputs.pistonMode = 'locked';
  m.inputs.heaterPower = 1;
  m.inputs.valveOpen = false;
  const ratio0 = m.outputs().P / m.outputs().T;
  for (let i = 0; i < 300; i++) m.step(0.05);
  const o1 = m.outputs();
  const ratio1 = o1.P / o1.T;
  const relErr = Math.abs(ratio1 - ratio0) / ratio0;
  check(relErr < 0.02, `P/T 비 유지 (오차 ${(relErr * 100).toFixed(3)}%, T=${o1.T.toFixed(1)}K)`);
}

// (2) 등온 압축(free, T 유지): P*V 일정 (+-2%)
{
  console.log('(2) 등온 압축(free, T=300 유지) -> P*V 일정');
  const m = createIdealGasModel();
  m.inputs.pistonMode = 'free';
  m.inputs.heaterPower = 0; // 300K에서 자연냉각 평형 유지
  m.inputs.valveOpen = false;
  for (let i = 0; i < 50; i++) m.step(0.05); // 안정화
  const o0 = m.outputs();
  const pv0 = o0.P * o0.V;
  m.inputs.pistonPush = -1; // 압축
  for (let i = 0; i < 80; i++) m.step(0.02);
  m.inputs.pistonPush = 0;
  for (let i = 0; i < 20; i++) m.step(0.02);
  const o1 = m.outputs();
  const pv1 = o1.P * o1.V;
  const relErr = Math.abs(pv1 - pv0) / pv0;
  check(relErr < 0.02, `P*V 유지 (오차 ${(relErr * 100).toFixed(3)}%, T=${o1.T.toFixed(2)}K, V:${o0.V.toFixed(2)}->${o1.V.toFixed(2)}L)`);
}

// (3) 등압(weight) 가열: V/T 일정 (+-3%)
//
// 주의: 실제 UI에서 weightMass는 0~5kg로 제한되고 피스톤 면적은 0.01m^2로
// 고정되어 있어 P_ext는 최대 약 106.2kPa밖에 되지 않는다. 기본 상태(n=0.5mol,
// T>=300K)에서는 V=10L(최대)일 때조차 내부압이 약 124.7kPa로 이보다 높아,
// "실사용 범위"의 추만으로는 평형 부피가 실린더 한계(1~10L) 안에 잡히지 않고
// 피스톤이 항상 상한에 밀착한다(물리적으로 타당한 결과 - 추가 너무 가벼움).
// 이 테스트는 스프링 수렴 로직 자체(등압 추종)가 올바른 방향/정량으로
// 동작하는지 검증하기 위해, 평형이 실린더 범위 안에 들어오는 무게값을 사용한다
// (모델은 weightMass 상한을 강제하지 않음 - UI 슬라이더만 0~5kg로 제한).
{
  console.log('(3) 등압(weight) 가열 -> V/T 일정');
  const m = createIdealGasModel();
  m.inputs.pistonMode = 'weight';
  m.inputs.weightMass = 300; // 평형 V가 1~10L 안에 들어오도록 스프링 물리 검증용으로 크게 설정
  m.inputs.valveOpen = false;
  m.inputs.heaterPower = 0.3; // 완만한 가열 -> 스프링이 준정적으로 추종
  for (let i = 0; i < 300; i++) m.step(0.02); // 초기 스프링 정착 대기
  const o0 = m.outputs();
  const ratio0 = o0.V / o0.T;
  for (let i = 0; i < 400; i++) m.step(0.02);
  const o1 = m.outputs();
  const ratio1 = o1.V / o1.T;
  const relErr = Math.abs(ratio1 - ratio0) / ratio0;
  check(o1.V > 1.01 && o1.V < 9.99, `평형 V가 실린더 범위 안(레일에 안 걸림) (${o1.V.toFixed(3)}L)`);
  check(relErr < 0.03, `V/T 유지 (오차 ${(relErr * 100).toFixed(3)}%, T:${o0.T.toFixed(1)}->${o1.T.toFixed(1)}K, P:${o0.P.toFixed(2)}->${o1.P.toFixed(2)}kPa)`);
}

// (3-b) 실사용 범위(weightMass<=5kg) 경계 거동: 레일에 걸려도 발산하지 않아야 함
{
  console.log('(3-b) 실사용 weightMass(<=5kg) 경계 거동 -> 발산 없이 V_MAX에 안정적으로 정지');
  const m = createIdealGasModel();
  m.inputs.pistonMode = 'weight';
  m.inputs.weightMass = 5;
  m.inputs.valveOpen = false;
  m.inputs.heaterPower = 0.5;
  for (let i = 0; i < 500; i++) m.step(0.02);
  const o = m.outputs();
  check(Number.isFinite(o.V) && Number.isFinite(o.P), '실사용 범위에서도 값 발산 없음');
  check(o.V >= 1 && o.V <= 10, `V 클램프 유지 (${o.V.toFixed(3)})`);
}

// (4) 1000스텝 후 모든 값 유한/범위 내 (극단적 입력 변동 포함)
{
  console.log('(4) 1000스텝 랜덤/극단 입력 -> 발산 없음');
  const m = createIdealGasModel();
  const modes = ['free', 'locked', 'weight'];
  for (let i = 0; i < 1000; i++) {
    m.inputs.heaterPower = (Math.sin(i * 0.1) + 1) / 2;
    m.inputs.valveOpen = i % 7 === 0;
    m.inputs.pistonMode = modes[i % modes.length];
    m.inputs.pistonPush = Math.sin(i * 0.37);
    m.inputs.weightMass = 2.5 + 2 * Math.sin(i * 0.05);
    m.step(0.033);
  }
  const o = m.outputs();
  check(
    Number.isFinite(o.P) && Number.isFinite(o.V) && Number.isFinite(o.n) &&
    Number.isFinite(o.T) && Number.isFinite(o.meanSpeed),
    `1000스텝 후 모든 값 유한 (P=${o.P.toFixed(2)}, V=${o.V.toFixed(2)}, n=${o.n.toFixed(2)}, T=${o.T.toFixed(2)}, v=${o.meanSpeed.toFixed(1)})`
  );
  check(o.V >= 1 && o.V <= 10, `V 범위 내 [1,10] (${o.V.toFixed(3)})`);
  check(o.n >= 0 && o.n <= 2.0, `n 범위 내 [0,2.0] (${o.n.toFixed(3)})`);
  check(o.T >= 100 && o.T <= 1000, `T 범위 내 [100,1000] (${o.T.toFixed(2)})`);
  check(o.P >= 0, `P 비음수 (${o.P.toFixed(3)})`);
}

// (5) balloonScaleAtAltitude
{
  console.log('(5) balloonScaleAtAltitude(고도별 풍선 부피 배율)');
  const s0 = balloonScaleAtAltitude(0);
  check(Math.abs(s0 - 1) < 1e-9, `balloonScaleAtAltitude(0) == 1 (${s0})`);
  const s3000 = balloonScaleAtAltitude(3000);
  check(s3000 > 1.4, `balloonScaleAtAltitude(3000) > 1.4 (${s3000.toFixed(4)})`);
}

console.log('-----------------------------');
if (fails > 0) {
  console.error(`${fails}개 테스트 실패`);
  process.exit(1);
} else {
  console.log('ALL PASS');
}
