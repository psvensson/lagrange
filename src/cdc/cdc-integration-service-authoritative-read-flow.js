import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {captureSystemTableRows} from '../cache/system-cache-key-descriptor.js';
import {appendOwnArrayValue, isNonEmptyText, serializeJsonData} from
  '../utils/canonical-json-data.js';
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
  CDC_INTEGRATION_SERVICE_LITERAL,
  CONTROL_PLANE_READINESS_DIMENSION,
  INITIAL_PARTITION_IDS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
} = CDC_INTEGRATION_SERVICE_SHARED;

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const CanonicalMap = Map;
const mapGet = Function.prototype.call.bind(Map.prototype.get);
const mapHas = Function.prototype.call.bind(Map.prototype.has);
const mapSet = Function.prototype.call.bind(Map.prototype.set);
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

function areEquivalentFlatCapturedRows(candidate, existing) {
  const candidateKeys = objectKeys(candidate);
  const existingKeys = objectKeys(existing);
  if (candidateKeys.length !== existingKeys.length) return false;
  for (let index = 0; index < candidateKeys.length; index += 1) {
    const key = candidateKeys[index];
    if (!objectHasOwn(existing, key) || candidate[key] !== existing[key]) return false;
  }
  return true;
}

function capturedRowEncoding(row, encodings) {
  let encoded = mapGet(encodings, row);
  if (encoded === undefined) {
    encoded = serializeJsonData(row, {sortKeys: true});
    mapSet(encodings, row, encoded);
  }
  return encoded;
}

function indexCapturedRows(captured) {
  const byKey = new CanonicalMap();
  for (let index = 0; index < captured.keys.length; index += 1) {
    mapSet(byKey, captured.keys[index], captured.rows[index]);
  }
  return byKey;
}

function capturedImagesAgree(captured, prior, encodings) {
  if (captured.rows.length !== prior.captured.rows.length) return false;
  for (let index = 0; index < captured.keys.length; index += 1) {
    const row = captured.rows[index];
    const existing = mapGet(prior.byKey, captured.keys[index]);
    if (existing === undefined) return false;
    if (!areEquivalentFlatCapturedRows(row, existing) &&
        capturedRowEncoding(row, encodings) !== capturedRowEncoding(existing, encodings)) return false;
  }
  return true;
}

function mergeCapturedPartitionImages(images) {
  const partitions = new CanonicalMap();
  const keys = new CanonicalMap();
  const encodings = new CanonicalMap();
  const rows = [];
  for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
    const {partitionId, captured} = images[imageIndex];
    const prior = mapGet(partitions, partitionId);
    if (prior) {
      if (!capturedImagesAgree(captured, prior, encodings)) return null;
      continue;
    }
    mapSet(partitions, partitionId, {captured, byKey: indexCapturedRows(captured)});
    for (let index = 0; index < captured.keys.length; index += 1) {
      const key = captured.keys[index];
      if (mapHas(keys, key)) return null;
      mapSet(keys, key, partitionId);
      appendOwnArrayValue(rows, captured.rows[index]);
    }
  }
  return objectFreeze(rows);
}

function localAuthoritativeReadRowsAreUsable(result) {
  return (
    result?.success === true &&
    result?.partial !== true &&
    result?.rowSetComplete !== false &&
    !hasAuthoritativeReadFailureEvidence(result)
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

  for (let serviceIndex = 0; serviceIndex < localServices.length; serviceIndex += 1) {
    const partitionService = localServices[serviceIndex];
    const partitionId = partitionService.partitionId;
    if (!isNonEmptyText(partitionId)) return UNAVAILABLE_LOCAL_READ_SNAPSHOT;
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

      const captured = captureSystemTableRows(tableName, result.rows);
      if (!captured) return UNAVAILABLE_LOCAL_READ_SNAPSHOT;

      const witness = selectLocalPartitionWitness(
        partitionId,
        result,
      );
      const authorized = enforceRequiredLeaderReadAuthority(
        {...result, readAuthorityWitness: witness}, partitionId, readAuthority);
      if (authorized.success !== true) {
        return {...UNAVAILABLE_LOCAL_READ_SNAPSHOT,
          error: authorized.error, authorityFailureReason: authorized.authorityFailureReason};
      }
      appendOwnArrayValue(rowSets, objectFreeze({partitionId, captured}));
      if (witness) {
        appendOwnArrayValue(collectedWitnesses, witness);
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

  const rows = mergeCapturedPartitionImages(rowSets);
  if (!rows) return UNAVAILABLE_LOCAL_READ_SNAPSHOT;
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
    rows: available ? rows : EMPTY_ROW_ARRAY,
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
  normalizeAuthoritativeReadLocalQueryTransport,
  normalizeLocalSystemTableWriteResult,
};
