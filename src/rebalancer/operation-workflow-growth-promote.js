/**
 * OperationWorkflowOwner helpers for durable GROWTH_PROMOTE operations
 * (1-voter founding + odd-voter growth via joint learner promotion).
 *
 * @module rebalancer/operation-workflow-growth-promote
 */

import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {readLowerStateField, readUpperStateField} from '../utils/state-field-read.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED,
} from './operation-workflow-recovery-reconcile-shared.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';

const {
  OPERATION_TRANSITION_REASON, OPERATION_WORKFLOW_OWNER_LITERAL, OperationType,
  REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG, ReplicaStatus, WORKFLOW_STEP,
} = SHARED;

const {
  ReplicaOperationField, ReplicaOperationResponseStatus, SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const GROWTH_PROMOTE_RETRYABLE_REASONS = Object.freeze(new Set([
  'promotion_progress_behind', 'conf_change_pending', 'leader_term_unapplied',
  'not_leader', 'membership-change-not-leader', 'authority_unavailable',
  'base_configuration_changed',
]));
const NOT_LEADER_REASONS = Object.freeze(
  new Set(['not_leader', 'membership-change-not-leader']),
);
const GROWTH_PROMOTE_OBSERVED_STATE = Object.freeze({
  UNAPPLICABLE: 'UNAPPLICABLE',
  COMPLETE_ACTIVE: 'COMPLETE_ACTIVE',
  REPLAY_DISPATCH: 'REPLAY_DISPATCH',
});
const OPERATION_RECONCILE_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  ADVANCED: 'advanced',
  WAITING: 'waiting',
  HELD: 'held',
  REFUSED: 'refused',
});
/**
 * Four-phase growth promotion settlement model:
 *   RECONCILING -> PERSISTING -> RELEASING -> SETTLED
 *
 * - RECONCILING: Authoritative committed Raft voter membership and completion
 *   provenance are verified before terminal persistence may begin.
 * - PERSISTING: Durable terminal transition is written to replica_operations.
 * - RELEASING: Durable terminal persistence has completed (or a winning
 *   terminal outcome was adopted) and live obligations are being discharged.
 * - SETTLED: Both durable terminal persistence (PERSISTING) and discharge of
 *   all associated live obligations (RELEASING: placement hold, storage
 *   reservation, retry/safety-block state) have completed.
 */
const GROWTH_SETTLEMENT_PHASE = Object.freeze({
  RECONCILING: 'reconciling',
  PERSISTING: 'persisting',
  RELEASING: 'releasing',
  SETTLED: 'settled',
});
const LOCAL_STR_CORE_OK = 'CORE_OK';
const LOCAL_STR_GROWTH_PROMOTE_REFUSED = 'growth_promote_refused';
const LOCAL_STR_LEADER = 'leader';

function didOperationReconcileAdvanceOrComplete(outcome) {
  return (
    outcome === OPERATION_RECONCILE_OUTCOME.COMPLETED ||
    outcome === OPERATION_RECONCILE_OUTCOME.ADVANCED ||
    outcome === true
  );
}

function isHeldGrowthPromoteOperation(operation) {
  return (
    operation?.type === OperationType.GROWTH_PROMOTE &&
    operation.status === ReplicaStatus.HELD
  );
}

function resolveGrowthPromoteReplicaIds(operation) {
  const explicit = operation?.[ReplicaOperationField.PROMOTE_REPLICA_IDS];
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter((id) => typeof id === 'string' && id.length > 0);
  }
  const fromHistory = Array.isArray(operation?.stepsHistory) ?
    operation.stepsHistory
      .map((entry) => entry?.[ReplicaOperationField.PROMOTE_REPLICA_IDS])
      .find((list) => Array.isArray(list) && list.length > 0) :
    null;
  if (Array.isArray(fromHistory) && fromHistory.length > 0) {
    return fromHistory.filter((id) => typeof id === 'string' && id.length > 0);
  }
  return [operation?.replicaId, operation?.sourceReplicaId].filter(
    (id) => typeof id === 'string' && id.length > 0,
  );
}

