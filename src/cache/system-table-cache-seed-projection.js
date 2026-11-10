/**
 * The system-table cache's rule for a seeded partial row (quest
 * system-table-row-decoders, lead decision 2026-11-09): the cache stores
 * exactly what was written; a seeder that writes a partial row marks it with
 * its declared seed projection (SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD, a
 * cache-local field). The marker stays while any stored column is still
 * unobserved and goes away exactly when the row holds every stored column of
 * its table (a later full row replaced or merged onto it).
 *
 * A partial row the cache stores exactly as written without a declared
 * projection (lead ruling RD-1/RD-2, 2026-11-09: for a key it does not hold,
 * e.g. a guarded CDC UPDATE whose read-back missed or the voter raft-role
 * get-then-UPSERT race; round-4 ruling N3: an INSERT replacing a held row,
 * e.g. the CDC INSERT parameter fallback) gets the cache's own projection in
 * the same marker, naming exactly the columns observed
 * (SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME). A merge onto a held
 * row is never marked. The
 * decoders read declared and observed projections alike; the drop rule above
 * applies unchanged; the cache counts every such marking.
 */
import {getSchemaByTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  CACHE_LOG_MSG,
  SYSTEM_TABLE_CACHE_DECODED_TABLES,
  SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
  SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD,
} from './cache-constants.js';

/**
 * The row the cache holds after a write: a seeded row that now carries every
 * stored column loses its seed projection; any other row is returned as is.
 * @param {string} tableName the system table
 * @param {Object} row the row the cache holds
 * @return {Object} the same row, or a copy without the marker
 */
function dropSeedProjectionOnceObserved(tableName, row) {
  if (!row || !Object.hasOwn(row, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD)) return row;
  // Only a marked row reaches the schema lookup (seeders are rare writes).
  const schema = getSchemaByTableName(tableName);
  if (!schema || !schema.columns.every((column) => Object.hasOwn(row, column.name))) {
    return row;
  }
  const observed = {...row};
  delete observed[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD];
  return observed;
}

/**
 * The row the cache stores exactly as written: a decoded table's row
 * that lacks some stored column and carries no seed projection is marked
 * with the observed-columns projection naming exactly the stored columns it
 * carries; any other row is returned as is.
 * @param {string} tableName the system table
 * @param {Object} row the row stored as written
 * @return {Object} the same row, or a marked copy
 */
function markObservedColumns(tableName, row) {
  if (!row || Object.hasOwn(row, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD) ||
      !SYSTEM_TABLE_CACHE_DECODED_TABLES.includes(tableName)) {
    return row;
  }
  const schema = getSchemaByTableName(tableName);
  const columns = schema.columns.map((column) => column.name)
    .filter((column) => Object.hasOwn(row, column));
  if (columns.length === schema.columns.length) return row;
  return {
    ...row,
    [SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: {
      table: tableName,
      name: SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
      columns,
    },
  };
}

// The cache's named diagnostic of one observed-columns marking: counted per
// table (getObservedColumnsMarkCount) and logged with the running count at
// counts 1, 2, 4, 8, ... (never silent, bounded on the apply path).
function recordObservedColumnsMark(cache, apply, marked) {
  const count = cache.observedColumnsMarkCountByTableName.get(apply.tableName) + 1;
  cache.observedColumnsMarkCountByTableName.set(apply.tableName, count);
  if ((count & (count - 1)) !== 0) return;
  cache.logger.warn(CACHE_LOG_MSG.PARTIAL_ROW_MARKED_OBSERVED_COLUMNS, {
    tableName: apply.tableName,
    key: apply.key,
    operation: apply.operation,
    causeId: apply.causeId,
    observedColumns: marked[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD].columns,
    markCount: count,
  });
}

/**
 * The cache's seed-projection step after a non-DELETE apply: a row stored
 * exactly as written (an unheld key, or an INSERT that replaced the held
 * row) gets the observed-columns marking (counted), then the drop rule runs.
 * The stored row is replaced only when the marker changes; the record to
 * notify follows it (an INSERT notifies a marked copy of its data, never the
 * stored object).
 * @param {Object} cache the SystemTableCache
 * @param {Object} apply {tableName, table, key, operation, causeId,
 *   storedAsWritten, recordForNotification}
 * @return {Object} the record to notify
 */
function settleSeedProjection(cache, apply) {
  const {tableName, table, key, storedAsWritten, recordForNotification} = apply;
  const stored = table.get(key);
  const observed = storedAsWritten ? markObservedColumns(tableName, stored) : stored;
  const settled = dropSeedProjectionOnceObserved(tableName, observed);
  if (observed !== stored) recordObservedColumnsMark(cache, apply, observed);
  if (settled === stored) return recordForNotification;
  table.set(key, settled);
  if (recordForNotification === stored) return settled;
  return observed !== stored ?
    markObservedColumns(tableName, recordForNotification) :
    recordForNotification;
}

export {settleSeedProjection};
