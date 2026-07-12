// ═══════════════════════════════════════════════════════════
// buildNature — 자연 관찰장: 저폴리 언덕, 고도 체험로(풍선 데모), 실험실 복귀 포털
// (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';
import { balloonScaleAtAltitude } from '../experiments/idealgas/model.js';

const HALF = 20; // PlaneGeometry(40,40)의 절반 크기
const TERRAIN_MAX_Y = 3.25;

// ── 지형 높이맵: 완만한 사인 합성(최대 약 3m, 저지대는 0으로 클램프 = "해수면") ──
function heightAt(x, z) {
  const h =
    1.2 * Math.sin(x * 0.14 + 0.4) +
    0.9 * Math.cos(z * 0.11 - 0.2) +
    0.5 * Math.sin((x - z) * 0.08);
  return Math.max(0, h * 0.75 + 1.3);
}

// 결정론적 의사난수(0~1) — 나무/바위 배치용
function hash(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// ── 라벨 스프라이트 (CanvasTexture) — lab.js 유틸 패턴 재사용 ──
function makeLabelSprite(text, opts = {}) {
  const { fontSize = 30, color = '#eaf6fb', scale = 0.42, mono = false } = opts;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 14;
  const family = mono ? "'Consolas','Courier New',monospace" : 'sans-serif';
  ctx.font = `600 ${fontSize}px ${family}`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `600 ${fontSize}px ${family}`;
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

// 언덕에서 가장 낮은/중간/높은 지점을 표본 탐색 (고도 체험로 배치용)
function findTrailPoints() {
  const pts = [];
  const step = 0.6, ext = 17;
  for (let x = -ext; x <= ext; x += step) {
    for (let z = -ext; z <= ext; z += step) {
      pts.push({ x, z, h: heightAt(x, z) });
    }
  }
  let low = pts[0], high = pts[0];
  for (const p of pts) {
    if (p.h < low.h) low = p;
    if (p.h > high.h) high = p;
  }
  const midTarget = (low.h + high.h) / 2;
  let mid = null, bestDiff = Infinity;
  for (const p of pts) {
    if (Math.hypot(p.x - low.x, p.z - low.z) < 5) continue;
    if (Math.hypot(p.x - high.x, p.z - high.z) < 5) continue;
    const diff = Math.abs(p.h - midTarget);
    if (diff < bestDiff) { bestDiff = diff; mid = p; }
  }
  if (!mid) mid = { x: (low.x + high.x) / 2, z: (low.z + high.z) / 2, h: midTarget };
  return { low, mid, high };
}

export function buildNature(engine) {
  const group = new THREE.Group();
  const colliders = [];
  const disposers = [];

  // ── 하늘 배경/안개 (진입 시 교체, dispose에서 복원) ──
  const origBackground = engine.scene.background;
  const origFog = engine.scene.fog;
  engine.scene.background = new THREE.Color(0x87b5d4);
  engine.scene.fog = new THREE.Fog(0x9fc4dc, 16, 70);

  // ── 조명 (그림자 없음, group에 포함 → dispose 시 함께 제거) ──
  const hemi = new THREE.HemisphereLight(0xcdeaff, 0x4d5a34, 1.15);
  const dir = new THREE.DirectionalLight(0xfff2d8, 0.95);
  dir.position.set(6, 14, 4);
  dir.castShadow = false;
  group.add(hemi, dir);

  // ── 저폴리 언덕 지형 (정점 y = 높이맵, vertex color 그라데이션, flatShading) ──
  const geo = new THREE.PlaneGeometry(40, 40, 48, 48);
  geo.rotateX(-Math.PI / 2); // 평평하게 눕힘: 이제 local x/z = 지면, y = 고도
  const posAttr = geo.attributes.position;
  const colorArr = new Float32Array(posAttr.count * 3);
  const dark = new THREE.Color(0x1b3a1c);
  const bright = new THREE.Color(0x8fd85a);
  const tmp = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = heightAt(x, z);
    posAttr.setY(i, y);
    const t = THREE.MathUtils.clamp(y / TERRAIN_MAX_Y, 0, 1);
    tmp.copy(dark).lerp(bright, t);
    colorArr[i * 3] = tmp.r; colorArr[i * 3 + 1] = tmp.g; colorArr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  group.add(terrain);

  function getGroundY(x, z) {
    const cx = THREE.MathUtils.clamp(x, -HALF + 0.5, HALF - 0.5);
    const cz = THREE.MathUtils.clamp(z, -HALF + 0.5, HALF - 0.5);
    return heightAt(cx, cz);
  }

  // ── 나무 12그루 (InstancedMesh: 줄기 + 잎) ──
  const TREE_COUNT = 12;
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 1.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b4632, flatShading: true });
  const leavesGeo = new THREE.ConeGeometry(0.95, 1.7, 7);
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2f6b34, flatShading: true });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const leavesInst = new THREE.InstancedMesh(leavesGeo, leavesMat, TREE_COUNT);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < TREE_COUNT; i++) {
    const a = (i / TREE_COUNT) * Math.PI * 2 + hash(i) * 0.6;
    const r = 8.5 + (i % 3) * 3.4 + hash(i + 50) * 1.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const gy = getGroundY(x, z);
    const s = 0.85 + hash(i + 7) * 0.5;
    const ry = hash(i) * Math.PI * 2;

    dummy.position.set(x, gy + 0.8 * s, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, gy + 2.45 * s, z);
    dummy.updateMatrix();
    leavesInst.setMatrixAt(i, dummy.matrix);

    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.22 * s, gy, z - 0.22 * s),
      new THREE.Vector3(x + 0.22 * s, gy + 2.6 * s, z + 0.22 * s)
    ));
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  leavesInst.instanceMatrix.needsUpdate = true;
  group.add(trunkInst, leavesInst);

  // ── 바위 5개 ──
  const ROCK_COUNT = 5;
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b7280, flatShading: true });
  for (let i = 0; i < ROCK_COUNT; i++) {
    const a = (i / ROCK_COUNT) * Math.PI * 2 + 0.9 + hash(i + 20) * 0.5;
    const r = 6 + hash(i + 30) * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const gy = getGroundY(x, z);
    const s = 0.35 + hash(i + 40) * 0.35;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(x, gy + s * 0.4, z);
    rock.rotation.set(hash(i) * Math.PI, hash(i + 1) * Math.PI, hash(i + 2) * Math.PI);
    group.add(rock);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - s, gy, z - s),
      new THREE.Vector3(x + s, gy + s * 1.4, z + s)
    ));
  }

  // ── 고도 체험로: 표지판 3개 + 밀봉 풍선 (해수면→고고도 순) ──
  const { low, mid, high } = findTrailPoints();
  const ALT_SPECS = [
    { alt: 0, label: '해수면 0 m', point: low },
    { alt: 1000, label: '1,000 m', point: mid },
    { alt: 3000, label: '3,000 m', point: high },
  ];

  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b5842 });
  const boardMat = new THREE.MeshLambertMaterial({ color: 0x2a3348 });
  const balloonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.38, roughness: 0.25, metalness: 0.05,
  });
  const knotMat = new THREE.MeshLambertMaterial({ color: 0xc9d3da });

  for (const spec of ALT_SPECS) {
    const { x, z, h: gy } = spec.point;

    // 표지판
    const postH = 1.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, postH, 6), postMat);
    post.position.set(x, gy + postH / 2, z);
    group.add(post);

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.46, 0.05), boardMat);
    board.position.set(x, gy + postH + 0.05, z);
    group.add(board);

    const nameLabel = makeLabelSprite(spec.label, { fontSize: 30, scale: 0.4 });
    nameLabel.position.set(x, gy + postH + 0.34, z);
    group.add(nameLabel);

    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.18, gy, z - 0.18),
      new THREE.Vector3(x + 0.18, gy + postH + 0.35, z + 0.18)
    ));

    // 밀봉 풍선 (반투명 흰 구 + 매듭 원뿔), 반지름 = 0.25 × 배율^(1/3)
    const scaleV = balloonScaleAtAltitude(spec.alt);
    const radius = 0.25 * Math.cbrt(scaleV);
    const bx = x + 0.95, bz = z + 0.35;
    const by = gy + 1.1 + radius;

    const balloonGroup = new THREE.Group();
    balloonGroup.position.set(bx, by, bz);

    const balloonMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), balloonMat);
    balloonGroup.add(balloonMesh);

    const knotH = radius * 0.35;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.18, knotH, 6), knotMat);
    knot.position.set(0, -radius - knotH / 2, 0);
    knot.rotation.x = Math.PI;
    balloonGroup.add(knot);

    // 데이터 라벨: "고도 X m / P ≈ Y kPa / V/V₀ = Z" (모노스페이스)
    const pKpa = 101.325 / scaleV;
    const dataText = `고도 ${spec.alt.toLocaleString('ko-KR')} m / P ≈ ${pKpa.toFixed(1)} kPa / V/V₀ = ${scaleV.toFixed(2)}`;
    const dataLabel = makeLabelSprite(dataText, { fontSize: 22, scale: 0.3, mono: true });
    dataLabel.position.set(0, radius + 0.32, 0);
    balloonGroup.add(dataLabel);

    group.add(balloonGroup);
  }

  // ── 실험실 복귀 포털 (발광 시안 링) — 스폰(ry:0 → -Z 방향 응시) 정면에 배치 ──
  const portalPoint = { x: 0, z: -1, h: getGroundY(0, -1) };
  const portal = new THREE.Group();
  portal.position.set(portalPoint.x, portalPoint.h + 1.3, portalPoint.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.85 })
  );
  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 32),
    new THREE.MeshBasicMaterial({ color: 0x00323d, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  ring.userData.interactable = { kind: 'tap', id: 'portal:lab' };
  innerDisc.userData.interactable = { kind: 'tap', id: 'portal:lab' };
  portal.add(ring, innerDisc);
  const portalLabel = makeLabelSprite('실험실로 →');
  portalLabel.position.set(0, 1.5, 0);
  portal.add(portalLabel);
  group.add(portal);

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
    spawn: { pos: [0, 0, 6], ry: 0 },
    benches: [],
    shelf: { stock() {}, clear() {} },
    getGroundY,
    dispose() {
      disposers.forEach((off) => off?.());
      engine.scene.background = origBackground;
      engine.scene.fog = origFog;
      group.traverse(disposeObject);
    },
  };
}
