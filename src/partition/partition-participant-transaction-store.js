// The durable state of a partition's participant transactions (TX1 design
// revision 10, sections 3.2, 5.1 and 5.2; architecture/contracts/authority-and-recovery.md):
// - Public entries: openParticipantTransactionStore, insertParticipantTransactionRow,
//   updateParticipantTransactionDecided, readParticipantTransactionRow,
//   readPreparedParticipantRows, readCommittedParticipantRows,
//   countOrdinaryAppliedStatementsBeforeIndex, readTableFootprintMetadata,
//   advancePartitionWriteGeneration, readPartitionWriteGeneration.
// - Required collaborators: PartitionService SQLite `db` connection and
//   RaftRsDurableStore (`_raft_rs_applied_state` in the same SQLite transaction).
// - Durable authority & commit point: `_participant_transactions` and
//   `_partition_write_generation` mutated strictly inside the committed-entry
//   application transaction (raft-rs-application-transaction-owner.js).
// - Permitted post-commit work: leader proposer notification, reservation
//   release re-admission, and CDC delivery wake via `committed.afterCommit`.
// - Recovery/wake entry: durable PREPARED and COMMITTED rows are read on
//   reopen/demotion by `hydrateDurablePreparedAndCommittedState` and
//   `canAdvancePreparedRowFromDurableStore`.
// - Representative tests: test/partition/partition-participant-transaction-apply.test.js,
//   test/query/scenario-a-transaction-coordination-fast-path.test.js.

import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/transactions.js';
import {stampParticipantConnection} from './partition-participant-transaction-connection.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {RAFT_RS_RETAINED_ENTRY_KIND as ENTRY_KIND,
  RAFT_RS_RETAINED_ENTRY_PHASE as ENTRY_PHASE,
  RAFT_RS_RETAINED_HISTORY_COVERAGE as COVERAGE,
  RAFT_RS_STORE_ERROR_CODE as RAFT_ERROR} from '../raft/raft-rs-durable-store-constants.js';
import {isCanonicalRetainedGenerationOrigin} from './partition-participant-transaction-bytes.js';
import {RETAINED_STORE_ERROR, retainedStoreError, readRetainedStoreRowsIn,
  isStoredInteger, isStoredNullableText, isStoredNullableInteger} from
  './partition-retained-store-observation.js';
import {
  PARTICIPANT_ORIGIN_HISTORY_REASON as ORIGIN_REASON,
  PARTICIPANT_ORIGIN_HISTORY_STATE as ORIGIN_STATE,
  PARTICIPANT_TRANSACTION_BYTES as BYTES,
  PARTICIPANT_TRANSACTION_COMMAND as COMMAND,
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_GENERATION_ORIGIN_COLUMNS as ORIGIN_COLUMNS,
  PARTICIPANT_TRANSACTION_SQL as SQL,
  PARTICIPANT_TRANSACTION_STATE as STATE,
  PARTICIPANT_TRANSACTION_STORE_ERROR as STORE_ERROR,
} from './partition-participant-transaction-constants.js';

const ONE_ROW = 1;
const ZERO = 0;
const EMPTY_JSON_ARRAY_TEXT = '[]';
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const BINARY_COLLATION = 'BINARY';
const DOUBLE_QUOTE = '"';
const ESCAPED_DOUBLE_QUOTE = '""';
const EVENT_KIND_PARTICIPANT = 'participant';
const EVENT_KIND_STATEMENT = 'statement';
const FOOTPRINT_MEMO_KEY = Symbol('participantTableFootprintMemo');
const EMPTY_FOOTPRINT_METADATA = Object.freeze({
  pkCols: Object.freeze([]),
  allCols: Object.freeze([]),
  uniqueConstraintCols: Object.freeze([]),
  hasUnscopedSchemaConstraints: false,
  schemaVersion: ZERO,
});
// Databases known to have zero PREPARED rows track an owner-held state
// (cleared when verified empty outside an open transaction, or closed).
const PREPARED_STATE_KEY = Symbol('participantPreparedObservation');
const PREPARED_OBSERVATION = Object.freeze({
  MAYBE_PREPARED: 'maybe_prepared',
  EMPTY: 'empty',
});

function canSkipPreparedRead(db) {
  if (!db || typeof db !== 'object') {
    return false;
  }
  if (db.open === false) {
    delete db[PREPARED_STATE_KEY];
    return false;
  }
  return db[PREPARED_STATE_KEY] === PREPARED_OBSERVATION.EMPTY;
}

