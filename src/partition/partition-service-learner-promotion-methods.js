import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_SERVICE_COLLABORATOR_UNWIRED as UNWIRED,
  readWiredReadinessService,
} from './partition-service-collaborators.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  validateLearnerPromotionProofResponse,
} from '../raft/learner-promotion-progress.js';
import {filterSharedRows} from '../cache/shared-row-read.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {
  evaluateLearnerPromotionCountCheck,
} from './learner-promotion-count-check.js';

const {
  ACTIVE_VOTER_ROLES,
  ADD_LIKE_REPLICA_OPERATION_TYPES,
  COLUMN,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LEARNER_PROMOTION_WAKE_REASONS,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TERMINAL_STATUSES,
  buildPriorityRecoveryOperationContextFromRecord,
} = PARTITION_SERVICE_SHARED;

const UNDECLARED_PROMOTION_TARGET_REPLICA_COUNT = 0;

// The two identities one in-flight add-like row states, read once per row so
// the traversal below asks each question a single time.
function readAddLikeOperationRowIdentity(operationRow) {
  return {
    replicaId: String(
      operationRow?.[COLUMN.REPLICA_ID] || STRING.EMPTY,
    ).trim(),
    targetNodeId: String(
      operationRow?.[COLUMN.TARGET_NODE_ID] || STRING.EMPTY,
    ).trim(),
  };
}

// The replica identities one row contributes to the set the count check has
// always decided on: the row's own replica, and - unchanged from main - this
// replica when the row targets this node.
function collectAddLikeOperationReplicaIds(replicaIds, identity, local) {
  if (identity.replicaId.length > 0) {
    replicaIds.add(identity.replicaId);
  }
  if (
    identity.targetNodeId.length > 0 &&
    local.localReplicaId.length > 0 &&
    identity.targetNodeId === local.localNodeId
  ) {
    replicaIds.add(local.localReplicaId);
  }
}

// How one in-flight add-like row can be THIS replica's own. A row that NAMES
// this replica is the answer whenever one exists, whatever the row order: an
// unnamed row that merely targets this node is the coordinator's
// not-yet-named intent, and it stands in only while nothing names us.
const OWNED_ADD_LIKE_MATCH = Object.freeze({
  NONE: 'none',
  NAMES_THIS_REPLICA: 'names_this_replica',
  TARGETS_THIS_NODE: 'targets_this_node',
});

function classifyOwnedAddLikeOperationRow(row, local) {
  if (local.localReplicaId.length === 0) {
    return OWNED_ADD_LIKE_MATCH.NONE;
  }
  if (row.replicaId.length > 0) {
    return row.replicaId === local.localReplicaId ?
      OWNED_ADD_LIKE_MATCH.NAMES_THIS_REPLICA :
      OWNED_ADD_LIKE_MATCH.NONE;
  }
  return local.localNodeId.length > 0 &&
    row.targetNodeId === local.localNodeId ?
    OWNED_ADD_LIKE_MATCH.TARGETS_THIS_NODE :
    OWNED_ADD_LIKE_MATCH.NONE;
}

// Desired RF is decoded by the single policy authority from the persisted
// partitions row. An undeclared policy returns 0 and DEFERS promotion (fail
// closed): the removed ladder fell back to this.replicaCount, an
// identity-derived count, and then to a restated default, so a promotion
// could be admitted against a target no declaration ever stated. The source
// travels with the count so a refusal can name which declaration — or the
// absence of one — the cap was built from.
function resolvePromotionReplicationTarget(systemTableCache, partitionId) {
  const partitionRow = systemTableCache ?
    systemTableCache.get(TABLES.PARTITIONS, partitionId) :
    null;
  const desiredTarget = resolveDesiredReplicationFactor(partitionRow);
  return {
    replicaCount:
      desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED ?
        UNDECLARED_PROMOTION_TARGET_REPLICA_COUNT :
        desiredTarget.replicationFactor,
    source: desiredTarget.source,
  };
}

