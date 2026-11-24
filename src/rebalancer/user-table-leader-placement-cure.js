import {readStateField} from '../utils/state-field-read.js';
import {deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
import {
  classifySystemPartition,
  getPartitionRowFromCache,
  resolvePartitionTableId,
} from '../bootstrap/system-partition-classification.js';
import {resolveDesiredReplicationFactor} from '../bootstrap/replication-target-authority.js';
import {normalizeServiceRow} from '../control-plane/system-row-normalizers.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from './replica-operation-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {REBALANCE_PLANNING_GATE} from './rebalancer-planning-gate-constants.js';

const {
  EntityType,
  SYSTEM_TABLE_NAME,
  TERMINAL_STATUSES,
  isTerminalReplicaOperationRecord,
  normalizeReplicaOperationRecord,
} = UNIFIED_REBALANCER_SHARED;
const {PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE} =
  OPERATION_WORKFLOW_OWNER_SHARED;

const META_ANCHOR_PARTITION_ID = '_meta-p1';
const CURE_LITERAL = Object.freeze({
  ZERO: 0,
  ONE: 1,
  EMPTY: '',
  FINGERPRINT_SEPARATOR: ',',
});
const MIN_SETTLED_PARTITION_COUNT = 2;
const MIN_SURPLUS_LEADER_COUNT = 2;
const LEADER_HANDOFF_RETRY_AFTER_MS =
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE.REQUEST_RETRY_AFTER_MS;
const CURE_OPERATION_ID_PREFIX = 'user-table-leader-spread';
const CURE_DEMOTION_OPERATION_SUFFIX = 'demote';
const REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';
const SPLIT_OR_MERGE_PARTITION_STATES = Object.freeze(new Set(['splitting', 'merging']));

const USER_TABLE_LEADER_PLACEMENT_CURE_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  BELOW_MIN_PARTITION_COUNT: 'below_min_partition_count',
  SPREAD_SATISFIED: 'spread_satisfied',
  NOT_SURPLUS_HOST: 'not_surplus_host',
  ANCHOR_RETAINED: 'anchor_retained',
  CENSUS_UNSTABLE: 'census_unstable',
  RETRY_SUPPRESSED: 'retry_suppressed',
  NO_ELIGIBLE_TARGET: 'no_eligible_target',
  DISPATCH_HANDOFF: 'dispatch_handoff',
});

const CURE_GAP_ACTIONABLE_STATES = Object.freeze(new Set([
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED,
]));

function isUserTableLeaderCureGapActionable(decision) {
  return Boolean(decision) && CURE_GAP_ACTIONABLE_STATES.has(decision.state);
}

const CURE_DEMOTION_SKIP_REASON = Object.freeze({
  NO_OWN_REPLICA_ID: 'own replicaId unavailable',
});

const CURE_LOG_MSG = Object.freeze({
  DECISION: 'User-table leader placement cure decision',
  DEMOTION_COMPLETED: 'User-table leader placement cure demoted local source leader',
  DEMOTION_FAILED: 'User-table leader placement cure local demotion dispatch failed',
  DEMOTION_SKIPPED: 'User-table leader placement cure skipped local demotion',
  DISPATCHED: 'User-table leader placement cure dispatched leader handoff',
  DISPATCH_FAILED: 'User-table leader placement cure handoff dispatch failed',
});

function readText(value) {
  return typeof value === 'string' && value.length > CURE_LITERAL.ZERO ? value : null;
}

function isSplitOrMergePartitionState(state) {
  return SPLIT_OR_MERGE_PARTITION_STATES.has(
    String(state || CURE_LITERAL.EMPTY).toLowerCase(),
  );
}

function censusFingerprint(settledPartitions) {
  return settledPartitions
    .map((entry) => `${entry.partitionId}|${entry.leaderNodeId}`)
    .sort()
    .join(CURE_LITERAL.FINGERPRINT_SEPARATOR);
}

