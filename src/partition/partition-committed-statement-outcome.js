import {carriesSplitDescriptorIntent, decodeSplitDescriptorCommand, descriptorRefusal, isSplitDescriptorDigest, retainedSplitDescriptorAnswer,
  SPLIT_DESCRIPTOR_ERROR} from './partition-split-descriptor-command.js';
// The terminal outcome of every committed statement: the one owner of what a
// committed statement's result is, for the partition's committed-entry
// application (APPLIED, STATEMENT_FAILED, or STATEMENT_ENVIRONMENT_FAILED).
// The outcome row (PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL) is the authority
// for a settled entry key: a retry resolves from the row without re-executing.
// Nullable insert-result contract (TX1 0.0.14): lastInsertRowid is retained
// only for INSERT/REPLACE without DO UPDATE that changed >= 1 row.

import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schema-shared-constants.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {detectCommittedStatementOutcomeFormat} from './partition-retained-store-observation.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE, PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {
  PARTITION_COMMITTED_STATEMENT_COLUMNS, PARTITION_COMMITTED_STATEMENT_ERROR_CODE,
  PARTITION_COMMITTED_STATEMENT_FORMAT, PARTITION_COMMITTED_RECORD_CLASS,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL, PARTITION_COMMITTED_STATEMENT_RECORD_STATE,
  PARTITION_DETERMINISTIC_STATEMENT_BINDING_ERRORS,
  PARTITION_DETERMINISTIC_STATEMENT_SQLITE_CODES, PARTITION_OWNER_COMMAND_PRELUDE,
  PARTITION_SETTLED_COMMAND_STATE, PARTITION_SETTLED_REPLAY, PARTITION_SQLITE_RESULT_CODE,
} from './partition-committed-statement-outcome-constants.js';
import {admitCommittedCommand, committedCommandRefusalResult} from
  './partition-committed-command-admission.js';
import {buildDurableCommitWitness} from './partition-write-kernel.js';
import {RETAINED_STORE_ERROR, retainedStoreError, readRetainedStoreRowsIn,
  isStoredInteger, isStoredNullableText,
  isStoredNullableInteger} from './partition-retained-store-observation.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE, refusalLayerFieldOf,
} from './partition-statement-admission-constants.js';
import {LOCKING_READ_ERROR_CODE, LOCKING_READ_SQL_STATE} from
  '../query/sql-locking-read-constants.js';
import {
  MIRROR_RETENTION_CUSTODY_ACTION,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  applyMirrorRetentionCustodyCommand,
  partitionOwesDurableMirrorEffects,
  readCapturedRowEffectsIn,
  readDurableMirrorRetentionCustodyIn,
  reconcileCommittedStatementMirrorEffects,
  registerMirrorRetentionRaftHooks,
  releaseSourceMirrorRetentionCustody,
  replicateSourceMirrorRetentionCustody,
  resolveActiveMirrorRetentionBarrierIndex,
} from './partition-mirror-effect-retention.js';

const NO_COMMITTED_STATEMENT_KEY = null;
const COLUMN_LIST_SEPARATOR = ', ';
const FORMAT_UNSUPPORTED_REMEDY =
  'format is refused, never migrated; re-found the data directory';
const OWNER_IDENTITY_RULE = 'an owner result is recorded with exactly its command digest';

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
    (row.mirror_effect_required === 0n || row.mirror_effect_required === 1n) &&
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
    mirrorEffectRequired: row.mirror_effect_required === 1n,
  }));
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
 * @param {string|null} [tableName] - PARTITIONS retains its terminal descriptor receipts here.
 */
function createCommittedStatementOutcomeTable(db, partitionId = null, tableName = null) {
  const format = detectCommittedStatementOutcomeFormat(db);
  if (format.outcome === PARTITION_COMMITTED_STATEMENT_FORMAT.UNSUPPORTED) {
    throw committedStatementOutcomeFormatError(format, partitionId);
  }
  if (format.outcome === PARTITION_COMMITTED_STATEMENT_FORMAT.ABSENT) {
    if (tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
        RaftRsDurableStore.hasDurableRecordIn(db, partitionId)) {
      throw committedStatementOutcomeFormatError(format, partitionId);
    }
    db.exec(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE);
  }
}

const UNSETTLED_RECORD = Object.freeze({
  state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED,
});

