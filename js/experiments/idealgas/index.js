// ═══════════════════════════════════════════════════════════
// 이상기체 방정식 실험 정의 — 소유: 에이전트 B
// docs/ARCHITECTURE.md §5 스키마를 그대로 구현한다.
// 이 파일은 three/registry.js 외의 내부 모듈을 임포트하지 않는다
// (three는 createVisuals/makeMesh 인자로 전달받아 사용).
// ═══════════════════════════════════════════════════════════

import { registerExperiment } from '../registry.js';
import { createIdealGasModel } from './model.js';
import {
  makeCylinder, makeHeater, makeGastank, makePsensor, makeThermo, makeWeightSet, makePin,
} from './equipment.js';

const EQUIPMENT = [
  {
    id: 'cylinder', name: '실린더-피스톤', required: true, makeMesh: makeCylinder,
    desc: '기체를 가두고 피스톤으로 부피를 바꾸는 핵심 용기입니다.',
  },
  {
    id: 'heater', name: '가열판', required: true, makeMesh: makeHeater,
    desc: '실린더를 가열해 기체 온도를 높입니다.',
  },
  {
    id: 'gastank', name: '가스통', required: false, makeMesh: makeGastank,
    desc: '밸브를 열면 기체 분자(n)를 실린더에 추가로 주입합니다.',
  },
  {
    id: 'psensor', name: '압력 센서', required: false, makeMesh: makePsensor,
    desc: '실린더 내부 압력(P)을 실시간으로 측정해 표시합니다.',
  },
  {
    id: 'thermo', name: '온도계', required: false, makeMesh: makeThermo,
    desc: '실린더 내부 온도(T)를 실시간으로 측정해 표시합니다.',
  },
  {
    id: 'weightSet', name: '추 세트', required: false, makeMesh: makeWeightSet,
    desc: '피스톤 위에 올려 일정한 외부 압력을 만들어 등압 변화를 관찰합니다.',
  },
  {
    id: 'pin', name: '고정핀', required: false, makeMesh: makePin,
    desc: '피스톤을 고정해 부피를 일정하게 유지, 등적 변화를 관찰합니다.',
  },
];

// 실험대 anchor 기준 상대좌표(m), 상판 위 y≈0.02
const SNAP_SLOTS = [
  { id: 'center', accepts: ['cylinder'], pos: [0, 0.02, 0] },
  { id: 'left', accepts: ['heater'], pos: [-0.22, 0.02, 0] },
  { id: 'right', accepts: ['gastank'], pos: [0.22, 0.02, 0] },
  { id: 'backleft', accepts: ['psensor'], pos: [-0.15, 0.02, -0.18] },
  { id: 'backright', accepts: ['thermo'], pos: [0.15, 0.02, -0.18] },
  { id: 'front1', accepts: ['weightSet', 'pin'], pos: [-0.08, 0.02, 0.2] },
  { id: 'front2', accepts: ['weightSet', 'pin'], pos: [0.08, 0.02, 0.2] },
];

function itemName(id) {
  return EQUIPMENT.find((e) => e.id === id)?.name ?? id;
}

function checkAssembly(placed) {
  const values = [...placed.values()];
  const has = (id) => values.includes(id);

  const requiredIds = EQUIPMENT.filter((e) => e.required).map((e) => e.id);
  const missingIds = requiredIds.filter((id) => !has(id));
  const missing = missingIds.map(itemName);

  const hints = [];
  if (!has('psensor')) hints.push('압력 센서가 없어 P를 측정할 수 없습니다.');
  if (!has('thermo')) hints.push('온도계가 없어 T를 측정할 수 없습니다.');
  if (!has('gastank')) hints.push('가스통이 없어 기체량(n)을 조절할 수 없습니다.');
  if (has('heater') && has('cylinder')) hints.push('가열판 위 실린더 — 좋은 배치입니다.');
  if (has('pin')) hints.push('고정핀을 꽂으면 부피가 고정되는 등적 변화를 관찰할 수 있습니다.');
  if (has('weightSet')) hints.push('추를 올리면 압력이 일정하게 유지되는 등압 변화를 관찰할 수 있습니다.');
  if (!has('pin') && !has('weightSet')) hints.push('고정핀이나 추가 없으면 피스톤을 자유 모드로만 조작할 수 있습니다.');

  return { ready: missing.length === 0, missing, hints };
}

