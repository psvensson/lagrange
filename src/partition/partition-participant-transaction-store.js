// The durable state of a partition's participant transactions (TX1 design
// revision 10, sections 3.2, 5.1 and 5.2): the one owner of the
// `_participant_transactions` row of each transaction, of the reservation a
// PREPARED row places on the partition, of the partition's write generation
// g, and of the outcome a row answers. Every write here runs inside the
// application transaction of a committed command (the committed-entry
// application's callback, raft-rs-application-transaction-owner.js), so a
// row, g and the applied index move together or not at all; the tables are
// created with the partition, outside any command, identically on every
// replica.

import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/transactions.js';
import {
  PARTICIPANT_TRANSACTION_SQL as SQL,
  PARTICIPANT_TRANSACTION_STATE as STATE,
  PARTICIPANT_TRANSACTION_STORE_ERROR as STORE_ERROR,
} from './partition-participant-transaction-constants.js';

const ONE_ROW = 1;

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
 * @param {Object} db - The partition's connection.
 */
function createParticipantTransactionTables(db) {
  db.exec(SQL.CREATE_TABLE);
  db.exec(SQL.CREATE_STATE_INDEX);
  db.exec(SQL.CREATE_GENERATION_TABLE);
  db.prepare(SQL.INSERT_INITIAL_GENERATION).run();
}

function generationRowOf(db) {
  const row = db.prepare(SQL.SELECT_GENERATION).get();
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

/**
 * Record the generation origin at the origin command's log position and
 * start g at 0 there, inside its application transaction; only when no
 * origin is recorded (the caller asks readPartitionWriteOrigin first), and
 * exactly one row moves, or this throws (the application fails closed).
 * @param {Object} db - The partition's connection.
 * @param {{index: number, term: number}} position - The origin's position.
 */
function recordPartitionWriteOrigin(db, {index, term}) {
  if (db.prepare(SQL.RECORD_ORIGIN).run(index, term).changes !== ONE_ROW) {
    throw new Error(STORE_ERROR.ORIGIN_UPDATE_NOT_ONE_ROW);
  }
}

/**
 * Advance g by one, inside the application transaction of the command whose
 * application data it counts.
 * @param {Object} db - The partition's connection.
 */
function advancePartitionWriteGeneration(db) {
  if (db.prepare(SQL.ADVANCE_GENERATION).run().changes !== ONE_ROW) {
    throw new Error(STORE_ERROR.GENERATION_ROW_MISSING);
  }
}

/**
 * Whether a PREPARED row reserves the partition.
 * @param {Object} db - The partition's connection.
 * @return {boolean} Whether some transaction is PREPARED here.
 */
function isPartitionReserved(db) {
  return db.prepare(SQL.SELECT_RESERVATION).get(STATE.PREPARED) !== undefined;
}

/**
 * The durable row of one participant transaction, or null.
 * @param {Object} db - The partition's connection.
 * @param {{transactionId: string, participantId: string}} identity - Its key.
 * @return {Object|null} The frozen row, in the command's field names.
 */
function readParticipantTransactionRow(db, {transactionId, participantId}) {
  const row = db.prepare(SQL.SELECT_ROW).get(transactionId, participantId);
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
  db.prepare(SQL.INSERT_ROW).run({
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
  const moved = db.prepare(SQL.UPDATE_DECIDED).run({
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
    return {state: volatileState, outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN};
  }
  return {
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

export {
  advancePartitionWriteGeneration,
  createParticipantTransactionTables,
  insertParticipantTransactionRow,
  isPartitionReserved,
  participantOutcomeOf,
  readParticipantTransactionRow,
  readPartitionWriteGeneration,
  readPartitionWriteOrigin,
  recordPartitionWriteOrigin,
  updateParticipantTransactionDecided,
};
