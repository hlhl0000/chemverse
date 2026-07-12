// ═══════════════════════════════════════════════════════════
// items.js — 부품·무기 실물 메쉬 + 크레이트/드랍 아이템 매니저 (소유: 에이전트 A)
// 신규 작성(본편 대응 파일 없음). 이름표 스프라이트 의존 금지 — 실물 외형 특징으로 즉시 식별.
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약과 동일한 관례).
// 지오메트리·머티리얼은 모듈 전역 캐시로 공유(부품당 1회 생성) — 프레임당 신규 할당 금지.
// ═══════════════════════════════════════════════════════════

const WEAPON_IDS = new Set(['spoit', 'buret', 'spray', 'flask']);

const ITEM_NAMES = {
  thermo: '온도계', gascan: '휴대용 기체 통', syringe: '주사기',
  tube: '투명 튜브 관', balance: '전자저울', stand: '스탠드와 집게',
  spoit: '스포이트 물총', buret: '뷰렛 스나이퍼', spray: '시약 분무기', flask: '부피 플라스크',
};

export function itemName(itemId) { return ITEM_NAMES[itemId] || itemId; }
export function isWeaponItem(itemId) { return WEAPON_IDS.has(itemId); }

// ── 공유 지오메트리/머티리얼 캐시 (세션 전체에서 재사용) ──
const _geoCache = new Map();
const _matCache = new Map();

function cGeo(key, factory) {
  if (!_geoCache.has(key)) _geoCache.set(key, factory());
  return _geoCache.get(key);
}
function cMat(key, factory) {
  if (!_matCache.has(key)) _matCache.set(key, factory());
  return _matCache.get(key);
}

// 그룹 내 모든 메쉬를 "공유 자원" 표식(dispose 시 지오메트리/머티리얼을 건드리면 안 됨)
function markShared(group) {
  group.traverse((o) => { if (o.isMesh) o.userData.sharedItem = true; });
  return group;
}

function mesh(THREE, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  return m;
}

// ═══════════════════ 부품 메쉬 (높이 ~0.5m, 원점=바닥 중심) ═══════════════════

