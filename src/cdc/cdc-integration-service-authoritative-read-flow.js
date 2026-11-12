import {types} from 'node:util';
import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  buildLocalAuthoritativeObservation,
  executeLocalSystemTableRead,
  resolveLocalSystemTableServices,
  resolveSystemTablePartitionIds,
  selectLocalPartitionWitness,
} from './cdc-integration-service-local-system-table-routing.js';
import {
  executeAuthoritativeOwnerRpcRead,
  getLocalQueryTransportReadiness,
  normalizeAuthoritativeReadLocalQueryTransport,
} from './cdc-integration-service-owner-rpc-read-execution.js';
import {
  assertControlPlaneOwnerReadAuthority,
  hasAuthoritativeReadFailureEvidence,
  isCompleteAuthoritativeReadResult,
} from '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {enforceRequiredLeaderReadAuthority} from
  '../control-plane/control-plane-authoritative-read-witness.js';
const {
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CONTROL_PLANE_READINESS_DIMENSION,
  INITIAL_PARTITION_IDS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
} = CDC_INTEGRATION_SERVICE_SHARED;

const arrayIsArray = Array.isArray;
const canonicalObjectPrototype = Object.prototype;
const isProxy = types.isProxy.bind(types);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const JSON_SERIALIZATION_HOOK_PROPERTY = 'toJSON';
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';
const ABSENT_WITNESS_VALUE = null;
const EMPTY_WITNESS_ARRAY = Object.freeze([]);
const ABSENT_OBSERVATION_VALUE = null;
const EMPTY_ROW_ARRAY = Object.freeze([]);
const UNAVAILABLE_LOCAL_READ_SNAPSHOT = Object.freeze({
  available: false,
  rows: EMPTY_ROW_ARRAY,
  rowSetComplete: false,
  readAuthorityWitness: ABSENT_WITNESS_VALUE,
  readAuthorityWitnesses: EMPTY_WITNESS_ARRAY,
  authoritativeObservation: ABSENT_OBSERVATION_VALUE,
});

function isFlatJsonValue(value) {
  return value === null || value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
}

function hasJsonHook(value, prototype) {
  if (objectGetOwnPropertyDescriptor(
    value,
    JSON_SERIALIZATION_HOOK_PROPERTY,
  )) {
    return true;
  }
  return prototype === canonicalObjectPrototype &&
    objectGetOwnPropertyDescriptor(
      canonicalObjectPrototype,
      JSON_SERIALIZATION_HOOK_PROPERTY,
    ) !== undefined;
}

function isInspectableFlatJsonRecord(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    arrayIsArray(value) ||
    isProxy(value)
  ) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return (
    prototype === canonicalObjectPrototype || prototype === null
  ) && !hasJsonHook(value, prototype);
}

function hasEquivalentFlatJsonOwnValue(candidate, existing, key) {
  const candidateDescriptor = objectGetOwnPropertyDescriptor(candidate, key);
  const existingDescriptor = objectGetOwnPropertyDescriptor(existing, key);
  return Boolean(
    candidateDescriptor &&
    existingDescriptor &&
    objectHasOwn(candidateDescriptor, DATA_DESCRIPTOR_VALUE_PROPERTY) &&
    objectHasOwn(existingDescriptor, DATA_DESCRIPTOR_VALUE_PROPERTY) &&
    isFlatJsonValue(candidateDescriptor.value) &&
    candidateDescriptor.value === existingDescriptor.value,
  );
}

function areEquivalentFlatJsonRows(candidate, existing) {
  if (
    !isInspectableFlatJsonRecord(candidate) ||
    !isInspectableFlatJsonRecord(existing)
  ) return false;
  const candidateKeys = objectKeys(candidate);
  const existingKeys = objectKeys(existing);
  if (candidateKeys.length !== existingKeys.length) {
    return false;
  }
  for (const key of candidateKeys) {
    if (!hasEquivalentFlatJsonOwnValue(candidate, existing, key)) {
      return false;
    }
  }
  return true;
}

