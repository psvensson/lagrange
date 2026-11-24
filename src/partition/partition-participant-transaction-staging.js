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
import {executionEnvelopeOf} from './partition-transaction-execution-envelope.js';
import {collectBoundedTypedRowSet, QUERY_RESULT_REQUEST_FIELD} from
  '../query/query-result-budget.js';
import {materializeAndPresentRowObjects} from '../query/sql-value-presentation.js';
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
import {
  canAdvanceRowKeySessionGeneration,
  canRebaseEmptyWaitingSession,
  checkAndRecordSessionRowKey,
  findParticipantSession,
  isRowKeyConcurrencyEnabled,
  notifyRowKeySettlementWaiters,
  revertSessionRowKeyCheck,
} from './partition-participant-transaction-session.js';
import {
  recordSessionReadDependencyFootprint,
  widenSessionReadToPartition,
} from './partition-participant-read-dependencies.js';
import {
  checkPartitionWriteLockingReadConflict,
  recordSessionStagedWriteClaims,
} from './partition-locking-read-write-check.js';
import {
  readOptionalPartitionWriteGeneration,
  readPartitionWriteGeneration,
  readTableFootprintMetadata,
} from './partition-participant-transaction-store.js';
import {SQLParser} from '../query/sql-parser.js';
import {extractStatementWriteFootprint} from './partition-write-footprint-contract.js';

const {
  PARTITION_SERVICE_OPERATION,
  QUERY_PAYLOAD_FIELD_ENTRY_ID,
  buildPartitionWriteEntry,
} = PARTITION_SERVICE_SHARED;

const TEXT_ENCODING = 'utf8';
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const ZERO = 0;
const ONE = 1;
const EMPTY_ARRAY_BRACKET_BYTES = 2;
const ARRAY_ELEMENT_COMMA_BYTES = 1;
const MAX_MEMOIZED_FOOTPRINT_PLANS = 256;
const STAT_EMPTY_READ_DIRECT = 'emptyReadDirectExecutions';
const STAT_DISJOINT_DIRECT_READS = 'disjointDirectReads';
const PG_PARAM_PATTERN = /\$[1-9]\d*/u;
const SQL_DIALECT_PG = 'postgresql';
const SQL_DIALECT_SQLITE = 'sqlite';
const SELECT_AST_TYPE = 'SELECT';
const TABLE_SOURCE_TYPE = 'table';
const SUBQUERY_NODE_TYPES = new Set(['subquery', 'exists']);
const UNSCOPED_SELECT_AST = Object.freeze({unscoped: true});
const UNSCOPED_QUERY_READ_FOOTPRINT = Object.freeze({scoped: false, rowKeys: Object.freeze([])});
// The private value that ends a validation: thrown inside its transaction,
// so better-sqlite3 rolls every replayed and new effect back.
const VALIDATION_COMPLETE = Object.freeze({validationComplete: true});
const STAGING_REPLAY_STATS = new WeakMap();
const footprintPlanMemo = {
  entries: new Map(),
  hitCount: ZERO,
  missCount: ZERO,
};

function deepFreezeAst(node) {
  if (!node || typeof node !== 'object' || Object.isFrozen(node)) return node;
  if (Array.isArray(node)) {
    for (let i = ZERO; i < node.length; i += ONE) deepFreezeAst(node[i]);
    return Object.freeze(node);
  }
  const values = Object.values(node);
  for (let i = ZERO; i < values.length; i += ONE) deepFreezeAst(values[i]);
  return Object.freeze(node);
}

function containsAstSubquery(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(containsAstSubquery);
  const type = String(node.type ?? '').toLowerCase();
  if (SUBQUERY_NODE_TYPES.has(type) || Boolean(node.subquery) || Boolean(node.query)) {
    return true;
  }
  return Object.values(node).some(containsAstSubquery);
}

