import {buildReplicaInventorySnapshot} from './replica-inventory.js';

const PRIORITY_SURPLUS_REMOVE_FENCE_SOURCE = 'owner_rpc_lane';
const PRIORITY_SURPLUS_REMOVE_ENTITY_TYPE = 'partition';

const PRIORITY_SURPLUS_REMOVE_FENCE_STATE = Object.freeze({
  ALLOWED: 'allowed',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  IDENTITY_INCOMPLETE: 'identity_incomplete',
  INVENTORY_CONFLICT: 'inventory_conflict',
  NOT_SURPLUS: 'not_surplus',
  SOURCE_MISMATCH: 'source_mismatch',
  TARGET_UNAVAILABLE: 'target_unavailable',
  UNSAFE_COUNT: 'unsafe_count',
  UNSAFE_DIVERSITY: 'unsafe_diversity',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rowReplicaId(row) {
  return text(
    row?.replica_id ?? row?.replicaId ?? row?.service_id ?? row?.serviceId,
  );
}

function rowNodeId(row) {
  return text(row?.node_id ?? row?.nodeId);
}

function rowPartitionId(row) {
  return text(row?.partition_id ?? row?.partitionId);
}

function rowServiceType(row) {
  return text(row?.service_type ?? row?.serviceType).toLowerCase();
}

function completePartitionReplicaRow(row, partitionId) {
  return (
    row &&
    typeof row === 'object' &&
    rowReplicaId(row).length > 0 &&
    rowNodeId(row).length > 0 &&
    rowPartitionId(row) === partitionId &&
    rowServiceType(row) === PRIORITY_SURPLUS_REMOVE_ENTITY_TYPE &&
    text(row.status).length > 0 &&
    text(row.raft_role ?? row.raftRole).length > 0
  );
}

function distinctNodeCount(replicas) {
  return new Set(replicas.map((replica) => replica.nodeId)).size;
}

function decision(state, details = {}) {
  return Object.freeze({
    allowed: state === PRIORITY_SURPLUS_REMOVE_FENCE_STATE.ALLOWED,
    state,
    sourceReplicaId: details.sourceReplicaId || null,
    sourceNodeId: details.sourceNodeId || null,
    targetReplicaCount:
      Number.isFinite(details.targetReplicaCount) ?
        details.targetReplicaCount :
        null,
    currentVoterCount: details.currentVoterCount || 0,
    projectedVoterCount: details.projectedVoterCount || 0,
    currentDistinctNodeCount: details.currentDistinctNodeCount || 0,
    projectedDistinctNodeCount: details.projectedDistinctNodeCount || 0,
    revision: details.revision ?? null,
  });
}

/**
 * Compare one destructive priority REMOVE intent with a strict services-owner
 * snapshot. Planner/cache placement is intentionally absent: it may propose
 * work, but only the owner snapshot can authorize a count-reducing commit.
 *
 * @param {Object} options
 * @return {Object} frozen fence decision
 */
function evaluatePrioritySurplusRemovePlacementFence(options = {}) {
  const observation = options.observation || {};
  const partitionId = text(options.partitionId);
  const sourceReplicaId = text(options.sourceReplicaId);
  const sourceNodeId = text(options.sourceNodeId);
  const targetReplicaCount = Number(options.targetReplicaCount);
  const common = {
    sourceReplicaId,
    sourceNodeId,
    targetReplicaCount,
    revision: observation.snapshotVersion ?? null,
  };
  if (!Number.isInteger(targetReplicaCount) || targetReplicaCount <= 0) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.TARGET_UNAVAILABLE,
      common,
    );
  }
  if (
    observation.available !== true ||
    observation.source !== PRIORITY_SURPLUS_REMOVE_FENCE_SOURCE ||
    !Array.isArray(observation.rows)
  ) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.AUTHORITY_UNAVAILABLE,
      common,
    );
  }
  if (
    partitionId.length === 0 ||
    sourceReplicaId.length === 0 ||
    sourceNodeId.length === 0 ||
    observation.rows.length === 0 ||
    observation.rows.some(
      (row) => !completePartitionReplicaRow(row, partitionId),
    )
  ) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.IDENTITY_INCOMPLETE,
      common,
    );
  }
  const replicaIds = observation.rows.map(rowReplicaId);
  if (new Set(replicaIds).size !== replicaIds.length) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.INVENTORY_CONFLICT,
      common,
    );
  }

  const inventory = buildReplicaInventorySnapshot({
    entityType: PRIORITY_SURPLUS_REMOVE_ENTITY_TYPE,
    entityId: partitionId,
    capturedAtMs: Number.isFinite(options.capturedAtMs) ?
      options.capturedAtMs :
      Date.now(),
    committedRowsObservation: {
      state: 'present',
      rows: observation.rows,
      revision: observation.snapshotVersion ?? null,
      observedAtMs: observation.observedAtMs ?? null,
    },
    inFlightOperationObservation: {
      state: 'empty',
      operations: [],
      observedAtMs: observation.observedAtMs ?? null,
    },
  });
  if (inventory.anomalies.length > 0) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.INVENTORY_CONFLICT,
      common,
    );
  }
  const activeVoters = inventory.replicas.filter(
    (replica) => replica.active && replica.voter,
  );
  const sourceReplica = activeVoters.find(
    (replica) => replica.replicaId === sourceReplicaId,
  );
  const currentVoterCount = activeVoters.length;
  const currentDistinctNodeCount = distinctNodeCount(activeVoters);
  const sharedCounts = {
    ...common,
    currentVoterCount,
    currentDistinctNodeCount,
  };
  if (!sourceReplica || sourceReplica.nodeId !== sourceNodeId) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.SOURCE_MISMATCH,
      sharedCounts,
    );
  }
  if (currentVoterCount <= targetReplicaCount) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.NOT_SURPLUS,
      sharedCounts,
    );
  }

  const projectedVoters = activeVoters.filter(
    (replica) => replica.replicaId !== sourceReplicaId,
  );
  const projectedVoterCount = projectedVoters.length;
  const projectedDistinctNodeCount = distinctNodeCount(projectedVoters);
  const projection = {
    ...sharedCounts,
    projectedVoterCount,
    projectedDistinctNodeCount,
  };
  if (projectedVoterCount < targetReplicaCount) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.UNSAFE_COUNT,
      projection,
    );
  }
  if (projectedDistinctNodeCount < currentDistinctNodeCount) {
    return decision(
      PRIORITY_SURPLUS_REMOVE_FENCE_STATE.UNSAFE_DIVERSITY,
      projection,
    );
  }
  return decision(PRIORITY_SURPLUS_REMOVE_FENCE_STATE.ALLOWED, projection);
}

export {
  evaluatePrioritySurplusRemovePlacementFence,
};
