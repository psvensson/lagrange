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

const {EntityType, SYSTEM_TABLE_NAME} = UNIFIED_REBALANCER_SHARED;
const {PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE} =
  OPERATION_WORKFLOW_OWNER_SHARED;

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

const REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';

// Partition rows in SPLITTING/MERGING survive until dissolution; acting
// on them would bake a transient topology into the census.
const TRANSITIONAL_PARTITION_STATES = Object.freeze(new Set([
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

const CURE_LOG_MSG = Object.freeze({
  DECISION: 'User-table leader placement cure decision',
  DISPATCHED: 'User-table leader placement cure dispatched leader handoff',
  DISPATCH_FAILED:
    'User-table leader placement cure handoff dispatch failed',
});

function readText(value) {
  return typeof value === 'string' && value.length > CURE_LITERAL.ZERO ?
    value :
    null;
}

function isTransitionalPartitionState(state) {
  return TRANSITIONAL_PARTITION_STATES.has(
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

function collectSettledTablePartitions(rebalancer, tableId) {
  const rows = rebalancer.systemTableCache.filter(
    SYSTEM_TABLE_NAME.PARTITIONS,
    (row) => resolvePartitionTableId({partitionRow: row}) === tableId,
  );
  const settled = [];
  for (const row of rows) {
    if (isTransitionalPartitionState(row?.state)) {
      continue;
    }
    const partitionId = readText(row?.partition_id) ||
      readText(row?.partitionId);
    if (!partitionId) {
      continue;
    }
    // The own row's durable leader column lags; the proven-local signal
    // is authoritative for the partition this rebalancer leads.
    const leaderNodeId = partitionId === rebalancer.entityId ?
      rebalancer.nodeId :
      readText(row?.leader_node_id) || readText(row?.leaderNodeId);
    settled.push({leaderNodeId, partitionId});
  }
  return settled;
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

async function dispatchLeaderHandoff(rebalancer, decision, nowMs) {
  const cureState = resolveCureState(rebalancer);
  cureState.lastDispatchAtMs = nowMs;
  const target =
    `${decision.target.nodeId}${REPLICA_HANDLER_TARGET_SUFFIX}`;
  try {
    const response = await rebalancer.messageRouter.deliver(
      target,
      buildHandoffRequest(rebalancer, decision),
      {targetNodeId: decision.target.nodeId},
    );
    rebalancer.logger.info(CURE_LOG_MSG.DISPATCHED, {
      entityId: rebalancer.entityId,
      responseStatus: response?.status || null,
      targetNodeId: decision.target.nodeId,
      targetReplicaId: decision.target.replicaId,
    });
    return response || null;
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
  if (rebalancer.entityType !== EntityType.PARTITION) {
    return false;
  }
  return classifySystemPartition({
    partitionId: rebalancer.entityId,
    partitionRow,
  }).systemTable === false;
}

/**
 * Evaluate and (when decided) dispatch the leader-placement cure for an
 * ordinary user-table partition. Called from the quiescent branch of the
 * periodic check — after the planning gates passed and replica-shape
 * evaluation found no work — so the recorded stabilization and
 * anti-churn levers stay structurally upstream of every handoff.
 *
 * @param {Object} rebalancer The UnifiedRebalancer instance.
 * @param {Object} [options]
 * @param {number} [options.nowMs]
 * @return {Promise<Object|null>} The frozen decision, or null when the
 *   partition is out of the cure's scope.
 */
async function applyUserTableLeaderPlacementCure(rebalancer, options = {}) {
  if (
    rebalancer.isShuttingDown ||
    rebalancer.isLeader !== true ||
    typeof rebalancer.isStabilized === 'function' &&
      !rebalancer.isStabilized()
  ) {
    return null;
  }
  const partitionRow = getPartitionRowFromCache(
    rebalancer.systemTableCache,
    rebalancer.entityId,
  );
  if (!isOrdinaryUserTablePartition(rebalancer, partitionRow)) {
    return null;
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const tableId = resolvePartitionTableId({
    partitionId: rebalancer.entityId,
    partitionRow,
  });
  if (!tableId) {
    return null;
  }
  const settledPartitions =
    collectSettledTablePartitions(rebalancer, tableId);
  const cureState = resolveCureState(rebalancer);
  const decision = evaluateUserTableLeaderPlacementCure({
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
  cureState.censusFingerprint = decision.census.fingerprint;
  if (decision.state !== cureState.lastLoggedState) {
    cureState.lastLoggedState = decision.state;
    rebalancer.logger.info(CURE_LOG_MSG.DECISION, {
      census: decision.census,
      entityId: rebalancer.entityId,
      state: decision.state,
    });
  }
  if (
    decision.state ===
      USER_TABLE_LEADER_PLACEMENT_CURE_STATE.DISPATCH_HANDOFF
  ) {
    await dispatchLeaderHandoff(rebalancer, decision, nowMs);
  }
  return decision;
}

// The cross-partition priority-spread deferral protects the shared
// move/creation actuators (coordinator budget, create lanes) while
// system partitions finish their spread; a user-table leader handoff
// consumes none of them, so the cure still evaluates behind exactly
// this gate. Every partition-local gate (readiness, start delay,
// stabilization, topology settling) precedes it in the planning-gate
// decision order, so being blocked there proves those passed;
// transport backpressure is ordered after it and is checked
// explicitly. Witnessed live: three consecutive runs where a rotating
// system-partition wobble (syncing tail, stale spread census, failed
// replica) held the deferral closed for the entire multi-minute
// window, starving an otherwise-ready leader cure.
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
};
