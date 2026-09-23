// What a failed statement in a committed entry means: the one owner of that
// decision for the partition's committed-entry application.
//
// A committed entry is applied inside the transaction that advances the
// durable applied index. When its statement throws, the failure is exactly
// one of three named outcomes (PARTITION_COMMITTED_COMMAND_OUTCOME):
//
// - STATEMENT_ENVIRONMENT_FAILED: the failure is the host's environment
//   (busy, locked, I/O, full, out of memory...), not the statement's. It is
//   never consumed: the application fails closed, the transaction rolls back
//   and the committed entry is delivered again when the host recovers.
//   Consuming it would let one replica skip an entry every other replica
//   applies.
// - REPLAYED: a duplicate-key INSERT whose SAME entry identity the partition
//   already applied at an earlier index of its durable log - a client retry
//   of an acknowledged write (after a restart the in-memory replay set is
//   empty, so the retry is proposed again). The durable log, not a
//   constraint code alone, is what recognises it.
// - STATEMENT_FAILED: every other failure is deterministic in the command and
//   the state (a constraint violation under a different entry identity, a
//   schema or binding error): the entry is consumed and the write is reported
//   as the failure it is.

import {findPartitionAppliedCommand} from './partition-committed-log.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES,
  PARTITION_SQLITE_RESULT_CODE,
} from './partition-service-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_VALUE,
  SQL,
} = PARTITION_SERVICE_SHARED;

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
 * Whether a failure is the shape a replayed INSERT fails with: a primary-key
 * or unique constraint on an INSERT statement.
 * @param {*} error - What the statement threw.
 * @param {Object} command - The committed command.
 * @return {boolean} Whether the failure has the replay signature.
 */
function hasInsertReplaySignature(error, command) {
  const sqlUpper = String(command.sql).trim().toUpperCase();
  const isInsertStatement =
    sqlUpper.startsWith(SQL.INSERT_INTO) ||
    sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO) ||
    sqlUpper.startsWith(SQL.INSERT_OR_IGNORE_INTO);
  if (!isInsertStatement) {
    return false;
  }
  const code = String(error?.code || '').toUpperCase();
  if (code === PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT_PRIMARYKEY) {
    return true;
  }
  return code.startsWith(PARTITION_SERVICE_LITERAL.SQLITE_CONSTRAINT) &&
    String(error?.message || '').toUpperCase()
      .includes(PARTITION_SERVICE_LITERAL.UNIQUE_CONSTRAINT_FAILED);
}

/**
 * Decide what a failed statement in a committed entry means.
 * @param {Object} service - The partition (its `db`, `partitionId` and
 *   `getCommittedEntryKey`).
 * @param {Object} failure - {error, command, entryKey}: what the statement
 *   threw, the committed command and its entry identity.
 * @return {Object} Frozen {outcome} (a PARTITION_COMMITTED_COMMAND_OUTCOME),
 *   with `replayOf` - the earlier applied {index, term, command} - when the
 *   outcome is REPLAYED.
 */
function classifyCommittedStatementFailure(service, {error, command,
  entryKey}) {
  if (!isDeterministicStatementFailure(error, service.db)) {
    return Object.freeze({
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_ENVIRONMENT_FAILED,
    });
  }
  const replayOf = entryKey && hasInsertReplaySignature(error, command) ?
    findPartitionAppliedCommand(service, (applied) =>
      service.getCommittedEntryKey(applied) === entryKey) :
    null;
  return replayOf === null ?
    Object.freeze({outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED}) :
    Object.freeze({outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.REPLAYED,
      replayOf});
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
 * Settle a committed entry whose statement threw, as classified: an
 * environmental failure fails the application closed (the proposer's write
 * is rejected with the typed error after the rollback; the entry is not
 * consumed); a replay is acknowledged as an idempotent replay pointing at the
 * applied instance; any other failure consumes the entry and resolves the
 * proposer's write as the failure it is. Every observable effect is deferred
 * to the application transaction's commit or rollback.
 * @param {Object} service - The partition.
 * @param {Object} failure - {error, command, entryKey, identity,
 *   afterCommit, afterRollback}: the failure, the committed command, its
 *   entry identity and commit identity, and the transaction's effect
 *   schedulers.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
function settleFailedCommittedStatement(service, {error, command, entryKey,
  identity, afterCommit, afterRollback}) {
  const decision = classifyCommittedStatementFailure(service, {
    error, command, entryKey});
  if (decision.outcome ===
      PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_ENVIRONMENT_FAILED) {
    const failure = statementEnvironmentFailure(error);
    afterRollback(() => service.rejectCommittedWrite(command.entryId, failure));
    throw failure;
  }
  if (decision.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.REPLAYED) {
    const replayOfLogIndex = Number(decision.replayOf.index);
    afterCommit(() => {
      service.trackAppliedEntryKey(entryKey, identity.durableCommitWitness);
      service.logger.warn(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
        partitionId: service.partitionId,
        commandType: command.type,
        skippedReplay: true,
        replayOfLogIndex,
        error: error.message,
      });
      service.resolveCommittedWrite(command.entryId, {
        success: true,
        changes: 0,
        idempotentReplay: true,
        replayOfLogIndex,
        ...identity,
      });
      service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
        partitionId: service.partitionId,
        command,
      });
    });
    return decision.outcome;
  }
  service.logger.error(PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED, {
    partitionId: service.partitionId,
    error: error.message,
    sql: command.sql.substring(0, PARTITION_SERVICE_VALUE.CDC_REDACTION_LIMIT),
    params: command.params || [],
  });
  afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    success: false,
    error: error.message,
    ...identity,
  }));
  return decision.outcome;
}

export {settleFailedCommittedStatement};