function evaluateUserTableLeaderPlacementCure(evidence) {
  const settled = evidence.settledPartitions;
  const fingerprint = censusFingerprint(settled);
  const distinctLeaderHosts = new Set(
    settled.map((entry) => entry.leaderNodeId).filter(Boolean),
  );
  const requiredLeaderHosts = Math.min(settled.length, evidence.eligibleVoterHosts.size);
  const census = Object.freeze({
    distinctLeaderHostCount: distinctLeaderHosts.size,
    eligibleVoterHostCount: evidence.eligibleVoterHosts.size,
    fingerprint,
    requiredLeaderHostCount: requiredLeaderHosts,
    settledPartitionCount: settled.length,
  });
  const decide = (state, extra = {}) => Object.freeze({census, state, ...extra});

  if (settled.length < MIN_SETTLED_PARTITION_COUNT) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.BELOW_MIN_PARTITION_COUNT);
  }
  if (distinctLeaderHosts.size >= requiredLeaderHosts) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED);
  }
  const coLocated = settled
    .filter((entry) => entry.leaderNodeId === evidence.nodeId)
    .map((entry) => entry.partitionId)
    .sort();
  if (coLocated.length < MIN_SURPLUS_LEADER_COUNT) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NOT_SURPLUS_HOST);
  }
  const shedIndex = coLocated.indexOf(evidence.partitionId) - CURE_LITERAL.ONE;
  if (shedIndex < CURE_LITERAL.ZERO) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED);
  }
  if (fingerprint !== evidence.previousCensusFingerprint) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE);
  }
  if (
    Number.isFinite(evidence.lastDispatchAtMs) &&
    evidence.nowMs - evidence.lastDispatchAtMs < LEADER_HANDOFF_RETRY_AFTER_MS
  ) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED);
  }
  const zeroLeaderTargets = evidence.ownVoterFollowers
    .filter((replica) => !distinctLeaderHosts.has(replica.nodeId))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  if (zeroLeaderTargets.length === CURE_LITERAL.ZERO) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET);
  }
  const target = zeroLeaderTargets[shedIndex % zeroLeaderTargets.length];
  return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF, {
    target: Object.freeze({nodeId: target.nodeId, replicaId: target.replicaId}),
  });
}

function isNonPrioritySystemTablePartition(options = {}) {
  const classification = classifySystemPartition(options);
  return classification.systemTable === true &&
    classification.priorityControlPlane === false &&
    classification.formationLivenessDependency === false;
}

function buildSystemCohortCensus(evidence) {
  const settled = evidence.settledPartitions;
  const ownIds = evidence.partitionId !== META_ANCHOR_PARTITION_ID ?
    [evidence.partitionId] :
    [];
  const sortedSystemPartitionIds = [
    ...new Set([...settled.map((entry) => entry.partitionId), ...ownIds]),
  ].sort();
  const ownVoterFollowers = evidence.ownVoterFollowers;
  const ownActiveVoterHosts = [
    ...new Set([
      evidence.nodeId,
      ...ownVoterFollowers.map((follower) => follower.nodeId),
    ]),
  ].sort();
  const distinctLeaderHosts = new Set(
    settled.map((entry) => entry.leaderNodeId).filter(Boolean),
  );
  const targetReplicaCount =
    Number.isSafeInteger(evidence.targetReplicaCount) &&
    evidence.targetReplicaCount > CURE_LITERAL.ZERO ?
      evidence.targetReplicaCount :
      CURE_LITERAL.ZERO;
  const effectiveClusterVoterHostCount = Math.max(
    ownActiveVoterHosts.length,
    evidence.eligibleVoterHosts.size,
  );
  const requiredActiveVoterCount = targetReplicaCount > CURE_LITERAL.ZERO ?
    Math.min(targetReplicaCount, effectiveClusterVoterHostCount) :
    effectiveClusterVoterHostCount;
  const requiredLeaderHosts = Math.min(
    sortedSystemPartitionIds.length,
    ownActiveVoterHosts.length,
  );
  const cohortKey = sortedSystemPartitionIds.join(
    CURE_LITERAL.FINGERPRINT_SEPARATOR,
  );
  const fingerprint =
    `${evidence.partitionId}|${evidence.nodeId}|` +
    `${ownActiveVoterHosts.join(CURE_LITERAL.FINGERPRINT_SEPARATOR)}|` +
    cohortKey;
  return {
    census: Object.freeze({
      distinctLeaderHostCount: distinctLeaderHosts.size,
      eligibleVoterHostCount: effectiveClusterVoterHostCount,
      fingerprint,
      requiredActiveVoterCount,
      requiredLeaderHostCount: requiredLeaderHosts,
      settledPartitionCount: sortedSystemPartitionIds.length,
    }),
    distinctLeaderHosts,
    eligibleVoterHostCount: effectiveClusterVoterHostCount,
    fingerprint,
    ownActiveVoterHosts,
    ownVoterFollowers,
    requiredActiveVoterCount,
    requiredLeaderHosts,
    sortedSystemPartitionIds,
  };
}

