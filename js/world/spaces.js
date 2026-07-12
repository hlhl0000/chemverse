// ═══════════════════════════════════════════════════════════
// SpaceManager — 공간 등록/전환, 이전 공간 dispose 보장 (소유: 에이전트 A)
// ═══════════════════════════════════════════════════════════

export class SpaceManager {
  constructor(engine) {
    this.engine = engine;
    this._builders = new Map();
    this.current = null;         // 현재 공간 id
    this.currentHandle = null;   // 현재 공간 handle
  }

  register(id, builderFn) { this._builders.set(id, builderFn); }

  /** 공간 전환: 이전 공간을 scene에서 제거 + dispose 후 새 공간을 구성해 추가한다. */
  async go(id) {
    const builder = this._builders.get(id);
    if (!builder) throw new Error(`[spaces] 등록되지 않은 공간: ${id}`);

    if (this.currentHandle) {
      this.engine.scene.remove(this.currentHandle.group);
      try { this.currentHandle.dispose?.(); } catch (e) { console.error('[spaces] dispose 오류', e); }
      this.currentHandle = null;
      this.current = null;
    }

    const handle = await builder(this.engine);
    this.engine.scene.add(handle.group);
    this.current = id;
    this.currentHandle = handle;
    return handle;
  }
}
