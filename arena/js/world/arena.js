// ═══════════════════════════════════════════════════════════
// buildArena — 아레나 맵 생성기 (소유: 에이전트 A)
// 신규 작성(본편에 대응 파일 없음). 40×28m, x=0 평면 기준 좌우 대칭.
// 시드 결정적(mulberry32, missions/registry.js에서 임포트) — 전 클라이언트 동일 맵.
// InstancedMesh·라벨 스프라이트 패턴은 본편 js/world/nature.js를 참고해 신규 작성.
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약).
//
// Phase B 개편: 크레이트 시각(열린 나무상자+내용물 실물 메쉬)은 world/items.js의
// ItemManager가 렌더한다. 이 파일은 배치 데이터(crates 배열)만 생성해 반환한다.
// 내용물 분배는 game/loot.js(에이전트 B 소유)의 rollCrates()를 그대로 사용 — 중복 구현 금지.
// ═══════════════════════════════════════════════════════════
import { mulberry32 } from '../missions/registry.js';
import { rollCrates } from '../game/loot.js';
import { makePartMesh } from './items.js';
import { buildTheme } from './theme.js';
import { buildProps } from './props.js';

const HALF_X = 20;    // 맵 절반 폭 (40m)
const HALF_Z = 14;    // 맵 절반 길이 (28m)
const WALL_T = 1.2;   // 외벽 두께
const WALL_H = 2.6;   // 외벽 높이
const BASE_X = 16.5;  // 팀 기지(조립대) 중심 x 오프셋
const PLAY_MARGIN = 0.7; // 벽 안쪽 이동 가능 여유(바운즈)

const TEAM_COLOR = { OX: 0xff8a3d, RE: 0x00b4d8 };
const TEAM_NAME = { OX: '산화팀', RE: '환원팀' };

function hexCss(hex) { return `#${(hex >>> 0).toString(16).padStart(6, '0')}`; }

function disposeObject(o) {
  // items.js가 만든 실물 메쉬(공유 지오메트리/머티리얼 캐시)는 소유권이 items.js에 있으므로
  // 여기서 dispose하지 않는다(setAssembled로 조립대 위에 부착된 부품 메쉬 보호).
  if (o.userData?.sharedItem) return;
  if (o.geometry) o.geometry.dispose();
  if (o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
  }
}

