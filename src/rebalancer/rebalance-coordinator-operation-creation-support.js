import {
  bindPlacementAttemptAnswer, canReplaceSettledPlacementAttempt,
  foundingRefusalWaitsForCommit, retainFoundingRefusal,
  isPlacementAttemptIdentitySettled,
} from './placement-admission-attempt.js';
import {
  buildPartitionPlacementMove, resolvePartitionPlacementIntentKey,
  resolveRuntimeServiceIntentKey, requireCreationReplayOutcome,
} from './replica-operation-creation-request.js';
import {deliveryReadingOf} from '../transport/transport-semantic-outcome.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {indexCommittedNodeRows} from '../control-plane/committed-node-rows.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {COLUMN} from '../constants/index.js';
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {
  PLACEMENT_REPAIR_PREPARE_TYPE, PLACEMENT_REPAIR_TYPE, PLACEMENT_ADMISSION_ERROR,
  PLACEMENT_RESULT_FIELD, RETAINED_PLACEMENT_ATTEMPT,
} from '../partition/partition-placement-admission-constants.js';
import {
  requestPlacementRepair, requestPlacementAdmission, routePlacementAdmission,
} from '../partition/partition-placement-admission.js';
import {resolveEntryId} from '../partition/partition-write-kernel.js';
import {
  PLACEMENT_CLASS, PLACEMENT_COPY_CAPACITY, PLACEMENT_FORMATION_GATED_CLASSES,
  PLACEMENT_OUTCOME, PLACEMENT_WAITING_REASON,
} from './replica-placement-owner-constants.js';
import {
  buildPlacementAdmissionStatement, buildRuntimeServiceAdmissionStatement,
  matchesCommittedSinglePlacementStatement,
} from './replica-placement-owner-admission-statement.js';
import {
  COPY_MOVE_TYPES, resolveOwnerMoveCopyLimits,
} from './replica-placement-owner-capacity.js';
import {classifyPlacementClass, formationWaitingReasonOf} from
  './replica-placement-owner-order.js';
import {COLLABORATOR, invalidCollaborator} from './replica-placement-owner-collaborators.js';
import {isBootstrapTopologyDispatchDeferred} from './replica-status.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {resolvePlacementLedgerDelivery, resolvePlacementLedgerRoute} from
  './replica-placement-owner-transport.js';

// ends-on: PLACEMENT_ADMIT response from replica_operations-p1 leader
const DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS = 5000;
const PLACEMENT_ENTRY_PREFIX = 'placement-admit';
const DEFAULT_NODE_ID = 'node-1';
const PLACEMENT_LEDGER_LEADER_UNAVAILABLE_CODE =
  'PLACEMENT_LEDGER_LEADER_UNAVAILABLE';
const PLACEMENT_ADMISSION_REFUSED_CODE = 'PLACEMENT_ADMISSION_REFUSED';
const HOLD_RELEASE_NOT_FOUND_REASON = 'operation_not_found';
const HOLD_RELEASE_COHORT_MISMATCH_REASON = 'topology_cohort_mismatch';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER =
  'Failed to prime coordinator-created operation progress';
const OWNER_PROGRESS_STEP_METHOD = Object.freeze({
  ARM: 'armCoordinatorCreatedOperation',
  DISPATCH_AFTER_CREATE_BUDGET_TURN:
    'dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn',
});

