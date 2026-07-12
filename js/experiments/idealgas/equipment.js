// ═══════════════════════════════════════════════════════════
// 이상기체 실험 기구 3D 메쉬 팩토리 — 소유: 에이전트 B
// 저폴리 프리미티브 조합, 텍스처 금지(디지털 표시부의 CanvasTexture만 예외).
// 각 makeXxx(THREE) => Object3D. 전체 크기 ≤0.3m, 원점(0,0,0) = 바닥 중심.
// 디자인: 다크 금속(#2d3452 계열) + 시안(#00b4d8) 포인트, 은은한 baseline 발광.
// ═══════════════════════════════════════════════════════════

const METAL = 0x2d3452;
const METAL_DARK = 0x1a1e2e;
const CYAN = 0x00b4d8;
const AMBER = 0xf4a261;

function metalMat(THREE, color = METAL, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.45, ...opts });
}

function glowDot(THREE, color = CYAN, intensity = 0.5, radius = 0.004) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0e16, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mat);
}

/** 작은 디지털 표시 화면(CanvasTexture) — psensor/thermo 공용 */
function makeDigitalScreen(THREE, width = 0.045, height = 0.022) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.userData.__canvas = canvas;
  mesh.userData.__texture = texture;

  function render(text) {
    ctx.fillStyle = '#0a2229';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,180,216,0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.fillStyle = '#5df2ff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }
  render('--');
  return { mesh, updateReading: render };
}

// ── 실린더 + 피스톤 (핵심 기구) ───────────────────────────
export function makeCylinder(THREE) {
  const group = new THREE.Group();
  const CYL_R = 0.045, CYL_H = 0.2, WALL = 0.005;
  const innerR = CYL_R - WALL;      // 입자·피스톤이 움직이는 유효 반지름
  const floorY = 0.016;             // 바닥판 두께 위, 기체가 존재하는 하한
  const topY = CYL_H - 0.015;       // 피스톤이 도달할 수 있는 상한(중심 y)

  // 바닥판(밀폐)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(CYL_R, CYL_R, 0.012, 20), metalMat(THREE));
  base.position.y = 0.006;
  group.add(base);

  // 투명 유리 실린더 벽 (MeshStandardMaterial opacity — 태블릿 성능 고려, transmission 미사용)
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(CYL_R, CYL_R, CYL_H, 20, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xcfeeff, transparent: true, opacity: 0.25, metalness: 0.05, roughness: 0.08,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  glass.position.y = CYL_H / 2;
  group.add(glass);

  // 눈금 (5개, 바깥벽 전면에 얇은 틱)
  for (let i = 0; i < 5; i++) {
    const y = floorY + ((topY - floorY) * i) / 4;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.0015, 0.002),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
    );
    tick.position.set(0, y, CYL_R - 0.001);
    group.add(tick);
  }

  // 내부 피스톤 디스크(눈에 보임)
  const pistonDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(innerR - 0.002, innerR - 0.002, 0.012, 20),
    metalMat(THREE, 0x333a56, { emissive: CYAN, emissiveIntensity: 0.08 })
  );
  const initialY = floorY + ((5.0 - 1) / 9) * (topY - floorY); // 기본 V=5L 반영
  pistonDisc.position.y = initialY;
  group.add(pistonDisc);

  // baseline 발광 포인트 (바닥 테두리)
  const dot = glowDot(THREE, CYAN, 0.35, 0.003);
  dot.position.set(CYL_R - 0.006, 0.006, 0);
  group.add(dot);

  group.userData = {
    pistonDisc,
    innerRadius: innerR - 0.006, // 입자 반경 여유
    floorY,
    topY,
    // V(1~10L) → 피스톤 중심 y좌표 매핑
    volumeToY(V) {
      const t = Math.min(1, Math.max(0, (V - 1) / 9));
      return floorY + t * (topY - floorY);
    },
  };
  return group;
}

// ── 가열판 ─────────────────────────────────────────────
export function makeHeater(THREE) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), metalMat(THREE));
  base.position.y = 0.01;
  group.add(base);

  const heatMat = new THREE.MeshStandardMaterial({
    color: METAL_DARK, emissive: AMBER, emissiveIntensity: 0.05, metalness: 0.3, roughness: 0.5,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.1), heatMat);
  top.position.y = 0.023;
  group.add(top);

  const dot = glowDot(THREE, CYAN, 0.4, 0.003);
  dot.position.set(0.05, 0.021, 0.05);
  group.add(dot);

  group.userData = { heatMat };
  return group;
}