/**
 * Schedule the next learner promotion check. The check is progress-proven
 * by the current leader; this cadence is ONLY the retry/backoff input —
 * elapsed time never satisfies promotion (quest
 * learner-promotion-progress-proof). A wake reason (own services row
 * visible, published epoch changed) arms the same single timer now; the
 * cadence stays the floor and the fallback (quest
 * learner-promotion-proof-channel-wake).
 * @private
 */
function scheduleLearnerPromotion(service,
  scheduleReason = PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK) {
  if (service.learnerPromotionTimer) {
    return;
  }
  if (service.isShutdown) {
    service.logger.debug(
      PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN,
      {
        partitionId: service.partitionId,
        timer: PARTITION_SERVICE_LITERAL.LEARNERPROMOTIONTIMER,
      },
    );
    return;
  }
  const delayMs =
    PARTITION_SERVICE_LEARNER_PROMOTION_WAKE_REASONS.has(scheduleReason) ?
      PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_WAKE_DELAY_MS :
      service.learnerCatchUpCheckIntervalMs;
  service.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    delayMs,
    scheduleReason,
  });
  service.learnerPromotionTimer = setTimeout(() => {
    Promise.resolve(service.checkLearnerPromotion()).catch((error) => {
      service.logger.warn(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED,
        {
          replicaId: service.replicaId,
          partitionId: service.partitionId,
          reason: PARTITION_SERVICE_LITERAL.PROMOTION_CHECK_FAILED,
          error: error.message,
        },
      );
      service.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
          .DEFERRED_RECHECK,
      );
    });
  }, delayMs);
}

// The readiness service is passed in by the one caller that also reads the
// origin off it, so the answer and its stated origin come from the SAME
// instance rather than from two reads of the property (quest
// learner-promotion-guard-inputs-observed).
function getPriorityRecoveryPlanningSnapshotForLearnerPromotion(service,
  readinessService = readWiredReadinessService(service)) {
  if (readinessService === UNWIRED) {
    return null;
  }
  return (
    readinessService.getPriorityRecoveryPlanningAnswerSync(
      service.nodeId,
      Date.now(),
    ) || null
  );
}

function getPriorityRecoveryOperationContextsForLearnerPromotion(service) {
  if (!service.systemTableCache) {
    return [];
  }
  const operationRows = filterSharedRows(
    service.systemTableCache,
    TABLES.REPLICA_OPERATIONS,
    (operationRow) => {
      if (!operationRow || operationRow.partition_id !== service.partitionId) {
        return false;
      }
      const operationStatus = String(
        operationRow.status ??
          operationRow.operation_status ??
          operationRow.operationStatus ??
          STRING.EMPTY,
      ).toLowerCase();
      return !TERMINAL_STATUSES.includes(operationStatus);
    },
  );
  if (!Array.isArray(operationRows) || operationRows.length === 0) {
    return [];
  }
  return operationRows
    .map((operationRow) =>
      buildPriorityRecoveryOperationContextFromRecord(operationRow),
    )
    .filter(
      (operationContext) =>
        operationContext && typeof operationContext === 'object',
    );
}

function getPartitionServiceRowsForPromotion(service) {
  return filterSharedRows(
    service.systemTableCache,
    TABLES.SERVICES,
    (serviceRow) => {
      return (
        serviceRow?.[COLUMN.PARTITION_ID] === service.partitionId &&
          serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION
      );
    },
  );
}

function getReplicaServiceStatusForPromotion(service, serviceRow) {
  return serviceRow?.[COLUMN.STATUS] || ReplicaStatus.ACTIVE;
}

function isLiveReplicaServiceRowForPromotion(service, serviceRow) {
  const status = service.getReplicaServiceStatusForPromotion(serviceRow);
  return (
    status !== ReplicaStatus.FAILED &&
    status !== ReplicaStatus.REMOVING &&
    status !== ReplicaStatus.REMOVED
  );
}

