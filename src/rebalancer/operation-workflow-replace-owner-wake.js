/**
 * Owner contract:
 * Owner: the single level-triggered wake of the REPLACE owner (quest
 * replace-source-removal-owner: R-2 as amended by challengers BR1, BR2 and
 * A9, generalised by amendment-1 step 0 to every level the owner waits on).
 * Inputs (wakes only, never authority):
 *  - the readiness owner's snapshot publications;
 *  - the node's replicated services rows (a REPLACE source's row change);
 *  - the node's partition consensus relay (the replica handler's tracked
 *    services): the applied ConfState announcement and the leader/term
 *    announcements of every local replica.
 * Canonical output: a re-run of the SAME deferred owner body the 1 s
 * fallback timer runs (runDeferredSafetyReentryTurn), which re-reads the
 * operation and decides again from authoritative reads; and, on the node
 * hosting a REPLACE's target, a wake of that REPLACE's remote owner through
 * the existing remote-owner ingress.
 * Prohibited fallbacks: an event's payload never decides anything; no token
 * dedupe (a same-token republication or another build variant still wakes);
 * no event ledger; a wake never decides that removal is safe or complete.
 *
 * The level, not a generation. The owner's waited-on inputs are compared as
 * one level key:
 *  - readiness: per node, the owner's own participation read
 *    (isNodeReadyForRouting with the remove-safety dimension and owner-read
 *    participation kind, which is getControlPlaneParticipationSync) and its
 *    evidence-absent denial read (isEvidenceAbsentReadinessDenial). A
 *    refresh-pending placeholder flips to the current answer under an
 *    UNCHANGED planning identity (BR1/A9), so the answer itself is compared;
 *  - consensus: the last applied ConfState, leader and term the local relay
 *    announced for the operation's partition;
 *  - concurrency: the other non-terminal operations cached for the
 *    partition;
 *  - source-row class: the REPLACE source replica's lifecycle row as the
 *    cache holds it (a change wakes the owner through
 *    wakeReplaceOwnersForReplicaRow, from the node's cache-change feed);
 *  - attempt state: the owner's handoff attempt (sequence, answer class)
 *    and R-1f attempt (sequence, answered or not).
 *
 * Lost-wakeup rule. The level is captured BEFORE the owner's reads. When the
 * owner waits it subscribes (once, permanently), registers the waiter with
 * that entry level, and only then re-reads the level: any change since entry
 * wakes at once. Registration is a synchronous map write and events run in
 * their own turns, so an event either precedes the recheck (the level shows
 * it) or follows the registration (the listener sees the waiter).
 *
 * No lost edges (BR2). A wake takes the owner's retained turn
 * (OPERATION_OWNER_TURN_POLICY.RETAIN), which waits for a holder and
 * resubmits; and the per-operation rerun-on-dirty loop runs again after each
 * turn while the level the owner last waited on differs from the current
 * level, until the waiter is gone (the operation progressed or left the
 * waiting phase) or the run bound hands liveness back to the armed 1 s
 * fallback.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  runDeferredSafetyReentryTurn,
} from './operation-workflow-dispatch-rearm-evidence.js';
import {
  readReplaceHandoffAttempt,
} from './operation-workflow-replace-handoff-attempt.js';
import {readOwnerState} from './operation-workflow-replace-owner-state.js';

const {
  OperationType,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const REPLACE_OWNER_WAKE_BOUNDARY = 'replace_owner_wake';
// Bounded resubmission: a level that keeps changing is re-evaluated at most
// this many times per wake; the 1 s fallback timer stays armed meanwhile.
const REPLACE_OWNER_WAKE_MAX_RUNS = 16;
const LEVEL_NODE_SEPARATOR = '|';
const LEVEL_FIELD_SEPARATOR = ':';
const LEVEL_PART_SEPARATOR = '#';
const LEVEL_TRUE = '1';
const LEVEL_FALSE = '0';
const NO_CONSENSUS_OBSERVATION = '';

// Owner-scoped state, keyed by the owner instance (released with it and
// cleared at shutdown).
const WAKE_STATE_BY_OWNER = new WeakMap();

function readWakeState(owner) {
  let state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state) {
    state = {
      waiterByOperationId: new Map(),
      redriveInFlightOperationIds: new Set(),
      consensusLevelByPartitionId: new Map(),
      // At most two entries: the readiness subscription's and the consensus
      // relay subscription's release.
      unsubscribes: [],
      readinessSubscribed: false,
      consensusSubscribed: false,
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

function collectReplaceOwnerNodeIds(owner, operation) {
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

function readReplaceOwnerLevel(owner, operation, nodeIds) {
  const readinessOptions = {
    partitionId: operation?.partitionId || null,
    decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
    participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  };
  const readinessLevel = nodeIds
    .map((nodeId) => readNodeLevel(owner, nodeId, readinessOptions))
    .join(LEVEL_NODE_SEPARATOR);
  const consensusLevel = WAKE_STATE_BY_OWNER.get(owner)
    ?.consensusLevelByPartitionId.get(operation?.partitionId) ??
    NO_CONSENSUS_OBSERVATION;
  return [
    readinessLevel,
    consensusLevel,
    concurrentOperationLevel(owner, operation),
    sourceRowLevel(owner, operation),
    attemptLevel(owner, operation),
  ].join(LEVEL_PART_SEPARATOR);
}

// The REPLACE source replica's lifecycle row as the cache holds it.
function sourceRowLevel(owner, operation) {
  const sourceReplicaId = operation?.type === OperationType.REPLACE ?
    owner.repository?.getReplaceSourceReplicaId?.(operation) : null;
  if (!sourceReplicaId ||
      typeof owner.repository?.getObservedReplicaStatusFromCache !==
        'function') {
    return NO_CONSENSUS_OBSERVATION;
  }
  return String(owner.repository.getObservedReplicaStatusFromCache(
    sourceReplicaId, operation.partitionId, operation.sourceNodeId,
    {allowPartitionNodeFallback: false}) ?? NO_CONSENSUS_OBSERVATION);
}

// The owner's own attempt state: the handoff attempt and the R-1f attempt.
function attemptLevel(owner, operation) {
  const handoff = readReplaceHandoffAttempt(owner, operation?.operationId);
  const retirement = readOwnerState(owner).retirementAttemptByOperationId
    .get(operation?.operationId);
  return [
    handoff?.attemptSeq ?? NO_CONSENSUS_OBSERVATION,
    handoff?.answerClass ?? NO_CONSENSUS_OBSERVATION,
    retirement?.attemptSeq ?? NO_CONSENSUS_OBSERVATION,
    retirement ? (retirement.answer === null ? LEVEL_FALSE : LEVEL_TRUE) :
      NO_CONSENSUS_OBSERVATION,
  ].join(LEVEL_FIELD_SEPARATOR);
}

/**
 * A replicated services row changed: wake every waiting REPLACE whose source
 * replica it is (the source-row part of the level).
 * @param {Object} owner
 * @param {Object|null} record - The services row.
 */