function isSystemPartitionRetrySuppressed(evidence) {
  return Number.isFinite(evidence.lastDispatchAtMs) &&
    evidence.nowMs - evidence.lastDispatchAtMs < LEADER_HANDOFF_RETRY_AFTER_MS;
}

function isSystemPartitionTargetIneligible(evidence, cohort) {
  return cohort.ownVoterFollowers.length === CURE_LITERAL.ZERO ||
    cohort.requiredActiveVoterCount < MIN_SETTLED_PARTITION_COUNT ||
    cohort.ownActiveVoterHosts.length < cohort.requiredActiveVoterCount ||
    evidence.hasInFlightReplicaOperation === true;
}

function evaluateSystemTableLeaderPlacementCure(evidence) {
  const cohort = buildSystemCohortCensus(evidence);
  const decide = (state, extra = {}) =>
    Object.freeze({census: cohort.census, state, ...extra});

  if (evidence.partitionId === META_ANCHOR_PARTITION_ID) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED);
  }
  if (cohort.sortedSystemPartitionIds.length < MIN_SETTLED_PARTITION_COUNT) {
    return decide(
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.BELOW_MIN_PARTITION_COUNT);
  }
  if (isSystemPartitionTargetIneligible(evidence, cohort)) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET);
  }
  const cohortIndex =
    cohort.sortedSystemPartitionIds.indexOf(evidence.partitionId);
  const assignedHost =
    cohort.ownActiveVoterHosts[cohortIndex % cohort.ownActiveVoterHosts.length];
  if (assignedHost === evidence.nodeId) {
    return decide(
      cohort.distinctLeaderHosts.size >= cohort.requiredLeaderHosts ?
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.SPREAD_SATISFIED :
        USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED,
    );
  }
  if (cohort.fingerprint !== evidence.previousCensusFingerprint) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE);
  }
  if (isSystemPartitionRetrySuppressed(evidence)) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED);
  }
  const target = cohort.ownVoterFollowers.find(
    (replica) => replica.nodeId === assignedHost,
  );
  if (!target) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET);
  }
  return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF, {
    target: Object.freeze({nodeId: target.nodeId, replicaId: target.replicaId}),
  });
}

function readPartitionIdFromRow(row) {
  return readText(row?.partition_id) || readText(row?.partitionId);
}

function readLeaderNodeIdFromRow(rebalancer, partitionId, row) {
  return partitionId === rebalancer.entityId ?
    rebalancer.nodeId :
    readText(row?.leader_node_id) || readText(row?.leaderNodeId);
}

function readPartitionServiceRows(systemTableCache, partitionId) {
  return systemTableCache.servicesForPartition(partitionId).filter(
    (row) => normalizeServiceRow(row).serviceType === EntityType.PARTITION,
  );
}

function addActiveVoterHost(row, hosts) {
  const service = normalizeServiceRow(row);
  if (
    service.nodeId &&
    service.status === SERVICE_STATUS.ACTIVE &&
    isVoterRaftRole(service.raftRole)
  ) {
    hosts.add(service.nodeId);
  }
}