function isLocalReplicaServiceRowForPromotion(service, serviceRow) {
  const localReplicaId = String(service.replicaId || STRING.EMPTY).trim();
  const serviceReplicaId = String(
    serviceRow?.[COLUMN.REPLICA_ID] ||
      serviceRow?.[COLUMN.SERVICE_ID] ||
      STRING.EMPTY,
  ).trim();
  const localNodeId = String(service.nodeId || STRING.EMPTY).trim();
  const serviceNodeId = String(
    serviceRow?.[COLUMN.NODE_ID] || STRING.EMPTY,
  ).trim();
  const replicaMatches =
    localReplicaId.length > 0 && serviceReplicaId === localReplicaId;
  const nodeMatches =
    localNodeId.length > 0 && serviceNodeId === localNodeId;
  return replicaMatches || nodeMatches;
}

function getReplicaServiceRowReplicaIdForPromotion(service, serviceRow) {
  return String(
    serviceRow?.[COLUMN.REPLICA_ID] ||
      serviceRow?.[COLUMN.SERVICE_ID] ||
      STRING.EMPTY,
  ).trim();
}

function isLearnerServiceRowForPromotion(service, serviceRow) {
  return (
    service.isLiveReplicaServiceRowForPromotion(serviceRow) &&
    isCatchupLearnerRaftRole(serviceRow?.[COLUMN.RAFT_ROLE])
  );
}

function isActiveVoterServiceRowForPromotion(service, serviceRow) {
  const raftRole = serviceRow?.[COLUMN.RAFT_ROLE];
  return (
    service.isLiveReplicaServiceRowForPromotion(serviceRow) &&
    ACTIVE_VOTER_ROLES.has(raftRole)
  );
}

function resolveOperationScopedLearnerCountForPromotion(service, inFlightAddLikeReplicaIds) {
  const operationReplicaIds =
    inFlightAddLikeReplicaIds instanceof Set ?
      inFlightAddLikeReplicaIds :
      new Set();
  if (operationReplicaIds.size === 0) {
    return {scopeActive: false, learnerCount: 0};
  }
  let learnerCount = 0;
  const serviceRows = service.getPartitionServiceRowsForPromotion();
  const operationScopedLearnerRows = serviceRows.filter((serviceRow) => {
    const serviceReplicaId =
      service.getReplicaServiceRowReplicaIdForPromotion(serviceRow);
    return (
      service.isLearnerServiceRowForPromotion(serviceRow) &&
      operationReplicaIds.has(serviceReplicaId)
    );
  });
  for (const serviceRow of operationScopedLearnerRows) {
    const serviceReplicaId =
      service.getReplicaServiceRowReplicaIdForPromotion(serviceRow);
    if (operationReplicaIds.has(serviceReplicaId)) {
      learnerCount++;
    }
  }
  const localReplicaId = String(service.replicaId || STRING.EMPTY).trim();
  const localLearnerRowVisible = operationScopedLearnerRows.some(
    (serviceRow) => service.isLocalReplicaServiceRowForPromotion(serviceRow),
  );
  if (
    isCatchupLearnerRaftRole(service.role) &&
    localReplicaId.length > 0 &&
    operationReplicaIds.has(localReplicaId) &&
    !localLearnerRowVisible
  ) {
    learnerCount++;
  }
  return {scopeActive: true, learnerCount};
}

