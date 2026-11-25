// The terminal outcome of every committed statement: the one owner of what a
// committed statement's result is, for the partition's committed-entry
// application.
//
// A committed entry is applied inside the SQLite transaction that also
// advances the rs-raft applied state. Its statement ends in exactly one of
// these named outcomes (PARTITION_COMMITTED_COMMAND_OUTCOME):
//
// - APPLIED: the statement ran. Its outcome row is written in the same
//   transaction.
// - STATEMENT_FAILED: the statement failed deterministically (a constraint,
//   schema or binding error every replica reproduces from the same command
//   over the same state). The entry is consumed, its outcome row carries the
//   failure's code and message, and the proposer's write is reported as that
//   failure.
// - STATEMENT_ENVIRONMENT_FAILED: the failure is the host's environment
//   (busy, locked, I/O, full, out of memory...). It is not the statement's
//   outcome and is never consumed: the application fails closed, the
//   transaction rolls back (so no outcome row exists) and the committed entry
//   is delivered again when the host recovers. Consuming it would let one
//   replica skip an entry every other replica applies.
//
// The outcome row (PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL) is the
// authority for an entry key the partition has already settled: a retry of
// the same entry key - in process, on another replica, or after a restart -
// is never executed again. It resolves from the row: an APPLIED row as the
// applied statement's own result again (the affected-row count and last
// insert rowid the row retained, named by PARTITION_SETTLED_REPLAY - a replay
// never reports an applied write as zero rows), a STATEMENT_FAILED row as the
// original failure, each with `replayOfLogIndex`. There is no in-memory replay state: a retry is
// answered from the row before it is proposed, and one that was proposed
// anyway (its original not yet applied here when it was proposed) is answered
// from the row when it is applied - the same answer either way.
//
// The nullable insert-result contract (TX1 owner ruling 2026-10-11, design
// revision 10, 0.0.14): an APPLIED statement's result carries
// `lastInsertRowid` only when the inserted row's identity is established by
// the statement itself - an INSERT or REPLACE with no DO UPDATE clause that
// changed at least one row. It is null for every ON CONFLICT DO UPDATE (a
// mixed batch of inserted and updated rows included), every statement that
// changed no row, and every UPDATE, DELETE and DDL statement, because the
// connection's last insert rowid is then connection state (a rolled-back c'
// validation, the self-check's ceiling plant, an rs-raft log append) and
// differs between replicas. The row and the answer are the same on every
// replica; a consumer (the query owner) reads null as "no inserted-row
// identity", never as a row id. committedStatementResult applies it.

import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {
  PARTITION_COMMITTED_STATEMENT_COLUMNS,
  PARTITION_COMMITTED_STATEMENT_ERROR_CODE,
  PARTITION_COMMITTED_STATEMENT_FORMAT,
  PARTITION_COMMITTED_RECORD_CLASS,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_OWNER_COMMAND_PRELUDE,
  PARTITION_SETTLED_COMMAND_STATE,
  PARTITION_SETTLED_REPLAY,
  PARTITION_SQLITE_RESULT_CODE,
} from './partition-committed-statement-outcome-constants.js';
import {admitCommittedCommand, committedCommandRefusalResult} from
  './partition-committed-command-admission.js';
import {buildDurableCommitWitness} from './partition-write-kernel.js';
import {RETAINED_STORE_ERROR, retainedStoreError, readRetainedStoreRowsIn,
  retainedStoreTableExistsIn, isStoredInteger, isStoredNullableText,
  isStoredNullableInteger} from './partition-retained-store-observation.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE,
  refusalLayerFieldOf,
} from './partition-statement-admission-constants.js';
import {
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_SQL_STATE,
} from '../query/sql-locking-read-constants.js';

const NO_COMMITTED_STATEMENT_KEY = null;
const COLUMN_LIST_SEPARATOR = ', ';
const FORMAT_UNSUPPORTED_REMEDY =
  'format is refused, never migrated; re-found the data directory';
