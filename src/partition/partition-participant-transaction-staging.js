// Staging under F6 c' (TX1 design revision 10, section 3.1; table 4's ACTIVE
// and PREPARING session cells): the one owner of how a session statement
// runs on the leader. No SQLite transaction is held across requests. Each
// statement is checked and then validated in ONE synchronous
// `db.transaction(fn)()` whose `fn` replays the session's staged operations,
// runs the statement and throws a private sentinel, so better-sqlite3 rolls
// everything back: nothing a session stages is ever visible to another
// reader, written to consensus or left on the shared connection, and no
// await runs while the transaction is open.
//
// A session write: the admission owner (WRITE_PATH) admits its entry; its
// params are narrowed to JSON scalars (string, finite number, null: what the
// proposal codec carries unchanged); the classifier
// (partition-transaction-determinism.js) admits its whole program; the
// session's bounds hold (256 operations, 1 MiB of operations text); then the
// replay runs it through the statement-admission owner's committed hook, as
// the PREPARE dry run and the COMMIT will (the post-statement rowid ceiling
// included). The reply is provisional; the COMMIT answers the results of
// the committed apply. A session read replays the same way and reads
// committed state plus the session's own operations, bounded by the
// request's result budget. A statement that fails is refused and stages
// nothing; a replay that no longer runs dooms the session.
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {collectBoundedSqliteRows, QUERY_RESULT_REQUEST_FIELD} from
  '../query/query-result-budget.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  committedCommandRefusalResult,
} from './partition-committed-command-admission.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER,
} from './partition-statement-admission-constants.js';
import {
  classifyTransactionStatement,
  transactionStatementKindOf,
} from './partition-transaction-determinism.js';
import {
  TRANSACTION_CLASSIFIER_LAYER as LAYER,
  TRANSACTION_STATEMENT_KIND as KIND,
} from './partition-transaction-determinism-constants.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_REPLAY_BOUND as BOUND,
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {checkAndRecordSessionRowKey} from
  './partition-participant-transaction-session.js';
import {readPartitionWriteGeneration} from
  './partition-participant-transaction-store.js';

const {
  PARTITION_SERVICE_OPERATION,
  QUERY_PAYLOAD_FIELD_ENTRY_ID,
  buildPartitionWriteEntry,
} = PARTITION_SERVICE_SHARED;

const TEXT_ENCODING = 'utf8';
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const ZERO = 0;
const ONE = 1;
// The private value that ends a validation: thrown inside its transaction,
// so better-sqlite3 rolls every replayed and new effect back.
const VALIDATION_COMPLETE = Object.freeze({validationComplete: true});
const STAGING_REPLAY_STATS = new WeakMap();

function replayStatsOf(service) {
  let stats = STAGING_REPLAY_STATS.get(service);
  if (!stats) {
    stats = {
      emptyReadDirectExecutions: ZERO,
      fastReplayedOperations: ZERO,
      fullReplayedOperations: ZERO,
    };
    STAGING_REPLAY_STATS.set(service, stats);
  }
  return stats;
}

function getStagingReplayStats(service) {
  return {...replayStatsOf(service)};
}

function readSchemaVersion(db) {
  try {
    return Number(db?.pragma?.(PRAGMA_SCHEMA_VERSION, {simple: true})) || ZERO;
  } catch (_err) {
    return ZERO;
  }
}

// What a session write's or read's refusal carries.
function refused(failureCode, fields = {}) {
  return {success: false, failureCode, ...fields};
}

function isJsonScalar(value) {
  return value === null || typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value));
}

// A classifier refusal: a statement that does not compile is the client's
// deterministic error; any other layer is a nondeterministic statement.
function classifierRefusal(classified) {
  return refused(classified.refusalLayer === LAYER.COMPILE ?
    CODE.STATEMENT_FAILED : CODE.SESSION_WRITE_NONDETERMINISTIC,
  {refusalLayer: classified.refusalLayer, detail: classified.detail ?? null});
}

function runStaged(service, operation) {
  return runCommittedPartitionStatement(service, {
    type: PARTITION_SERVICE_OPERATION.QUERY,
    sql: operation.sql,
    params: operation.params,
  });
}