function resolveLearnerPromotionCounts(service, observedCounts = {}) {
  const observedActiveVoterCount = Number.isFinite(
    observedCounts.activeVoterCount,
  ) ?
    observedCounts.activeVoterCount :
    0;
  const observedLearnerCount = Number.isFinite(observedCounts.learnerCount) ?
    observedCounts.learnerCount :
    0;
  const operationScopedLearnerCount =
    service.resolveOperationScopedLearnerCountForPromotion(
      observedCounts.inFlightAddLikeReplicaIds,
    );
  const baseLearnerCount = operationScopedLearnerCount.scopeActive ?
    operationScopedLearnerCount.learnerCount :
    observedLearnerCount;
  if (!isCatchupLearnerRaftRole(service.role)) {
    return {
      activeVoterCount: observedActiveVoterCount,
      learnerCount: baseLearnerCount,
    };
  }
  const localReplicaRows = service.getPartitionServiceRowsForPromotion().filter(
    (serviceRow) => service.isLocalReplicaServiceRowForPromotion(serviceRow),
  );
  const localLearnerRowVisible = localReplicaRows.some((serviceRow) =>
    service.isLearnerServiceRowForPromotion(serviceRow),
  );
  const localVoterRowVisible = localReplicaRows.some((serviceRow) =>
    service.isActiveVoterServiceRowForPromotion(serviceRow),
  );
  const learnerCount =
    localLearnerRowVisible || operationScopedLearnerCount.scopeActive ?
      baseLearnerCount :
      baseLearnerCount + 1;
  const activeVoterCount = localVoterRowVisible ?
    Math.max(observedActiveVoterCount - 1, 0) :
    observedActiveVoterCount;
  return {activeVoterCount, learnerCount};
}

function resolveActiveLearnerNodeIdsForPromotion(service, serviceLearnerNodeIds) {
  const learnerNodeIds = Array.isArray(serviceLearnerNodeIds) ?
    [...serviceLearnerNodeIds] :
    [];
  const localNodeId = String(service.nodeId || STRING.EMPTY).trim();
  if (
    !isCatchupLearnerRaftRole(service.role) ||
    localNodeId.length === 0 ||
    learnerNodeIds.includes(localNodeId)
  ) {
    return learnerNodeIds;
  }
  return [...learnerNodeIds, localNodeId];
}

function becomeFollower(service) {
  service.role = RaftRole.FOLLOWER;
  service.isLeader = false;
  service.isJoiningExistingGroup = false;
  service.queueRoleUpdate(RaftRole.FOLLOWER);
  service.startElection();
}

/**
 * Check if learner can be promoted to follower.
 * Promotion happens only when ALL of the following hold:
 * 1. A leader has been discovered for the group
 * 2. Promoting would stay within the partition's configured replica count,
 *    allowing at most one temporary replacement voter above target
 * 3. Promoting would not result in an even number of voters (prevents split votes)
 *    unless this is the single temporary replacement voter or all pending
 *    learners together would reach an odd count within target
 * 4. The CURRENT leader proves this learner has applied through the safe
 *    promotion index (the leader's committed index at proof time) for the
 *    current term and membership epoch, and that proof still matches the
 *    local observation after the round trip (quest
 *    learner-promotion-progress-proof). Elapsed time is only the retry
 *    cadence; every refusal defers and reschedules.
 * @return {Promise<void>}
 * @private
 */
async function checkLearnerPromotion(service) {
  service.learnerPromotionTimer = null;
  service.learnerPromotionWake.checkInFlight = true;
  try {
    await service.runLearnerPromotionCheck();
  } finally {
    // Single-flight: wakes that arrived during this check drain into at
    // most one immediate re-check now that it has completed.
    service.drainLearnerPromotionWake();
  }
}

/**
 * The check body (gates in order); every deferral reschedules.
 * @return {Promise<void>}
 * @private
 */
