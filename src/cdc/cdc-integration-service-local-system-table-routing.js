import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {issueAuthoritativeReadStage} from './cdc-terminal-gate.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {readAdmittedPartitionRows} from
  '../partition/partition-statement-admission.js';

const {
  CDC_INTEGRATION_SERVICE_LITERAL,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  SYSTEM_TABLE_NAME,
  VALID_SYSTEM_TABLES,
} = CDC_INTEGRATION_SERVICE_SHARED;

const LOCAL_AUTHORITATIVE_OBSERVATION_SCOPE = 'complete_table';
const ABSENT_WITNESS_VALUE = null;
const ABSENT_OBSERVATION_VALUE = null;

function isPlainWitnessObject(candidate) {
  return Boolean(
    candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate),
  );
}

function hasValidCommittedWitnessIndices(witness) {
  return Number.isSafeInteger(witness?.term) &&
    witness.term >= 1 &&
    Number.isSafeInteger(witness?.appliedIndex) &&
    witness.appliedIndex >= 0 &&
    Number.isSafeInteger(witness?.commitIndex) &&
    witness.commitIndex >= 0;
}

function isUsableLocalLeaderWitness(witness, partitionId) {
  return isPlainWitnessObject(witness) &&
    typeof partitionId === 'string' &&
    partitionId.length > 0 &&
    isValidLeaderReadAuthorityWitness(witness, partitionId) &&
    hasValidCommittedWitnessIndices(witness);
}

export function selectLocalPartitionWitness(
  _service,
  partitionService,
  result,
) {
  const partitionId = partitionService?.partitionId || null;
  if (isUsableLocalLeaderWitness(result?.readAuthorityWitness, partitionId)) {
    return Object.freeze({...result.readAuthorityWitness});
  }
  if (typeof partitionService?.buildRemoteReadAuthorityWitness === 'function') {
    const builtWitness = partitionService.buildRemoteReadAuthorityWitness(false);
    if (isUsableLocalLeaderWitness(builtWitness, partitionId)) {
      return Object.freeze({...builtWitness});
    }
  }
  return ABSENT_WITNESS_VALUE;
}

function maxSafeIntegerOrNull(current, candidate) {
  if (!Number.isSafeInteger(candidate)) return current;
  return current === null ? candidate : Math.max(current, candidate);
}

function maxNonNegativeFloorOrNull(current, candidate) {
  if (!Number.isFinite(candidate) || candidate < 0) return current;
  const floored = Math.floor(candidate);
  return current === null ? floored : Math.max(current, floored);
}

const COMPLETE_TABLE_READ_SQL_PATTERN =
  /^SELECT\s+\*\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/iu;

function isCompleteTableReadRequest(tableName, sql, params) {
  if (Array.isArray(params) && params.length > 0) {
    return false;
  }
  const match = String(sql || '').trim().match(
    COMPLETE_TABLE_READ_SQL_PATTERN,
  );
  return match?.[1] === tableName;
}

function areAllWitnessesValidLeaderReceipts(witnessList) {
  if (!Array.isArray(witnessList) || witnessList.length === 0) {
    return false;
  }
  return witnessList.every((witness) =>
    isUsableLocalLeaderWitness(witness, witness?.partitionId),
  );
}

function isValidSinglePartitionLocalObservation(
  tableName,
  rowSetComplete,
  witnessList,
  sql,
  params,
) {
  const canonicalPartitionId = INITIAL_PARTITION_IDS[tableName];
  if (
    !rowSetComplete ||
    !canonicalPartitionId ||
    !isCompleteTableReadRequest(tableName, sql, params) ||
    !areAllWitnessesValidLeaderReceipts(witnessList)
  ) {
    return false;
  }
  return (
    witnessList.length === 1 &&
    witnessList[0]?.partitionId === canonicalPartitionId
  );
}

export function buildLocalAuthoritativeObservation(
  tableName,
  rowSetComplete,
  witnessList,
  sql = null,
  params = [],
) {
  if (
    !isValidSinglePartitionLocalObservation(
      tableName,
      rowSetComplete,
      witnessList,
      sql,
      params,
    )
  ) {
    return ABSENT_OBSERVATION_VALUE;
  }
  const primaryWitness = witnessList[0];
  let maxAppliedIndex = null;
  let maxCommitIndex = null;
  let maxTerm = null;
  let maxObservedAtMs = null;
  for (const witness of witnessList) {
    maxAppliedIndex = maxSafeIntegerOrNull(
      maxAppliedIndex,
      witness.appliedIndex,
    );
    maxCommitIndex = maxSafeIntegerOrNull(
      maxCommitIndex,
      witness.commitIndex,
    );
    maxTerm = maxSafeIntegerOrNull(maxTerm, witness.term);
    maxObservedAtMs = maxNonNegativeFloorOrNull(
      maxObservedAtMs,
      witness.observedAtMs,
    );
  }
  return Object.freeze({
    scope: LOCAL_AUTHORITATIVE_OBSERVATION_SCOPE,
    tableName,
    rowSetComplete: true,
    observedPartitionCount: witnessList.length,
    witnessCount: witnessList.length,
    observedAtMs: maxObservedAtMs,
    term: maxTerm,
    appliedIndex: maxAppliedIndex,
    commitIndex: maxCommitIndex,
    maxTerm,
    maxAppliedIndex,
    maxCommitIndex,
    servingNodeId: primaryWitness.servingNodeId,
    servingReplicaId: primaryWitness.servingReplicaId || null,
    partitionId: primaryWitness.partitionId,
  });
}

const NORMAL_PARTITION_STATE = 'NORMAL';
const LEADER_ROLE_UNAVAILABLE = 'UNAVAILABLE';