function applyGrowthPromoteRequestFields(request, operation) {
  const promoteReplicaIds = resolveGrowthPromoteReplicaIds(operation);
  let sourceReplicaId = null;
  if (operation.sourceReplicaId) {
    sourceReplicaId = operation.sourceReplicaId;
  } else if (promoteReplicaIds.length > 1) {
    sourceReplicaId = promoteReplicaIds[1];
  }
  request[ReplicaOperationField.SOURCE_REPLICA_ID] = sourceReplicaId;
  request[ReplicaOperationField.PROMOTE_REPLICA_IDS] = promoteReplicaIds;
  if (operation[ReplicaOperationField.EXPECTED_BASE_CONFIG]) {
    request[ReplicaOperationField.EXPECTED_BASE_CONFIG] =
      operation[ReplicaOperationField.EXPECTED_BASE_CONFIG];
  }
}

async function deferGrowthPromoteToSyncing(owner, operation) {
  if (operation.workflowStep !== WORKFLOW_STEP.SYNCING) {
    await owner.updateStep(operation, WORKFLOW_STEP.SYNCING);
  }
  owner.scheduleObservedProgressRetry?.(
    operation.operationId,
    SYSTEM_TABLE_NAME.SERVICES,
    OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
  );
  return owner.buildSuccessfulOperationResult(operation.operationId, {
    status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
  });
}

function isGrowthPromoteOperationTerminal(owner, operation) {
  if (!operation) return false;
  if (owner?.repository?.isOperationTerminal) {
    return owner.repository.isOperationTerminal(operation) === true;
  }
  const step = readUpperStateField(operation.workflowStep);
  return (
    (step === WORKFLOW_STEP.ACTIVE || step === WORKFLOW_STEP.FAILED) &&
    operation.completedAt !== null &&
    operation.completedAt !== undefined &&
    Number.isFinite(Number(operation.completedAt))
  );
}

function canEnterGrowthSettlementPersistence(owner, operation, options = {}) {
  if (!operation || operation.type !== OperationType.GROWTH_PROMOTE) return false;
  if (
    isGrowthPromoteOperationTerminal(owner, operation) ||
    isNormalizedGrowthPromoteCompleted(operation) ||
    observeGrowthPromoteIncompleteState(owner, operation) ===
      GROWTH_PROMOTE_OBSERVED_STATE.COMPLETE_ACTIVE
  ) {
    return true;
  }
  if (options?.response !== undefined) {
    return (
      options.response?.committedVotersReached === true &&
      hasValidGrowthPromoteCompletionProvenance(operation, options.response)
    );
  }
  if (options?.requireProvenance === true) return false;
  return resolveGrowthPromoteReplicaIds(operation).length > 0;
}

async function dischargeGrowthPromoteLiveObligations(owner, operation) {
  owner.clearTerminalOperationRetryState?.(operation);
  owner.clearTransitionRetry?.(operation?.operationId);
  await owner.releaseReservationForOperation?.(operation);
  owner.clearDeferredSafetyBlockState?.(operation?.operationId);
  await owner.releasePlacementHoldIfNeeded?.(operation);
}

function resolveTerminalAdoptedReconcileOutcome(operation) {
  return isNormalizedGrowthPromoteCompleted(operation) ?
    OPERATION_RECONCILE_OUTCOME.COMPLETED :
    OPERATION_RECONCILE_OUTCOME.FAILED;
}

function isIdempotentReplayGrowthSettled(owner, operation, completionOutcome) {
  return (
    completionOutcome?.committed === true ||
    isNormalizedGrowthPromoteCompleted(operation) ||
    observeGrowthPromoteIncompleteState(owner, operation) ===
      GROWTH_PROMOTE_OBSERVED_STATE.COMPLETE_ACTIVE
  );
}

