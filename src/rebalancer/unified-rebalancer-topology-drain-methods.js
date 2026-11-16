import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  resolveLatestTopologyShapingOperationDrain,
} from './replica-operation-topology-drain.js';

const {
  OperationType,
  SYSTEM_TABLE_NAME,
  classifySystemPartition,
  getPartitionRowFromCache,
  isReplaceRemoveDispatchPhase,
  normalizeReplicaOperationRecord,
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
    const predicate = options.operationFilter || (() => true);
    const operations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      predicate,
    );
    return resolveLatestTopologyShapingOperationDrain(
      operations,
      {observedAt},
    );
  },

  /**
   * Whether an operation holds the priority-spread stability fence (priority
   * control-plane partition work, or an ADD operation such as schema/initial
   * provisioning). Non-priority REPLACE/REMOVE operations never re-lock or
   * reset the post-clear stability clock.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isPrioritySpreadFenceHoldingOperation(operation) {
    if (!operation) {
      return false;
    }
    const normalized = normalizeReplicaOperationRecord(operation);
    if (normalized.type === OperationType.ADD) {
      return true;
    }
    const partitionId = normalized.partitionId;
    if (!partitionId) {
      return false;
    }
    return classifySystemPartition({
      partitionId,
      partitionRow: getPartitionRowFromCache(
        this.systemTableCache,
        partitionId,
      ),
    }).priorityControlPlane === true;
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
