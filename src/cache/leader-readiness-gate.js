import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';

const DEFAULT_OPTIONS = Object.freeze({
  requireLeaderNodeId: false,
});
const OWNER_TABLE_BY_SERVICE_TYPE = Object.freeze({
  [SERVICE_TYPE.PARTITION]: TABLES.PARTITIONS,
  [SERVICE_TYPE.MESSAGE_GROUP]: TABLES.MESSAGE_GROUPS,
});
const ID_COLUMN_BY_SERVICE_TYPE = Object.freeze({
  [SERVICE_TYPE.PARTITION]: COLUMN.PARTITION_ID,
  [SERVICE_TYPE.MESSAGE_GROUP]: COLUMN.GROUP_ID,
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

const getOwnerTableName = (serviceType) =>
  OWNER_TABLE_BY_SERVICE_TYPE[serviceType] || null;

const getOwnerIdColumn = (serviceType) =>
  ID_COLUMN_BY_SERVICE_TYPE[serviceType] || null;

const getOwnerRecords = (cache, serviceType) => {
  const ownerTableName = getOwnerTableName(serviceType);
  if (!ownerTableName) {
    return [];
  }
  return getAllRecords(cache, ownerTableName);
};

const getOwnerRecord = (cache, serviceType, entityId) => {
  const idColumn = getOwnerIdColumn(serviceType);
  if (!idColumn || !entityId) {
    return null;
  }
  const ownerTableName = getOwnerTableName(serviceType);
  if (!ownerTableName) {
    return null;
  }
  if (isFunction(cache?.get)) {
    const record = cache.get(ownerTableName, entityId) || null;
    if (record) {
      return record;
    }
  }
  const records = getOwnerRecords(cache, serviceType);
  return records.find((record) => record?.[idColumn] === entityId) || null;
};

const findCanonicalLeaderService = (
    services,
    serviceType,
    entityId,
    leaderNodeId,
    options = {},
) => {
  if (!leaderNodeId) {
    return null;
  }
  const idColumn = getOwnerIdColumn(serviceType);
  const requireAddress = options.requireAddress === true;
  return services.find((service) =>
    service?.[COLUMN.SERVICE_TYPE] === serviceType &&
    service?.[idColumn] === entityId &&
    service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
    service?.[COLUMN.NODE_ID] === leaderNodeId &&
    (!requireAddress || Boolean(service?.[COLUMN.ADDRESS])),
  ) || null;
};

const resolveCanonicalLeaderService = (
    cache,
    serviceType,
    entityId,
    options = {},
) => {
  if (!cache || !serviceType || !entityId) {
    return {
      ownerRecord: null,
      leaderNodeId: null,
      leaderService: null,
    };
  }
  const ownerRecord = getOwnerRecord(cache, serviceType, entityId);
  const leaderNodeId = ownerRecord?.[COLUMN.LEADER_NODE_ID] || null;
  const services = getAllRecords(cache, TABLES.SERVICES);
  return {
    ownerRecord,
    leaderNodeId,
    leaderService: findCanonicalLeaderService(
      services,
      serviceType,
      entityId,
      leaderNodeId,
      options,
    ),
  };
};

/**
 * Check if a partition has any leader service (even without address).
 * Used for self-referential checks where the services partition needs
 * to write to itself - we can't require address in that case.
 * @param {Object} cache - System table cache.
 * @param {string} partitionId - Partition ID.
 * @return {boolean} True if leader exists.
 */
const hasCanonicalPartitionLeaderService = (cache, partitionId, options = {}) =>
  Boolean(resolveCanonicalLeaderService(
    cache,
    SERVICE_TYPE.PARTITION,
    partitionId,
    options,
  ).leaderService);

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
    return hasCanonicalPartitionLeaderService(systemTableCache, partitionId);
  }
  return hasCanonicalPartitionLeaderService(systemTableCache, partitionId, {
    requireAddress: true,
  });
};

const getMissingSystemServiceLeaders = (systemTableCache, options = {}) => {
  const config = {...DEFAULT_OPTIONS, ...options};
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
    const {
      leaderNodeId,
      leaderService,
    } = resolveCanonicalLeaderService(
      systemTableCache,
      SERVICE_TYPE.PARTITION,
      partitionId,
      {requireAddress: false},
    );

    if (!leaderService) {
      missingPartitionLeaders.push(partitionId);
    } else {
      if (!leaderService[COLUMN.ADDRESS]) {
        missingPartitionLeaderAddresses.push(partitionId);
      }
      if (!leaderNodeId) {
        missingPartitionLeaderNodes.push(partitionId);
      }
    }

    if (!leaderService && config.requireLeaderNodeId && !hasLeaderNodeId(partition)) {
      if (!missingPartitionLeaderNodes.includes(partitionId)) {
        missingPartitionLeaderNodes.push(partitionId);
      }
    }
    if (leaderService && config.requireLeaderNodeId && !hasLeaderNodeId(partition)) {
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
    const {
      leaderNodeId,
      leaderService,
    } = resolveCanonicalLeaderService(
      systemTableCache,
      SERVICE_TYPE.MESSAGE_GROUP,
      groupId,
      {requireAddress: false},
    );

    if (!leaderService) {
      missingMessageGroupLeaders.push(groupId);
    } else {
      if (!leaderService[COLUMN.ADDRESS]) {
        missingMessageGroupLeaderAddresses.push(groupId);
      }
      if (!leaderNodeId) {
        missingMessageGroupLeaderNodes.push(groupId);
      }
    }

    if (!leaderService && config.requireLeaderNodeId && !hasLeaderNodeId(group)) {
      if (!missingMessageGroupLeaderNodes.includes(groupId)) {
        missingMessageGroupLeaderNodes.push(groupId);
      }
    }
    if (leaderService && config.requireLeaderNodeId && !hasLeaderNodeId(group)) {
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

const getBlockingSystemServiceLeaders = (
    systemTableCache,
    requiredTables = [],
    options = {},
) => {
  const isTableWriteSatisfied =
    typeof options.isTableWriteSatisfied === TYPEOF.FUNCTION ?
      options.isTableWriteSatisfied :
      isSystemTableWriteReady;
  const missing = getMissingSystemServiceLeaders(systemTableCache, {
    requireLeaderNodeId: options.requireLeaderNodeId === true,
  });
  const missingPartitionLeaders = [];
  const missingPartitionLeaderNodes = [];
  const missingPartitionLeaderAddresses = [];
  const missingRequiredTables = [];

  for (const tableName of requiredTables) {
    const partitionId = getSystemPartitionId(tableName);
    if (!partitionId || !hasPartitionRecord(systemTableCache, partitionId)) {
      continue;
    }

    if (isTableWriteSatisfied(systemTableCache, tableName)) {
      continue;
    }

    missingRequiredTables.push(tableName);
    missingPartitionLeaders.push(partitionId);

    if (missing.missingPartitionLeaderNodes.includes(partitionId)) {
      missingPartitionLeaderNodes.push(partitionId);
    }
    if (missing.missingPartitionLeaderAddresses.includes(partitionId)) {
      missingPartitionLeaderAddresses.push(partitionId);
    }
  }

  return {
    ...missing,
    missingPartitionLeaders,
    missingPartitionLeaderNodes,
    missingPartitionLeaderAddresses,
    missingMessageGroupLeaders: [],
    missingMessageGroupLeaderNodes: [],
    missingMessageGroupLeaderAddresses: [],
    missingRequiredTables,
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
  getBlockingSystemServiceLeaders,
  getOwnerRecords,
  getOwnerRecord,
  getMissingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
  isSystemTableWriteReady,
  resolveCanonicalLeaderService,
};
