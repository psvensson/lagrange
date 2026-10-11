/**
 * The success-path answers of the participant transaction owner (TX1 quest
 * replicated-transaction-decision-and-apply, design revision 10, sections 2.2
 * and 5.2), for engine tests whose partitions are mocks: a BEGIN opens an
 * ACTIVE session, a PREPARE is PREPARED with a prepared digest, index and
 * term, a bound COMMIT is COMMITTED, a bound ROLLBACK is ROLLED_BACK, an
 * unbound ROLLBACK discards volatile staging, and an outcome read of a
 * transaction this double never decided is UNKNOWN. A mock that answered
 * every TRANSACTION request with a bare `{success: true}` stood for no
 * participant the coordinator accepts: a PREPARE must name its state and
 * digest, a COMMIT its outcome.
 */
import {createHash} from 'node:crypto';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/index.js';
import {PARTICIPANT_TRANSACTION_STATE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';

const PREPARE_INDEX = 2;
const PREPARE_TERM = 1;

function preparedDigestOf(participantId) {
  return createHash('sha256').update(`prepared:${participantId}`)
    .digest('hex');
}

/**
 * Answer one TRANSACTION request as the participant does on its success
 * path.
 * @param {Object} message - The request.
 * @return {Object} The acknowledged answer.
 */
function answerParticipantTransactionRequest(message) {
  const base = {
    acknowledged: true,
    success: true,
    operation: message.operation,
    transactionId: message.transactionId ?? null,
    participantId: message.participantId ?? null,
  };
  switch (message.operation) {
  case QUERY_OPERATION.PREPARE:
    return {...base, state: PARTICIPANT_TRANSACTION_STATE.PREPARED,
      outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
      preparedDigest: preparedDigestOf(message.participantId),
      prepareIndex: PREPARE_INDEX, prepareTerm: PREPARE_TERM};
  case QUERY_OPERATION.COMMIT:
    return {...base, state: PARTICIPANT_TRANSACTION_STATE.COMMITTED,
      outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED};
  case QUERY_OPERATION.ROLLBACK:
    return typeof message.decisionDigest === 'string' ?
      {...base, durable: true, state: PARTICIPANT_TRANSACTION_STATE.ROLLED_BACK,
        outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED} :
      {...base, durable: false, state: PARTICIPANT_TRANSACTION_STATE.ABSENT,
        outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN};
  case QUERY_OPERATION.TRANSACTION_OUTCOME:
    return {...base, state: PARTICIPANT_TRANSACTION_STATE.ABSENT,
      outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN};
  default:
    return {...base, state: PARTICIPANT_TRANSACTION_STATE.ACTIVE,
      outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN};
  }
}

export {answerParticipantTransactionRequest, preparedDigestOf};