function resolveAuthoritativeRowVersion(service, row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  for (const fieldName of AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES) {
    const value = row[fieldName];
    if (value === undefined || value === null) {
      continue;
    }

    const comparable = service.normalizeComparableCacheFieldValue(value);
    if (comparable !== null) {
      return comparable;
    }

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function getAuthoritativeRepairRowRank(service, row, rowRanks) {
  const existingRank = rowRanks?.get(row);
  if (existingRank) return existingRank;
  const rank = {
    row,
    serializedLength: null,
    version: resolveAuthoritativeRowVersion(service, row),
  };
  rowRanks?.set(row, rank);
  return rank;
}

function getAuthoritativeRepairRowSerializedLength(rank) {
  if (rank.serializedLength === null) {
    rank.serializedLength = JSON.stringify(rank.row).length;
  }
  return rank.serializedLength;
}

function compareAuthoritativeRepairRows(
  service,
  candidate,
  existing,
  rowRanks = null,
) {
  const candidateRank = getAuthoritativeRepairRowRank(
    service,
    candidate,
    rowRanks,
  );
  const existingRank = getAuthoritativeRepairRowRank(
    service,
    existing,
    rowRanks,
  );
  const candidateVersion = candidateRank.version;
  const existingVersion = existingRank.version;

  if (candidateVersion !== null && existingVersion !== null) {
    if (candidateVersion === existingVersion) {
      if (areEquivalentFlatJsonRows(candidate, existing)) {
        return false;
      }
      return getAuthoritativeRepairRowSerializedLength(candidateRank) >
        getAuthoritativeRepairRowSerializedLength(existingRank);
    }
    return candidateVersion > existingVersion;
  }

  if (candidateVersion !== null) {
    return true;
  }

  if (existingVersion !== null) {
    return false;
  }

  if (areEquivalentFlatJsonRows(candidate, existing)) {
    return false;
  }

  return getAuthoritativeRepairRowSerializedLength(candidateRank) >
    getAuthoritativeRepairRowSerializedLength(existingRank);
}

function mergeAuthoritativeSystemTableRowSets(service, tableName, rowSets) {
  const keyField = service.getPrimaryKeyField(tableName);
  const mergedRows = new Map();
  const rowRanks = new Map();

  for (const rowSet of rowSets) {
    const rows = Array.isArray(rowSet) ? rowSet : [];
    for (const row of rows) {
      const key = row?.[keyField] ?? row?.id ?? null;
      if (key === null || key === undefined) {
        continue;
      }
      const existing = mergedRows.get(key);
      if (!existing || compareAuthoritativeRepairRows(
        service,
        row,
        existing,
        rowRanks,
      )) {
        mergedRows.set(key, row);
      }
    }
  }

  return [...mergedRows.values()];
}

function localAuthoritativeReadRowsAreUsable(result) {
  return (
    result?.success === true &&
    result?.partial !== true &&
    result?.rowSetComplete !== false &&
    !hasAuthoritativeReadFailureEvidence(result) &&
    Array.isArray(result.rows)
  );
}

function haveAllExpectedSystemTablePartitions(
  tableName,
  expectedPartitionIds,
  witnessList,
) {
  const canonicalPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
  if (
    !canonicalPartitionId ||
    !Array.isArray(expectedPartitionIds) ||
    expectedPartitionIds.length !== 1 ||
    expectedPartitionIds[0] !== canonicalPartitionId
  ) {
    return false;
  }
  const witnessedPartitionIds = new Set(
    witnessList
      .map((witness) => witness?.partitionId)
      .filter((partitionId) => typeof partitionId === 'string' && partitionId.length > 0),
  );
  return (
    witnessedPartitionIds.size === 1 &&
    witnessedPartitionIds.has(canonicalPartitionId)
  );
}

async function queryLocalAuthoritativeSystemTableRows(
  service,
  tableName,
  sql,
  params = [],
  readAuthority,
) {
  const expectedPartitionIds = resolveSystemTablePartitionIds(
    service,
    tableName,
  );
  const localServices = resolveLocalSystemTableServices(service, tableName, {
    consistency: readAuthority.localReadConsistency,
  });

  if (localServices.length === 0) {
    return UNAVAILABLE_LOCAL_READ_SNAPSHOT;
  }

  const rowSets = [];
  const collectedWitnesses = [];
  let completePartitionCount = 0;
  let available = false;

  for (const partitionService of localServices) {
    try {
      const result = await executeLocalSystemTableRead(
        service,
        partitionService,
        sql,
        params,
      );

      if (!localAuthoritativeReadRowsAreUsable(result)) {
        continue;
      }

      const witness = selectLocalPartitionWitness(
        partitionService,
        result,
      );
      const authorized = enforceRequiredLeaderReadAuthority(
        {...result, readAuthorityWitness: witness}, partitionService.partitionId, readAuthority);
      if (authorized.success !== true) {
        return {...UNAVAILABLE_LOCAL_READ_SNAPSHOT,
          error: authorized.error, authorityFailureReason: authorized.authorityFailureReason};
      }
      rowSets.push(result.rows);
      if (witness) {
        collectedWitnesses.push(witness);
        if (isCompleteAuthoritativeReadResult(result)) {
          completePartitionCount += 1;
        }
      }
      available = true;
    } catch (error) {
      service.logger.warn(
        CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_READ_AUTHORITATIVE_SYSTEM_TABLE_ROWS_FROM_LOCAL +
          CDC_INTEGRATION_SERVICE_LITERAL.PARTITION_REPLICA,
        {
          nodeId: service.nodeId,
          tableName,
          partitionId: partitionService?.partitionId || null,
          replicaId: partitionService?.replicaId || null,
          error: error?.message || String(error),
        },
      );
    }
  }

  const rowSetComplete = available &&
    completePartitionCount === localServices.length &&
    rowSets.length === localServices.length &&
    collectedWitnesses.length === localServices.length &&
    haveAllExpectedSystemTablePartitions(
      tableName,
      expectedPartitionIds,
      collectedWitnesses,
    );
  const primaryWitness = collectedWitnesses[0] || ABSENT_WITNESS_VALUE;
  const authoritativeObservation = buildLocalAuthoritativeObservation(
    tableName,
    rowSetComplete,
    collectedWitnesses,
    sql,
    params,
  );

  return {
    available,
    rows: available ?
      mergeAuthoritativeSystemTableRowSets(service, tableName, rowSets) :
      EMPTY_ROW_ARRAY,
    rowSetComplete,
    readAuthorityWitness: primaryWitness,
    readAuthorityWitnesses: collectedWitnesses,
    authoritativeObservation,
  };
}

function buildSystemTableOperationDiagnostics(service, tableName, options = {}) {
  const queryOptions =
    options?.queryOptions && typeof options.queryOptions === 'object' ?
      options.queryOptions :
      {};

  const routingReadinessDimension =
    queryOptions.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

  const partitionIds = resolveSystemTablePartitionIds(service, tableName);
  const partitionId = partitionIds[0] || null;

  // CL-012: these diagnostics are built on EVERY authoritative read, and a
  // partition routing snapshot evaluates full node readiness per service
  // row — the inclusive-time profile pinned this eager enrichment inside
  // the seed's 20-95s event-loop gaps. The routing-snapshot-derived fields
  // are informational only and every consumer already falls back to the
  // cache-derived values below, so the snapshot is no longer built here.
  const routingSnapshot = null;

  let partitionRow = null;
  let serviceRows = [];
  if (
    service.systemTableCache &&
    typeof service.systemTableCache.filter === 'function'
  ) {
    const partitionRows =
      service.systemTableCache.filter(SYSTEM_TABLE_NAME.PARTITIONS, (row) => {
        const rowPartitionId =
          row?.partition_id || row?.partitionId || row?.id || null;

        if (partitionId && rowPartitionId === partitionId) {
          return true;
        }

        return row?.table_name === tableName || row?.tableName === tableName;
      }) || [];

    partitionRow = partitionRows[0] || null;

    if (partitionId) {
      serviceRows =
        service.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
          return (
            row?.partition_id === partitionId &&
            row?.service_type === SERVICE_TYPE.PARTITION
          );
        }) || [];
    }
  }

  const leaderNodeId =
    routingSnapshot?.canonicalLeaderNodeId ||
    partitionRow?.leader_node_id ||
    partitionRow?.leaderNodeId ||
    null;

  const serviceRowCount =
    Number.isFinite(routingSnapshot?.serviceRowCount) ?
      routingSnapshot.serviceRowCount :
      serviceRows.length;

  const routableServiceCount = Number.isFinite(
    routingSnapshot?.routableServiceCount,
  ) ?
    routingSnapshot.routableServiceCount :
    serviceRows.filter((row) => {
      return (
        row?.status === SERVICE_STATUS.ACTIVE &&
        typeof row?.address === 'string' &&
        row.address.length > 0
      );
    }).length;

  return Object.freeze({
    partitionId,
    leaderNodeId:
      typeof leaderNodeId === 'string' && leaderNodeId.length > 0 ?
        leaderNodeId :
        null,
    serviceRowCount,
    routableServiceCount,
    queryTimeoutMs:
      Number.isFinite(queryOptions.timeoutMs) &&
      queryOptions.timeoutMs > 0 ?
        Math.floor(queryOptions.timeoutMs) :
        null,
    routingReadinessDimension,
    deniedByReadiness:
      routingSnapshot &&
      typeof routingSnapshot.deniedByNodeId === 'object' ?
        Object.keys(routingSnapshot.deniedByNodeId).length > 0 :
        false,
  });
}

