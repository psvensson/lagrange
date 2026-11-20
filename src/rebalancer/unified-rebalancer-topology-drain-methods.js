import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  resolveLatestTopologyShapingOperationDrain,
} from './replica-operation-topology-drain.js';

const {
  SYSTEM_TABLE_NAME,
  isReplaceRemoveDispatchPhase,
} = UNIFIED_REBALANCER_SHARED;

const UNIFIED_REBALANCER_TOPOLOGY_DRAIN_METHODS = Object.freeze({
  /**
   * Return the latest retained drain watermark for coordinator-owned
   * topology-shaping work. A terminal row lets a scheduled planner recover an
   * operation that started and drained entirely between planning evaluations.
   *
   * @param {Object} options
   * @return {{drainedAtMs:number,operationId:string,operationType:string}|null}
   */
  getLatestGlobalTopologyShapingOperationDrain(options = {}) {
    const observedAt = Number.isFinite(options.observedAt) ?
      Math.floor(options.observedAt) :
      this.nowFn();
    const operations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      () => true,
    );
    return resolveLatestTopologyShapingOperationDrain(
      operations,
      {observedAt},
    );
  },

  /**
   * REPLACE operations in ACTIVE/STOPPING are source-removal phase work:
   * add-side topology has already converged and these rows must not suppress
   * new add-like planning for other targets.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isReplaceRemoveDispatchPhaseOperation(operation) {
    return isReplaceRemoveDispatchPhase(operation);
  },

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTopologyBlockingInFlightOperation(operation) {
    return !this.isReplaceRemoveDispatchPhaseOperation(operation);
  },
});

export {UNIFIED_REBALANCER_TOPOLOGY_DRAIN_METHODS};