function collectSettledPartitionsWhere(rebalancer, predicate) {
  const rows = rebalancer.systemTableCache.filter(
    SYSTEM_TABLE_NAME.PARTITIONS,
    predicate,
  );
  const byPartitionId = new Map();
  for (const row of rows) {
    if (isSplitOrMergePartitionState(row?.state)) {
      continue;
    }
    const partitionId = readPartitionIdFromRow(row);
    if (partitionId) {
      byPartitionId.set(partitionId, {
        leaderNodeId: readLeaderNodeIdFromRow(rebalancer, partitionId, row),
        partitionId,
      });
    }
  }
  return byPartitionId;
}

function isNonTerminalReplicaOperationRow(row, nowMs) {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const normalized = normalizeReplicaOperationRecord(row, {nowMs});
  if (!normalized.partitionId && !normalized.entityId) {
    return false;
  }
  return normalized.type.length > CURE_LITERAL.ZERO ?
    !isTerminalReplicaOperationRecord(normalized) :
    !TERMINAL_STATUSES.includes(normalized.status);
}

function collectInFlightReplicaOperationPartitionIds(systemTableCache, nowMs) {
  const partitionIds = new Set();
  const rows = systemTableCache.filter(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    (row) => isNonTerminalReplicaOperationRow(row, nowMs),
  );
  for (const row of rows) {
    const normalized = normalizeReplicaOperationRecord(row, {nowMs});
    if (normalized.partitionId) partitionIds.add(normalized.partitionId);
    if (normalized.entityId) partitionIds.add(normalized.entityId);
  }
  return partitionIds;
}

function collectSettledTablePartitions(rebalancer, tableId) {
  return [...collectSettledPartitionsWhere(
    rebalancer,
    (row) => resolvePartitionTableId({partitionRow: row}) === tableId,
  ).values()];
}

function collectEligibleVoterHostsForPartitionIds(
  systemTableCache,
  partitionIds,
) {
  const hosts = new Set();
  for (const partitionId of partitionIds) {
    for (const row of readPartitionServiceRows(systemTableCache, partitionId)) {
      addActiveVoterHost(row, hosts);
    }
  }
  return hosts;
}

function collectEligibleVoterHosts(rebalancer, settledPartitions) {
  const partitionIds = new Set(settledPartitions.map((entry) => entry.partitionId));
  return collectEligibleVoterHostsForPartitionIds(
    rebalancer.systemTableCache,
    partitionIds,
  );
}

function indexPartitionRowForPassCensus(row, indexState) {
  const partitionId = readPartitionIdFromRow(row);
  if (!partitionId) return;
  indexState.partitionRowsById.set(partitionId, row);
  const classification = classifySystemPartition({partitionId, partitionRow: row});
  if (classification.systemTable !== true) return;
  indexState.systemPartitionIds.add(partitionId);
  if (
    classification.priorityControlPlane ||
    classification.formationLivenessDependency
  ) {
    return;
  }
  if (!isSplitOrMergePartitionState(row?.state)) {
    indexState.settledSystemPartitionsById.set(partitionId, {
      leaderNodeId: readText(row?.leader_node_id) || readText(row?.leaderNodeId),
      partitionId,
    });
  }
}

const HANDOFF_NOT_CANCELLED = () => false;

function readReplicaOperationsMutationVersion(systemTableCache) {
  const version = systemTableCache?.getTableMutationVersion?.(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  );
  return Number.isSafeInteger(version) ? version : null;
}

function refreshSharedPassInFlightReplicaOperations(
  systemTableCache,
  passCensus,
  nowMs = Date.now(),
) {
  if (!systemTableCache || !passCensus) {
    return passCensus?.inFlightReplicaOperationPartitionIds || new Set();
  }
  const currentVersion = readReplicaOperationsMutationVersion(systemTableCache);
  if (
    currentVersion !== null &&
    currentVersion === passCensus.replicaOperationsMutationVersion
  ) {
    return passCensus.inFlightReplicaOperationPartitionIds;
  }
  const refreshed = collectInFlightReplicaOperationPartitionIds(
    systemTableCache,
    nowMs,
  );
  passCensus.inFlightReplicaOperationPartitionIds = refreshed;
  passCensus.replicaOperationsMutationVersion = currentVersion;
  return refreshed;
}

