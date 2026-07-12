// ═══════════════════════════════════════════════════════════
// Engine — renderer/scene/camera/loop/resize (소유: 에이전트 A)
// 본편 js/core/engine.js에서 포팅 — 시그니처 동일, 품질 프리셋(tablet/high) 유지.
// ═══════════════════════════════════════════════════════════
import * as THREE from 'three';

const QUALITY = {
  tablet: { pixelRatio: 1.5, fogFar: 60 },
  high:   { pixelRatio: 1.5, fogFar: 120 }, // ARENA는 성능 예산상 pixelRatio 상한 1.5 고정
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x0e1117, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1117);
    this.scene.fog = new THREE.Fog(0x0e1117, 8, 60);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);

    this._updateFns = [];
    this._running = false;
    this._clock = new THREE.Clock();
    this._quality = 'tablet';

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    this._loop = this._loop.bind(this);
  }

  onUpdate(fn) { this._updateFns.push(fn); return () => this.offUpdate(fn); }
  offUpdate(fn) { const i = this._updateFns.indexOf(fn); if (i >= 0) this._updateFns.splice(i, 1); }

  setQuality(q) {
    const spec = QUALITY[q] || QUALITY.tablet;
    this._quality = QUALITY[q] ? q : 'tablet';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, spec.pixelRatio));
    this.scene.fog.far = spec.fogFar;
    this._onResize();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    this.renderer.setAnimationLoop(this._loop);
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }

  _loop() {
    let dt = this._clock.getDelta();
    if (dt > 0.05) dt = 0.05; // 스파이크 방지 클램프
    for (const fn of this._updateFns) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