function decodeCachedTableRow(row) {
  return {
    tableName: typeof row?.table_name === 'string' ? row.table_name : null,
    tableId: typeof row?.table_id === 'string' ? row.table_id : null,
    activePartitionVersion: row?.active_partition_version ?? null,
  };
}

function decodeCachedPartitionRow(row) {
  return {
    partitionId: typeof row?.partition_id === 'string' ? row.partition_id : null,
    tableName: typeof row?.table_name === 'string' ? row.table_name : null,
    tableId: typeof row?.table_id === 'string' ? row.table_id : null,
    state: typeof row?.state === 'string' ? row.state : null,
    partitionVersion: row?.partition_version ?? null,
  };
}

function findCachedTableRow(cache, tableName) {
  const directRow = cache.get?.(SYSTEM_TABLE_NAME.TABLES, tableName) || null;
  if (directRow) {
    return directRow;
  }
  const allRows = cache.getAll?.(SYSTEM_TABLE_NAME.TABLES) || [];
  return allRows.find((row) => {
    const decoded = decodeCachedTableRow(row);
    return decoded.tableName === tableName || decoded.tableId === tableName;
  }) || null;
}

function resolveActiveTableVersionFromCache(cache, tableName) {
  if (!cache || !tableName) {
    return null;
  }
  const tableRow = findCachedTableRow(cache, tableName);
  if (!tableRow) {
    return null;
  }
  const {activePartitionVersion} = decodeCachedTableRow(tableRow);
  return Number.isInteger(activePartitionVersion) && activePartitionVersion > 0 ?
    activePartitionVersion :
    null;
}

function isMatchingNormalPartitionVersion(decoded, activeVersion) {
  if (
    typeof decoded.state !== 'string' ||
    decoded.state.toUpperCase() !== NORMAL_PARTITION_STATE
  ) {
    return false;
  }
  if (
    activeVersion === null ||
    !Number.isInteger(decoded.partitionVersion) ||
    decoded.partitionVersion <= 0 ||
    decoded.partitionVersion !== activeVersion
  ) {
    return false;
  }
  return true;
}

function resolvePartitionRowsFromCache(cache, tableName) {
  const activeVersion = resolveActiveTableVersionFromCache(cache, tableName);
  if (activeVersion === null) {
    return [];
  }
  const partitionPredicate = (row) => {
    const decoded = decodeCachedPartitionRow(row);
    if (decoded.tableName !== tableName && decoded.tableId !== tableName) {
      return false;
    }
    return isMatchingNormalPartitionVersion(decoded, activeVersion);
  };
  return typeof cache.filter === 'function' ?
    cache.filter(SYSTEM_TABLE_NAME.PARTITIONS, partitionPredicate) :
    typeof cache.getAll === 'function' ?
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
    typeof partitionService.executeQuery === 'function' ||
    typeof partitionService.executeLocalQuery === 'function' ||
    typeof partitionService?.db?.prepare === 'function'
  );
}

function resolveLeaderRole(partitionService) {
  if (
    !isUsablePartitionService(partitionService) ||
    typeof partitionService.getRole !== 'function'
  ) {
    return LEADER_ROLE_UNAVAILABLE;
  }
  const liveRole = partitionService.getRole();
  if (typeof liveRole !== 'string' || liveRole.trim().length === 0) {
    return LEADER_ROLE_UNAVAILABLE;
  }
  return liveRole.trim().toLowerCase();
}

function isLeaderRole(partitionService) {
  return resolveLeaderRole(partitionService) ===
    CDC_INTEGRATION_SERVICE_LITERAL.LEADER;
}

function resolvePartitionServicesForSegment(service) {
  if (service.bootstrapMode && service.localPartitionServices instanceof Map) {
    return service.localPartitionServices;
  }
  if (typeof service.partitionServicesProvider === 'function') {
    const provided = service.partitionServicesProvider();
    return provided instanceof Map ? provided : null;
  }
  return null;
}

function resolveSystemTablePartitionIdsForSegment(service, tableName) {
  const canonicalPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
  const cache = service.systemTableCache;
  if (!cache) {
    return canonicalPartitionId ? [canonicalPartitionId] : [];
  }

  const partitionRows = resolvePartitionRowsFromCache(cache, tableName);
  const resolvedPartitionIds = [
    ...new Set(
      [
        canonicalPartitionId,
        ...partitionRows.map(
          (row) => decodeCachedPartitionRow(row).partitionId,
        ),
      ].filter(Boolean),
    ),
  ];

  return resolvedPartitionIds;
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
        !isLeaderRole(partitionService)
      ) {
        continue;
      }
      matches.push(partitionService);
      seenServices.add(partitionService);
    }
  }

  matches.sort((left, right) => {
    return (
      Number(isLeaderRole(right)) -
      Number(isLeaderRole(left))
    );
  });

  return matches;
}

function executeSystemTableRead(partitionService, sql, params = []) {
  if (typeof partitionService?.executeLocalQuery === 'function') {
    return partitionService.executeLocalQuery(sql, params);
  }
  if (typeof partitionService?.db?.prepare === 'function') {
    // Only a read the statement-admission owner admits is prepared here.
    return readAdmittedPartitionRows(partitionService, sql, params);
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
  return localLeaders.length > 0;
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
  return isLeaderRole(partitionService);
}

export function resolveLocalSystemTableServices(service, tableName, options = {}) {
  return resolvePartitionServicesForTable(service, tableName, options);
}

export function canWriteSystemTableLocally(service, tableName) {
  return canWriteLocally(service, tableName);
}

export async function executeLocalSystemTableRead(service, partitionService, sql, params = []) {
  return issueAuthoritativeReadStage(service, CDC_TERMINAL_STAGE.LOCAL_READ,
    () => executeSystemTableRead(partitionService, sql, params));
}
