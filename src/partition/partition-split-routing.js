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
const SPLIT_SNAPSHOT_MAX_BIND_VARIABLES = 32_766;

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
  assertSplitRoutingDescriptorEpoch(metadata, options);
  const routingKey = extractSplitRoutingKey(
    entry,
    metadata.primaryKeyColumn,
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
  const descriptorEpochEvidence = options.descriptorEpochEvidence || null;
  if (!descriptorEpochEvidence) {
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

export async function routeSplitSnapshotBatch(
  rows,
  columns,
  metadata,
  options = {},
) {
  const rowsByPartition = new Map();
  for (const row of rows) {
    const partitionId = resolveSplitTargetPartitionId(
      row?.[metadata.primaryKeyColumn],
      metadata,
    );
    const partitionRows = rowsByPartition.get(partitionId) || [];
    partitionRows.push(row);
    rowsByPartition.set(partitionId, partitionRows);
  }

  const columnList = columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const placeholders = columns
    .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
    .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  for (const [partitionId, partitionRows] of rowsByPartition) {
    const rowLimit = resolveSplitSnapshotBatchRowLimit(
      columns,
      partitionRows.length,
    );
    for (let offset = 0; offset < partitionRows.length; offset += rowLimit) {
      const proposalRows = partitionRows.slice(offset, offset + rowLimit);
      const descriptorEpochEvidence =
        typeof options.resolveDescriptorEpochEvidence ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          options.resolveDescriptorEpochEvidence() :
          options.descriptorEpochEvidence;
      assertSplitRoutingDescriptorEpoch(metadata, {
        ...options,
        descriptorEpochEvidence,
      });
      const values = proposalRows
        .map(() => `(${placeholders})`)
        .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const sql =
        `${SQL.INSERT_OR_REPLACE_INTO} ${options.tableName} (${columnList}) ` +
        `${SQL.VALUES} ${values}`;
      const params = proposalRows.flatMap(
        (row) => columns.map((column) => row[column]),
      );
      await routeSplitMirroredWrite(partitionId, sql, params, {
        ...options,
        splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SNAPSHOT,
      });
    }
  }
}

export function resolveSplitSnapshotBatchRowLimit(columns, requestedRows) {
  const columnCount = Array.isArray(columns) ? columns.length : 0;
  const bindLimitedRows = columnCount > 0 ?
    Math.max(1, Math.floor(
      SPLIT_SNAPSHOT_MAX_BIND_VARIABLES / columnCount,
    )) :
    1;
  const configuredRows =
    Number.isInteger(requestedRows) && requestedRows > 0 ?
      requestedRows :
      1;
  return Math.min(configuredRows, bindLimitedRows);
}

export function resolveSplitTargetPartitionId(value, metadata = {}) {
  const [leftPartitionId, rightPartitionId] = Array.isArray(
    metadata?.targetPartitionIds,
  ) ?
    metadata.targetPartitionIds :
    [];
  if (value === null || value === void 0) {
    return rightPartitionId;
  }
  return value < metadata.splitKey ? leftPartitionId : rightPartitionId;
}

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
