/** The sql_transactions row owner's fixed durable insertion contract.
 * Install only inside committed origin application after the release owner's
 * closed-cohort drain proof. Reads never install or infer a participant set. */
import {createHash} from 'node:crypto';
import {SQL_TRANSACTIONS_SCHEMA} from '../../bootstrap/system-table-workflow-schema-definitions.js';
import {TABLES} from '../../constants/tables.js';

const TRANSACTION_SCHEMA_ENFORCEMENT_STATE = Object.freeze({
  ENFORCED: 'enforced', REQUIRED: 'install_required',
  INCOMPATIBLE: 'incompatible', UNAVAILABLE: 'unavailable',
});
const TRANSACTION_SCHEMA_ENFORCEMENT_VERSION = 2;
const TRANSACTION_SCHEMA_ENFORCEMENT_ERROR = Object.freeze({
  INITIAL_ROW: 'transaction_initial_row_refused',
  SCHEMA: 'transaction_schema_enforcement_unavailable',
  MIGRATION: 'transaction_coordinator_schema_protected',
});
const STATE = TRANSACTION_SCHEMA_ENFORCEMENT_STATE;
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const MIGRATION_REFUSAL_MESSAGE =
  'The coordinator ledger schema changes only through its fixed committed owner';
const ERROR = TRANSACTION_SCHEMA_ENFORCEMENT_ERROR;
const TRIGGER_NAME = 'sql_transactions_initial_lineage_v1';
const SCHEMA_SQL = 'PRAGMA table_info(sql_transactions)';
const TRIGGER_SQL = 'SELECT sql FROM sqlite_schema WHERE type = ? AND name = ? AND tbl_name = ?';
const COUNT_SQL = 'SELECT count(*) AS count FROM sql_transactions';
const INITIAL_ROW_TRIGGER_SQL = `CREATE TRIGGER ${TRIGGER_NAME}
BEFORE INSERT ON sql_transactions
WHEN COALESCE((
  typeof(NEW.transaction_id) = 'text' AND length(NEW.transaction_id) = 32
  AND NEW.transaction_id NOT GLOB '*[^0-9a-f]*'
  AND typeof(NEW.session_id) = 'text' AND length(NEW.session_id) > 0
  AND typeof(NEW.transaction_epoch) = 'integer'
  AND NEW.transaction_epoch BETWEEN 0 AND 9007199254740991
  AND typeof(NEW.timeout_deadline) = 'integer'
  AND NEW.timeout_deadline BETWEEN 0 AND 9007199254740991
  AND NEW.transaction_mode IN ('EXPLICIT', 'AUTOCOMMIT')
  AND NEW.status = 'ACTIVE' AND NEW.participant_set_state = 'OPEN'
  AND NEW.participant_set_text = '[]' AND NEW.commit_mode = 'NOT_SELECTED'
  AND NEW.frozen_participant_count = 0
  AND NEW.decision IS NULL AND NEW.decision_text IS NULL AND NEW.decision_digest IS NULL
), 0) = 0 OR EXISTS (
  SELECT 1 FROM sql_transactions WHERE transaction_id = NEW.transaction_id
)
BEGIN SELECT RAISE(ABORT, '${ERROR.INITIAL_ROW}'); END`;

function digestOf(value) {
  return createHash(DIGEST_ALGORITHM).update(value).digest(DIGEST_ENCODING);
}

function enforcementResult(state, columns = [], trigger = null, missingColumns = []) {
  return Object.freeze({state,
    schemaVersion: missingColumns.length === 0 && columns.length > 0 ?
      TRANSACTION_SCHEMA_ENFORCEMENT_VERSION : null,
    schemaDigest: columns.length > 0 ? digestOf(JSON.stringify(columns)) : null,
    enforcerDigest: trigger === null ? null : digestOf(trigger),
    missingColumns: Object.freeze(missingColumns)});
}

