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
  resolveSplitTargetPartitionId,
} from './split-key-comparator.js';
import {
  extractDataFromParameterizedSQL,
  extractDeleteDataFromSQL,
  extractInsertDataFromSQL,
  extractUpdateDataFromSQL,
  hasSqlParameterPlaceholders,
} from './partition-sql-parser.js';


const SPLIT_ROUTING_LITERAL = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const SPLIT_ROUTING_SQL = Object.freeze({
  REPLACE: 'REPLACE',
  CASE: 'CASE',
  WHEN_THEN_PLACEHOLDER: 'WHEN ? THEN ?',
  END: 'END',
  EQUALS_PLACEHOLDER: ' = ?',
  SPACE: ' ',
  COLON: ':',
});
const SPLIT_MIRROR_IDENTITY_FIELD = Object.freeze({
  ENTRY_ID: 'entryId',
  OPERATION_ID: 'operationId',
  IDEMPOTENCY_KEY: 'idempotencyKey',
});
const SPLIT_SNAPSHOT_MAX_BIND_VARIABLES = 32_766;
const SQL_TARGET_TABLE_PATTERN =
  /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+(?:main\s*\.\s*)?["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?/iu;
const SQL_SELECT_SUBQUERY_PATTERN = /\bSELECT\b/iu;

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
  if (
    (operationType !== PARTITION_SERVICE_OPERATION.QUERY &&
      operationType !== PARTITION_SERVICE_OPERATION.WRITE) ||
    !entry?.sql
  ) {
    return operationType;
  }

  const sqlUpper = entry.sql.trim().toUpperCase();
  if (
    sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase()) ||
    sqlUpper.startsWith(SPLIT_ROUTING_SQL.REPLACE)
  ) {
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
      hasSqlParameterPlaceholders(entry.sql)
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

function cloneOptionalObject(value) {
  return value && typeof value === SPLIT_ROUTING_LITERAL.OBJECT ?
    {...value} :
    value;
}

function cloneAffectedRowsPatch(affectedRows) {
  if (!Array.isArray(affectedRows)) return {};
  return {affectedRows: affectedRows.map((row) => ({...row}))};
}

export function cloneSplitEntry(entry) {
  return {
    ...entry,
    params: Array.isArray(entry?.params) ? [...entry.params] : [],
    ...cloneAffectedRowsPatch(entry?.affectedRows),
    ...(Array.isArray(entry?.settledTargetPartitionIds) ?
      {settledTargetPartitionIds: [...entry.settledTargetPartitionIds]} :
      {}),
    data: cloneOptionalObject(entry?.data),
    whereClause: cloneOptionalObject(entry?.whereClause),
  };
}

function isNoOpSplitEntry(entry) {
  if (entry?.changes === 0) {
    return true;
  }
  return Array.isArray(entry?.affectedRows) && entry.affectedRows.length === 0;
}

function groupAffectedRowsByTargetPartition(
  affectedRows,
  primaryKeyColumn,
  metadata,
) {
  const rowsByPartition = new Map();
  for (const row of affectedRows) {
    if (!hasOwnedProperty(row, primaryKeyColumn)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
    }
    const routingKey = row[primaryKeyColumn];
    if (routingKey === null || routingKey === void 0) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
    }
    const targetPartitionId = resolveSplitTargetPartitionId(routingKey, metadata);
    const partitionRows = rowsByPartition.get(targetPartitionId) || [];
    partitionRows.push(row);
    rowsByPartition.set(targetPartitionId, partitionRows);
  }
  return rowsByPartition;
}

function shouldProjectAffectedRowsToChildren(entry, rowsByPartition) {
  if (rowsByPartition.size > 1 || entry.affectedRows.length > 1) {
    return true;
  }
  return SQL_SELECT_SUBQUERY_PATTERN.test(String(entry?.sql || ''));
}

function resolveSplitEntryTableName(entry, options = {}) {
  if (options.tableName) {
    return options.tableName;
  }
  if (entry?.tableName) {
    return entry.tableName;
  }
  const match = String(entry?.sql || '').match(SQL_TARGET_TABLE_PATTERN);
  return match?.[1] || null;
}