const GROWTH_SETTLEMENT_DISPOSITION_TABLE = Object.freeze({
  [REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED]: Object.freeze({
    isDurableTerminal: () => true,
    resolveOutcome: () => OPERATION_RECONCILE_OUTCOME.COMPLETED,
  }),
  [REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED]: Object.freeze({
    isDurableTerminal: () => true,
    resolveOutcome: () => OPERATION_RECONCILE_OUTCOME.COMPLETED,
  }),
  [REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY]: Object.freeze({
    isDurableTerminal: (owner, op, out) => isIdempotentReplayGrowthSettled(owner, op, out),
    resolveOutcome: (owner, op, out) =>
      isIdempotentReplayGrowthSettled(owner, op, out) ?
        OPERATION_RECONCILE_OUTCOME.COMPLETED :
        OPERATION_RECONCILE_OUTCOME.WAITING,
  }),
  [REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED]: Object.freeze({
    isDurableTerminal: () => true,
    resolveOutcome: (_owner, op) => resolveTerminalAdoptedReconcileOutcome(op),
  }),
  [REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED]: Object.freeze({
    isDurableTerminal: () => false,
    resolveOutcome: () => OPERATION_RECONCILE_OUTCOME.REFUSED,
  }),
  [REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED]: Object.freeze({
    isDurableTerminal: () => false,
    resolveOutcome: () => OPERATION_RECONCILE_OUTCOME.WAITING,
  }),
});

const UNRECOGNIZED_GROWTH_SETTLEMENT_POLICY = Object.freeze({
  isDurableTerminal: () => false,
  resolveOutcome: () => OPERATION_RECONCILE_OUTCOME.WAITING,
});

function resolveGrowthSettlementDispositionPolicy(disposition) {
  if (
    typeof disposition === 'string' &&
    Object.hasOwn(GROWTH_SETTLEMENT_DISPOSITION_TABLE, disposition)
  ) {
    return GROWTH_SETTLEMENT_DISPOSITION_TABLE[disposition];
  }
  return UNRECOGNIZED_GROWTH_SETTLEMENT_POLICY;
}

function buildGrowthSettlementResult(phase, reconcileOutcome, committed, disposition) {
  return Object.freeze({phase, reconcileOutcome, committed, disposition});
}

async function runGrowthSettlementReleasingPhase(owner, operation, outcome) {
  let releasingPhase = GROWTH_SETTLEMENT_PHASE.RELEASING;
  if (outcome?.obligationsReleased !== true) {
    await dischargeGrowthPromoteLiveObligations(owner, operation);
  }
  releasingPhase = GROWTH_SETTLEMENT_PHASE.SETTLED;
  return releasingPhase;
}

async function settleGrowthPromoteCompletion(owner, operation, options = {}) {
  if (!canEnterGrowthSettlementPersistence(owner, operation, options)) {
    return buildGrowthSettlementResult(
      GROWTH_SETTLEMENT_PHASE.RECONCILING,
      OPERATION_RECONCILE_OUTCOME.WAITING,
      false,
      null,
    );
  }
  const completionOutcome = await owner.completeOperation(operation);
  const disposition = readLowerStateField(completionOutcome?.disposition);
  const committed =
    completionOutcome?.committed === true &&
    disposition !== REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY &&
    disposition !== REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED;
  const policy = resolveGrowthSettlementDispositionPolicy(disposition, completionOutcome);
  const settledPhase = policy.isDurableTerminal(owner, operation, completionOutcome) ?
    await runGrowthSettlementReleasingPhase(owner, operation, completionOutcome) :
    GROWTH_SETTLEMENT_PHASE.PERSISTING;
  const reconcileOutcome = policy.resolveOutcome(owner, operation, completionOutcome);
  return buildGrowthSettlementResult(settledPhase, reconcileOutcome, committed, disposition);
}