function buildSharedLeaderPlacementPassCensus(owner, nowMs = Date.now()) {
  const systemTableCache = owner?.systemTableCache;
  if (!systemTableCache) return null;
  const partitionRows = systemTableCache.filter(
    SYSTEM_TABLE_NAME.PARTITIONS,
    () => true,
  );
  const indexState = {
    partitionRowsById: new Map(),
    settledSystemPartitionsById: new Map(),
    systemPartitionIds: new Set(),
  };
  for (const row of partitionRows) {
    indexPartitionRowForPassCensus(row, indexState);
  }
  const inFlightReplicaOperationPartitionIds =
    collectInFlightReplicaOperationPartitionIds(systemTableCache, nowMs);
  const systemEligibleVoterHosts = collectEligibleVoterHostsForPartitionIds(
    systemTableCache,
    indexState.systemPartitionIds,
  );
  return {
    inFlightReplicaOperationPartitionIds,
    partitionRowsById: indexState.partitionRowsById,
    replicaOperationsMutationVersion:
      readReplicaOperationsMutationVersion(systemTableCache),
    settledSystemPartitionsById: indexState.settledSystemPartitionsById,
    systemEligibleVoterHosts,
  };
}

function resolveSettledSystemPartitionsFromCensus(rebalancer, passCensus) {
  const settled = [];
  let hasOwn = rebalancer.entityId === META_ANCHOR_PARTITION_ID;
  for (const entry of passCensus.settledSystemPartitionsById.values()) {
    const isOwn = entry.partitionId === rebalancer.entityId;
    if (isOwn) hasOwn = true;
    settled.push(isOwn ?
      {leaderNodeId: rebalancer.nodeId, partitionId: entry.partitionId} :
      entry);
  }
  if (!hasOwn) {
    settled.push({leaderNodeId: rebalancer.nodeId, partitionId: rebalancer.entityId});
  }
  return settled;
}

function collectOwnVoterFollowers(rebalancer) {
  const followers = [];
  for (const row of rebalancer.getCurrentReplicas()) {
    const service = normalizeServiceRow(row);
    if (
      service.nodeId &&
      service.nodeId !== rebalancer.nodeId &&
      service.status === SERVICE_STATUS.ACTIVE &&
      isVoterRaftRole(service.raftRole)
    ) {
      const replicaId = service.serviceId || service.replicaId;
      if (replicaId) followers.push({nodeId: service.nodeId, replicaId});
    }
  }
  return followers;
}

function resolveCureState(rebalancer) {
  if (!rebalancer.userTableLeaderPlacementCureState) {
    rebalancer.userTableLeaderPlacementCureState = {
      censusFingerprint: null,
      lastDispatchAtMs: null,
      lastLoggedState: null,
    };
  }
  return rebalancer.userTableLeaderPlacementCureState;
}

function buildStepDownRequest(rebalancer, operationId, replicaId, reason) {
  return {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.PARTITION_ID]: rebalancer.entityId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.REASON]: reason,
  };
}

function buildHandoffRequest(rebalancer, decision) {
  return buildStepDownRequest(
    rebalancer, `${CURE_OPERATION_ID_PREFIX}:${rebalancer.entityId}`,
    decision.target.replicaId, ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  );
}

function buildSourceDemotionRequest(rebalancer) {
  return buildStepDownRequest(
    rebalancer,
    `${CURE_OPERATION_ID_PREFIX}:${rebalancer.entityId}:${CURE_DEMOTION_OPERATION_SUFFIX}`,
    rebalancer.replicaId, ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
  );
}

function resolveOwnSourceReplicaId(rebalancer) {
  return typeof rebalancer.replicaId === 'string' &&
    rebalancer.replicaId.length > CURE_LITERAL.ZERO ?
    rebalancer.replicaId :
    null;
}

