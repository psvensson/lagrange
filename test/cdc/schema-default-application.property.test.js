/**
 * Property test for Schema Default Application Completeness.
 *
 * Property 5: For any table schema with columns that have default values,
 * and any input data object missing those columns, prepareInsertData SHALL
 * return data with all schema defaults applied for missing fields.
 *
 * **Validates: Requirements 4.6**
 *
 * Feature: test-coverage-improvements
 * Property: Schema Default Application Completeness
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  SystemTableName,
  SYSTEM_TABLE_SCHEMAS,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCSqlBuilder} from '../../src/cdc/cdc-sql-builder.js';

/**
 * Initialize test environment with required singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

beforeEach(() => {
  initializeTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

/**
 * Get all system table names that have columns with default values.
 * @return {Array<string>} Array of table names with default columns.
 */
function getTablesWithDefaults() {
  return SYSTEM_TABLE_SCHEMAS
    .filter((schema) => schema.columns.some((col) => col.defaultValue !== undefined))
    .map((schema) => schema.tableName);
}

/**
 * Get columns with default values for a given table.
 * @param {string} tableName - System table name.
 * @return {Array<Object>} Array of column definitions with defaults.
 */
function getColumnsWithDefaults(tableName) {
  const schema = getSchemaByTableName(tableName);
  if (!schema) {
    return [];
  }
  return schema.columns.filter((col) => col.defaultValue !== undefined);
}

/**
 * Get the primary key field name for a table.
 * @param {string} tableName - System table name.
 * @return {string|null} Primary key field name.
 */
function getPrimaryKeyField(tableName) {
  const schema = getSchemaByTableName(tableName);
  if (!schema) {
    return null;
  }
  const pkColumn = schema.columns.find((col) => col.primaryKey);
  return pkColumn ? pkColumn.name : null;
}

/**
 * Get required columns (notNull without defaults) for a table.
 * @param {string} tableName - System table name.
 * @return {Array<Object>} Array of required column definitions.
 */
function getRequiredColumnsWithoutDefaults(tableName) {
  const schema = getSchemaByTableName(tableName);
  if (!schema) {
    return [];
  }
  return schema.columns.filter((col) =>
    col.notNull && col.defaultValue === undefined && !col.primaryKey,
  );
}

/**
 * Generate minimal valid data for a table (only required fields).
 * @param {string} tableName - System table name.
 * @return {Object} Minimal valid data object.
 */
function generateMinimalData(tableName) {
  const data = {};
  const requiredCols = getRequiredColumnsWithoutDefaults(tableName);

  for (const col of requiredCols) {
    switch (col.type) {
    case 'TEXT':
      data[col.name] = `test-${col.name}`;
      break;
    case 'INTEGER':
      data[col.name] = 1;
      break;
    case 'REAL':
      data[col.name] = 1.0;
      break;
    default:
      data[col.name] = `test-${col.name}`;
    }
  }

  return data;
}

/**
 * Normalize a default value using the same logic as CDCSqlBuilder.
 * @param {string|number|null} value - Default value from schema.
 * @return {string|number|null} Normalized default value.
 */
function normalizeDefaultValue(value) {
  const builder = new CDCSqlBuilder();
  return builder.normalizeDefaultValue(value);
}

/**
 * Arbitrary for selecting a random system table with default columns.
 */
const tableWithDefaultsArb = fc.constantFrom(...getTablesWithDefaults());