const {
  OPERATION_METADATA_KEY, OperationType, REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON, UNIFIED_SERVICE_TYPE, WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

const MANAGED_PLACEMENT_ENTITY_TYPES = Object.freeze(new Set([
  UNIFIED_SERVICE_TYPE.PARTITION, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
]));

const BOOTSTRAP_TOPOLOGY_STAMP_FIELDS = Object.freeze([
  [ReplicaOperationField.REPLICA_IDS, OPERATION_METADATA_KEY.REPLICA_IDS],
  [ReplicaOperationField.PEER_ADDRESSES, OPERATION_METADATA_KEY.PEER_ADDRESSES],
  [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP],
  [ReplicaOperationField.BOOTSTRAP_TABLE_METADATA, OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA],
  [
    ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
    OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
  ],
]);

function isHeldPendingBootstrapOperation(operation) {
  return Boolean(operation) &&
    operation.workflowStep === WORKFLOW_STEP.PENDING &&
    !Number.isFinite(operation.completedAt) &&
    isBootstrapTopologyDispatchDeferred(operation);
}

function extractStampNodeMap(membership) {
  if (!membership || typeof membership !== 'object') return null;
  if (membership.founderNodeIds && typeof membership.founderNodeIds === 'object') {
    return membership.founderNodeIds;
  }
  return membership.peerNodes && typeof membership.peerNodes === 'object' ?
    membership.peerNodes : null;
}

function isStampNodeMapAligned(durableOperation, existingMap, incomingMap) {
  if (!incomingMap) return true;
  const targetNodes = Object.values(incomingMap);
  if (durableOperation.targetNodeId && !targetNodes.includes(durableOperation.targetNodeId)) {
    return false;
  }
  const mappedNode = incomingMap[durableOperation.replicaId];
  if (mappedNode !== undefined && mappedNode !== durableOperation.targetNodeId) return false;
  return !existingMap || JSON.stringify(existingMap) === JSON.stringify(incomingMap);
}

function isBootstrapTopologyStampCohortAligned(durableOperation, stamp) {
  if (!stamp || typeof stamp !== 'object') return true;
  const [creationEntry] = durableOperation.stepsHistory || [];
  const existingReplicaIds = creationEntry?.[OPERATION_METADATA_KEY.REPLICA_IDS];
  const incomingReplicaIds = stamp[ReplicaOperationField.REPLICA_IDS];
  if (Array.isArray(existingReplicaIds) && Array.isArray(incomingReplicaIds) &&
      JSON.stringify(existingReplicaIds) !== JSON.stringify(incomingReplicaIds)) {
    return false;
  }
  return isStampNodeMapAligned(
    durableOperation,
    extractStampNodeMap(creationEntry?.[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]),
    extractStampNodeMap(stamp[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]),
  );
}

function buildBootstrapTopologyReleasedOperation(durableOperation, stamp, now) {
  const released = structuredClone(durableOperation);
  const [creationEntry] = released.stepsHistory;
  for (const [operationField, metadataKey] of BOOTSTRAP_TOPOLOGY_STAMP_FIELDS) {
    const value = stamp[operationField];
    if (value === null || value === undefined) continue;
    creationEntry[metadataKey] = structuredClone(value);
    released[operationField] = structuredClone(value);
  }
  for (const entry of released.stepsHistory) {
    delete entry[OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED];
  }
  released.updatedAt = now;
  return released;
}

function buildBootstrapTopologyHoldReleaseOutcome(released, operation, reason = null) {
  return Object.freeze({
    released, ...(reason ? {reason} : {}),
    operation: operation ? structuredClone(operation) : null,
  });
}

function isMatchingVoterReplicaRow(row, partitionId, move) {
  return row[COLUMN.REPLICA_ID] === move.replicaId &&
    row[COLUMN.PARTITION_ID] === partitionId &&
    row[COLUMN.NODE_ID] === move.nodeId &&
    isVoterRaftRole(row[COLUMN.RAFT_ROLE]);
}

function readCommittedTargetNodeBootIncarnation(readiness, move) {
  const observation = readiness.answerCommittedNodes();
  if (observation?.state !== SERVE_ELIGIBILITY_STATE.READY) return null;
  const node = indexCommittedNodeRows(observation.nodeRows)?.get(move.nodeId);
  const nodeBootIncarnation = node?.[COLUMN.BOOT_INCARNATION];
  if (!Number.isSafeInteger(nodeBootIncarnation) || nodeBootIncarnation <= 0) return null;
  return move.targetNodeBootIncarnation == null ||
    move.targetNodeBootIncarnation === nodeBootIncarnation ? nodeBootIncarnation : null;
}

async function readPartitionVoterRemovalScope(coordinator, partitionId, move) {
  const readiness = coordinator.controlPlaneReadinessService;
  if (!readiness || !move.replicaId) return null;
  const rows = await coordinator.workflowOwner.getCriticalReplicaRowsForSafety(partitionId);
  if (rows.authoritativeReadAvailable !== true) return null;
  const replica = rows.find((row) => isMatchingVoterReplicaRow(row, partitionId, move));
  const replicaCreatedAt = replica?.[COLUMN.CREATED_AT];
  if (!Number.isSafeInteger(replicaCreatedAt) || replicaCreatedAt <= 0) return null;
  await readiness.readServeEligibility();
  const nodeBootIncarnation = readCommittedTargetNodeBootIncarnation(readiness, move);
  return nodeBootIncarnation === null ? null : {nodeBootIncarnation, replicaCreatedAt};
}

const TRANSIENT_PLACEMENT_ADMISSION_REFUSAL_REASONS = Object.freeze(new Set([
  'HARD_MEMORY_LIMIT_REACHED', 'HARD_STORAGE_LIMIT_REACHED',
  'TARGET_MEMORY_CONSTRAINED', 'TARGET_STORAGE_CONSTRAINED',
  PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN, 'TARGET_STORAGE_FULL',
  'SOURCE_COPY_CAPACITY_REACHED', 'TARGET_COPY_CAPACITY_REACHED',
  'SOURCE_AT_CAPACITY', 'TARGET_AT_CAPACITY', 'COPY_OCCUPANCY_LIMIT_REACHED',
  'CDC_CAPACITY', 'placement_owner_unavailable', PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE,
  'FORMATION_NOT_LATCHED', 'NODES_NOT_READY',
]));

function attachTransientPlacementAdmissionRefusal(error, failureCode, answer, options) {
  if (answer?.[RETAINED_PLACEMENT_ATTEMPT] === true) {
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING;
    return;
  }
  if (!TRANSIENT_PLACEMENT_ADMISSION_REFUSAL_REASONS.has(failureCode)) {
    return;
  }
  const targetNodeId = options?.targetNodeId || null;
  error.rebalanceSkipReason = REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING;
  error.admissionResult = Object.freeze({
    allowed: false, decisionType: failureCode,
    blockingReasons: Object.freeze([failureCode]),
    ineligibleNodes: targetNodeId ? Object.freeze([
      Object.freeze({nodeId: targetNodeId, reasonCodes: Object.freeze([failureCode])}),
    ]) : Object.freeze([]),
  });
}

function throwRuntimeServicePlacementError(entityId, answer, result, options = {}) {
  const failureCode = result?.reason || PLACEMENT_ADMISSION_REFUSED_CODE;
  const error = new Error(`Placement admission refused for ${entityId}: ${failureCode}`);
  error.code = failureCode;
  error.failureCode = failureCode;
  error.reasonCode = failureCode;
  error.entryId = answer?.entryId || null;
  error.placementResult = result || null;
  error.admissionAnswer = answer || null;
  attachTransientPlacementAdmissionRefusal(error, failureCode, answer, options);
  throw error;
}

function isRetainedAttemptForAnswer(retained, answer) {
  return Boolean(retained && retained.entryId === answer.entryId);
}

function isAdmittedMaterializedPlacementMatch(
  coordinator, operation, move, requested, admitted, placementIntent, entryId,
) {
  if (!admitted || admitted.entryId !== entryId || placementIntent?.entryId !== entryId) {
    return false;
  }
  if (admitted.operationIntentId !== (move.operationIntentId ?? null) ||
      admitted.replicaIntentId !== (move.replicaIntentId ?? null)) {
    return false;
  }
  return matchesCommittedSinglePlacementStatement(operation, requested, admitted.statement) &&
    coordinator.operationMatchesCreationRequest(operation, move, placementIntent);
}

function isValidResolvedCopyLimits(copyLimits) {
  return Boolean(copyLimits) &&
    copyLimits.hardAdmissionAllowed !== false &&
    Number.isInteger(copyLimits.kSrc) &&
    Number.isInteger(copyLimits.kTgt);
}

function isSingleOperationPlacementAccepted(answer) {
  const result = answer?.[PLACEMENT_RESULT_FIELD];
  return isPlacementAttemptIdentitySettled(answer) &&
    result?.outcome === PLACEMENT_OUTCOME.ADMITTED &&
    Array.isArray(result.operationIds) &&
    result.operationIds.length === 1 &&
    typeof result.operationIds[0] === 'string' && result.operationIds[0].length > 0;
}

const operationCreationSupportMethods = {
  resolveActiveLocalLedgerLeaderService() {
    if (!(this.ledgerPartitionServices instanceof Set)) return null;
    for (const service of this.ledgerPartitionServices) {
      if (service &&
          service.partitionId === LEDGER_PARTITION_ID &&
          service.isLeader === true &&
          !service.isShutdown) {
        return service;
      }
    }
    return null;
  },

  resolveRemoteLedgerLeader() {
    return resolvePlacementLedgerRoute(this.systemTableCache);
  },

  resolveFormationLatchEpochForPlacement(placementClass, partitionId) {
    if (!PLACEMENT_FORMATION_GATED_CLASSES.has(placementClass)) return null;
    const formation = this.controlPlaneReadinessService
      ?.answerCommittedNodes?.()?.formation;
    if (formation && formationWaitingReasonOf(placementClass, formation) === null &&
        Number.isSafeInteger(formation.latchEpoch)) {
      return formation.latchEpoch;
    }
    const error = new Error(`Placement waits for committed formation: ${partitionId}`);
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING;
    error.failureCode = PLACEMENT_WAITING_REASON.FORMATION_NOT_LATCHED;
    throw error;
  },

  ensureUncertainPlacementAttemptsMap() {
    if (!(this.uncertainPlacementAdmissionAttempts instanceof Map)) {
      this.uncertainPlacementAdmissionAttempts = new Map();
    }
    return this.uncertainPlacementAdmissionAttempts;
  },

  allocatePlacementAdmissionEntryId(explicitEntryId = null) {
    if (explicitEntryId) return explicitEntryId;
    const nodePrefix = this.nodeId || DEFAULT_NODE_ID;
    return `${PLACEMENT_ENTRY_PREFIX}:${nodePrefix}:${resolveEntryId(null)}`;
  },

  resolvePlacementAdmissionEntryId(
    intentKey, explicitEntryId = null, statement = null, requestedMove = null,
  ) {
    const attempts = this.ensureUncertainPlacementAttemptsMap();
    const key = intentKey || explicitEntryId || null;
    if (key && attempts.has(key)) {
      const retained = attempts.get(key);
      return {key, entryId: retained.entryId, statement: retained.statement};
    }
    const entryId = this.allocatePlacementAdmissionEntryId(explicitEntryId);
    if (key) {
      attempts.set(key, {
        entryId, statement,
        ...(requestedMove && {
          operationIntentId: requestedMove.operationIntentId ?? null,
          replicaIntentId: requestedMove.replicaIntentId ?? null,
        }),
      });
    }
    return {key, entryId, statement};
  },

  async submitRetainedPlacementRepair(payload) {
    const localLeader = this.resolveActiveLocalLedgerLeaderService();
    if (localLeader) return requestPlacementRepair(localLeader, payload);
    const delivery = resolvePlacementLedgerDelivery(this);
    if (delivery === null) return null;
    const {owner, transport} = delivery;
    const delivered = await transport.deliver(owner.address,
      {type: PLACEMENT_REPAIR_TYPE, ...payload},
      {timeoutMs: DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS});
    return deliveryReadingOf(delivered);
  },

  async submitPlacementPayload(payload, timeoutMs) {
    const localLeader = this.resolveActiveLocalLedgerLeaderService();
    if (localLeader) return requestPlacementAdmission(localLeader, payload);
    const delivery = resolvePlacementLedgerDelivery(this);
    if (delivery === null) {
      const error = new Error(
        `Cannot route PLACEMENT_ADMIT: ledger leader unreachable (${LEDGER_PARTITION_ID})`,
      );
      error.code = PLACEMENT_LEDGER_LEADER_UNAVAILABLE_CODE;
      throw error;
    }
    const {owner, transport} = delivery;
    return routePlacementAdmission(transport, owner.address, payload, {timeoutMs});
  },

  async resolveRetainedPlacementAttempt(intentKey, timeoutMs) {
    const attempts = this.ensureUncertainPlacementAttemptsMap();
    if (!intentKey || !attempts.has(intentKey)) return null;
    const retained = attempts.get(intentKey);
    if (!retained?.statement) return null;
    const rawAnswer = retained.admittedAnswer || await this.submitPlacementPayload(
      {entryId: retained.entryId, body: retained.statement}, timeoutMs,
    );
    const answer = bindPlacementAttemptAnswer(rawAnswer, retained.entryId, true);
    if (answer[RETAINED_PLACEMENT_ATTEMPT]) return {settled: false, answer};
    if (canReplaceSettledPlacementAttempt(answer, retained.statement)) {
      if (attempts.get(intentKey) === retained) attempts.delete(intentKey);
      return {settled: true, retryWithFreshEntry: true};
    }
    if (foundingRefusalWaitsForCommit(answer, retained.statement)) {
      return {settled: false, answer: retainFoundingRefusal(answer)};
    }
    return {settled: true, retryWithFreshEntry: false, answer};
  },

  async finishPlacementAdmissionAttempt(key, answer, confirmOperation) {
    const attempts = this.ensureUncertainPlacementAttemptsMap();
    if (!isPlacementAttemptIdentitySettled(answer)) return answer;
    const retained = attempts.get(key);
    const matchesRetained = isRetainedAttemptForAnswer(retained, answer);
    if (matchesRetained && foundingRefusalWaitsForCommit(answer, retained.statement)) {
      return retainFoundingRefusal(answer);
    }
    if (!confirmOperation ||
        answer[PLACEMENT_RESULT_FIELD]?.outcome !== PLACEMENT_OUTCOME.ADMITTED) {
      if (matchesRetained) attempts.delete(key);
      return answer;
    }
    if (!isSingleOperationPlacementAccepted(answer)) return answer;
    if (matchesRetained) retained.admittedAnswer = answer;
    const [operationId] = answer[PLACEMENT_RESULT_FIELD].operationIds;
    const operation = await confirmOperation(operationId, retained, answer.entryId);
    if (matchesRetained && attempts.get(key) === retained) attempts.delete(key);
    return {...answer, operation, terminal: requireCreationReplayOutcome(operation)};
  },

  async admitPlacementStatement(options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS;
    const retainedResolution = await this.resolveRetainedPlacementAttempt(
      options.intentKey, timeoutMs,
    );
    if (retainedResolution && !retainedResolution.retryWithFreshEntry) {
      return this.finishPlacementAdmissionAttempt(
        options.intentKey, retainedResolution.answer, options.confirmOperation,
      );
    }
    await options.prepareFreshPlacement?.();
    options.assertFreshCreationAllowed?.();
    const freshStatement = options.buildFreshStatement ?
      options.buildFreshStatement() : options.statement;
    const explicitId = retainedResolution?.retryWithFreshEntry && !options.requestedMove ?
      null : options.entryId;
    const resolved = this.resolvePlacementAdmissionEntryId(
      options.intentKey, explicitId, freshStatement, options.requestedMove,
    );
    const answer = await this.submitPlacementPayload(
      {entryId: resolved.entryId, body: resolved.statement}, timeoutMs,
    );
    const bound = bindPlacementAttemptAnswer(answer, resolved.entryId, Boolean(resolved.key));
    return this.finishPlacementAdmissionAttempt(resolved.key, bound, options.confirmOperation);
  },

  async materializePlacementOperationById(operationId, move, requested, admitted, entryId) {
    const observation = await this.observeExactCreationOperation(operationId);
    const operation = observation.operation;
    if (!operation) {
      throw this.createDeferredOperationVisibilityError(move.type, observation, move);
    }
    const placementIntent = admitted && this.buildPlacementCreationIntent(operation, admitted);
    if (!isAdmittedMaterializedPlacementMatch(
      this, operation, move, requested, admitted, placementIntent, entryId,
    )) {
      return this.refuseConflictingCreation(operation, move);
    }
    return operation;
  },

  async materializePlacementFoundingOperations({operationIds}) {
    if (!Array.isArray(operationIds) || operationIds.length === 0 ||
        !this.repository?.queryAuthoritativeOperationById) {
      return [];
    }
    const operations = [];
    for (let idx = 0; idx < operationIds.length; idx += 1) {
      const operation = await this.repository.queryAuthoritativeOperationById(operationIds[idx]);
      if (!operation) return [];
      requireCreationReplayOutcome(operation);
      operations.push(operation);
    }
    return operations;
  },

  async materializePlacementAdmittedOperations(options = {}) {
    return this.materializePlacementFoundingOperations(options);
  },

  async resolveRuntimeServicePlacementIds(context) {
    const {move, normalizedMoveType, entityType, entityId, partitionId} = context;
    if (normalizedMoveType === OperationType.REMOVE) {
      return {operationReplicaId: move.replicaId || null, sourceReplicaId: null};
    }
    if (normalizedMoveType === OperationType.ADD) {
      const operationReplicaId = move.replicaId || move.replicaIntentId ||
        await this.allocateCanonicalReplicaId({
          partitionId, entityType, entityId, excludeReplicaIds: [],
        });
      return {operationReplicaId, sourceReplicaId: null};
    }
    const sourceReplicaId = move.sourceReplicaId || move.replicaId || null;
    const explicitTarget = move.replicaId && move.replicaId !== sourceReplicaId ?
      move.replicaId : move.replicaIntentId;
    const operationReplicaId = explicitTarget || await this.allocateCanonicalReplicaId({
      partitionId, entityType, entityId,
      excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
    });
    return {operationReplicaId, sourceReplicaId};
  },

  async announcePlacementCreatedOperation(operation, context) {
    if (this.stats) this.stats.operationsCreated = (this.stats.operationsCreated || 0) + 1;
    this.rememberOperationIntents?.(
      [context.dedupeKey, context.criticalAddLikeIntentKey],
      operation, this.buildPlacementCreationIntent(operation, context.requestedMove),
    );
    this.emit?.(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});
    await this.armCoordinatorCreatedOperationProgress(
      operation, context.createdOperationArmContext,
    );
  },

  isPlacementAdmissionManagedEntityType(entityType) {
    return MANAGED_PLACEMENT_ENTITY_TYPES.has(entityType);
  },

  async createOperationViaPlacementAdmission(context) {
    return context.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ?
      this.createRuntimeServiceOperationViaPlacementAdmission(context) :
      this.createPartitionOperationViaPlacementAdmission(context);
  },

  async commitSingleCreatedPlacementOperation(context, statement, intentKey, freshHooks = {}) {
    const {requestedMove, entityId} = context;
    this.assertNativePlacementAliasProof(requestedMove);
    const answer = await this.admitPlacementStatement({
      entryId: requestedMove.entryId ?? null, intentKey, statement, requestedMove,
      assertFreshCreationAllowed: context.assertFreshCreationAllowed,
      prepareFreshPlacement: freshHooks.prepareFreshPlacement,
      buildFreshStatement: freshHooks.buildFreshStatement,
      confirmOperation: (operationId, admitted, entryId) =>
        this.materializePlacementOperationById(
          operationId, requestedMove, admitted?.statement || statement, admitted, entryId,
        ),
    });
    if (!isSingleOperationPlacementAccepted(answer)) {
      throwRuntimeServicePlacementError(
        entityId, answer, answer?.[PLACEMENT_RESULT_FIELD],
        {targetNodeId: requestedMove?.nodeId || requestedMove?.targetNodeId || null},
      );
    }
    if (!answer.terminal) await this.announcePlacementCreatedOperation(answer.operation, context);
    return answer.operation;
  },

  resolveActiveReplicaPlacementOwner() {
    const localLeader = this.resolveActiveLocalLedgerLeaderService();
    if (localLeader?.rebalancerLeadershipSink?.isLeader === true) {
      return localLeader.rebalancerLeadershipSink;
    }
    if (this.replicaPlacementOwner?.isLeader === true) return this.replicaPlacementOwner;
    return null;
  },

  async requestRemoteMoveCopyLimits(placementMove, partitionId) {
    const delivery = resolvePlacementLedgerDelivery(this);
    if (delivery === null) {
      const error = new Error(
        `Cannot route PLACEMENT_ADMIT: ledger leader unreachable (${LEDGER_PARTITION_ID})`,
      );
      error.code = PLACEMENT_LEDGER_LEADER_UNAVAILABLE_CODE;
      throw error;
    }
    const delivered = await delivery.transport.deliver(
      delivery.owner.address,
      {type: PLACEMENT_REPAIR_PREPARE_TYPE, move: placementMove},
      {timeoutMs: DEFAULT_PLACEMENT_ADMISSION_TIMEOUT_MS},
    );
    const prepared = deliveryReadingOf(delivered);
    if (!prepared?.copyLimits) {
      const codeA = typeof prepared?.failureCode === 'string' ? prepared.failureCode : '';
      const codeB = typeof prepared?.reason === 'string' ? prepared.reason : '';
      const errorText = codeA.length > 0 ?
        codeA :
        (codeB.length > 0 ? codeB : PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE);
      throwRuntimeServicePlacementError(
        partitionId, prepared,
        {reason: errorText},
        {targetNodeId: placementMove.targetNodeId},
      );
    }
    return prepared.copyLimits;
  },

  async resolveAdaptiveCopyLimitsForMove(placementMove, partitionId) {
    if (!placementMove || !COPY_MOVE_TYPES.has(placementMove.type)) {
      return Object.freeze({
        kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
        hardAdmissionAllowed: true, reason: null,
      });
    }
    const nowMs = this.timeSource ? this.timeSource.now() : Date.now();
    const activeLocalOwner = this.resolveActiveReplicaPlacementOwner();
    const copyLimits = activeLocalOwner !== null ?
      resolveOwnerMoveCopyLimits(activeLocalOwner, placementMove, nowMs) :
      await this.requestRemoteMoveCopyLimits(placementMove, partitionId);
    if (!isValidResolvedCopyLimits(copyLimits)) {
      const reason = typeof copyLimits?.reason === 'string' && copyLimits.reason.length > 0 ?
        copyLimits.reason :
        PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE;
      throwRuntimeServicePlacementError(
        partitionId, null,
        {reason},
        {targetNodeId: placementMove.targetNodeId},
      );
    }
    return copyLimits;
  },

  async createPartitionOperationViaPlacementAdmission(context) {
    const {requestedMove: move, normalizedMoveType, partitionId} = context;
    const requestsPhysicalReplica =
      (normalizedMoveType === OperationType.ADD && move.replicaId) ||
      (normalizedMoveType === OperationType.REPLACE && move.sourceReplicaId && move.replicaId);
    if (requestsPhysicalReplica) {
      throwRuntimeServicePlacementError(partitionId, null, {
        reason: PLACEMENT_ADMISSION_ERROR.BYTES,
      });
    }
    const resolvedSourceNodeId = context.sourceNodeId ?
      context.sourceNodeId : (this.nodeId || DEFAULT_NODE_ID);
    const placementMove = buildPartitionPlacementMove(
      move, normalizedMoveType, resolvedSourceNodeId,
    );
    const placementClass = classifyPlacementClass(partitionId);
    let copyLimits = null;
    const prepareFreshPlacement = async () => {
      if (normalizedMoveType === OperationType.REMOVE) {
        const scope = await readPartitionVoterRemovalScope(this, partitionId, move);
        if (scope === null) {
          throwRuntimeServicePlacementError(partitionId, null, {
            reason: PLACEMENT_ADMISSION_ERROR.REMOVE_INTENT_UNSCOPED,
          });
        }
        placementMove.voterRetirement = scope;
      }
      copyLimits = await this.resolveAdaptiveCopyLimitsForMove(placementMove, partitionId);
    };
    const buildFreshStatement = () => buildPlacementAdmissionStatement(
      {partitionId, placementClass, repair: Boolean(move.repair), move: placementMove},
      {
        sourceNodeId: resolvedSourceNodeId,
        repairWaitingSourceNodeIds: new Set(),
        formationLatchEpoch:
          this.resolveFormationLatchEpochForPlacement(placementClass, partitionId),
        membershipPublicationEpoch: move.membershipPublicationEpoch ?? null,
        positions: move?.positions || {},
        kSrc: copyLimits.kSrc,
        kTgt: copyLimits.kTgt,
      },
    );
    return this.commitSingleCreatedPlacementOperation(
      context, null, resolvePartitionPlacementIntentKey(context),
      {prepareFreshPlacement, buildFreshStatement},
    );
  },

  async createRuntimeServiceOperationViaPlacementAdmission(context) {
    const {requestedMove: move, normalizedMoveType, entityType, entityId} = context;
    const {operationReplicaId, sourceReplicaId} =
      await this.resolveRuntimeServicePlacementIds(context);
    this.assertRuntimeServiceTargetIdentity(
      operationReplicaId, entityType, entityId, normalizedMoveType,
    );
    const resolvedSourceNodeId = context.sourceNodeId ?
      context.sourceNodeId : (this.nodeId || DEFAULT_NODE_ID);
    const statement = buildRuntimeServiceAdmissionStatement({
      serviceId: entityId,
      sourceNodeId: resolvedSourceNodeId,
      formationLatchEpoch:
        this.resolveFormationLatchEpochForPlacement(PLACEMENT_CLASS.SYSTEM, entityId),
      membershipPublicationEpoch: move.membershipPublicationEpoch ?? null,
      positions: move?.positions || {},
      move: {
        type: normalizedMoveType, targetNodeId: move.nodeId,
        replicaId: operationReplicaId, sourceReplicaId, copySourceNodeId: null,
        targetNodeBootIncarnation: move.targetNodeBootIncarnation ?? null,
        targetNodeStorageIncarnation: move.targetNodeStorageIncarnation ?? null,
      },
    });
    return this.commitSingleCreatedPlacementOperation(
      context, statement, resolveRuntimeServiceIntentKey(context, operationReplicaId),
    );
  },

  // The one placement-owner factory (ControlPlaneSetup's), required. Binding
  // is the owned retry of every ledger replica that met this coordinator
  // before it: each one still waiting is attached now.
  bindReplicaPlacementOwnerFactory(factory) {
    if (typeof factory !== LOCAL_STR_FUNCTION) {
      invalidCollaborator(COLLABORATOR.FACTORY);
    }
    this.replicaPlacementOwnerFactory = factory;
    this.placementAdmissionEnabled = true;
    if (this.workflowOwner) this.workflowOwner.placementAdmissionEnabled = true;
    for (const ledgerPartitionService of [...this.ledgerPartitionServices]) {
      ledgerPartitionService.ensureReplicaPlacementOwnerAttached();
    }
  },

  registerLedgerPartitionService(partitionService) {
    if (!partitionService || partitionService.partitionId !== LEDGER_PARTITION_ID) return;
    this.ledgerPartitionServices.add(partitionService);
    this.repository.bindRetainedPlacementRepairWake(partitionService);
    this.placementAdmissionEnabled = true;
    if (this.workflowOwner) this.workflowOwner.placementAdmissionEnabled = true;
  },

  unregisterLedgerPartitionService(partitionService) {
    this.repository.unbindRetainedPlacementRepairWake(partitionService);
    this.ledgerPartitionServices.delete(partitionService);
  },

  // One path: the ledger replica registers; before the factory is bound it
  // waits (null: the binding attaches it), afterwards the factory attaches its
  // owner. Any other partition is a typed refusal.
  attachLedgerReplicaPlacementOwner(ledgerPartitionService) {
    if (ledgerPartitionService?.partitionId !== LEDGER_PARTITION_ID) {
      invalidCollaborator(COLLABORATOR.LEDGER);
    }
    this.registerLedgerPartitionService(ledgerPartitionService);
    if (this.replicaPlacementOwnerFactory === null) return null;
    const attachment = this.replicaPlacementOwnerFactory(ledgerPartitionService);
    if (attachment?.owner) {
      this.replicaPlacementOwner = attachment.owner;
    }
    return attachment;
  },

  async releaseBootstrapTopologyDispatchHold(operationId, stamp) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.releaseBootstrapTopologyDispatchHoldUnderLane(operationId, stamp),
      {operationId},
    );
  },

  async releaseBootstrapTopologyDispatchHoldUnderLane(operationId, stamp) {
    if (!this.repository?.queryAuthoritativeOperationById) {
      return buildBootstrapTopologyHoldReleaseOutcome(false, null, HOLD_RELEASE_NOT_FOUND_REASON);
    }
    const durableOperation = await this.repository.queryAuthoritativeOperationById(operationId);
    if (!durableOperation) {
      return buildBootstrapTopologyHoldReleaseOutcome(false, null, HOLD_RELEASE_NOT_FOUND_REASON);
    }
    if (!isHeldPendingBootstrapOperation(durableOperation)) {
      return buildBootstrapTopologyHoldReleaseOutcome(false, durableOperation);
    }
    if (!isBootstrapTopologyStampCohortAligned(durableOperation, stamp)) {
      return buildBootstrapTopologyHoldReleaseOutcome(
        false, null, HOLD_RELEASE_COHORT_MISMATCH_REASON,
      );
    }
    const released = buildBootstrapTopologyReleasedOperation(
      durableOperation, stamp, this.timeSource ? this.timeSource.now() : Date.now(),
    );
    const persistResult = await this.repository.persistOperationUpdate(released, {
      expectedWorkflowStep: WORKFLOW_STEP.PENDING,
      expectedStepsHistory: durableOperation.stepsHistory,
    });
    const outcome = buildOperationTransitionOutcome(persistResult,
      {repository: this.repository, requestedOperation: released});
    if (!outcome.committed) {
      return buildBootstrapTopologyHoldReleaseOutcome(
        false, await this.repository.queryAuthoritativeOperationById(operationId),
      );
    }
    return buildBootstrapTopologyHoldReleaseOutcome(true, released);
  },

  async armCoordinatorCreatedOperationProgress(operation, armContext = {}) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation, OWNER_PROGRESS_STEP_METHOD.ARM,
      (workflowOwner) => workflowOwner.armCoordinatorCreatedOperation(operation, armContext),
    );
  },

  async dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(operation) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation, OWNER_PROGRESS_STEP_METHOD.DISPATCH_AFTER_CREATE_BUDGET_TURN,
      (owner) => owner.dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(
        operation.operationId,
      ),
    );
  },

  async runCoordinatorCreatedOperationProgressStep(operation, ownerMethodName, invokeStep) {
    if (!operation?.operationId ||
        typeof this.workflowOwner?.[ownerMethodName] !== LOCAL_STR_FUNCTION) {
      return false;
    }
    try {
      return await invokeStep(this.workflowOwner);
    } catch (error) {
      this.logger.warn(LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER, {
        operationId: operation.operationId,
        partitionId: operation.partitionId || null,
        workflowStep: operation.workflowStep,
        error: error?.message || String(error),
      });
      return false;
    }
  },
};

function applyRebalanceCoordinatorOperationCreationSupportMethods(target) {
  Object.defineProperties(
    target.prototype,
    Object.getOwnPropertyDescriptors(operationCreationSupportMethods),
  );
}

export {applyRebalanceCoordinatorOperationCreationSupportMethods};