async function deliverStepDownLeg(
  rebalancer,
  targetNodeId,
  request,
  successMsg,
  failMsg,
  logExtra,
) {
  const target = `${targetNodeId}${REPLICA_HANDLER_TARGET_SUFFIX}`;
  try {
    const deliveryEnvelope = await rebalancer.messageRouter.deliver(
      target,
      request,
      {targetNodeId},
    );
    const response = deliveryAnswerOf(deliveryEnvelope);
    rebalancer.logger.info(successMsg, {
      entityId: rebalancer.entityId,
      handoffBranch: response?.handoffBranch || null,
      handoffTrackedRole: response?.handoffTrackedRole || null,
      responseStatus: readStateField(response?.status),
      ...logExtra,
    });
  } catch (error) {
    rebalancer.logger.warn(failMsg, {
      entityId: rebalancer.entityId,
      error: error?.message || String(error),
      ...logExtra,
    });
  }
}

async function demoteLocalSourceLeader(rebalancer) {
  const sourceReplicaId = resolveOwnSourceReplicaId(rebalancer);
  if (sourceReplicaId === null) {
    rebalancer.logger.warn(CURE_LOG_MSG.DEMOTION_SKIPPED, {
      entityId: rebalancer.entityId,
      reason: CURE_DEMOTION_SKIP_REASON.NO_OWN_REPLICA_ID,
    });
    return;
  }
  await deliverStepDownLeg(
    rebalancer,
    rebalancer.nodeId,
    buildSourceDemotionRequest(rebalancer),
    CURE_LOG_MSG.DEMOTION_COMPLETED,
    CURE_LOG_MSG.DEMOTION_FAILED,
    {sourceReplicaId},
  );
}

async function dispatchLeaderHandoff(rebalancer, decision, nowMs, options = {}) {
  const {isCancelled = HANDOFF_NOT_CANCELLED} = options || {};
  if (rebalancer.isShuttingDown || isCancelled()) {
    return;
  }
  const cureState = resolveCureState(rebalancer);
  cureState.lastDispatchAtMs = nowMs;
  await demoteLocalSourceLeader(rebalancer);
  if (rebalancer.isShuttingDown || isCancelled()) {
    return;
  }
  await deliverStepDownLeg(
    rebalancer,
    decision.target.nodeId,
    buildHandoffRequest(rebalancer, decision),
    CURE_LOG_MSG.DISPATCHED,
    CURE_LOG_MSG.DISPATCH_FAILED,
    {
      targetNodeId: decision.target.nodeId,
      targetReplicaId: decision.target.replicaId,
    },
  );
}

function isOrdinaryUserTablePartition(rebalancer, partitionRow) {
  return rebalancer.entityType === EntityType.PARTITION &&
    rebalancer.entityId !== META_ANCHOR_PARTITION_ID &&
    classifySystemPartition({
      partitionId: rebalancer.entityId,
      partitionRow,
    }).systemTable === false;
}

function isSystemTableCohortCurePartition(rebalancer, partitionRow) {
  return rebalancer.entityType === EntityType.PARTITION && (
    rebalancer.entityId === META_ANCHOR_PARTITION_ID ||
    isNonPrioritySystemTablePartition({
      partitionId: rebalancer.entityId,
      partitionRow,
    })
  );
}

function evaluateSystemCohortCureForRebalancer(
  rebalancer,
  partitionRow,
  cureState,
  nowMs,
  sharedPassCensus = null,
) {
  const passCensus =
    sharedPassCensus || buildSharedLeaderPlacementPassCensus(rebalancer, nowMs);
  const {replicationFactor} = resolveDesiredReplicationFactor(partitionRow);
  return evaluateSystemTableLeaderPlacementCure({
    eligibleVoterHosts: passCensus.systemEligibleVoterHosts,
    hasInFlightReplicaOperation:
      passCensus.inFlightReplicaOperationPartitionIds.has(rebalancer.entityId),
    lastDispatchAtMs: cureState.lastDispatchAtMs,
    nodeId: rebalancer.nodeId,
    nowMs,
    ownVoterFollowers: collectOwnVoterFollowers(rebalancer),
    partitionId: rebalancer.entityId,
    previousCensusFingerprint: cureState.censusFingerprint,
    settledPartitions:
      resolveSettledSystemPartitionsFromCensus(rebalancer, passCensus),
    targetReplicaCount: replicationFactor,
  });
}