function isPlainTableFrom(from, tableName) {
  if (from?.type !== TABLE_SOURCE_TYPE || typeof from.name !== 'string' || from.subquery) {
    return false;
  }
  const hasTable = typeof tableName === 'string' && tableName.length > ZERO;
  return !hasTable || from.name.toLowerCase() === tableName.toLowerCase();
}

function isBaseSingleTableSelectAst(ast) {
  const isSelect = Boolean(ast) && String(ast.type ?? '').toUpperCase() === SELECT_AST_TYPE;
  const hasJoins = Array.isArray(ast?.joins) && ast.joins.length > ZERO;
  return isSelect && !ast.ctes && !ast.setOperation && !hasJoins;
}

function hasNoSubqueryClauses(ast) {
  const clauses = [ast.columns, ast.groupBy, ast.having, ast.orderBy, ast.limit];
  return !clauses.some(containsAstSubquery);
}

function buildFootprintPlanEntry(trimmedStatement) {
  try {
    const dialect = PG_PARAM_PATTERN.test(trimmedStatement) ? SQL_DIALECT_PG : SQL_DIALECT_SQLITE;
    const parser = new SQLParser(trimmedStatement, {dialect});
    parser.logger = {debug() {}, info() {}, warn() {}, error() {}};
    const ast = deepFreezeAst(parser.parse());
    const eligibleSelect = isBaseSingleTableSelectAst(ast) && hasNoSubqueryClauses(ast);
    return Object.freeze({ast, eligibleSelect});
  } catch {
    return Object.freeze({ast: null, eligibleSelect: false});
  }
}

function resolveFootprintPlanEntry(statementText) {
  if (typeof statementText !== 'string') return null;
  const trimmed = statementText.trim();
  if (trimmed.length === ZERO) return null;
  const entries = footprintPlanMemo.entries;
  if (entries.has(trimmed)) {
    const existing = entries.get(trimmed);
    entries.delete(trimmed);
    entries.set(trimmed, existing);
    footprintPlanMemo.hitCount += ONE;
    return existing;
  }
  footprintPlanMemo.missCount += ONE;
  const entry = buildFootprintPlanEntry(trimmed);
  if (entries.size >= MAX_MEMOIZED_FOOTPRINT_PLANS) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }
  entries.set(trimmed, entry);
  return entry;
}

function resolveStatementFootprintAst(statementText) {
  return resolveFootprintPlanEntry(statementText)?.ast ?? null;
}

function getOrParseCachedStatementFootprintAst(statementText) {
  return resolveStatementFootprintAst(statementText);
}

function getFootprintPlanCacheStats() {
  return {
    hitCount: footprintPlanMemo.hitCount,
    missCount: footprintPlanMemo.missCount,
    size: footprintPlanMemo.entries.size,
    maxEntries: MAX_MEMOIZED_FOOTPRINT_PLANS,
  };
}

function parseScopedSelectAst(sql, tableName) {
  const entry = resolveFootprintPlanEntry(sql);
  if (!entry?.eligibleSelect || !entry.ast) return UNSCOPED_SELECT_AST;
  return isPlainTableFrom(entry.ast.from, tableName) ? entry.ast : UNSCOPED_SELECT_AST;
}

function extractQueryReadFootprint(service, sql, params) {
  if (!isRowKeyConcurrencyEnabled(service)) return UNSCOPED_QUERY_READ_FOOTPRINT;
  const ast = parseScopedSelectAst(sql, service.tableName);
  if (ast === UNSCOPED_SELECT_AST) return UNSCOPED_QUERY_READ_FOOTPRINT;
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    readTableFootprintMetadata(service?.db, service?.tableName);
  return extractStatementWriteFootprint({
    ast,
    params: Array.isArray(params) ? params : [],
    pkCols,
    allCols,
    uniqueConstraintCols,
    hasUnscopedSchemaConstraints,
  });
}

