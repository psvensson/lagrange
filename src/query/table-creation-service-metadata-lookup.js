/**
 * Table Creation Service - Table and partition metadata lookup.
 * Owns the three-state lookups of table and partition rows against the
 * control-plane authority, plus partition-key and schema accessors.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {TABLES} from '../constants/index.js';
import {isAuthoritativeControlPlaneRowReadSuccessful} from
  '../control-plane/control-plane-system-table-gateway.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {SCHEMA_PROVISIONING_DEFAULT} from './schema-provisioning-job-constants.js';
import {
  METADATA_AUTHORITY_REFRESH_OUTCOME,
  METADATA_AUTHORITY_UNAVAILABLE_REASON,
} from './metadata-authority-outcome-constants.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_SQL,
} from './table-creation-service-completion.js';

const TABLE_LIFECYCLE_READ_PROFILE = 'table_lifecycle';
const METADATA_LOOKUP_UNAVAILABLE_REASON_CODE = 'table_metadata_lookup_unavailable';
const GATEWAY_ABSENT_CAUSE = 'control_plane_gateway_absent';

function lookupAnswer(outcome, row = null, reason = null) {
  return Object.freeze({outcome, row, reason});
}

// The metadata owner's three-state answer (METADATA_AUTHORITY_REFRESH_OUTCOME)
// for one keyed row, decided by the authority alone (R10: the cache is a
// projection, never the answer to "does it exist"): only an explicit success
// decides FOUND or ABSENT; every other answer (no gateway, a failed or
// thrown read) is UNAVAILABLE with its cause.
async function lookupMetadataRecord(service, tableName, sql, key) {
  const unavailable = (cause) => lookupAnswer(
    METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE, null,
    {code: METADATA_AUTHORITY_UNAVAILABLE_REASON.AUTHORITY_READ_FAILED, cause});
  const gateway = service.getControlPlaneSystemTableGateway();
  if (!gateway) return unavailable(GATEWAY_ABSENT_CAUSE);
  let result;
  try {
    result = await gateway.readRows(tableName, sql, [key],
      {readProfile: TABLE_LIFECYCLE_READ_PROFILE});
  } catch (error) {
    return unavailable(error?.message ?? String(error));
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
    return unavailable(result?.error ?? result?.outcome ?? null);
  }
  return result.rows.length > 0 ?
    lookupAnswer(METADATA_AUTHORITY_REFRESH_OUTCOME.FOUND, result.rows[0]) :
    lookupAnswer(METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT);
}

/**
 * The typed retryable refusal of a create step whose metadata lookup is
 * UNAVAILABLE: the durable schema job keeps the job PENDING and retries
 * (PROVISIONING_UNAVAILABLE); nothing is written.
 * @param {string} subject What was looked up (table or partition).
 * @param {Object} lookup The UNAVAILABLE lookup answer.
 * @return {Error}
 */
function metadataLookupUnavailableError(subject, lookup) {
  const reasons = [METADATA_LOOKUP_UNAVAILABLE_REASON_CODE];
  const retryAfterMs = SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS;
  return Object.assign(new Error(
    `Provisioning unavailable: metadata of ${subject} cannot be read ` +
    `(${lookup.reason?.cause ?? lookup.reason?.code}); not treated as absent`), {
    code: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
    errorCode: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
    epoch: null, reasons, retryAfterMs,
    detail: {epoch: null, reasons, retryAfterMs, lookup: lookup.reason},
  });
}


const METADATA_LOOKUP_METHODS = Object.freeze({
  /**
   * Look up one table metadata row from its authority: FOUND, ABSENT only
   * on the authority's explicit empty success, UNAVAILABLE when the
   * authority cannot answer (never read as "the table does not exist").
   * @param {string} tableName
   * @return {Promise<Object>} {outcome, row, reason}
   * @private
   */
  lookupTableRecord(tableName) {
    return lookupMetadataRecord(this, TABLES.TABLES,
      TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME, tableName);
  },

  /**
   * Look up one partition metadata row with the same three outcomes.
   * @param {string} partitionId
   * @return {Promise<Object>} {outcome, row, reason}
   * @private
   */
  lookupPartitionRecord(partitionId) {
    return lookupMetadataRecord(this, TABLES.PARTITIONS,
      TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID, partitionId);
  },

  /**
   * Get partition key for a table.
   * @param {string} tableName - Table name.
   * @return {string|null} Partition key or null.
   */
  getPartitionKey(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        return table?.partition_key || table?.partitionKey || null;
      }
    } catch {
      // Cache not available
    }
    return null;
  },

  /**
   * Get table schema.
   * @param {string} tableName - Table name.
   * @return {Object|null} Schema definition or null.
   */
  getTableSchema(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        if (table?.schema_definition) {
          return JSON.parse(table.schema_definition);
        }
        if (table?.schemaDefinition) {
          return JSON.parse(table.schemaDefinition);
        }
      }
    } catch {
      // Cache not available or parse error
    }
    return null;
  },
});

function defineTableCreationMetadataLookup(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    METADATA_LOOKUP_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationMetadataLookup, metadataLookupUnavailableError};
