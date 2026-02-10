/**
 * ModuleMirror — local WASM module cache that ensures WASM
 * binaries are available on nodes hosting replicas. Modules
 * are pulled from peer nodes on demand and cached locally.
 *
 * Listens for code table CDC events to detect new versions
 * and invalidates stale cache entries so modules are
 * re-pulled before the next use.
 *
 * Requirements: 9.1, 9.2, 9.3
 * @module wasm-service/module-mirror
 */

/**
 * Local WASM module cache with version-aware invalidation.
 */
class ModuleMirror {
  /**
   * @param {Object} [options] - Configuration options.
   * @param {Object} [options.messageRouter] - MessageRouter
   *   instance for pulling modules from peer nodes.
   */
  constructor(options = {}) {
    /** @type {Map<string, {version: string, wasmBytes: Buffer}>} */
    this.localCache = new Map();
    this.messageRouter = options.messageRouter ?? null;
  }

  /**
   * Check whether a module is available locally with the
   * specified version.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The expected module version.
   * @return {boolean} True if the module is cached and the
   *   version matches.
   */
  hasModule(functionId, version) {
    const entry = this.localCache.get(functionId);
    if (!entry) {
      return false;
    }
    return entry.version === version;
  }

  /**
   * Get the cached module data for a function.
   *
   * @param {string} functionId - The function identifier.
   * @return {{version: string, wasmBytes: Buffer}|null} The
   *   cached module or null if not present.
   */
  getModule(functionId) {
    const entry = this.localCache.get(functionId);
    return entry ?? null;
  }

  /**
   * Pull a module from a peer node and store it in the local
   * cache. For now the actual message routing is stubbed —
   * the module is stored directly in the cache since the full
   * message protocol is not yet implemented.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The module version to pull.
   * @param {string} _sourceNodeId - The node to pull from
   *   (unused until message protocol is wired).
   * @return {Promise<void>}
   */
  async pullModule(functionId, version, _sourceNodeId) {
    // TODO: Use messageRouter to pull wasmBytes from the
    // source node once the message protocol is implemented.
    // For now, store a placeholder entry in the cache.
    const wasmBytes = Buffer.alloc(0);
    this.localCache.set(functionId, {version, wasmBytes});
  }

  /**
   * Handle a code table CDC event indicating a new module
   * version. If the cached version differs from the incoming
   * version, the stale entry is removed so the module will
   * be re-pulled before next use.
   *
   * If the cached version already matches, this is a no-op.
   *
   * @param {string} functionId - The function identifier.
   * @param {string} version - The new module version from
   *   the CDC event.
   */
  onCodeUpdate(functionId, version) {
    const entry = this.localCache.get(functionId);
    if (!entry) {
      return;
    }
    if (entry.version === version) {
      return;
    }
    this.localCache.delete(functionId);
  }
}

export {ModuleMirror};
