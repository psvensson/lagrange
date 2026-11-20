/**
 * OperationWorkflowOwner helpers for durable GROWTH_PROMOTE operations
 * (1-voter founding + odd-voter growth via joint learner promotion).
 *
 * @module rebalancer/operation-workflow-growth-promote
 */

import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from './operation-workflow-owner-shared.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED,
} from './operation-workflow-recovery-reconcile-shared.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';

const {
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaStatus,
  WORKFLOW_STEP,
} = SHARED;

const {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
  SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const GROWTH_PROMOTE_RETRYABLE_REASONS = Object.freeze(
  new Set([
    'promotion_progress_behind',
    'conf_change_pending',
    'leader_term_unapplied',
    'not_leader',
    'membership-change-not-leader',
    'authority_unavailable',
    'base_configuration_changed',
  ]),
);

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
  ADVANCED: 'advanced',
  WAITING: 'waiting',
  HELD: 'held',
  REFUSED: 'refused',
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

async function completeAndBuildGrowthPromoteResult(owner, operation) {
  await owner.completeOperation(operation);
  return owner.buildSuccessfulOperationResult(operation.operationId, {
    status: ReplicaOperationResponseStatus.COMPLETED,
  });
}

function resolveOwnerSystemTableCache(owner) {
  if (owner?.systemTableCache) {
    return owner.systemTableCache;
  }
  if (owner?.repository?.systemTableCache) {
    return owner.repository.systemTableCache;
  }
  return null;
}

function listPartitionServiceRows(cache, partitionId) {
  if (!cache?.getAll || !partitionId) {
    return [];
  }
  const all = cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
  return all.filter((row) => row?.partition_id === partitionId);
}

function matchesLeaderReplicaIdentity(row, leaderReplicaId) {
  const target = String(leaderReplicaId || '');
  if (!target) {
    return false;
  }
  const replicaId = String(row?.replica_id || row?.service_id || '');
  if (!replicaId) {
    return false;
  }
  return (
    replicaId === target ||
    String(deriveRaftRsPeerId(replicaId)) === target
  );
}

function readNodeIdFromRow(row) {
  const nodeId = row?.node_id || '';
  return typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : '';
}

function readLeaderNodeIdFromResponse(response) {
  const directNodeId = response?.leaderNodeId;
  if (typeof directNodeId === 'string' && directNodeId.length > 0) {
    return directNodeId;
  }
  const proposalNodeId =
    response?.[ReplicaOperationField.PROPOSAL]?.leaderNodeId;
  return typeof proposalNodeId === 'string' && proposalNodeId.length > 0 ?
    proposalNodeId :
    '';
}

function readLeaderReplicaIdFromResponse(response) {
  const directReplicaId = response?.leaderId;
  if (typeof directReplicaId === 'string' && directReplicaId.length > 0) {
    return directReplicaId;
  }
  const proposalReplicaId =
    response?.[ReplicaOperationField.PROPOSAL]?.leaderId;
  return typeof proposalReplicaId === 'string' && proposalReplicaId.length > 0 ?
    proposalReplicaId :
    '';
}

function resolveLeaderNodeFromResponse(cache, partitionId, response) {
  const directNodeId = readLeaderNodeIdFromResponse(response);
  if (directNodeId.length > 0) {
    return directNodeId;
  }
  const leaderReplicaId = readLeaderReplicaIdFromResponse(response);
  if (!leaderReplicaId) {
    return '';
  }
  const rows = listPartitionServiceRows(cache, partitionId);
  const matchingRow = rows.find((row) =>
    matchesLeaderReplicaIdentity(row, leaderReplicaId),
  );
  return readNodeIdFromRow(matchingRow);
}

function resolveLeaderNodeFromCache(cache, partitionId, excludedNodeIds) {
  const rows = listPartitionServiceRows(cache, partitionId);
  const activeLeaderRow = rows.find((row) => {
    if (readLowerStateField(row?.status) !== ReplicaStatus.ACTIVE) {
      return false;
    }
    const role = readLowerStateField(row?.raft_role);
    const nodeId = readNodeIdFromRow(row);
    return (
      role === LOCAL_STR_LEADER &&
      nodeId.length > 0 &&
      !excludedNodeIds.has(nodeId)
    );
  });
  const activeLeaderNodeId = readNodeIdFromRow(activeLeaderRow);
  if (activeLeaderNodeId.length > 0) {
    return activeLeaderNodeId;
  }
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
    if (readLowerStateField(row?.status) !== ReplicaStatus.ACTIVE) {
      return false;
    }
    const role = readLowerStateField(row?.raft_role);
    const nodeId = readNodeIdFromRow(row);
    return (
      isVoterRaftRole(role) &&
      nodeId.length > 0 &&
      !excludedNodeIds.has(nodeId)
    );
  });
  return readNodeIdFromRow(alternateVoterRow);
}

