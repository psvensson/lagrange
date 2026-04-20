import { NUM, SQL } from "../constants/index.js";
import { PARTITION_SPLIT_MIRROR_ORIGIN } from "./partition-constants.js";
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_TYPE,
} from "./partition-service-constants.js";
import {
  extractDataFromParameterizedSQL,
  extractDeleteDataFromSQL,
  extractInsertDataFromSQL,
  extractUpdateDataFromSQL,
} from "./partition-sql-parser.js";

const SPLIT_ROUTING_LITERAL = Object.freeze({
  OBJECT: "object",
});

function hasOwnedProperty(record, propertyName) {
  if (!record || typeof record !== SPLIT_ROUTING_LITERAL.OBJECT) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(record, propertyName);
}

function resolveSplitOperationType(entry) {
  let operationType = entry?.type || PARTITION_SERVICE_OPERATION.QUERY;
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
      params.length > NUM.ZERO &&
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
        { ...entry.data } :
        entry?.data,
    whereClause:
      entry?.whereClause &&
      typeof entry.whereClause === SPLIT_ROUTING_LITERAL.OBJECT ?
        { ...entry.whereClause } :
        entry?.whereClause,
  };
}

export async function replaySplitEntry(entry, metadata, options = {}) {
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
    options,
  );
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

  const result = await queryExecutor.executeOnPartition(
    partitionId,
    sql,
    params,
    false,
    true,
    false,
    { splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SOURCE },
  );
  if (!result?.success) {
    throw new Error(
      result?.error || PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
    );
  }
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
