import {TABLES, SERVICE_TYPE} from '../constants/index.js';
import {VOTER_RAFT_ROLES} from '../raft/replica-voter-readiness.js';
import {ReplicaStatus} from './replica-operation-progress.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const {isOperationLedgerPartitionTable} = REBALANCE_COORDINATOR_SHARED;

// Quest formation-ledger-quorum-spread-first: every operation persists its
// workflow progress into the replica_operations LEDGER, so a ledger partition
// whose voter quorum is CONCENTRATED (no majority can be formed without one
// hot node) makes every commit depend on that node — the affinity-demo run-22
// wedge: bootstrap left 2/3 of the ledger quorum on the overloaded seed, the
// run-20 self-move interlock released after a leadership-only relocation, and
// every dependent control-plane move then wrote its progress into a ledger
// whose acks needed the slow node. This module is the single shared predicate
// over ACTUAL placement rows (services / nodes / partitions caches —
// ARCH-0080/0084 actuals-only) consumed by the admission hold, the emergency
// budget classification, and observability. It deliberately owns NO policy:
// callers decide what a concentrated ledger means for them.
//
// Voter counting: a REMOVING source is still a raft voter until removal
// completes (the run-22 intermediate 4-voter REPLACE state genuinely needed
// the seed's ack), so REMOVING rows count; learners never do.
const QUORUM_VOTER_STATUSES = Object.freeze(
  new Set([ReplicaStatus.ACTIVE, ReplicaStatus.REMOVING]),
);
// Voter raft roles = the shared VOTER_RAFT_ROLES (raft/replica-voter-readiness.js); learners
// never count. (Status side stays local — REMOVING is intentionally a quorum
// voter here, see QUORUM_VOTER_STATUSES.)
const QUORUM_VOTER_RAFT_ROLES = VOTER_RAFT_ROLES;
const NODE_CONNECTION_STATE_READY = 'ready';
// The source token is an authority capability, not merely a transport label.
// OWNER_RPC_REQUIRED may execute locally when this node owns the services
// partition, but it still returns owner_rpc_lane. A bare local-replica result
// can be an ANY_REPLICA fallback and therefore cannot release a stale hold.
const AUTHORITATIVE_PLACEMENT_SOURCE = 'owner_rpc_lane';
const OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE = Object.freeze({
  INCOMPLETE: 'incomplete',
  SPREAD: 'spread',
  UNSPREAD: 'unspread',
  UNAVAILABLE: 'unavailable',
});
const EMPTY_EVALUATION = Object.freeze({
  holdEngaged: false,
  concentratedPartitions: Object.freeze([]),
});

function readCacheRows(systemTableCache, tableName, predicate) {
  if (!systemTableCache || typeof systemTableCache.filter !== 'function') {
    return [];
  }
  const rows = systemTableCache.filter(tableName, predicate);
  return Array.isArray(rows) ? rows : [];
}

function normalizedField(row, field) {
  return String(row?.[field] || '').trim();
}

function isQuorumVoterRow(row) {
  return (
    QUORUM_VOTER_STATUSES.has(normalizedField(row, 'status').toLowerCase()) &&
    QUORUM_VOTER_RAFT_ROLES.has(
      normalizedField(row, 'raft_role').toLowerCase(),
    )
  );
}

function readTargetReplicaCount(systemTableCache, partitionId) {
  if (!systemTableCache || typeof systemTableCache.get !== 'function') {
    return null;
  }
  const partitionRow = systemTableCache.get(TABLES.PARTITIONS, partitionId);
  const replicaCount = Number(partitionRow?.replica_count);
  return Number.isInteger(replicaCount) && replicaCount > 0 ?
    replicaCount :
    null;
}

function readPlacementEligibleNodeIds(systemTableCache, options = {}) {
  const placementEligibleNodeIds = new Set();
  for (const nodeRow of readCacheRows(
    systemTableCache,
    TABLES.NODES,
    (row) =>
      normalizedField(row, 'connection_state') ===
      NODE_CONNECTION_STATE_READY,
  )) {
    const nodeId = normalizedField(nodeRow, 'node_id');
    if (nodeId.length > 0) {
      placementEligibleNodeIds.add(nodeId);
    }
  }
  const additionalNodeIds = Array.isArray(options.placementEligibleNodeIds) ?
    options.placementEligibleNodeIds :
    [];
  for (const nodeId of additionalNodeIds) {
    if (
      typeof nodeId === 'string' &&
      nodeId.length > 0 &&
      !placementEligibleNodeIds.has(nodeId)
    ) {
      placementEligibleNodeIds.add(nodeId);
    }
  }
  return [...placementEligibleNodeIds];
}

function groupRowsByPartitionId(ledgerReplicaRows) {
  const rowsByPartitionId = new Map();
  for (const row of ledgerReplicaRows) {
    const partitionId = normalizedField(row, 'partition_id');
    if (partitionId.length === 0) {
      continue;
    }
    if (!rowsByPartitionId.has(partitionId)) {
      rowsByPartitionId.set(partitionId, []);
    }
    rowsByPartitionId.get(partitionId).push(row);
  }
  return rowsByPartitionId;
}