function recordPreparedObservation(db, hasPrepared) {
  if (!db || typeof db !== 'object' || db.inTransaction || !Object.isExtensible(db)) {
    return;
  }
  db[PREPARED_STATE_KEY] = hasPrepared ?
    PREPARED_OBSERVATION.MAYBE_PREPARED :
    PREPARED_OBSERVATION.EMPTY;
}

// What a durable state answers (design 5.2): a terminal row is the only
// authority for COMMITTED or NOT_COMMITTED; PREPARED and absence are UNKNOWN.
const OUTCOME_OF_STATE = Object.freeze({
  [STATE.PREPARED]: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  [STATE.COMMITTED]: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
  [STATE.ROLLED_BACK]: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
  [STATE.REFUSED]: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
});

/**
 * Create the participant transaction table and the write generation row
 * (1, 0) when the partition opens (DDL; idempotent over an existing image).
 * A generation table created before the origin columns existed (an earlier
 * increment-3 build) gets them here, empty, as the outcome table gets its
 * result columns: its origin is then not recorded, so BEGIN stays refused
 * until the origin command applies.
 * @param {Object} db - The partition's connection.
 */
/**
 * The participant store's open hook, run by the lifecycle owner on every
 * connection it opens: the transaction table, the generation row (its
 * origin columns added to an older table), and the connection's stamp
 * (partition-participant-transaction-connection.js).
 * @param {Object} db - The partition's newly opened connection.
 */
function openParticipantTransactionStore(db) {
  stampParticipantConnection(db);
  db.exec(SQL.CREATE_TABLE);
  db.exec(SQL.CREATE_STATE_INDEX);
  db.exec(SQL.CREATE_GENERATION_TABLE);
  db.exec(SQL.CREATE_GENERATION_HISTORY_TABLE);
  const present = new Set(db.prepare(SQL.GENERATION_TABLE_COLUMNS).all()
    .map((column) => column.name));
  for (const [column, addColumn] of Object.entries(ORIGIN_COLUMNS)) {
    if (!present.has(column)) {
      db.exec(addColumn);
    }
  }
  db.prepare(SQL.INSERT_INITIAL_GENERATION).run();
  recordPreparedObservation(
    db,
    sqliteConnectionState(db).statement(SQL.SELECT_RESERVATION).get(STATE.PREPARED) !==
      undefined,
  );
}

function generationRowOf(db) {
  const row = sqliteConnectionState(db).statement(SQL.SELECT_GENERATION).get();
  if (row === undefined) {
    throw new Error(STORE_ERROR.GENERATION_ROW_MISSING);
  }
  return row;
}

/**
 * The partition's write generation g.
 * @param {Object} db - The partition's connection.
 * @return {number} g.
 */
function readPartitionWriteGeneration(db) {
  return generationRowOf(db).generation;
}

/**
 * Where g counts from (design 0.0.13): the log position of the applied
 * generation origin command, or null while none has applied here.
 * @param {Object} db - The partition's connection.
 * @return {{originIndex: number, originTerm: number}|null} The origin.
 */
function readPartitionWriteOrigin(db) {
  const row = generationRowOf(db);
  return row.origin_index === null ? null :
    Object.freeze({originIndex: row.origin_index, originTerm: row.origin_term});
}

function validOriginRow(row) {
  if (typeof row.generation !== 'bigint' || row.generation < 0n) return false;
  if (row.origin_index === null && row.origin_term === null) return true;
  return typeof row.origin_index === 'bigint' && row.origin_index > 0n &&
    typeof row.origin_term === 'bigint' && row.origin_term > 0n;
}

function originRanges(history) {
  const origins = history.entries.filter((entry) =>
    entry.kind === ENTRY_KIND.COMMAND && entry.command?.type === COMMAND.GENERATION_ORIGIN);
  return {origins,
    appliedCommands: origins.filter(({phase}) => phase === ENTRY_PHASE.APPLIED),
    committedPending: origins.filter(({phase}) => phase === ENTRY_PHASE.COMMITTED_PENDING),
    locallyUncommitted: origins.filter(({phase}) => phase === ENTRY_PHASE.LOCAL_UNCOMMITTED),
    unclassifiedEntries: history.entries.filter((entry) =>
      entry.kind !== ENTRY_KIND.NOOP && !origins.includes(entry))};
}

