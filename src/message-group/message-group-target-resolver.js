import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

function filterRows(cache, tableName, predicate) {
  if (!cache) {
    return [];
  }
  if (typeof cache.filter === 'function') {
    return cache.filter(tableName, predicate) || [];
  }
  if (typeof cache.getAll === 'function') {
    return (cache.getAll(tableName) || []).filter(predicate);
  }
  return [];
}

function findRow(cache, tableName, predicate) {
  return filterRows(cache, tableName, predicate)[0] || null;
}

function hasNodeReadinessRows(cache) {
  if (!cache) {
    return false;
  }
  if (typeof cache.getAll === 'function') {
    return (cache.getAll(TABLES.NODES) || []).length > 0;
  }
  if (typeof cache.filter === 'function') {
    return (cache.filter(TABLES.NODES, () => true) || []).length > 0;
  }
  return false;
}

function isReadyNode(cache, nodeId) {
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return false;
  }
  if (!hasNodeReadinessRows(cache)) {
    return true;
  }
  if (typeof cache?.getReadyNodes === 'function') {
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

function getMessageGroupServiceCandidates(cache, groupId, options = {}) {
  const requireReadyNode = options.requireReadyNode !== false;
  const allowStoppedService = options.allowStoppedService === true;
  return filterRows(cache, TABLES.SERVICES, (row) => {
    const status = row?.[COLUMN.STATUS];
    const hasEligibleStatus = status === SERVICE_STATUS.ACTIVE ||
      (allowStoppedService && status === SERVICE_STATUS.STOPPED);
    return row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row?.[COLUMN.GROUP_ID] === groupId &&
      hasEligibleStatus &&
      (!requireReadyNode || isReadyNode(cache, row?.[COLUMN.NODE_ID])) &&
      typeof row?.[COLUMN.ADDRESS] === 'string' &&
      row[COLUMN.ADDRESS].length > 0;
  });
}

function preferConnectedCandidates(candidates, options = {}) {
  if (options.preferConnectedCandidates === false) {
    return candidates;
  }
  const isConnectedNode = typeof options.isConnectedNode === 'function' ?
    options.isConnectedNode :
    null;
  if (!isConnectedNode) {
    return candidates;
  }

  const connectedCandidates = candidates.filter((row) => {
    return isConnectedNode(row?.[COLUMN.NODE_ID]) === true;
  });
  return connectedCandidates.length > 0 ?
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
  return typeof leaderNodeId === 'string' &&
    leaderNodeId.length > 0 ?
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

  if (matchingCandidates.length === 0) {
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

  if (matchingCandidates.length === 1) {
    return matchingCandidates[0];
  }

  return null;
}

function resolveMessageGroupLeaderServiceFromCache(cache, groupId, options = {}) {
  const candidates = preferConnectedCandidates(
    getMessageGroupServiceCandidates(cache, groupId, options),
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

function sortMessageGroupForwardServiceCandidates(candidates = []) {
  return [...candidates].sort((left, right) => {
    const leftLeader = left?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    const rightLeader = right?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    if (leftLeader && !rightLeader) {
      return -1;
    }
    if (!leftLeader && rightLeader) {
      return 1;
    }

    const leftUpdatedAt = Number(left?.[COLUMN.UPDATED_AT]);
    const rightUpdatedAt = Number(right?.[COLUMN.UPDATED_AT]);
    const leftHasUpdatedAt = Number.isFinite(leftUpdatedAt);
    const rightHasUpdatedAt = Number.isFinite(rightUpdatedAt);
    if (leftHasUpdatedAt && rightHasUpdatedAt && leftUpdatedAt !== rightUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }
    if (leftHasUpdatedAt && !rightHasUpdatedAt) {
      return -1;
    }
    if (!leftHasUpdatedAt && rightHasUpdatedAt) {
      return 1;
    }

    const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
    const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
    return leftServiceId.localeCompare(rightServiceId);
  });
}

function resolveMessageGroupForwardServiceCandidatesFromCache(
  cache,
  groupId,
  options = {},
) {
  const candidates = preferConnectedCandidates(
    getMessageGroupServiceCandidates(cache, groupId, options),
    options,
  ).filter((row) => {
    return !isExcludedCandidate(row, options);
  });

  if (candidates.length === 0) {
    return [];
  }

  const canonicalLeader = resolveCanonicalLeaderServiceCandidate(
    cache,
    groupId,
    candidates,
    options,
  );
  if (!canonicalLeader) {
    return sortMessageGroupForwardServiceCandidates(candidates);
  }

  const remainingCandidates = candidates.filter((row) => row !== canonicalLeader);
  return [
    canonicalLeader,
    ...sortMessageGroupForwardServiceCandidates(remainingCandidates),
  ];
}

function resolveMessageGroupForwardServiceFromCache(cache, groupId, options = {}) {
  return resolveMessageGroupForwardServiceCandidatesFromCache(
    cache,
    groupId,
    options,
  )[0] || null;
}

function resolveMessageGroupTargetAddressFromCache(cache, groupId, options = {}) {
  const seedNodeId = options.seedNodeId || null;
  const isConnectedNode = typeof options.isConnectedNode === 'function' ?
    options.isConnectedNode :
    () => true;
  const candidates = getMessageGroupServiceCandidates(
    cache,
    groupId,
    options,
  );

  if (candidates.length === 0) {
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
  resolveMessageGroupForwardServiceCandidatesFromCache,
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
  resolveMessageGroupTargetAddressFromCache,
};