/**
 * Property 5: Schema Default Application Completeness
 *
 * For any table schema with columns that have default values, and any input
 * data object missing those columns, prepareInsertData SHALL return data
 * with all schema defaults applied for missing fields.
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData applies schema defaults for missing fields', async (t) => {
  fc.assert(
    fc.property(
      tableWithDefaultsArb,
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const columnsWithDefaults = getColumnsWithDefaults(tableName);
        const minimalData = generateMinimalData(tableName);

        const result = service.prepareInsertData(tableName, minimalData);

        for (const col of columnsWithDefaults) {
          const expectedDefault = normalizeDefaultValue(col.defaultValue);
          if (result[col.name] === undefined) {
            return false;
          }
          if (result[col.name] !== expectedDefault) {
            const isTimestampCol = col.name === 'created_at' || col.name === 'updated_at';
            if (!isTimestampCol) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData applies schema defaults for missing fields');
});

/**
 * Property: Schema defaults are not overwritten when values are provided.
 *
 * For any table schema with columns that have default values, if the input
 * data already contains values for those columns, prepareInsertData SHALL
 * preserve the provided values and not overwrite them with defaults.
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData preserves provided values over defaults', async (t) => {
  fc.assert(
    fc.property(
      tableWithDefaultsArb,
      fc.integer({min: 1, max: 1000}),
      (tableName, customValue) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const columnsWithDefaults = getColumnsWithDefaults(tableName);
        const minimalData = generateMinimalData(tableName);

        for (const col of columnsWithDefaults) {
          if (col.type === 'INTEGER' || col.type === 'REAL') {
            minimalData[col.name] = customValue;
          } else if (col.type === 'TEXT') {
            minimalData[col.name] = `custom-${customValue}`;
          }
        }

        const result = service.prepareInsertData(tableName, minimalData);

        for (const col of columnsWithDefaults) {
          if (col.type === 'INTEGER' || col.type === 'REAL') {
            if (result[col.name] !== customValue) {
              return false;
            }
          } else if (col.type === 'TEXT') {
            if (result[col.name] !== `custom-${customValue}`) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData preserves provided values over defaults');
});

/**
 * Property: Primary key is generated when missing.
 *
 * For any table schema, if the input data does not contain the primary key,
 * prepareInsertData SHALL generate a UUID for the primary key field.
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData generates primary key when missing', async (t) => {
  const allTables = Object.values(SystemTableName);

  fc.assert(
    fc.property(
      fc.constantFrom(...allTables),
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const pkField = getPrimaryKeyField(tableName);
        if (!pkField) {
          return true;
        }

        const minimalData = generateMinimalData(tableName);
        delete minimalData[pkField];

        const result = service.prepareInsertData(tableName, minimalData);

        if (!result[pkField]) {
          return false;
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(result[pkField]);
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData generates primary key when missing');
});

/**
 * Property: All columns in result are valid schema columns.
 *
 * For any table schema and input data, prepareInsertData SHALL only return
 * columns that exist in the schema (no extra columns).
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData only returns valid schema columns', async (t) => {
  const allTables = Object.values(SystemTableName);

  fc.assert(
    fc.property(
      fc.constantFrom(...allTables),
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const schema = getSchemaByTableName(tableName);
        if (!schema) {
          return true;
        }

        const validColumnNames = new Set(schema.columns.map((col) => col.name));
        const minimalData = generateMinimalData(tableName);
        minimalData.invalid_column = 'should_be_filtered';

        const result = service.prepareInsertData(tableName, minimalData);

        for (const key of Object.keys(result)) {
          if (!validColumnNames.has(key)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData only returns valid schema columns');
});

/**
 * Property: Timestamp defaults are applied for created_at and updated_at.
 *
 * For any table schema with created_at or updated_at columns, if those
 * columns are missing from input, prepareInsertData SHALL apply timestamp
 * defaults (current time).
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData applies timestamp defaults', async (t) => {
  const tablesWithTimestamps = SYSTEM_TABLE_SCHEMAS
    .filter((schema) => schema.columns.some((col) =>
      col.name === 'created_at' || col.name === 'updated_at',
    ))
    .map((schema) => schema.tableName);

  fc.assert(
    fc.property(
      fc.constantFrom(...tablesWithTimestamps),
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const schema = getSchemaByTableName(tableName);
        const hasCreatedAt = schema.columns.some((col) => col.name === 'created_at');
        const hasUpdatedAt = schema.columns.some((col) => col.name === 'updated_at');

        const minimalData = generateMinimalData(tableName);
        delete minimalData.created_at;
        delete minimalData.updated_at;

        const beforeTime = Date.now();
        const result = service.prepareInsertData(tableName, minimalData);
        const afterTime = Date.now();

        if (hasCreatedAt) {
          if (typeof result.created_at !== 'number') {
            return false;
          }
          if (result.created_at < beforeTime || result.created_at > afterTime) {
            return false;
          }
        }

        if (hasUpdatedAt) {
          if (typeof result.updated_at !== 'number') {
            return false;
          }
          if (result.updated_at < beforeTime || result.updated_at > afterTime) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData applies timestamp defaults');
});

/**
 * Property: Numeric defaults are correctly normalized.
 *
 * For any table schema with numeric default values (INTEGER or REAL),
 * prepareInsertData SHALL normalize string defaults to numbers.
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData normalizes numeric defaults', async (t) => {
  const tablesWithNumericDefaults = SYSTEM_TABLE_SCHEMAS
    .filter((schema) => schema.columns.some((col) =>
      (col.type === 'INTEGER' || col.type === 'REAL') &&
      col.defaultValue !== undefined &&
      typeof col.defaultValue === 'number',
    ))
    .map((schema) => schema.tableName);

  if (tablesWithNumericDefaults.length === 0) {
    t.pass('No tables with numeric defaults to test');
    return;
  }

  fc.assert(
    fc.property(
      fc.constantFrom(...tablesWithNumericDefaults),
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const schema = getSchemaByTableName(tableName);
        const numericDefaultCols = schema.columns.filter((col) =>
          (col.type === 'INTEGER' || col.type === 'REAL') &&
          col.defaultValue !== undefined &&
          typeof col.defaultValue === 'number',
        );

        const minimalData = generateMinimalData(tableName);
        for (const col of numericDefaultCols) {
          delete minimalData[col.name];
        }

        const result = service.prepareInsertData(tableName, minimalData);

        for (const col of numericDefaultCols) {
          if (typeof result[col.name] !== 'number') {
            return false;
          }
          if (result[col.name] !== col.defaultValue) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData normalizes numeric defaults');
});

/**
 * Property: String defaults with quotes are correctly normalized.
 *
 * For any table schema with string default values wrapped in quotes,
 * prepareInsertData SHALL strip the quotes and return the inner string.
 *
 * **Validates: Requirements 4.6**
 */