function readCommittedStatementOutcomeIn(db, entryKey) {
  const row = sqliteConnectionState(db)
    .statement(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.SELECT_BY_ENTRY_KEY)
    .get(entryKey);
  if (row === undefined) {
    return UNSETTLED_RECORD;
  }
  const capturedEffects = readCapturedRowEffectsIn(db, entryKey);
  return Object.freeze({
    state: PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED,
    outcome: row.outcome,
    logIndex: Number(row.log_index),
    term: Number(row.term),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    changes: row.changes,
    lastInsertRowid: row.last_insert_rowid,
    ...(capturedEffects === null ?
      {} :
      {
        mirrorEffectRequired: row.mirror_effect_required,
        affectedRows: capturedEffects.affectedRows,
        ...(capturedEffects.mutationKind === null ?
          {} :
          {mutationKind: capturedEffects.mutationKind}),
      }),
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

// The promise identifies the exact pending registration, even if a later
// leadership tenure registers the same entry before the old caller settles.
const pendingOwnerCommandDigests = new WeakMap();
const PROPOSE = Object.freeze({state: PARTITION_OWNER_COMMAND_PRELUDE.PROPOSE});

function pendingOwnerDigestOf(promise) {
  return pendingOwnerCommandDigests.get(promise);
}

function answered(answer) {
  return Object.freeze({state: PARTITION_OWNER_COMMAND_PRELUDE.ANSWERED, answer});
}

/**
 * Request prelude of an owner command (placement, formation) on its partition:
 * leadership, committed-command admission, exact settled replay, cutover pause,
 * and join of an identical pending command.
 * @param {Object} service - The partition.
 * @param {Object} request - Prelude request context.
 * @return {Object} Frozen {state} and, when ANSWERED, {answer}.
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
  return answered(pendingOwnerDigestOf(pending) ===
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
function trackPendingOwnerCommand(service, {commandDigest}, commitPromise) {
  pendingOwnerCommandDigests.set(commitPromise, commandDigest);
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
 * Record an entry key's terminal outcome inside the application transaction.
 * @param {Object} service - The partition (its `db`).
 * @param {Object} outcome - Outcome record fields.
 */
function recordCommittedStatementOutcome(service, {entryKey, outcome, index,
  term, error = null, result = null, ownerResultText = null, commandDigest = null,
  command = null}) {
  assertOwnerIdentity(entryKey, ownerResultText, commandDigest);
  const state = sqliteConnectionState(service.db);
  const captureEffects = Boolean(result?.typedEffects) &&
      partitionOwesDurableMirrorEffects(service);
  const insert = state.statement(PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.INSERT);
  insert.run(
    entryKey, outcome, index, term,
    error === null ? null : failureCodeOf(error),
    error === null ? null : String(error.message),
    result === null ? null : result.changes,
    result === null ? null : result.lastInsertRowid,
    ownerResultText, commandDigest, Number(captureEffects && result.changes > 0));
  if (!captureEffects) return;
  reconcileCommittedStatementMirrorEffects(
    service, state, entryKey, index, result, command,
  );
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
  let descriptorFields;
  if (carriesSplitDescriptorIntent(command)) {
    const descriptor = decodeSplitDescriptorCommand(service, command);
    if (!descriptor) return descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.BYTES);
    descriptorFields = retainedSplitDescriptorAnswer(descriptor, recorded);
    if (descriptorFields.success === false) return descriptorFields;
  } else if (isSplitDescriptorDigest(recorded.commandDigest)) {
    return descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.COLLISION);
  }
  const settledAt = {
    ...descriptorFields,
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
  const answer = answerSettledStatement(service, {recorded, command});
  afterCommit(() => service.resolveCommittedWrite(command.entryId, answer, recorded.commandDigest));
  if (answer.failureCode === SPLIT_DESCRIPTOR_ERROR.COLLISION) {
    return PARTITION_COMMITTED_COMMAND_OUTCOME.RECORDED_ONLY;
  }
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
    entryKey, outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    index, term, error: {code: lockConflict.errorCode, message: lockConflict.error},
  });
  afterCommit(() => service.resolveCommittedWrite(command.entryId, {
    success: false, error: lockConflict.error,
    failureCode: lockConflict.errorCode, errorCode: lockConflict.errorCode,
    code: lockConflict.code, sqlState: lockConflict.sqlState,
    conflict: true, retryable: true,
    ...(lockConflict.rowKey ? {rowKey: lockConflict.rowKey} : {}),
    ...(lockConflict.conflictingTransactionId ?
      {conflictingTransactionId: lockConflict.conflictingTransactionId} : {}),
    committed: true, outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
    entryId: command.entryId, ...identity,
  }));
  return PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED;
}

export {
  MIRROR_RETENTION_CUSTODY_ACTION,
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  applyMirrorRetentionCustodyCommand,
  committedStatementEntryKey, committedStatementOutcomeFormatError,
  detectCommittedStatementOutcomeFormat, isCommittedStatementKeyed,
  ownerCommandPrelude, pendingOwnerDigestOf, partitionOwesDurableMirrorEffects,
  readCommittedStatementCensusIn,
  readDurableMirrorRetentionCustodyIn,
  readSettledOwnerCommandIn, answerSettledStatement,
  createCommittedStatementOutcomeTable, isDeterministicStatementFailure,
  readCommittedStatementOutcome, reconcileCommittedStatementMirrorEffects,
  recordCommittedStatementOutcome, registerMirrorRetentionRaftHooks,
  releaseSourceMirrorRetentionCustody, replicateSourceMirrorRetentionCustody,
  resolveActiveMirrorRetentionBarrierIndex,
  settleFailedCommittedStatement, settleLockingReadRefusedCommittedStatement,
  settleRecordedCommittedStatement, statementEnvironmentFailure,
  trackPendingOwnerCommand,
};