function applyQueryReadFootprintToSession(service, session, footprint) {
  if (!session || session.hasUnscopedRead === true) return;
  if (!isRowKeyConcurrencyEnabled(service) ||
      !footprint?.scoped || footprint.rowKeys.length === ZERO) {
    widenSessionReadToPartition(session);
    return;
  }
  recordSessionReadDependencyFootprint(session, footprint);
}

function replayStatsOf(service) {
  let stats = STAGING_REPLAY_STATS.get(service);
  if (!stats) {
    stats = {
      disjointDirectValidations: ZERO,
      disjointDirectReads: ZERO,
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

function validateDirectDisjointWrite(service, session, run) {
  let ran;
  let stopped = VALIDATION_COMPLETE;
  try {
    service.db.transaction(() => {
      ran = run();
      throw VALIDATION_COMPLETE;
    })();
  } catch (thrown) {
    stopped = thrown;
  }
  if (stopped === VALIDATION_COMPLETE) {
    const stats = replayStatsOf(service);
    stats.disjointDirectValidations += ONE;
    stats.fastReplayedOperations += session.operations.length;
    return {ran};
  }
  return {failure: stopped};
}

function canDirectValidateDisjoint(service, session, rowKeyCheck) {
  if (session.operations.length === ZERO ||
      session.hasUnscopedWrite === true ||
      rowKeyCheck.scoped !== true ||
      rowKeyCheck.alreadyTouchedInSession !== false ||
      rowKeyCheck.rowKey === null) {
    return false;
  }
  const currentGen = readPartitionWriteGeneration(service.db);
  const currentSchema = readSchemaVersion(service.db);
  return currentGen === session.lastValidatedGeneration &&
    (session.lastValidatedSchemaVersion === null ||
      currentSchema === session.lastValidatedSchemaVersion);
}

// A replay that no longer runs (committed state changed under the staged
// operations): the session is doomed, and so is every later request of it.
function doomSession(service, session, failure) {
  session.phase = PHASE.DOOMED;
  session.doomCode = CODE.REPLAY_DIVERGED;
  if (session.hasUnscopedWrite === true || session.touchedRowKeys?.size > ZERO) {
    notifyRowKeySettlementWaiters(service);
  }
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

function buildImmutableStagedOperation(entryId, sql, params) {
  const cloned = JSON.parse(JSON.stringify({entryId, sql, params}));
  return Object.freeze({
    entryId: cloned.entryId,
    sql: cloned.sql,
    params: Object.freeze(cloned.params),
  });
}

function computeIncrementalStagedBytes(session, operationBytes) {
  return session.operations.length === ZERO ?
    EMPTY_ARRAY_BRACKET_BYTES + operationBytes :
    session.bytes + ARRAY_ELEMENT_COMMA_BYTES + operationBytes;
}

function appendValidatedOperationToSession(
  service, session, operation, operationText, nextBytes, classifiedStmt,
) {
  session.operations.push(operation);
  if (Array.isArray(session.encodedOperations)) {
    session.encodedOperations.push(operationText);
  }
  recordSessionStagedWriteClaims(service, session, operation.sql, operation.params);
  if (Array.isArray(session.compiledOperations)) {
    session.compiledOperations.push(classifiedStmt);
  }
  session.lastValidatedGeneration = readPartitionWriteGeneration(service.db);
  session.lastValidatedSchemaVersion = readSchemaVersion(service.db);
  session.bytes = nextBytes;
}

function stageWrite(service, session, request, params) {
  const admitted = admittedEntry(service, session, request, params);
  if (admitted.refusal !== undefined) {
    return admitted.refusal;
  }
  if (!params.every(isJsonScalar)) {
    return refused(CODE.SESSION_WRITE_PARAM_UNSUPPORTED);
  }
  const parsedWriteAst = resolveStatementFootprintAst(request.sql);
  const rowKeyCheck = checkAndRecordSessionRowKey(
    service, session, params, request.sql, parsedWriteAst);
  if (rowKeyCheck.conflict) {
    return refused(CODE.ALREADY_ACTIVE, {detail: rowKeyCheck.rowKey});
  }
  const classified = classifyTransactionStatement(service.db,
    {tableName: service.tableName, sql: request.sql, params});
  if (!classified.admitted) {
    revertSessionRowKeyCheck(service, session, rowKeyCheck);
    return classifierRefusal(classified);
  }
  // Encode each immutable staged operation once and account bytes incrementally.
  const operation = buildImmutableStagedOperation(admitted.entry.entryId, request.sql, params);
  const operationText = JSON.stringify(operation);
  const operationBytes = Buffer.byteLength(operationText, TEXT_ENCODING);
  const nextOperationCount = session.operations.length + ONE;
  const nextBytes = computeIncrementalStagedBytes(session, operationBytes);
  if (nextOperationCount > BOUND.MAX_OPERATIONS || nextBytes > BOUND.MAX_BYTES) {
    revertSessionRowKeyCheck(service, session, rowKeyCheck);
    return refused(CODE.REPLAY_BUDGET_EXCEEDED,
      {operations: nextOperationCount, bytes: nextBytes});
  }
  const runWithSequentialLockCheck = () => {
    if (session.operations.length > ZERO) {
      const lockRefusal = checkPartitionWriteLockingReadConflict(service, {
        sql: operation.sql,
        params: operation.params,
        transactionId: session.identity.transactionId,
      });
      if (lockRefusal !== null) {
        throw Object.freeze({stagingLockConflict: true, lockRefusal});
      }
    }
    return runStaged(service, operation);
  };
  const outcome = canDirectValidateDisjoint(service, session, rowKeyCheck) ?
    validateDirectDisjointWrite(service, session, runWithSequentialLockCheck) :
    validateOverReplay(service, session, runWithSequentialLockCheck);
  if (outcome.failure !== undefined) {
    revertSessionRowKeyCheck(service, session, rowKeyCheck);
    if (outcome.failure?.stagingLockConflict === true) {
      return outcome.failure.lockRefusal;
    }
    return failedValidation(service, session, outcome.failure);
  }
  appendValidatedOperationToSession(
    service, session, operation, operationText, nextBytes, classified.statement);
  return {success: true, provisional: true, changes: outcome.ran.changes,
    lastInsertRowid: outcome.ran.lastInsertRowid};
}

function buildSessionReadAnswer(service, collected) {
  const readGeneration = readOptionalPartitionWriteGeneration(service.db);
  return {
    success: true,
    rowSet: collected.rowSet,
    rows: materializeAndPresentRowObjects(collected.columns, collected.rawRows),
    count: collected.rawRows.length,
    executionEnvelope: executionEnvelopeOf(service.db),
    ...(readGeneration !== null ? {readGeneration} : {}),
  };
}

function executeDirectRead(service, statement, params, rowBudgetOptions, statField) {
  try {
    const collected = collectBoundedTypedRowSet(statement, params, rowBudgetOptions);
    replayStatsOf(service)[statField] += ONE;
    return buildSessionReadAnswer(service, collected);
  } catch (directReadError) {
    return refused(CODE.STATEMENT_FAILED, {
      error: String(directReadError?.message ?? directReadError),
      errorCode: directReadError?.code ?? null,
    });
  }
}

function hasScopedDisjointReadAndStagedWrites(session, queryReadFootprint) {
  if (session.operations.length === ZERO ||
      session.hasUnscopedWrite === true ||
      !(session.touchedRowKeys instanceof Set) ||
      session.touchedRowKeys.size === ZERO ||
      queryReadFootprint?.scoped !== true ||
      !Array.isArray(queryReadFootprint.rowKeys) ||
      queryReadFootprint.rowKeys.length === ZERO) {
    return false;
  }
  return !queryReadFootprint.rowKeys.some((rk) => session.touchedRowKeys.has(rk));
}

function isSessionValidationCurrent(service, session) {
  const currentGen = readPartitionWriteGeneration(service.db);
  const currentSchema = readSchemaVersion(service.db);
  return currentGen === session.lastValidatedGeneration &&
    (session.lastValidatedSchemaVersion === null ||
      currentSchema === session.lastValidatedSchemaVersion);
}

function canDirectExecuteDisjointRead(service, session, queryReadFootprint) {
  return isRowKeyConcurrencyEnabled(service) &&
    hasScopedDisjointReadAndStagedWrites(session, queryReadFootprint) &&
    isSessionValidationCurrent(service, session);
}

function resolveDirectSessionReadStatField(service, session, queryReadFootprint) {
  if (session.operations.length === ZERO) return STAT_EMPTY_READ_DIRECT;
  return canDirectExecuteDisjointRead(service, session, queryReadFootprint) ?
    STAT_DISJOINT_DIRECT_READS : null;
}

function executeReplayedSessionRead(
  service, session, statement, params, rowBudgetOptions, queryReadFootprint,
) {
  const outcome = validateOverReplay(service, session, () =>
    collectBoundedTypedRowSet(statement, params, rowBudgetOptions));
  const failure = outcome.failure;
  if (failure?.replayDiverged === true) {
    return doomSession(service, session, failure);
  }
  if (failure !== undefined) {
    return refused(CODE.STATEMENT_FAILED, {
      error: String(failure?.message ?? failure),
      errorCode: failure?.code ?? null});
  }
  applyQueryReadFootprintToSession(service, session, queryReadFootprint);
  return buildSessionReadAnswer(service, outcome.ran);
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
  const queryReadFootprint = extractQueryReadFootprint(service, request.sql, params);
  const directStatField = resolveDirectSessionReadStatField(
    service, session, queryReadFootprint);
  if (directStatField !== null) {
    const directRead = executeDirectRead(
      service, classified.statement, params, rowBudgetOptions, directStatField);
    if (directRead?.success === true) {
      applyQueryReadFootprintToSession(service, session, queryReadFootprint);
    }
    return directRead;
  }
  return executeReplayedSessionRead(
    service, session, classified.statement, params, rowBudgetOptions, queryReadFootprint);
}

/**
 * Prepare a waiting active session for in-place re-evaluation after its
 * conflicting row-key holder settles. Sessions without prior unscoped reads
 * rebase generationBase when empty (and any read row keys are untouched) or
 * when staged operations and read row keys pass
 * canAdvanceRowKeySessionGeneration; sessions with unscoped or overlapping
 * read footprints proceed only when partition generation is unchanged.
 * @param {Object} service - The partition leader.
 * @param {Object} payload - The remote QUERY payload.
 * @return {boolean} True when answerParticipantSessionQuery may re-run.
 */
function prepareWaitingRowKeySessionForReevaluation(service, payload) {
  const session = findParticipantSession(service, payload);
  if (session === null || session.phase !== PHASE.ACTIVE) {
    return true;
  }
  const currentGeneration = readPartitionWriteGeneration(service.db);
  if (currentGeneration === session.generationBase) {
    return true;
  }
  if (session.hasUnscopedRead === true) {
    return false;
  }
  if (session.operations.length === ZERO) {
    if (!canRebaseEmptyWaitingSession(service, session, currentGeneration)) {
      return false;
    }
    session.generationBase = currentGeneration;
    session.lastValidatedGeneration = currentGeneration;
    return true;
  }
  if (canAdvanceRowKeySessionGeneration(service, session, currentGeneration)) {
    session.generationBase = currentGeneration;
    return true;
  }
  return false;
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
  getFootprintPlanCacheStats,
  getOrParseCachedStatementFootprintAst,
  getStagingReplayStats,
  prepareWaitingRowKeySessionForReevaluation,
  runParticipantSessionStatement,
};
