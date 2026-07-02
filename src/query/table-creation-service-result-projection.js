/**
 * Table Creation Service - PRIMARY KEY validation and partition transparency.
 * Owns PRIMARY KEY validation for user tables and the stripping of internal
 * partition details from query results (Requirement 20.10).
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';
import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';


/**
 * Validate that a table has a PRIMARY KEY.
 * Requirement 20.2: Require PRIMARY KEY for user tables.
 * @param {Object} ast - Parsed CREATE TABLE AST.
 * @return {Object} Validation result.
 */
function validatePrimaryKey(ast) {
  const {tableName, columns, primaryKey} = ast;

  // Check for table-level PRIMARY KEY constraint
  if (primaryKey && primaryKey.length > 0) {
    return {
      valid: true,
      primaryKey,
      source: TABLE_CREATION_SERVICE_LITERAL.TABLE_CONSTRAINT,
    };
  }

  // Check for column-level PRIMARY KEY
  const pkColumns = columns.filter((col) => col.primaryKey);
  if (pkColumns.length > 0) {
    return {
      valid: true,
      primaryKey: pkColumns.map((col) => col.name),
      source: TABLE_CREATION_SERVICE_LITERAL.COLUMN_CONSTRAINT,
    };
  }
  return {
    valid: false,
    error:
      `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
      QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX,
    code: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
  };
}

/**
 * Strip partition details from query results.
 * Requirement 20.10: Never expose partition details in query results.
 * Note: We keep high-level partition metadata (like which partitions were queried)
 * but strip internal partition details from individual rows.
 * @param {Object} result - Query result.
 * @return {Object} Result with internal partition details stripped.
 */
function stripPartitionDetails(result) {
  if (!result) {
    return result;
  }

  // Create a copy to avoid mutating the original
  const stripped = {
    ...result,
  };

  // Remove internal partition-related fields from top-level result
  // Keep 'partitions' array as it's useful metadata about which partitions were queried
  delete stripped.sourcePartition;
  delete stripped.partition_key_start;
  delete stripped.partition_key_end;

  // Strip internal partition details from rows if present
  if (Array.isArray(stripped.rows)) {
    stripped.rows = stripped.rows.map((row) => {
      const cleanRow = {
        ...row,
      };
      // Remove internal partition tracking fields
      delete cleanRow._partition_id;
      delete cleanRow._partitionId;
      delete cleanRow._sourcePartition;
      return cleanRow;
    });
  }
  return stripped;
}

/**
 * Check if a field name is a partition-related field.
 * @param {string} fieldName - Field name to check.
 * @return {boolean} True if partition-related.
 */
function isPartitionField(fieldName) {
  const partitionFields = new Set([
    'partition_id',
    'partitionId',
    '_partition_id',
    '_partitionId',
    'partition_key_start',
    'partition_key_end',
    'partitionKeyStart',
    'partitionKeyEnd',
    'sourcePartition',
  ]);
  return partitionFields.has(fieldName);
}

const RESULT_PROJECTION_METHODS = Object.freeze({
  validatePrimaryKey,
  stripPartitionDetails,
  isPartitionField,
});

function defineTableCreationResultProjection(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    RESULT_PROJECTION_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationResultProjection};
