import {SQL} from '../constants/index.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_SPLIT_MIRROR_ORIGIN,
} from './partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_TYPE,
} from './partition-service-constants.js';
import {
  assertSplitRoutingMetadataSafe,
  resolveSplitRoutingPrimaryKeyColumn,
  resolveSplitTargetPartitionId,
} from './split-key-comparator.js';
import {
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
} from '../utils/strict-own-data.js';
import {
  extractDataFromParameterizedSQL,
  extractDeleteDataFromSQL,
  extractInsertDataFromSQL,
  extractUpdateDataFromSQL,
} from './partition-sql-parser.js';


const SPLIT_ROUTING_LITERAL = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const SPLIT_MIRROR_IDENTITY_FIELD = Object.freeze({
  ENTRY_ID: 'entryId',
  OPERATION_ID: 'operationId',
  IDEMPOTENCY_KEY: 'idempotencyKey',
});
export const SPLIT_SNAPSHOT_MAX_BIND_VARIABLES = 32_766;
export const SPLIT_SNAPSHOT_MAX_ROWS_PER_BATCH = 64;
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const MapCtor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const TypeErrorCtor = TypeError;

function copyNonEmptyStringField(target, field, value) {
  if (typeof value === SPLIT_ROUTING_LITERAL.STRING && value.length > 0) {
    target[field] = value;
  }
}

/**
 * Preserve the source write's idempotency identity through the mirror:
 * the child partition's replay registry keys on entryId, so an ambiguous
 * executor retry of a mirrored write must arrive with the SAME identity
 * or it applies twice.
 * @param {Object} entry - Applied source write entry.
 * @return {Object} Identity fields for executeOnPartition executionOptions.
 */
export function extractSplitMirrorIdentity(entry) {
  const identity = {};
  copyNonEmptyStringField(
    identity,
    SPLIT_MIRROR_IDENTITY_FIELD.ENTRY_ID,
    entry?.entryId,
  );
  copyNonEmptyStringField(
    identity,
    SPLIT_MIRROR_IDENTITY_FIELD.OPERATION_ID,
    entry?.operationId,
  );
  copyNonEmptyStringField(
    identity,
    SPLIT_MIRROR_IDENTITY_FIELD.IDEMPOTENCY_KEY,
    entry?.idempotencyKey,
  );
  return identity;
}

function hasOwnedProperty(record, propertyName) {
  if (!record || typeof record !== SPLIT_ROUTING_LITERAL.OBJECT) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(record, propertyName);
}

function resolveSplitOperationType(entry) {
  const operationType = entry?.type || PARTITION_SERVICE_OPERATION.QUERY;
  if (operationType !== PARTITION_SERVICE_OPERATION.QUERY || !entry?.sql) {
    return operationType;
  }

  const sqlUpper = entry.sql.trim().toUpperCase();
  if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
    return PARTITION_SERVICE_OPERATION.UPSERT;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
    return PARTITION_SERVICE_OPERATION.INSERT;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
    return PARTITION_SERVICE_OPERATION.UPDATE;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
    return PARTITION_SERVICE_OPERATION.DELETE;
  }

  return operationType;
}

function extractRoutingKeyFromSql(entry, primaryKeyColumn, tableName) {
  const operationType = resolveSplitOperationType(entry);
  let extracted = {};

  if (entry?.sql) {
    const params = Array.isArray(entry.params) ? entry.params : [];
    if (
      params.length > 0 &&
      entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
    ) {
      extracted = extractDataFromParameterizedSQL(
        entry.sql,
        params,
        tableName,
        operationType,
      );
    } else if (
      operationType === PARTITION_SERVICE_OPERATION.INSERT ||
      operationType === PARTITION_SERVICE_OPERATION.UPSERT
    ) {
      extracted = extractInsertDataFromSQL(entry.sql, tableName);
    } else if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
      extracted = extractUpdateDataFromSQL(entry.sql, tableName);
    } else if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
      extracted = extractDeleteDataFromSQL(entry.sql);
    }
  }

  return extracted?.[primaryKeyColumn];
}

export function cloneSplitEntry(entry) {
  return {
    ...entry,
    params: Array.isArray(entry?.params) ? [...entry.params] : [],
    data:
      entry?.data && typeof entry.data === SPLIT_ROUTING_LITERAL.OBJECT ?
        {...entry.data} :
        entry?.data,
    whereClause:
      entry?.whereClause &&
      typeof entry.whereClause === SPLIT_ROUTING_LITERAL.OBJECT ?
        {...entry.whereClause} :
        entry?.whereClause,
  };
}

