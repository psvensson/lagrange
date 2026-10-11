/**
 * The coordinator's decision record of one distributed transaction (TX1
 * design revision 10, sections 2.3 and 2.4; seam items C, C', E and G): the
 * one insert-once, immutable record that every participant decision is bound
 * to.
 *
 * The record names the transaction, the decision and every participant with
 * the prepared digest its PREPARE answer carried (null where none was
 * retained), ordered by participantId:
 *   decisionText = JSON.stringify({transactionId, decision, participants})
 *   decisionDigest = sha256(decisionText)
 * A participant applies a decision only when the text hashes to the digest,
 * names its transaction, the decision and exactly one entry for itself whose
 * digest is the one the decision carries (the participant's binding rule; the
 * digest algorithm and encoding are the participant owner's).
 *
 * The record is written once, before any decision fanout. A coordinator
 * whose write fails for any reason - another coordinator recorded first, or
 * the write's outcome is unknown - reads the recorded decision and follows
 * it; when it cannot read one, the decision is IN DOUBT and nothing is
 * fanned out (recovery resolves it). A decision is never inferred from a
 * cached or absent value.
 *
 * @module query/distributed/distributed-transaction-decision
 */

import {buildDecisionRecord, canonicalDecisionRecord} from
  '../../partition/partition-participant-transaction-bytes.js';
import {buildTransactionRecoveryIncompleteError, hasExactDecisionParticipants,
  TRANSACTION_RECOVERY_DIMENSION} from
  './distributed-transaction-recovery-validation.js';
import {decisionRecordOfRow, isRecordedDecision, RECORDED_DECISION_STATE} from
  './distributed-transaction-decision-record.js';
import {participantIdOf} from './distributed-transaction-identity.js';
import {
  TRANSACTION_DECISION_LOG_MSG,
  TRANSACTION_DECISION_RECORDING,
} from './distributed-transaction-coordinator-constants.js';
import {COMMIT_POINT_REACHED_FIELD} from
  './distributed-transaction-commit-point.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function compareParticipantEntries([left], [right]) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * The participants a decision names: [participantId, preparedDigest|null],
 * ordered by participantId.
 * @param {Object} tx - The transaction.
 * @return {Array<Array>} The entries.
 */
function decisionParticipantsOf(tx) {
  return Array.from(tx.participants.values())
    .map((participant) => [
      participantIdOf(tx.transactionId, participant.partitionId),
      isNonEmptyString(participant.preparedDigest) ?
        participant.preparedDigest : null,
    ])
    .sort(compareParticipantEntries);
}

/**
 * Build the decision record of a transaction from the evidence it retained.
 * @param {Object} tx - The transaction.
 * @param {string} decision - COMMIT or ROLLBACK.
 * @return {Object} {transactionId, decision, decisionText, decisionDigest}.
 */
function buildTransactionDecisionRecord(tx, decision) {
  const record = buildDecisionRecord(tx.transactionId, decision,
    decisionParticipantsOf(tx));
  if (!record) {
    throw buildTransactionRecoveryIncompleteError({
      decisionDimension: TRANSACTION_RECOVERY_DIMENSION.DECISION_RECORD, row: tx});
  }
  return record;
}

/**
 * The decision record a durable row (or a recovery decision row) carries.
 * @param {Object|null} row - A sql_transactions row, or a decision row.
 * @param {string} [transactionId] - The transaction it must name.
 * @return {Object} {state: RECORDED, transactionId, decision, decisionText,
 *   decisionDigest}, or ABSENT_DECISION.
 */

/**
 * The binding one participant's decision request carries. A recorded
 * decision carries its own text; a decision row with missing or invalid bytes is refused; projections never
 * reconstruct the record.
 * @param {Object} tx - The transaction (its recorded decision).
 * @param {string} partitionId - The participant.
 * @return {Object} {decision, preparedDigest, decisionText, decisionDigest}.
 */
function participantDecisionBindingOf(tx, partitionId) {
  const recorded = canonicalDecisionRecord({...tx.decision,
    transactionId: tx.transactionId});
  const participant = recorded?.participants.find(([id]) =>
    id === participantIdOf(tx.transactionId, partitionId));
  if (!participant) {
    throw buildTransactionRecoveryIncompleteError({
      decisionDimension: TRANSACTION_RECOVERY_DIMENSION.DECISION_RECORD, row: tx});
  }
  return {decision: recorded.decision, preparedDigest: participant[1],
    decisionText: recorded.decisionText, decisionDigest: recorded.decisionDigest};
}