function buildThermo(THREE) {
  const g = new THREE.Group();
  const glassMat = cMat('thermo.glass', () => new THREE.MeshLambertMaterial({ color: 0xf3f7fb, transparent: true, opacity: 0.55, depthWrite: false }));
  const redMat = cMat('thermo.red', () => new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  const tickMat = cMat('thermo.tick', () => new THREE.MeshBasicMaterial({ color: 0x8b93a7 }));

  const bulbGeo = cGeo('thermo.bulb', () => new THREE.SphereGeometry(0.045, 10, 8));
  const bulb = mesh(THREE, bulbGeo, redMat);
  bulb.position.set(0, 0.05, 0);
  g.add(bulb);

  const tubeGeo = cGeo('thermo.tube', () => new THREE.CylinderGeometry(0.032, 0.032, 0.38, 10));
  const tube = mesh(THREE, tubeGeo, glassMat);
  tube.position.set(0, 0.28, 0);
  g.add(tube);

  const colGeo = cGeo('thermo.col', () => new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8));
  const col = mesh(THREE, colGeo, redMat);
  col.position.set(0, 0.2, 0);
  g.add(col);

  const tickGeo = cGeo('thermo.tickring', () => new THREE.TorusGeometry(0.033, 0.004, 6, 12));
  for (const y of [0.2, 0.3, 0.4]) {
    const ring = mesh(THREE, tickGeo, tickMat);
    ring.position.set(0, y, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  return g;
}

function buildGascan(THREE) {
  const g = new THREE.Group();
  const bodyMat = cMat('gascan.body', () => new THREE.MeshLambertMaterial({ color: 0x00b4d8 }));
  const capMat = cMat('gascan.cap', () => new THREE.MeshLambertMaterial({ color: 0x2a3348 }));
  const valveMat = cMat('gascan.valve', () => new THREE.MeshLambertMaterial({ color: 0xff8a3d }));

  const bodyGeo = cGeo('gascan.bodygeo', () => new THREE.CylinderGeometry(0.09, 0.095, 0.34, 12));
  const body = mesh(THREE, bodyGeo, bodyMat);
  body.position.set(0, 0.21, 0);
  g.add(body);

  const nozzleGeo = cGeo('gascan.nozzle', () => new THREE.CylinderGeometry(0.02, 0.03, 0.09, 8));
  const nozzle = mesh(THREE, nozzleGeo, capMat);
  nozzle.position.set(0, 0.42, 0);
  g.add(nozzle);

  const valveGeo = cGeo('gascan.valvegeo', () => new THREE.TorusGeometry(0.045, 0.012, 6, 14));
  const valve = mesh(THREE, valveGeo, valveMat);
  valve.position.set(0, 0.47, 0);
  valve.rotation.x = Math.PI / 2;
  g.add(valve);
  return g;
}

function buildSyringe(THREE) {
  const g = new THREE.Group();
  const barrelMat = cMat('syringe.barrel', () => new THREE.MeshLambertMaterial({ color: 0xdcefff, transparent: true, opacity: 0.5, depthWrite: false }));
  const pistonMat = cMat('syringe.piston', () => new THREE.MeshLambertMaterial({ color: 0xeef2f5 }));
  const rodMat = cMat('syringe.rod', () => new THREE.MeshLambertMaterial({ color: 0x8b93a7 }));
  const ringMat = cMat('syringe.ring', () => new THREE.MeshBasicMaterial({ color: 0x35d07f }));

  const barrelGeo = cGeo('syringe.barrelgeo', () => new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12));
  const barrel = mesh(THREE, barrelGeo, barrelMat);
  barrel.position.set(0, 0.2, 0);
  g.add(barrel);

  const headGeo = cGeo('syringe.headgeo', () => new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12));
  const head = mesh(THREE, headGeo, pistonMat);
  head.position.set(0, 0.18, 0);
  g.add(head);

  const rodGeo = cGeo('syringe.rodgeo', () => new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8));
  const rod = mesh(THREE, rodGeo, rodMat);
  rod.position.set(0, 0.42, 0);
  g.add(rod);

  const handleGeo = cGeo('syringe.handlegeo', () => new THREE.BoxGeometry(0.09, 0.02, 0.03));
  const handle = mesh(THREE, handleGeo, rodMat);
  handle.position.set(0, 0.49, 0);
  g.add(handle);

  const tickGeo = cGeo('syringe.tickgeo', () => new THREE.TorusGeometry(0.046, 0.004, 6, 12));
  for (const y of [0.14, 0.22, 0.3]) {
    const ring = mesh(THREE, tickGeo, ringMat);
    ring.position.set(0, y, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  return g;
}

function buildTube(THREE) {
  const g = new THREE.Group();
  const tubeMat = cMat('tube.mat', () => new THREE.MeshLambertMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.45, depthWrite: false }));
  const coilGeo = cGeo('tube.coil', () => new THREE.TorusGeometry(0.11, 0.02, 8, 20));
  const ys = [0.08, 0.19, 0.3];
  ys.forEach((y, i) => {
    const loop = mesh(THREE, coilGeo, tubeMat);
    loop.position.set(0, y, 0);
    loop.rotation.x = Math.PI / 2;
    loop.rotation.z = i * 0.35;
    g.add(loop);
  });
  return g;
}

