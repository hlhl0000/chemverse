// ═══════════════════════════════════════════════════════════
// theme.js — G-1 "옥상 개방형 화학 실험동" 테마 (GRAPHICS_PLAN.md G-1)
// 바닥 타일(버텍스 컬러 체커+육각 경고+팀 유도선) · 안전 펜스(Instanced 1드로우콜)
// 스카이돔(그라데이션) · 도시 스카이라인 실루엣(안개에 잠김)
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약).
// 제약: 텍스처 금지·그림자 금지·버텍스 컬러/절차 지오메트리만.
// 드로우콜: 바닥 1 + 돔 1 + 스카이라인 1 + 펜스 1 = 4
// ═══════════════════════════════════════════════════════════

// 팔레트 (노을 지는 옥상)
const C = {
  tileA: 0x13161f, tileB: 0x1a1f2b,          // 기본 2톤 타일
  warnBase: 0x1d1712, warnLine: 0xc2611f,    // 중앙 격전지 육각 경고
  guideOX: 0x4f2d18, guideRE: 0x14404e,      // 팀 진영 유도선(은은한 팀색)
  zenith: 0x141a2e, dusk: 0x53405c, sunset: 0xd98a58,
  fog: 0x8a5f4e,                              // 지평선·안개색 일치(G-1)
  skyline: 0x1a1428,
  post: 0x39415a, rail: 0x2c3448,
  stripeA: 0xd9b23a, stripeB: 0x23262e,      // 흑/황 경고 스트라이프
  duct: 0x2a3247, ductCap: 0x3d4a68,
};

