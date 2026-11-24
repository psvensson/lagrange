import {readStateField} from '../utils/state-field-read.js';
import {deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
/**
 * User-table leader-placement cure — the single owner of the
 * "spread ordinary user-table partition leaders across data hosts"
 * decision (quest user-table-leader-placement-spread).
 *
 * Each partition's rebalancer runs on that partition's raft leader, so
 * the cure is a leaseholder-local decision: when the table's settled
 * partitions have their leaders concentrated on fewer distinct hosts
 * than the eligible voter-host capacity, a surplus host sheds one
 * leadership per round by asking a voter-ready follower replica on a
 * host with ZERO table leaders to campaign (the existing
 * STEP_DOWN_REPLICA / tracked-replacement-election machinery; the node
 * side is untouched). While the gap predicate holds such a host always
 * exists (pigeonhole), every successful handoff strictly increases the
 * distinct leader-host count, and nothing ever pulls leadership back —
 * the actuator is one-directional, so no limit cycle exists.
 *
 * Hysteresis reuses recorded cures only: the stabilization/start-delay
 * planning gates guard the evaluation pass, the census must be stable
 * across two consecutive passes (sibling leader rows are CDC-lagged; the
 * own partition's leader is overridden with the proven-local signal),
 * and dispatch retries ride PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE.
 * No new timers.
 *
 * Every handoff PAIRS the source handoff with the target election
 * (quest user-table-leader-handoff-demotion-pairing). On the rs-raft
 * port both are one leader-mediated leadership transfer
 * (PartitionService.requestLeadershipTransfer): the target names itself,
 * the source hands leadership to its most caught-up voter, and the core
 * moves it without a leaderless timer race. The pairing was introduced
 * for the retired directed election, which a healthy leader's heartbeat
 * re-armed away (run 20260810T221340Z: two completed dispatches, zero
 * campaigns in 420s); a lost dispatch falls back to the bounded
 * ordinal-staggered election and census re-shed keeps the actuator
 * convergent.
 */

import {
  classifySystemPartition,
  getPartitionRowFromCache,
  resolvePartitionTableId,
} from '../bootstrap/system-partition-classification.js';
import {normalizeServiceRow} from '../control-plane/system-row-normalizers.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from './replica-operation-constants.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from './operation-workflow-owner-shared.js';
import {
  REBALANCE_PLANNING_GATE,
} from './rebalancer-planning-gate-constants.js';

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

// Minimum settled partitions for spread to be meaningful, and the
// surplus floor: only a host holding at least two of the table's
// leaders can shed one while remaining a distinct leader host.
const MIN_SETTLED_PARTITION_COUNT = 2;
const MIN_SURPLUS_LEADER_COUNT = 2;

// Reuse of the recorded handoff retry cadence (no new timers): a
// dispatched request is not re-sent within the retry window.
const LEADER_HANDOFF_RETRY_AFTER_MS =
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE.REQUEST_RETRY_AFTER_MS;

// Synthetic operation id prefix — handleStepDownReplica uses the id for
// logging/echo only (verified: no ledger lookup); the prefix keeps the
// cure's requests distinguishable from REPLACE-flow handoffs in logs.
const CURE_OPERATION_ID_PREFIX = 'user-table-leader-spread';
// The paired local demotion leg carries its own suffix so the two legs
// of one handoff are separable in receiver logs.
const CURE_DEMOTION_OPERATION_SUFFIX = 'demote';

const REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';

// Partition rows in SPLITTING/MERGING survive until dissolution; acting
// on them would bake a transient topology into the census.
const SPLIT_OR_MERGE_PARTITION_STATES = Object.freeze(new Set([
  'splitting',
  'merging',
]));

// The typed decision vocabulary — one canonical outcome per evaluation.
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

// States in which the gap predicate held AND this rebalancer is the
// acting surplus host (or is one census pass away from acting): the
// quiescent check cadence must hold flat at the base interval here —
// backing off 1.5x per pass starves the very re-check that completes
// the two-pass census stability or re-dispatches after the retry
// window (witnessed live: delays reached the 2x cap while the gap
// persisted). Non-acting states (satisfied, anchor, not-surplus) keep
// the normal backoff.
const CURE_GAP_ACTIONABLE_STATES = Object.freeze(new Set([
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED,
]));

function isUserTableLeaderCureGapActionable(decision) {
  return Boolean(decision) &&
    CURE_GAP_ACTIONABLE_STATES.has(decision.state);
}

const CURE_DEMOTION_SKIP_REASON = Object.freeze({
  NO_OWN_REPLICA_ID: 'own replicaId unavailable',
});

const CURE_LOG_MSG = Object.freeze({
  DECISION: 'User-table leader placement cure decision',
  DEMOTION_COMPLETED:
    'User-table leader placement cure demoted local source leader',
  DEMOTION_FAILED:
    'User-table leader placement cure local demotion dispatch failed',
  DEMOTION_SKIPPED:
    'User-table leader placement cure skipped local demotion',
  DISPATCHED: 'User-table leader placement cure dispatched leader handoff',
  DISPATCH_FAILED:
    'User-table leader placement cure handoff dispatch failed',
});

function readText(value) {
  return typeof value === 'string' && value.length > CURE_LITERAL.ZERO ?
    value :
    null;
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

/**
 * Pure decision core. All evidence is pre-collected so the relation is
 * testable without a rebalancer instance.
 *
 * @param {Object} evidence
 * @param {string} evidence.partitionId Own partition id.
 * @param {string} evidence.nodeId Own node id (proven-local leader host).
 * @param {Array<Object>} evidence.settledPartitions Table census rows
 *   `{partitionId, leaderNodeId}` with the own row already overridden by
 *   the proven-local leader signal.
 * @param {Set<string>} evidence.eligibleVoterHosts Distinct hosts holding
 *   a voter-ready ACTIVE replica of any settled partition of the table.
 * @param {Array<Object>} evidence.ownVoterFollowers Own partition's
 *   voter-ready ACTIVE replicas on other nodes `{nodeId, replicaId}`.
 * @param {string|null} evidence.previousCensusFingerprint
 * @param {number|null} evidence.lastDispatchAtMs
 * @param {number} evidence.nowMs
 * @return {Object} Frozen typed decision.
 */
function evaluateUserTableLeaderPlacementCure(evidence) {
  const settled = evidence.settledPartitions;
  const fingerprint = censusFingerprint(settled);
  const distinctLeaderHosts = new Set(
    settled.map((entry) => entry.leaderNodeId).filter(Boolean),
  );
  const requiredLeaderHosts = Math.min(
    settled.length,
    evidence.eligibleVoterHosts.size,
  );
  const census = Object.freeze({
    distinctLeaderHostCount: distinctLeaderHosts.size,
    eligibleVoterHostCount: evidence.eligibleVoterHosts.size,
    fingerprint,
    requiredLeaderHostCount: requiredLeaderHosts,
    settledPartitionCount: settled.length,
  });
  const decide = (state, extra = {}) =>
    Object.freeze({census, state, ...extra});

  if (settled.length < MIN_SETTLED_PARTITION_COUNT) {
    return decide(
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.BELOW_MIN_PARTITION_COUNT);
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
  const shedIndex = coLocated.indexOf(evidence.partitionId) -
    CURE_LITERAL.ONE;
  if (shedIndex < CURE_LITERAL.ZERO) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.ANCHOR_RETAINED);
  }
  if (fingerprint !== evidence.previousCensusFingerprint) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.CENSUS_UNSTABLE);
  }
  if (
    Number.isFinite(evidence.lastDispatchAtMs) &&
    evidence.nowMs - evidence.lastDispatchAtMs <
      LEADER_HANDOFF_RETRY_AFTER_MS
  ) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.RETRY_SUPPRESSED);
  }
  // Targets are hosts with ZERO leaders of this table: every successful
  // handoff then strictly increases the distinct leader-host count, and
  // while the gap predicate holds such a host always exists among the
  // eligible voter hosts (pigeonhole) — though not necessarily one
  // holding a replica of THIS partition.
  const zeroLeaderTargets = evidence.ownVoterFollowers
    .filter((replica) => !distinctLeaderHosts.has(replica.nodeId))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  if (zeroLeaderTargets.length === CURE_LITERAL.ZERO) {
    return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.NO_ELIGIBLE_TARGET);
  }
  const target = zeroLeaderTargets[shedIndex % zeroLeaderTargets.length];
  return decide(USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF, {
    target: Object.freeze({
      nodeId: target.nodeId,
      replicaId: target.replicaId,
    }),
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
  const eligibleVoterHostCount = Math.max(
    ownActiveVoterHosts.length,
    evidence.eligibleVoterHosts.size,
  );
  const requiredLeaderHosts = Math.min(
    sortedSystemPartitionIds.length,
    ownActiveVoterHosts.length,
  );
  const fingerprint =
    `${evidence.partitionId}|${evidence.nodeId}|` +
    ownActiveVoterHosts.join(CURE_LITERAL.FINGERPRINT_SEPARATOR);
  return {
    census: Object.freeze({
      distinctLeaderHostCount: distinctLeaderHosts.size,
      eligibleVoterHostCount,
      fingerprint,
      requiredLeaderHostCount: requiredLeaderHosts,
      settledPartitionCount: sortedSystemPartitionIds.length,
    }),
    distinctLeaderHosts,
    eligibleVoterHostCount,
    fingerprint,
    ownActiveVoterHosts,
    ownVoterFollowers,
    requiredLeaderHosts,
    sortedSystemPartitionIds,
  };
}

function isSystemPartitionRetrySuppressed(evidence) {
  return Number.isFinite(evidence.lastDispatchAtMs) &&
    evidence.nowMs - evidence.lastDispatchAtMs <
      LEADER_HANDOFF_RETRY_AFTER_MS;
}

function isSystemPartitionTargetIneligible(evidence, cohort) {
  return cohort.ownVoterFollowers.length === CURE_LITERAL.ZERO ||
    cohort.ownActiveVoterHosts.length < cohort.eligibleVoterHostCount ||
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
    target: Object.freeze({
      nodeId: target.nodeId,
      replicaId: target.replicaId,
    }),
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

function collectSettledSystemPartitions(rebalancer) {
  const byPartitionId = collectSettledPartitionsWhere(
    rebalancer,
    (row) => {
      const partitionId = readPartitionIdFromRow(row);
      return Boolean(partitionId) &&
        isNonPrioritySystemTablePartition({partitionId, partitionRow: row});
    },
  );
  if (
    rebalancer.entityId !== META_ANCHOR_PARTITION_ID &&
    !byPartitionId.has(rebalancer.entityId)
  ) {
    byPartitionId.set(rebalancer.entityId, {
      leaderNodeId: rebalancer.nodeId,
      partitionId: rebalancer.entityId,
    });
  }
  return [...byPartitionId.values()];
}

function isNonTerminalReplicaOperationForPartition(row, partitionId, nowMs) {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const normalized = normalizeReplicaOperationRecord(row, {nowMs});
  const matchesPartition =
    normalized.partitionId === partitionId ||
    normalized.entityId === partitionId;
  if (!matchesPartition) {
    return false;
  }
  if (normalized.type.length > CURE_LITERAL.ZERO) {
    return !isTerminalReplicaOperationRecord(normalized);
  }
  return !TERMINAL_STATUSES.includes(normalized.status);
}

function hasNonTerminalPartitionReplicaOperation(
  rebalancer,
  partitionId,
  nowMs,
) {
  const rows = rebalancer.systemTableCache.filter(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    (row) => isNonTerminalReplicaOperationForPartition(row, partitionId, nowMs),
  );
  return Array.isArray(rows) && rows.length > CURE_LITERAL.ZERO;
}

function collectSettledTablePartitions(rebalancer, tableId) {
  return [
    ...collectSettledPartitionsWhere(
      rebalancer,
      (row) => resolvePartitionTableId({partitionRow: row}) === tableId,
    ).values(),
  ];
}

function collectEligibleVoterHosts(rebalancer, settledPartitions) {
  const partitionIds = new Set(
    settledPartitions.map((entry) => entry.partitionId),
  );
  const rows = rebalancer.systemTableCache.filter(
    SYSTEM_TABLE_NAME.SERVICES,
    (row) => {
      const service = normalizeServiceRow(row);
      return service.serviceType === EntityType.PARTITION &&
        partitionIds.has(service.partitionId);
    },
  );
  const hosts = new Set();
  for (const row of rows) {
    const service = normalizeServiceRow(row);
    if (
      service.nodeId &&
      service.status === SERVICE_STATUS.ACTIVE &&
      isVoterRaftRole(service.raftRole)
    ) {
      hosts.add(service.nodeId);
    }
  }
  return hosts;
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
      if (replicaId) {
        followers.push({nodeId: service.nodeId, replicaId});
      }
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

function buildHandoffRequest(rebalancer, decision) {
  return {
    [ReplicaOperationField.TYPE]:
      ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    [ReplicaOperationField.OPERATION_ID]:
      `${CURE_OPERATION_ID_PREFIX}:${rebalancer.entityId}`,
    [ReplicaOperationField.PARTITION_ID]: rebalancer.entityId,
    [ReplicaOperationField.REPLICA_ID]: decision.target.replicaId,
    [ReplicaOperationField.REASON]:
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  };
}

function buildSourceDemotionRequest(rebalancer) {
  return {
    [ReplicaOperationField.TYPE]:
      ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    [ReplicaOperationField.OPERATION_ID]:
      `${CURE_OPERATION_ID_PREFIX}:${rebalancer.entityId}:` +
      CURE_DEMOTION_OPERATION_SUFFIX,
    [ReplicaOperationField.PARTITION_ID]: rebalancer.entityId,
    [ReplicaOperationField.REPLICA_ID]: rebalancer.replicaId,
    [ReplicaOperationField.REASON]:
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
  };
}

function resolveOwnSourceReplicaId(rebalancer) {
  return typeof rebalancer.replicaId === 'string' &&
    rebalancer.replicaId.length > CURE_LITERAL.ZERO ?
    rebalancer.replicaId :
    null;
}

function buildHandoffResponseLogContext(rebalancer, response, extra) {
  return {
    entityId: rebalancer.entityId,
    handoffBranch: response?.handoffBranch || null,
    handoffTrackedRole: response?.handoffTrackedRole || null,
    responseStatus: readStateField(response?.status),
    ...extra,
  };
}

// Demote the own (source) leader replica through the local
// replica-handler — the same tracked, flap-safe demotion the REPLACE
// flow uses (candidacy deferred before the timer re-arms, so the
// demoted host cannot immediately re-win). A failed demotion leg is
// logged and the election leg still dispatches: that is exactly the
// pre-pairing behavior, never worse.
async function demoteLocalSourceLeader(rebalancer) {
  const sourceReplicaId = resolveOwnSourceReplicaId(rebalancer);
  if (sourceReplicaId === null) {
    rebalancer.logger.warn(CURE_LOG_MSG.DEMOTION_SKIPPED, {
      entityId: rebalancer.entityId,
      reason: CURE_DEMOTION_SKIP_REASON.NO_OWN_REPLICA_ID,
    });
    return null;
  }
  const target = `${rebalancer.nodeId}${REPLICA_HANDLER_TARGET_SUFFIX}`;
  try {
    const deliveryEnvelope = await rebalancer.messageRouter.deliver(
      target,
      buildSourceDemotionRequest(rebalancer),
      {targetNodeId: rebalancer.nodeId},
    );
    const response = deliveryAnswerOf(deliveryEnvelope);
    rebalancer.logger.info(
      CURE_LOG_MSG.DEMOTION_COMPLETED,
      buildHandoffResponseLogContext(rebalancer, response, {sourceReplicaId}),
    );
    return response;
  } catch (error) {
    rebalancer.logger.warn(CURE_LOG_MSG.DEMOTION_FAILED, {
      entityId: rebalancer.entityId,
      error: error?.message || String(error),
      sourceReplicaId,
    });
    return null;
  }
}

// Ordering is load-bearing: demote FIRST so the leader's heartbeat
// stream stops, THEN arm the target's directed election — nothing is
// left to clobber the 1ms draw. After demotion this rebalancer loses
// leadership (and with it the retry cadence), so both legs run in this
// one pass; a lost election leg is accepted fallback (staggered
// election), not something the demoted instance retries.
async function dispatchLeaderHandoff(rebalancer, decision, nowMs) {
  const cureState = resolveCureState(rebalancer);
  cureState.lastDispatchAtMs = nowMs;
  await demoteLocalSourceLeader(rebalancer);
  const target =
    `${decision.target.nodeId}${REPLICA_HANDLER_TARGET_SUFFIX}`;
  try {
    const deliveryEnvelope = await rebalancer.messageRouter.deliver(
      target,
      buildHandoffRequest(rebalancer, decision),
      {targetNodeId: decision.target.nodeId},
    );
    const response = deliveryAnswerOf(deliveryEnvelope);
    rebalancer.logger.info(
      CURE_LOG_MSG.DISPATCHED,
      buildHandoffResponseLogContext(rebalancer, response, {
        targetNodeId: decision.target.nodeId,
        targetReplicaId: decision.target.replicaId,
      }),
    );
    return response;
  } catch (error) {
    rebalancer.logger.warn(CURE_LOG_MSG.DISPATCH_FAILED, {
      entityId: rebalancer.entityId,
      error: error?.message || String(error),
      targetNodeId: decision.target.nodeId,
    });
    return null;
  }
}

function isOrdinaryUserTablePartition(rebalancer, partitionRow) {
  if (
    rebalancer.entityType !== EntityType.PARTITION ||
    rebalancer.entityId === META_ANCHOR_PARTITION_ID
  ) {
    return false;
  }
  return classifySystemPartition({
    partitionId: rebalancer.entityId,
    partitionRow,
  }).systemTable === false;
}

function isSystemTableCohortCurePartition(rebalancer, partitionRow) {
  if (rebalancer.entityType !== EntityType.PARTITION) {
    return false;
  }
  if (rebalancer.entityId === META_ANCHOR_PARTITION_ID) {
    return true;
  }
  return isNonPrioritySystemTablePartition({
    partitionId: rebalancer.entityId,
    partitionRow,
  });
}

function evaluateSystemCohortCureForRebalancer(rebalancer, cureState, nowMs) {
  const settledPartitions = collectSettledSystemPartitions(rebalancer);
  return evaluateSystemTableLeaderPlacementCure({
    eligibleVoterHosts:
      collectEligibleVoterHosts(rebalancer, settledPartitions),
    hasInFlightReplicaOperation: hasNonTerminalPartitionReplicaOperation(
      rebalancer,
      rebalancer.entityId,
      nowMs,
    ),
    lastDispatchAtMs: cureState.lastDispatchAtMs,
    nodeId: rebalancer.nodeId,
    nowMs,
    ownVoterFollowers: collectOwnVoterFollowers(rebalancer),
    partitionId: rebalancer.entityId,
    previousCensusFingerprint: cureState.censusFingerprint,
    settledPartitions,
  });
}

function evaluateUserTableCureForRebalancer(
  rebalancer,
  tableId,
  cureState,
  nowMs,
) {
  const settledPartitions =
    collectSettledTablePartitions(rebalancer, tableId);
  return evaluateUserTableLeaderPlacementCure({
    eligibleVoterHosts:
      collectEligibleVoterHosts(rebalancer, settledPartitions),
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

async function applyUserTableLeaderPlacementCure(rebalancer, options = {}) {
  if (!isRebalancerEligibleForCure(rebalancer)) {
    return null;
  }
  const partitionRow = getPartitionRowFromCache(
    rebalancer.systemTableCache,
    rebalancer.entityId,
  );
  const systemCohort = isSystemTableCohortCurePartition(
    rebalancer,
    partitionRow,
  );
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
    evaluateSystemCohortCureForRebalancer(rebalancer, cureState, nowMs) :
    evaluateUserTableCureForRebalancer(rebalancer, tableId, cureState, nowMs);
  recordAndLogCureEvaluation(rebalancer, cureState, decision);
  if (
    decision.state ===
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
  evaluateLeaderPlacementCureBehindPrioritySpreadGate,
  evaluateUserTableLeaderPlacementCure,
  isUserTableLeaderCureGapActionable,
};