const OWNER_IDENTITY_RULE = 'an owner result is recorded with exactly its command digest';
const STATEMENT_OUTCOME_EFFECTS_TABLE = '_partition_statement_outcome_effects';
const STATEMENT_OUTCOME_EFFECTS_SQL = Object.freeze({
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS _partition_statement_outcome_effects (
      entry_key TEXT PRIMARY KEY,
      affected_rows_json TEXT NOT NULL
    )
  `,
  TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' AND name = ?',
  INSERT:
    'INSERT INTO _partition_statement_outcome_effects ' +
    '(entry_key, affected_rows_json) VALUES (?, ?)',
  SELECT_BY_ENTRY_KEY:
    'SELECT affected_rows_json FROM _partition_statement_outcome_effects ' +
    'WHERE entry_key = ?',
});

// The same identity is used by apply, replay answers and cold observation.
// The one key is the command's entryId; a command without one (not a
// non-empty string) has no key, and the application refuses it before its
// statement runs (PARTITION_COMMITTED_COMMAND_OUTCOME.ENTRY_ID_MISSING_REFUSED).
function isCommittedStatementKeyed(command) {
  const entryId = command?.entryId;
  return typeof entryId === 'string' && entryId.length > 0;
}

function committedStatementEntryKey(command) {
  return isCommittedStatementKeyed(command) ?
    `entry:${command.entryId}` : NO_COMMITTED_STATEMENT_KEY;
}

// Exact read-only census. Positions/result integers never round through Number.
// An owner result and its command identity are stored together or not at all.
function isCensusOwnerIdentityValid(row) {
  return isStoredNullableText(row.owner_result_text) &&
    isStoredNullableText(row.command_digest) &&
    (row.owner_result_text === null) === (row.command_digest === null);
}

function isCensusRowValid(row) {
  return typeof row.entry_key === 'string' && row.entry_key.length > 0 &&
    typeof row.outcome === 'string' && isStoredInteger(row.log_index, 1n) &&
    isStoredInteger(row.term, 1n) && isStoredNullableInteger(row.changes, 0n) &&
    isStoredNullableInteger(row.last_insert_rowid) &&
    isStoredNullableText(row.failure_code) && isStoredNullableText(row.failure_message) &&
    isCensusOwnerIdentityValid(row);
}

function readCommittedStatementCensusIn(db) {
  const sql = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL;
  const rows = readRetainedStoreRowsIn(db, {table: sql.TABLE,
    select: sql.SELECT_ALL, create: sql.CREATE_TABLE});
  for (const row of rows) {
    if (!isCensusRowValid(row)) {
      throw retainedStoreError(RETAINED_STORE_ERROR.ROW_CONTRARY, sql.TABLE);
    }
  }
  return rows.map((row) => Object.freeze({
    entryKey: row.entry_key, outcome: row.outcome,
    logIndex: String(row.log_index), term: String(row.term),
    failureCode: row.failure_code, failureMessage: row.failure_message,
    changes: row.changes === null ? null : String(row.changes),
    lastInsertRowid: row.last_insert_rowid === null ? null : String(row.last_insert_rowid),
    ownerResultText: row.owner_result_text,
    commandDigest: row.command_digest,
  }));
}

const RETAINED_STORE_FORMAT_REFUSALS = Object.freeze(new Set(
  Object.values(RETAINED_STORE_ERROR)));

function outcomeTableFormatIn(db) {
  const sql = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL;
  if (!retainedStoreTableExistsIn(db, sql.TABLE)) {
    return PARTITION_COMMITTED_STATEMENT_FORMAT.ABSENT;
  }
  try {
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

/**
 * The typed store-open refusal for an UNSUPPORTED table format.
 * @param {{columns: Array<string>}} decision - An UNSUPPORTED decision.
 * @param {string|null} partitionId - The partition refused, when known.
 * @return {Error} An Error whose `code` is FORMAT_UNSUPPORTED.
 */
function committedStatementOutcomeFormatError(decision, partitionId = null) {
  // The message leads with the typed code, so a consumer that keeps only the
  // message (a diagnostic detail) still names the refusal.
  const code = PARTITION_COMMITTED_STATEMENT_ERROR_CODE.FORMAT_UNSUPPORTED;
  const error = new Error(`${code}: ${PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.TABLE} of ` +
    `partition ${partitionId} is not the owner's definition (it holds columns ` +
    `[${decision.columns.join(COLUMN_LIST_SEPARATOR)}]; the owner's are ` +
    `[${PARTITION_COMMITTED_STATEMENT_COLUMNS.join(COLUMN_LIST_SEPARATOR)}] with the ` +
    `identity CHECK): a store of another ${FORMAT_UNSUPPORTED_REMEDY}`);
  error.code = code;
  error.partitionId = partitionId;
  error.columns = decision.columns;
  return error;
}