async function completeAndBuildGrowthPromoteResult(owner, operation, options = {}) {
  const settlement = await settleGrowthPromoteCompletion(owner, operation, options);
  if (settlement.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.COMPLETED) {
    return owner.buildSuccessfulOperationResult(operation.operationId, {
      status: ReplicaOperationResponseStatus.COMPLETED,
      settlementPhase: settlement.phase,
      reconcileOutcome: settlement.reconcileOutcome,
      disposition: settlement.disposition,
    });
  }
  if (settlement.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.FAILED) {
    return owner.buildSkippedOperationResult(
      settlement.reconcileOutcome,
      operation.operationId,
      {
        status: ReplicaOperationResponseStatus.FAILED,
        workflowStep: readUpperStateField(operation?.workflowStep, WORKFLOW_STEP.FAILED),
        error: operation?.errorMessage || null,
        settlementPhase: settlement.phase,
        reconcileOutcome: settlement.reconcileOutcome,
        disposition: settlement.disposition,
      },
    );
  }
  if (settlement.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.WAITING) {
    owner.scheduleObservedProgressRetry?.(
      operation.operationId,
      SYSTEM_TABLE_NAME.SERVICES,
      OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
    );
  }
  return owner.buildSkippedOperationResult(
    settlement.reconcileOutcome,
    operation.operationId,
    {
      status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS,
      settlementPhase: settlement.phase,
      reconcileOutcome: settlement.reconcileOutcome,
      disposition: settlement.disposition,
    },
  );
}

function resolveOwnerSystemTableCache(owner) {
  if (owner?.systemTableCache) return owner.systemTableCache;
  if (owner?.repository?.systemTableCache) return owner.repository.systemTableCache;
  return null;
}

function listPartitionServiceRows(cache, partitionId) {
  if (!cache?.getAll || !partitionId) return [];
  const all = cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
  return all.filter((row) => row?.partition_id === partitionId);
}

function matchesLeaderReplicaIdentity(row, leaderReplicaId) {
  const target = String(leaderReplicaId || '');
  if (!target) return false;
  const replicaId = String(row?.replica_id || row?.service_id || '');
  if (!replicaId) return false;
  return replicaId === target || String(deriveRaftRsPeerId(replicaId)) === target;
}

function readNodeIdFromRow(row) {
  const nodeId = row?.node_id || '';
  return typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : '';
}

function readLeaderNodeIdFromResponse(response) {
  const directNodeId = response?.leaderNodeId;
  if (typeof directNodeId === 'string' && directNodeId.length > 0) return directNodeId;
  const proposalNodeId = response?.[ReplicaOperationField.PROPOSAL]?.leaderNodeId;
  return typeof proposalNodeId === 'string' && proposalNodeId.length > 0 ?
    proposalNodeId :
    '';
}

function readLeaderReplicaIdFromResponse(response) {
  const directReplicaId = response?.leaderId;
  if (typeof directReplicaId === 'string' && directReplicaId.length > 0) {
    return directReplicaId;
  }
  const proposalReplicaId = response?.[ReplicaOperationField.PROPOSAL]?.leaderId;
  return typeof proposalReplicaId === 'string' && proposalReplicaId.length > 0 ?
    proposalReplicaId :
    '';
}

function resolveLeaderNodeFromResponse(cache, partitionId, response) {
  const directNodeId = readLeaderNodeIdFromResponse(response);
  if (directNodeId.length > 0) return directNodeId;
  const leaderReplicaId = readLeaderReplicaIdFromResponse(response);
  if (!leaderReplicaId) return '';
  const rows = listPartitionServiceRows(cache, partitionId);
  const matchingRow = rows.find((row) =>
    matchesLeaderReplicaIdentity(row, leaderReplicaId),
  );
  return readNodeIdFromRow(matchingRow);
}

