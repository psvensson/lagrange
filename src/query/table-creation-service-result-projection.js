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

const LAZY_ROWS_GETTER_SYMBOL = Symbol.for('lagrange.query.lazyRowsGetter');
const PROP_ROWS = 'rows';
const INTERNAL_PARTITION_ROW_FIELD = Object.freeze({
  PARTITION_ID_SNAKE: '_partition_id',
  PARTITION_ID_CAMEL: '_partitionId',
  SOURCE_PARTITION: '_sourcePartition',
});

function hasInternalPartitionRowField(row) {
  return Boolean(
    row &&
      typeof row === 'object' &&
      (INTERNAL_PARTITION_ROW_FIELD.PARTITION_ID_SNAKE in row ||
        INTERNAL_PARTITION_ROW_FIELD.PARTITION_ID_CAMEL in row ||
        INTERNAL_PARTITION_ROW_FIELD.SOURCE_PARTITION in row),
  );
}

function stripInternalPartitionFieldsFromRows(rows) {
  if (!Array.isArray(rows) || !rows.some(hasInternalPartitionRowField)) {
    return rows;
  }
  return rows.map((row) => {
    const cleanRow = {
      ...row,
    };
    delete cleanRow._partition_id;
    delete cleanRow._partitionId;
    delete cleanRow._sourcePartition;
    return cleanRow;
  });
}

function attachStrippedLazyRows(target, sourceResult) {
  let cachedRows = null;
  const getRows = () => {
    if (cachedRows === null) {
      cachedRows = stripInternalPartitionFieldsFromRows(sourceResult.rows);
    }
    return cachedRows;
  };
  Object.defineProperty(target, LAZY_ROWS_GETTER_SYMBOL, {
    value: getRows,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, PROP_ROWS, {
    enumerable: true,
    configurable: true,
    get() {
      const receiver = this && typeof this === 'object' ? this : target;
      const materialized = getRows();
      Object.defineProperty(target, PROP_ROWS, {
        value: materialized,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      if (receiver !== target) {
        Object.defineProperty(receiver, PROP_ROWS, {
          value: materialized,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return materialized;
    },
    set(nextRows) {
      const receiver = this && typeof this === 'object' ? this : target;
      Object.defineProperty(receiver, PROP_ROWS, {
        value: nextRows,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
  });
  return target;
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
  if (!result || typeof result !== 'object') {
    return result;
  }

  const rowsDescriptor = Object.getOwnPropertyDescriptor(result, PROP_ROWS);
  const hasLazyRows = Boolean(rowsDescriptor?.get);
  const stripped = {};
  for (const key of Object.keys(result)) {
    if (hasLazyRows && key === PROP_ROWS) {
      continue;
    }
    stripped[key] = result[key];
  }

  // Remove internal partition-related fields from top-level result
  // Keep 'partitions' array as it's useful metadata about which partitions were queried
  delete stripped.sourcePartition;
  delete stripped.partition_key_start;
  delete stripped.partition_key_end;
  delete stripped.partition_key_type;
  delete stripped.partitionKeyType;

  if (hasLazyRows) {
    return attachStrippedLazyRows(stripped, result);
  }
  if (Array.isArray(stripped.rows)) {
    stripped.rows = stripInternalPartitionFieldsFromRows(stripped.rows);
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
    'partition_key_type',
    'partitionKeyStart',
    'partitionKeyEnd',
    'partitionKeyType',
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
