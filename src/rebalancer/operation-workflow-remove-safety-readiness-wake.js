/**
 * Owner contract:
 * Owner: OperationWorkflowOwner level-triggered remove-safety readiness wake
 * (quest replace-source-removal-owner, design §3.3 R-2 as amended by
 * challengers BR1, BR2 and A9; owner directive 2026-09-25).
 * Inputs: the readiness owner's snapshot publications (a wake only, never
 * authority) and the owner's own synchronous remove-safety readiness reads.
 * Canonical output: a re-run of the SAME deferred remove-safety owner body
 * the 1 s fallback timer runs (runDeferredSafetyRetryInLane), which re-reads
 * the operation and re-evaluates remove safety from authoritative reads.
 * Prohibited fallbacks: the event's snapshot is never read; no token dedupe
 * (a same-token republication or another build variant must still wake); no
 * event ledger; the wake never decides that removal is safe.
 *
 * The level, not a generation. A refresh-pending placeholder flips to the
 * current answer under an UNCHANGED planning identity (BR1/A9), so the
 * recheck compares the remove-safety readiness LEVEL itself: per node, the
 * owner's own participation read (isNodeReadyForRouting with the
 * remove-safety dimension and owner-read participation kind, which is
 * getControlPlaneParticipationSync) and its evidence-absent denial read
 * (isEvidenceAbsentReadinessDenial). These are exactly the readiness inputs
 * remove safety decides on.
 *
 * Lost-wakeup rule. The level is captured BEFORE the evaluation's reads.
 * On DEFER the owner subscribes (once, permanently), registers the waiter
 * with that entry level, and only then re-reads the level: any change since
 * entry wakes at once. Registration is a synchronous map write and
 * publications run in their own macrotasks, so a publication either precedes
 * the recheck (the level shows it) or follows the registration (the listener
 * sees the waiter).
 *
 * No lost edges (BR2). A wake never submits a bare lane run: the owner lane
 * JOINS an in-flight holder and discards the new factory. The wake takes the
 * owner's retained turn (OPERATION_OWNER_TURN_POLICY.RETAIN), which waits for
 * the holder and resubmits; and the per-operation rerun-on-dirty loop runs
 * again after each turn while the level the owner last deferred on differs
 * from the current level (a change during the run itself), until the waiter
 * is gone (the operation progressed or left the deferrable phase) or the run
 * bound hands liveness back to the armed 1 s fallback.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  runDeferredSafetyReentryTurn,
} from './operation-workflow-dispatch-rearm-evidence.js';

const {
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const REMOVE_SAFETY_READINESS_WAKE_BOUNDARY = 'safety_readiness_wake';
// Bounded resubmission: a level that keeps changing is re-evaluated at most
// this many times per wake; the 1 s fallback timer stays armed meanwhile.
const REMOVE_SAFETY_READINESS_WAKE_MAX_RUNS = 16;
const LEVEL_NODE_SEPARATOR = '|';
const LEVEL_FIELD_SEPARATOR = ':';
const LEVEL_TRUE = '1';
const LEVEL_FALSE = '0';

// Owner-scoped state, keyed by the owner instance (released with it and
// cleared at shutdown).
const WAKE_STATE_BY_OWNER = new WeakMap();

function readWakeState(owner) {
  let state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state) {
    state = {
      waiterByOperationId: new Map(),
      redriveInFlightOperationIds: new Set(),
      // At most one entry: the permanent readiness subscription's release.
      unsubscribes: [],
    };
    WAKE_STATE_BY_OWNER.set(owner, state);
  }
  return state;
}

function addNodeId(nodeIds, nodeId) {
  if (typeof nodeId === 'string' && nodeId.length > 0) {
    nodeIds.add(nodeId);
  }
}

function collectRemoveSafetyReadinessNodeIds(owner, operation) {
  const nodeIds = new Set();
  addNodeId(nodeIds, operation?.sourceNodeId);
  addNodeId(nodeIds, operation?.targetNodeId);
  const rows = typeof owner.getCachedCriticalReplicaRows === 'function' ?
    owner.getCachedCriticalReplicaRows(operation?.partitionId) :
    [];
  for (const row of Array.isArray(rows) ? rows : []) {
    addNodeId(nodeIds, row?.node_id);
  }
  return [...nodeIds].sort();
}

function readNodeLevel(owner, nodeId, readinessOptions) {
  const ready = owner.isNodeReadyForRouting(nodeId, readinessOptions) === true;
  const evidenceAbsent =
    typeof owner.isEvidenceAbsentReadinessDenial === 'function' &&
    owner.isEvidenceAbsentReadinessDenial(nodeId, readinessOptions) === true;
  return nodeId + LEVEL_FIELD_SEPARATOR +
    (ready ? LEVEL_TRUE : LEVEL_FALSE) +
    (evidenceAbsent ? LEVEL_TRUE : LEVEL_FALSE);
}

function readRemoveSafetyReadinessLevel(owner, operation, nodeIds) {
  const readinessOptions = {
    partitionId: operation?.partitionId || null,
    decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
    participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  };
  return nodeIds
    .map((nodeId) => readNodeLevel(owner, nodeId, readinessOptions))
    .join(LEVEL_NODE_SEPARATOR);
}

/**
 * Capture the remove-safety readiness level before an evaluation reads it.
 * Only a deferrable remove phase is captured; anything else returns null.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Object|null} Frozen {nodeIds, levelKey}.
 */
