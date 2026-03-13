import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

function filterRows(cache, tableName, predicate) {
  if (!cache) {
    return [];
  }
  if (typeof cache.filter === TYPEOF.FUNCTION) {
    return cache.filter(tableName, predicate) || [];
  }
  if (typeof cache.getAll === TYPEOF.FUNCTION) {
    return (cache.getAll(tableName) || []).filter(predicate);
  }
  return [];
}

function findRow(cache, tableName, predicate) {
  return filterRows(cache, tableName, predicate)[NUM.ZERO] || null;
}

function hasNodeReadinessRows(cache) {
  if (!cache) {
    return false;
  }
  if (typeof cache.getAll === TYPEOF.FUNCTION) {
    return (cache.getAll(TABLES.NODES) || []).length > NUM.ZERO;
  }
  if (typeof cache.filter === TYPEOF.FUNCTION) {
    return (cache.filter(TABLES.NODES, () => true) || []).length > NUM.ZERO;
  }
  return false;
}

function isReadyNode(cache, nodeId) {
  if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
    return false;
  }
  if (!hasNodeReadinessRows(cache)) {
    return true;
  }
  if (typeof cache?.getReadyNodes === TYPEOF.FUNCTION) {
    const readyNodes = cache.getReadyNodes();
    if (Array.isArray(readyNodes)) {
      return readyNodes.includes(nodeId);
    }
  }

  const nodeRow = findRow(cache, TABLES.NODES, (row) => {
    return row?.[COLUMN.NODE_ID] === nodeId;
  });
  if (!nodeRow) {
    return false;
  }

  const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
  return nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY &&
    Number.isFinite(readyLeaseExpiresAt) &&
    readyLeaseExpiresAt > Date.now();
}

function getActiveMessageGroupServiceCandidates(cache, groupId) {
  return filterRows(cache, TABLES.SERVICES, (row) => {
    return row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row?.[COLUMN.GROUP_ID] === groupId &&
      row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      isReadyNode(cache, row?.[COLUMN.NODE_ID]) &&
      typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      row[COLUMN.ADDRESS].length > NUM.ZERO;
  });
}

function preferConnectedCandidates(candidates, options = {}) {
  const isConnectedNode = typeof options.isConnectedNode === TYPEOF.FUNCTION ?
    options.isConnectedNode :
    null;
  if (!isConnectedNode) {
    return candidates;
  }

  const connectedCandidates = candidates.filter((row) => {
    return isConnectedNode(row?.[COLUMN.NODE_ID]) === true;
  });
  return connectedCandidates.length > NUM.ZERO ?
    connectedCandidates :
    candidates;
}

function isExcludedCandidate(row, options = {}) {
  const excludeServiceId = options.excludeServiceId || null;
  const excludeNodeId = options.excludeNodeId || null;
  return Boolean(
    (excludeServiceId && row?.[COLUMN.SERVICE_ID] === excludeServiceId) ||
    (excludeNodeId && row?.[COLUMN.NODE_ID] === excludeNodeId),
  );
}

function findExplicitLeaderCandidate(candidates, options = {}) {
  return candidates.find((row) => {
    return row?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      !isExcludedCandidate(row, options);
  }) || null;
}

function getCanonicalLeaderNodeId(cache, groupId) {
  const groupRow = findRow(cache, TABLES.MESSAGE_GROUPS, (row) => {
    return row?.[COLUMN.GROUP_ID] === groupId;
  });
  const leaderNodeId = groupRow?.[COLUMN.LEADER_NODE_ID];
  return typeof leaderNodeId === TYPEOF.STRING &&
    leaderNodeId.length > NUM.ZERO ?
    leaderNodeId :
    null;
}

function resolveCanonicalLeaderServiceCandidate(
  cache,
  groupId,
  candidates,
  options = {},
) {
  const leaderNodeId = getCanonicalLeaderNodeId(cache, groupId);

  if (!leaderNodeId) {
    return null;
  }

  const matchingCandidates = candidates.filter((row) => {
    return row?.[COLUMN.NODE_ID] === leaderNodeId &&
      !isExcludedCandidate(row, options);
  });

  if (matchingCandidates.length === NUM.ZERO) {
    return null;
  }

  const canonicalExplicitLeader = findExplicitLeaderCandidate(
    matchingCandidates,
    options,
  );
  if (canonicalExplicitLeader) {
    return canonicalExplicitLeader;
  }

  const explicitLeader = findExplicitLeaderCandidate(candidates, options);
  if (explicitLeader &&
    explicitLeader?.[COLUMN.NODE_ID] !== leaderNodeId) {
    return null;
  }

  if (matchingCandidates.length === NUM.ONE) {
    return matchingCandidates[NUM.ZERO];
  }

  return null;
}

