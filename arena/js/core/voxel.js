// ═══════════════════════════════════════════════════════════
// buildVoxelCharacter — 마인크래프트 비율 복셀 캐릭터 빌더 (소유: 에이전트 A)
// 신규 작성. 이름표 스프라이트(makeNameSprite)는 본편 js/world/avatar.js에서 포팅.
// 전부 BoxGeometry + 플랫 컬러(MeshLambertMaterial) — 텍스처는 이름표 스프라이트에만 사용.
// ★ THREE는 임포트하지 않고 인자로 전달받는다(main.js 계약).
// ═══════════════════════════════════════════════════════════

// 결정론적 의사난수(0~1) — seed로 피부톤/머리색 미세 변화용 (Math.random 금지)
function hash01(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function hexCss(hex) { return `#${(hex >>> 0).toString(16).padStart(6, '0')}`; }

function disposeObject(o) {
  // items.js가 부착한 손에 든 아이템(공유 지오메트리/머티리얼 캐시 사용)은
  // 소유권이 items.js에 있으므로 여기서 dispose하지 않는다(캐시 훼손 방지).
  if (o.userData?.sharedItem) return;
  o.geometry?.dispose();
  if (o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
  }
}

// 이름표 스프라이트 (본편 js/world/avatar.js의 makeNameSprite() 포팅 — 팀색 테두리로 개조)
function makeNameSprite(THREE, name, teamColorCss) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 34, pad = 12;
  ctx.font = `700 ${fontSize}px sans-serif`;
  const w = Math.ceil(ctx.measureText(name).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(9,12,19,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = teamColorCss || 'rgba(0,180,216,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#eaf6fb';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(name, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.4;
  const aspect = w / h;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

const SKIN_TONES = [0xf1d8bd, 0xe8c19c, 0xd9a878, 0xc48a5c, 0x8d5a3c];
const HAIR_COLORS = [0x2b2118, 0x4a3222, 0x6b4423, 0x1c1c1c, 0x3d2b1f];

export function buildVoxelCharacter(THREE, { teamColor = 0x00b4d8, name = '참가자', seed = 0 } = {}) {
  const group = new THREE.Group();
  const teamHex = hexCss(teamColor);

  const rSkin = hash01(seed * 7.13 + 1.7);
  const rHair = hash01(seed * 3.71 + 9.2);
  const skinColor = SKIN_TONES[Math.floor(rSkin * SKIN_TONES.length) % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[Math.floor(rHair * HAIR_COLORS.length) % HAIR_COLORS.length];

  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
  const teamMat = new THREE.MeshLambertMaterial({ color: teamColor }); // 조끼(몸)
  const bandMat = new THREE.MeshLambertMaterial({ color: teamColor }); // 고글 밴드(머리)
  const limbMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3348 });

  // ── 치수 (총 높이 ≈ 1.7m, 발 기준 y=0) ──
  const LEG_H = 0.72, LEG_W = 0.22, LEG_D = 0.22;
  const BODY_H = 0.56, BODY_W = 0.52, BODY_D = 0.3;
  const ARM_H = 0.62, ARM_W = 0.18, ARM_D = 0.18;
  const HEAD_S = 0.42;

  // 다리: 엉덩이(위쪽)를 피벗으로 삼아 스윙
  const legGeo = new THREE.BoxGeometry(LEG_W, LEG_H, LEG_D);
  const legLPivot = new THREE.Group(); legLPivot.position.set(-0.13, LEG_H, 0);
  const legRPivot = new THREE.Group(); legRPivot.position.set(0.13, LEG_H, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(0, -LEG_H / 2, 0);
  legR.position.set(0, -LEG_H / 2, 0);
  legLPivot.add(legL); legRPivot.add(legR);
  group.add(legLPivot, legRPivot);

  // 몸(조끼)
  const bodyGeo = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D);
  const body = new THREE.Mesh(bodyGeo, teamMat);
  body.position.set(0, LEG_H + BODY_H / 2, 0);
  group.add(body);

  // 팔: 어깨(위쪽)를 피벗으로 삼아 스윙
  const armGeo = new THREE.BoxGeometry(ARM_W, ARM_H, ARM_D);
  const armLPivot = new THREE.Group(); armLPivot.position.set(-(BODY_W / 2 + ARM_W / 2), LEG_H + BODY_H, 0);
  const armRPivot = new THREE.Group(); armRPivot.position.set(BODY_W / 2 + ARM_W / 2, LEG_H + BODY_H, 0);
  const armL = new THREE.Mesh(armGeo, limbMat);
  const armR = new THREE.Mesh(armGeo, limbMat);
  armL.position.set(0, -ARM_H / 2, 0);
  armR.position.set(0, -ARM_H / 2, 0);
  armLPivot.add(armL); armRPivot.add(armR);
  group.add(armLPivot, armRPivot);

  // 손에 든 아이템 부착 슬롯 — 오른팔 피벗의 자식이라 걷기 스윙에 자동 동기화
  const heldSlot = new THREE.Group();
  heldSlot.position.set(0, -ARM_H - 0.03, 0.04);
  heldSlot.rotation.set(-Math.PI * 0.28, 0, 0);
  armRPivot.add(heldSlot);
  let heldItem = null;

  // 머리 + 머리카락 + 팀색 고글 밴드
  const headY = LEG_H + BODY_H + HEAD_S / 2;
  const headGeo = new THREE.BoxGeometry(HEAD_S, HEAD_S, HEAD_S);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, headY, 0);
  group.add(head);

  const hairGeo = new THREE.BoxGeometry(HEAD_S * 1.02, HEAD_S * 0.28, HEAD_S * 1.02);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.set(0, headY + HEAD_S / 2 - HEAD_S * 0.12, 0);
  group.add(hair);

  const bandGeo = new THREE.BoxGeometry(HEAD_S * 1.04, HEAD_S * 0.22, HEAD_S * 1.04);
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.set(0, headY + HEAD_S * 0.08, 0);
  group.add(band);

  let nameSprite = makeNameSprite(THREE, name, teamHex);
  nameSprite.position.set(0, headY + HEAD_S / 2 + 0.32, 0);
  group.add(nameSprite);

  let anim = 'idle';
  let phase = 0;

  function setAnim(mode) { anim = (mode === 'run') ? 'run' : 'idle'; }

  function update(dt, speedRatio = 0) {
    const ratio = THREE.MathUtils.clamp(speedRatio, 0, 1);
    if (anim === 'run' && ratio > 0.02) {
      phase += dt * (6 + ratio * 4);
      const swing = Math.sin(phase) * (0.55 + ratio * 0.35);
      legLPivot.rotation.x = swing;
      legRPivot.rotation.x = -swing;
      armLPivot.rotation.x = -swing;
      armRPivot.rotation.x = swing;
    } else {
      phase += dt * 1.2;
      const idle = Math.sin(phase) * 0.04;
      legLPivot.rotation.x = THREE.MathUtils.lerp(legLPivot.rotation.x, 0, 0.15);
      legRPivot.rotation.x = THREE.MathUtils.lerp(legRPivot.rotation.x, 0, 0.15);
      armLPivot.rotation.x = idle;
      armRPivot.rotation.x = -idle;
    }
  }

  function setName(str) {
    group.remove(nameSprite);
    disposeObject(nameSprite);
    nameSprite = makeNameSprite(THREE, str, teamHex);
    nameSprite.position.set(0, headY + HEAD_S / 2 + 0.32, 0);
    group.add(nameSprite);
  }

  // setHeld(meshGroup|null) — 무기/부품 실물 메쉬(items.js makePartMesh/makeWeaponMesh 반환)를
  // 오른손 슬롯에 부착·교체한다. 메쉬 소유권(dispose)은 호출자(items.js)에게 있음 — 여기선 부착만.
  function setHeld(meshGroup) {
    if (heldItem) { heldSlot.remove(heldItem); heldItem = null; }
    if (meshGroup) { heldSlot.add(meshGroup); heldItem = meshGroup; }
  }

  function dispose() {
    group.traverse((o) => disposeObject(o));
  }

  return { group, setAnim, update, setName, setHeld, dispose };
}