async function runLearnerPromotionCheck(service) {
  if (!isCatchupLearnerRaftRole(service.role)) {
    return;
  }
  if (!service.leaderId) {
    service.leaderId =
      service.resolveLeaderIdFromMetadata() ||
      service.resolveLeaderIdFromHint() ||
      null;
  }
  if (!service.leaderId) {
    service.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
      replicaId: service.replicaId,
      partitionId: service.partitionId,
      reason: PARTITION_SERVICE_LITERAL.LEADER_NOT_DISCOVERED,
    });
    service.scheduleLearnerPromotion(
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
    );
    return;
  }
  const observation = service.observeLearnerPromotionCountCheck();
  const decision = evaluateLearnerPromotionCountCheck(observation);
  const countFields = {
    activeVoterCount: observation.activeVoterCount,
    learnerCount: observation.learnerCount,
    targetReplicaCount: observation.targetReplicaCount,
    maxAllowedVotersAfterPromotion:
      decision.maxAllowedVotersAfterPromotion,
  };
  if (decision.refused) {
    service.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
      replicaId: service.replicaId,
      partitionId: service.partitionId,
      reason: decision.refusalReason,
      ...countFields,
      countCheckInputs:
        service.buildLearnerPromotionCountCheckPayload(observation, decision),
    });
    service.scheduleLearnerPromotion(
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
    );
    return;
  }
  service.logFirstLearnerPromotionCountCheckPass(observation, decision);
  // Progress proof: the current leader must prove this learner applied
  // through the safe promotion index for the current term and membership
  // epoch. Runs LAST so the cheap local quorum-shape gates above never pay
  // the round trip, and the proof is validated against the freshest local
  // observation (leader identity, epoch, role) after it returns.
  await service.applyLearnerPromotionProofGate();
}

/**
 * The progress-proof gate itself: request the proof from the discovered
 * leader, fail-closed validate it against the post-round-trip local
 * observation, and only then promote. Every refusal defers with a typed
 * reason on the retry cadence.
 * @return {Promise<void>}
 * @private
 */
async function applyLearnerPromotionProofGate(service) {
  const requestedLeaderId = service.leaderId;
  const requestedMembershipEpoch =
    service.resolveLearnerPromotionMembershipEpoch();
  const proof = await service.requestLearnerPromotionProofFromLeader({
    leaderReplicaId: requestedLeaderId,
    membershipEpoch: requestedMembershipEpoch,
  });
  const proofValidation = validateLearnerPromotionProofResponse({
    proof,
    isPromotableLearner:
      isCatchupLearnerRaftRole(service.role) && service.isShutdown !== true,
    requestedLeaderId,
    currentLeaderId: service.leaderId,
    requestedMembershipEpoch,
    currentMembershipEpoch: service.resolveLearnerPromotionMembershipEpoch(),
    localTerm: service.resolveCurrentTermSafe(),
  });
  if (!proofValidation.accepted) {
    service.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
      replicaId: service.replicaId,
      partitionId: service.partitionId,
      reason: proofValidation.reason,
      proofReason: proofValidation.proofReason,
      proofCause: proofValidation.proofCause,
      leaderReplicaId: requestedLeaderId,
      membershipEpoch: requestedMembershipEpoch,
    });
    service.scheduleLearnerPromotion(
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
    );
    return;
  }
  service.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_GRANTED, {
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    leaderReplicaId: requestedLeaderId,
    term: proof.term,
    membershipEpoch: proof.membershipEpoch,
    safePromotionIndex: proof.safePromotionIndex,
    learnerMatchIndex: proof.learnerMatchIndex,
  });
  service.becomeFollower();
}

function readInFlightAddLikeOperationRowsForPromotion(service) {
  if (!service.systemTableCache) {
    return [];
  }
  return service.systemTableCache.filter(
    TABLES.REPLICA_OPERATIONS,
    (operationRow) => {
      return (
        operationRow?.[COLUMN.PARTITION_ID] === service.partitionId &&
          ADD_LIKE_REPLICA_OPERATION_TYPES.has(operationRow?.type) &&
          !TERMINAL_STATUSES.includes(
            String(
              operationRow?.[COLUMN.STATUS] ??
                operationRow?.operation_status ??
                operationRow?.operationStatus ??
                STRING.EMPTY,
            ).toLowerCase(),
          )
      );
    },
  );
}

/**
 * ONE traversal of this partition's non-terminal add-like operation rows,
 * yielding both the replica-id set the count check has always decided on
 * and THE row this replica owns. The set is unchanged, member for member:
 * the owned row is selected from the same rows in the same order, so
 * describing the operation the planner authorized costs no second read
 * (quest critical-spread-transition-authority-carry).
 * @return {{replicaIds: Set<string>, ownedOperationRow: Object|null}}
 * @private
 */