// anchor의 직계 자식 중 해당 기구(itemId)가 배치된 Object3D를 찾는다.
// (ARCHITECTURE §4 계약: 배치된 기구는 userData.equipment = { expId, itemId, slot })
function findEquipment(anchor, itemId) {
  for (const child of anchor.children) {
    if (child.userData?.equipment?.itemId === itemId) return child;
  }
  return null;
}

function hasItem(placed, itemId) {
  for (const v of placed.values()) if (v === itemId) return true;
  return false;
}

function createVisuals(THREE, anchor, model, placed) {
  const cylinderObj = findEquipment(anchor, 'cylinder');
  const heaterObj = findEquipment(anchor, 'heater');

  const MAX_PARTICLES = 400;
  const particleGeo = new THREE.SphereGeometry(0.006, 6, 4);
  const particleMat = new THREE.MeshStandardMaterial({
    color: 0x00b4d8, emissive: 0x00b4d8, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.1,
  });
  const particles = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
  particles.count = 0;
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (cylinderObj) cylinderObj.add(particles);

  const innerR = cylinderObj?.userData?.innerRadius ?? 0.03;
  const floorY = cylinderObj?.userData?.floorY ?? 0.016;

  const pStates = Array.from({ length: MAX_PARTICLES }, () => ({
    pos: new THREE.Vector3(
      (Math.random() - 0.5) * innerR * 1.4,
      floorY + Math.random() * 0.02,
      (Math.random() - 0.5) * innerR * 1.4
    ),
    vel: new THREE.Vector3(),
  }));
  const dummy = new THREE.Object3D();

  let pistonY = cylinderObj ? cylinderObj.userData.volumeToY(model.outputs().V) : floorY + 0.05;

  let readTimer = 0;
  const READ_INTERVAL = 0.2;

  function respawnVelocity(vec, speed) {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - z * z);
    vec.set(r * Math.cos(theta) * speed, z * speed, r * Math.sin(theta) * speed);
  }

  function update(dt) {
    const out = model.outputs();

    // 피스톤 위치(V 반영, 부드러운 lerp)
    if (cylinderObj) {
      const targetY = cylinderObj.userData.volumeToY(out.V);
      pistonY += (targetY - pistonY) * Math.min(1, dt * 6);
      cylinderObj.userData.pistonDisc.position.y = pistonY;
    }

    // 입자 개수(n 반영) & 속도(√T 반영)
    const count = Math.min(MAX_PARTICLES, Math.round(out.n * 150));
    const speed = 0.05 + 0.22 * Math.sqrt(Math.max(0, out.T) / 300);
    const top = pistonY - 0.012;
    const bottom = floorY;
    const wallR = Math.max(0.005, innerR);

    for (let i = 0; i < count; i++) {
      const s = pStates[i];
      if (s.vel.lengthSq() < 1e-8) respawnVelocity(s.vel, speed);
      else s.vel.setLength(speed);

      s.pos.addScaledVector(s.vel, dt);

      // 원통 벽 반사
      const r = Math.hypot(s.pos.x, s.pos.z);
      if (r > wallR && r > 1e-6) {
        const nx = s.pos.x / r, nz = s.pos.z / r;
        const vDotN = s.vel.x * nx + s.vel.z * nz;
        s.vel.x -= 2 * vDotN * nx;
        s.vel.z -= 2 * vDotN * nz;
        s.pos.x = nx * wallR; s.pos.z = nz * wallR;
      }
      // 바닥 / 피스톤면 반사
      if (s.pos.y < bottom + 0.005) { s.pos.y = bottom + 0.005; s.vel.y = Math.abs(s.vel.y); }
      if (s.pos.y > top) { s.pos.y = Math.max(bottom + 0.005, top); s.vel.y = -Math.abs(s.vel.y); }

      dummy.position.copy(s.pos);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.count = count;
    particles.instanceMatrix.needsUpdate = true;

    // 가열판 발광 강도 = heaterPower
    if (heaterObj?.userData?.heatMat) {
      heaterObj.userData.heatMat.emissiveIntensity = 0.05 + model.inputs.heaterPower * 1.3;
    }

    // 가스통 밸브: valveOpen이면 손잡이 회전 표시
    if (hasItem(placed, 'gastank')) {
      const gastankObj = findEquipment(anchor, 'gastank');
      if (gastankObj?.userData?.valveHandle && model.inputs.valveOpen) {
        gastankObj.userData.valveHandle.rotation.y += dt * 4;
      }
    }

    // 센서 표시 갱신 (0.2s 간격)
    readTimer += dt;
    if (readTimer >= READ_INTERVAL) {
      readTimer = 0;
      if (hasItem(placed, 'psensor')) {
        const psensorObj = findEquipment(anchor, 'psensor');
        psensorObj?.userData?.updateReading?.(`${out.P.toFixed(1)} kPa`);
      }
      if (hasItem(placed, 'thermo')) {
        const thermoObj = findEquipment(anchor, 'thermo');
        thermoObj?.userData?.updateReading?.(`${out.T.toFixed(1)} K`);
      }
    }
  }

  function dispose() {
    particles.geometry.dispose();
    particles.material.dispose();
    particles.parent?.remove(particles);
  }

  return { update, dispose };
}