function replayOneStagedOperation(
  service,
  operation,
  compiledStatement,
  canFastReplay,
  stats,
) {
  try {
    if (canFastReplay && compiledStatement) {
      compiledStatement.run(...operation.params);
      stats.fastReplayedOperations += ONE;
    } else {
      runStaged(service, operation);
      stats.fullReplayedOperations += ONE;
    }
  } catch (replayError) {
    throw Object.freeze({replayDiverged: true, cause: replayError});
  }
}

function replayStagedOperations(service, session) {
  const stats = replayStatsOf(service);
  const currentGen = readPartitionWriteGeneration(service.db);
  const currentSchema = readSchemaVersion(service.db);
  const canFastReplay =
    currentGen === session.lastValidatedGeneration &&
    currentSchema === session.lastValidatedSchemaVersion &&
    Array.isArray(session.compiledOperations);
  for (let index = ZERO; index < session.operations.length; index += ONE) {
    replayOneStagedOperation(
      service,
      session.operations[index],
      session.compiledOperations?.[index] ?? null,
      canFastReplay,
      stats,
    );
  }
}

/**
 * Run `run` over the session's replayed operations inside one synchronous
 * transaction that always rolls back.
 * @param {Object} service - The partition (its leader).
 * @param {Object} session - The staging session.
 * @param {Function} run - The statement, run after the replay.
 * @return {{ran: *}|{failure: *}} What `run` returned, or what failed.
 */
function validateOverReplay(service, session, run) {
  let ran;
  let stopped = VALIDATION_COMPLETE;
  try {
    service.db.transaction(() => {
      replayStagedOperations(service, session);
      ran = run();
      throw VALIDATION_COMPLETE;
    })();
  } catch (thrown) {
    stopped = thrown;
  }
  return stopped === VALIDATION_COMPLETE ? {ran} : {failure: stopped};
}

// A replay that no longer runs (committed state changed under the staged
// operations): the session is doomed, and so is every later request of it.
function doomSession(service, session, failure) {
  session.phase = PHASE.DOOMED;
  session.doomCode = CODE.REPLAY_DIVERGED;
  service.logger.warn(LOG_MSG.SESSION_DOOMED, {
    partitionId: service.partitionId,
    transactionId: session.identity.transactionId,
    error: String(failure.cause?.message ?? failure.cause)});
  return refused(CODE.REPLAY_DIVERGED,
    {detail: String(failure.cause?.message ?? failure.cause)});
}

// The new statement's own failure: the post-statement rowid ceiling is the
// classifier's layer 11; anything else is a deterministic statement failure.
function statementFailureOf(failure) {
  if (failure?.code === PARTITION_STATEMENT_REFUSAL_CODE) {
    return failure.refusalLayer === PARTITION_STATEMENT_REFUSAL_LAYER.ROWID_CEILING ?
      refused(CODE.SESSION_WRITE_NONDETERMINISTIC, {refusalLayer: LAYER.ROWID_CEILING}) :
      refused(CODE.STATEMENT_FAILED, {refusalLayer: failure.refusalLayer});
  }
  return refused(CODE.STATEMENT_FAILED, {detail: String(failure?.message ?? failure)});
}

function failedValidation(service, session, failure) {
  return failure?.replayDiverged === true ? doomSession(service, session, failure) :
    statementFailureOf(failure);
}

// The admitted entry of a session write (design 3.1 step 1): its entryId as
// the client supplied it (minted when absent), refused by the admission
// owner when invalid, exactly as the write path admits a write.
function admittedEntry(service, session, request, params) {
  const entry = buildPartitionWriteEntry({
    type: PARTITION_SERVICE_OPERATION.QUERY, sql: request.sql, params,
    entryId: request[QUERY_PAYLOAD_FIELD_ENTRY_ID] ?? null,
    sessionId: session.identity.sessionId,
  }, {proposedBy: service.replicaId, proposedAt: service.timeSource.now()});
  const admission = admitCommittedCommand(entry,
    {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH});
  return admission.admitted ? {entry} :
    {refusal: committedCommandRefusalResult(admission, service.partitionId)};
}