// ── 가스통 + 밸브 ──────────────────────────────────────
export function makeGastank(THREE) {
  const group = new THREE.Group();

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 14), metalMat(THREE));
  foot.position.y = 0.004;
  group.add(foot);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.09, 14), metalMat(THREE, 0x2d3452));
  body.position.y = 0.008 + 0.045;
  group.add(body);

  // 시안 악센트 스트라이프
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0225, 0.0225, 0.01, 14),
    new THREE.MeshStandardMaterial({ color: 0x0a2229, emissive: CYAN, emissiveIntensity: 0.5 })
  );
  stripe.position.y = 0.06;
  group.add(stripe);

  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 0.02, 14), metalMat(THREE));
  shoulder.position.y = 0.098 + 0.01;
  group.add(shoulder);

  // 밸브(회전 표시용 그룹)
  const valveGroup = new THREE.Group();
  valveGroup.position.y = 0.128;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.018, 8), metalMat(THREE));
  stem.position.y = 0.009;
  valveGroup.add(stem);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.015, 0.003, 6, 14),
    metalMat(THREE, 0x3a4166, { emissive: CYAN, emissiveIntensity: 0.15 })
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.y = 0.02;
  valveGroup.add(handle);
  group.add(valveGroup);

  const dot = glowDot(THREE, CYAN, 0.4, 0.003);
  dot.position.set(0.024, 0.05, 0.02);
  group.add(dot);

  group.userData = { valveHandle: valveGroup };
  return group;
}

// ── 압력 센서 ───────────────────────────────────────────
export function makePsensor(THREE) {
  const group = new THREE.Group();

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.01, 0.04), metalMat(THREE));
  foot.position.y = 0.005;
  group.add(foot);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.032), metalMat(THREE, 0x252b40));
  housing.position.y = 0.01 + 0.0225;
  group.add(housing);

  const screen = makeDigitalScreen(THREE, 0.048, 0.024);
  screen.mesh.position.set(0, 0.033, 0.017);
  group.add(screen.mesh);

  const dot = glowDot(THREE, CYAN, 0.5, 0.0035);
  dot.position.set(0.024, 0.05, 0.014);
  group.add(dot);

  group.userData = { updateReading: screen.updateReading };
  return group;
}

// ── 온도계 스탠드 ───────────────────────────────────────
export function makeThermo(THREE) {
  const group = new THREE.Group();

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.01, 14), metalMat(THREE));
  foot.position.y = 0.005;
  group.add(foot);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 8), metalMat(THREE, 0x3a4166));
  rod.position.y = 0.01 + 0.06;
  group.add(rod);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.011, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a1015, emissive: 0xe63946, emissiveIntensity: 0.3 })
  );
  bulb.position.y = 0.014;
  group.add(bulb);

  const screen = makeDigitalScreen(THREE, 0.044, 0.022);
  screen.mesh.position.set(0, 0.1, 0.005);
  group.add(screen.mesh);

  const dot = glowDot(THREE, CYAN, 0.4, 0.003);
  dot.position.set(0, 0.13, 0);
  group.add(dot);

  group.userData = { updateReading: screen.updateReading };
  return group;
}

// ── 추 세트 (1kg 원판 스택) ─────────────────────────────
export function makeWeightSet(THREE) {
  const group = new THREE.Group();
  const discMat = metalMat(THREE, 0x333a56, { emissive: AMBER, emissiveIntensity: 0.06 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, emissive: AMBER, emissiveIntensity: 0.4 });
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const h = 0.013;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, h, 16), discMat);
    disc.position.y = y + h / 2;
    group.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0015, 6, 16), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y + h;
    group.add(rim);
    y += h + 0.001;
  }
  return group;
}

// ── 피스톤 고정핀 ───────────────────────────────────────
export function makePin(THREE) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), metalMat(THREE, 0x3a4166));
  shaft.position.y = 0.025;
  group.add(shaft);
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.006, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a2229, emissive: CYAN, emissiveIntensity: 0.4 })
  );
  head.position.y = 0.053;
  group.add(head);
  return group;
}