function buildProjectedDeleteBatches(
  partitionRows,
  primaryKeyColumn,
  tableName,
) {
  const batches = [];
  for (
    let offset = 0;
    offset < partitionRows.length;
    offset += SPLIT_SNAPSHOT_MAX_BIND_VARIABLES
  ) {
    const proposalRows = partitionRows.slice(
      offset,
      offset + SPLIT_SNAPSHOT_MAX_BIND_VARIABLES,
    );
    const keys = proposalRows.map((row) => row[primaryKeyColumn]);
    if (keys.length === 1) {
      batches.push({
        sql:
          `${SQL.DELETE_FROM} ${tableName} ` +
          `${SQL.WHERE} ${primaryKeyColumn}${SPLIT_ROUTING_SQL.EQUALS_PLACEHOLDER}`,
        params: keys,
      });
    } else {
      const placeholders = keys
        .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
        .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      batches.push({
        sql:
          `${SQL.DELETE_FROM} ${tableName} ` +
          `${SQL.WHERE} ${primaryKeyColumn} ${SQL.IN} (${placeholders})`,
        params: keys,
      });
    }
  }
  return batches;
}

function buildProjectedUpdateBatches(
  entry,
  partitionRows,
  primaryKeyColumn,
  tableName,
) {
  const columns = Object.keys(partitionRows[0] || {});
  const nonPkColumns = columns.filter((column) => column !== primaryKeyColumn);
  if (nonPkColumns.length === 0) {
    if (!entry?.sql) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
    }
    return [{sql: entry.sql, params: Array.isArray(entry.params) ? entry.params : []}];
  }
  const bindsPerRow = 2 * nonPkColumns.length + 1;
  const rowLimit = Math.max(
    1,
    Math.floor(SPLIT_SNAPSHOT_MAX_BIND_VARIABLES / bindsPerRow),
  );
  const batches = [];
  for (let offset = 0; offset < partitionRows.length; offset += rowLimit) {
    const proposalRows = partitionRows.slice(offset, offset + rowLimit);
    if (proposalRows.length === 1) {
      const row = proposalRows[0];
      const setClause = nonPkColumns
        .map((column) => `${column}${SPLIT_ROUTING_SQL.EQUALS_PLACEHOLDER}`)
        .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      batches.push({
        sql:
          `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ` +
          `${SQL.WHERE} ${primaryKeyColumn}${SPLIT_ROUTING_SQL.EQUALS_PLACEHOLDER}`,
        params: [
          ...nonPkColumns.map((column) => row[column]),
          row[primaryKeyColumn],
        ],
      });
    } else {
      const whenClauses = proposalRows
        .map(() => SPLIT_ROUTING_SQL.WHEN_THEN_PLACEHOLDER)
        .join(SPLIT_ROUTING_SQL.SPACE);
      const setClause = nonPkColumns
        .map(
          (column) =>
            `${column} = ${SPLIT_ROUTING_SQL.CASE} ${primaryKeyColumn} ` +
            `${whenClauses} ${SPLIT_ROUTING_SQL.END}`,
        )
        .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      const inPlaceholders = proposalRows
        .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
        .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
      batches.push({
        sql:
          `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ` +
          `${SQL.WHERE} ${primaryKeyColumn} ${SQL.IN} (${inPlaceholders})`,
        params: [
          ...nonPkColumns.flatMap((column) =>
            proposalRows.flatMap((row) => [row[primaryKeyColumn], row[column]]),
          ),
          ...proposalRows.map((row) => row[primaryKeyColumn]),
        ],
      });
    }
  }
  return batches;
}

function buildProjectedUpsertBatches(partitionRows, tableName) {
  const columns = Object.keys(partitionRows[0] || {});
  if (columns.length === 0) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }
  const columnList = columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const placeholders = columns
    .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
    .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
  const rowLimit = resolveSplitSnapshotBatchRowLimit(
    columns,
    partitionRows.length,
  );
  const batches = [];
  for (let offset = 0; offset < partitionRows.length; offset += rowLimit) {
    const proposalRows = partitionRows.slice(offset, offset + rowLimit);
    const values = proposalRows
      .map(() => `(${placeholders})`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    batches.push({
      sql:
        `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columnList}) ` +
        `${SQL.VALUES} ${values}`,
      params: proposalRows.flatMap((row) =>
        columns.map((column) => row[column]),
      ),
    });
  }
  return batches;
}

