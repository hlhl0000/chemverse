// ═══════════════════════════════════════════════════════════
// buildLab — 실험실 공간 (12×16m): 벽/바닥/조명/실험대 4개/선반/포털 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';

const ROOM_W = 12, ROOM_D = 16;         // x, z
const HALF_W = ROOM_W / 2, HALF_D = ROOM_D / 2;
const WALL_H = 3.2, WALL_T = 0.2;
const COL_WALL = 0x161a26;
const COL_FLOOR = 0x10131b;
const COL_BENCH = 0x1c2233;
const COL_SHELF = 0x232a3d;
const COL_SHELF_BOARD = 0x2a3348;
const COL_CYAN = 0x00b4d8;

// ── 라벨 스프라이트 (CanvasTexture) ──
function makeLabelSprite(text, opts = {}) {
  const { fontSize = 30, color = '#eaf6fb', scale = 0.42 } = opts;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 14;
  ctx.font = `600 ${fontSize}px sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(9,12,19,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,180,216,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = w / h;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

function disposeObject(o) {
  o.geometry?.dispose();
  if (o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
  }
}

export function buildLab(engine) {
  const group = new THREE.Group();
  const colliders = [];
  const disposers = [];

  // ── 조명 (그림자 없음) ──
  const hemi = new THREE.HemisphereLight(0x2c3a5c, 0x05070c, 1.0);
  const dir = new THREE.DirectionalLight(0xdfeeff, 0.55);
  dir.position.set(4, 8, 3);
  dir.castShadow = false;
  group.add(hemi, dir);

  // ── 바닥 + 미세 그리드 ──
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshLambertMaterial({ color: COL_FLOOR })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const gridPts = [];
  for (let x = -HALF_W; x <= HALF_W + 1e-6; x += 1) gridPts.push(x, 0.006, -HALF_D, x, 0.006, HALF_D);
  for (let z = -HALF_D; z <= HALF_D + 1e-6; z += 1) gridPts.push(-HALF_W, 0.006, z, HALF_W, 0.006, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x1c2740, transparent: true, opacity: 0.55 }));
  group.add(grid);

  // ── 천장(단순 차폐용) ──
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshBasicMaterial({ color: 0x080a10, side: THREE.BackSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  group.add(ceiling);

  // ── 벽 4면 + 하단 시안 발광 스트립 ──
  const wallMat = new THREE.MeshLambertMaterial({ color: COL_WALL });
  const stripMat = new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.55 });

  function addWall(cx, cz, w, d) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
    wall.position.set(cx, WALL_H / 2, cz);
    group.add(wall);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
      new THREE.Vector3(cx + w / 2, WALL_H, cz + d / 2)
    ));
    // 하단 발광 스트립 (벽 안쪽 면에 살짝 띄워서)
    const inward = cx !== 0 ? (cx > 0 ? -1 : 1) : (cz > 0 ? -1 : 1);
    const stripLen = Math.max(w, d) - 0.3;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w === ROOM_W ? stripLen : 0.04, 0.05, d === ROOM_D ? stripLen : 0.04), stripMat);
    if (w === ROOM_W) strip.position.set(cx, 0.14, cz + inward * (d / 2 - 0.02) * (cz !== 0 ? 1 : 1));
    strip.position.set(
      cx + (cx !== 0 ? inward * (w / 2 - 0.02) : 0),
      0.14,
      cz + (cz !== 0 ? inward * (d / 2 - 0.02) : 0)
    );
    if (w === ROOM_W) strip.scale.set(stripLen / (w === ROOM_W ? stripLen : 1), 1, 1); // no-op safeguard
    group.add(strip);
  }
  addWall(0, -HALF_D, ROOM_W, WALL_T);   // 북쪽 (포털)
  addWall(0, HALF_D, ROOM_W, WALL_T);    // 남쪽 (스폰)
  addWall(-HALF_W, 0, WALL_T, ROOM_D);   // 서쪽 (선반)
  addWall(HALF_W, 0, WALL_T, ROOM_D);    // 동쪽

  // ── 실험대 4개 ──
  const benchMat = new THREE.MeshLambertMaterial({ color: COL_BENCH });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x12151f });
  const legGeo = new THREE.BoxGeometry(0.06, 0.85, 0.06);
  const topGeo = new THREE.BoxGeometry(1.6, 0.06, 0.9);
  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x121722, emissive: new THREE.Color(COL_CYAN), emissiveIntensity: 0.35, roughness: 0.6 });
  const consoleScreenMat = new THREE.MeshBasicMaterial({ color: 0x0d3b46 });

  const benchDefs = [
    { id: 'bench1', pos: [-2.5, -4], consoleSide: -1 },
    { id: 'bench2', pos: [2.5, -4], consoleSide: 1 },
    { id: 'bench3', pos: [-2.5, -0.5], consoleSide: -1 },
    { id: 'bench4', pos: [2.5, -0.5], consoleSide: 1 },
  ];
  const benches = benchDefs.map(({ id, pos: [bx, bz], consoleSide }) => {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(bx, 0, bz);
    group.add(benchGroup);

    const top = new THREE.Mesh(topGeo, benchMat);
    top.position.y = 0.87;
    benchGroup.add(top);
    [[-0.72, -0.38], [0.72, -0.38], [-0.72, 0.38], [0.72, 0.38]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.425, lz);
      benchGroup.add(leg);
    });

    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.9, 0);
    benchGroup.add(anchor);

    // 콘솔 패널
    const consoleObj = new THREE.Group();
    consoleObj.position.set(consoleSide * 0.95, 0, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.5), consoleMat);
    panel.position.y = 0.65;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), consoleScreenMat);
    screen.position.set(consoleSide > 0 ? -0.041 : 0.041, 0.75, 0);
    screen.rotation.y = consoleSide > 0 ? Math.PI / 2 : -Math.PI / 2;
    consoleObj.add(panel, screen);
    panel.userData.interactable = { kind: 'tap', id: 'console', benchId: id };
    screen.userData.interactable = { kind: 'tap', id: 'console', benchId: id };
    benchGroup.add(consoleObj);

    colliders.push(new THREE.Box3(
      new THREE.Vector3(bx - 0.85, 0, bz - 0.5),
      new THREE.Vector3(bx + 0.85, 0.95, bz + 0.5)
    ));
    colliders.push(new THREE.Box3(
      new THREE.Vector3(bx + consoleSide * 0.95 - 0.3, 0, bz - 0.28),
      new THREE.Vector3(bx + consoleSide * 0.95 + 0.3, 1.3, bz + 0.28)
    ));

    return { id, anchor, console: consoleObj };
  });

  // ── 기구 선반 (서쪽 벽면 3단) ──
  const SHELF_X = -HALF_W + 0.35;
  const TIERS_Y = [0.55, 1.05, 1.55];
  const Z_START = -6.2, Z_END = 1.6, Z_STEP = 0.95;

  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(SHELF_X, 0, 0);
  group.add(shelfGroup);

  const postGeo = new THREE.BoxGeometry(0.06, 1.9, 0.06);
  const postMat = new THREE.MeshLambertMaterial({ color: COL_SHELF });
  [Z_START - 0.4, Z_END + 0.4].forEach((z) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(0, 0.95, z);
    shelfGroup.add(p);
  });
  const boardGeo = new THREE.BoxGeometry(0.4, 0.03, (Z_END - Z_START) + 1.0);
  const boardMat = new THREE.MeshLambertMaterial({ color: COL_SHELF_BOARD });
  TIERS_Y.forEach((y) => {
    const b = new THREE.Mesh(boardGeo, boardMat);
    b.position.set(0.2, y, (Z_START + Z_END) / 2);
    b.userData.interactable = { kind: 'tap', id: 'shelf' };
    shelfGroup.add(b);
  });

  colliders.push(new THREE.Box3(
    new THREE.Vector3(SHELF_X - 0.05, 0, Z_START - 0.5),
    new THREE.Vector3(SHELF_X + 0.5, 1.9, Z_END + 0.5)
  ));

  let stocked = [];
  function stock(items) {
    clear();
    let i = 0;
    outer:
    for (const tierY of TIERS_Y) {
      for (let z = Z_START; z <= Z_END; z += Z_STEP) {
        if (i >= items.length) break outer;
        const item = items[i++];
        const mesh = item.mesh;
        mesh.position.set(0.22, tierY + 0.14, z);
        mesh.userData.interactable = { kind: 'carry', equipmentId: item.equipmentId, name: item.name };
        shelfGroup.add(mesh);

        const label = makeLabelSprite(item.name, { fontSize: 24, scale: 0.26 });
        label.position.set(0.22, tierY + 0.32, z);
        shelfGroup.add(label);

        stocked.push({ mesh, label });
      }
    }
    // 슬롯이 부족하면 맨 위 단 뒤쪽으로 이어붙임 (안전장치)
    let extra = 0;
    while (i < items.length) {
      const item = items[i++];
      const mesh = item.mesh;
      const z = Z_END + 0.7 + extra * 0.5;
      extra++;
      mesh.position.set(0.22, TIERS_Y[2] + 0.14, z);
      mesh.userData.interactable = { kind: 'carry', equipmentId: item.equipmentId, name: item.name };
      shelfGroup.add(mesh);
      const label = makeLabelSprite(item.name, { fontSize: 24, scale: 0.26 });
      label.position.set(0.22, TIERS_Y[2] + 0.32, z);
      shelfGroup.add(label);
      stocked.push({ mesh, label });
    }
  }
  function clear() {
    for (const { mesh, label } of stocked) {
      shelfGroup.remove(mesh);
      mesh.traverse(disposeObject);
      shelfGroup.remove(label);
      disposeObject(label);
    }
    stocked = [];
  }
  const shelf = { stock, clear };

  // ── 자연 공간 포털 ──
  const portal = new THREE.Group();
  portal.position.set(0, 1.3, -HALF_D + 0.06);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.85 })
  );
  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 32),
    new THREE.MeshBasicMaterial({ color: 0x00323d, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  ring.userData.interactable = { kind: 'tap', id: 'portal:nature' };
  innerDisc.userData.interactable = { kind: 'tap', id: 'portal:nature' };
  portal.add(ring, innerDisc);
  const portalLabel = makeLabelSprite('자연 관찰장 →');
  portalLabel.position.set(0, 1.5, 0);
  portal.add(portalLabel);
  group.add(portal);

  // 포털 펄스 애니메이션
  const offPulse = engine.onUpdate(() => {
    const t = performance.now() / 600;
    const s = 1 + Math.sin(t) * 0.04;
    ring.scale.set(s, s, 1);
    ring.material.opacity = 0.65 + Math.sin(t) * 0.2;
  });
  disposers.push(offPulse);

  return {
    group,
    colliders,
    spawn: { pos: [0, 0, 5], ry: 0 },
    benches,
    shelf,
    dispose() {
      disposers.forEach((off) => off?.());
      shelf.clear();
      group.traverse(disposeObject);
    },
  };
}