function readTransactionSchemaEnforcement(database) {
  try {
    const columns = database.prepare(SCHEMA_SQL).all();
    const byName = new Map(columns.map((column) => [column.name, column]));
    const missing = SQL_TRANSACTIONS_SCHEMA.columns.filter((column) =>
      !byName.has(column.name)).map((column) => column.name);
    const trigger = database.prepare(TRIGGER_SQL).get('trigger', TRIGGER_NAME,
      TABLES.SQL_TRANSACTIONS)?.sql ?? null;
    if (columns.length === 0) return enforcementResult(STATE.UNAVAILABLE);
    const shapeValid = byName.get('transaction_id')?.pk === 1 &&
      SQL_TRANSACTIONS_SCHEMA.columns.every((column) => !byName.has(column.name) ||
        byName.get(column.name).type.toUpperCase() === column.type.toUpperCase());
    if (!shapeValid || (trigger !== null && trigger !== INITIAL_ROW_TRIGGER_SQL)) {
      return enforcementResult(STATE.INCOMPATIBLE, columns, trigger, missing);
    }
    return enforcementResult(missing.length === 0 && trigger === INITIAL_ROW_TRIGGER_SQL ?
      STATE.ENFORCED : STATE.REQUIRED, columns, trigger, missing);
  } catch {
    return enforcementResult(STATE.UNAVAILABLE);
  }
}

function enforcementError() {
  return Object.assign(new Error(ERROR.SCHEMA), {code: ERROR.SCHEMA});
}

function isCoordinatorTable(tableName) {
  return typeof tableName === 'string' &&
    tableName.toLowerCase() === TABLES.SQL_TRANSACTIONS;
}

/** Source and committed apply consume this same verifier. Before the
 * generation origin, the closed release owner remains the admission owner. */
function transactionSchemaWriteRefusal(database, tableName, originPresent) {
  if (!isCoordinatorTable(tableName) || originPresent !== true) return null;
  const enforcement = readTransactionSchemaEnforcement(database);
  return enforcement.state === STATE.ENFORCED ? null : Object.freeze({
    success: false, failureCode: ERROR.SCHEMA, errorCode: ERROR.SCHEMA,
    error: ERROR.SCHEMA, enforcement,
  });
}

function assertTransactionSchemaWriteEnforced(database, tableName, originPresent) {
  const refused = transactionSchemaWriteRefusal(database, tableName, originPresent);
  if (refused === null) return;
  const error = enforcementError();
  error.enforcement = refused.enforcement;
  throw error;
}

/** Fixed schema only; the surrounding existing application transaction owns
 * rollback, retained result and applied-index atomicity. */
function installTransactionSchemaEnforcement(database) {
  const before = readTransactionSchemaEnforcement(database);
  if (before.state === STATE.ENFORCED) return before;
  if (before.state !== STATE.REQUIRED ||
      (before.missingColumns.length > 0 && database.prepare(COUNT_SQL).get().count !== 0)) {
    throw enforcementError();
  }
  for (const name of before.missingColumns) {
    const column = SQL_TRANSACTIONS_SCHEMA.columns.find((candidate) => candidate.name === name);
    // These bytes come only from the schema owner. No default, inferred [],
    // row rewrite or caller-provided SQL can enter this application path.
    database.exec(`ALTER TABLE sql_transactions ADD COLUMN ${column.name} ${column.type}`);
  }
  if (before.enforcerDigest === null) database.exec(INITIAL_ROW_TRIGGER_SQL);
  const after = readTransactionSchemaEnforcement(database);
  if (after.state !== STATE.ENFORCED) throw enforcementError();
  return after;
}

function coordinatorTableSchemaRefusal(tableName) {
  return isCoordinatorTable(tableName) ?
    Object.freeze({success: false, failureCode: ERROR.MIGRATION, errorCode: ERROR.MIGRATION,
      error: MIGRATION_REFUSAL_MESSAGE}) : null;
}

export {readTransactionSchemaEnforcement, installTransactionSchemaEnforcement,
  assertTransactionSchemaWriteEnforced, coordinatorTableSchemaRefusal,
  transactionSchemaWriteRefusal, TRANSACTION_SCHEMA_ENFORCEMENT_STATE,
  TRANSACTION_SCHEMA_ENFORCEMENT_ERROR};