// 좌표 해시 → 0~1 (타일 밝기 지터용, rng 소비 없이 순서 독립·결정적)
function hash01(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ── 바닥: 세그먼트 분할 + 면 단위 버텍스 컬러 (드로우콜 1) ──
function buildFloor(THREE, halfX, halfZ) {
  const nx = Math.round(halfX * 2), nz = Math.round(halfZ * 2); // 1m 타일
  const geo = new THREE.PlaneGeometry(halfX * 2, halfZ * 2, nx, nz).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();

  for (let f = 0; f < pos.count / 3; f++) {
    const i3 = f * 3;
    const cx = (pos.getX(i3) + pos.getX(i3 + 1) + pos.getX(i3 + 2)) / 3;
    const cz = (pos.getZ(i3) + pos.getZ(i3 + 1) + pos.getZ(i3 + 2)) / 3;
    const i = Math.floor(cx + halfX), j = Math.floor(cz + halfZ);
    const tx = -halfX + i + 0.5, tz = -halfZ + j + 0.5;

    // 육각 거리(플랫탑 근사) — 중앙 격전지 경고 패턴
    const hexD = Math.max(Math.abs(tx) * 0.866 + Math.abs(tz) * 0.5, Math.abs(tz));
    if (hexD < 4.3) {
      col.set(Math.abs(hexD - 3.1) < 0.55 || hexD < 0.9 ? C.warnLine : C.warnBase);
    } else if (Math.abs(tz) < 1.05 && Math.abs(tx) > 4.5 && Math.abs(tx) < 13.5) {
      col.set(tx < 0 ? C.guideOX : C.guideRE); // 팀 기지 → 중앙 유도선
    } else {
      col.set((i + j) % 2 === 0 ? C.tileA : C.tileB);
    }
    col.multiplyScalar(1 + (hash01(i * 73 + j * 151) - 0.5) * 0.12); // 타일별 미세 지터

    for (let v = 0; v < 3; v++) {
      colors[(i3 + v) * 3] = col.r;
      colors[(i3 + v) * 3 + 1] = col.g;
      colors[(i3 + v) * 3 + 2] = col.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// ── 스카이돔: 버텍스 컬러 그라데이션(노을), 안개 미적용 ──
function buildSkyDome(THREE) {
  const R = 75;
  const geo = new THREE.SphereGeometry(R, 24, 14);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(C.zenith), dusk = new THREE.Color(C.dusk);
  const sunset = new THREE.Color(C.sunset), fog = new THREE.Color(C.fog);
  const below = new THREE.Color(0x241d22);
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / R; // -1(바닥)~1(천정)
    if (t < 0) col.copy(fog).lerp(below, Math.min(1, -t * 3));
    else if (t < 0.06) col.copy(fog).lerp(sunset, t / 0.06);
    else if (t < 0.45) col.copy(sunset).lerp(dusk, (t - 0.06) / 0.39);
    else col.copy(dusk).lerp(zenith, (t - 0.45) / 0.55);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

// ── 도시 스카이라인 실루엣 4방향(원경, 안개에 잠김) — 드로우콜 1 ──
function buildSkyline(THREE, rng) {
  const verts = [];
  const R = 46, SPAN = 34;
  for (let side = 0; side < 4; side++) {
    const yaw = side * Math.PI / 2;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const W = (u, y) => [u * cosY + R * sinY, y, -u * sinY + R * cosY];
    let u = -SPAN;
    while (u < SPAN - 2) {
      const w = 3 + rng() * 5;
      const h = 3 + rng() * 8.5;
      const gap = 0.5 + rng() * 2.5;
      const u2 = Math.min(u + w, SPAN);
      const a = W(u, -2), b = W(u2, -2), c = W(u2, h), d = W(u, h);
      verts.push(...a, ...b, ...c, ...a, ...c, ...d);
      u = u2 + gap;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.MeshBasicMaterial({ color: C.skyline, side: THREE.DoubleSide }); // fog:true(기본)
  return new THREE.Mesh(geo, mat);
}

// ── 안전 펜스 + 상단 경고 스트라이프 + 모서리 배기 덕트 — InstancedMesh 1개 ──
// 시각 전용: 충돌은 arena.js의 기존 외벽 콜라이더(높이 2.6)가 그대로 담당.
function buildFence(THREE, halfX, halfZ) {
  const items = [];
  const off = 0.15;
  const sides = [
    { cx: 0, cz: halfZ + off, len: halfX * 2, ax: 'x' },
    { cx: 0, cz: -(halfZ + off), len: halfX * 2, ax: 'x' },
    { cx: halfX + off, cz: 0, len: halfZ * 2, ax: 'z' },
    { cx: -(halfX + off), cz: 0, len: halfZ * 2, ax: 'z' },
  ];
  for (const s of sides) {
    const n = Math.floor(s.len / 2.5);
    for (let i = 0; i <= n; i++) {
      const t = -s.len / 2 + (s.len / n) * i;
      const [x, z] = s.ax === 'x' ? [t, s.cz] : [s.cx, t];
      items.push({ x, y: 1.25, z, sx: 0.12, sy: 2.5, sz: 0.12, color: C.post });
    }
    for (const railY of [0.8, 1.6]) {
      const [sx, sz] = s.ax === 'x' ? [s.len, 0.07] : [0.07, s.len];
      items.push({ x: s.cx, y: railY, z: s.cz, sx, sy: 0.07, sz, color: C.rail });
    }
    const m = Math.round(s.len);
    for (let i = 0; i < m; i++) {
      const t = -s.len / 2 + i + 0.5;
      const [x, z] = s.ax === 'x' ? [t, s.cz] : [s.cx, t];
      const [sx, sz] = s.ax === 'x' ? [0.98, 0.14] : [0.14, 0.98];
      items.push({ x, y: 2.42, z, sx, sy: 0.18, sz, color: i % 2 === 0 ? C.stripeA : C.stripeB });
    }
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * (halfX + 1.7), z = sz * (halfZ + 1.7);
      items.push({ x, y: 1.8, z, sx: 1.2, sy: 3.6, sz: 1.2, color: C.duct });
      items.push({ x, y: 3.75, z, sx: 1.5, sy: 0.3, sz: 1.5, color: C.ductCap });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, items.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.scale.set(it.sx, it.sy, it.sz);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    inst.setColorAt(i, col.set(it.color));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  return inst;
}

// buildTheme(THREE, rng, {halfX, halfZ}) → { group, env:{fogColor} }
// env.fogColor는 main.js가 scene.fog/background에 적용(지평선 색과 일치 — G-1).
export function buildTheme(THREE, rng, { halfX, halfZ }) {
  const group = new THREE.Group();
  group.add(buildFloor(THREE, halfX, halfZ));
  group.add(buildSkyDome(THREE));
  group.add(buildSkyline(THREE, rng));
  group.add(buildFence(THREE, halfX, halfZ));
  return { group, env: { fogColor: C.fog } };
}