function wakeReplaceOwnersForReplicaRow(owner, record) {
  const state = WAKE_STATE_BY_OWNER.get(owner);
  const replicaId = record?.replica_id || record?.service_id;
  if (!state || typeof replicaId !== 'string' || owner.isShuttingDown) {
    return;
  }
  wakeWaiters(owner, state, (waiter) =>
    owner.repository?.getReplaceSourceReplicaId?.(waiter.operation) ===
      replicaId);
}

// The other non-terminal operations the cache holds for the partition: a
// REMOVE created or dispatched while the owner decided (A12 check 5) moves
// the level.
function concurrentOperationLevel(owner, operation) {
  if (typeof owner.repository?.filterReplicaOperationRowsFromCache !==
      'function') {
    return NO_CONSENSUS_OBSERVATION;
  }
  const rows = owner.repository.filterReplicaOperationRowsFromCache((row) =>
    row?.partition_id === operation?.partitionId &&
    row?.operation_id !== operation?.operationId &&
    (row?.completed_at === null || row?.completed_at === undefined)) || [];
  return rows.map((row) => row.operation_id).sort()
    .join(LEVEL_NODE_SEPARATOR);
}

/**
 * Capture the REPLACE owner's waited-on level before a decision reads it.
 * Only a deferrable remove phase (ACTIVE or STOPPING, or a REMOVE's initial
 * dispatch) is captured; anything else returns null.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Object|null} Frozen {nodeIds, levelKey}.
 */