/**
 * Create the outcome table on a store that has none (DDL; run once at
 * partition initialization, after the legacy-state detector). A store whose
 * table has another format is refused, typed, before any DDL: the one format
 * decision of store open.
 * @param {Object} db - The partition's connection.
 * @param {string|null} [partitionId] - The partition opened, for the refusal.
 */
function createCommittedStatementOutcomeTable(db, partitionId = null) {
  const format = detectCommittedStatementOutcomeFormat(db);
  if (format.outcome === PARTITION_COMMITTED_STATEMENT_FORMAT.UNSUPPORTED) {
    throw committedStatementOutcomeFormatError(format, partitionId);
  }
  if (format.outcome === PARTITION_COMMITTED_STATEMENT_FORMAT.ABSENT) {
    db.exec(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE);
  }
  db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_TABLE);
  sqliteConnectionState(db).forgetFact(
    STATEMENT_OUTCOME_EFFECTS_TABLE,
    STATEMENT_OUTCOME_EFFECTS_TABLE,
  );
}

const UNSETTLED_RECORD = Object.freeze({
  state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED,
});

function capturedRowEffectsTableExistsIn(db) {
  const state = sqliteConnectionState(db);
  return state.committedFact(
    STATEMENT_OUTCOME_EFFECTS_TABLE,
    STATEMENT_OUTCOME_EFFECTS_TABLE,
    () => state
      .statement(STATEMENT_OUTCOME_EFFECTS_SQL.TABLE_EXISTS)
      .get(STATEMENT_OUTCOME_EFFECTS_TABLE) !== undefined,
  );
}

function persistCapturedRowEffectsIn(service, state, entryKey, affectedRows) {
  if (!capturedRowEffectsTableExistsIn(service.db)) {
    service.db.exec(STATEMENT_OUTCOME_EFFECTS_SQL.CREATE_TABLE);
    state.forgetFact(STATEMENT_OUTCOME_EFFECTS_TABLE, STATEMENT_OUTCOME_EFFECTS_TABLE);
  }
  state.runNonApplication(
    STATEMENT_OUTCOME_EFFECTS_SQL.INSERT,
    entryKey,
    JSON.stringify(affectedRows),
  );
}