function resolveMessageGroupLeaderServiceFromCache(cache, groupId, options = {}) {
  const candidates = preferConnectedCandidates(
    getActiveMessageGroupServiceCandidates(cache, groupId),
    options,
  );
  const leaderNodeId = getCanonicalLeaderNodeId(cache, groupId);
  const canonicalLeader = resolveCanonicalLeaderServiceCandidate(
    cache,
    groupId,
    candidates,
    options,
  );

  if (canonicalLeader) {
    return canonicalLeader;
  }

  const explicitLeader = findExplicitLeaderCandidate(candidates, options);

  if (explicitLeader) {
    return explicitLeader;
  }

  if (leaderNodeId) {
    return null;
  }

  return null;
}

function resolveMessageGroupForwardServiceFromCache(cache, groupId, options = {}) {
  const candidates = preferConnectedCandidates(
    getActiveMessageGroupServiceCandidates(cache, groupId),
    options,
  )
    .filter((row) => {
      return !isExcludedCandidate(row, options);
    });

  if (candidates.length === NUM.ZERO) {
    return null;
  }

  const canonicalLeader = resolveCanonicalLeaderServiceCandidate(
    cache,
    groupId,
    candidates,
    options,
  );
  if (canonicalLeader) {
    return canonicalLeader;
  }

  const sorted = [...candidates].sort((left, right) => {
    const leftLeader = left?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    const rightLeader = right?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    if (leftLeader && !rightLeader) {
      return NUM.NEGATIVE_ONE;
    }
    if (!leftLeader && rightLeader) {
      return NUM.ONE;
    }

    const leftUpdatedAt = Number(left?.[COLUMN.UPDATED_AT]);
    const rightUpdatedAt = Number(right?.[COLUMN.UPDATED_AT]);
    const leftHasUpdatedAt = Number.isFinite(leftUpdatedAt);
    const rightHasUpdatedAt = Number.isFinite(rightUpdatedAt);
    if (leftHasUpdatedAt && rightHasUpdatedAt && leftUpdatedAt !== rightUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }
    if (leftHasUpdatedAt && !rightHasUpdatedAt) {
      return NUM.NEGATIVE_ONE;
    }
    if (!leftHasUpdatedAt && rightHasUpdatedAt) {
      return NUM.ONE;
    }

    const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
    const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
    return leftServiceId.localeCompare(rightServiceId);
  });

  return sorted[NUM.ZERO] || null;
}

function resolveMessageGroupTargetAddressFromCache(cache, groupId, options = {}) {
  const seedNodeId = options.seedNodeId || null;
  const isConnectedNode = typeof options.isConnectedNode === TYPEOF.FUNCTION ?
    options.isConnectedNode :
    () => true;
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId);

  if (candidates.length === NUM.ZERO) {
    return null;
  }

  const preferredLeader = resolveMessageGroupLeaderServiceFromCache(
    cache,
    groupId,
    options,
  );
  if (preferredLeader &&
      isConnectedNode(preferredLeader[COLUMN.NODE_ID])) {
    return preferredLeader[COLUMN.ADDRESS];
  }

  const preferredSeedConnected = candidates.find((row) => {
    return (!!seedNodeId && row[COLUMN.NODE_ID] === seedNodeId) &&
      !isExcludedCandidate(row, options) &&
      isConnectedNode(row[COLUMN.NODE_ID]);
  });
  if (preferredSeedConnected) {
    return preferredSeedConnected[COLUMN.ADDRESS];
  }

  const anyConnected = candidates.find((row) => {
    return !isExcludedCandidate(row, options) &&
      isConnectedNode(row[COLUMN.NODE_ID]);
  });
  if (anyConnected) {
    return anyConnected[COLUMN.ADDRESS];
  }

  return null;
}

export {
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
  resolveMessageGroupTargetAddressFromCache,
};