function captureReplaceOwnerLevel(owner, operation) {
  if (
    !operation?.operationId ||
    owner.isSafetyDeferredRetryableOperation(operation) !== true
  ) {
    return null;
  }
  const nodeIds = collectReplaceOwnerNodeIds(owner, operation);
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    levelKey: readReplaceOwnerLevel(owner, operation, nodeIds),
  });
}

function wakeWaiters(owner, state, matches) {
  for (const [operationId, waiter] of state.waiterByOperationId) {
    if (matches(waiter)) {
      // Leave the publisher's notify loop before re-reading anything.
      Promise.resolve().then(() =>
        redriveReplaceOwnerWake(owner, operationId));
    }
  }
}

function handleReadinessPublication(owner, event) {
  const nodeId = event?.ownerKey;
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state || typeof nodeId !== 'string' || owner.isShuttingDown) {
    return;
  }
  wakeWaiters(owner, state, (waiter) => waiter.nodeIds.includes(nodeId));
}

function sortedIds(ids) {
  return [...(ids || [])].map(String).sort();
}

// An event carries one of membership, leader or term; the others keep
// their previous observation.
function carriedObservation(eventValue, previousValue) {
  return eventValue !== undefined ? eventValue : previousValue ?? null;
}

function consensusLevelOf(event, previous) {
  const confState = event?.confState;
  const confKey = confState ?
    JSON.stringify([
      sortedIds(confState.voters),
      sortedIds(confState.votersOutgoing),
    ]) :
    previous?.confKey ?? NO_CONSENSUS_OBSERVATION;
  return {
    confKey,
    leaderReplicaId: carriedObservation(
      event?.leaderReplicaId, previous?.leaderReplicaId),
    term: carriedObservation(event?.term, previous?.term),
  };
}

// The target replica of a REPLACE hosted on this node whose owner is on
// another node: that owner cannot observe this replica's consensus events,
// so they are forwarded through the existing remote-owner wake ingress.
function wakeRemoteReplaceOwners(owner, partitionId, replicaId) {
  if (typeof owner.repository?.filterReplicaOperationRowsFromCache !==
      'function' ||
      typeof owner.wakeCoordinatorCreatedRemoteOwner !== 'function') {
    return;
  }
  const rows = owner.repository.filterReplicaOperationRowsFromCache((row) =>
    row?.partition_id === partitionId &&
    row?.type === OperationType.REPLACE &&
    (row?.completed_at === null || row?.completed_at === undefined));
  for (const row of rows || []) {
    const operation = owner.repository.rowToOperation?.(row) || null;
    if (!operation || owner.repository.isOperationLocallyOwned(operation) ||
        owner.repository.getReplaceTargetReplicaId?.(operation) !== replicaId) {
      continue;
    }
    owner.wakeCoordinatorCreatedRemoteOwner(operation).catch(() => false);
  }
}

function handleConsensusObservation(owner, event) {
  const partitionId = event?.partitionId;
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state || typeof partitionId !== 'string' || owner.isShuttingDown) {
    return;
  }
  const previous = state.consensusLevelByPartitionId.get(partitionId);
  const next = consensusLevelOf(event, previous && JSON.parse(previous));
  state.consensusLevelByPartitionId.set(partitionId, JSON.stringify(next));
  wakeWaiters(owner, state,
    (waiter) => waiter.operation?.partitionId === partitionId);
  Promise.resolve().then(() =>
    wakeRemoteReplaceOwners(owner, partitionId, event?.replicaId));
}

function ensureWakeSubscriptions(owner, state) {
  const service = owner.controlPlaneReadinessService;
  if (!state.readinessSubscribed &&
      typeof service?.subscribeReadinessPlanningSnapshots === 'function') {
    state.readinessSubscribed = true;
    state.unsubscribes.push(service.subscribeReadinessPlanningSnapshots(
      (event) => handleReadinessPublication(owner, event),
    ));
  }
  attachReplicaConsensusEvents(owner, owner.replicaConsensusEvents);
}