function resolveLeaderNodeFromCache(cache, partitionId, excludedNodeIds) {
  const rows = listPartitionServiceRows(cache, partitionId);
  const activeLeaderRow = rows.find((row) => {
    if (readLowerStateField(row?.status) !== ReplicaStatus.ACTIVE) return false;
    const role = readLowerStateField(row?.raft_role);
    const nodeId = readNodeIdFromRow(row);
    return (
      role === LOCAL_STR_LEADER && nodeId.length > 0 && !excludedNodeIds.has(nodeId)
    );
  });
  const activeLeaderNodeId = readNodeIdFromRow(activeLeaderRow);
  if (activeLeaderNodeId.length > 0) return activeLeaderNodeId;
  const partitionRow = cache?.get ?
    cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) :
    null;
  const partitionLeaderNodeId = partitionRow?.leader_node_id || '';
  if (
    typeof partitionLeaderNodeId === 'string' &&
    partitionLeaderNodeId.length > 0 &&
    !excludedNodeIds.has(partitionLeaderNodeId)
  ) {
    return partitionLeaderNodeId;
  }
  const alternateVoterRow = rows.find((row) => {
    if (readLowerStateField(row?.status) !== ReplicaStatus.ACTIVE) return false;
    const role = readLowerStateField(row?.raft_role);
    const nodeId = readNodeIdFromRow(row);
    return isVoterRaftRole(role) && nodeId.length > 0 && !excludedNodeIds.has(nodeId);
  });
  return readNodeIdFromRow(alternateVoterRow);
}

function readCurrentGrowthPromoteAdministrationRoute(operation) {
  const explicitRoute = operation?.administrationRouteNodeId;
  if (typeof explicitRoute === 'string' && explicitRoute.length > 0) return explicitRoute;
  const targetNodeId = operation?.targetNodeId;
  return typeof targetNodeId === 'string' && targetNodeId.length > 0 ? targetNodeId : '';
}

function recordGrowthPromoteAdministrationRoute(operation, routeNodeId) {
  operation.administrationRouteNodeId = routeNodeId;
  operation.targetNodeId = routeNodeId;
  return routeNodeId;
}

function redirectGrowthPromoteTargetNode(owner, operation, response = null) {
  if (!operation || operation.type !== OperationType.GROWTH_PROMOTE) return '';
  const currentTarget = readCurrentGrowthPromoteAdministrationRoute(operation);
  if (currentTarget.length > 0) operation.administrationRouteNodeId = currentTarget;
  const cache = resolveOwnerSystemTableCache(owner);
  const proposal = response?.[ReplicaOperationField.PROPOSAL] || null;
  const normalizedReason = readLowerStateField(proposal?.reason);
  const isNotLeaderRefusal = NOT_LEADER_REASONS.has(normalizedReason);
  const fromResponse = resolveLeaderNodeFromResponse(
    cache,
    operation.partitionId,
    response,
  );
  if (fromResponse.length > 0 && fromResponse !== currentTarget) {
    return recordGrowthPromoteAdministrationRoute(operation, fromResponse);
  }
  if (!isNotLeaderRefusal) return currentTarget;
  if (!Array.isArray(operation.refusedLeaderNodeIds)) {
    operation.refusedLeaderNodeIds = [];
  }
  if (
    currentTarget.length > 0 &&
    !operation.refusedLeaderNodeIds.includes(currentTarget)
  ) {
    operation.refusedLeaderNodeIds.push(currentTarget);
  }
  let nextTarget = resolveLeaderNodeFromCache(
    cache,
    operation.partitionId,
    new Set(operation.refusedLeaderNodeIds),
  );
  if (nextTarget.length === 0 && currentTarget.length > 0) {
    operation.refusedLeaderNodeIds = [currentTarget];
    nextTarget = resolveLeaderNodeFromCache(
      cache,
      operation.partitionId,
      new Set([currentTarget]),
    );
  }
  return nextTarget.length > 0 ?
    recordGrowthPromoteAdministrationRoute(operation, nextTarget) :
    currentTarget;
}

function resolveGrowthPromoteTargetNodeId(owner, operation) {
  if (!operation) return '';
  if (operation.type !== OperationType.GROWTH_PROMOTE) {
    return typeof operation.targetNodeId === 'string' ? operation.targetNodeId : '';
  }
  const currentTarget = readCurrentGrowthPromoteAdministrationRoute(operation);
  if (currentTarget.length > 0) {
    return recordGrowthPromoteAdministrationRoute(operation, currentTarget);
  }
  const cache = resolveOwnerSystemTableCache(owner);
  const resolved = resolveLeaderNodeFromCache(cache, operation.partitionId, new Set());
  return resolved.length > 0 ?
    recordGrowthPromoteAdministrationRoute(operation, resolved) :
    currentTarget;
}