function evaluateUserTableCureForRebalancer(rebalancer, tableId, cureState, nowMs) {
  const settledPartitions = collectSettledTablePartitions(rebalancer, tableId);
  return evaluateUserTableLeaderPlacementCure({
    eligibleVoterHosts: collectEligibleVoterHosts(rebalancer, settledPartitions),
    lastDispatchAtMs: cureState.lastDispatchAtMs,
    nodeId: rebalancer.nodeId,
    nowMs,
    ownVoterFollowers: collectOwnVoterFollowers(rebalancer),
    partitionId: rebalancer.entityId,
    previousCensusFingerprint: cureState.censusFingerprint,
    settledPartitions,
  });
}

function isRebalancerEligibleForCure(rebalancer) {
  return !rebalancer.isShuttingDown &&
    rebalancer.isLeader === true &&
    rebalancer.isStabilized?.() !== false;
}

function recordAndLogCureEvaluation(rebalancer, cureState, decision) {
  cureState.censusFingerprint =
    decision.state ===
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET ?
      null :
      decision.census.fingerprint;
  if (decision.state !== cureState.lastLoggedState) {
    cureState.lastLoggedState = decision.state;
    rebalancer.logger.info(CURE_LOG_MSG.DECISION, {
      census: decision.census,
      entityId: rebalancer.entityId,
      state: decision.state,
    });
  }
}

function resolveCachedPartitionRow(rebalancer, sharedPassCensus) {
  return sharedPassCensus?.partitionRowsById instanceof Map ?
    sharedPassCensus.partitionRowsById.get(rebalancer.entityId) || null :
    getPartitionRowFromCache(rebalancer.systemTableCache, rebalancer.entityId);
}

function evaluateRebalancerLeaderPlacementCurePass(rebalancer, options = {}) {
  if (!isRebalancerEligibleForCure(rebalancer)) return null;
  const sharedPassCensus = options.sharedPassCensus || null;
  const partitionRow = resolveCachedPartitionRow(rebalancer, sharedPassCensus);
  const systemCohort = isSystemTableCohortCurePartition(rebalancer, partitionRow);
  const tableId = systemCohort ?
    null :
    resolvePartitionTableId({partitionId: rebalancer.entityId, partitionRow});
  if (
    !systemCohort &&
    (!isOrdinaryUserTablePartition(rebalancer, partitionRow) || !tableId)
  ) {
    return null;
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const cureState = resolveCureState(rebalancer);
  const decision = systemCohort ?
    evaluateSystemCohortCureForRebalancer(
      rebalancer, partitionRow, cureState, nowMs, sharedPassCensus,
    ) :
    evaluateUserTableCureForRebalancer(rebalancer, tableId, cureState, nowMs);
  recordAndLogCureEvaluation(rebalancer, cureState, decision);
  return decision;
}

async function applyUserTableLeaderPlacementCure(rebalancer, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const decision = evaluateRebalancerLeaderPlacementCurePass(rebalancer, {
    ...options,
    nowMs,
  });
  if (
    decision?.state ===
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF
  ) {
    await dispatchLeaderHandoff(rebalancer, decision, nowMs);
  }
  return decision;
}

async function evaluateLeaderPlacementCureBehindPrioritySpreadGate(
  rebalancer,
  blocker,
) {
  if (
    blocker?.decision?.gate !==
      REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD ||
    rebalancer.resolveTransportBackpressurePlanningGateDecision()
  ) {
    return;
  }
  await applyUserTableLeaderPlacementCure(rebalancer);
}

export {
  LEADER_HANDOFF_RETRY_AFTER_MS,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE,
  applyUserTableLeaderPlacementCure,
  buildSharedLeaderPlacementPassCensus,
  dispatchLeaderHandoff,
  evaluateLeaderPlacementCureBehindPrioritySpreadGate,
  evaluateRebalancerLeaderPlacementCurePass,
  evaluateSystemTableLeaderPlacementCure,
  evaluateUserTableLeaderPlacementCure,
  isUserTableLeaderCureGapActionable,
  readPartitionServiceRows,
  refreshSharedPassInFlightReplicaOperations,
};