const idealgas = {
  id: 'idealgas',
  name: '이상기체 방정식',
  level: '통합과학·화학Ⅰ',
  description: '실린더·피스톤·가열판 등을 자유롭게 배치해 PV=nRT의 네 변수 관계를 직접 조작하며 관찰하는 실험입니다.',

  equipment: EQUIPMENT,
  snapSlots: SNAP_SLOTS,
  checkAssembly,
  createModel: createIdealGasModel,
  createVisuals,

  ui: {
    controls: [
      {
        id: 'heater', type: 'slider', label: '히터 출력', unit: '%',
        min: 0, max: 100, step: 1, default: 0, bind: 'heaterPower', scale: 0.01,
      },
      {
        id: 'valve', type: 'toggle', label: '가스 밸브', default: false,
        bind: 'valveOpen', requiresItem: 'gastank',
      },
      {
        id: 'pistonMode', type: 'buttons', label: '피스톤 모드', default: 'free', bind: 'pistonMode',
        options: [
          { value: 'free', label: '자유' },
          { value: 'locked', label: '고정', requiresItem: 'pin' },
          { value: 'weight', label: '추', requiresItem: 'weightSet' },
        ],
      },
      {
        id: 'weightMass', type: 'stepper', label: '추 무게', unit: 'kg',
        min: 0, max: 5, step: 0.5, default: 0, bind: 'weightMass', requiresItem: 'weightSet',
      },
      {
        id: 'pistonPush', type: 'slider', label: '피스톤 밀기', unit: '',
        min: -1, max: 1, step: 0.01, default: 0, bind: 'pistonPush',
        momentary: true, activeWhen: { bind: 'pistonMode', equals: 'free' },
      },
    ],
    readouts: [
      { id: 'P', label: '압력', unit: 'kPa', digits: 1, bind: 'P', requiresItem: 'psensor' },
      { id: 'V', label: '부피', unit: 'L', digits: 2, bind: 'V' },
      { id: 'T', label: '온도', unit: 'K', digits: 1, bind: 'T', requiresItem: 'thermo' },
      { id: 'n', label: '기체량', unit: 'mol', digits: 2, bind: 'n' },
      { id: 'speed', label: '평균 속력', unit: 'm/s', digits: 0, bind: 'meanSpeed' },
    ],
    graphs: [
      { id: 'pv', label: 'P–V', x: { bind: 'V', label: 'V', unit: 'L' }, y: { bind: 'P', label: 'P', unit: 'kPa' } },
      { id: 'vt', label: 'V–T', x: { bind: 'T', label: 'T', unit: 'K' }, y: { bind: 'V', label: 'V', unit: 'L' } },
      { id: 'pt', label: 'P–T', x: { bind: 'T', label: 'T', unit: 'K' }, y: { bind: 'P', label: 'P', unit: 'kPa' } },
    ],
  },
};

registerExperiment(idealgas);