export async function replaySplitEntry(entry, metadata, options = {}) {
  assertSplitRoutingMetadataSafe(metadata);
  assertSplitRoutingDescriptorEpoch(metadata, options);
  const primaryKeyColumn = resolveSplitRoutingPrimaryKeyColumn(metadata);
  const routingKey = extractSplitRoutingKey(
    entry,
    primaryKeyColumn,
    options,
  );
  const targetPartitionId = resolveSplitTargetPartitionId(routingKey, metadata);
  await routeSplitMirroredWrite(
    targetPartitionId,
    entry.sql,
    entry.params || [],
    {
      ...extractSplitMirrorIdentity(entry),
      ...options,
    },
  );
}

export function assertSplitRoutingDescriptorEpoch(metadata, options = {}) {
  assertSplitRoutingMetadataSafe(metadata);
  const descriptorEpochEvidence = options.descriptorEpochEvidence || null;
  if (!descriptorEpochEvidence) {
    // Epoch evidence must never fail OPEN on an in-flight mirror: a
    // cold-cache gap fails closed post-cutover and defers pre-cutover,
    // never silently skipping validation. Callers without transition
    // context (no mirror in flight) keep the legacy skip-validation
    // behavior — there is nothing to fence.

    if (options.evidenceGapFailsClosed === true) {
      throw new Error(PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.MISSING_EVIDENCE);
    }
    if (options.evidenceGapDefers === true) {
      const deferError = new Error(
        PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.MISSING_EVIDENCE,
      );
      deferError.deferRetry = true;
      throw deferError;
    }
    return null;
  }
  const decision = buildPartitionDescriptorEpochDecision({
    ...descriptorEpochEvidence,
    splitMetadata: metadata,
    requireRouteTargetVersion: true,
  });
  if (!isPartitionDescriptorEpochAccepted(decision)) {
    throw new Error(PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE);
  }
  return decision;
}

export async function routeSplitMirroredWrite(
  partitionId,
  sql,
  params,
  options = {},
) {
  const queryExecutor = options.queryExecutor || null;
  if (
    !queryExecutor ||
    typeof queryExecutor.executeOnPartition !== PARTITION_SERVICE_TYPE.FUNCTION
  ) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }

  const executionOptions = {
    splitMirrorOrigin:
      options.splitMirrorOrigin || PARTITION_SPLIT_MIRROR_ORIGIN.SOURCE,
  };
  copyNonEmptyStringField(
    executionOptions,
    SPLIT_MIRROR_IDENTITY_FIELD.ENTRY_ID,
    options.entryId,
  );
  copyNonEmptyStringField(
    executionOptions,
    SPLIT_MIRROR_IDENTITY_FIELD.OPERATION_ID,
    options.operationId,
  );
  copyNonEmptyStringField(
    executionOptions,
    SPLIT_MIRROR_IDENTITY_FIELD.IDEMPOTENCY_KEY,
    options.idempotencyKey,
  );
  const result = await queryExecutor.executeOnPartition(
    partitionId,
    sql,
    params,
    false,
    true,
    false,
    executionOptions,
  );
  if (!result?.success) {
    throw new Error(
      result?.error || PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
    );
  }
}

function requireSnapshotRows(rows, maxRows) {
  const copied = copyDenseOwnDataRecordArray(rows, maxRows);
  if (copied === null) {
    throw new TypeErrorCtor(
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
    );
  }
  return copied;
}

function requireSnapshotColumns(columns) {
  const copied = copyDenseOwnDataArray(
    columns,
    SPLIT_SNAPSHOT_MAX_BIND_VARIABLES,
  );
  if (copied === null || copied.length === 0) {
    throw new TypeErrorCtor(
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
    );
  }
  for (let index = 0; index < copied.length; index += 1) {
    if (typeof copied[index] !== SPLIT_ROUTING_LITERAL.STRING) {
      throw new TypeErrorCtor(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
      );
    }
  }
  return copied;
}