function readCapturedRowEffectsIn(db, entryKey) {
  if (!capturedRowEffectsTableExistsIn(db)) {
    return null;
  }
  const row = sqliteConnectionState(db)
    .statement(STATEMENT_OUTCOME_EFFECTS_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (typeof row?.affected_rows_json !== 'string') {
    return null;
  }
  const parsed = JSON.parse(row.affected_rows_json);
  return Array.isArray(parsed) ?
    Object.freeze(parsed.map((item) => Object.freeze({...item}))) :
    null;
}

function readCommittedStatementOutcomeIn(db, entryKey) {
  const row = sqliteConnectionState(db)
    .statement(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (row === undefined) {
    return UNSETTLED_RECORD;
  }
  const affectedRows = readCapturedRowEffectsIn(db, entryKey);
  return Object.freeze({
    state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED,
    outcome: row.outcome,
    logIndex: Number(row.log_index),
    term: Number(row.term),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    changes: row.changes,
    lastInsertRowid: row.last_insert_rowid,
    ...(affectedRows === null ? {} : {affectedRows}),
    ...(row.owner_result_text === null ? {} : {ownerResultText: row.owner_result_text,
      commandDigest: row.command_digest}),
  });
}

/**
 * The recorded terminal outcome of an entry key: SETTLED with the record, or
 * UNSETTLED when no committed statement with that key has been settled.
 * @param {Object} service - The partition (its `db`).
 * @param {string} entryKey - The committed entry key.
 * @return {Object} Frozen {state} (a PARTITION_COMMITTED_STATEMENT_RECORD_STATE)
 *   and, when SETTLED, {outcome, logIndex, term, failureCode, failureMessage,
 *   changes, lastInsertRowid}; the last two are null for a row that retains
 *   no statement result; an owner command's record adds {ownerResultText,
 *   commandDigest}.
 */
function readCommittedStatementOutcome(service, entryKey) {
  return readCommittedStatementOutcomeIn(service.db, entryKey);
}

const UNSETTLED_COMMAND = Object.freeze({
  state: PARTITION_SETTLED_COMMAND_STATE.UNSETTLED,
});
/**
 * The class of a settled record (PARTITION_COMMITTED_RECORD_CLASS).
 * @param {Object} recorded - A SETTLED record.
 * @return {string} Its record class.
 */
function committedRecordClassOf(recorded) {
  if (typeof recorded.commandDigest === 'string') {
    return PARTITION_COMMITTED_RECORD_CLASS.OWNER_COMMAND;
  }
  return recorded.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED ?
    PARTITION_COMMITTED_RECORD_CLASS.STATEMENT_FAILURE :
    PARTITION_COMMITTED_RECORD_CLASS.STATEMENT;
}

/**
 * Exact settlement of one owner command, from the store: a durable outcome
 * settles only the exact command it proves. SAME_COMMAND (with the record)
 * only when the record under the command's entry key carries its digest;
 * OTHER_RECORD for any other record under that key; UNSETTLED for none.
 * @param {Object} db - The partition's connection.
 * @param {{entryId: string, commandDigest: string}} command - The command's
 *   entryId and its committedCommandDigest.
 * @return {Object} Frozen {state} (a PARTITION_SETTLED_COMMAND_STATE) and,
 *   when SAME_COMMAND, {recorded}.
 */
function readSettledOwnerCommandIn(db, {entryId, commandDigest}) {
  const recorded = readCommittedStatementOutcomeIn(db, committedStatementEntryKey({entryId}));
  if (recorded.state === PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED) {
    return UNSETTLED_COMMAND;
  }
  return recorded.commandDigest === commandDigest ?
    Object.freeze({state: PARTITION_SETTLED_COMMAND_STATE.SAME_COMMAND, recorded}) :
    Object.freeze({state: PARTITION_SETTLED_COMMAND_STATE.OTHER_RECORD,
      recordClass: committedRecordClassOf(recorded)});
}

const PENDING_OWNER_COMMAND_DIGESTS = 'pendingOwnerCommandDigests';
const PROPOSE = Object.freeze({state: PARTITION_OWNER_COMMAND_PRELUDE.PROPOSE});

function pendingOwnerCommandDigestsOf(service) {
  let digests = service[PENDING_OWNER_COMMAND_DIGESTS];
  if (digests === undefined) {
    digests = new Map();
    service[PENDING_OWNER_COMMAND_DIGESTS] = digests;
  }
  return digests;
}

function answered(answer) {
  return Object.freeze({state: PARTITION_OWNER_COMMAND_PRELUDE.ANSWERED, answer});
}

/**
 * The one request prelude of an owner command (placement, formation) on its
 * partition, in its one order: leadership; the committed-command admission;
 * the exact settled replay (a settled E0 answers its ORIGINAL receipt, also
 * under a cutover pause - reading an existing outcome is not a new write);
 * the cutover pause; the join of the same command already pending. A record
 * or a pending write of anything else under the entry key is the collision.
 * @param {Object} service - The partition.
 * @param {Object} request - {command, commandDigest, origin, kernel:
 *   {leadershipRefusalOf, pausedAnswerOf} (the write kernel's answers),
 *   answerSettled(recorded), answerCollision()}.
 * @return {Object} Frozen {state} (a PARTITION_OWNER_COMMAND_PRELUDE) and,
 *   when ANSWERED, {answer}.
 */
function ownerCommandPrelude(service, request) {
  const {command, commandDigest, origin, kernel} = request;
  const leadership = kernel.leadershipRefusalOf(service);
  if (leadership !== null) return answered(leadership);
  const admission = admitCommittedCommand(command, {origin});
  if (!admission.admitted) {
    return answered(committedCommandRefusalResult(admission, service.partitionId));
  }
  const settled = readSettledOwnerCommandIn(service.db,
    {entryId: command.entryId, commandDigest});
  if (settled.state === PARTITION_SETTLED_COMMAND_STATE.SAME_COMMAND) {
    return answered(request.answerSettled(settled.recorded));
  }
  if (settled.state === PARTITION_SETTLED_COMMAND_STATE.OTHER_RECORD) {
    return answered(request.answerCollision());
  }
  const paused = kernel.pausedAnswerOf(service);
  if (paused !== null) return answered(paused);
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending === null) return PROPOSE;
  return answered(pendingOwnerCommandDigestsOf(service).get(command.entryId) ===
    commandDigest ? pending : request.answerCollision());
}

/**
 * Hold a proposed owner command's digest as its entry's pending identity
 * until its commit settles, so a second request joins only the same command.
 * @param {Object} service - The partition.
 * @param {{command: Object, commandDigest: string}} proposed - The command.
 * @param {Promise<Object>} commitPromise - Its commit.
 * @return {Promise<Object>} The commit.
 */
function trackPendingOwnerCommand(service, {command, commandDigest}, commitPromise) {
  const digests = pendingOwnerCommandDigestsOf(service);
  digests.set(command.entryId, commandDigest);
  Promise.resolve(commitPromise).finally(() => {
    if (digests.get(command.entryId) === commandDigest) digests.delete(command.entryId);
  }).catch(() => {});
  return commitPromise;
}

// An owner command records its typed result with its command digest, both or
// neither (the table CHECK holds the same rule).
function assertOwnerIdentity(entryKey, ownerResultText, commandDigest) {
  const ownerRecord = typeof ownerResultText === 'string' &&
    typeof commandDigest === 'string' && commandDigest.length > 0;
  if (ownerRecord || (ownerResultText === null && commandDigest === null)) return;
  const error = new Error(`${PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.TABLE} ${entryKey}: ` +
    OWNER_IDENTITY_RULE);
  error.code = PARTITION_COMMITTED_STATEMENT_ERROR_CODE.OWNER_IDENTITY_INVALID;
  throw error;
}

/**
 * Record an entry key's terminal outcome, inside the application
 * transaction.
 * @param {Object} service - The partition (its `db`).
 * @param {Object} outcome - {entryKey, outcome, index, term, error, result,
 *   ownerResultText, commandDigest}; `error` only for STATEMENT_FAILED,
 *   `result` (the statement's retained {changes, lastInsertRowid},
 *   committedStatementResult) only for APPLIED; an owner command records its
 *   typed result with its committedCommandDigest, both or neither.
 */
function recordCommittedStatementOutcome(service, {entryKey, outcome, index,
  term, error = null, result = null, ownerResultText = null, commandDigest = null}) {
  assertOwnerIdentity(entryKey, ownerResultText, commandDigest);
  const state = sqliteConnectionState(service.db);
  const insert = state.statement(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.INSERT);
  insert.run(
    entryKey, outcome, index, term,
    error === null ? null : failureCodeOf(error),
    error === null ? null : String(error.message),
    result === null ? null : result.changes,
    result === null ? null : result.lastInsertRowid,
    ownerResultText, commandDigest);
  if (Array.isArray(result?.affectedRows)) {
    persistCapturedRowEffectsIn(service, state, entryKey, result.affectedRows);
  }
}

/**
 * The applied result a settled APPLIED record answers with: the retained
 * affected-row count and last insert rowid, or - for a row that retains none
 * - no count at all; each named by its PARTITION_SETTLED_REPLAY state.
 * @param {Object} recorded - The SETTLED APPLIED record.
 * @return {Object} The result fields of the answer.
 */
function settledAppliedResult(recorded) {
  if (recorded.changes === null || recorded.changes === undefined) {
    return {settledReplay: PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED};
  }
  return {
    changes: recorded.changes,
    lastInsertRowid: recorded.lastInsertRowid,
    settledReplay: PARTITION_SETTLED_REPLAY.OUTCOME_RETAINED,
  };
}

/**
 * The code a statement failure is recorded and reported with: its SQLite
 * result code, or the JavaScript error's name for a binding error.
 * @param {*} error - What the statement threw.
 * @return {string} The failure code.
 */
function failureCodeOf(error) {
  return String(error?.code ?? error?.name);
}

/**
 * The SQLite primary result code of an error, or null when the error carries
 * no SQLite result code.
 * @param {*} error - What the statement threw.
 * @return {string|null} `SQLITE_<PRIMARY>` or null.
 */
function sqlitePrimaryCode(error) {
  const code = typeof error?.code === 'string' ? error.code : null;
  if (code === null || !code.startsWith(PARTITION_SQLITE_RESULT_CODE.PREFIX)) {
    return null;
  }
  return code.split(PARTITION_SQLITE_RESULT_CODE.SEPARATOR)
    .slice(0, PARTITION_SQLITE_RESULT_CODE.PRIMARY_SEGMENTS)
    .join(PARTITION_SQLITE_RESULT_CODE.SEPARATOR);
}

/**
 * Whether a statement failure is deterministic: every replica applying the
 * same command over the same state fails it the same way.
 * @param {*} error - What the statement threw.
 * @param {Object} db - The partition's connection.
 * @return {boolean} Whether the failure is the statement's own outcome.
 */
function isDeterministicStatementFailure(error, db) {
  // The statement-admission owner's refusal is a function of the command
  // bytes and the replicated schema and rows: every replica refuses alike.
  if (error?.code === PARTITION_STATEMENT_REFUSAL_CODE) {
    return true;
  }
  const primaryCode = sqlitePrimaryCode(error);
  if (primaryCode !== null) {
    return PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES.has(primaryCode);
  }
  return db?.open === true &&
    PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS.has(error?.name);
}

/**
 * The environmental failure the application fails closed with: typed, with
 * what the host raised as its cause.
 * @param {*} error - What the statement threw.
 * @return {Error} The typed error.
 */
function statementEnvironmentFailure(error) {
  const failure = new Error(
    `${PARTITION_SERVICE_ERROR_MSG.COMMITTED_STATEMENT_ENVIRONMENT_FAILED}` +
    ` (${error?.code ?? error?.name}): ${error?.message}`);
  failure.code =
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;
  failure.outcome =
    PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_ENVIRONMENT_FAILED;
  failure.cause = error;
  return failure;
}

/**
 * The answer to a settled entry key, built from its outcome row alone: the
 * same answer wherever and whenever it is asked - a retry before it is
 * proposed, in process or after a restart, or a retry that was proposed and
 * reached the application. An APPLIED row answers the applied statement's
 * result it retained (settledAppliedResult), with the durable commit witness
 * this replica attests (the entry and the term and index it was applied at);
 * a STATEMENT_FAILED row answers the original failure. A replay carries no
 * origin HLC: the asking command's timestamp is not the applied statement's
 * (no change event carries it), and the outcome row retains no origin, so a
 * replay cannot prove a projection position.
 * @param {Object} service - The partition (its identity).
 * @param {Object} settled - {recorded, command}: the SETTLED record and the
 *   command asking.
 * @return {Object} The write result.
 */
function lockingReadReplayFieldsOf(failureCode) {
  if (failureCode !== LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE) {
    return {};
  }
  return {
    errorCode: LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE,
    code: LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE,
    sqlState: LOCKING_READ_SQL_STATE.LOCK_NOT_AVAILABLE,
    conflict: true,
    retryable: true,
  };
}

function answerSettledStatement(service, {recorded, command}) {
  const settledAt = {
    partitionId: service.partitionId,
    logIndex: recorded.logIndex,
    replayOfLogIndex: recorded.logIndex,
  };
  if (recorded.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED) {
    return {
      success: true,
      ...settledAppliedResult(recorded),
      ...settledAt,
      ...(typeof command.entryId === 'string' && command.entryId.length > 0 ?
        {durableCommitWitness: buildDurableCommitWitness({
          partitionId: service.partitionId,
          leaderNodeId: service.nodeId,
          leaderReplicaId: service.replicaId,
          logEntry: {term: recorded.term, index: recorded.logIndex,
            data: command},
        })} : {}),
    };
  }
  return {
    success: false,
    error: recorded.failureMessage,
    failureCode: recorded.failureCode,
    ...lockingReadReplayFieldsOf(recorded.failureCode),
    // The statement-admission owner's refusal layer, read from the record.
    ...refusalLayerFieldOf(recorded.failureCode, recorded.failureMessage),
    committed: true,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    entryId: command.entryId,
    ...settledAt,
  };
}

/**
 * Settle a committed entry whose entry key already has a recorded outcome:
 * the statement is not executed again, and the proposer's write resolves to
 * the settled answer. Nothing new is recorded - the first outcome stays the
 * authority.
 * @param {Object} service - The partition.
 * @param {Object} replay - {recorded, command, afterCommit}.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
function settleRecordedCommittedStatement(service, {recorded, command,
  afterCommit}) {
  afterCommit(() => service.resolveCommittedWrite(command.entryId,
    answerSettledStatement(service, {recorded, command})));
  if (recorded.outcome !== PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED) {
    return PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED;
  }
  afterCommit(() => {
    service.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
      partitionId: service.partitionId,
      commandType: command.type,
      skippedReplay: true,
      replayOfLogIndex: recorded.logIndex,
    });
    service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: service.partitionId,
      command,
    });
  });
  return PARTITION_COMMITTED_COMMAND_OUTCOME.REPLAYED;
}

/**
 * Settle a committed entry whose statement threw: an environmental failure
 * fails the application closed (the proposer's write is rejected with the
 * typed error after the rollback; nothing is recorded or consumed); any other
 * failure is STATEMENT_FAILED - recorded with its code and message, the entry
 * consumed, and the proposer's write resolved as the failure it is.
 * @param {Object} service - The partition.
 * @param {Object} failure - {error, command, entryKey, index, term,
 *   identity, afterCommit, afterRollback}.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
function settleFailedCommittedStatement(service, {error, command, entryKey,
  index, term, identity, afterCommit, afterRollback}) {
  if (!isDeterministicStatementFailure(error, service.db)) {
    const failure = statementEnvironmentFailure(error);
    afterRollback(() => service.rejectCommittedWrite(command.entryId, failure));
    throw failure;
  }
  recordCommittedStatementOutcome(service, {
    entryKey,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    index,
    term,
    error,
  });
  service.logger.error(PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED, {
    partitionId: service.partitionId,
    error: error.message,
    sql: command.sql.substring(0, PARTITION_SERVICE_VALUE.CDC_REDACTION_LIMIT),
    params: command.params || [],
  });
  afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    success: false,
    error: error.message,
    failureCode: failureCodeOf(error),
    ...refusalLayerFieldOf(failureCodeOf(error), String(error.message)),
    committed: true,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    entryId: command.entryId,
    ...identity,
  }));
  return PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED;
}

/**
 * Deterministically settle a committed SQL write that conflicts with an active
 * durable FOR_UPDATE reservation in service.db: records STATEMENT_FAILED under
 * LOCK_NOT_AVAILABLE and resolves the proposer with typed 55P03 conflict fields.
 *
 * @param {Object} service - The partition.
 * @param {Object} refused - {lockConflict, command, entryKey, index, term, identity, afterCommit}.
 * @return {string} PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED.
 */
function settleLockingReadRefusedCommittedStatement(service, {
  lockConflict, command, entryKey, index, term, identity, afterCommit,
}) {
  recordCommittedStatementOutcome(service, {
    entryKey,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    index,
    term,
    error: {code: lockConflict.errorCode, message: lockConflict.error},
  });
  afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    success: false,
    error: lockConflict.error,
    failureCode: lockConflict.errorCode,
    errorCode: lockConflict.errorCode,
    code: lockConflict.code,
    sqlState: lockConflict.sqlState,
    conflict: true,
    retryable: true,
    ...(lockConflict.rowKey ? {rowKey: lockConflict.rowKey} : {}),
    ...(lockConflict.conflictingTransactionId ?
      {conflictingTransactionId: lockConflict.conflictingTransactionId} : {}),
    committed: true,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    entryId: command.entryId,
    ...identity,
  }));
  return PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED;
}

export {
  committedStatementEntryKey,
  committedStatementOutcomeFormatError,
  detectCommittedStatementOutcomeFormat,
  isCommittedStatementKeyed,
  ownerCommandPrelude,
  readCommittedStatementCensusIn,
  readSettledOwnerCommandIn,
  answerSettledStatement,
  createCommittedStatementOutcomeTable,
  isDeterministicStatementFailure,
  readCommittedStatementOutcome,
  recordCommittedStatementOutcome,
  settleFailedCommittedStatement,
  settleLockingReadRefusedCommittedStatement,
  settleRecordedCommittedStatement,
  statementEnvironmentFailure,
  trackPendingOwnerCommand,
};