function originStateOf(observation) {
  const {appliedOrigin, appliedCommands, committedPending, locallyUncommitted} = observation;
  const first = appliedCommands[0];
  const agrees = appliedOrigin === null ? appliedCommands.length === 0 :
    first?.index === appliedOrigin.originIndex && first?.term === appliedOrigin.originTerm;
  if (!agrees) {
    return {state: ORIGIN_STATE.CONTRARY, reason: ORIGIN_REASON.POSITION};
  } else if (appliedOrigin !== null) {
    return {state: ORIGIN_STATE.APPLIED};
  } else if (committedPending.length > 0) {
    return {state: ORIGIN_STATE.COMMITTED_PENDING};
  } else {
    return {state: locallyUncommitted.length > 0 ?
      ORIGIN_STATE.LOCAL_PENDING : ORIGIN_STATE.PRE_ORIGIN};
  }
}

function originHistoryOf(history, row, partitionId) {
  if (!validOriginRow(row)) {
    return deepFreeze({state: ORIGIN_STATE.CONTRARY, reason: ORIGIN_REASON.ROW, partitionId});
  }
  const {origins, ...ranges} = originRanges(history);
  const observation = {partitionId, coverage: history.coverage,
    appliedIndex: history.appliedIndex, commitIndex: history.commitIndex,
    lastIndex: history.lastIndex, generation: String(row.generation),
    appliedOrigin: row.origin_index === null ? null :
      {originIndex: String(row.origin_index), originTerm: String(row.origin_term)}, ...ranges};
  if (origins.some(({command}) => !isCanonicalRetainedGenerationOrigin(command, partitionId))) {
    return deepFreeze({...observation, state: ORIGIN_STATE.CONTRARY,
      reason: ORIGIN_REASON.COMMAND});
  }
  if (history.coverage !== COVERAGE.COMPLETE) {
    return deepFreeze({...observation, state: ORIGIN_STATE.UNAVAILABLE,
      reason: ORIGIN_REASON.SNAPSHOT});
  }
  return deepFreeze({...observation, ...originStateOf(observation)});
}

/**
 * Observe ENABLE's retained ranges and applied origin in one read snapshot.
 * No open hook, connection stamp, enforcement DDL, proposal, apply or repair.
 * Other commands remain explicitly unclassified, even beside a valid origin.
 * Positions use exact decimal strings independently of the runtime Number API.
 * @param {Object} db Existing connection, outside any caller transaction.
 * @param {string} partitionId Exact native group/application partition.
 * @return {Object} Frozen named observation, never opening/admission authority.
 */
function readPartitionWriteOriginHistory(db, partitionId) {
  if (db.inTransaction) {
    return Object.freeze({state: ORIGIN_STATE.UNAVAILABLE, reason: ORIGIN_REASON.TRANSACTION});
  }
  try {
    return db.transaction(() => {
      const history = RaftRsDurableStore.readRetainedHistoryIn(db, partitionId);
      return readPartitionWriteOriginIn(db, partitionId, history);
    })();
  } catch (cause) {
    return Object.freeze({state: cause.code === RAFT_ERROR.RETAINED_HISTORY_INVALID ||
      cause.code === RETAINED_STORE_ERROR.SCHEMA_CONTRARY ||
      cause.code === RETAINED_STORE_ERROR.ROW_CONTRARY ?
      ORIGIN_STATE.CONTRARY : ORIGIN_STATE.UNAVAILABLE, reason: ORIGIN_REASON.OBSERVATION, cause});
  }
}

// Compose with the native and other application owners in the caller's single
// read snapshot. No connection stamp or initialization is permitted here.
function readPartitionWriteOriginIn(db, partitionId, history) {
  if (!db.inTransaction) throw new Error(ORIGIN_REASON.TRANSACTION);
  const rows = readRetainedStoreRowsIn(db, {table: SQL.GENERATION_TABLE,
    select: SQL.SELECT_ALL_GENERATION, create: SQL.CREATE_GENERATION_TABLE});
  const row = rows[0];
  if (row === undefined) throw new Error(STORE_ERROR.GENERATION_ROW_MISSING);
  if (rows.length !== 1 || row.singleton !== 1n) {
    throw retainedStoreError(RETAINED_STORE_ERROR.ROW_CONTRARY, SQL.GENERATION_TABLE);
  }
  return originHistoryOf(history, row, partitionId);
}

