// ═══════════════════════════════════════════════════════════
// ChemVerse 부트스트랩·통합 허브 — 소유: Fable (하위 에이전트 수정 금지)
//
// 이 파일이 곧 "계약"이다. 아래 임포트되는 모든 모듈은 여기서 호출하는
// 시그니처를 정확히 구현해야 한다. (상세: docs/AGENT_BRIEF.md)
//
// ── 에이전트 A 구현 계약 ──────────────────────────────────
//  Engine(canvas): .scene .camera .renderer .setQuality(q) .onUpdate(fn(dt)) .start()
//  PlayerControls(engine,{joystickZone,lookZone,canvas}):
//        .object .setColliders([Box3]) .teleport([x,y,z],ry) .getNetState() .update(dt)
//  Interactor(engine,controls): .on('tap'|'pick'|'place',cb) .setSnapTargets(list|null)
//        .carrying .cancelCarry()
//        - tap 대상: mesh.userData.interactable = {kind:'tap', id, benchId?, name?}
//        - carry 대상: {kind:'carry', equipmentId, name}
//        - place 이벤트: {object, data, slotId}
//  SpaceManager(engine): .register(id,builder) .go(id)->handle .current .currentHandle
//        builder(engine) => { group, colliders, spawn:{pos,ry}, dispose(), ... }
//        lab 추가 계약: benches:[{id,anchor,console}], shelf:{stock(items),clear()}
//        nature: 내부에서 experiments/idealgas/model.js 의
//                balloonScaleAtAltitude(altM) 를 임포트해 풍선 데모 구현
//  AvatarManager(scene): .upsert(id,profile,state) .remove(id) .update(dt)
//        .setLocalSpace(spaceId) .count
//  createNet(mode,config) => adapter: .mode .join(room,profile) .leave()
//        .sendState(state) .on('peer'|'leave'|'status',cb)   (전송 스로틀은 어댑터 내부)
//
// ── 에이전트 B 구현 계약 ──────────────────────────────────
//  HUD(rootEl): .setStatus(s) .toast(msg,ms?) .showExperimentPicker(list,onPick)
//        .startSession({def,model,placed}) .setChecklist(r) .setSimActive(b)
//        .showCarryHint(nameOrNull) .update(dt) .endSession()
//  실험 정의: js/experiments/registry.js 스키마 참조
//  idealgas/model.js: export function balloonScaleAtAltitude(altM) 포함(순수 JS)
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { PlayerControls } from './core/controls.js';
import { Interactor } from './core/interact.js';
import { SpaceManager } from './world/spaces.js';
import { buildLab } from './world/lab.js';
import { buildNature } from './world/nature.js';
import { AvatarManager } from './world/avatar.js';
import { createNet } from './net/net.js';
import * as NETCFG from './net/config.js';
import { getExperiment, listExperiments } from './experiments/registry.js';
import { HUD } from './ui/hud.js';
// 실험 등록 (side-effect import) — 새 실험은 여기에 한 줄 추가
import './experiments/idealgas/index.js';
import './experiments/raoult/index.js';
import './experiments/kinetics/index.js';

const $ = (s) => document.querySelector(s);

// ───────────────────────── 로비 ─────────────────────────
let quality = 'tablet';
$('#seg-quality').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  quality = b.dataset.v;
  $('#seg-quality').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
});

function readProfile() {
  const name = $('#in-name').value.trim() || '무명의 과학자';
  const room = $('#in-room').value.trim() || 'chemverse';
  const hue = Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0) * 31, 7)) % 360;
  return { name, room, color: `hsl(${hue},70%,55%)` };
}

$('#btn-join').addEventListener('click', () => boot(readProfile(), NETCFG.DEFAULT_MODE));
$('#btn-solo').addEventListener('click', () => boot(readProfile(), 'solo'));

// ───────────────────────── 부트 ─────────────────────────
let booted = false;