function replicaListIncludesExpectedIds(candidateList, expectedIds) {
  if (!Array.isArray(candidateList)) return true;
  if (expectedIds.length === 0) return candidateList.length > 0;
  const normalizedCandidates = new Set();
  for (const item of candidateList) {
    const raw = String(item || '');
    if (raw.length > 0) {
      normalizedCandidates.add(raw);
      normalizedCandidates.add(String(deriveRaftRsPeerId(raw)));
    }
  }
  return expectedIds.every(
    (expectedId) =>
      normalizedCandidates.has(expectedId) ||
      normalizedCandidates.has(String(deriveRaftRsPeerId(expectedId))),
  );
}

function hasValidGrowthPromoteCompletionProvenance(operation, response) {
  if (!operation || !response || typeof response !== 'object') return false;
  const proposal = response[ReplicaOperationField.PROPOSAL];
  const expectedPartitionId = String(operation.partitionId || '');
  const responsePartitionId = String(response.partitionId || '');
  if (
    responsePartitionId.length > 0 &&
    expectedPartitionId.length > 0 &&
    responsePartitionId !== expectedPartitionId
  ) {
    return false;
  }
  const proposalPartitionId = String(proposal?.partitionId || '');
  if (
    proposalPartitionId.length > 0 &&
    expectedPartitionId.length > 0 &&
    proposalPartitionId !== expectedPartitionId
  ) {
    return false;
  }
  const expectedReplicaIds = resolveGrowthPromoteReplicaIds(operation);
  const presentCandidateLists = [
    response[ReplicaOperationField.PROMOTE_REPLICA_IDS],
    response.promotedReplicaIds,
    response.promotedPeerIds,
    response.voterReplicaIds,
    proposal?.[ReplicaOperationField.PROMOTE_REPLICA_IDS],
    proposal?.promotedReplicaIds,
    proposal?.promotedPeerIds,
    proposal?.voterReplicaIds,
  ].filter(Array.isArray);
  if (expectedReplicaIds.length > 0 && presentCandidateLists.length === 0) {
    return false;
  }
  return presentCandidateLists.every((candidateList) =>
    replicaListIncludesExpectedIds(candidateList, expectedReplicaIds),
  );
}

async function reconcileGrowthPromoteDispatchResponse(owner, operation, response) {
  const proposal = response?.[ReplicaOperationField.PROPOSAL] || null;
  if (response?.committedVotersReached === true) {
    return hasValidGrowthPromoteCompletionProvenance(operation, response) ?
      completeAndBuildGrowthPromoteResult(owner, operation, {response}) :
      deferGrowthPromoteToSyncing(owner, operation);
  }
  if (proposal && typeof proposal === 'object') {
    const normalizedOutcome = readLowerStateField(proposal.outcome).toUpperCase();
    const normalizedReason = readLowerStateField(proposal.reason);
    if (normalizedOutcome === LOCAL_STR_CORE_OK) {
      return deferGrowthPromoteToSyncing(owner, operation);
    }
    if (
      proposal.retryable === true ||
      GROWTH_PROMOTE_RETRYABLE_REASONS.has(normalizedReason)
    ) {
      redirectGrowthPromoteTargetNode(owner, operation, response);
      return deferGrowthPromoteToSyncing(owner, operation);
    }
    const refusalReason = proposal.reason || LOCAL_STR_GROWTH_PROMOTE_REFUSED;
    await owner.failOperation(operation, refusalReason);
    return owner.buildFailedOperationResult(operation.operationId, refusalReason);
  }
  if (
    response?.status === ReplicaOperationResponseStatus.INITIATED ||
    response?.status === ReplicaOperationResponseStatus.IN_PROGRESS ||
    response?.status === ReplicaOperationResponseStatus.COMPLETED
  ) {
    return deferGrowthPromoteToSyncing(owner, operation);
  }
  return null;
}