function readParticipantTransactionCensusIn(db) {
  if (!db.inTransaction) throw new Error(ORIGIN_REASON.TRANSACTION);
  const rows = readRetainedStoreRowsIn(db, {table: SQL.TABLE,
    select: SQL.SELECT_ALL_PARTICIPANTS, create: SQL.CREATE_TABLE,
    indexes: [SQL.CREATE_STATE_INDEX]});
  for (const row of rows) {
    if (!validParticipantCensusRow(row)) {
      throw retainedStoreError(RETAINED_STORE_ERROR.ROW_CONTRARY, SQL.TABLE);
    }
  }
  return deepFreeze(rows);
}

function validParticipantCensusRow(row) {
  return [row.transaction_id, row.participant_id, row.commit_mode, row.state]
    .every((value) => typeof value === 'string' && value.length > 0) &&
    isStoredInteger(row.transaction_epoch, 0n) &&
    [row.session_id, row.operations_text, row.validation_text, row.prepared_digest,
      row.prepare_entry_id, row.decision, row.decision_digest, row.decision_entry_id,
      row.refusal_cause, row.refusal_detail].every(isStoredNullableText) &&
    [row.prepare_index, row.prepare_term, row.decision_index, row.decision_term]
      .every((value) => isStoredNullableInteger(value, 1n));
}

/**
 * Record the generation origin at the origin command's log position and
 * start g at 0 there, inside its application transaction; only when no
 * origin is recorded (the caller asks readPartitionWriteOrigin first), and
 * exactly one row moves, or this throws (the application fails closed).
 * @param {Object} db - The partition's connection.
 * @param {{index: number, term: number}} position - The origin's position.
 */
function recordPartitionWriteOrigin(db, {index, term}) {
  if (sqliteConnectionState(db).statement(SQL.RECORD_ORIGIN).run(index, term)
    .changes !== ONE_ROW) {
    throw new Error(STORE_ERROR.ORIGIN_UPDATE_NOT_ONE_ROW);
  }
  sqliteConnectionState(db).statement(SQL.DELETE_ALL_GENERATION_HISTORY).run();
}

function recordPartitionWriteGenerationFootprint(db, generation, footprint = null) {
  const scoped = Boolean(
    footprint &&
    footprint.scoped === true &&
    footprint.hasUnscopedWrite !== true,
  );
  const keys = scoped && footprint.rowKeys ? [...footprint.rowKeys] : [];
  const isScopedValid = scoped && keys.length > ZERO;
  sqliteConnectionState(db).statement(SQL.INSERT_GENERATION_HISTORY).run(
    generation,
    isScopedValid ? ONE_ROW : ZERO,
    isScopedValid ? JSON.stringify(keys) : EMPTY_JSON_ARRAY_TEXT,
  );
}

function readPartitionWriteGenerationHistoryRange(db, fromGen, toGen) {
  if (!db || db.open === false || toGen <= fromGen) {
    return [];
  }
  return sqliteConnectionState(db)
    .statement(SQL.SELECT_GENERATION_HISTORY_RANGE)
    .all(fromGen, toGen);
}

/**
 * Advance g by one, inside the application transaction of the command whose
 * application data it counts.
 * @param {Object} db - The partition's connection.
 */
function advancePartitionWriteGeneration(db) {
  if (sqliteConnectionState(db).statement(SQL.ADVANCE_GENERATION).run()
    .changes !== ONE_ROW) {
    throw new Error(STORE_ERROR.GENERATION_ROW_MISSING);
  }
  recordPartitionWriteGenerationFootprint(db, readPartitionWriteGeneration(db), null);
}

/**
 * Whether a PREPARED row reserves the partition.
 * @param {Object} db - The partition's connection.
 * @return {boolean} Whether some transaction is PREPARED here.
 */
function isPartitionReserved(db) {
  if (canSkipPreparedRead(db)) {
    return false;
  }
  const reserved = sqliteConnectionState(db).statement(SQL.SELECT_RESERVATION)
    .get(STATE.PREPARED) !== undefined;
  recordPreparedObservation(db, reserved);
  return reserved;
}

/**
 * Whether a PREPARED row carries this routing sessionId (the current routing
 * collision predicate refuses a sessionId-only request naming it).
 * @param {Object} db - The partition's connection.
 * @param {string} sessionId - The routing sessionId.
 * @return {boolean} Whether a PREPARED row names it.
 */