function resolveHottestNode(voterRows) {
  const votersPerNode = new Map();
  for (const row of voterRows) {
    const nodeId = normalizedField(row, 'node_id');
    votersPerNode.set(nodeId, (votersPerNode.get(nodeId) || 0) + 1);
  }
  let hottestNodeId = null;
  let maxVotersOnOneNode = 0;
  for (const [nodeId, voterCount] of votersPerNode) {
    if (voterCount > maxVotersOnOneNode) {
      maxVotersOnOneNode = voterCount;
      hottestNodeId = nodeId;
    }
  }
  return {hottestNodeId, maxVotersOnOneNode};
}

// Concentration is a PLACEMENT-SKEW condition — cured by a spread REPLACE
// that moves a voter off a multi-voter node. With at most one voter per
// node there is no skew a REPLACE can reduce (moving a lone voter between
// nodes keeps maxVotersOnOneNode at 1), yet the majority formula below is
// unsatisfiable for any placement of <=2 voters — so a 1-2-voter ledger
// view would classify as permanently concentrated and the planner would
// re-mint impotent count-neutral cure REPLACEs while the hold defers all
// dependent admission (live: seven successive ledger REPLACEs over 15min
// against a 2-voter view, demo run 2026-07-13T06:52; the 07-12 docker
// probe storms). Too few voters is UNDER-REPLICATION — the ADD/promotion
// machinery's concern — not concentration. The run-22 protection case
// (two or more voters on one node) is unaffected.
function isQuorumConcentratedPlacement(totalVoters, maxVotersOnOneNode) {
  if (maxVotersOnOneNode <= 1) {
    return false;
  }
  const majority = Math.floor(totalVoters / 2) + 1;
  return totalVoters - maxVotersOnOneNode < majority;
}

function evaluateLedgerPartitionConcentration({
  systemTableCache,
  partitionId,
  partitionRows,
  readyNodeIds,
}) {
  const voterRows = partitionRows.filter(isQuorumVoterRow);
  const totalVoters = voterRows.length;
  if (totalVoters === 0) {
    return null;
  }
  const {hottestNodeId, maxVotersOnOneNode} = resolveHottestNode(voterRows);
  if (!isQuorumConcentratedPlacement(totalVoters, maxVotersOnOneNode)) {
    return null;
  }

  const occupiedNodeIds = new Set(
    partitionRows
      .map((row) => normalizedField(row, 'node_id'))
      .filter((nodeId) => nodeId.length > 0),
  );
  const feasibleTargetNodeIds = readyNodeIds.filter(
    (nodeId) => !occupiedNodeIds.has(nodeId),
  );
  const feasibleTargetNodeId = feasibleTargetNodeIds[0] || null;
  const targetReplicaCount = readTargetReplicaCount(
    systemTableCache,
    partitionId,
  );
  const overTarget =
    targetReplicaCount !== null && totalVoters > targetReplicaCount;
  const distinctVoterNodeIds = Object.freeze(
    [...new Set(
      voterRows
        .map((row) => normalizedField(row, 'node_id'))
        .filter((nodeId) => nodeId.length > 0),
    )],
  );
  return Object.freeze({
    partitionId,
    targetReplicaCount,
    totalVoters,
    maxVotersOnOneNode,
    hottestNodeId,
    distinctVoterNodeIds,
    feasibleTargetNodeId,
    feasibleTargetNodeIds: Object.freeze(feasibleTargetNodeIds),
    overTarget,
    spreadActionable: feasibleTargetNodeIds.length > 0 || overTarget,
  });
}

/**
 * Evaluate quorum concentration for every operation-ledger partition from the
 * ACTUAL placement rows. A partition is CONCENTRATED when the voters outside
 * its hottest node cannot form a majority; the hold is ENGAGED only when a
 * concentrated partition's spread is actionable — a ready node with no replica
 * of that partition exists, or the partition is over its target replica count
 * (a surplus drain also relieves concentration). Absence of actuals (empty or
 * missing caches) never engages the hold: routine admission must not block on
 * missing observations, and clusters too small to spread must not deadlock.
 * @param {Object|null} systemTableCache
 * @return {{holdEngaged: boolean, concentratedPartitions: Array<Object>}}
 */
function evaluateOperationLedgerQuorumConcentration(
  systemTableCache,
  options = {},
) {
  const ledgerReplicaRows = readCacheRows(
    systemTableCache,
    TABLES.SERVICES,
    (row) =>
      row?.service_type === SERVICE_TYPE.PARTITION &&
      isOperationLedgerPartitionTable({
        partitionId: row?.partition_id,
      }),
  );
  if (ledgerReplicaRows.length === 0) {
    return EMPTY_EVALUATION;
  }

  const readyNodeIds = readPlacementEligibleNodeIds(
    systemTableCache,
    options,
  );
  const concentratedPartitions = [];
  for (const [partitionId, partitionRows] of groupRowsByPartitionId(
    ledgerReplicaRows,
  )) {
    const concentration = evaluateLedgerPartitionConcentration({
      systemTableCache,
      partitionId,
      partitionRows,
      readyNodeIds,
    });
    if (concentration) {
      concentratedPartitions.push(concentration);
    }
  }

  if (concentratedPartitions.length === 0) {
    return EMPTY_EVALUATION;
  }
  return Object.freeze({
    holdEngaged: concentratedPartitions.some(
      (partition) => partition.spreadActionable,
    ),
    concentratedPartitions: Object.freeze(concentratedPartitions),
  });
}