function isNormalizedGrowthPromoteCompleted(operation) {
  const completedAt = operation?.completedAt;
  return (
    readLowerStateField(operation?.workflowStep) ===
      readLowerStateField(WORKFLOW_STEP.ACTIVE) &&
    readLowerStateField(operation?.status) === ReplicaStatus.ACTIVE &&
    completedAt !== null &&
    completedAt !== undefined &&
    Number.isFinite(Number(completedAt))
  );
}

function isCachedRowGrowthPromoteCompleted(row) {
  const completedAt = row?.completed_at;
  return (
    readLowerStateField(row?.workflow_step) ===
      readLowerStateField(WORKFLOW_STEP.ACTIVE) &&
    readLowerStateField(row?.status) === ReplicaStatus.ACTIVE &&
    completedAt !== null &&
    completedAt !== undefined &&
    Number.isFinite(Number(completedAt))
  );
}

function observeGrowthPromoteIncompleteState(owner, operation) {
  if (!operation || operation.type !== OperationType.GROWTH_PROMOTE) {
    return GROWTH_PROMOTE_OBSERVED_STATE.UNAPPLICABLE;
  }
  if (isNormalizedGrowthPromoteCompleted(operation)) {
    return GROWTH_PROMOTE_OBSERVED_STATE.COMPLETE_ACTIVE;
  }
  const cache = resolveOwnerSystemTableCache(owner);
  const cachedOperationRow =
    cache?.get && operation.operationId ?
      cache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operation.operationId) :
      null;
  return isCachedRowGrowthPromoteCompleted(cachedOperationRow) ?
    GROWTH_PROMOTE_OBSERVED_STATE.COMPLETE_ACTIVE :
    GROWTH_PROMOTE_OBSERVED_STATE.REPLAY_DISPATCH;
}

async function completeGrowthPromoteOperation(owner, operation) {
  const now = owner.resolveTimeoutCheckNowMs();
  const finalStep = WORKFLOW_STEP.ACTIVE;
  if (isGrowthPromoteOperationTerminal(owner, operation)) {
    const disposition = isNormalizedGrowthPromoteCompleted(operation) ?
      REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY :
      REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED;
    await dischargeGrowthPromoteLiveObligations(owner, operation);
    return Object.freeze({committed: false, disposition, obligationsReleased: true});
  }
  const previousStep = operation.workflowStep;
  const stepEntry = owner.buildOperationTransitionStepEntry(
    operation,
    finalStep,
    OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
    previousStep,
    now,
  );
  const projectedOperation = {
    ...operation,
    workflowStep: finalStep,
    status: ReplicaStatus.ACTIVE,
    updatedAt: now,
    completedAt: now,
    stepsHistory: [
      ...(Array.isArray(operation.stepsHistory) ? operation.stepsHistory : []),
      stepEntry,
    ],
  };
  const projectIdempotentTransition = () => {
    operation.workflowStep = finalStep;
    operation.status = ReplicaStatus.ACTIVE;
    const prevUpd = Number(operation.updatedAt);
    operation.updatedAt = Number.isFinite(prevUpd) ? Math.max(prevUpd, now) : now;
    const prevDone = Number(operation.completedAt);
    operation.completedAt = Number.isFinite(prevDone) ? Math.max(prevDone, now) : now;
  };
  const persistOptions = {
    ...owner.buildOperationTransitionPersistOptions(),
    terminalTransition: true,
    returnDisposition: true,
  };
  const persistFn = async () => {
    const rawResult = await owner.repository.persistOperationUpdate(
      projectedOperation,
      persistOptions,
    );
    if (
      rawResult &&
      typeof rawResult === 'object' &&
      readLowerStateField(rawResult.disposition) ===
        REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED
    ) {
      return {...rawResult, persisted: false};
    }
    return rawResult;
  };
  const transitionOutcome = await owner.executeAtomicTransition(
    operation,
    finalStep,
    OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
    persistFn,
    {
      onIdempotentTransition: projectIdempotentTransition,
      afterCommit: async () => {
        await owner.confirmCommittedTransitionPersistence(projectedOperation, {
          terminalTransitionRepair: true,
        });
      },
    },
  );
  const outcomeDisposition = readLowerStateField(transitionOutcome?.disposition);
  if (!transitionOutcome?.committed) {
    if (
      outcomeDisposition === REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED
    ) {
      await owner.resolveNotCommittedTerminalTransition(
        operation,
        projectedOperation,
        transitionOutcome,
        finalStep,
        persistOptions,
      );
      await owner.releasePlacementHoldIfNeeded(operation);
      return Object.freeze({
        committed: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
        obligationsReleased: true,
      });
    }
    if (
      outcomeDisposition === REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY ||
      isNormalizedGrowthPromoteCompleted(operation)
    ) {
      if (!isNormalizedGrowthPromoteCompleted(operation)) projectIdempotentTransition();
      await dischargeGrowthPromoteLiveObligations(owner, operation);
      return Object.freeze({
        committed: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
        obligationsReleased: true,
      });
    }
    await owner.resolveNotCommittedTerminalTransition(
      operation,
      projectedOperation,
      transitionOutcome,
      finalStep,
      persistOptions,
    );
    return transitionOutcome;
  }
  const isIdempotentCommit =
    outcomeDisposition === REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY;
  operation.workflowStep = finalStep;
  operation.status = ReplicaStatus.ACTIVE;
  operation.updatedAt = now;
  operation.completedAt = operation.completedAt ?? now;
  operation.stepsHistory.push(stepEntry);
  await dischargeGrowthPromoteLiveObligations(owner, operation);
  if (!isIdempotentCommit) {
    owner.stats.operationsCompleted++;
    owner.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });
    owner.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {operation});
  }
  return Object.freeze({
    committed: !isIdempotentCommit,
    disposition: transitionOutcome?.disposition ?? null,
    obligationsReleased: true,
  });
}