function captureRemoveSafetyReadinessLevel(owner, operation) {
  if (
    !operation?.operationId ||
    owner.isSafetyDeferredRetryableOperation(operation) !== true
  ) {
    return null;
  }
  const nodeIds = collectRemoveSafetyReadinessNodeIds(owner, operation);
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    levelKey: readRemoveSafetyReadinessLevel(owner, operation, nodeIds),
  });
}

function ensureReadinessSubscription(owner, state) {
  if (state.unsubscribes.length > 0) {
    return;
  }
  const service = owner.controlPlaneReadinessService;
  if (typeof service?.subscribeReadinessPlanningSnapshots !== 'function') {
    return;
  }
  state.unsubscribes.push(service.subscribeReadinessPlanningSnapshots(
    (event) => handleReadinessPublication(owner, event),
  ));
}

function handleReadinessPublication(owner, event) {
  const nodeId = event?.ownerKey;
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state || typeof nodeId !== 'string' || owner.isShuttingDown) {
    return;
  }
  for (const [operationId, waiter] of state.waiterByOperationId) {
    if (waiter.nodeIds.includes(nodeId)) {
      // Leave the readiness owner's notify loop before re-reading readiness.
      Promise.resolve().then(() =>
        redriveRemoveSafetyReadinessWake(owner, operationId));
    }
  }
}

/**
 * Register a remove-safety deferral with the readiness wake: subscribe,
 * register, then recheck the level (subscribe-before-recheck).
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} entryLevel - captureRemoveSafetyReadinessLevel result
 *   taken before the deferring evaluation.
 * @return {boolean} Whether a waiter was registered.
 */
function registerRemoveSafetyReadinessWaiter(owner, operation, entryLevel) {
  const operationId = operation?.operationId;
  if (!entryLevel || !operationId || owner.isShuttingDown) {
    return false;
  }
  const state = readWakeState(owner);
  ensureReadinessSubscription(owner, state);
  state.waiterByOperationId.set(operationId, Object.freeze({
    operation,
    nodeIds: entryLevel.nodeIds,
    levelKey: entryLevel.levelKey,
  }));
  if (
    readRemoveSafetyReadinessLevel(owner, operation, entryLevel.nodeIds) !==
    entryLevel.levelKey
  ) {
    redriveRemoveSafetyReadinessWake(owner, operationId);
  }
  return true;
}

function isWaiterLevelCurrent(owner, waiter) {
  return readRemoveSafetyReadinessLevel(
    owner,
    waiter.operation,
    waiter.nodeIds,
  ) === waiter.levelKey;
}

function runWaiterInOwnerTurn(owner, state, operationId, waiter) {
  // Consumed when its turn starts; the run re-registers a fresh waiter (with
  // its own entry level) if it defers again.
  return runDeferredSafetyReentryTurn(owner, waiter.operation, {
    boundary: REMOVE_SAFETY_READINESS_WAKE_BOUNDARY,
    onAdmitted: () => {
      if (state.waiterByOperationId.get(operationId) === waiter) {
        state.waiterByOperationId.delete(operationId);
      }
    },
  });
}

/**
 * Re-drive one deferred operation while its readiness level differs from the
 * level it last deferred on. Joined holders and runs that deferred on a stale
 * read are followed by a resubmission, so no wake edge is lost.
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<void>}
 */
async function redriveRemoveSafetyReadinessWake(owner, operationId) {
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state || state.redriveInFlightOperationIds.has(operationId)) {
    return;
  }
  state.redriveInFlightOperationIds.add(operationId);
  try {
    for (let run = 0; run < REMOVE_SAFETY_READINESS_WAKE_MAX_RUNS; run++) {
      if (owner.isShuttingDown || !owner.isInitialized) {
        return;
      }
      const waiter = state.waiterByOperationId.get(operationId);
      if (!waiter || isWaiterLevelCurrent(owner, waiter)) {
        return;
      }
      await runWaiterInOwnerTurn(owner, state, operationId, waiter);
    }
  } finally {
    state.redriveInFlightOperationIds.delete(operationId);
  }
}

/**
 * The operation left the deferral (SAFE, a transition, or terminal).
 * @param {Object} owner
 * @param {string} operationId
 */
function clearRemoveSafetyReadinessWaiter(owner, operationId) {
  WAKE_STATE_BY_OWNER.get(owner)?.waiterByOperationId.delete(operationId);
}

/**
 * Release the subscription and every waiter (R13).
 * @param {Object} owner
 */
function shutdownRemoveSafetyReadinessWake(owner) {
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state) {
    return;
  }
  for (const unsubscribe of state.unsubscribes.splice(0)) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  state.waiterByOperationId.clear();
}

export {
  captureRemoveSafetyReadinessLevel,
  clearRemoveSafetyReadinessWaiter,
  registerRemoveSafetyReadinessWaiter,
  shutdownRemoveSafetyReadinessWake,
};