export async function routeSplitSnapshotBatch(
  rows,
  columns,
  metadata,
  options = {},
) {
  assertSplitRoutingMetadataSafe(metadata);
  const primaryKeyColumn = resolveSplitRoutingPrimaryKeyColumn(metadata);
  const snapshotColumns = requireSnapshotColumns(columns);
  const snapshotRows = requireSnapshotRows(
    rows,
    SPLIT_SNAPSHOT_MAX_ROWS_PER_BATCH,
  );
  const rowsByPartition = new MapCtor();
  const partitionOrder = [];

  for (let rowIndex = 0; rowIndex < snapshotRows.length; rowIndex += 1) {
    const row = snapshotRows[rowIndex];
    const partitionId = resolveSplitTargetPartitionId(
      row[primaryKeyColumn],
      metadata,
    );
    let partitionRows = mapGet(rowsByPartition, partitionId);
    if (partitionRows === undefined) {
      partitionRows = [];
      mapSet(rowsByPartition, partitionId, partitionRows);
      arrayPush(partitionOrder, partitionId);
    }
    arrayPush(partitionRows, row);
  }

  const columnList = arrayJoin(
    snapshotColumns,
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
  );
  const placeholderParts = [];
  for (let columnIndex = 0;
    columnIndex < snapshotColumns.length;
    columnIndex += 1) {
    arrayPush(
      placeholderParts,
      PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK,
    );
  }
  const placeholders = arrayJoin(
    placeholderParts,
    PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
  );

  for (let partitionIndex = 0;
    partitionIndex < partitionOrder.length;
    partitionIndex += 1) {
    const partitionId = partitionOrder[partitionIndex];
    const partitionRows = mapGet(rowsByPartition, partitionId);
    const rowLimit = resolveSplitSnapshotBatchRowLimit(
      snapshotColumns,
      partitionRows.length,
    );
    for (let offset = 0; offset < partitionRows.length; offset += rowLimit) {
      const proposalRows = arraySlice(
        partitionRows,
        offset,
        offset + rowLimit,
      );
      const descriptorEpochEvidence =
        typeof options.resolveDescriptorEpochEvidence ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          options.resolveDescriptorEpochEvidence() :
          options.descriptorEpochEvidence;
      assertSplitRoutingDescriptorEpoch(metadata, {
        ...options,
        descriptorEpochEvidence,
      });

      const valueRows = [];
      for (let rowIndex = 0;
        rowIndex < proposalRows.length;
        rowIndex += 1) {
        arrayPush(valueRows, `(${placeholders})`);
      }
      const values = arrayJoin(
        valueRows,
        PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE,
      );
      const sql =
        `${SQL.INSERT_OR_REPLACE_INTO} ${options.tableName} (${columnList}) ` +
        `${SQL.VALUES} ${values}`;
      const params = [];
      for (let rowIndex = 0;
        rowIndex < proposalRows.length;
        rowIndex += 1) {
        const row = proposalRows[rowIndex];
        for (let columnIndex = 0;
          columnIndex < snapshotColumns.length;
          columnIndex += 1) {
          arrayPush(params, row[snapshotColumns[columnIndex]]);
        }
      }
      await routeSplitMirroredWrite(partitionId, sql, params, {
        ...options,
        splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT,
      });
    }
  }
}

function resolveSplitSnapshotBatchRowLimitFromColumnCount(
  columnCount,
  requestedRows,
) {
  const bindLimitedRows = Math.floor(
    SPLIT_SNAPSHOT_MAX_BIND_VARIABLES / columnCount,
  );
  const configuredRows =
    Number.isInteger(requestedRows) && requestedRows > 0 ?
      requestedRows :
      1;
  return Math.min(configuredRows, bindLimitedRows);
}

export function resolveSplitSnapshotBatchRowLimit(columns, requestedRows) {
  const snapshotColumns = requireSnapshotColumns(columns);
  return resolveSplitSnapshotBatchRowLimitFromColumnCount(
    snapshotColumns.length,
    requestedRows,
  );
}

// Split-key comparison is owned by split-key-comparator.js (F12): every
// split routing decision (mirror replay, snapshot batching, service
// wrappers) shares exactly one comparator. Never reintroduce a raw
// relational comparison at a call site — mixed-type key spaces must
// reject, never coerce.
export {
  compareSplitKey,
  resolveSplitTargetPartitionId,
} from './split-key-comparator.js';

export function extractSplitRoutingKey(
  entry,
  primaryKeyColumn,
  options = {},
) {
  if (entry?.whereClause && hasOwnedProperty(entry.whereClause, primaryKeyColumn)) {
    return entry.whereClause[primaryKeyColumn];
  }
  if (entry?.data && hasOwnedProperty(entry.data, primaryKeyColumn)) {
    return entry.data[primaryKeyColumn];
  }

  const routingKey = extractRoutingKeyFromSql(
    entry,
    primaryKeyColumn,
    options.tableName,
  );
  if (routingKey === null || routingKey === void 0) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }
  return routingKey;
}
