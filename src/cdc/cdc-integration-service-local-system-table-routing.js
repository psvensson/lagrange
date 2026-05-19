import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  CDC_INTEGRATION_SERVICE_LITERAL,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  NUM,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  VALID_SYSTEM_TABLES,
} = CDC_INTEGRATION_SERVICE_SHARED;

function resolvePartitionRowsFromCache(cache, tableName) {
  const partitionPredicate = (row) => {
    const rowTableName = row?.table_name ?? row?.tableName ?? null;
    const rowTableId = row?.table_id ?? row?.tableId ?? null;
    return rowTableName === tableName || rowTableId === tableName;
  };
  return typeof cache.filter === TYPEOF.FUNCTION ?
    cache.filter(SYSTEM_TABLE_NAME.PARTITIONS, partitionPredicate) :
    typeof cache.getAll === TYPEOF.FUNCTION ?
      (cache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || []).filter(partitionPredicate) :
      [];
}

function resolveServicesForPartition(partitionServices, partitionId) {
  if (!(partitionServices instanceof Map) || !partitionId) {
    return [];
  }

  const matches = [];
  const seenServices = new Set();
  const directMatch = partitionServices.get(partitionId) || null;
  if (directMatch && !seenServices.has(directMatch)) {
    matches.push(directMatch);
    seenServices.add(directMatch);
  }

  for (const partitionService of partitionServices.values()) {
    if (
      !partitionService ||
      partitionService.partitionId !== partitionId ||
      seenServices.has(partitionService)
    ) {
      continue;
    }
    matches.push(partitionService);
    seenServices.add(partitionService);
  }

  return matches;
}

function isUsablePartitionService(partitionService) {
  if (!partitionService) {
    return false;
  }
  if (partitionService.initialized === false) {
    return false;
  }
  return (
    typeof partitionService.executeQuery === TYPEOF.FUNCTION ||
    typeof partitionService.executeLocalQuery === TYPEOF.FUNCTION ||
    typeof partitionService?.db?.prepare === TYPEOF.FUNCTION
  );
}

function resolveLeaderRole(partitionService) {
  if (!isUsablePartitionService(partitionService)) {
    return false;
  }
  if (partitionService.isLeader === true) {
    return true;
  }
  if (
    typeof partitionService.isLeaderReplica === TYPEOF.FUNCTION &&
    partitionService.isLeaderReplica() === true
  ) {
    return true;
  }
  const role = String(
    (typeof partitionService.getRole === TYPEOF.FUNCTION ?
      partitionService.getRole() :
      null) ||
      partitionService.role ||
      partitionService.raftRole ||
      '',
  ).toLowerCase();
  if (role === CDC_INTEGRATION_SERVICE_LITERAL.LEADER) {
    return true;
  }
  const leaderId =
    typeof partitionService.getLeaderId === TYPEOF.FUNCTION ?
      partitionService.getLeaderId() :
      partitionService.leaderId;
  const replicaId = partitionService.replicaId || partitionService.replica_id;
  return (
    typeof leaderId === TYPEOF.STRING &&
    typeof replicaId === TYPEOF.STRING &&
    leaderId.length > NUM.ZERO &&
    leaderId === replicaId
  );
}

function resolvePartitionServicesForSegment(service) {
  if (service.bootstrapMode && service.localPartitionServices instanceof Map) {
    return service.localPartitionServices;
  }
  if (typeof service.partitionServicesProvider === TYPEOF.FUNCTION) {
    const provided = service.partitionServicesProvider();
    return provided instanceof Map ? provided : null;
  }
  return null;
}

function resolveSystemTablePartitionIdsForSegment(service, tableName) {
  const cache = service.systemTableCache;
  if (!cache) {
    return INITIAL_PARTITION_IDS[tableName] ?
      [INITIAL_PARTITION_IDS[tableName]] :
      [];
  }

  const partitionRows = resolvePartitionRowsFromCache(cache, tableName);
  const resolvedPartitionIds = [
    ...new Set(
      partitionRows
        .map((row) => row?.partition_id ?? row?.partitionId ?? row?.id ?? null)
        .filter(Boolean),
    ),
  ];

  if (resolvedPartitionIds.length > NUM.ZERO) {
    return resolvedPartitionIds;
  }

  return INITIAL_PARTITION_IDS[tableName] ?
    [INITIAL_PARTITION_IDS[tableName]] :
    [];
}

function resolvePartitionServicesForTable(service, tableName, options = {}) {
  const partitionServices = resolvePartitionServicesForSegment(service);
  if (!(partitionServices instanceof Map)) {
    return [];
  }

  const consistency =
    options.consistency ||
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA;

  const matches = [];
  const seenServices = new Set();
  const partitionIds = resolveSystemTablePartitionIdsForSegment(
    service,
    tableName,
  );

  for (const partitionId of partitionIds) {
    const candidates = resolveServicesForPartition(
      partitionServices,
      partitionId,
    );

    for (const partitionService of candidates) {
      if (!isUsablePartitionService(partitionService) || seenServices.has(partitionService)) {
        continue;
      }
      if (
        consistency === LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER &&
        !resolveLeaderRole(partitionService)
      ) {
        continue;
      }
      matches.push(partitionService);
      seenServices.add(partitionService);
    }
  }

  matches.sort((left, right) => {
    return (
      Number(resolveLeaderRole(right)) -
      Number(resolveLeaderRole(left))
    );
  });

  return matches;
}

function executeSystemTableRead(partitionService, sql, params = []) {
  if (typeof partitionService?.executeLocalQuery === TYPEOF.FUNCTION) {
    return partitionService.executeLocalQuery(sql, params);
  }
  if (typeof partitionService?.db?.prepare === TYPEOF.FUNCTION) {
    const stmt = partitionService.db.prepare(sql);
    return {
      success: true,
      rows: stmt.all(...params),
    };
  }
  if (typeof partitionService?.executeQuery === TYPEOF.FUNCTION) {
    return partitionService.executeQuery(sql, params);
  }
  return {
    success: false,
    error: CDC_INTEGRATION_SERVICE_LITERAL.LOCAL_PARTITION_QUERY_UNAVAILABLE,
    rows: [],
  };
}

function canWriteLocally(service, tableName) {
  if (!tableName || !VALID_SYSTEM_TABLES.includes(tableName)) {
    return false;
  }
  const localLeaders = resolvePartitionServicesForTable(service, tableName, {
    consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  });
  return localLeaders.length > NUM.ZERO;
}

export function resolvePartitionServices(service) {
  return resolvePartitionServicesForSegment(service);
}

export function resolveSystemTablePartitionIds(service, tableName) {
  return resolveSystemTablePartitionIdsForSegment(service, tableName);
}

export function resolveLocalPartitionServicesForPartition(partitionServices, partitionId) {
  return resolveServicesForPartition(partitionServices, partitionId);
}

export function isLocalPartitionServiceUsable(partitionService) {
  return isUsablePartitionService(partitionService);
}

export function isLocalPartitionServiceLeader(partitionService) {
  return resolveLeaderRole(partitionService);
}

export function resolveLocalSystemTableServices(service, tableName, options = {}) {
  return resolvePartitionServicesForTable(service, tableName, options);
}

export function canWriteSystemTableLocally(service, tableName) {
  return canWriteLocally(service, tableName);
}

export async function executeLocalSystemTableRead(service, partitionService, sql, params = []) {
  return executeSystemTableRead(partitionService, sql, params);
}