function stageWrite(service, session, request, params) {
  const admitted = admittedEntry(service, session, request, params);
  if (admitted.refusal !== undefined) {
    return admitted.refusal;
  }
  if (!params.every(isJsonScalar)) {
    return refused(CODE.SESSION_WRITE_PARAM_UNSUPPORTED);
  }
  const rowKeyCheck = checkAndRecordSessionRowKey(service, session, params);
  if (rowKeyCheck.conflict) {
    return refused(CODE.ALREADY_ACTIVE, {detail: rowKeyCheck.rowKey});
  }
  const classified = classifyTransactionStatement(service.db,
    {tableName: service.tableName, sql: request.sql, params});
  if (!classified.admitted) {
    return classifierRefusal(classified);
  }
  // As the PREPARE will carry it: the decoding of its own JSON text.
  const operation = JSON.parse(JSON.stringify({entryId: admitted.entry.entryId,
    sql: request.sql, params}));
  const operations = [...session.operations, operation];
  const bytes = Buffer.byteLength(JSON.stringify(operations), TEXT_ENCODING);
  if (operations.length > BOUND.MAX_OPERATIONS || bytes > BOUND.MAX_BYTES) {
    return refused(CODE.REPLAY_BUDGET_EXCEEDED,
      {operations: operations.length, bytes});
  }
  const outcome = validateOverReplay(service, session,
    () => runStaged(service, operation));
  if (outcome.failure !== undefined) {
    return failedValidation(service, session, outcome.failure);
  }
  session.operations = operations;
  if (Array.isArray(session.compiledOperations)) {
    session.compiledOperations.push(classified.statement);
  }
  session.lastValidatedGeneration = readPartitionWriteGeneration(service.db);
  session.lastValidatedSchemaVersion = readSchemaVersion(service.db);
  session.bytes = bytes;
  return {success: true, provisional: true, changes: outcome.ran.changes,
    lastInsertRowid: outcome.ran.lastInsertRowid};
}

function readInSession(service, session, request, params) {
  const classified = classifyTransactionStatement(service.db,
    {tableName: service.tableName, sql: request.sql, params});
  if (!classified.admitted) {
    return classifierRefusal(classified);
  }
  const rowBudgetOptions = {
    deadlineMs: request[QUERY_RESULT_REQUEST_FIELD.DEADLINE_MS],
    maxBytes: request[QUERY_RESULT_REQUEST_FIELD.MAX_BYTES],
    maxRows: request[QUERY_RESULT_REQUEST_FIELD.MAX_ROWS],
  };
  if (session.operations.length === ZERO) {
    try {
      const rows = collectBoundedSqliteRows(
        classified.statement,
        params,
        rowBudgetOptions,
      );
      replayStatsOf(service).emptyReadDirectExecutions += ONE;
      return {success: true, rows, count: rows.length};
    } catch (directReadError) {
      return refused(CODE.STATEMENT_FAILED, {
        error: String(directReadError?.message ?? directReadError),
        errorCode: directReadError?.code ?? null,
      });
    }
  }
  const outcome = validateOverReplay(service, session, () =>
    collectBoundedSqliteRows(classified.statement, params, rowBudgetOptions));
  if (outcome.failure?.replayDiverged === true) {
    return doomSession(service, session, outcome.failure);
  }
  // The read's own failure (its result budget included) is typed as every
  // session statement's is; errorCode keeps its owner's code.
  if (outcome.failure !== undefined) {
    return refused(CODE.STATEMENT_FAILED, {
      error: String(outcome.failure?.message ?? outcome.failure),
      errorCode: outcome.failure?.code ?? null});
  }
  return {success: true, rows: outcome.ran, count: outcome.ran.length};
}

/**
 * Run one statement of a staging session on the leader (design 3.1): a
 * write is staged, provisionally, or refused with nothing staged; a read
 * answers committed state plus the session's own operations. The caller
 * routed the request to this session and answers its phase (a sealed
 * session stages no write).
 * @param {Object} service - The partition (its leader).
 * @param {Object} session - The session (partition-participant-transaction-
 *   session.js).
 * @param {Object} request - The QUERY request ({sql, params, entryId?} and
 *   the result budget fields).
 * @return {Object} {success, ...}: a staged write's {provisional, changes,
 *   lastInsertRowid}, a read's {rows, count}, or a typed refusal
 *   {failureCode, refusalLayer?}.
 */
function runParticipantSessionStatement(service, session, request) {
  const params = Array.isArray(request.params) ? request.params : [];
  return transactionStatementKindOf(request.sql) === KIND.WRITE ?
    stageWrite(service, session, request, params) :
    readInSession(service, session, request, params);
}

export {
  getStagingReplayStats,
  runParticipantSessionStatement,
};
