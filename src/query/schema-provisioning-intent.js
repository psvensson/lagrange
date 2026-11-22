/**
 * Canonical durable intent projection for CREATE TABLE provisioning jobs.
 * Preserves column types, collations, nullability, uniqueness, CHECK SQL,
 * typed literal defaults, and table constraints across recovery.
 *
 * @module query/schema-provisioning-intent
 */

import {createHash} from 'node:crypto';
import {SQL_DEFAULT_COLLATION} from './parser-constants.js';
import {
  SCHEMA_PROVISIONING_DEFAULT,
  SCHEMA_PROVISIONING_INTENT_VERSION,
} from './schema-provisioning-job-constants.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== TYPEOF_OBJECT) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function digest(value) {
  return createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function normalizeColumn(column = {}) {
  return sortObject({
    name: String(column.name || '').trim(),
    dataType: column.dataType || null,
    collation: typeof column.collation === TYPEOF_STRING ?
      column.collation.toUpperCase() : SQL_DEFAULT_COLLATION,
    primaryKey: column.primaryKey === true,
    nullable: column.notNull !== true && column.nullable !== false,
    unique: column.unique === true,
    checkSql: column.checkSql || null,
    defaultValue: column.defaultValue ?? null,
    constraints: column.constraints || [],
  });
}

function resolveIdentityQualifier(options = {}) {
  const raw = options?.identityQualifier ??
    (Number.isSafeInteger(options?.globalIndex?.generation) &&
      options.globalIndex.generation > 1 ?
      `gen-${options.globalIndex.generation}` :
      null);
  return typeof raw === TYPEOF_STRING && raw.trim().length > 0 ?
    raw.trim() :
    null;
}

function resolveExplicitTableId(options = {}, ast = {}) {
  const raw = options?.tableId ?? ast?.options?.tableId;
  return typeof raw === TYPEOF_STRING && raw.trim().length > 0 ?
    raw.trim() :
    null;
}

function normalizePartitionSpec(spec = {}, index = 0, tableId = '') {
  const rawPartitionId = spec?.partitionId ?? spec?.partition_id;
  const partitionId = typeof rawPartitionId === TYPEOF_STRING &&
      rawPartitionId.trim().length > 0 ?
    rawPartitionId.trim() :
    `${tableId}-p${index + 1}`;
  const rawReplicaCount = spec?.replicaCount ?? spec?.replica_count;
  return sortObject({
    partitionId,
    partitionKeyStart: spec?.partitionKeyStart ?? spec?.partition_key_start ?? null,
    partitionKeyEnd: spec?.partitionKeyEnd ?? spec?.partition_key_end ?? null,
    partitionKeyType: spec?.partitionKeyType ?? spec?.partition_key_type ?? null,
    replicaCount: Number.isInteger(rawReplicaCount) && rawReplicaCount > 0 ?
      rawReplicaCount : null,
  });
}

function resolveExplicitPartitions(options = {}, ast = {}, tableId = '') {
  const rawList = Array.isArray(options?.partitions) ?
    options.partitions :
    ast?.options?.partitions;
  if (Array.isArray(rawList) && rawList.length > 0) {
    return rawList.map((spec, index) => normalizePartitionSpec(spec, index, tableId));
  }
  const rawPartitionId = options?.partitionId ?? ast?.options?.partitionId;
  if (typeof rawPartitionId === TYPEOF_STRING && rawPartitionId.trim().length > 0) {
    return [normalizePartitionSpec({partitionId: rawPartitionId.trim()}, 0, tableId)];
  }
  return null;
}

function resolveGlobalIndexSpec(options = {}, ast = {}) {
  const raw = options?.globalIndex ?? ast?.options?.globalIndex;
  return raw && typeof raw === TYPEOF_OBJECT ? sortObject(raw) : null;
}

function canonicalizeSchemaProvisioningIntent(ast = {}, options = {}) {
  const namespace = SCHEMA_PROVISIONING_DEFAULT.NAMESPACE;
  const tableName = String(ast.tableName || '');
  const qualifier = resolveIdentityQualifier(options) ||
    resolveIdentityQualifier(ast.options);
  const baseIdentityKey = `${namespace}.${tableName}`;
  const tableIdentityKey = qualifier ?
    `${baseIdentityKey}:${qualifier}` :
    baseIdentityKey;
  const identityDigest = digest(tableIdentityKey).slice(0, 32);
  const explicitTableId = resolveExplicitTableId(options, ast);
  const tableId = explicitTableId || `tbl-${identityDigest}`;
  const explicitPartitions = resolveExplicitPartitions(options, ast, tableId);
  const globalIndex = resolveGlobalIndexSpec(options, ast);
  const intent = sortObject({
    intentVersion: SCHEMA_PROVISIONING_INTENT_VERSION,
    namespace,
    tableName,
    columns: (Array.isArray(ast.columns) ? ast.columns : []).map(
      normalizeColumn,
    ),
    primaryKey: (Array.isArray(ast.primaryKey) ? ast.primaryKey : [])
      .map((columnName) => String(columnName || '').trim().toLowerCase()),
    tableConstraints: Array.isArray(ast.tableConstraints) ?
      ast.tableConstraints : [],
    options: ast.options || {},
    ...(explicitTableId ? {tableId: explicitTableId} : {}),
    ...(explicitPartitions ? {partitions: explicitPartitions} : {}),
    ...(globalIndex ? {globalIndex} : {}),
  });
  const normalizedDdl = JSON.stringify(intent);
  const intentHash = digest(normalizedDdl);
  const jobId = `schema-job-${identityDigest}`;
  const partitionId = explicitPartitions?.[0]?.partitionId || `${tableId}-p1`;
  return Object.freeze({
    intent: Object.freeze(intent),
    normalizedDdl,
    intentHash,
    idempotencyKey:
      `${SCHEMA_PROVISIONING_INTENT_VERSION}:${tableIdentityKey}:${intentHash}`,
    namespace,
    tableName,
    tableIdentityKey,
    jobId,
    workflowId: jobId,
    ownerKey: `schema:${tableIdentityKey}`,
    tableId,
    partitionId,
    ...(explicitPartitions ? {partitions: Object.freeze(explicitPartitions)} : {}),
    ...(globalIndex ? {globalIndex: Object.freeze(globalIndex)} : {}),
  });
}

export {canonicalizeSchemaProvisioningIntent};
