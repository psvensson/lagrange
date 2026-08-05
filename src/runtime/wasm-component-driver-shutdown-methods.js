/**
 * Wasm_Component_Driver shutdown methods — the stop-all half of the
 * driver contract, split out of wasm-component-driver.js to keep both
 * files under the source file-size cap.
 *
 * Owner boundary: the per-replica stop path is driven by the
 * REMOVE_REPLICA workflow and never runs at whole-node shutdown, so
 * the driver must expose one stop-all the node teardown chain can
 * invoke through ServiceRuntimeLifecycle.shutdown.
 *
 * @module runtime/wasm-component-driver-shutdown-methods
 */

function createWasmComponentDriverShutdownMethods() {
  return {
    /**
     * Stop every running cell and release all driver bookkeeping.
     *
     * Node teardown owns this call. The runtime stop-all terminates
     * even cells missing from driver bookkeeping, so a cell orphaned
     * by a failed prepare cannot leak either.
     *
     * @return {Promise<void>}
     */
    async shutdown() {
      await this._componentRuntime.shutdown();
      this._running.clear();
      this._prepared.clear();
      this._lifecycles.clear();
      this._requestCells.clear();
      this._replicaContexts.clear();
    },
  };
}

export {createWasmComponentDriverShutdownMethods};
