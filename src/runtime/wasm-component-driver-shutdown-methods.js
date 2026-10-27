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

const CLEANUP_REJECTED = 'rejected';
const CLEANUP_FAILED = 'WASM driver retained cleanup failures';

function createWasmComponentDriverShutdownMethods() {
  return {
    /**
     * Stop every cell and native lifecycle; clear bookkeeping only on success.
     *
     * Node teardown owns this call. The runtime stop-all terminates
     * even cells missing from driver bookkeeping, so a cell orphaned
     * by a failed prepare cannot leak either.
     *
     * @return {Promise<void>}
     */
    async shutdown() {
      const lifecycles = [...new Set([
        ...this._lifecycles.values(), this._wasmServiceLifecycle,
      ].filter(Boolean))];
      // Invoke now: the native owner closes admission before the first await.
      const results = await Promise.allSettled([
        (async () => this._componentRuntime.shutdown())(),
        ...lifecycles.map(async (owner) => owner.shutdownAll()),
      ]);
      const failures = results.filter((result) => result.status === CLEANUP_REJECTED)
        .map((result) => result.reason);
      if (failures.length) throw new AggregateError(failures, CLEANUP_FAILED);
      this._running.clear();
      this._prepared.clear();
      this._lifecycles.clear();
      this._requestCells.clear();
      this._replicaContexts.clear();
    },
  };
}

export {createWasmComponentDriverShutdownMethods};