test('Property: prepareInsertData normalizes quoted string defaults', async (t) => {
  const tablesWithQuotedDefaults = SYSTEM_TABLE_SCHEMAS
    .filter((schema) => schema.columns.some((col) =>
      col.type === 'TEXT' &&
      col.defaultValue !== undefined &&
      typeof col.defaultValue === 'string' &&
      (col.defaultValue.startsWith('\'') || col.defaultValue.startsWith('"')),
    ))
    .map((schema) => schema.tableName);

  if (tablesWithQuotedDefaults.length === 0) {
    t.pass('No tables with quoted string defaults to test');
    return;
  }

  fc.assert(
    fc.property(
      fc.constantFrom(...tablesWithQuotedDefaults),
      (tableName) => {
        const service = new CDCIntegrationService({
          nodeId: 'test-node',
        });

        const schema = getSchemaByTableName(tableName);
        const quotedDefaultCols = schema.columns.filter((col) =>
          col.type === 'TEXT' &&
          col.defaultValue !== undefined &&
          typeof col.defaultValue === 'string' &&
          (col.defaultValue.startsWith('\'') || col.defaultValue.startsWith('"')),
        );

        const minimalData = generateMinimalData(tableName);
        for (const col of quotedDefaultCols) {
          delete minimalData[col.name];
        }

        const result = service.prepareInsertData(tableName, minimalData);

        for (const col of quotedDefaultCols) {
          const expectedValue = normalizeDefaultValue(col.defaultValue);
          if (result[col.name] !== expectedValue) {
            return false;
          }
          if (result[col.name].startsWith('\'') || result[col.name].startsWith('"')) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('prepareInsertData normalizes quoted string defaults');
});