async function boot(profile, mode) {
  if (booted) return; booted = true;
  $('#lobby').classList.add('hidden');
  $('#loading').classList.remove('hidden');

  const engine = new Engine($('#gl'));
  engine.setQuality(quality);

  const controls = new PlayerControls(engine, {
    joystickZone: $('#joystick-zone'), lookZone: $('#look-zone'), canvas: $('#gl'),
  });
  const interact = new Interactor(engine, controls);
  const spaces = new SpaceManager(engine);
  spaces.register('lab', buildLab);
  spaces.register('nature', buildNature);

  const avatars = new AvatarManager(engine.scene);
  const hud = new HUD($('#hud'));

  // ── 네트워크 (실패 시 어댑터가 solo 폴백) ──
  let net;
  try {
    net = await createNet(mode, NETCFG);
    await net.join(profile.room, { name: profile.name, color: profile.color });
  } catch (err) {
    console.warn('[net] 폴백 → solo:', err);
    net = await createNet('solo', NETCFG);
    await net.join(profile.room, profile);
  }
  net.on('peer',  ({ id, profile: p, state }) => avatars.upsert(id, p, state));
  net.on('leave', ({ id }) => avatars.remove(id));
  net.on('status', (s) => hud.setStatus({ mode: net.mode, ...s }));
  hud.setStatus({ mode: net.mode, connected: net.mode !== 'solo', count: 1 });

  // ── 공간 이동 ──
  async function goSpace(id) {
    $('#loading').classList.remove('hidden');
    endSession();
    const handle = await spaces.go(id);
    controls.setColliders(handle.colliders);
    controls.setGroundFn(handle.getGroundY || null); // 지형 공간(자연)만 제공
    controls.teleport(handle.spawn.pos, handle.spawn.ry);
    avatars.setLocalSpace(id);
    $('#loading').classList.add('hidden');
    return handle;
  }

  // ── 실험 세션 ──
  let session = null;

  function endSession() {
    if (!session) return;
    session.dispose();
    session = null;
    interact.setSnapTargets(null);
    hud.endSession();
  }

  function startSession(defId, bench) {
    endSession();
    const def = getExperiment(defId);
    if (!def || def.stub) { hud.toast('이 실험은 준비 중입니다'); return; }
    const lab = spaces.currentHandle;
    session = createSession({ def, bench, lab, hud, interact });
    hud.toast(`${def.name} — 선반에서 필요한 기구를 골라 실험대에 놓으세요`);
  }

  // ── 인터랙션 라우팅 ──
  interact.on('tap', ({ data }) => {
    if (data.id && data.id.startsWith('portal:')) { goSpace(data.id.slice(7)); return; }
    if (data.id === 'console') {
      const bench = spaces.currentHandle.benches.find(b => b.id === data.benchId);
      hud.showExperimentPicker(listExperiments(), (expId) => {
        if (expId) startSession(expId, bench);
      });
      return;
    }
    if (data.id === 'shelf' && interact.carrying) {
      const carried = interact.carrying.object3d;
      interact.cancelCarry();
      // 실험대에서 집어온 경우에도 항상 "선반의 원래 자리"로 복귀시킨다
      const so = carried.userData.__shelfOrigin;
      if (so?.parent) {
        so.parent.add(carried);
        if (so.pos) carried.position.copy(so.pos);
        if (so.quat) carried.quaternion.copy(so.quat);
      }
      carried.userData.equipment = null;
      hud.showCarryHint(null);
      session?.refreshAssembly();
      return;
    }
    session?.onTap(data);
  });
  interact.on('pick', ({ object, data }) => {
    // 최초 픽업 시점의 선반 위치를 기억(이후 어디서 집든 '되돌리기'는 선반으로)
    if (object && !object.userData.__shelfOrigin && object.userData.__origParent) {
      object.userData.__shelfOrigin = {
        parent: object.userData.__origParent,
        pos: object.userData.__origPos?.clone?.() ?? null,
        quat: object.userData.__origQuat?.clone?.() ?? null,
      };
    }
    if (object?.userData) object.userData.equipment = null; // 집는 순간 배치 해제
    hud.showCarryHint(`${data.name} — 실험대의 파란 지점을 탭해 배치 (선반 탭 = 되돌리기)`);
    session?.refreshAssembly(); // 배치돼 있던 기구를 다시 들면 조립 판정 갱신
  });
  interact.on('place', ({ data, slotId }) => {
    hud.showCarryHint(null);
    session?.onPlaced(data.equipmentId, slotId);
  });

  // ── 메인 루프 ──
  engine.onUpdate((dt) => {
    controls.update(dt);
    avatars.update(dt);
    session?.update(dt);
    hud.update(dt);
    const st = controls.getNetState();
    net.sendState({ ...st, space: spaces.current });
  });

  await goSpace('lab');
  $('#hud').classList.remove('hidden');
  engine.start();
  hud.toast(`${profile.name} 님, 실험대의 콘솔을 탭해 실험을 시작하세요`, 4000);
}