/**
 * Subscribe the owner to the node's partition consensus relay (the replica
 * handler's tracked services). Idempotent; the subscription is permanent
 * until shutdown.
 * @param {Object} owner
 * @param {Object|null} source - {subscribe(listener)}.
 * @return {boolean} Whether the owner is subscribed.
 */
function attachReplicaConsensusEvents(owner, source) {
  if (typeof source?.subscribe !== 'function' || owner.isShuttingDown) {
    return false;
  }
  owner.replicaConsensusEvents = source;
  const state = readWakeState(owner);
  if (state.consensusSubscribed) {
    return true;
  }
  state.consensusSubscribed = true;
  state.unsubscribes.push(source.subscribe(
    (event) => handleConsensusObservation(owner, event),
  ));
  return true;
}

/**
 * Register a REPLACE-owner wait with the wake: subscribe, register, then
 * recheck the level (subscribe-before-recheck).
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object|null} entryLevel - captureReplaceOwnerLevel result taken
 *   before the waiting decision read its inputs.
 * @return {boolean} Whether a waiter was registered.
 */
function registerReplaceOwnerWaiter(owner, operation, entryLevel) {
  const operationId = operation?.operationId;
  if (!entryLevel || !operationId || owner.isShuttingDown) {
    return false;
  }
  const state = readWakeState(owner);
  ensureWakeSubscriptions(owner, state);
  state.waiterByOperationId.set(operationId, Object.freeze({
    operation,
    nodeIds: entryLevel.nodeIds,
    levelKey: entryLevel.levelKey,
  }));
  if (
    readReplaceOwnerLevel(owner, operation, entryLevel.nodeIds) !==
    entryLevel.levelKey
  ) {
    redriveReplaceOwnerWake(owner, operationId);
  }
  return true;
}

function isWaiterLevelCurrent(owner, waiter) {
  return readReplaceOwnerLevel(
    owner,
    waiter.operation,
    waiter.nodeIds,
  ) === waiter.levelKey;
}

function runWaiterInOwnerTurn(owner, state, operationId, waiter) {
  // Consumed when its turn starts; the run re-registers a fresh waiter (with
  // its own entry level) if it waits again.
  return runDeferredSafetyReentryTurn(owner, waiter.operation, {
    boundary: REPLACE_OWNER_WAKE_BOUNDARY,
    onAdmitted: () => {
      if (state.waiterByOperationId.get(operationId) === waiter) {
        state.waiterByOperationId.delete(operationId);
      }
    },
  });
}

/**
 * Re-drive one waiting operation while its level differs from the level it
 * last waited on. Joined holders and runs that decided on a stale read are
 * followed by a resubmission, so no wake edge is lost.
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<void>}
 */
async function redriveReplaceOwnerWake(owner, operationId) {
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state || state.redriveInFlightOperationIds.has(operationId)) {
    return;
  }
  state.redriveInFlightOperationIds.add(operationId);
  try {
    for (let run = 0; run < REPLACE_OWNER_WAKE_MAX_RUNS; run++) {
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
 * The operation left the wait (progress, a transition, or terminal).
 * @param {Object} owner
 * @param {string} operationId
 */
function clearReplaceOwnerWaiter(owner, operationId) {
  WAKE_STATE_BY_OWNER.get(owner)?.waiterByOperationId.delete(operationId);
}

/**
 * Release the subscriptions and every waiter (R13).
 * @param {Object} owner
 */
function shutdownReplaceOwnerWake(owner) {
  const state = WAKE_STATE_BY_OWNER.get(owner);
  if (!state) {
    return;
  }
  for (const unsubscribe of state.unsubscribes.splice(0)) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  state.readinessSubscribed = false;
  state.consensusSubscribed = false;
  state.waiterByOperationId.clear();
  state.consensusLevelByPartitionId.clear();
}

export {
  attachReplicaConsensusEvents,
  wakeReplaceOwnersForReplicaRow,
  captureReplaceOwnerLevel,
  clearReplaceOwnerWaiter,
  registerReplaceOwnerWaiter,
  shutdownReplaceOwnerWake,
};
