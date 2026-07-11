import {createHash} from 'node:crypto';
import {
  SCHEMA_PROVISIONING_DEFAULT,
  SCHEMA_PROVISIONING_INTENT_VERSION,
} from './schema-provisioning-job-constants.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== 'object') {
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
    primaryKey: column.primaryKey === true,
    nullable: column.nullable !== false,
    unique: column.unique === true,
    defaultValue: column.defaultValue ?? column.default ?? null,
    constraints: column.constraints || [],
  });
}

function canonicalizeSchemaProvisioningIntent(ast = {}) {
  const namespace = SCHEMA_PROVISIONING_DEFAULT.NAMESPACE;
  const tableName = String(ast.tableName || '').trim().toLowerCase();
  const tableIdentityKey = `${namespace}.${tableName}`;
  const intent = sortObject({
    intentVersion: SCHEMA_PROVISIONING_INTENT_VERSION,
    namespace,
    tableName,
    columns: (Array.isArray(ast.columns) ? ast.columns : []).map(
      normalizeColumn,
    ),
    primaryKey: (Array.isArray(ast.primaryKey) ? ast.primaryKey : [])
      .map((columnName) => String(columnName || '').trim().toLowerCase()),
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
