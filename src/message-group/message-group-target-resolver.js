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

function getActiveMessageGroupServiceCandidates(cache, groupId) {
  return filterRows(cache, TABLES.SERVICES, (row) => {
    return row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row?.[COLUMN.GROUP_ID] === groupId &&
      row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
      typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      row[COLUMN.ADDRESS].length > NUM.ZERO;
  });
}

function resolveMessageGroupLeaderServiceFromCache(cache, groupId, options = {}) {
  const excludeServiceId = options.excludeServiceId || null;
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId);
  return candidates.find((row) => {
    return row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      (!excludeServiceId || row[COLUMN.SERVICE_ID] !== excludeServiceId);
  }) || null;
}

function resolveMessageGroupForwardServiceFromCache(cache, groupId, options = {}) {
  const excludeServiceId = options.excludeServiceId || null;
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId)
    .filter((row) => {
      return !excludeServiceId || row[COLUMN.SERVICE_ID] !== excludeServiceId;
    });

  if (candidates.length === NUM.ZERO) {
    return null;
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
  const excludeServiceId = options.excludeServiceId || null;
  const seedNodeId = options.seedNodeId || null;
  const isConnectedNode = typeof options.isConnectedNode === TYPEOF.FUNCTION ?
    options.isConnectedNode :
    () => true;
  const candidates = getActiveMessageGroupServiceCandidates(cache, groupId);

  if (candidates.length === NUM.ZERO) {
    return null;
  }

  const preferredConnected = candidates.find((row) => {
    return row[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      (!excludeServiceId || row[COLUMN.SERVICE_ID] !== excludeServiceId) &&
      isConnectedNode(row[COLUMN.NODE_ID]);
  });
  if (preferredConnected) {
    return preferredConnected[COLUMN.ADDRESS];
  }

  const preferredSeedConnected = candidates.find((row) => {
    return (!!seedNodeId && row[COLUMN.NODE_ID] === seedNodeId) &&
      (!excludeServiceId || row[COLUMN.SERVICE_ID] !== excludeServiceId) &&
      isConnectedNode(row[COLUMN.NODE_ID]);
  });
  if (preferredSeedConnected) {
    return preferredSeedConnected[COLUMN.ADDRESS];
  }

  const anyConnected = candidates.find((row) => {
    return (!excludeServiceId || row[COLUMN.SERVICE_ID] !== excludeServiceId) &&
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
