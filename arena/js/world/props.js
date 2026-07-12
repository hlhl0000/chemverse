// ═══════════════════════════════════════════════════════════
// props.js — G-2 엄폐물 → 실험실 가구 5종 (GRAPHICS_PLAN.md G-2)
// 실험대·시약장·흄후드·가스통 랙·폐시약 드럼 — 전부 Box/Cylinder 조합을
// 버텍스 컬러로 병합해 종류별 InstancedMesh 1개 = 드로우콜 5.
// 회전은 90° 단위만 허용(콜라이더 AABB 정확 일치 — v3 §6 회전 불일치 문제 원천 차단).
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약).
// ═══════════════════════════════════════════════════════════

// 부품 지오메트리를 변환·채색해 누적 버퍼에 병합 (버텍스 컬러 베이크)
function pushPart(THREE, acc, geo, { p = [0, 0, 0], r = [0, 0, 0], color }) {
  const g = geo.toNonIndexed();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p[0], p[1], p[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
    new THREE.Vector3(1, 1, 1)
  );
  g.applyMatrix4(m);
  const pa = g.getAttribute('position'), na = g.getAttribute('normal');
  const c = new THREE.Color(color);
  for (let i = 0; i < pa.count; i++) {
    acc.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
    acc.nrm.push(na.getX(i), na.getY(i), na.getZ(i));
    acc.col.push(c.r, c.g, c.b);
  }
  g.dispose();
  geo.dispose();
}

function buildGeo(THREE, parts) {
  const acc = { pos: [], nrm: [], col: [] };
  for (const pt of parts) pushPart(THREE, acc, pt.geo, pt);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  return geo;
}

// ── 가구 5종 (원점=바닥 중심, +z가 정면) ──

// 실험대: 스테인리스 상판 + 서랍장 + 상판 위 소형 플라스크 (허리 높이 표준 엄폐)
function buildBench(THREE) {
  const B = (...a) => new THREE.BoxGeometry(...a);
  return buildGeo(THREE, [
    { geo: B(1.7, 0.86, 0.8), p: [0, 0.5, 0], color: 0x2e3648 },
    { geo: B(1.8, 0.08, 0.9), p: [0, 0.96, 0], color: 0xb8c0cc },
    { geo: B(0.72, 0.3, 0.03), p: [-0.42, 0.4, 0.41], color: 0x3a4459 },
    { geo: B(0.72, 0.3, 0.03), p: [0.42, 0.4, 0.41], color: 0x3a4459 },
    { geo: B(0.72, 0.3, 0.03), p: [-0.42, 0.74, 0.41], color: 0x3a4459 },
    { geo: B(0.72, 0.3, 0.03), p: [0.42, 0.74, 0.41], color: 0x3a4459 },
    { geo: B(0.2, 0.04, 0.04), p: [-0.42, 0.57, 0.43], color: 0x8b93a7 },
    { geo: B(0.2, 0.04, 0.04), p: [0.42, 0.57, 0.43], color: 0x8b93a7 },
    { geo: new THREE.SphereGeometry(0.09, 8, 6), p: [0.55, 1.08, -0.15], color: 0x7fd4e8 },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), p: [0.55, 1.2, -0.15], color: 0x9fc4d8 },
  ]);
}

// 시약장: 키 큰 장 + 유리문 + 선반 병 (전신 높이 시야 차단)
function buildCabinet(THREE) {
  const B = (...a) => new THREE.BoxGeometry(...a);
  const parts = [
    { geo: B(1.24, 0.12, 0.64), p: [0, 0.06, 0], color: 0x1f2430 },
    { geo: B(1.2, 2.08, 0.6), p: [0, 1.16, 0], color: 0x2a3040 },
    { geo: B(1.0, 1.4, 0.04), p: [0, 1.35, 0.29], color: 0x9fc4d8 },
  ];
  const bottleColors = [0xd98c3d, 0x35d07f, 0x5aa9e6];
  for (let s = 0; s < 3; s++) {
    const y = 0.85 + s * 0.45;
    parts.push({ geo: B(1.06, 0.05, 0.05), p: [0, y, 0.3], color: 0x3d465e });
    for (const bx of [-0.25, 0.25]) {
      parts.push({
        geo: new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6),
        p: [bx, y + 0.11, 0.31], color: bottleColors[(s + (bx > 0 ? 1 : 0)) % 3],
      });
    }
  }
  return buildGeo(THREE, parts);
}

// 흄후드: 하부장 + 상부 후드 + 어두운 개구부 (코너 엄폐)
function buildHood(THREE) {
  const B = (...a) => new THREE.BoxGeometry(...a);
  return buildGeo(THREE, [
    { geo: B(1.5, 0.9, 0.75), p: [0, 0.45, 0], color: 0x323a4e },
    { geo: B(1.5, 1.4, 0.8), p: [0, 1.6, -0.02], color: 0x3a4256 },
    { geo: B(1.2, 0.95, 0.05), p: [0, 1.5, 0.37], color: 0x0c0f16 },
    { geo: B(1.3, 0.07, 0.07), p: [0, 2.02, 0.38], color: 0x8b93a7 },
    { geo: B(0.07, 0.95, 0.07), p: [-0.64, 1.5, 0.38], color: 0x8b93a7 },
    { geo: B(0.07, 0.95, 0.07), p: [0.64, 1.5, 0.38], color: 0x8b93a7 },
  ]);
}

