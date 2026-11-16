import {TABLES} from '../constants/tables.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
  RECONCILE_REASON,
  UNIFIED_REBALANCER_LITERAL,
  isCoordinatorOwnedOperationType,
  isTerminalReplicaOperationRecord,
  normalizeReplicaOperationRecord,
} = UNIFIED_REBALANCER_SHARED;

// The rows whose change can end a local mutation-readiness deferral: the
// publication row carries the durable spread summary and the ack state, and
// the replica operations carry the open-operation evidence the priority
// recovery gate reads. Any other table cannot flip the published-convergence
// answer, so it never pays a readiness evaluation.
const LOCAL_MUTATION_READINESS_WAKE_TABLES = Object.freeze(new Set([
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.REPLICA_OPERATIONS,
]));

function isLocalMutationReadinessWakeArmed(rebalancer) {
  return Boolean(
    rebalancer.localMutationReadinessWakeListener ||
      rebalancer.localMutationReadinessPlanningUnsubscribe,
  );
}

function attachLocalMutationReadinessCacheListener(
  rebalancer,
  scheduleWakeEvaluation,
) {
  const cache = rebalancer.systemTableCache;
  if (!cache || typeof cache.onCacheChange !== 'function') {
    return false;
  }
  const listener = (tableName) => {
    if (LOCAL_MUTATION_READINESS_WAKE_TABLES.has(tableName)) {
      scheduleWakeEvaluation();
    }
  };
  rebalancer.localMutationReadinessWakeListener = listener;
  cache.onCacheChange(listener);
  return true;
}

function attachLocalMutationReadinessPlanningListener(
  rebalancer,
  scheduleWakeEvaluation,
) {
  const readinessService = rebalancer.controlPlaneReadinessService;
  if (
    !readinessService ||
    typeof readinessService.subscribeReadinessPlanningSnapshots !== 'function'
  ) {
    return false;
  }
  rebalancer.localMutationReadinessPlanningUnsubscribe =
    readinessService.subscribeReadinessPlanningSnapshots((snapshot) => {
      if (!snapshot?.nodeId || snapshot.nodeId === rebalancer.nodeId) {
        scheduleWakeEvaluation();
      }
    });
  return true;
}

function hasBudgetExceededRebalanceOutcome(rebalanceResult) {
  if (rebalanceResult?.reason === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED) {
    return true;
  }
  const moves = Array.isArray(rebalanceResult?.moves) ?
    rebalanceResult.moves :
    [];
  return moves.some(
    (move) =>
      move?.skipped === true &&
      move?.reason === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
  );
}

function scheduleOperationContinuationMicrotask(rebalancer, state) {
  if (state.pending === true) {
    return;
  }
  state.pending = true;
  queueMicrotask(() => {
    if (rebalancer.operationContinuationWakeState !== state) {
      return;
    }
    if (!rebalancer.isLeader || rebalancer.isShuttingDown) {
      rebalancer.disarmOperationContinuationWake();
      return;
    }
    const resetCheckFloor = state.pendingOwnMatch === true;
    rebalancer.disarmOperationContinuationWake();
    rebalancer.currentInterval = rebalancer.periodicCheckIntervalMs;
    if (resetCheckFloor) {
      rebalancer.lastCheckAtMs = UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    rebalancer.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
  });
}

function handleOperationContinuationObservation(rebalancer, state, operation) {
  if (
    rebalancer.operationContinuationWakeState !== state ||
    !rebalancer.isLeader ||
    rebalancer.isShuttingDown
  ) {
    return;
  }
  const normalized = normalizeReplicaOperationRecord(operation);
  const ownMatch =
    state.awaitingOwnOperationCompletion === true &&
    normalized.partitionId === rebalancer.entityId;
  const slotMatch = state.awaitingBudgetSlotRelease === true;
  if (!ownMatch && !slotMatch) {
    return;
  }
  state.pendingOwnMatch = state.pendingOwnMatch || ownMatch;
  scheduleOperationContinuationMicrotask(rebalancer, state);
}

function attachOperationContinuationListeners(rebalancer, state) {
  const onTerminal = (payload) => {
    const operation = payload?.operation ? payload.operation : payload;
    handleOperationContinuationObservation(rebalancer, state, operation);
  };
  const cacheListener = (tableName, _cacheOperation, record) => {
    if (tableName !== TABLES.REPLICA_OPERATIONS) {
      return;
    }
    const normalized = normalizeReplicaOperationRecord(record);
    if (
      !isCoordinatorOwnedOperationType(normalized.type) ||
      !isTerminalReplicaOperationRecord(normalized)
    ) {
      return;
    }
    handleOperationContinuationObservation(rebalancer, state, normalized);
  };
  let attached = false;
  if (state.coordinator?.on) {
    state.coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      onTerminal,
    );
    state.coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      onTerminal,
    );
    state.onTerminal = onTerminal;
    attached = true;
  }
  if (state.cache?.onCacheChange) {
    state.cache.onCacheChange(cacheListener);
    state.cacheListener = cacheListener;
    attached = true;
  }
  return attached;
}