async function reconcileGrowthPromoteLifecycle(owner, operation) {
  if (isHeldGrowthPromoteOperation(operation)) {
    return OPERATION_RECONCILE_OUTCOME.HELD;
  }
  if (owner.repository.isOperationTerminal(operation)) {
    await dischargeGrowthPromoteLiveObligations(owner, operation);
    return isNormalizedGrowthPromoteCompleted(operation) ?
      OPERATION_RECONCILE_OUTCOME.COMPLETED :
      OPERATION_RECONCILE_OUTCOME.FAILED;
  }
  const previousStep = operation.workflowStep;
  const replayResult = await owner.executeOperationFromReconcilePath(operation);
  if (
    replayResult?.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.REFUSED ||
    replayResult?.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.WAITING ||
    replayResult?.reconcileOutcome === OPERATION_RECONCILE_OUTCOME.FAILED
  ) {
    return replayResult.reconcileOutcome;
  }
  if (owner.repository.isOperationTerminal(operation)) {
    return isNormalizedGrowthPromoteCompleted(operation) ?
      OPERATION_RECONCILE_OUTCOME.COMPLETED :
      OPERATION_RECONCILE_OUTCOME.FAILED;
  }
  if (replayResult?.status === ReplicaOperationResponseStatus.COMPLETED) {
    return OPERATION_RECONCILE_OUTCOME.COMPLETED;
  }
  if (operation.workflowStep !== previousStep) {
    return OPERATION_RECONCILE_OUTCOME.ADVANCED;
  }
  return OPERATION_RECONCILE_OUTCOME.WAITING;
}

export {
  GROWTH_SETTLEMENT_PHASE,
  OPERATION_RECONCILE_OUTCOME,
  applyGrowthPromoteRequestFields,
  completeGrowthPromoteOperation,
  didOperationReconcileAdvanceOrComplete,
  hasValidGrowthPromoteCompletionProvenance,
  isHeldGrowthPromoteOperation,
  observeGrowthPromoteIncompleteState,
  reconcileGrowthPromoteDispatchResponse,
  reconcileGrowthPromoteLifecycle,
  redirectGrowthPromoteTargetNode,
  resolveGrowthPromoteReplicaIds,
  resolveGrowthPromoteTargetNodeId,
  settleGrowthPromoteCompletion,
};
