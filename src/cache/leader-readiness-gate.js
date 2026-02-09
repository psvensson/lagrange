import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';

const DEFAULT_OPTIONS = Object.freeze({
  requireLeaderNodeId: false,
});

const isFunction = (value) => typeof value === TYPEOF.FUNCTION;

const getAllRecords = (cache, tableName) => {
  if (!cache) {
    return [];
  }
  if (isFunction(cache.getAll)) {
    return cache.getAll(tableName) || [];
  }
  if (isFunction(cache.filter)) {
    return cache.filter(tableName, (_record) => true) || [];
  }
  return [];
};

const filterRecords = (cache, tableName, predicate) => {
  if (!cache) {
    return [];
  }
  if (isFunction(cache.filter)) {
    return cache.filter(tableName, predicate) || [];
  }
  if (isFunction(cache.getAll)) {
    const records = cache.getAll(tableName) || [];
    return records.filter(predicate);
  }
  return [];
};

const hasPartitionRecord = (cache, partitionId) => {
  const partitions = filterRecords(cache, TABLES.PARTITIONS, (partition) =>
    partition[COLUMN.PARTITION_ID] === partitionId,
  );
  return partitions.length > NUM.ZERO;
};

const hasPartitionLeaderService = (cache, partitionId) => {
  const leaders = filterRecords(cache, TABLES.SERVICES, (service) =>
    service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    service[COLUMN.PARTITION_ID] === partitionId &&
    service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
    service[COLUMN.STATUS] === STATE.ACTIVE &&
    Boolean(service[COLUMN.ADDRESS]),
  );
  return leaders.length > NUM.ZERO;
};

/**
 * Check if a partition has any leader service (even without address).
 * Used for self-referential checks where the services partition needs
 * to write to itself - we can't require address in that case.
 * @param {Object} cache - System table cache.
 * @param {string} partitionId - Partition ID.
 * @return {boolean} True if leader exists.
 */
const hasPartitionLeaderServiceWithoutAddress = (cache, partitionId) => {
  const leaders = filterRecords(cache, TABLES.SERVICES, (service) =>
    service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    service[COLUMN.PARTITION_ID] === partitionId &&
    service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
    service[COLUMN.STATUS] === STATE.ACTIVE,
  );
  return leaders.length > NUM.ZERO;
};

const hasLeaderNodeId = (record) => Boolean(record && record[COLUMN.LEADER_NODE_ID]);

const getSystemPartitionId = (tableName) => INITIAL_PARTITION_IDS[tableName] || null;

/**
 * Check if a system table is ready for writes.
 * For the services table itself, we use a relaxed check that doesn't require
 * the leader to have an address (since the address is what we're trying to write).
 * @param {Object} systemTableCache - System table cache.
 * @param {string} tableName - Table name.
 * @return {boolean} True if ready for writes.
 */
const isSystemTableWriteReady = (systemTableCache, tableName) => {
  if (!systemTableCache) {
    return false;
  }
  const partitionId = getSystemPartitionId(tableName);
  if (!partitionId) {
    return false;
  }
  if (!hasPartitionRecord(systemTableCache, partitionId)) {
    return false;
  }
  // For the services table, use relaxed check without requiring address
  // This avoids circular dependency where services-p1 leader can't write
  // its own address because it doesn't have an address yet
  if (tableName === TABLES.SERVICES) {
    return hasPartitionLeaderServiceWithoutAddress(systemTableCache, partitionId);
  }
  return hasPartitionLeaderService(systemTableCache, partitionId);
};

const getMissingSystemServiceLeaders = (systemTableCache, options = {}) => {
  const config = {...DEFAULT_OPTIONS, ...options};
  const services = getAllRecords(systemTableCache, TABLES.SERVICES);
  const partitions = getAllRecords(systemTableCache, TABLES.PARTITIONS);
  const messageGroups = getAllRecords(systemTableCache, TABLES.MESSAGE_GROUPS);

  const missingPartitionLeaders = [];
  const missingMessageGroupLeaders = [];
  const missingPartitionLeaderNodes = [];
  const missingMessageGroupLeaderNodes = [];
  const missingPartitionLeaderAddresses = [];
  const missingMessageGroupLeaderAddresses = [];

  for (const partition of partitions) {
    const partitionId = partition[COLUMN.PARTITION_ID];
    if (!partitionId) {
      continue;
    }

    // Find leader service for this partition
    const leaderService = services.find((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.PARTITION_ID] === partitionId &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === STATE.ACTIVE,
    );

    if (!leaderService) {
      missingPartitionLeaders.push(partitionId);
    } else {
      // Leader exists - check if it has required fields for routing
      // A leader without an address or node_id is useless for query routing
      if (!leaderService[COLUMN.ADDRESS]) {
        missingPartitionLeaderAddresses.push(partitionId);
      }
      if (!leaderService[COLUMN.NODE_ID]) {
        missingPartitionLeaderNodes.push(partitionId);
      }
    }

    if (config.requireLeaderNodeId && !hasLeaderNodeId(partition)) {
      // Also check partition table's leader_node_id if required
      if (!missingPartitionLeaderNodes.includes(partitionId)) {
        missingPartitionLeaderNodes.push(partitionId);
      }
    }
  }

  for (const group of messageGroups) {
    const groupId = group[COLUMN.GROUP_ID];
    if (!groupId) {
      continue;
    }

    // Find leader service for this message group
    const leaderService = services.find((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      service[COLUMN.GROUP_ID] === groupId &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === STATE.ACTIVE,
    );

    if (!leaderService) {
      missingMessageGroupLeaders.push(groupId);
    } else {
      // Leader exists - check if it has required fields for routing
      if (!leaderService[COLUMN.ADDRESS]) {
        missingMessageGroupLeaderAddresses.push(groupId);
      }
      if (!leaderService[COLUMN.NODE_ID]) {
        missingMessageGroupLeaderNodes.push(groupId);
      }
    }

    if (config.requireLeaderNodeId && !hasLeaderNodeId(group)) {
      // Also check message_groups table's leader_node_id if required
      if (!missingMessageGroupLeaderNodes.includes(groupId)) {
        missingMessageGroupLeaderNodes.push(groupId);
      }
    }
  }

  return {
    missingPartitionLeaders,
    missingMessageGroupLeaders,
    missingPartitionLeaderNodes,
    missingMessageGroupLeaderNodes,
    missingPartitionLeaderAddresses,
    missingMessageGroupLeaderAddresses,
  };
};

const getMissingSystemServiceLeaderCount = (missing = {}) =>
  (missing.missingPartitionLeaders?.length || NUM.ZERO) +
  (missing.missingMessageGroupLeaders?.length || NUM.ZERO) +
  (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) +
  (missing.missingMessageGroupLeaderNodes?.length || NUM.ZERO) +
  (missing.missingPartitionLeaderAddresses?.length || NUM.ZERO) +
  (missing.missingMessageGroupLeaderAddresses?.length || NUM.ZERO);

export {
  getMissingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
  isSystemTableWriteReady,
};