function buildBalance(THREE) {
  const g = new THREE.Group();
  const bodyMat = cMat('balance.body', () => new THREE.MeshLambertMaterial({ color: 0x2a3348 }));
  const plateMat = cMat('balance.plate', () => new THREE.MeshLambertMaterial({ color: 0xd7dce2 }));
  const dispMat = cMat('balance.disp', () => new THREE.MeshBasicMaterial({ color: 0x35d07f }));

  const bodyGeo = cGeo('balance.bodygeo', () => new THREE.BoxGeometry(0.32, 0.07, 0.22));
  const body = mesh(THREE, bodyGeo, bodyMat);
  body.position.set(0, 0.035, 0);
  g.add(body);

  const plateGeo = cGeo('balance.plategeo', () => new THREE.BoxGeometry(0.26, 0.015, 0.18));
  const plate = mesh(THREE, plateGeo, plateMat);
  plate.position.set(0, 0.078, 0);
  g.add(plate);

  const dispGeo = cGeo('balance.dispgeo', () => new THREE.BoxGeometry(0.1, 0.05, 0.015));
  const disp = mesh(THREE, dispGeo, dispMat);
  disp.position.set(0, 0.06, 0.112);
  g.add(disp);
  return g;
}

function buildStand(THREE) {
  const g = new THREE.Group();
  const metalMat = cMat('stand.metal', () => new THREE.MeshLambertMaterial({ color: 0x8b93a7 }));
  const baseMat = cMat('stand.base', () => new THREE.MeshLambertMaterial({ color: 0x2a3348 }));

  const baseGeo = cGeo('stand.basegeo', () => new THREE.BoxGeometry(0.28, 0.03, 0.2));
  const base = mesh(THREE, baseGeo, baseMat);
  base.position.set(0, 0.015, 0);
  g.add(base);

  const rodGeo = cGeo('stand.rodgeo', () => new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8));
  const rod = mesh(THREE, rodGeo, metalMat);
  rod.position.set(-0.08, 0.225, 0);
  g.add(rod);

  const armGeo = cGeo('stand.armgeo', () => new THREE.BoxGeometry(0.2, 0.018, 0.03));
  const arm = mesh(THREE, armGeo, metalMat);
  arm.position.set(0.02, 0.4, 0);
  g.add(arm);

  const jawGeo = cGeo('stand.jawgeo', () => new THREE.BoxGeometry(0.02, 0.05, 0.03));
  const jawA = mesh(THREE, jawGeo, metalMat);
  jawA.position.set(0.1, 0.37, 0.012);
  const jawB = mesh(THREE, jawGeo, metalMat);
  jawB.position.set(0.1, 0.37, -0.012);
  g.add(jawA, jawB);
  return g;
}

const PART_BUILDERS = {
  thermo: buildThermo, gascan: buildGascan, syringe: buildSyringe,
  tube: buildTube, balance: buildBalance, stand: buildStand,
};

export function makePartMesh(THREE, partId) {
  const builder = PART_BUILDERS[partId];
  const g = builder ? builder(THREE) : buildFallback(THREE, 0xffd166);
  g.userData.itemId = partId;
  return markShared(g);
}

function buildFallback(THREE, color) {
  const g = new THREE.Group();
  const geo = cGeo('fallback.geo', () => new THREE.BoxGeometry(0.3, 0.3, 0.3));
  const mat = cMat(`fallback.mat.${color}`, () => new THREE.MeshLambertMaterial({ color }));
  const m = mesh(THREE, geo, mat);
  m.position.set(0, 0.15, 0);
  g.add(m);
  return g;
}

// ═══════════════════ 무기 메쉬 (손에 들 크기 ~0.4m) ═══════════════════
// 그룹 로컬 -Z가 총구/투척 방향(전방), 원점은 손에 쥐는 손잡이 위치.