function buildProjectedChildBatches(
  entry,
  partitionRows,
  primaryKeyColumn,
  tableName,
) {
  const operationType = resolveSplitOperationType(entry);
  if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
    return buildProjectedDeleteBatches(
      partitionRows,
      primaryKeyColumn,
      tableName,
    );
  } else if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
    return buildProjectedUpdateBatches(
      entry,
      partitionRows,
      primaryKeyColumn,
      tableName,
    );
  }
  return buildProjectedUpsertBatches(partitionRows, tableName);
}

async function routeProjectedSplitChildWrites(
  entry,
  rowsByPartition,
  metadata,
  options = {},
) {
  const tableName = resolveSplitEntryTableName(entry, options);
  if (!tableName) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }
  const baseIdentity = extractSplitMirrorIdentity(entry);
  const settledPartitions = Array.isArray(entry?.settledTargetPartitionIds) ?
    new Set(entry.settledTargetPartitionIds) :
    new Set();

  for (const [partitionId, partitionRows] of rowsByPartition) {
    if (settledPartitions.has(partitionId)) {
      continue;
    }
    const batches = buildProjectedChildBatches(
      entry,
      partitionRows,
      metadata.primaryKeyColumn,
      tableName,
    );
    for (let index = 0; index < batches.length; index += 1) {
      assertSplitRoutingDescriptorEpoch(metadata, options);
      const chunkIdentity =
        index === 0 || !baseIdentity.entryId ?
          baseIdentity :
          {
            ...baseIdentity,
            entryId: `${baseIdentity.entryId}${SPLIT_ROUTING_SQL.COLON}${index}`,
          };
      await routeSplitMirroredWrite(
        partitionId,
        batches[index].sql,
        batches[index].params,
        {
          ...chunkIdentity,
          ...options,
        },
      );
    }
    settledPartitions.add(partitionId);
    if (entry && !Object.isFrozen(entry)) {
      entry.settledTargetPartitionIds = [...settledPartitions];
    }
  }
}

export async function replaySplitEntry(entry, metadata, options = {}) {
  assertSplitRoutingDescriptorEpoch(metadata, options);
  if (isNoOpSplitEntry(entry)) {
    return;
  }
  if (Array.isArray(entry?.affectedRows) && entry.affectedRows.length > 0) {
    const rowsByPartition = groupAffectedRowsByTargetPartition(
      entry.affectedRows,
      metadata.primaryKeyColumn,
      metadata,
    );
    if (shouldProjectAffectedRowsToChildren(entry, rowsByPartition)) {
      await routeProjectedSplitChildWrites(
        entry,
        rowsByPartition,
        metadata,
        options,
      );
      return;
    }
  }
  const routingKey = extractSplitRoutingKey(
    entry,
    metadata.primaryKeyColumn,
    {...options, metadata},
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

// Split-key comparison is owned by split-key-comparator.js (F12): every
// split routing decision (mirror replay, snapshot batching, service
// wrappers) shares exactly one comparator. Never reintroduce a raw
// relational comparison at a call site — mixed-type key spaces must
// reject, never coerce.
export {
  compareSplitKey,
  resolveSplitTargetPartitionId,
} from './split-key-comparator.js';

function extractAffectedRowRoutingKey(entry, primaryKeyColumn, metadata) {
  if (!Array.isArray(entry?.affectedRows) || entry.affectedRows.length === 0) {
    return void 0;
  }
  const firstRow = entry.affectedRows[0];
  if (!hasOwnedProperty(firstRow, primaryKeyColumn)) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }
  const firstKey = firstRow[primaryKeyColumn];
  if (firstKey === null || firstKey === void 0) {
    throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
  }
  if (entry.affectedRows.length > 1 && metadata) {
    const firstTarget = resolveSplitTargetPartitionId(firstKey, metadata);
    for (let i = 1; i < entry.affectedRows.length; i += 1) {
      const row = entry.affectedRows[i];
      if (!hasOwnedProperty(row, primaryKeyColumn)) {
        throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
      }
      const nextTarget = resolveSplitTargetPartitionId(row[primaryKeyColumn], metadata);
      if (nextTarget !== firstTarget) {
        throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
      }
    }
  }
  return firstKey;
}

export function extractSplitRoutingKey(
  entry,
  primaryKeyColumn,
  options = {},
) {
  const affectedRowKey = extractAffectedRowRoutingKey(
    entry,
    primaryKeyColumn,
    options.metadata,
  );
  if (affectedRowKey !== void 0) {
    return affectedRowKey;
  }
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
