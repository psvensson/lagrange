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
// is never executed again. It resolves from the row: an APPLIED row as an
// idempotent replay, a STATEMENT_FAILED row as the original failure, each
// with `replayOfLogIndex`. There is no in-memory replay state: a retry is
// answered from the row before it is proposed, and one that was proposed
// anyway (its original not yet applied here when it was proposed) is answered
// from the row when it is applied - the same answer either way.

import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
} from './partition-service-constants.js';
import {
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_SQLITE_RESULT_CODE,
} from './partition-committed-statement-outcome-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_VALUE,
  buildDurableCommitWitness,
} = PARTITION_SERVICE_SHARED;

/**
 * Create the outcome table (DDL; run once at partition initialization, after
 * the legacy-state detector).
 * @param {Object} db - The partition's connection.
 */
function createCommittedStatementOutcomeTable(db) {
  db.exec(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE);
}

const UNSETTLED_RECORD = Object.freeze({
  state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED,
});

/**
 * The recorded terminal outcome of an entry key: SETTLED with the record, or
 * UNSETTLED when no committed statement with that key has been settled.
 * @param {Object} service - The partition (its `db`).
 * @param {string} entryKey - The committed entry key.
 * @return {Object} Frozen {state} (a PARTITION_COMMITTED_STATEMENT_RECORD_STATE)
 *   and, when SETTLED, {outcome, logIndex, term, failureCode, failureMessage}.
 */
function readCommittedStatementOutcome(service, entryKey) {
  const row = service.db
    .prepare(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (row === undefined) {
    return UNSETTLED_RECORD;
  }
  return Object.freeze({
    state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED,
    outcome: row.outcome,
    logIndex: Number(row.log_index),
    term: Number(row.term),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
  });
}

/**
 * Record an entry key's terminal outcome, inside the application
 * transaction.
 * @param {Object} service - The partition (its `db`).
 * @param {Object} outcome - {entryKey, outcome, index, term, error}; `error`
 *   only for STATEMENT_FAILED.
 */
function recordCommittedStatementOutcome(service, {entryKey, outcome, index,
  term, error = null}) {
  service.db.prepare(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.INSERT).run(
    entryKey, outcome, index, term,
    error === null ? null : failureCodeOf(error),
    error === null ? null : String(error.message));
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
 * reached the application. An APPLIED row answers an idempotent replay with
 * the durable commit witness this replica attests (the entry and the term and
 * index it was applied at); a STATEMENT_FAILED row answers the original
 * failure.
 * @param {Object} service - The partition (its identity).
 * @param {Object} settled - {recorded, command}: the SETTLED record and the
 *   command asking.
 * @return {Object} The write result.
 */
function answerSettledStatement(service, {recorded, command}) {
  const settledAt = {
    partitionId: service.partitionId,
    logIndex: recorded.logIndex,
    replayOfLogIndex: recorded.logIndex,
  };
  if (recorded.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED) {
    return {
      success: true,
      changes: 0,
      idempotentReplay: true,
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
    ...identity,
  }));
  return PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED;
}

export {
  answerSettledStatement,
  createCommittedStatementOutcomeTable,
  readCommittedStatementOutcome,
  recordCommittedStatementOutcome,
  settleFailedCommittedStatement,
  settleRecordedCommittedStatement,
};