function buildSpoit(THREE) {
  const g = new THREE.Group();
  const rubberMat = cMat('spoit.rubber', () => new THREE.MeshLambertMaterial({ color: 0x2c2f36 }));
  const glassMat = cMat('spoit.glass', () => new THREE.MeshLambertMaterial({ color: 0xdcefff, transparent: true, opacity: 0.6, depthWrite: false }));

  const bulbGeo = cGeo('spoit.bulbgeo', () => new THREE.SphereGeometry(0.055, 10, 8));
  const bulb = mesh(THREE, bulbGeo, rubberMat);
  bulb.scale.set(1, 1.3, 1);
  bulb.position.set(0, 0, 0.14);
  g.add(bulb);

  const tubeGeo = cGeo('spoit.tubegeo', () => new THREE.CylinderGeometry(0.022, 0.028, 0.26, 10));
  const tube = mesh(THREE, tubeGeo, glassMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0, -0.05);
  g.add(tube);

  const tipGeo = cGeo('spoit.tipgeo', () => new THREE.ConeGeometry(0.014, 0.05, 8));
  const tip = mesh(THREE, tipGeo, glassMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0, -0.2);
  g.add(tip);
  return g;
}

function buildBuret(THREE) {
  const g = new THREE.Group();
  const glassMat = cMat('buret.glass', () => new THREE.MeshLambertMaterial({ color: 0xdcefff, transparent: true, opacity: 0.55, depthWrite: false }));
  const tickMat = cMat('buret.tick', () => new THREE.MeshBasicMaterial({ color: 0x00b4d8 }));
  const cockMat = cMat('buret.cock', () => new THREE.MeshLambertMaterial({ color: 0xff8a3d }));

  const tubeGeo = cGeo('buret.tubegeo', () => new THREE.CylinderGeometry(0.026, 0.026, 0.5, 10));
  const tube = mesh(THREE, tubeGeo, glassMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0, -0.08);
  g.add(tube);

  const tickGeo = cGeo('buret.tickgeo', () => new THREE.TorusGeometry(0.028, 0.003, 6, 10));
  for (let i = 0; i < 4; i++) {
    const r = mesh(THREE, tickGeo, tickMat);
    r.position.set(0, 0, 0.05 - i * 0.11);
    g.add(r);
  }

  const cockGeo = cGeo('buret.cockgeo', () => new THREE.CylinderGeometry(0.018, 0.018, 0.08, 8));
  const cock = mesh(THREE, cockGeo, cockMat);
  cock.rotation.z = Math.PI / 2;
  cock.position.set(0, -0.03, 0.16);
  g.add(cock);
  return g;
}

function buildSpray(THREE) {
  const g = new THREE.Group();
  const bottleMat = cMat('spray.bottle', () => new THREE.MeshLambertMaterial({ color: 0x35d07f }));
  const headMat = cMat('spray.head', () => new THREE.MeshLambertMaterial({ color: 0x2a3348 }));
  const trigMat = cMat('spray.trig', () => new THREE.MeshLambertMaterial({ color: 0xff8a3d }));

  const bodyGeo = cGeo('spray.bodygeo', () => new THREE.CylinderGeometry(0.05, 0.055, 0.22, 12));
  const body = mesh(THREE, bodyGeo, bottleMat);
  body.position.set(0, 0, 0.05);
  g.add(body);

  const headGeo = cGeo('spray.headgeo', () => new THREE.BoxGeometry(0.05, 0.05, 0.09));
  const head = mesh(THREE, headGeo, headMat);
  head.position.set(0, 0.02, -0.11);
  g.add(head);

  const nozzleGeo = cGeo('spray.nozzlegeo', () => new THREE.ConeGeometry(0.014, 0.05, 8));
  const nozzle = mesh(THREE, nozzleGeo, headMat);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.set(0, 0.02, -0.17);
  g.add(nozzle);

  const trigGeo = cGeo('spray.triggeo', () => new THREE.BoxGeometry(0.018, 0.07, 0.02));
  const trig = mesh(THREE, trigGeo, trigMat);
  trig.rotation.x = 0.4;
  trig.position.set(0, -0.05, -0.05);
  g.add(trig);
  return g;
}

