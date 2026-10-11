/**
 * The engine's wire to the participant transaction owner (TX1 design
 * revision 10, sections 2.2 and 4; seam items A, D, E and T/AD): what a
 * TRANSACTION request carries, and what each typed participant answer means
 * to the coordinator.
 *
 * Every request carries the transaction identity (transactionId,
 * participantId, commitMode, transactionEpoch) with the sessionId as routing
 * context only; a decision adds its binding (decision, preparedDigest,
 * decisionText, decisionDigest). A PREPARE and a decision are delivered
 * under the participant's deterministic entryId, so the delivery owner
 * re-delivers an unknown outcome as the same entry (the same bytes).
 *
 * Answers:
 * - a PREPARE is positive evidence only when it names the PREPARED state and
 *   its prepared digest; a COMMIT is done only when it names the COMMITTED
 *   outcome. `success` alone, an absent state or an UNKNOWN outcome is never
 *   taken as either.
 * - the write kernel's unknown outcome is UNKNOWN (retried under the same
 *   identity, never success and never definitive noncommitment);
 * - an answer that defers (a reservation, a decision reaching a PREPARE in
 *   flight, a removal fence) or a retryable kernel refusal is DEFER: the
 *   same request is asked again, it is never PREPARED;
 * - any other typed refusal is REFUSED: definitive, never retried (a durable
 *   PREPARE refusal and its cause, a terminal row, a doomed or refused
 *   session statement, an identity or binding refusal);
 * - a session that is not active here (lost with its leader) keeps the
 *   bounded attempt retry, then fails: the coordinator decides ROLLBACK.
 *
 * @module query/sql-query-engine-participant-wire
 */

