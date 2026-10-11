/** Actual stored decision bytes: no reconstruction and no coordinator execution dependency. */
import {canonicalDecisionRecord} from
  '../../partition/partition-participant-transaction-bytes.js';

// Whether a row (or a read) holds a recorded decision: RECORDED carries the
// record; ABSENT means an available row has no decision fields. A missing
// or unreadable row is UNAVAILABLE at the authoritative read boundary.
const RECORDED_DECISION_STATE = Object.freeze({
  RECORDED: 'recorded',
  ABSENT: 'absent',
  INVALID: 'invalid',
  UNAVAILABLE: 'unavailable',
});
const ABSENT_DECISION = Object.freeze({state: RECORDED_DECISION_STATE.ABSENT});
const DECISION_ROW_FIELD = Object.freeze({
  TRANSACTION_ID: ['transaction_id', 'transactionId'],
  DECISION: ['decision', 'decision'],
  DECISION_TEXT: ['decision_text', 'decisionText'],
  DECISION_DIGEST: ['decision_digest', 'decisionDigest'],
});

function readRowField(row, [snakeKey, camelKey]) {
  if (row?.[snakeKey] !== undefined && row[snakeKey] !== null) {
    return row[snakeKey];
  }
  return row?.[camelKey] ?? null;
}

function decisionRecordOfRow(row, transactionId = null) {
  const recordedFor = readRowField(row, DECISION_ROW_FIELD.TRANSACTION_ID);
  const decision = readRowField(row, DECISION_ROW_FIELD.DECISION);
  const decisionText = readRowField(row, DECISION_ROW_FIELD.DECISION_TEXT);
  const decisionDigest = readRowField(row, DECISION_ROW_FIELD.DECISION_DIGEST);
  if (decision === null && decisionText === null && decisionDigest === null) {
    return ABSENT_DECISION;
  }
  const record = canonicalDecisionRecord({transactionId: recordedFor,
    decision, decisionText, decisionDigest});
  if (!record || (transactionId !== null && recordedFor !== transactionId)) {
    return Object.freeze({state: RECORDED_DECISION_STATE.INVALID,
      transactionId: recordedFor});
  }
  return Object.freeze({state: RECORDED_DECISION_STATE.RECORDED, ...record});
}


function isRecordedDecision(record) {
  return record?.state === RECORDED_DECISION_STATE.RECORDED;
}


export {decisionRecordOfRow, isRecordedDecision, RECORDED_DECISION_STATE};