function buildFlask(THREE) {
  const g = new THREE.Group();
  const glassMat = cMat('flask.glass', () => new THREE.MeshLambertMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.5, depthWrite: false }));
  const liquidMat = cMat('flask.liquid', () => new THREE.MeshLambertMaterial({ color: 0x00b4d8 }));

  const bulbGeo = cGeo('flask.bulbgeo', () => new THREE.SphereGeometry(0.1, 12, 10));
  const bulb = mesh(THREE, bulbGeo, glassMat);
  bulb.position.set(0, 0.1, 0);
  g.add(bulb);

  const liquidGeo = cGeo('flask.liquidgeo', () => new THREE.SphereGeometry(0.085, 10, 8));
  const liquid = mesh(THREE, liquidGeo, liquidMat);
  liquid.position.set(0, 0.07, 0);
  liquid.scale.set(1, 0.7, 1);
  g.add(liquid);

  const neckGeo = cGeo('flask.neckgeo', () => new THREE.CylinderGeometry(0.024, 0.032, 0.2, 10));
  const neck = mesh(THREE, neckGeo, glassMat);
  neck.position.set(0, 0.28, 0);
  g.add(neck);
  return g;
}

const WEAPON_BUILDERS = { spoit: buildSpoit, buret: buildBuret, spray: buildSpray, flask: buildFlask };

export function makeWeaponMesh(THREE, weaponId) {
  const builder = WEAPON_BUILDERS[weaponId];
  const g = builder ? builder(THREE) : buildFallback(THREE, 0x8b93a7);
  g.userData.itemId = weaponId;
  return markShared(g);
}

// ═══════════════════ 크레이트 프레임(열린 나무상자) ═══════════════════

function buildCrateFrame(THREE) {
  const g = new THREE.Group();
  const woodGeo = cGeo('crate.base', () => new THREE.BoxGeometry(0.66, 0.07, 0.66));
  const postGeo = cGeo('crate.post', () => new THREE.BoxGeometry(0.06, 0.3, 0.06));
  const rimGeo = cGeo('crate.rim', () => new THREE.BoxGeometry(0.66, 0.04, 0.06));

  const woodMatTpl = cMat('crate.woodTpl', () => new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
  const accentMatTpl = cMat('crate.accentTpl', () => new THREE.MeshLambertMaterial({ color: 0x00b4d8 }));

  const woodMat = woodMatTpl.clone();
  const accentMat = accentMatTpl.clone();

  const base = mesh(THREE, woodGeo, woodMat);
  base.position.set(0, 0.035, 0);
  base.userData.ownMaterial = true;
  g.add(base);

  const corners = [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]];
  for (const [x, z] of corners) {
    const post = mesh(THREE, postGeo, woodMat);
    post.position.set(x, 0.2, z);
    g.add(post);
  }

  const rimF = mesh(THREE, rimGeo, accentMat);
  rimF.position.set(0, 0.35, 0.3);
  rimF.userData.ownMaterial = true;
  const rimB = mesh(THREE, rimGeo, accentMat);
  rimB.position.set(0, 0.35, -0.3);
  g.add(rimF, rimB);

  g.userData.woodMat = woodMat;
  g.userData.accentMat = accentMat;
  return g;
}

function darkenFrame(frame) {
  if (frame.userData.taken) return;
  frame.userData.taken = true;
  frame.userData.woodMat.color.multiplyScalar(0.35);
  frame.userData.accentMat.color.multiplyScalar(0.3);
}

function disposeFrame(frame) {
  frame.userData.woodMat?.dispose();
  frame.userData.accentMat?.dispose();
}

// id 문자열 → 결정론적 0~1 (부유 위상 오프셋용, Math.random 미사용)
function hash01(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const u = (h >>> 0) / 4294967295;
  return u;
}

const FLOAT_BASE_Y = 0.9;  // 아이템 확대에 맞춰 크레이트 림 위로 상향
const FLOAT_AMP = 0.08;
const ITEM_SCALE = 1.15;   // 크레이트 내용물·드랍 표시 배율(사용자 요청: 크기 확대)
const FLOAT_SPEED = 0.8; // rad/s (부유), 회전은 별도 속도 사용