function isParticipantSessionPrepared(db, sessionId) {
  if (canSkipPreparedRead(db)) {
    return false;
  }
  return sqliteConnectionState(db).statement(SQL.SELECT_SESSION_PREPARED)
    .get(sessionId, STATE.PREPARED) !== undefined;
}

/**
 * The participants PREPARED here (the hold sweep reports them).
 * @param {Object} db - The partition's connection.
 * @return {Array<string>} Their participantIds.
 */
function readPreparedParticipantIds(db) {
  if (canSkipPreparedRead(db)) {
    return [];
  }
  const rows = sqliteConnectionState(db).statement(SQL.SELECT_PREPARED_PARTICIPANTS)
    .all(STATE.PREPARED);
  recordPreparedObservation(db, rows.length > 0);
  return rows.map((row) => row.participantId);
}

/**
 * All PREPARED rows with their operationsText, validationText and prepareIndex.
 * @param {Object} db - The partition's connection.
 * @return {Array<Object>} Durable PREPARED rows.
 */
function readPreparedParticipantRows(db) {
  if (canSkipPreparedRead(db)) {
    return [];
  }
  const rows = sqliteConnectionState(db).statement(SQL.SELECT_PREPARED_ROWS)
    .all(STATE.PREPARED);
  recordPreparedObservation(db, rows.length > 0);
  return rows;
}

/**
 * All COMMITTED rows ordered by decision_index for durable generation recovery.
 * @param {Object} db - The partition's connection.
 * @return {Array<Object>} Durable COMMITTED rows.
 */
function readCommittedParticipantRows(db) {
  if (!db || db.open === false) {
    return [];
  }
  return sqliteConnectionState(db).statement(SQL.SELECT_COMMITTED_ROWS)
    .all(STATE.COMMITTED);
}

/**
 * The durable row of one participant transaction, or null.
 * @param {Object} db - The partition's connection.
 * @param {{transactionId: string, participantId: string}} identity - Its key.
 * @return {Object|null} The frozen row, in the command's field names.
 */
function readParticipantTransactionRow(db, {transactionId, participantId}) {
  const row = sqliteConnectionState(db).statement(SQL.SELECT_ROW).get(transactionId, participantId);
  if (row === undefined) {
    return null;
  }
  return Object.freeze({
    transactionId: row.transaction_id,
    participantId: row.participant_id,
    sessionId: row.session_id,
    commitMode: row.commit_mode,
    transactionEpoch: row.transaction_epoch,
    state: row.state,
    operationsText: row.operations_text,
    validationText: row.validation_text,
    preparedDigest: row.prepared_digest,
    prepareEntryId: row.prepare_entry_id,
    prepareIndex: row.prepare_index,
    prepareTerm: row.prepare_term,
    decision: row.decision,
    decisionDigest: row.decision_digest,
    decisionEntryId: row.decision_entry_id,
    decisionIndex: row.decision_index,
    decisionTerm: row.decision_term,
    refusalCause: row.refusal_cause,
    refusalDetail: row.refusal_detail,
  });
}

function textOrNull(value) {
  return typeof value === 'string' ? value : null;
}

/**
 * Insert a PREPARED, REFUSED or TOMBSTONE (ROLLED_BACK, never prepared) row.
 * Text fields the command did not carry as text are stored as NULL.
 * @param {Object} db - The partition's connection.
 * @param {Object} row - The row, in the command's field names.
 */
function insertParticipantTransactionRow(db, row) {
  if (row.state === STATE.PREPARED && db && typeof db === 'object' &&
      Object.isExtensible(db)) {
    db[PREPARED_STATE_KEY] = PREPARED_OBSERVATION.MAYBE_PREPARED;
  }
  sqliteConnectionState(db).statement(SQL.INSERT_ROW).run({
    transactionId: row.transactionId,
    participantId: row.participantId,
    sessionId: textOrNull(row.sessionId),
    commitMode: row.commitMode,
    transactionEpoch: row.transactionEpoch,
    state: row.state,
    operationsText: textOrNull(row.operationsText),
    validationText: textOrNull(row.validationText),
    preparedDigest: textOrNull(row.preparedDigest),
    prepareEntryId: textOrNull(row.prepareEntryId),
    prepareIndex: row.prepareIndex ?? null,
    prepareTerm: row.prepareTerm ?? null,
    decision: textOrNull(row.decision),
    decisionDigest: textOrNull(row.decisionDigest),
    decisionEntryId: textOrNull(row.decisionEntryId),
    decisionIndex: row.decisionIndex ?? null,
    decisionTerm: row.decisionTerm ?? null,
    refusalCause: textOrNull(row.refusalCause),
    refusalDetail: textOrNull(row.refusalDetail),
  });
}