function normalizeLocalSystemTableWriteResult(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (
    typeof result.affectedRows === 'number' ||
    typeof result.changes !== 'number'
  ) {
    return result;
  }

  return {
    ...result,
    affectedRows: result.changes,
  };
}

function buildAuthoritativeReadDeliveryOptions(options, readAuthority) {
  return {
    readAuthority,
    workClass: options?.workClass,
    deliveryPriority: options?.deliveryPriority,
  };
}

function attachAuthoritativeReadQueryOptions(deliveryOptions, options) {
  return {
    ...deliveryOptions,
    queryOptions:
      options?.queryOptions && typeof options.queryOptions === 'object' ?
        options.queryOptions :
        {},
  };
}

function unavailableAuthoritativeRead(baseDiagnostics) {
  return {
    success: false,
    error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    rows: [],
    rowSetComplete: false,
    authoritativeObservation: ABSENT_OBSERVATION_VALUE,
    readAuthorityWitness: ABSENT_WITNESS_VALUE,
    readAuthorityWitnesses: EMPTY_WITNESS_ARRAY,
    localReadHit: false,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: false,
      routedToNode: null,
    },
  };
}

async function executeAuthoritativeSystemTableRead(
  service,
  tableName,
  sql,
  params = [],
  options = {},
) {
  let readAuthority;
  try {
    readAuthority = assertControlPlaneOwnerReadAuthority(options?.readAuthority);
  } catch (error) {
    return {success: false, rows: [], rowSetComplete: false,
      error: error.message, errorCode: error.code};
  }
  const authoritativeReadMode = readAuthority.authoritativeReadMode;
  const canonicalOptions = attachAuthoritativeReadQueryOptions(
    buildAuthoritativeReadDeliveryOptions(options, readAuthority),
    options,
  );
  const statement = sql || `SELECT * FROM ${tableName}`;
  const baseDiagnostics = buildSystemTableOperationDiagnostics(
    service,
    tableName,
    canonicalOptions,
  );
  if (authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
    const ownerResult = await executeAuthoritativeOwnerRpcRead(
      service,
      tableName,
      statement,
      params,
      canonicalOptions,
      baseDiagnostics,
      getLocalQueryTransportReadiness(service),
    );
    return ownerResult === null ? unavailableAuthoritativeRead(baseDiagnostics) : ownerResult;
  }

  const localRead = await queryLocalAuthoritativeSystemTableRows(
    service,
    tableName,
    statement,
    params,
    readAuthority,
  );
  if (localRead.available !== true) {
    return {...unavailableAuthoritativeRead(baseDiagnostics),
      ...localRead, success: false};
  }
  return {
    success: true,
    rows: localRead.rows,
    count: localRead.rows.length,
    rowCount: localRead.rows.length,
    rowSetComplete: localRead.rowSetComplete === true,
    readAuthorityWitness: localRead.readAuthorityWitness || ABSENT_WITNESS_VALUE,
    readAuthorityWitnesses: Array.isArray(localRead.readAuthorityWitnesses) ?
      localRead.readAuthorityWitnesses : EMPTY_WITNESS_ARRAY,
    authoritativeObservation: localRead.authoritativeObservation || ABSENT_OBSERVATION_VALUE,
    source: AUTHORITATIVE_READ_SOURCE.LOCAL_PARTITION_REPLICA,
    localReadHit: true,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: true,
      routedToNode: null,
      deniedByReadiness: false,
    },
  };
}

export {
  buildSystemTableOperationDiagnostics,
  executeAuthoritativeSystemTableRead,
  getLocalQueryTransportReadiness,
  mergeAuthoritativeSystemTableRowSets,
  normalizeAuthoritativeReadLocalQueryTransport,
  normalizeLocalSystemTableWriteResult,
};

export const extractAuthoritativeRowVersion = resolveAuthoritativeRowVersion;
export const isAuthoritativeRepairRowNewer = compareAuthoritativeRepairRows;
