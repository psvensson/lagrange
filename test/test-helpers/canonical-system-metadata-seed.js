// One canonical seed of system metadata for tests: a REAL SystemTableCache
// holding the rows a test states, in the product's own row shapes, applied
// through the cache's only write path (applySystemTableChange, keyed by the
// declared key of system-cache-key-descriptor.js). No method of the cache is
// replaced, so find(), get(), getAll(), filter(), has(), count() and the
// services-by-partition index answer exactly as in production, and a row
// keyed by the wrong field is refused by the cache itself.
//
// Rows are stated per system table name (TABLES.*):
//   createCanonicalSystemCache({
//     tables: [{table_name: 'users', primary_key: 'id'}],
//     partitions: [{partition_id: 'p1', table_name: 'users'}],
//     services: [{service_id: 'p1-r1', partition_id: 'p1', ...}],
//     nodes: [...], service_definitions: [...],
//   })
//
// Only what the product's routing contract needs is completed, and only when
// the test did not state it (a stated value always wins):
//   - a tables row: a missing table_id/table_name is taken from the stated
//     one (the declared key is table_id), active_partition_version 1;
//   - a partitions row: partition_version 1 and state NORMAL, the three facts
//     isPartitionVisibleForRouting (sql-query-engine-table-routing-methods.js)
//     requires of a routable partition.
// A test that needs a non-routable partition states its own state/version.
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {PARTITION_STATE} from '../../src/partition/partition-constants.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  buildSchemaDefinition,
  derivePartitionKey,
} from '../../src/query/table-creation-service-schema-derivation.js';

const FIRST_PARTITION_VERSION = 1;

// Fill the missing one of two names of the same fact from the stated one.
function completed(row, firstField, secondField) {
  return {
    ...(row[firstField] === undefined && row[secondField] !== undefined ?
      {[firstField]: row[secondField]} : {}),
    ...(row[secondField] === undefined && row[firstField] !== undefined ?
      {[secondField]: row[firstField]} : {}),
  };
}

/**
 * The tables row of a table stated by its DDL, with the schema_definition the
 * product describes result columns from (postgres-wire-description.js), built
 * by the product's own schema builders. The one way a test states a schema: a
 * table row stated without this keeps no schema, nothing is defaulted.
 * @param {{name: string, ddl: string, primaryKey: (string|string[])}} table
 * @return {Object} a tables row for createCanonicalSystemCache.
 */
function tableRowFromDdl(table) {
  const parsedDdl = new SQLParser(
    table.ddl,
    {dialect: PARSER_DIALECT.POSTGRESQL},
  ).parse();
  const primaryKeyList = Array.isArray(table.primaryKey) ?
    table.primaryKey :
    [table.primaryKey];
  const canonicalSchema = buildSchemaDefinition(
    parsedDdl.columns || [],
    parsedDdl,
    primaryKeyList,
  );
  const partitionKey = derivePartitionKey(primaryKeyList);
  const schemaDefinition = JSON.stringify({
    ...canonicalSchema,
    tableName: table.name,
    columns: canonicalSchema.columns.map((col, idx) => ({
      ...col,
      ...(parsedDdl.columns?.[idx]?.dataType ?
        {dataType: parsedDdl.columns[idx].dataType} :
        {}),
    })),
    primaryKey: table.primaryKey,
  });
  return {
    table_id: table.name,
    table_name: table.name,
    primary_key: partitionKey,
    primaryKey: table.primaryKey,
    partition_key: partitionKey,
    active_partition_version: FIRST_PARTITION_VERSION,
    schema_definition: schemaDefinition,
  };
}

function canonicalTableRow(row) {
  return {
    active_partition_version: FIRST_PARTITION_VERSION,
    ...row,
    ...completed(row, 'table_id', 'table_name'),
  };
}

function canonicalPartitionRow(row) {
  return {
    partition_version: FIRST_PARTITION_VERSION,
    state: PARTITION_STATE.NORMAL,
    ...row,
  };
}

const ROW_COMPLETION = Object.freeze({
  [TABLES.TABLES]: canonicalTableRow,
  [TABLES.PARTITIONS]: canonicalPartitionRow,
});

/**
 * Apply the stated rows to an existing real cache.
 * @param {SystemTableCache} cache
 * @param {Object<string, Object[]>} rowsByTable - system table name to rows.
 * @return {SystemTableCache} the same cache.
 */
function seedCanonicalSystemMetadata(cache, rowsByTable = {}) {
  for (const [tableName, rows] of Object.entries(rowsByTable)) {
    const complete = ROW_COMPLETION[tableName] ?? ((row) => row);
    for (const row of rows) {
      cache.applySystemTableChange(
        tableName, CACHE_CDC_OPERATIONS.INSERT, complete(row));
    }
  }
  return cache;
}

/**
 * Change rows already in the cache (a CDC UPDATE: the stated fields merge into
 * the row of the same declared key), as a test's later metadata convergence.
 * @param {SystemTableCache} cache
 * @param {Object<string, Object[]>} rowsByTable - system table name to rows,
 *   each carrying the declared key and the changed fields.
 * @return {SystemTableCache} the same cache.
 */
function updateCanonicalSystemMetadata(cache, rowsByTable) {
  for (const [tableName, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) {
      cache.applySystemTableChange(
        tableName, CACHE_CDC_OPERATIONS.UPDATE, row);
    }
  }
  return cache;
}

/**
 * Delete rows from the cache (a CDC DELETE of the declared key).
 * @param {SystemTableCache} cache
 * @param {Object<string, Object[]>} rowsByTable - system table name to rows,
 *   each carrying at least the declared key.
 * @return {SystemTableCache} the same cache.
 */
function deleteCanonicalSystemMetadata(cache, rowsByTable) {
  for (const [tableName, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) {
      cache.applySystemTableChange(
        tableName, CACHE_CDC_OPERATIONS.DELETE, row);
    }
  }
  return cache;
}

/**
 * A new real SystemTableCache seeded with the stated rows.
 * @param {Object<string, Object[]>} [rowsByTable]
 * @return {SystemTableCache}
 */
function createCanonicalSystemCache(rowsByTable = {}) {
  return seedCanonicalSystemMetadata(new SystemTableCache(), rowsByTable);
}

export {
  createCanonicalSystemCache,
  deleteCanonicalSystemMetadata,
  seedCanonicalSystemMetadata,
  tableRowFromDdl,
  updateCanonicalSystemMetadata,
};
