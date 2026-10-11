/** The coordinator ledger cannot also reserve itself as a participant: its
 * decision write must remain possible after every admitted PREPARE. The query
 * precheck and actual partition BEGIN owner consume this same predicate.
 * Settlement of an already accepted participant is never refused by it. */
import {TABLES} from '../../constants/tables.js';

const COORDINATOR_PARTICIPANT_REFUSAL_CODE = 'transaction_coordinator_participant_unsupported';
const COORDINATOR_PARTICIPANT_REFUSAL = Object.freeze({success: false,
  failureCode: COORDINATOR_PARTICIPANT_REFUSAL_CODE,
  errorCode: COORDINATOR_PARTICIPANT_REFUSAL_CODE,
  error: 'The transaction coordinator ledger cannot enlist as a transaction participant'});

function coordinatorTableParticipantRefusal(tableName) {
  return typeof tableName === 'string' && tableName.toLowerCase() === TABLES.SQL_TRANSACTIONS ?
    COORDINATOR_PARTICIPANT_REFUSAL : null;
}

export {coordinatorTableParticipantRefusal, COORDINATOR_PARTICIPANT_REFUSAL_CODE};