/**
 * Evaluate one identity-scoped placement row set returned by the authoritative
 * services-table owner. Unlike the cache observation above, this accepts its
 * target explicitly because the row set is deliberately scoped to services.
 *
 * @param {Array<Object>} rows
 * @param {string|null} partitionId
 * @param {number|null} targetReplicaCount
 * @return {Object}
 */
function getOperationLedgerPlacementObservationFromRows(
  rows,
  partitionId,
  targetReplicaCount,
) {
  const normalizedPartitionId = String(partitionId || '').trim();
  const normalizedTargetReplicaCount =
    Number.isInteger(targetReplicaCount) && targetReplicaCount > 0 ?
      targetReplicaCount :
      null;
  const voterRows = Array.isArray(rows) ?
    rows.filter((row) =>
      normalizedField(row, 'partition_id') === normalizedPartitionId &&
      row?.service_type === SERVICE_TYPE.PARTITION &&
      isQuorumVoterRow(row),
    ) :
    [];
  const observedVoterCount = voterRows.length;
  const distinctNodeCount = new Set(
    voterRows
      .map((row) => normalizedField(row, 'node_id'))
      .filter((nodeId) => nodeId.length > 0),
  ).size;
  const {maxVotersOnOneNode} = resolveHottestNode(voterRows);
  const concentrated =
    isQuorumConcentratedPlacement(observedVoterCount, maxVotersOnOneNode);
  const complete =
    normalizedPartitionId.length > 0 &&
    normalizedTargetReplicaCount !== null &&
    observedVoterCount >= normalizedTargetReplicaCount;
  return Object.freeze({
    partitionId:
      normalizedPartitionId.length > 0 ? normalizedPartitionId : null,
    targetReplicaCount: normalizedTargetReplicaCount,
    observedVoterCount,
    distinctNodeCount,
    maxVotersOnOneNode,
    complete,
    concentrated,
    spreadComplete:
      complete &&
      distinctNodeCount >= normalizedTargetReplicaCount &&
      !concentrated,
  });
}

/**
 * Bind the shared placement predicate to one typed authoritative observation.
 * Source and completeness are part of the contract so consumers cannot turn
 * a successful cache/SQL projection or a partial owner answer into release
 * evidence.
 *
 * @param {Object} params
 * @return {Object}
 */
function getAuthoritativeOperationLedgerPlacementObservation({
  available,
  rows,
  source,
  partitionId,
  targetReplicaCount,
  snapshotVersion = null,
}) {
  const normalizedSource = String(source || '').trim().toLowerCase();
  const placement = getOperationLedgerPlacementObservationFromRows(
    rows,
    partitionId,
    targetReplicaCount,
  );
  const authoritative =
    available === true &&
    Array.isArray(rows) &&
    normalizedSource === AUTHORITATIVE_PLACEMENT_SOURCE;
  if (!authoritative) {
    return Object.freeze({
      ...placement,
      complete: false,
      concentrated: null,
      spreadComplete: false,
      source: normalizedSource || null,
      snapshotVersion,
      state: OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE.UNAVAILABLE,
    });
  }
  const state = !placement.complete ?
    OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE.INCOMPLETE :
    placement.spreadComplete ?
      OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE.SPREAD :
      OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE.UNSPREAD;
  return Object.freeze({
    ...placement,
    source: normalizedSource,
    snapshotVersion,
    state,
  });
}

/**
 * @param {Object|null} evaluation
 * @param {string|null} partitionId
 * @return {boolean}
 */
function isConcentratedOperationLedgerPartition(evaluation, partitionId) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return false;
  }
  return Boolean(
    evaluation?.concentratedPartitions?.some(
      (partition) => partition.partitionId === normalizedPartitionId,
    ),
  );
}

/**
 * Return the immutable concentration observation for one ledger partition.
 * This is the evidence-bearing form of isConcentratedOperationLedgerPartition:
 * interaction owners that must choose a concrete cure consume the same
 * placement observation as the admission hold instead of reconstructing it
 * from unrelated readiness projections.
 * @param {Object|null} evaluation
 * @param {string|null} partitionId
 * @return {Object|null}
 */
function getConcentratedOperationLedgerPartition(evaluation, partitionId) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return null;
  }
  return evaluation?.concentratedPartitions?.find(
    (partition) => partition.partitionId === normalizedPartitionId,
  ) || null;
}

export {
  OPERATION_LEDGER_PLACEMENT_OBSERVATION_STATE,
  evaluateOperationLedgerQuorumConcentration,
  getConcentratedOperationLedgerPartition,
  getAuthoritativeOperationLedgerPlacementObservation,
  isConcentratedOperationLedgerPartition,
};