// ─────────────── 실험 세션 (조립 자유도의 심판) ───────────────
function createSession({ def, bench, lab, hud, interact }) {
  const placed = new Map();          // slotId -> equipmentId
  const placedObjects = new Map();   // slotId -> Object3D
  const model = def.createModel();
  let visuals = null;
  let ready = false;

  // 선반에 이 실험의 기구를 진열 (세션이 생성한 메쉬는 세션이 책임지고 정리)
  const stocked = def.equipment.map(eq => ({
    equipmentId: eq.id, name: eq.name, mesh: eq.makeMesh(THREE),
  }));
  lab.shelf.stock(stocked);

  // 실험대 스냅 포인트 생성 (파란 발광 디스크)
  const markers = new THREE.Group();
  const snapTargets = def.snapSlots.map(slot => {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.008, 20),
      new THREE.MeshBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.4 })
    );
    disc.position.set(...slot.pos);
    disc.userData.slotId = slot.id;
    markers.add(disc);
    return { id: slot.id, object3d: disc, accepts: slot.accepts };
  });
  bench.anchor.add(markers);
  interact.setSnapTargets(snapTargets);

  function refreshAssembly() {
    // 마커에서 사라진(다시 든) 기구 정리
    for (const [slotId, obj] of placedObjects) {
      if (!obj.parent || obj.userData.__carried) {
        placedObjects.delete(slotId); placed.delete(slotId);
      }
    }
    const result = def.checkAssembly(placed);
    hud.setChecklist(result);
    if (result.ready && !ready) {
      ready = true;
      visuals = def.createVisuals(THREE, bench.anchor, model, placed);
      hud.startSession({ def, model, placed });
      hud.setSimActive(true);
      hud.toast('장치 완성! 이제 변인을 조작해 보세요');
    } else if (!result.ready && ready) {
      ready = false;
      visuals?.dispose(); visuals = null;
      hud.setSimActive(false);
    } else if (result.ready && ready) {
      hud.setSimActive(true);
    }
  }

  refreshAssembly();

  return {
    def, model,
    get ready() { return ready; },
    onPlaced(equipmentId, slotId) {
      placed.set(slotId, equipmentId);
      const t = snapTargets.find(s => s.id === slotId);
      const obj = t?.object3d.userData.__placedObject || null;
      if (obj) {
        // 계약: createVisuals의 findEquipment는 anchor 직계 자식에서
        // userData.equipment 로 기구를 찾는다 (ARCHITECTURE §4)
        obj.userData.equipment = { expId: def.id, itemId: equipmentId, slot: slotId };
        bench.anchor.attach(obj); // markers 그룹 → anchor 직계 (월드 변환 유지)
        placedObjects.set(slotId, obj);
      }
      refreshAssembly();
    },
    onTap(_data) { /* 실험 내 탭 상호작용 (밸브 등) — visuals가 자체 처리 */ },
    refreshAssembly,
    update(dt) {
      if (ready) { model.step(dt); visuals?.update(dt); }
      for (const m of markers.children) {
        m.material.opacity = 0.25 + 0.2 * Math.sin(performance.now() / 400);
      }
    },
    dispose() {
      visuals?.dispose(); visuals = null;
      if (interact.carrying) interact.cancelCarry();
      bench.anchor.remove(markers);
      markers.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      // 세션이 만든 모든 기구 메쉬 정리 (선반·실험대·이동 중 어디에 있든)
      for (const { mesh } of stocked) {
        mesh.parent?.remove(mesh);
        mesh.traverse(o => {
          o.geometry?.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); });
        });
      }
      lab.shelf.clear();
    },
  };
}
