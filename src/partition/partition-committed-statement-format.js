import {PARTITION_COMMITTED_STATEMENT_FORMAT, PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL}
  from './partition-committed-statement-outcome-constants.js';
import {RETAINED_STORE_ERROR, readRetainedStoreRowsIn, retainedStoreTableExistsIn}
  from './partition-retained-store-observation.js';

const RETAINED_STORE_FORMAT_REFUSALS = Object.freeze(new Set(
  Object.values(RETAINED_STORE_ERROR)));

function outcomeTableFormatIn(db) {
  const sql = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL;
  try {
    if (!retainedStoreTableExistsIn(db, sql.TABLE)) {
      return PARTITION_COMMITTED_STATEMENT_FORMAT.ABSENT;
    }
    readRetainedStoreRowsIn(db, {table: sql.TABLE, select: sql.FORMAT_PROBE,
      create: sql.CREATE_TABLE});
    return PARTITION_COMMITTED_STATEMENT_FORMAT.CURRENT;
  } catch (error) {
    if (RETAINED_STORE_FORMAT_REFUSALS.has(error?.code)) {
      return PARTITION_COMMITTED_STATEMENT_FORMAT.UNSUPPORTED;
    }
    throw error;
  }
}

/**
 * The one table-format decision, read-only (no DDL): ABSENT when the store
 * holds no outcome table, CURRENT when the table is the owner's definition
 * (CREATE_TABLE, by the cold census's own rule), UNSUPPORTED for any other
 * definition (a store of another format).
 * @param {Object} db - The partition's opened database.
 * @return {{outcome: string, columns: Array<string>}} Frozen decision; the
 *   outcome is a PARTITION_COMMITTED_STATEMENT_FORMAT value, the columns what
 *   the table holds (for the refusal).
 */
function detectCommittedStatementOutcomeFormat(db) {
  const outcome = db.transaction(() => outcomeTableFormatIn(db))();
  const columns = Object.freeze(db
    .prepare(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.TABLE_COLUMNS)
    .all().map((column) => column.name));
  return Object.freeze({outcome, columns});
}

export {detectCommittedStatementOutcomeFormat};
