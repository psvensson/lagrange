import {
  COLUMN,
  NUM,
  TYPEOF,
} from '../constants/index.js';

function normalizeNodeId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function normalizeNonEmptyString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function normalizeLowerString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function collectNodeIds(rows, fieldCandidates, predicate = null) {
  const nodeIds = new Set();
  const normalizedRows = Array.isArray(rows) ? rows : [];
  for (const row of normalizedRows) {
    if (predicate && predicate(row) !== true) {
      continue;
    }
    for (const fieldName of fieldCandidates) {
      const nodeId = normalizeNodeId(row?.[fieldName]);
      if (nodeId) {
        nodeIds.add(nodeId);
        break;
      }
    }
  }
  return nodeIds;
}

function isActiveServiceRow(row) {
  const status = normalizeLowerString(
    row?.[COLUMN.STATUS] ?? row?.status,
  );
  return status === 'active';
}

function isActiveEndpointRow(row) {
  const status = normalizeLowerString(
    row?.[COLUMN.STATUS] ?? row?.status,
  );
  return status === 'active' || status === null;
}

function sortNodeIds(nodeIds) {
  return [...nodeIds].sort((left, right) => left.localeCompare(right));
}

function hasUsableAddress(row) {
  return normalizeNonEmptyString(
    row?.[COLUMN.ADDRESS] ?? row?.address,
  ) !== null;
}

function isPartitionServiceRow(row) {
  const serviceType = normalizeLowerString(
    row?.[COLUMN.SERVICE_TYPE] ?? row?.service_type ?? row?.serviceType,
  );
  return serviceType === null || serviceType === 'partition';
}

function evaluatePartitionReplicaTopology(options = {}) {
  const partitionRow = options.partitionRow &&
    typeof options.partitionRow === TYPEOF.OBJECT ?
      options.partitionRow :
      null;
  const partitionId = normalizeNonEmptyString(
    partitionRow?.[COLUMN.PARTITION_ID] ??
      partitionRow?.partition_id ??
      partitionRow?.partitionId,
  );
  const leaderNodeId = normalizeNodeId(
    partitionRow?.[COLUMN.LEADER_NODE_ID] ??
      partitionRow?.leader_node_id ??
      partitionRow?.leaderNodeId,
  );
  const desiredReplicaCount = Number(
    partitionRow?.[COLUMN.REPLICA_COUNT] ??
      partitionRow?.replica_count ??
      partitionRow?.replicaCount ??
      NUM.ZERO,
  );
  const requiresAddress = options.requiresAddress === true;
  const requireLeaderNodeId = options.requireLeaderNodeId === true;
  const matchingServiceRows = (Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [])
    .filter((row) => isPartitionServiceRow(row))
    .filter((row) => isActiveServiceRow(row))
    .filter((row) => {
      if (!partitionId) {
        return true;
      }
      return normalizeNonEmptyString(
        row?.[COLUMN.PARTITION_ID] ?? row?.partition_id ?? row?.partitionId,
      ) === partitionId;
    });
  const activeReplicaNodeIds = sortNodeIds(
    collectNodeIds(
      matchingServiceRows,
      [COLUMN.NODE_ID, 'node_id', 'nodeId'],
    ),
  );
  const leaderRoleNodeIds = sortNodeIds(
    collectNodeIds(
      matchingServiceRows,
      [COLUMN.NODE_ID, 'node_id', 'nodeId'],
      (row) => {
        if (requiresAddress && hasUsableAddress(row) !== true) {
          return false;
        }
        return normalizeLowerString(
          row?.[COLUMN.RAFT_ROLE] ?? row?.raft_role ?? row?.raftRole,
        ) === 'leader';
      },
    ),
  );
  const canonicalLeaderReplica = leaderNodeId ?
    activeReplicaNodeIds.includes(leaderNodeId) :
    false;
  const leaderServiceVisible = leaderRoleNodeIds.length > NUM.ZERO;
  const leaderKnown = canonicalLeaderReplica || leaderServiceVisible;
  const hasLeaderMetadata = Boolean(leaderNodeId) || leaderRoleNodeIds.length > NUM.ZERO;
  const overTargetReplicaCount =
    Number.isInteger(desiredReplicaCount) &&
    desiredReplicaCount > NUM.ZERO &&
    activeReplicaNodeIds.length > desiredReplicaCount;
  const missingLeaderNodeId =
    requireLeaderNodeId &&
    !leaderNodeId &&
    activeReplicaNodeIds.length > NUM.ZERO;
  let lastErrorCode = null;
  if (missingLeaderNodeId) {
    lastErrorCode = 'leader_node_id_missing';
  } else if (hasLeaderMetadata &&
      activeReplicaNodeIds.length > NUM.ZERO &&
      leaderKnown !== true) {
    lastErrorCode = 'leader_service_missing';
  }
  const topologyState = overTargetReplicaCount || lastErrorCode ?
    'invalid' :
    leaderKnown ?
      'routable' :
      'opaque';

  return Object.freeze({
    partitionId,
    leaderNodeId,
    desiredReplicaCount:
      Number.isInteger(desiredReplicaCount) && desiredReplicaCount > NUM.ZERO ?
        desiredReplicaCount :
        null,
    activeReplicaNodeIds: Object.freeze(activeReplicaNodeIds),
    observedReplicaCount: activeReplicaNodeIds.length,
    leaderRoleNodeIds: Object.freeze(leaderRoleNodeIds),
    leaderServiceVisible,
    canonicalLeaderReplica,
    leaderKnown,
    overTargetReplicaCount,
    lastErrorCode,
    topologyState,
  });
}

function evaluateSharedMetadataNodeCoverage(options = {}) {
  const observedNodeIds = collectNodeIds(
    options.nodeRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId', 'id'],
  );
  const referencedNodeIds = new Set();

  for (const nodeId of collectNodeIds(
    options.serviceRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId'],
    isActiveServiceRow,
  )) {
    referencedNodeIds.add(nodeId);
  }

  for (const nodeId of collectNodeIds(
    options.nodeEndpointRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId'],
    isActiveEndpointRow,
  )) {
    referencedNodeIds.add(nodeId);
  }

  for (const nodeId of collectNodeIds(
    options.partitionRows,
    [COLUMN.LEADER_NODE_ID, 'leader_node_id', 'leaderNodeId'],
  )) {
    referencedNodeIds.add(nodeId);
  }

  const missingNodeIds = sortNodeIds(
    new Set(
      [...referencedNodeIds].filter((nodeId) => !observedNodeIds.has(nodeId)),
    ),
  );

  return Object.freeze({
    hasCoverageGap: missingNodeIds.length > NUM.ZERO,
    observedNodeIds: Object.freeze(sortNodeIds(observedNodeIds)),
    referencedNodeIds: Object.freeze(sortNodeIds(referencedNodeIds)),
    missingNodeIds: Object.freeze(missingNodeIds),
  });
}

export {evaluateSharedMetadataNodeCoverage};
export {evaluatePartitionReplicaTopology};
