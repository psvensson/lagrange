import {NUM} from '../constants/index.js';
import {TABLES} from '../constants/tables.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  collectSlotHandoffEntries,
  doesOperationTransitionReleaseSystemTargetNodeSlot,
  registerArmedSlotContender,
  resolveRebalancerDispatchHost,
  selectSlotWakeWinnerIndex,
  selectSlotWakeWinners,
  shouldYieldSlotWakeToNodesPartition,
  unregisterArmedSlotContender,
} from './continuation-wake-coordinator.js';

const {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
  RECONCILE_REASON,
  UNIFIED_REBALANCER_LITERAL,
  normalizeReplicaOperationRecord,
  ownerNowMs,
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
const SLOT_WAKE_STAGGER_BASE_MS = 8000;
const SLOT_WAKE_STAGGER_STEP_MS = 400;
const SLOT_WAKE_HISTORY_LIMIT = 64;
const RECENT_CONTINUATION_OP_LIMIT = 16;
const MAX_SLOT_RELEASE_HANDOFF_HOPS = NUM.TWO;

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

function hasRecentlyWokenOperation(rebalancer, operationId) {
  if (!operationId || !Array.isArray(rebalancer._recentContinuationWakeOpIds)) {
    return false;
  }
  return rebalancer._recentContinuationWakeOpIds.includes(operationId);
}

function recordRecentlyWokenOperation(rebalancer, operationId) {
  if (!operationId) {
    return;
  }
  if (!Array.isArray(rebalancer._recentContinuationWakeOpIds)) {
    rebalancer._recentContinuationWakeOpIds = [];
  }
  if (!rebalancer._recentContinuationWakeOpIds.includes(operationId)) {
    rebalancer._recentContinuationWakeOpIds.push(operationId);
    if (
      rebalancer._recentContinuationWakeOpIds.length >
      RECENT_CONTINUATION_OP_LIMIT
    ) {
      rebalancer._recentContinuationWakeOpIds.shift();
    }
  }
}

function resolveSlotWakeCoordinatorHost(state) {
  if (state.coordinator) {
    return state.coordinator;
  }
  if (state.cache) {
    return state.cache;
  }
  return null;
}

function resolveSlotWakeDispatchRecord(state, operationId, targetNodeId = null) {
  if (!operationId) {
    return null;
  }
  const host = resolveSlotWakeCoordinatorHost(state);
  if (!host) {
    return null;
  }
  if (!(host._slotWakeDispatchState instanceof Map)) {
    host._slotWakeDispatchState = new Map();
  }
  const registry = host._slotWakeDispatchState;
  let record = registry.get(operationId);
  if (!record) {
    record = {
      operationId,
      targetNodeId: targetNodeId || null,
      winnerAssigned: false,
      staggerCount: NUM.ZERO,
      contenders: [],
      flushScheduled: false,
    };
    registry.set(operationId, record);
    if (registry.size > SLOT_WAKE_HISTORY_LIMIT) {
      const oldestKey = registry.keys().next().value;
      registry.delete(oldestKey);
    }
  } else if (!record.targetNodeId && targetNodeId) {
    record.targetNodeId = targetNodeId;
  }
  return record;
}

function hasEarlierScheduledCheckDeadline(rebalancer, staggerDelayMs) {
  if (!rebalancer.scheduledCheck) {
    return false;
  }
  const dueAtMs = rebalancer._scheduledCheckDueAtMs;
  if (!Number.isFinite(dueAtMs)) {
    return false;
  }
  return dueAtMs <= ownerNowMs(rebalancer) + staggerDelayMs;
}

function applyContinuationWakeWakeup(
  rebalancer,
  state,
  staggerDelayMs,
  slotTargetNodeId = null,
  handoffDepth = NUM.ZERO,
) {
  if (rebalancer.operationContinuationWakeState !== state) {
    return;
  }
  if (!rebalancer.isLeader || rebalancer.isShuttingDown) {
    rebalancer.disarmOperationContinuationWake();
    return;
  }
  rebalancer.currentInterval = rebalancer.periodicCheckIntervalMs;
  rebalancer.lastCheckAtMs = UNIFIED_REBALANCER_LITERAL.ZERO;
  rebalancer.lastStateChangeTime = UNIFIED_REBALANCER_LITERAL.ZERO;
  if (staggerDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO) {
    // Fix 3B: Keep non-winner contenders armed so back-to-back completions on
    // another joiner still find eligible 0ms contenders, and never push back
    // an already-armed earlier check timer.
    state.pending = false;
    state.staggerDelayMs = UNIFIED_REBALANCER_LITERAL.ZERO;
    if (
      !hasEarlierScheduledCheckDeadline(rebalancer, staggerDelayMs) &&
      rebalancer.scheduleNextCheck
    ) {
      rebalancer.scheduleNextCheck(staggerDelayMs);
    }
    return;
  }
  rebalancer.disarmOperationContinuationWake();
  rebalancer._slotReleaseWakeContext = slotTargetNodeId ?
    {targetNodeId: slotTargetNodeId, handoffDepth} :
    null;
  rebalancer.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
}

function flushSlotWakeDispatchRecord(dispatchRecord) {
  dispatchRecord.flushScheduled = false;
  const pending = dispatchRecord.contenders.splice(NUM.ZERO);
  const active = pending.filter(
    ({rebalancer, state}) =>
      rebalancer.operationContinuationWakeState === state &&
      rebalancer.isLeader &&
      !rebalancer.isShuttingDown &&
      !state.pendingOwnMatch,
  );
  if (active.length === NUM.ZERO) {
    return;
  }
  const winnersByIndex = dispatchRecord.winnerAssigned ?
    new Map() :
    selectSlotWakeWinners(
      active,
      dispatchRecord.targetNodeId,
      dispatchRecord.operationId,
    );
  if (winnersByIndex.size > NUM.ZERO) {
    dispatchRecord.winnerAssigned = true;
  }
  for (let index = NUM.ZERO; index < active.length; index += NUM.ONE) {
    const entry = active[index];
    if (winnersByIndex.has(index)) {
      applyContinuationWakeWakeup(
        entry.rebalancer,
        entry.state,
        UNIFIED_REBALANCER_LITERAL.ZERO,
        winnersByIndex.get(index),
        NUM.ZERO,
      );
      continue;
    }
    if (shouldYieldSlotWakeToNodesPartition(entry.rebalancer, active)) {
      continue;
    }
    const staggerDelayMs =
      SLOT_WAKE_STAGGER_BASE_MS +
      dispatchRecord.staggerCount * SLOT_WAKE_STAGGER_STEP_MS;
    dispatchRecord.staggerCount += NUM.ONE;
    applyContinuationWakeWakeup(entry.rebalancer, entry.state, staggerDelayMs);
  }
}

function scheduleOwnOperationContinuationMicrotask(rebalancer, state) {
  if (state.pending === true) {
    return;
  }
  state.pending = true;
  queueMicrotask(() => {
    applyContinuationWakeWakeup(
      rebalancer,
      state,
      UNIFIED_REBALANCER_LITERAL.ZERO,
    );
  });
}

function enqueueSlotWakeContender(rebalancer, state, normalized) {
  const dispatchRecord = resolveSlotWakeDispatchRecord(
    state,
    normalized.operationId,
    normalized.targetNodeId,
  );
  if (!dispatchRecord) {
    scheduleOwnOperationContinuationMicrotask(rebalancer, state);
    return;
  }
  const alreadyQueued = dispatchRecord.contenders.some(
    (entry) => entry.rebalancer === rebalancer,
  );
  if (!alreadyQueued) {
    dispatchRecord.contenders.push({rebalancer, state});
  }
  if (!dispatchRecord.flushScheduled) {
    dispatchRecord.flushScheduled = true;
    queueMicrotask(() => flushSlotWakeDispatchRecord(dispatchRecord));
  }
}

function canObserveContinuationWake(rebalancer, state) {
  return (
    rebalancer.operationContinuationWakeState === state &&
    rebalancer.isLeader === true &&
    !rebalancer.isShuttingDown
  );
}

function handleOperationContinuationObservation(rebalancer, state, operation) {
  if (!canObserveContinuationWake(rebalancer, state)) {
    return;
  }
  const normalized = normalizeReplicaOperationRecord(operation);
  if (hasRecentlyWokenOperation(rebalancer, normalized.operationId)) {
    return;
  }
  if (state.clearPriorityCheckFloorOnTerminal === true) {
    if (normalized.partitionId === rebalancer.entityId) {
      return;
    }
    recordRecentlyWokenOperation(rebalancer, normalized.operationId);
    rebalancer.lastCheckAtMs = UNIFIED_REBALANCER_LITERAL.ZERO;
    rebalancer.disarmOperationContinuationWake();
    return;
  }
  const ownMatch =
    state.awaitingOwnOperationCompletion === true &&
    normalized.partitionId === rebalancer.entityId;
  const slotMatch =
    state.awaitingBudgetSlotRelease === true &&
    normalized.partitionId !== rebalancer.entityId;
  if (!ownMatch && !slotMatch) {
    return;
  }
  if (!ownMatch && shouldYieldSlotWakeToNodesPartition(rebalancer)) {
    return;
  }
  recordRecentlyWokenOperation(rebalancer, normalized.operationId);
  if (ownMatch) {
    state.pendingOwnMatch = true;
    scheduleOwnOperationContinuationMicrotask(rebalancer, state);
    return;
  }
  enqueueSlotWakeContender(rebalancer, state, normalized);
}

function canReuseContinuationWakeState(existing, rebalancer, attachCacheListener) {
  return Boolean(
    existing &&
    existing.coordinator === rebalancer.rebalanceCoordinator &&
    existing.cache === rebalancer.systemTableCache &&
    existing.attachCacheListener === attachCacheListener,
  );
}

function applyContinuationWakeOptions(target, options) {
  target.awaitingOwnOperationCompletion =
    options?.awaitingOwnOperationCompletion === true;
  target.awaitingBudgetSlotRelease =
    options?.awaitingBudgetSlotRelease === true;
  target.awaitingBudgetExhausted =
    options?.awaitingBudgetExhausted === true;
  target.clearPriorityCheckFloorOnTerminal =
    options?.clearPriorityCheckFloorOnTerminal === true;
}

function buildContinuationWakeState(rebalancer, options, attachCacheListener) {
  const state = {
    awaitingOwnOperationCompletion: false,
    awaitingBudgetSlotRelease: false,
    awaitingBudgetExhausted: false,
    clearPriorityCheckFloorOnTerminal: false,
    attachCacheListener,
    pending: false,
    pendingOwnMatch: false,
    staggerDelayMs: UNIFIED_REBALANCER_LITERAL.ZERO,
    coordinator: rebalancer.rebalanceCoordinator || null,
    cache: rebalancer.systemTableCache || null,
    onTerminal: null,
    cacheListener: null,
  };
  applyContinuationWakeOptions(state, options);
  return state;
}

function attachOperationContinuationListeners(
  rebalancer,
  state,
  attachCacheListener = true,
) {
  const onTerminal = (payload) => {
    const operation = payload?.operation ? payload.operation : payload;
    handleOperationContinuationObservation(rebalancer, state, operation);
  };
  const cacheListener = (tableName, _cacheOperation, record) => {
    if (tableName !== TABLES.REPLICA_OPERATIONS) {
      return;
    }
    const normalized = normalizeReplicaOperationRecord(record);
    if (!doesOperationTransitionReleaseSystemTargetNodeSlot(normalized)) {
      return;
    }
    handleOperationContinuationObservation(rebalancer, state, normalized);
  };
  let attached = false;
  if (state.coordinator?.on) {
    state.coordinator.setMaxListeners?.(NUM.ZERO);
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
  if (attachCacheListener && state.cache?.onCacheChange) {
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
      if (this.isControlPlanePriorityPartition() === true) {
        this.armOperationContinuationWake({
          clearPriorityCheckFloorOnTerminal: true,
          attachCacheListener: false,
        });
      } else if (
        this.isPartitionBelowDeclaredDistinctHostSpread?.() === true &&
        !this.getCriticalSystemTrafficReadinessBlocker?.()
      ) {
        this.syncOperationContinuationWake(
          null,
          UNIFIED_REBALANCER_LITERAL.ZERO,
        );
      }
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
      this.disarmOperationContinuationWake();
      return false;
    }
    const hitBudgetExceeded =
      hasBudgetExceededRebalanceOutcome(rebalanceResult);
    const underDistinctSpread =
      this.isPartitionBelowDeclaredDistinctHostSpread?.() === true;
    if (!hitBudgetExceeded && !underDistinctSpread) {
      this.disarmOperationContinuationWake();
      return false;
    }
    const inFlightOperations = this.getInFlightOperations?.();
    const ownInFlightCount = Array.isArray(inFlightOperations) ?
      inFlightOperations.length :
      UNIFIED_REBALANCER_LITERAL.ZERO;
    const hasOwnInFlight =
      executedMoveCount > UNIFIED_REBALANCER_LITERAL.ZERO ||
      ownInFlightCount > UNIFIED_REBALANCER_LITERAL.ZERO;
    return this.armOperationContinuationWake({
      awaitingOwnOperationCompletion: hasOwnInFlight,
      awaitingBudgetSlotRelease: !hasOwnInFlight,
      awaitingBudgetExhausted: hitBudgetExceeded,
    });
  },

  armOperationContinuationWake(options) {
    if (!this.isLeader || this.isShuttingDown) {
      this.disarmOperationContinuationWake();
      return false;
    }
    const attachCacheListener = options?.attachCacheListener !== false;
    const existing = this.operationContinuationWakeState;
    if (canReuseContinuationWakeState(existing, this, attachCacheListener)) {
      applyContinuationWakeOptions(existing, options);
      registerArmedSlotContender(this, existing);
      return true;
    }
    if (existing) {
      this.disarmOperationContinuationWake();
    }
    const state = buildContinuationWakeState(this, options, attachCacheListener);
    this.operationContinuationWakeState = state;
    if (!attachOperationContinuationListeners(this, state, attachCacheListener)) {
      this.operationContinuationWakeState = null;
      return false;
    }
    registerArmedSlotContender(this, state);
    return true;
  },

  disarmOperationContinuationWake() {
    const state = this.operationContinuationWakeState;
    this.operationContinuationWakeState = null;
    if (!state) {
      return;
    }
    unregisterArmedSlotContender(this);
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

  completeSlotReleaseContinuationCycle(executedMoveCount) {
    const context = this._slotReleaseWakeContext;
    this._slotReleaseWakeContext = null;
    if (
      !context ||
      executedMoveCount > UNIFIED_REBALANCER_LITERAL.ZERO ||
      context.handoffDepth >= MAX_SLOT_RELEASE_HANDOFF_HOPS
    ) {
      return false;
    }
    return this.handOffUnusedContinuationSlotWake(
      context.targetNodeId,
      context.handoffDepth,
    );
  },

  handOffUnusedContinuationSlotWake(targetNodeId, handoffDepth = NUM.ZERO) {
    if (!targetNodeId || handoffDepth >= MAX_SLOT_RELEASE_HANDOFF_HOPS) {
      return false;
    }
    const host = resolveRebalancerDispatchHost(this);
    const entries = collectSlotHandoffEntries(host, this);
    const winnerIndex = selectSlotWakeWinnerIndex(entries, targetNodeId);
    if (winnerIndex < NUM.ZERO) {
      return false;
    }
    const winner = entries[winnerIndex];
    applyContinuationWakeWakeup(
      winner.rebalancer,
      winner.state,
      UNIFIED_REBALANCER_LITERAL.ZERO,
      targetNodeId,
      handoffDepth + NUM.ONE,
    );
    return true;
  },

  resolveContinuationSafetyDelayMs() {
    const wakeState = this.operationContinuationWakeState;
    const continuationArmed = Boolean(
      wakeState?.awaitingOwnOperationCompletion ||
        wakeState?.awaitingBudgetSlotRelease,
    );
    if (
      this.usesPriorityRebalanceCadence() ||
      this.isFormationLivenessDependencyPartition() ||
      !continuationArmed
    ) {
      return null;
    }
    const priorityRetryDelayMs = this.getPriorityRetryDelayMs();
    const jitterMs = Math.floor(
      this.randomSource.random() * priorityRetryDelayMs,
    );
    return NUM.THREE * priorityRetryDelayMs + jitterMs;
  },
};

export {REBALANCER_LOCAL_MUTATION_READINESS_WAKE_METHODS};