import {PARTICIPANT_COMMIT_OUTCOME} from '../constants/index.js';
import {
  isPartitionWriteFailureCode,
  isRetryableWriteFailureCode,
  isWriteOutcomeUnknown,
} from '../partition/partition-write-kernel.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_STATE,
} from '../partition/partition-participant-transaction-constants.js';
import {
  decisionEntryIdOf,
  prepareEntryIdOf,
} from '../partition/partition-participant-transaction-bytes.js';
import {
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from './query-constants.js';
import {
  PARTICIPANT_ANSWER_DISPOSITION,
  PARTICIPANT_ANSWER_DISPOSITION_FIELD,
} from './distributed/distributed-transaction-coordinator-constants.js';
import {completePrepareEvidenceOf} from
  './distributed/distributed-transaction-prepare-evidence.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const REQUEST_IDENTITY_FIELDS = Object.freeze([
  'transactionId',
  'participantId',
  'commitMode',
  'transactionEpoch',
]);
const REQUEST_DECISION_FIELDS = Object.freeze([
  'decision',
  'preparedDigest',
  'decisionText',
  'decisionDigest',
]);
// The typed fields of a participant answer a failure carries on to the
// coordinator.
const ANSWER_FAILURE_FIELDS = Object.freeze([
  'failureCode',
  'refusalCause',
  'refusalLayer',
  'outcome',
  'state',
  'entryId',
  'transactionId',
  'participantId',
  'preparedDigest',
  'prepareIndex',
  'prepareTerm',
]);
const OPERATION_FAILURE_MESSAGE = Object.freeze({
  [QUERY_OPERATION.BEGIN]: QUERY_ERROR_MSG.BEGIN_FAILED,
  [QUERY_OPERATION.PREPARE]: QUERY_ERROR_MSG.PREPARE_FAILED,
  [QUERY_OPERATION.COMMIT]: QUERY_ERROR_MSG.COMMIT_FAILED,
  [QUERY_OPERATION.ROLLBACK]: QUERY_ERROR_MSG.ROLLBACK_FAILED,
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The TRANSACTION request one participant operation sends.
 * @param {string} sessionId - Routing context.
 * @param {string} operation - The participant operation.
 * @param {Object} options - The identity, and a decision's binding.
 * @return {Object} The request.
 */
function participantTransactionRequestOf(sessionId, operation, options = {}) {
  const request = {type: QUERY_OPERATION.TRANSACTION, operation, sessionId};
  for (const field of [...REQUEST_IDENTITY_FIELDS,
    ...REQUEST_DECISION_FIELDS]) {
    if (options[field] !== undefined) {
      request[field] = options[field];
    }
  }
  return request;
}

/**
 * The participant's deterministic entryId of the command a request proposes
 * (a PREPARE, or a bound decision); null for a request that proposes none.
 * @param {string} operation - The participant operation.
 * @param {Object} request - The request.
 * @return {string|null} The entryId.
 */
function participantEntryIdOf(operation, request) {
  if (!isNonEmptyString(request.participantId)) {
    return null;
  }
  if (operation === QUERY_OPERATION.PREPARE) {
    return prepareEntryIdOf(request.participantId);
  }
  const decides = operation === QUERY_OPERATION.COMMIT ||
    operation === QUERY_OPERATION.ROLLBACK;
  return decides && isNonEmptyString(request.decisionDigest) ?
    decisionEntryIdOf(request.participantId, request.decisionDigest) : null;
}

/**
 * Whether a delivered answer is the participant's own (a success or a typed
 * participant refusal) rather than one the delivery owner routes again (the
 * write kernel's leadership, backpressure and unknown-outcome answers).
 * @param {Object} response - The partition's answer.
 * @return {boolean}
 */
function participantAnswerSnapshotOf(response, expected = null) {
  const answer = copyStrictOwnDataRecord(response);
  if (answer === null || answer.acknowledged !== true ||
      answer.noHandler === true) {
    return null;
  }
  if (expected !== null &&
      (answer.operation !== expected.operation ||
       answer.partitionId !== expected.partitionId ||
       answer.transactionId !== expected.transactionId ||
       answer.participantId !== expected.participantId)) {
    return null;
  }
  return answer;
}

function isParticipantTransactionAnswer(response, expected = null) {
  const answer = participantAnswerSnapshotOf(response, expected);
  if (answer === null) {
    return false;
  }
  return answer.success === true ||
    (isNonEmptyString(answer.failureCode) &&
      !isPartitionWriteFailureCode(answer.failureCode));
}

function dispositionOf(answer) {
  if (isWriteOutcomeUnknown(answer)) {
    return PARTICIPANT_ANSWER_DISPOSITION.UNKNOWN;
  }
  if (answer?.deferRetry === true ||
      isRetryableWriteFailureCode(answer?.failureCode)) {
    return PARTICIPANT_ANSWER_DISPOSITION.DEFER;
  }
  if (answer?.failureCode === PARTICIPANT_TRANSACTION_FAILURE_CODE.NOT_ACTIVE ||
      !isNonEmptyString(answer?.failureCode)) {
    return null;
  }
  return PARTICIPANT_ANSWER_DISPOSITION.REFUSED;
}

/**
 * The typed failure a participant operation throws for an answer that did
 * not succeed.
 * @param {string} operation - The participant operation.
 * @param {Object} answer - The answer (or the delivery owner's failure).
 * @param {string} [disposition] - Overrides the answer's own disposition.
 * @return {Error} The failure, carrying the answer's typed fields.
 */
function participantFailureOf(operation, answer, disposition = undefined) {
  const captured = copyStrictOwnDataRecord(answer) || Object.create(null);
  const failure = new Error(captured.error ||
    OPERATION_FAILURE_MESSAGE[operation] ||
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE);
  for (const field of ANSWER_FAILURE_FIELDS) {
    if (captured[field] !== undefined && captured[field] !== null) {
      failure[field] = captured[field];
    }
  }
  if (isNonEmptyString(captured.errorCode)) {
    failure.errorCode = captured.errorCode;
  }
  failure.deferRetry = captured.deferRetry === true;
  const resolved = disposition === undefined ? dispositionOf(captured) :
    disposition;
  if (resolved !== null) {
    failure[PARTICIPANT_ANSWER_DISPOSITION_FIELD] = resolved;
  }
  return failure;
}

/**
 * The PREPARE evidence of a successful PREPARE answer: it must name the
 * PREPARED state and the prepared digest (design 2.2, seam E).
 * @param {Object} answer - The PREPARE answer.
 * @return {Object} {preparedDigest, prepareIndex, prepareTerm}.
 */
function preparedEvidenceOf(value) {
  const answer = participantAnswerSnapshotOf(value);
  const evidence = answer === null ? null : completePrepareEvidenceOf(answer);
  if (answer?.success !== true ||
      answer.state !== PARTICIPANT_TRANSACTION_STATE.PREPARED ||
      evidence === null) {
    throw participantFailureOf(QUERY_OPERATION.PREPARE,
      {...(answer || {}), error: QUERY_ERROR_MSG.PARTICIPANT_ANSWER_UNTYPED},
      PARTICIPANT_ANSWER_DISPOSITION.REFUSED);
  }
  return evidence;
}

/**
 * A COMMIT answer is done only when it names the COMMITTED outcome.
 * @param {Object} answer - The COMMIT answer.
 * @return {Object} The answer.
 */
function committedAnswerOf(value) {
  const answer = participantAnswerSnapshotOf(value);
  if (answer?.success !== true ||
      answer.outcome !== PARTICIPANT_COMMIT_OUTCOME.COMMITTED) {
    throw participantFailureOf(QUERY_OPERATION.COMMIT,
      {...(answer || {}), error: QUERY_ERROR_MSG.PARTICIPANT_ANSWER_UNTYPED},
      PARTICIPANT_ANSWER_DISPOSITION.REFUSED);
  }
  return answer;
}

/**
 * The delivery identity of one transaction-control message on a priority
 * control-plane partition: bound to the exact transaction and operation
 * (seam A), never to the session.
 * @param {Object} identity - {transactionId, partitionId, operation}.
 * @return {string|null} The delivery key, or null when incomplete.
 */
function participantDeliveryKeyOf({transactionId, partitionId, operation}) {
  const parts = [partitionId, transactionId, operation].map((part) =>
    (typeof part === 'string' ? part.trim() : ''));
  return parts.every((part) => part.length > 0) ? parts : null;
}

export {
  committedAnswerOf,
  isParticipantTransactionAnswer,
  participantAnswerSnapshotOf,
  participantDeliveryKeyOf,
  participantEntryIdOf,
  participantFailureOf,
  participantTransactionRequestOf,
  preparedEvidenceOf,
};
