// ═══════════════════════════════════════════════════════════
// effects.js — 전투·게임 이펙트 (소유: 에이전트 A)
// 신규 작성. 투사체는 무기별 InstancedMesh, 파티클은 고정 풀(최대 64) 재사용 —
// 프레임당 신규 지오메트리/머티리얼 할당 금지. ★ THREE는 인자로 전달받는다.
// ═══════════════════════════════════════════════════════════

const WEAPON_VISUAL = {
  spoit: { color: 0x7fd7ff, size: 0.06 },
  buret: { color: 0x00e5ff, size: 0.05 },
  spray: { color: 0xffb37a, size: 0.045 },
  flask: { color: 0xffe08a, size: 0.12 },
};
const DEFAULT_VISUAL = { color: 0x00b4d8, size: 0.06 };
const PROJ_CAPACITY = 32; // 무기 종류당 최대 동시 투사체

const PARTICLE_POOL_SIZE = 64;
const RING_POOL_SIZE = 4;
const GRAVITY = 4.2; // 파티클 낙하 가속(연출용, 실제 물리와 무관)

// 로컬 결정론적 의사난수(0~1) — 코스메틱 파티클 산포 전용, Math.random 미사용
let _rngState = 0x9e3779b9 | 0;
function rnd() {
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Effects {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;

    // ── 무기별 투사체 InstancedMesh ──
    this._projGeo = new THREE.SphereGeometry(1, 8, 6); // 단위구, scale로 크기 조절
    this._projMeshes = new Map(); // w -> InstancedMesh
    this._dummy = new THREE.Object3D();

    // ── 파티클 풀(스플래시/폭발 공용) ──
    const particleGeo = new THREE.SphereGeometry(0.045, 6, 5);
    this._particlePool = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(particleGeo, mat);
      m.visible = false;
      scene.add(m);
      this._particlePool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false });
    }
    this._particleGeo = particleGeo;

    // ── 링 이펙트 풀(폭발 링/리스폰 링 공용) ──
    const ringGeo = new THREE.RingGeometry(0.4, 0.5, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this._ringGeo = ringGeo;
    this._ringPool = [];
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(ringGeo, mat);
      m.visible = false;
      scene.add(m);
      this._ringPool.push({ mesh: m, life: 0, maxLife: 1, active: false });
    }
  }

  _getProjMesh(w) {
    let inst = this._projMeshes.get(w);
    if (!inst) {
      const vis = WEAPON_VISUAL[w] || DEFAULT_VISUAL;
      const mat = new this.THREE.MeshBasicMaterial({ color: vis.color });
      const im = new this.THREE.InstancedMesh(this._projGeo, mat, PROJ_CAPACITY);
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
      inst = { mesh: im, size: vis.size };
      this._projMeshes.set(w, inst);
    }
    return inst;
  }

  // list: [{id, pos:[x,y,z], w}] — 매 프레임 현재 활성 투사체 스냅샷
  syncProjectiles(list) {
    const byW = new Map();
    for (const p of list) {
      if (!byW.has(p.w)) byW.set(p.w, []);
      byW.get(p.w).push(p);
    }
    // 이번 프레임에 없는 무기 타입은 count=0으로 숨김
    for (const [w, inst] of this._projMeshes) {
      if (!byW.has(w)) { inst.mesh.count = 0; }
    }
    for (const [w, arr] of byW) {
      const inst = this._getProjMesh(w);
      const n = Math.min(arr.length, PROJ_CAPACITY);
      for (let i = 0; i < n; i++) {
        const p = arr[i].pos;
        this._dummy.position.set(p[0], p[1], p[2]);
        this._dummy.scale.setScalar(inst.size);
        this._dummy.updateMatrix();
        inst.mesh.setMatrixAt(i, this._dummy.matrix);
      }
      inst.mesh.count = n;
      inst.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _spawnParticle(pos, colorHex, speed, life) {
    const p = this._particlePool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.life = life;
    p.maxLife = life;
    p.mesh.visible = true;
    p.mesh.material.color.setHex(colorHex);
    p.mesh.material.opacity = 1;
    p.mesh.position.set(pos[0], pos[1], pos[2]);
    const theta = rnd() * Math.PI * 2;
    const phi = rnd() * Math.PI * 0.5;
    const s = speed * (0.5 + rnd() * 0.5);
    p.vx = Math.cos(theta) * Math.sin(phi) * s;
    p.vz = Math.sin(theta) * Math.sin(phi) * s;
    p.vy = Math.cos(phi) * s;
  }

  splash(pos, colorHex = 0x7fd7ff) {
    const n = 8 + Math.floor(rnd() * 5); // 8~12개
    for (let i = 0; i < n; i++) this._spawnParticle(pos, colorHex, 1.6, 0.4);
    this._spawnRing(pos, colorHex, 0.9, 0.35);
  }

  burst(pos) {
    const n = 16;
    for (let i = 0; i < n; i++) this._spawnParticle(pos, 0xffe08a, 3.0, 0.55);
    this._spawnRing(pos, 0xff8a3d, 2.0, 0.5);
  }

  respawnRing(pos, colorHex = 0x00b4d8) {
    this._spawnRing(pos, colorHex, 1.4, 0.6);
  }

  _spawnRing(pos, colorHex, targetScale, life) {
    const r = this._ringPool.find((x) => !x.active);
    if (!r) return;
    r.active = true;
    r.life = life;
    r.maxLife = life;
    r.targetScale = targetScale;
    r.mesh.visible = true;
    r.mesh.material.color.setHex(colorHex);
    r.mesh.material.opacity = 0.85;
    r.mesh.position.set(pos[0], pos[1] > 0.05 ? pos[1] : 0.05, pos[2]);
    r.mesh.scale.setScalar(0.15);
  }

  update(dt) {
    for (const p of this._particlePool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
      p.vy -= GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0) { p.mesh.position.y = 0; p.vy *= -0.2; }
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    }
    for (const r of this._ringPool) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.15 + t * r.targetScale);
      r.mesh.material.opacity = 0.85 * (1 - t);
    }
  }

  dispose() {
    for (const inst of this._projMeshes.values()) {
      this.scene.remove(inst.mesh);
      inst.mesh.material.dispose();
    }
    this._projMeshes.clear();
    this._projGeo.dispose();

    for (const p of this._particlePool) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this._particlePool.length = 0;
    this._particleGeo.dispose();

    for (const r of this._ringPool) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    this._ringPool.length = 0;
    this._ringGeo.dispose();
  }
}