/**
 * Move a PREPARED row to its decided state (COMMITTED, ROLLED_BACK, or
 * REFUSED on an atomicity alarm); exactly one row moves, or this throws (the
 * application fails closed).
 * @param {Object} db - The partition's connection.
 * @param {Object} decided - {transactionId, participantId, state, decision,
 *   decisionDigest, decisionEntryId, decisionIndex, decisionTerm,
 *   refusalCause, refusalDetail}.
 */
function updateParticipantTransactionDecided(db, decided) {
  const moved = sqliteConnectionState(db).statement(SQL.UPDATE_DECIDED).run({
    transactionId: decided.transactionId,
    participantId: decided.participantId,
    state: decided.state,
    decision: decided.decision,
    decisionDigest: decided.decisionDigest,
    decisionEntryId: decided.decisionEntryId,
    decisionIndex: decided.decisionIndex,
    decisionTerm: decided.decisionTerm,
    refusalCause: decided.refusalCause ?? null,
    refusalDetail: decided.refusalDetail ?? null,
    fromState: STATE.PREPARED,
  });
  if (moved.changes !== ONE_ROW) {
    throw new Error(STORE_ERROR.DECIDED_UPDATE_NOT_ONE_ROW);
  }
}

/**
 * The outcome a durable row answers (design 5.2), any replica alike; with no
 * row the outcome is UNKNOWN, never NOT_COMMITTED, whatever volatile state
 * (ABSENT, ACTIVE, PREPARING) the caller names.
 * @param {Object|null} row - A row of readParticipantTransactionRow.
 * @param {string} [volatileState] - The state without a row.
 * @return {Object} {state, outcome, preparedDigest, prepareIndex,
 *   prepareTerm, decisionIndex, decisionTerm, refusalCause}.
 */
function participantOutcomeOf(row, volatileState = STATE.ABSENT) {
  if (row === null) {
    return {durable: false, state: volatileState,
      outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN};
  }
  return {
    durable: true,
    state: row.state,
    outcome: OUTCOME_OF_STATE[row.state] ?? PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
    preparedDigest: row.preparedDigest,
    prepareIndex: row.prepareIndex,
    prepareTerm: row.prepareTerm,
    decisionIndex: row.decisionIndex,
    decisionTerm: row.decisionTerm,
    refusalCause: row.refusalCause,
  };
}

function countOrdinaryAppliedStatementsBeforeIndex(db, originIndex, prepareIndex) {
  if (!db || db.open !== true) return ZERO;
  try {
    const row = sqliteConnectionState(db)
      .statement(SQL.SELECT_ORDINARY_APPLIED_COUNT_BETWEEN)
      .get(originIndex, prepareIndex);
    return Number(row?.count) || ZERO;
  } catch {
    return ZERO;
  }
}

function readOrdinaryAppliedStatementIndicesAfter(db, originIndex) {
  return sqliteConnectionState(db)
    .statement(SQL.SELECT_ORDINARY_APPLIED_INDICES_AFTER)
    .all(originIndex)
    .map((row) => Number(row.logIndex))
    .filter((idx) => Number.isFinite(idx));
}

function hasNonEmptyOperationsText(operationsText) {
  if (typeof operationsText !== 'string') return false;
  const trimmed = operationsText.trim();
  return trimmed.length > ZERO && trimmed !== EMPTY_JSON_ARRAY_TEXT;
}

function readDurablePrepareGeneration(db, prepareIndex) {
  if (!db || db.open !== true || typeof prepareIndex !== 'number') return ZERO;
  const origin = readPartitionWriteOrigin(db);
  if (origin === null) return ZERO;
  const ordinaryCount = countOrdinaryAppliedStatementsBeforeIndex(
    db,
    origin.originIndex,
    prepareIndex,
  );
  const committedCount = readCommittedParticipantRows(db).filter((row) =>
    typeof row.decisionIndex === 'number' &&
    row.decisionIndex > origin.originIndex &&
    row.decisionIndex < prepareIndex &&
    hasNonEmptyOperationsText(row.operationsText)).length;
  return ordinaryCount + committedCount;
}

