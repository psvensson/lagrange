/**
 * Table Creation Service - Table and partition metadata lookup.
 * Owns cache-first reads of table and partition rows with authoritative
 * control-plane read through the validated gateway, boundary decoding into a
 * frozen canonical shape, and partition-key and schema accessors.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {TABLES} from '../constants/index.js';
import {
  SCHEMA_PROVISIONING_ERROR_CODE,
} from './schema-provisioning-job-constants.js';
import {
  TABLE_CREATION_SQL,
} from './table-creation-service-completion.js';

const TABLE_LIFECYCLE_READ_OPTIONS = Object.freeze({
  readProfile: 'table_lifecycle',
});
const METADATA_READ_UNAVAILABLE_PREFIX =
  'Authoritative control-plane metadata read is unavailable for ';

const CANONICAL_TABLE_RECORD_DEFAULTS = Object.freeze({
  table_id: null,
  table_name: null,
  partition_key: null,
  schema_definition: null,
  table_policies: null,
  partition_count: null,
  active_partition_version: null,
  pending_partition_version: null,
  partition_transition_metadata: null,
  created_at: null,
  updated_at: null,
});

const CANONICAL_PARTITION_RECORD_DEFAULTS = Object.freeze({
  partition_id: null,
  table_id: null,
  table_name: null,
  replica_count: null,
  partition_key_start: null,
  partition_key_end: null,
  partition_key_type: null,
  partition_version: null,
  size_bytes: null,
  leader_node_id: null,
  created_at: null,
  updated_at: null,
});

function decodeMetadataRecordWithDefaults(row, defaults) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const decoded = {...defaults, ...row};
  for (const key of Object.keys(defaults)) {
    if (decoded[key] === undefined) {
      decoded[key] = null;
    }
  }
  return Object.freeze(decoded);
}

/**
 * Decode a stored or cached table metadata row once into a frozen canonical
 * shape so internal callers read one field spelling.
 * @param {Object|null|undefined} row
 * @return {Object|null}
 */
function decodeTableMetadataRecord(row) {
  return decodeMetadataRecordWithDefaults(row, CANONICAL_TABLE_RECORD_DEFAULTS);
}

/**
 * Decode a stored or cached partition metadata row once into a frozen
 * canonical shape so internal callers read one field spelling.
 * @param {Object|null|undefined} row
 * @return {Object|null}
 */
function decodePartitionMetadataRecord(row) {
  return decodeMetadataRecordWithDefaults(
    row,
    CANONICAL_PARTITION_RECORD_DEFAULTS,
  );
}

function createMetadataPersistenceUnavailableError(targetLabel, detail = null) {
  const suffix = detail ? `: ${detail}` : '';
  const error = new Error(
    `${METADATA_READ_UNAVAILABLE_PREFIX}${targetLabel}${suffix}`,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
  return error;
}

function extractFirstGatewayRow(service, result, targetLabel) {
  if (service.cdcIntegrationService && result?.success === false) {
    throw createMetadataPersistenceUnavailableError(
      targetLabel,
      result?.error || null,
    );
  }
  const rows = result?.rows;
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function readMetadataRowFromGateway(
  service,
  tableName,
  sql,
  params,
  targetLabel,
) {
  const controlPlaneGateway = service.getControlPlaneSystemTableGateway();
  if (!controlPlaneGateway) {
    if (service.cdcIntegrationService) {
      throw createMetadataPersistenceUnavailableError(targetLabel);
    }
    return null;
  }
  try {
    const result = await controlPlaneGateway.readRows(
      tableName,
      sql,
      params,
      TABLE_LIFECYCLE_READ_OPTIONS,
    );
    return extractFirstGatewayRow(service, result, targetLabel);
  } catch (error) {
    error.code ??= SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
    throw error;
  }
}

/**
 * Resolve one canonical decoded table metadata row from cache.
 * @param {TableCreationService} service
 * @param {string} tableName
 * @return {Object|null}
 */
function getTableRecord(service, tableName) {
  if (!service.systemCache || !tableName) {
    return null;
  }
  const table = service.systemCache.find(
    TABLES.TABLES,
    (candidate) => candidate?.table_name === tableName,
  );
  return decodeTableMetadataRecord(table);
}

/**
 * Resolve one canonical decoded partition metadata row from cache.
 * @param {TableCreationService} service
 * @param {string} partitionId
 * @return {Object|null}
 */
function getPartitionRecord(service, partitionId) {
  if (!service.systemCache || !partitionId) {
    return null;
  }
  const partition = service.systemCache.find(
    TABLES.PARTITIONS,
    (candidate) => candidate?.partition_id === partitionId,
  );
  return decodePartitionMetadataRecord(partition);
}

/**
 * Check if a table exists in the local system cache.
 * @param {TableCreationService} service
 * @param {string} tableName - Table name.
 * @return {boolean} True if table exists.
 */
function tableExists(service, tableName) {
  return service.getTableRecord(tableName) !== null;
}

/**
 * Resolve one table metadata row, preferring cache and consulting the
 * authoritative control-plane gateway when cache visibility lags.
 * @param {TableCreationService} service
 * @param {string} tableName
 * @return {Promise<Object|null>}
 */
async function findExistingTableRecord(service, tableName) {
  const cachedTable = service.getTableRecord(tableName);
  if (cachedTable) {
    return cachedTable;
  }
  const row = await readMetadataRowFromGateway(
    service,
    TABLES.TABLES,
    TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME,
    [tableName],
    `table ${tableName}`,
  );
  return decodeTableMetadataRecord(row);
}

/**
 * Resolve one partition metadata row, preferring cache and consulting the
 * authoritative control-plane gateway when cache visibility lags.
 * @param {TableCreationService} service
 * @param {string} partitionId
 * @return {Promise<Object|null>}
 */
async function findExistingPartitionRecord(service, partitionId) {
  const cachedPartition = service.getPartitionRecord(partitionId);
  if (cachedPartition) {
    return cachedPartition;
  }
  const row = await readMetadataRowFromGateway(
    service,
    TABLES.PARTITIONS,
    TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID,
    [partitionId],
    `partition ${partitionId}`,
  );
  return decodePartitionMetadataRecord(row);
}

/**
 * Get partition key for a table from cache.
 * @param {TableCreationService} service
 * @param {string} tableName - Table name.
 * @return {string|null} Partition key or null.
 */
function getPartitionKey(service, tableName) {
  const table = service.getTableRecord(tableName);
  return table?.partition_key || null;
}

/**
 * Get parsed table schema from cache.
 * @param {TableCreationService} service
 * @param {string} tableName - Table name.
 * @return {Object|null} Schema definition or null.
 */
function getTableSchema(service, tableName) {
  const table = service.getTableRecord(tableName);
  if (!table?.schema_definition) {
    return null;
  }
  if (typeof table.schema_definition === 'string') {
    return JSON.parse(table.schema_definition);
  }
  return typeof table.schema_definition === 'object' ?
    table.schema_definition :
    null;
}

export {
  decodePartitionMetadataRecord,
  decodeTableMetadataRecord,
  findExistingPartitionRecord,
  findExistingTableRecord,
  getPartitionKey,
  getPartitionRecord,
  getTableRecord,
  getTableSchema,
  tableExists,
};