function collectInFlightAddLikeOperationsForPromotion(service) {
  const operationRows = service.readInFlightAddLikeOperationRowsForPromotion();
  const local = {
    localNodeId: String(service.nodeId || STRING.EMPTY).trim(),
    localReplicaId: String(service.replicaId || STRING.EMPTY).trim(),
  };
  const replicaIds = new Set();
  let namedRow = null;
  let targetedRow = null;
  for (const operationRow of operationRows) {
    const identity = readAddLikeOperationRowIdentity(operationRow);
    collectAddLikeOperationReplicaIds(replicaIds, identity, local);
    const match = classifyOwnedAddLikeOperationRow(identity, local);
    if (match === OWNED_ADD_LIKE_MATCH.NAMES_THIS_REPLICA && !namedRow) {
      namedRow = operationRow;
    }
    if (match === OWNED_ADD_LIKE_MATCH.TARGETS_THIS_NODE && !targetedRow) {
      targetedRow = operationRow;
    }
  }
  return {replicaIds, ownedOperationRow: namedRow || targetedRow};
}

// ONE traversal of the services rows, yielding both the count the decision
// uses and the replica identities the refusal logs, so describing the
// membership never costs a second read of the rows the decision counted.
function collectPendingLearnerCensusForPromotion(service) {
  const learnerReplicaIds = [];
  for (const serviceRow of service.getPartitionServiceRowsForPromotion()) {
    if (service.isLearnerServiceRowForPromotion(serviceRow)) {
      learnerReplicaIds.push(
        service.getReplicaServiceRowReplicaIdForPromotion(serviceRow),
      );
    }
  }
  return {count: learnerReplicaIds.length, learnerReplicaIds};
}

function countPendingLearners(service) {
  return service.collectPendingLearnerCensusForPromotion().count;
}

function resolveTargetReplicaCountForPromotion(service) {
  return resolvePromotionReplicationTarget(
    service.systemTableCache,
    service.partitionId,
  );
}

function getTargetReplicaCountForPromotion(service) {
  return resolvePromotionReplicationTarget(
    service.systemTableCache,
    service.partitionId,
  ).replicaCount;
}

function collectActiveVoterCensusForPromotion(service) {
  const voterReplicas = [];
  for (const serviceRow of service.getPartitionServiceRowsForPromotion()) {
    if (service.isActiveVoterServiceRowForPromotion(serviceRow)) {
      voterReplicas.push({
        replicaId: service.getReplicaServiceRowReplicaIdForPromotion(serviceRow),
        nodeId: String(
          serviceRow?.[COLUMN.NODE_ID] || STRING.EMPTY,
        ).trim(),
      });
    }
  }
  return {count: voterReplicas.length, voterReplicas};
}

function countActiveVoters(service) {
  return service.collectActiveVoterCensusForPromotion().count;
}

export {
  applyLearnerPromotionProofGate,
  becomeFollower,
  checkLearnerPromotion,
  collectActiveVoterCensusForPromotion,
  collectInFlightAddLikeOperationsForPromotion,
  collectPendingLearnerCensusForPromotion,
  countActiveVoters,
  countPendingLearners,
  getPartitionServiceRowsForPromotion,
  getPriorityRecoveryOperationContextsForLearnerPromotion,
  getPriorityRecoveryPlanningSnapshotForLearnerPromotion,
  getReplicaServiceRowReplicaIdForPromotion,
  getReplicaServiceStatusForPromotion,
  getTargetReplicaCountForPromotion,
  isActiveVoterServiceRowForPromotion,
  isLearnerServiceRowForPromotion,
  isLiveReplicaServiceRowForPromotion,
  isLocalReplicaServiceRowForPromotion,
  readInFlightAddLikeOperationRowsForPromotion,
  resolveActiveLearnerNodeIdsForPromotion,
  resolveLearnerPromotionCounts,
  resolveOperationScopedLearnerCountForPromotion,
  resolveTargetReplicaCountForPromotion,
  runLearnerPromotionCheck,
  scheduleLearnerPromotion,
};
