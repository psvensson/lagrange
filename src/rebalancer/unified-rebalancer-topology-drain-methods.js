import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  isFoundingTopologyOperation,
  resolveDrainedTopologyShapingOperationIds,
} from './replica-operation-topology-drain.js';

const {
  SYSTEM_TABLE_NAME,
  classifySystemPartition,
  isReplaceRemoveDispatchPhase,
  normalizeReplicaOperationRecord,
} = UNIFIED_REBALANCER_SHARED;

const UNIFIED_REBALANCER_TOPOLOGY_DRAIN_METHODS = Object.freeze({
  /**
   * The ids of every retained drained FENCE-HOLDING transition: a
   * coordinator-owned topology-shaping operation of a priority control-plane
   * partition, or one that founds its partition (schema / table founding
   * ADDs). A terminal row lets the release fence see a transition that
   * started and drained entirely between two of its evaluations. No other
   * ordinary work is read: background moves are what this fence releases
   * (on this node or any other: a planner move exists only once a fence let
   * its entity plan), and a fence its own released work closes again can
   * never stay open.
   *
   * @param {Object} options
   * @param {number} options.observedAt
   * @return {Array<string>}
   */
  getDrainedFenceHoldingOperationIds(options) {
    const operations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) =>
        this.isFenceHoldingTransitionOperation(operation, options.observedAt),
    );
    return resolveDrainedTopologyShapingOperationIds(operations, options);
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
   * PLANNER predicate: whether an in-flight operation still suppresses new
   * add-like planning. REPLACE source-removal phase rows are excluded so the
   * planner does not deadlock behind them. This exclusion is the planner's
   * alone; the ordinary-work release fence decides on
   * isPrioritySpreadReleaseFenceBlockingOperation instead.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTopologyBlockingInFlightOperation(operation) {
    return !this.isReplaceRemoveDispatchPhaseOperation(operation);
  },

  /**
   * RELEASE-FENCE predicate: whether an operation is an unfinished
   * fence-holding transition. Every non-terminal phase counts, the REPLACE
   * source-removal phase (ACTIVE/STOPPING) included: a replica set that is
   * still being changed is not stable placement, whatever the planner may
   * plan beside it. Staleness is a planner heuristic and is deliberately not
   * consulted; only the row's terminal state ends the hold. A row whose
   * terminal write this cache has not applied holds as
   * PRIORITY_TRANSITION_STATE.IN_FLIGHT until the projection catches up:
   * the operation's own owner bounds it (a typed terminal at the operation
   * budget), and the cache's authoritative re-read of replica_operations is
   * what clears a projection that missed that write; no wall-clock escape
   * releases it here.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isPrioritySpreadReleaseFenceBlockingOperation(operation) {
    return this.isTrackedInFlightOperation(operation) &&
      this.isFenceHoldingTransitionOperation(operation, this.nowFn());
  },

  /**
   * Whether an operation, in flight or drained, holds the release fence:
   * priority control-plane placement, or the founding of a partition.
   * Founding ADDs are ordinary work no fence released (provisioning is not
   * fenced); the background wave must not start until the dwell after they
   * drain (sealed quest formation-background-release-quiescence-anchor-live,
   * as superseded 2026-11-11).
   *
   * @param {Object} operation
   * @param {number} observedAt
   * @return {boolean}
   * @private
   */
  isFenceHoldingTransitionOperation(operation, observedAt) {
    return this.isPriorityControlPlaneOperation(operation) ||
      isFoundingTopologyOperation(operation, observedAt);
  },

  /**
   * Whether an operation row belongs to a priority control-plane partition:
   * the one scope of the ordinary-work release fence.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneOperation(operation) {
    const {partitionId} = normalizeReplicaOperationRecord(operation, {
      nowMs: this.nowFn(),
    });
    return classifySystemPartition({partitionId}).priorityControlPlane;
  },
});

export {UNIFIED_REBALANCER_TOPOLOGY_DRAIN_METHODS};