// 가스통 랙: 실린더 3개 + 체인 바 (원형 엄폐)
function buildRack(THREE) {
  const B = (...a) => new THREE.BoxGeometry(...a);
  const Cy = (...a) => new THREE.CylinderGeometry(...a);
  const tankColors = [0x4aa3c7, 0xd98c3d, 0x6fbf87];
  const parts = [{ geo: B(1.0, 0.08, 0.6), p: [0, 0.04, 0], color: 0x2a3040 }];
  [-0.3, 0, 0.3].forEach((x, i) => {
    parts.push({ geo: Cy(0.14, 0.14, 1.3, 8), p: [x, 0.73, 0], color: tankColors[i] });
    parts.push({ geo: Cy(0.04, 0.04, 0.14, 6), p: [x, 1.45, 0], color: 0x8b93a7 });
  });
  parts.push({ geo: B(1.0, 0.05, 0.05), p: [0, 1.1, 0.17], color: 0x596273 });
  return buildGeo(THREE, parts);
}

// 폐시약 드럼: 드럼통 + 경고 밴드 2줄 (저높이 엄폐)
function buildDrum(THREE) {
  const Cy = (...a) => new THREE.CylinderGeometry(...a);
  return buildGeo(THREE, [
    { geo: Cy(0.4, 0.4, 0.9, 12), p: [0, 0.45, 0], color: 0x9a7d22 },
    { geo: Cy(0.41, 0.41, 0.08, 12), p: [0, 0.3, 0], color: 0x23262e },
    { geo: Cy(0.41, 0.41, 0.08, 12), p: [0, 0.65, 0], color: 0x23262e },
    { geo: Cy(0.38, 0.38, 0.05, 12), p: [0, 0.925, 0], color: 0x3a4256 },
  ]);
}

// 타입 정의: {build, w(가로), d(세로), h(높이)} — w·d는 콜라이더 풋프린트
const TYPES = [
  { id: 'bench', build: buildBench, w: 1.8, d: 0.9, h: 1.05 },
  { id: 'cabinet', build: buildCabinet, w: 1.24, d: 0.66, h: 2.2 },
  { id: 'hood', build: buildHood, w: 1.5, d: 0.8, h: 2.3 },
  { id: 'rack', build: buildRack, w: 1.0, d: 0.6, h: 1.55 },
  { id: 'drum', build: buildDrum, w: 0.82, d: 0.82, h: 0.95 },
];

// buildProps(THREE, rng, {halfX, halfZ, avoid}) → { group, colliders }
// x>0 절반에서 표본 추출 후 x=0 기준 미러 — 기존 엄폐 블록과 동일한 대칭 규약.
// 회전은 90° 단위만 → 회전 시 풋프린트 w/d 스왑으로 AABB가 시각과 정확히 일치.
export function buildProps(THREE, rng, { halfX, halfZ, avoid }) {
  const group = new THREE.Group();
  const colliders = [];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const HALF_COUNT = 9;
  const placements = [];
  for (let i = 0; i < HALF_COUNT; i++) {
    const ti = i % TYPES.length;
    const t = TYPES[ti];
    const rot90 = Math.floor(rng() * 4) % 4;
    const fw = rot90 % 2 === 0 ? t.w : t.d;
    const fd = rot90 % 2 === 0 ? t.d : t.w;
    const myR = Math.max(fw, fd) / 2;

    let x = 0, z = 0, tries = 0, ok = false;
    do {
      x = 3.5 + rng() * (halfX - 6.5);
      z = -halfZ + 2 + rng() * (halfZ * 2 - 4);
      ok = avoid.every((a) => Math.hypot(x - a.x, z - a.z) > a.r)
        && placements.every((p) => Math.hypot(x - p.x, z - p.z) > myR + p.r + 0.9);
      tries += 1;
    } while (!ok && tries < 40);

    placements.push({ ti, x, z, ry: rot90 * Math.PI / 2, fw, fd, h: t.h, r: myR });
  }

  const dummy = new THREE.Object3D();
  for (let ti = 0; ti < TYPES.length; ti++) {
    const list = placements.filter((p) => p.ti === ti);
    if (list.length === 0) continue;
    const geo = TYPES[ti].build(THREE);
    const inst = new THREE.InstancedMesh(geo, mat, list.length * 2);
    let idx = 0;
    for (const p of list) {
      // 오른쪽(x>0) 원본
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(p.x - p.fw / 2, 0, p.z - p.fd / 2),
        new THREE.Vector3(p.x + p.fw / 2, p.h, p.z + p.fd / 2)
      ));
      idx += 1;

      // 왼쪽(x<0) 미러 — 90° 단위 회전이라 -ry여도 풋프린트 동일
      dummy.position.set(-p.x, 0, p.z);
      dummy.rotation.set(0, -p.ry, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(-p.x - p.fw / 2, 0, p.z - p.fd / 2),
        new THREE.Vector3(-p.x + p.fw / 2, p.h, p.z + p.fd / 2)
      ));
      idx += 1;
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  return { group, colliders };
}