function buildReconstructedGenerationRow(generation, event, extractFootprint) {
  if (event?.kind !== EVENT_KIND_PARTICIPANT) {
    return Object.freeze({generation, scoped: ZERO, row_keys_text: EMPTY_JSON_ARRAY_TEXT});
  }
  const fp = extractFootprint(event.operationsText);
  const keys = fp && fp.scoped === true && fp.hasUnscopedWrite !== true && fp.rowKeys ?
    [...fp.rowKeys] : [];
  return Object.freeze({
    generation,
    scoped: keys.length > ZERO ? ONE_ROW : ZERO,
    row_keys_text: keys.length > ZERO ? JSON.stringify(keys) : EMPTY_JSON_ARRAY_TEXT,
  });
}

function collectOrderedGenerationEventsAfterOrigin(db, originIndex) {
  const events = [];
  for (const row of readCommittedParticipantRows(db)) {
    if (typeof row.decisionIndex === 'number' && row.decisionIndex > originIndex &&
        hasNonEmptyOperationsText(row.operationsText)) {
      events.push({kind: EVENT_KIND_PARTICIPANT, logIndex: row.decisionIndex,
        operationsText: row.operationsText});
    }
  }
  for (const logIndex of readOrdinaryAppliedStatementIndicesAfter(db, originIndex)) {
    events.push({kind: EVENT_KIND_STATEMENT, logIndex, operationsText: null});
  }
  events.sort((a, b) => a.logIndex - b.logIndex);
  return events;
}

function readOrReconstructGenerationHistoryRange(db, fromGen, toGen, extractFootprint) {
  const stored = readPartitionWriteGenerationHistoryRange(db, fromGen, toGen);
  if (toGen <= fromGen || stored.length === toGen - fromGen) return stored;
  const origin = readPartitionWriteOrigin(db);
  const currentGen = readPartitionWriteGeneration(db);
  if (origin === null || fromGen < ZERO || toGen > currentGen) return stored;
  const events = collectOrderedGenerationEventsAfterOrigin(db, origin.originIndex);
  if (events.length !== currentGen) return stored;
  const byGen = new Map(stored.map((row) => [Number(row.generation), row]));
  const result = [];
  for (let gen = fromGen + ONE_ROW; gen <= toGen; gen += ONE_ROW) {
    result.push(byGen.get(gen) ??
      buildReconstructedGenerationRow(gen, events[gen - ONE_ROW], extractFootprint));
  }
  return result;
}

function isSameColumnList(left, right) {
  return left.length === right.length && left.every((col, idx) => col === right[idx]);
}

function isBinaryKeyColumn(col) {
  return Number(col?.cid) >= ZERO &&
    Boolean(col?.name) &&
    String(col?.coll || BINARY_COLLATION).toUpperCase() === BINARY_COLLATION;
}

function readUniqueIndexColumns(db, indexName) {
  const escaped = String(indexName).replaceAll(DOUBLE_QUOTE, ESCAPED_DOUBLE_QUOTE);
  const xinfo = db.pragma(`index_xinfo("${escaped}")`);
  if (!Array.isArray(xinfo)) return null;
  const keyCols = xinfo
    .filter((col) => Number(col?.key) === ONE_ROW)
    .sort((a, b) => Number(a.seqno) - Number(b.seqno));
  if (keyCols.length === ZERO || !keyCols.every(isBinaryKeyColumn)) {
    return null;
  }
  return Object.freeze(keyCols.map((col) => String(col.name).toLowerCase()));
}

function inspectUniqueConstraints(db, tableName, pkCols) {
  const indexList = db.pragma(`index_list(${tableName})`);
  if (!Array.isArray(indexList)) {
    return {uniqueConstraintCols: Object.freeze([]), hasUnscopedSchemaConstraints: false};
  }
  const uniqueConstraintCols = [];
  for (const idx of indexList) {
    if (Number(idx?.unique) !== ONE_ROW) continue;
    if (Number(idx?.partial) === ONE_ROW) {
      return {uniqueConstraintCols: Object.freeze([]), hasUnscopedSchemaConstraints: true};
    }
    const cols = readUniqueIndexColumns(db, idx.name);
    if (cols === null) {
      return {uniqueConstraintCols: Object.freeze([]), hasUnscopedSchemaConstraints: true};
    }
    if (!isSameColumnList(cols, pkCols)) {
      uniqueConstraintCols.push(cols);
    }
  }
  return {
    uniqueConstraintCols: Object.freeze(uniqueConstraintCols),
    hasUnscopedSchemaConstraints: false,
  };
}

