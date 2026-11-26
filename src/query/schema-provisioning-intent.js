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

function readTrimmedString(value) {
  return typeof value === TYPEOF_STRING && value.trim().length > 0 ?
    value.trim() :
    null;
}

function readPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizePartitionSpec(spec, index = 0, tableId = '') {
  const entry = spec || {};
  const partitionId = readTrimmedString(entry.partitionId) || `${tableId}-p${index + 1}`;
  return sortObject({
    partitionId,
    partitionKeyStart: entry.partitionKeyStart ?? null,
    partitionKeyEnd: entry.partitionKeyEnd ?? null,
    partitionKeyType: entry.partitionKeyType ?? null,
    replicaCount: readPositiveInteger(entry.replicaCount),
  });
}

function resolveExplicitPartitions(options = {}, tableId = '') {
  if (Array.isArray(options?.partitions) && options.partitions.length > 0) {
    return options.partitions.map((spec, index) => normalizePartitionSpec(spec, index, tableId));
  }
  const explicitId = readTrimmedString(options?.partitionId);
  return explicitId ? [normalizePartitionSpec({partitionId: explicitId}, 0, tableId)] : null;
}

function resolveGlobalIndexSpec(options = {}) {
  const raw = options?.globalIndex;
  return raw && typeof raw === TYPEOF_OBJECT ? sortObject(raw) : null;
}

function resolveIntentTableIdentity(ast, options) {
  const namespace = SCHEMA_PROVISIONING_DEFAULT.NAMESPACE;
  const tableName = String(ast.tableName || '');
  const qualifier = resolveIdentityQualifier(options) ||
    resolveIdentityQualifier(ast.options);
  const baseIdentityKey = `${namespace}.${tableName}`;
  const tableIdentityKey = qualifier ? `${baseIdentityKey}:${qualifier}` : baseIdentityKey;
  const identityDigest = digest(tableIdentityKey).slice(0, 32);
  return {namespace, tableName, tableIdentityKey, identityDigest};
}

function buildExtraIntentFields(options, tableId, defaultPartitionId) {
  const explicitTableId = readTrimmedString(options?.tableId);
  const explicitPartitions = resolveExplicitPartitions(options, tableId);
  const globalIndex = resolveGlobalIndexSpec(options);
  const partitionId = explicitPartitions ? explicitPartitions[0].partitionId : defaultPartitionId;
  return {
    explicitTableId,
    explicitPartitions,
    globalIndex,
    partitionId,
    extraFields: {
      ...(explicitTableId ? {tableId: explicitTableId} : {}),
      ...(explicitPartitions ? {partitions: explicitPartitions} : {}),
      ...(globalIndex ? {globalIndex} : {}),
    },
  };
}

function buildCanonicalDdlPayload(ast, extraFields) {
  const cols = Array.isArray(ast.columns) ? ast.columns : [];
  const pk = Array.isArray(ast.primaryKey) ? ast.primaryKey : [];
  const constraints = Array.isArray(ast.tableConstraints) ? ast.tableConstraints : [];
  return sortObject({
    intentVersion: SCHEMA_PROVISIONING_INTENT_VERSION,
    namespace: SCHEMA_PROVISIONING_DEFAULT.NAMESPACE,
    tableName: String(ast.tableName || ''),
    columns: cols.map(normalizeColumn),
    primaryKey: pk.map((columnName) => String(columnName || '').trim().toLowerCase()),
    tableConstraints: constraints,
    options: ast.options || {},
    ...extraFields,
  });
}

function canonicalizeSchemaProvisioningIntent(ast = {}, options = {}) {
  const {
    namespace,
    tableName,
    tableIdentityKey,
    identityDigest,
  } = resolveIntentTableIdentity(ast, options);
  const explicitTableId = readTrimmedString(options?.tableId);
  const tableId = explicitTableId || `tbl-${identityDigest}`;
  const defaultPartitionId = `${tableId}-p1`;
  const {
    explicitPartitions,
    globalIndex,
    partitionId,
    extraFields,
  } = buildExtraIntentFields(options, tableId, defaultPartitionId);
  const intent = buildCanonicalDdlPayload(ast, extraFields);
  const normalizedDdl = JSON.stringify(intent);
  const intentHash = digest(normalizedDdl);
  const jobId = `schema-job-${identityDigest}`;
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

export {canonicalizeSchemaProvisioningIntent, resolveIntentTableIdentity};