class FloatingItem {
  constructor(group, basePos, phase) {
    this.group = group;
    this.basePos = basePos; // [x,y,z] 지면 기준
    this.phase = phase;
  }
  update(t) {
    const y = this.basePos[1] + FLOAT_BASE_Y + Math.sin(t * FLOAT_SPEED + this.phase) * FLOAT_AMP;
    this.group.position.set(this.basePos[0], y, this.basePos[2]);
    this.group.rotation.y = t * FLOAT_SPEED + this.phase;
  }
}

export class ItemManager {
  constructor(scene, arenaHandle, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.arena = arenaHandle;
    this._t = 0;
    this._crateFrames = new Map();   // id -> frame Group
    this._crateContent = new Map();  // id -> {itemId, floating:FloatingItem}
    this._drops = new Map();         // id -> {itemId, floating:FloatingItem}
    this._buildCrates();
  }

  _buildCrates() {
    const crates = this.arena?.crates || [];
    for (const c of crates) {
      const frame = buildCrateFrame(this.THREE);
      frame.position.set(c.pos[0], c.pos[1], c.pos[2]);
      this.scene.add(frame);
      this._crateFrames.set(c.id, frame);

      const content = c.kind === 'weapon' ? makeWeaponMesh(this.THREE, c.itemId) : makePartMesh(this.THREE, c.itemId);
      content.scale.setScalar(ITEM_SCALE);
      this.scene.add(content);
      const floating = new FloatingItem(content, c.pos, hash01(c.id) * Math.PI * 2);
      floating.update(0);
      this._crateContent.set(c.id, { itemId: c.itemId, floating });
    }
  }

  crateTaken(crateId) {
    const entry = this._crateContent.get(crateId);
    if (entry) {
      this.scene.remove(entry.floating.group);
      this._crateContent.delete(crateId);
    }
    const frame = this._crateFrames.get(crateId);
    if (frame) darkenFrame(frame);
  }

  addDrop(id, itemId, pos) {
    if (this._drops.has(id)) return;
    const content = isWeaponItem(itemId) ? makeWeaponMesh(this.THREE, itemId) : makePartMesh(this.THREE, itemId);
    content.scale.setScalar(ITEM_SCALE);
    this.scene.add(content);
    const floating = new FloatingItem(content, pos, hash01(id) * Math.PI * 2);
    floating.update(this._t);
    this._drops.set(id, { itemId, floating });
  }

  removeDrop(id) {
    const entry = this._drops.get(id);
    if (!entry) return;
    this.scene.remove(entry.floating.group);
    this._drops.delete(id);
  }

  nearestPickup(pos, r = 2.0) {
    let best = null, bestD = r;
    for (const [id, entry] of this._crateContent) {
      const bp = entry.floating.basePos;
      const d = Math.hypot(pos[0] - bp[0], pos[2] - bp[2]);
      if (d < bestD) { bestD = d; best = { kind: 'crate', id, itemId: entry.itemId, name: itemName(entry.itemId) }; }
    }
    for (const [id, entry] of this._drops) {
      const bp = entry.floating.basePos;
      const d = Math.hypot(pos[0] - bp[0], pos[2] - bp[2]);
      if (d < bestD) { bestD = d; best = { kind: 'drop', id, itemId: entry.itemId, name: itemName(entry.itemId) }; }
    }
    return best;
  }

  update(dt) {
    this._t += dt;
    for (const entry of this._crateContent.values()) entry.floating.update(this._t);
    for (const entry of this._drops.values()) entry.floating.update(this._t);
  }

  dispose() {
    for (const entry of this._crateContent.values()) this.scene.remove(entry.floating.group);
    this._crateContent.clear();
    for (const frame of this._crateFrames.values()) { this.scene.remove(frame); disposeFrame(frame); }
    this._crateFrames.clear();
    for (const entry of this._drops.values()) this.scene.remove(entry.floating.group);
    this._drops.clear();
  }
}