function readCurrentGrowthPromoteAdministrationRoute(operation) {
  const explicitRoute = operation?.administrationRouteNodeId;
  if (typeof explicitRoute === 'string' && explicitRoute.length > 0) {
    return explicitRoute;
  }
  const targetNodeId = operation?.targetNodeId;
  return typeof targetNodeId === 'string' && targetNodeId.length > 0 ?
    targetNodeId :
    '';
}

function recordGrowthPromoteAdministrationRoute(operation, routeNodeId) {
  operation.administrationRouteNodeId = routeNodeId;
  operation.targetNodeId = routeNodeId;
  return routeNodeId;
}

function redirectGrowthPromoteTargetNode(owner, operation, response = null) {
  if (!operation || operation.type !== OperationType.GROWTH_PROMOTE) {
    return '';
  }
  const currentTarget = readCurrentGrowthPromoteAdministrationRoute(operation);
  if (currentTarget.length > 0) {
    operation.administrationRouteNodeId = currentTarget;
  }
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
  if (!isNotLeaderRefusal) {
    return currentTarget;
  }
  if (!Array.isArray(operation.refusedLeaderNodeIds)) {
    operation.refusedLeaderNodeIds = [];
  }
  if (
    currentTarget.length > 0 &&
    !operation.refusedLeaderNodeIds.includes(currentTarget)
  ) {
    operation.refusedLeaderNodeIds.push(currentTarget);
  }
  const excluded = new Set(operation.refusedLeaderNodeIds);
  let nextTarget = resolveLeaderNodeFromCache(
    cache,
    operation.partitionId,
    excluded,
  );
  if (nextTarget.length === 0 && currentTarget.length > 0) {
    operation.refusedLeaderNodeIds = [currentTarget];
    nextTarget = resolveLeaderNodeFromCache(
      cache,
      operation.partitionId,
      new Set([currentTarget]),
    );
  }
  if (nextTarget.length > 0) {
    return recordGrowthPromoteAdministrationRoute(operation, nextTarget);
  }
  return currentTarget;
}

function resolveGrowthPromoteTargetNodeId(owner, operation) {
  if (!operation) {
    return '';
  }
  if (operation.type !== OperationType.GROWTH_PROMOTE) {
    return typeof operation.targetNodeId === 'string' ?
      operation.targetNodeId :
      '';
  }
  const currentTarget = readCurrentGrowthPromoteAdministrationRoute(operation);
  if (currentTarget.length > 0) {
    return recordGrowthPromoteAdministrationRoute(operation, currentTarget);
  }
  const cache = resolveOwnerSystemTableCache(owner);
  const resolved = resolveLeaderNodeFromCache(
    cache,
    operation.partitionId,
    new Set(),
  );
  if (resolved.length > 0) {
    return recordGrowthPromoteAdministrationRoute(operation, resolved);
  }
  return currentTarget;
}

function replicaListIncludesExpectedIds(candidateList, expectedIds) {
  if (!Array.isArray(candidateList)) {
    return true;
  }
  if (expectedIds.length === 0) {
    return candidateList.length > 0;
  }
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
  if (!operation || !response || typeof response !== 'object') {
    return false;
  }
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
  const candidateLists = [
    response[ReplicaOperationField.PROMOTE_REPLICA_IDS],
    response.promotedReplicaIds,
    response.promotedPeerIds,
    response.voterReplicaIds,
    proposal?.[ReplicaOperationField.PROMOTE_REPLICA_IDS],
    proposal?.promotedReplicaIds,
    proposal?.promotedPeerIds,
    proposal?.voterReplicaIds,
  ];
  const presentCandidateLists = candidateLists.filter(Array.isArray);
  if (expectedReplicaIds.length > 0 && presentCandidateLists.length === 0) {
    return false;
  }
  return presentCandidateLists.every((candidateList) =>
    replicaListIncludesExpectedIds(candidateList, expectedReplicaIds),
  );
}