function computeTableFootprintMetadata(db, tableName) {
  try {
    const info = db.pragma(`table_info(${tableName})`);
    if (!Array.isArray(info) || info.length === ZERO) return EMPTY_FOOTPRINT_METADATA;
    const allCols = Object.freeze(info.map((col) => String(col.name).toLowerCase()));
    const pkCols = Object.freeze(
      info.filter((col) => Number(col.pk) > ZERO)
        .sort((a, b) => Number(a.pk) - Number(b.pk))
        .map((col) => String(col.name).toLowerCase()),
    );
    const {uniqueConstraintCols, hasUnscopedSchemaConstraints} =
      inspectUniqueConstraints(db, tableName, pkCols);
    return Object.freeze({
      pkCols,
      allCols,
      uniqueConstraintCols,
      hasUnscopedSchemaConstraints,
    });
  } catch {
    return EMPTY_FOOTPRINT_METADATA;
  }
}

function readTableFootprintMetadata(db, tableName) {
  if (!db || db.open !== true || !tableName) {
    return EMPTY_FOOTPRINT_METADATA;
  }
  let schemaVersion = ZERO;
  try {
    schemaVersion = Number(db.pragma(PRAGMA_SCHEMA_VERSION, {simple: true})) || ZERO;
  } catch {
    schemaVersion = ZERO;
  }
  let byTable = db[FOOTPRINT_MEMO_KEY];
  if (!byTable) {
    byTable = new Map();
    db[FOOTPRINT_MEMO_KEY] = byTable;
  }
  const memoized = byTable.get(tableName);
  if (memoized && memoized.schemaVersion === schemaVersion) {
    return memoized.meta;
  }
  const meta = Object.freeze({
    ...computeTableFootprintMetadata(db, tableName),
    schemaVersion,
  });
  byTable.set(tableName, {schemaVersion, meta});
  return meta;
}

function decisionRankOf(action) {
  return action.decision === DECISION.ROLLBACK ? -ONE_ROW : ONE_ROW;
}

function buildContradictionAction(participantId, lookupCoordinatorRecord) {
  const txId = String(participantId).split(BYTES.IDENTITY_SEPARATOR)[ZERO];
  const rec = lookupCoordinatorRecord(txId);
  const isCommitted = rec?.decision === DECISION.COMMIT || rec?.status === STATE.COMMITTED;
  return Object.freeze({
    participantId,
    transactionId: txId,
    decision: isCommitted ? DECISION.COMMIT : DECISION.ROLLBACK,
  });
}

function isCommittedConflictPair(actionsById, pair) {
  return actionsById.get(pair.leftParticipantId)?.decision === DECISION.COMMIT &&
    actionsById.get(pair.rightParticipantId)?.decision === DECISION.COMMIT;
}

function resolveRetainedPreparedContradictionDisposition(inspection, lookupCoordinatorRecord) {
  const ids = inspection?.contradictoryParticipantIds ?? [];
  const actions = ids.map((id) => buildContradictionAction(id, lookupCoordinatorRecord));
  const actionsById = new Map(actions.map((a) => [a.participantId, a]));
  const pairs = inspection?.contradictions ?? [];
  const unresolvable = pairs.some((pair) => isCommittedConflictPair(actionsById, pair));
  actions.sort((a, b) => decisionRankOf(a) - decisionRankOf(b));
  return Object.freeze({
    resolvable: !unresolvable,
    orderedDecisions: Object.freeze(actions),
  });
}

export {
  advancePartitionWriteGeneration,
  insertParticipantTransactionRow,
  isParticipantSessionPrepared,
  isPartitionReserved,
  openParticipantTransactionStore,
  participantOutcomeOf,
  readCommittedParticipantRows,
  readDurablePrepareGeneration,
  readOrReconstructGenerationHistoryRange,
  readOrdinaryAppliedStatementIndicesAfter,
  readParticipantTransactionRow,
  readPreparedParticipantIds,
  readPreparedParticipantRows,
  readPartitionWriteGeneration,
  readPartitionWriteGenerationHistoryRange,
  readPartitionWriteOrigin,
  readPartitionWriteOriginHistory,
  readPartitionWriteOriginIn,
  readParticipantTransactionCensusIn,
  readTableFootprintMetadata,
  recordPartitionWriteGenerationFootprint,
  recordPartitionWriteOrigin,
  resolveRetainedPreparedContradictionDisposition,
  updateParticipantTransactionDecided,
};