async function readRecordedDecision(coordinator, transactionId) {
  if (typeof coordinator.readTransactionDecision !== 'function') {
    return {state: RECORDED_DECISION_STATE.UNAVAILABLE};
  }
  try {
    const row = await coordinator.readTransactionDecision(transactionId);
    return row ? decisionRecordOfRow(row, transactionId) :
      {state: RECORDED_DECISION_STATE.UNAVAILABLE};
  } catch (readError) {
    coordinator.logger?.warn?.(TRANSACTION_DECISION_LOG_MSG.IN_DOUBT, {
      transactionId,
      error: readError?.message ?? String(readError),
    });
    return {state: RECORDED_DECISION_STATE.UNAVAILABLE};
  }
}

/**
 * Whether a decision record (decisionRecordOfRow) is a recorded decision.
 * @param {Object} record - The record.
 * @return {boolean}
 */

/**
 * Record the transaction's decision once, before any fanout, and make the
 * recorded one the transaction's: this coordinator's when its insert-once
 * write lands, else the one recorded first, read back. A transaction that
 * already holds a recorded decision keeps it.
 * @param {Object} coordinator - The coordinator (persistTransactionDecision,
 *   readTransactionDecision, logger).
 * @param {Object} tx - The transaction.
 * @param {string} decision - The decision this coordinator would record.
 * @return {Promise<string>} A TRANSACTION_DECISION_RECORDING state.
 */
async function recordTransactionDecision(coordinator, tx, decision) {
  if (tx.decision) {
    return TRANSACTION_DECISION_RECORDING.RECORDED;
  }
  if (tx[COMMIT_POINT_REACHED_FIELD]) {
    return adoptRecordedTransactionDecision(coordinator, tx);
  }
  const record = buildTransactionDecisionRecord(tx, decision);
  try {
    await coordinator.persistTransactionDecision({...record,
      sessionId: tx.sessionId, transactionEpoch: tx.transactionEpoch,
      participantSetText: tx.participantSetText});
    tx.decision = record;
    return TRANSACTION_DECISION_RECORDING.RECORDED;
  } catch (persistError) {
    const recorded = await readTransactionDecisionForRegistry(coordinator, tx);
    tx.decisionReadState = recorded.state;
    if (isRecordedDecision(recorded)) {
      tx.decision = recorded;
      reportFollowedDecision(coordinator, tx, decision, recorded, persistError);
      return TRANSACTION_DECISION_RECORDING.RECORDED;
    }
    // The caller cannot tell whether a decision exists: whatever it is
    // answered may already be committed.
    tx[COMMIT_POINT_REACHED_FIELD] = true;
    coordinator.logger?.warn?.(TRANSACTION_DECISION_LOG_MSG.IN_DOUBT, {
      transactionId: tx.transactionId,
      attempted: decision,
      cause: persistError?.message ?? String(persistError),
    });
    return TRANSACTION_DECISION_RECORDING.IN_DOUBT;
  }
}

function reportFollowedDecision(coordinator, tx, attempted, recorded, cause) {
  coordinator.logger?.warn?.(TRANSACTION_DECISION_LOG_MSG.FOLLOWED, {
    transactionId: tx.transactionId, attempted, recorded: recorded.decision,
    cause: cause?.message ?? String(cause),
  });
}

async function readTransactionDecisionForRegistry(coordinator, tx) {
  const record = await readRecordedDecision(coordinator, tx.transactionId);
  return isRecordedDecision(record) && !hasExactDecisionParticipants(tx, record) ?
    {state: RECORDED_DECISION_STATE.INVALID} : record;
}

// Once a decision may exist, only the durable owner can resolve it.
async function adoptRecordedTransactionDecision(coordinator, tx) {
  const record = await readTransactionDecisionForRegistry(coordinator, tx);
  tx.decisionReadState = record.state;
  if (isRecordedDecision(record)) {
    tx.decision = record;
    return TRANSACTION_DECISION_RECORDING.RECORDED;
  }
  tx[COMMIT_POINT_REACHED_FIELD] = true;
  return TRANSACTION_DECISION_RECORDING.IN_DOUBT;
}

export {
  adoptRecordedTransactionDecision,
  RECORDED_DECISION_STATE,
  buildTransactionDecisionRecord,
  decisionRecordOfRow,
  isRecordedDecision,
  participantDecisionBindingOf,
  recordTransactionDecision,
};