async function reconcileGrowthPromoteDispatchResponse(
  owner,
  operation,
  response,
) {
  const proposal = response?.[ReplicaOperationField.PROPOSAL] || null;
  if (response?.committedVotersReached === true) {
    if (!hasValidGrowthPromoteCompletionProvenance(operation, response)) {
      return deferGrowthPromoteToSyncing(owner, operation);
    }
    return completeAndBuildGrowthPromoteResult(owner, operation);
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
  if (isCachedRowGrowthPromoteCompleted(cachedOperationRow)) {
    return GROWTH_PROMOTE_OBSERVED_STATE.COMPLETE_ACTIVE;
  }
  return GROWTH_PROMOTE_OBSERVED_STATE.REPLAY_DISPATCH;
}

async function completeGrowthPromoteOperation(owner, operation) {
  const now = owner.resolveTimeoutCheckNowMs();
  const finalStep = WORKFLOW_STEP.ACTIVE;
  if (
    operation.workflowStep === finalStep &&
    operation.completedAt !== null &&
    operation.completedAt !== undefined
  ) {
    await owner.releasePlacementHoldIfNeeded(operation);
    return Object.freeze({
      committed: false,
      disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
    });
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
    const previousUpdatedAt = Number(operation.updatedAt);
    operation.updatedAt = Number.isFinite(previousUpdatedAt) ?
      Math.max(previousUpdatedAt, now) :
      now;
    const previousCompletedAt = Number(operation.completedAt);
    operation.completedAt = Number.isFinite(previousCompletedAt) ?
      Math.max(previousCompletedAt, now) :
      now;
  };
  const persistOptions = {
    ...owner.buildOperationTransitionPersistOptions(),
    terminalTransition: true,
    returnDisposition: true,
  };
  const persistFn = async () =>
    owner.repository.persistOperationUpdate(projectedOperation, persistOptions);
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
  if (!transitionOutcome?.committed) {
    await owner.resolveNotCommittedTerminalTransition(
      operation,
      projectedOperation,
      transitionOutcome,
      finalStep,
      persistOptions,
    );
    return transitionOutcome;
  }
  owner.clearTerminalOperationRetryState(operation);
  owner.clearTransitionRetry(operation.operationId);
  operation.workflowStep = finalStep;
  operation.status = ReplicaStatus.ACTIVE;
  operation.updatedAt = now;
  operation.completedAt = now;
  operation.stepsHistory.push(stepEntry);
  await owner.releasePlacementHoldIfNeeded(operation);
  await owner.releaseReservationForOperation(operation);
  owner.clearDeferredSafetyBlockState(operation.operationId);
  owner.stats.operationsCompleted++;
  owner.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
    operationId: operation.operationId,
    type: operation.type,
    partitionId: operation.partitionId,
    targetNodeId: operation.targetNodeId,
  });
  owner.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
    operation,
  });
  return transitionOutcome;
}

async function reconcileGrowthPromoteLifecycle(owner, operation) {
  if (isHeldGrowthPromoteOperation(operation)) {
    return OPERATION_RECONCILE_OUTCOME.HELD;
  }
  if (owner.repository.isOperationTerminal(operation)) {
    return OPERATION_RECONCILE_OUTCOME.WAITING;
  }
  const previousStep = operation.workflowStep;
  const replayResult = await owner.executeOperationFromReconcilePath(operation);
  if (
    owner.repository.isOperationTerminal(operation) ||
    replayResult?.status === ReplicaOperationResponseStatus.COMPLETED
  ) {
    return OPERATION_RECONCILE_OUTCOME.COMPLETED;
  }
  if (operation.workflowStep !== previousStep) {
    return OPERATION_RECONCILE_OUTCOME.ADVANCED;
  }
  return OPERATION_RECONCILE_OUTCOME.WAITING;
}

export {
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
};