/**
 * Event wake for a rebalancer deferred on local mutation readiness (owner
 * rule: no early unblock may be ended only by a timer). While deferred, the
 * entity listens to the system-table cache through the same seam the
 * priority-recovery visibility listener uses; the first relevant change that
 * leaves no local mutation-readiness blocker resets the backed-off interval
 * and enqueues one check through the owner reconcile queue. The scheduled
 * timer stays armed as the fallback. Evaluations coalesce to one per event
 * burst.
 */
const REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS = {
  // Arms the wake while the gate defers and disarms it once it does not;
  // returns whether the gate defers.
  syncLocalMutationReadinessWake(shouldDefer) {
    if (shouldDefer === true) {
      this.armLocalMutationReadinessWake();
      return true;
    }
    this.disarmLocalMutationReadinessWake();
    return false;
  },

  armLocalMutationReadinessWake() {
    if (isLocalMutationReadinessWakeArmed(this)) {
      return true;
    }
    const scheduleWakeEvaluation = () => {
      if (this.localMutationReadinessWakeCheckPending === true) {
        return;
      }
      this.localMutationReadinessWakeCheckPending = true;
      queueMicrotask(() => {
        this.localMutationReadinessWakeCheckPending = false;
        this.resolveLocalMutationReadinessWake();
      });
    };
    const armedCache = attachLocalMutationReadinessCacheListener(
      this,
      scheduleWakeEvaluation,
    );
    const armedPlanning = attachLocalMutationReadinessPlanningListener(
      this,
      scheduleWakeEvaluation,
    );
    return armedCache || armedPlanning;
  },

  disarmLocalMutationReadinessWake() {
    const listener = this.localMutationReadinessWakeListener;
    this.localMutationReadinessWakeListener = null;
    const cache = this.systemTableCache;
    if (listener && cache && typeof cache.offCacheChange === 'function') {
      cache.offCacheChange(listener);
    }
    const unsubscribe = this.localMutationReadinessPlanningUnsubscribe;
    this.localMutationReadinessPlanningUnsubscribe = null;
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    this.disarmOperationContinuationWake();
  },

  resolveLocalMutationReadinessWake() {
    if (!isLocalMutationReadinessWakeArmed(this)) {
      return false;
    }
    if (!this.isLeader || this.isShuttingDown) {
      this.disarmLocalMutationReadinessWake();
      return false;
    }
    if (this.getLocalControlPlaneMutationReadinessBlocker()) {
      return false;
    }
    this.disarmLocalMutationReadinessWake();
    this.currentInterval = this.periodicCheckIntervalMs;
    return this.enqueueRebalanceCheck(
      RECONCILE_REASON.LOCAL_MUTATION_READINESS_WAKE,
    );
  },

  syncOperationContinuationWake(rebalanceResult, executedMoveCount) {
    if (this.isControlPlanePriorityPartition() === true) {
      return false;
    }
    const hitBudgetExceeded =
      hasBudgetExceededRebalanceOutcome(rebalanceResult);
    const underDistinctSpread =
      this.isPartitionBelowDeclaredDistinctHostSpread?.() === true;
    const awaitingOwnOperationCompletion =
      executedMoveCount > UNIFIED_REBALANCER_LITERAL.ZERO &&
      (hitBudgetExceeded || underDistinctSpread);
    const awaitingBudgetSlotRelease =
      executedMoveCount === UNIFIED_REBALANCER_LITERAL.ZERO &&
      hitBudgetExceeded;
    if (!awaitingOwnOperationCompletion && !awaitingBudgetSlotRelease) {
      this.disarmOperationContinuationWake();
      return false;
    }
    return this.armOperationContinuationWake({
      awaitingOwnOperationCompletion,
      awaitingBudgetSlotRelease,
    });
  },

  armOperationContinuationWake({
    awaitingOwnOperationCompletion = false,
    awaitingBudgetSlotRelease = false,
  } = {}) {
    if (!this.isLeader || this.isShuttingDown) {
      this.disarmOperationContinuationWake();
      return false;
    }
    const existing = this.operationContinuationWakeState;
    if (existing) {
      if (
        existing.coordinator === this.rebalanceCoordinator &&
        existing.cache === this.systemTableCache
      ) {
        existing.awaitingOwnOperationCompletion =
          awaitingOwnOperationCompletion;
        existing.awaitingBudgetSlotRelease = awaitingBudgetSlotRelease;
        return true;
      }
      this.disarmOperationContinuationWake();
    }
    const state = {
      awaitingOwnOperationCompletion,
      awaitingBudgetSlotRelease,
      pending: false,
      pendingOwnMatch: false,
      coordinator: this.rebalanceCoordinator || null,
      cache: this.systemTableCache || null,
      onTerminal: null,
      cacheListener: null,
    };
    this.operationContinuationWakeState = state;
    if (!attachOperationContinuationListeners(this, state)) {
      this.operationContinuationWakeState = null;
      return false;
    }
    return true;
  },

  disarmOperationContinuationWake() {
    const state = this.operationContinuationWakeState;
    this.operationContinuationWakeState = null;
    if (!state) {
      return;
    }
    if (state.onTerminal && state.coordinator?.off) {
      state.coordinator.off(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        state.onTerminal,
      );
      state.coordinator.off(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        state.onTerminal,
      );
    }
    if (state.cacheListener && state.cache?.offCacheChange) {
      state.cache.offCacheChange(state.cacheListener);
    }
  },
};

export {REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS};
