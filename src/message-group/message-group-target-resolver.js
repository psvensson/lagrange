import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
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

function getActiveMessageGroupServiceCandidates(cache, groupId) {
  return filterRows(cache, TABLES.SERVICES, (row) => {
    return row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row?.[COLUMN.GROUP_ID] === groupId &&
      row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      row[COLUMN.ADDRESS].length > NUM.ZERO;
  });
}

function isExcludedCandidate(row, options = {}) {
  const excludeServiceId = options.excludeServiceId || null;
  const excludeNodeId = options.excludeNodeId || null;
  return Boolean(
    (excludeServiceId && row?.[COLUMN.SERVICE_ID] === excludeServiceId) ||
    (excludeNodeId && row?.[COLUMN.NODE_ID] === excludeNodeId),
  );
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

  return candidates.find((row) => {
    return row?.[COLUMN.NODE_ID] === leaderNodeId &&
      !isExcludedCandidate(row, options);
  }) || null;
}

function resolveMessageGroupLeaderServiceFromCache(cache, groupId, options = {}) {
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId);
  const canonicalLeader = resolveCanonicalLeaderServiceCandidate(
    cache,
    groupId,
    candidates,
    options,
  );

  if (canonicalLeader) {
    return canonicalLeader;
  }

  if (getCanonicalLeaderNodeId(cache, groupId)) {
    return null;
  }

  return candidates.find((row) => {
    return row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      !isExcludedCandidate(row, options);
  }) || null;
}

function resolveMessageGroupForwardServiceFromCache(cache, groupId, options = {}) {
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId)
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
