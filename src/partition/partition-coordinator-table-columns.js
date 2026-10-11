// The coordinator's durable record columns on the two transaction system
// tables (TX1 design revision 10, 0.0.15, the coordinator seam's participant
// obligations; seams C and E): a table created by an earlier generation of
// the schema gains them at open, idempotently, through the same column
// upgrade the other system tables use (partition-service-table-bootstrap.js).
// The DDL beside each column name is the participant vocabulary's; a fresh
// cluster creates the columns from the schema definitions and this adds
// nothing to it.
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTICIPANT_COORDINATOR_TABLE_COLUMNS as COLUMNS,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
} from './partition-participant-transaction-constants.js';

const {SYSTEM_TABLE_NAME} = PARTITION_SERVICE_SHARED;
const TABLE_INFO_PREFIX = 'PRAGMA table_info(';
const TABLE_INFO_SUFFIX = ')';
const ALTER_TABLE_PREFIX = 'ALTER TABLE ';
const SQL_SPACE = ' ';

/**
 * Add every column of `tableName`'s coordinator record that the open table
 * lacks; nothing when this partition's table is another table.
 * @param {Object} service - The partition (open db, tableName, logger).
 * @param {string} tableName - The system table the columns belong to.
 * @return {Array<string>} The columns added, in declaration order.
 */
function ensureCoordinatorTableColumns(service, tableName) {
  if (service.tableName !== tableName) {
    return [];
  }
  const present = new Set(service.db
    .prepare(`${TABLE_INFO_PREFIX}${tableName}${TABLE_INFO_SUFFIX}`).all()
    .map((column) => column.name));
  const added = [];
  for (const [column, addColumnSql] of Object.entries(COLUMNS[tableName])) {
    if (present.has(column)) {
      continue;
    }
    service.db.exec(`${ALTER_TABLE_PREFIX}${tableName}${SQL_SPACE}${addColumnSql}`);
    service.logger.info(LOG_MSG.ADDED_COORDINATOR_COLUMN,
      {tableName, partitionId: service.partitionId, columnName: column});
    added.push(column);
  }
  return added;
}

/**
 * The insert-once decision record columns of `sql_transactions` (decision,
 * decision_text, decision_digest).
 * @param {Object} service - The partition.
 * @return {Array<string>} The columns added.
 */
function ensureSqlTransactionsDecisionColumns(service) {
  return ensureCoordinatorTableColumns(service, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
}

/**
 * The retained PREPARE evidence columns of `sql_transaction_participants`
 * (prepared_digest, prepare_index, prepare_term).
 * @param {Object} service - The partition.
 * @return {Array<string>} The columns added.
 */
function ensureSqlTransactionParticipantsTableColumns(service) {
  return ensureCoordinatorTableColumns(service,
    SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS);
}

export {
  ensureSqlTransactionParticipantsTableColumns,
  ensureSqlTransactionsDecisionColumns,
};
