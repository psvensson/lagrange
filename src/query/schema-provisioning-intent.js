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

function canonicalizeSchemaProvisioningIntent(ast = {}, options = {}) {
  const namespace = SCHEMA_PROVISIONING_DEFAULT.NAMESPACE;
  const tableName = String(ast.tableName || '');
  const qualifier = resolveIdentityQualifier(options) ||
    resolveIdentityQualifier(ast.options);
  const baseIdentityKey = `${namespace}.${tableName}`;
  const tableIdentityKey = qualifier ?
    `${baseIdentityKey}:${qualifier}` :
    baseIdentityKey;
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
  });
  const normalizedDdl = JSON.stringify(intent);
  const intentHash = digest(normalizedDdl);
  const identityDigest = digest(tableIdentityKey).slice(0, 32);
  const jobId = `schema-job-${identityDigest}`;
  const tableId = `tbl-${identityDigest}`;
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
    partitionId: `${tableId}-p1`,
  });
}

export {canonicalizeSchemaProvisioningIntent};