// 라벨 스프라이트 (CanvasTexture) — 본편 js/world/nature.js의 makeLabelSprite 패턴 참고
function makeLabelSprite(THREE, text, colorCss) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 26, pad = 10;
  ctx.font = `700 ${fontSize}px sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(9,12,19,0.65)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = colorCss || 'rgba(0,180,216,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#eaf6fb';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = w / h;
  sprite.scale.set(0.5 * aspect, 0.5, 1);
  return sprite;
}

// 이동 방향(dx,dz)을 바라보도록 하는 yaw. core/tps.js의 정면 벡터(0,0,-1)를
// object.quaternion(=Y축 회전 yaw)으로 회전한 결과와 동일한 규약을 사용.
function ryFacing(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function buildArena(THREE, missionDef, seed) {
  const rng = mulberry32((seed >>> 0) || 1);
  const group = new THREE.Group();
  const colliders = [];

  // ── 조명 (그림자 없음) — 노을 지는 옥상 톤(G-1) ──
  const hemi = new THREE.HemisphereLight(0xffc9a0, 0x232031, 1.0);
  const dir = new THREE.DirectionalLight(0xffd9ad, 0.75);
  dir.position.set(-14, 18, 8); // 서쪽 낮은 태양
  dir.castShadow = false;
  group.add(hemi, dir);

  // ── G-1 테마: 타일 바닥·스카이돔·스카이라인·안전 펜스 (world/theme.js) ──
  const theme = buildTheme(THREE, rng, { halfX: HALF_X, halfZ: HALF_Z });
  group.add(theme.group);

  // ── 외벽 콜라이더 4면 (시각은 theme.js의 펜스가 담당 — 보이지 않는 벽) ──
  function addWall(cx, cz, sx, sz) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2, 0, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, WALL_H, cz + sz / 2)
    ));
  }
  addWall(0, -HALF_Z - WALL_T / 2, HALF_X * 2 + WALL_T * 2, WALL_T);
  addWall(0, HALF_Z + WALL_T / 2, HALF_X * 2 + WALL_T * 2, WALL_T);
  addWall(-HALF_X - WALL_T / 2, 0, WALL_T, HALF_Z * 2);
  addWall(HALF_X + WALL_T / 2, 0, WALL_T, HALF_Z * 2);

  const bounds = {
    minX: -HALF_X + PLAY_MARGIN, maxX: HALF_X - PLAY_MARGIN,
    minZ: -HALF_Z + PLAY_MARGIN, maxZ: HALF_Z - PLAY_MARGIN,
  };

  // ── 팀 기지: 발광 조립 패드 + 깃대(OX=-x, RE=+x) ──
  const zonesAssembly = {};
  const baseCenters = { OX: { x: -BASE_X, z: 0 }, RE: { x: BASE_X, z: 0 } };
  const assembledGroups = {}; // team -> Group (setAssembled이 갱신, dispose 시 별도 처리)

  for (const team of ['OX', 'RE']) {
    const c = baseCenters[team];
    const color = TEAM_COLOR[team];
    const padRadius = 2.4;

    const padGeo = new THREE.CircleGeometry(padRadius, 24);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(c.x, 0.02, c.z);
    group.add(pad);

    const ringGeo = new THREE.RingGeometry(padRadius - 0.08, padRadius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(c.x, 0.03, c.z);
    group.add(ring);

    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4f5c });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    const poleZ = c.z - padRadius + 0.2;
    pole.position.set(c.x, 1.6, poleZ);
    group.add(pole);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(c.x - 0.1, 0, poleZ - 0.1),
      new THREE.Vector3(c.x + 0.1, 3.2, poleZ + 0.1)
    ));

    const flagGeo = new THREE.PlaneGeometry(0.9, 0.6);
    const flagMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(c.x + 0.45, 2.7, poleZ);
    group.add(flag);

    const label = makeLabelSprite(THREE, `${TEAM_NAME[team]} 조립대`, hexCss(color));
    label.position.set(c.x, 3.3, poleZ);
    group.add(label);

    zonesAssembly[team] = { pos: [c.x, 0, c.z], radius: padRadius };

    const ag = new THREE.Group();
    ag.position.set(c.x, 0, c.z);
    group.add(ag);
    assembledGroups[team] = ag;
  }

  // ── 스폰 포인트: 각 팀 기지 앞 5개, 발 기준 y=0 ──
  const spawns = { OX: [], RE: [] };
  for (const team of ['OX', 'RE']) {
    const c = baseCenters[team];
    const sign = team === 'OX' ? 1 : -1; // 중앙(x=0) 방향 오프셋 부호
    const ry = ryFacing(sign, 0); // 중앙(적진)을 바라보도록
    for (let i = 0; i < 5; i++) {
      const zRaw = (i - 2) * 2.2 + (rng() - 0.5) * 0.6;
      const z = THREE.MathUtils.clamp(zRaw, -HALF_Z + 1.5, HALF_Z - 1.5);
      const x = c.x + sign * (3.4 + rng() * 1.4);
      spawns[team].push({ pos: [x, 0, z], ry });
    }
  }

  // ── G-2 엄폐물: 실험실 가구 5종 (world/props.js) — 종류별 InstancedMesh ──
  const coverAvoid = [
    { x: baseCenters.OX.x, z: 0, r: 5 },
    { x: baseCenters.RE.x, z: 0, r: 5 },
    { x: 0, z: 0, r: 3.5 },
  ];
  const props = buildProps(THREE, rng, { halfX: HALF_X, halfZ: HALF_Z, avoid: coverAvoid });
  group.add(props.group);
  colliders.push(...props.colliders);

  // (x,z)가 반경 r 안에서 콜라이더와 겹치는지 — 크레이트 배치·스폰 보정 공용
  function isBlocked(x, z, r) {
    for (const b of colliders) {
      const cx = THREE.MathUtils.clamp(x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(z, b.min.z, b.max.z);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // ── 크레이트 배치 데이터 (시각은 world/items.js의 ItemManager가 렌더) ──
  // 내용물 분배(부품 6종×2 + 무기 4개 = 16개, 중앙/외곽 지정)는 game/loot.js의
  // rollCrates()가 결정적으로 계산한다(에이전트 B 소유, 중복 구현 금지).
  // 여기서는 zone('center'|'edge')에 따라 좌표만 이 파일의 rng로 결정적으로 배정한다.
  const rolled = rollCrates(missionDef, seed) || [];
  const crates = [];
  let edgeIdx = 0;
  for (const item of rolled) {
    let x = 0, z = 0, tries = 0;
    do {
      if (item.zone === 'edge') {
        const sideSign = edgeIdx % 2 === 0 ? 1 : -1;
        x = sideSign * (9 + rng() * 5.5);
        z = (rng() - 0.5) * (HALF_Z * 2 - 4);
      } else {
        x = (rng() - 0.5) * 6.5;
        z = (rng() - 0.5) * 9;
      }
      tries += 1;
    } while (isBlocked(x, z, 0.95) && tries < 25); // 가구·기존 크레이트와 겹침 방지
    if (item.zone === 'edge') edgeIdx += 1;
    crates.push({ id: item.id, pos: [x, 0, z], kind: item.kind, itemId: item.itemId });
    // 간단한 충돌 박스(상자 크기 근사) — 시각은 items.js가 그린다
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.3, 0, z - 0.3),
      new THREE.Vector3(x + 0.3, 0.5, z + 0.3)
    ));
  }

  // 하위 호환: zones.supply는 crates에서 파생
  const supply = crates.map((c) => ({ pos: c.pos, itemId: c.itemId }));

  // ── 스폰 안전 보정: 스폰 지점이 장애물(가구·크레이트·깃대)과 겹치면
  // 주변 링을 탐색해 빈 지점으로 이동(끼임 방지). 콜라이더가 전부 확정된 뒤 수행.
  // 결정적(rng 미사용, 탐색 순서 고정) — 전 클라이언트 동일 결과.
  const SPAWN_CLEAR_R = 0.6; // 플레이어 반지름 0.35 + 여유
  function resolveSpawn(s) {
    if (!isBlocked(s.pos[0], s.pos[2], SPAWN_CLEAR_R)) return;
    for (const rad of [0.8, 1.2, 1.8, 2.4, 3.0]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = THREE.MathUtils.clamp(s.pos[0] + Math.cos(a) * rad, bounds.minX, bounds.maxX);
        const z = THREE.MathUtils.clamp(s.pos[2] + Math.sin(a) * rad, bounds.minZ, bounds.maxZ);
        if (!isBlocked(x, z, SPAWN_CLEAR_R)) { s.pos[0] = x; s.pos[2] = z; return; }
      }
    }
  }
  for (const team of ['OX', 'RE']) spawns[team].forEach(resolveSpawn);

  // ── 조립대 진행 표시: 장착된 부품 실물 메쉬를 패드 위 원형 배열로 부착 ──
  function setAssembled(team, itemIds) {
    const ag = assembledGroups[team];
    if (!ag) return;
    while (ag.children.length > 0) ag.remove(ag.children[0]); // 소유권은 items.js 캐시 — 제거만
    const list = itemIds || [];
    const n = list.length;
    const radius = 1.15;
    list.forEach((itemId, i) => {
      const m = makePartMesh(THREE, itemId);
      m.scale.setScalar(0.85); // 아이템 크기 확대(사용자 요청)
      const ang = (i / Math.max(1, n)) * Math.PI * 2;
      m.position.set(Math.cos(ang) * radius, 0.85, Math.sin(ang) * radius);
      ag.add(m);
    });
  }

  return {
    group,
    colliders,
    bounds,
    spawns,
    zones: { assembly: zonesAssembly, supply },
    crates,
    setAssembled,
    env: theme.env, // G-1: main.js가 scene.fog/background 색을 지평선과 일치시킴
    dispose() {
      // 조립대에 부착된 부품 메쉬(items.js 공유 자원)는 먼저 떼어내 dispose 대상에서 제외
      for (const team of Object.keys(assembledGroups)) {
        const ag = assembledGroups[team];
        while (ag.children.length > 0) ag.remove(ag.children[0]);
      }
      group.traverse((o) => disposeObject(o));
    },
  };
}
