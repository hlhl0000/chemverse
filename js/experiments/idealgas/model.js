// ═══════════════════════════════════════════════════════════
// 이상기체 물리 모델 — 순수 JS (three 임포트 절대 금지, node 단독 실행 가능)
// 소유: 에이전트 B
//
// 상태: n(mol), T(K), V(L), P(kPa) — P = n·R·T / V
// 단위 환산: R = 8.314 J/(mol·K) = 8.314 kPa·L/(mol·K)
//   (1 kPa = 1000 Pa = 1000 N/m² = 1000 J/m³ = 1 J/L 이므로
//    J 단위인 R을 kPa·L 단위로 다시 쓸 필요 없이 숫자 그대로 성립한다.)
//   ⇒ P[kPa] = n[mol]·R[8.314]·T[K] / V[L]
// ═══════════════════════════════════════════════════════════

const R = 8.314; // kPa·L/(mol·K)  (= J/(mol·K), 위 주석 참고)

// 피스톤 단면적 (고정값, weight 모드의 외압 계산에 사용) — 0.01 m²
const PISTON_AREA_M2 = 0.01;

// 물리 범위 클램프 상수
const N_MIN = 0, N_MAX = 2.0;       // mol
const V_MIN = 1, V_MAX = 10;        // L
const T_MIN = 100, T_MAX = 1000;    // K (heaterPower=1 정상상태 약 833K를 여유있게 수용)

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** 이상기체 P[kPa] = n·R·T / V 계산 (단위 환산 불필요, 위 주석 참고) */
function computeP(n, T, V) {
  return (n * R * T) / V;
}

/**
 * 추 무게로 인한 외부 압력. P_ext = 대기압 + 추 무게(N)/피스톤 면적/1000 [kPa]
 * (UI(weightMass +/- 컨트롤)는 0~5kg로 제한하지만, 모델 자체는 음수만 방지하고
 *  그 외에는 상한을 강제하지 않는다 — 값의 유효 범위 강제는 호출측(UI) 책임)
 */
function externalPressureFromWeight(weightMass) {
  const m = Math.max(0, weightMass);
  return 101.325 + (m * 9.8) / PISTON_AREA_M2 / 1000;
}

/**
 * 이상기체 실험 모델 팩토리.
 * registry.js 스키마의 createModel() 반환값 규격을 그대로 따른다:
 *   { inputs, step(dt), outputs() }
 */
export function createIdealGasModel() {
  // ── 내부 상태 ──────────────────────────────────────────
  const state = { n: 0.5, T: 300, V: 5.0, P: 0 };
  state.P = computeP(state.n, state.T, state.V);

  // weight 모드 임계감쇠 스프링 적분용 내부 속도 (L/s) — 외부에 노출하지 않음
  let pistonVel = 0;

  // ── 외부에서 대입하는 조작 변수 ───────────────────────
  const inputs = {
    heaterPower: 0,        // 0~1 (히터 세기; 항상 자연냉각도 동시 작동)
    valveOpen: false,      // 가스 주입 밸브
    pistonMode: 'locked',  // 'free' | 'locked' | 'weight'
    pistonPush: 0,         // -1~1 (free 모드 전용)
    weightMass: 0,         // kg, 0~5 (weight 모드 전용)
  };

  // ── 개별 물리 스텝 ────────────────────────────────────
  function stepThermal(dt) {
    // 실온 300K로 수렴하는 뉴턴 냉각 + 히터 가열
    const dT = (inputs.heaterPower * 80 - (state.T - 300) * 0.15) * dt;
    state.T = clamp(state.T + dT, T_MIN, T_MAX);
  }

  function stepValve(dt) {
    if (inputs.valveOpen) {
      state.n = clamp(state.n + 0.05 * dt, N_MIN, N_MAX);
    }
  }

  function stepPistonLocked() {
    pistonVel = 0; // 고정 시 스프링 속도 리셋 (모드 전환 후 급격한 튐 방지)
  }

  function stepPistonFree(dt) {
    // 수동 조작: pistonPush(-1~1) × 3L/s
    state.V = clamp(state.V + inputs.pistonPush * 3 * dt, V_MIN, V_MAX);
    pistonVel = 0;
  }

  function stepPistonWeight(dt) {
    // 임계감쇠 스프링으로 P → P_ext(추+대기압) 수렴. 진동 발산 방지를 위해
    // 서브스텝으로 잘라 적분(고정 dt 상한)한다.
    const OMEGA = 8;       // 응답 속도
    const ZETA = 1;        // 임계 감쇠(발산/진동 없음)
    const SUB_DT = 0.02;   // 서브스텝 상한
    const Pext = externalPressureFromWeight(inputs.weightMass);
    let remaining = clamp(dt, 0, 0.2); // 프레임 드랍 등 큰 dt 방어
    while (remaining > 1e-6) {
      const h = Math.min(SUB_DT, remaining);
      const P = computeP(state.n, state.T, state.V);
      // 무차원 오차: 내부압이 외압보다 크면 팽창(V↑), 작으면 압축(V↓)
      const err = (P - Pext) / Pext;
      const accel = OMEGA * OMEGA * err - 2 * ZETA * OMEGA * pistonVel;
      pistonVel += accel * h;
      const nextV = state.V + pistonVel * h;
      // 물리적 한계(1~10L)에 닿았는데 그 방향으로 계속 미는 중이면 속도를 죽여
      // 내부 속도가 무한정 누적되는 것을 방지(경계 충돌 처리)
      if (nextV >= V_MAX && pistonVel > 0) pistonVel = 0;
      if (nextV <= V_MIN && pistonVel < 0) pistonVel = 0;
      state.V = clamp(nextV, V_MIN, V_MAX);
      remaining -= h;
    }
  }

  function step(dt) {
    dt = clamp(dt, 0, 0.1); // 물리 폭주 방지 (탭 전환 등 큰 dt 프레임 방어)

    stepThermal(dt);
    stepValve(dt);

    if (inputs.pistonMode === 'free') stepPistonFree(dt);
    else if (inputs.pistonMode === 'weight') stepPistonWeight(dt);
    else stepPistonLocked();

    // 항상 물리적 범위로 재클램프 후 P 재계산
    state.n = clamp(state.n, N_MIN, N_MAX);
    state.T = clamp(state.T, T_MIN, T_MAX);
    state.V = clamp(state.V, V_MIN, V_MAX);
    state.P = computeP(state.n, state.T, state.V);
    if (!Number.isFinite(state.P)) state.P = 0;
  }

  function outputs() {
    return {
      P: state.P,
      V: state.V,
      n: state.n,
      T: state.T,
      // N₂ 근사 평균 속력 (몰질량 0.028 kg/mol), m/s. v_rms = sqrt(3RT/M) — R은 J 단위(8.314) 그대로 사용
      meanSpeed: Math.sqrt((3 * 8.314 * state.T) / 0.028),
    };
  }

  return { inputs, step, outputs };
}

/**
 * 고도(altM, m)에서의 대기압 P(h) = 101.325·exp(-h/8000) [kPa].
 * 등온 가정 하 밀봉 풍선의 부피 배율 V/V₀ = P₀/P(h) 를 반환한다.
 * (에이전트 A의 자연 공간이 임포트하는 계약 함수 — nature.js에서 사용)
 */
export function balloonScaleAtAltitude(altM) {
  const P0 = 101.325;
  const Ph = P0 * Math.exp(-altM / 8000);
  return P0 / Ph; // = exp(altM/8000)
}
