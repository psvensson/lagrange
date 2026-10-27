import {QUERY_ERROR_MSG} from '../query-constants.js';

const TRANSACTION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  COMMITTING: 'COMMITTING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
});

const PARTICIPANT_STATUS = TRANSACTION_STATUS;

const WRITE_OPERATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
});

const TERMINAL_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.COMMITTED,
  TRANSACTION_STATUS.ROLLED_BACK,
]));

const RECOVERY_COMMIT_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.PREPARED,
  TRANSACTION_STATUS.COMMITTING,
]));

const PARTICIPANT_RETRY_DEFAULT = Object.freeze({
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 10,
  MAX_DELAY_MS: 250,
});

// The owner key of every obligation recovery discovers from durable rows:
// the recovery owner holds it by transaction ID, never in the session map.
// Its re-drives still run on its row's session request FIFO (accepted R2
// design), which orders work and grants no session any state.
const TRANSACTION_RECOVERY_OWNER_KEY = 'transaction-recovery';

const PARTICIPANT_RETRY_LOG_MSG = 'Distributed transaction participant retry';
const RECOVERY_SWEEP_LOG_MSG = 'Distributed transaction recovery sweep failed';
const RECOVERY_SWEEP_DEFAULT_INTERVAL_MS = 1000;
const RECOVERY_SWEEP_DEFER_BASE_MS = 1000;
const RECOVERY_SWEEP_DEFER_MAX_MS = 30000;

const TIMEOUT_ERROR_MESSAGES = new Set([
  QUERY_ERROR_MSG.QUERY_TIMEOUT,
  QUERY_ERROR_MSG.QUERY_TIMED_OUT,
]);

const IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES = new Set([
  QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
]);

// How the coordinator treats a participant request that did not succeed
// (TX1 design revision 10, sections 4 and 7; seam items C, D, T): the
// participant's wire owner names one of these on what it throws, and the
// coordinator's stage retry decides from it alone.
// - DEFER: refused before anything was settled and to be asked again with
//   the same request (a reservation, a PREPARE in flight, a removal fence);
//   retried within the transaction budget, never taken as success.
// - UNKNOWN: handed to consensus and may still commit (the write kernel's
//   unknown outcome); retried under the same identity, never success and
//   never definitive noncommitment.
// - REFUSED: a definitive answer (a durable refusal, a terminal row, a
//   doomed session, an identity or binding refusal); never retried.
// A failure that names none of them (transport, routing) keeps the bounded
// attempt retry.
const PARTICIPANT_ANSWER_DISPOSITION = Object.freeze({
  DEFER: 'defer',
  UNKNOWN: 'unknown',
  REFUSED: 'refused',
});
const PARTICIPANT_ANSWER_DISPOSITION_FIELD = 'participantDisposition';

// The coordinator mints a transaction identity at most this many times for
// one BEGIN: only a confirmed primary-key collision of its insert-once row
// re-mints (design 2.1, seam B/S).
const TRANSACTION_ID_MINT_ATTEMPTS = 3;
// The storage class of that collision: the insert-once row's primary key
// (`sql_transactions.transaction_id`) already holds the minted identity.
const TRANSACTION_ID_COLLISION_CODE = 'SQLITE_CONSTRAINT_PRIMARYKEY';

// What recording a decision ended with (seam C, G): RECORDED when this
// coordinator's insert-once decision, or the decision another coordinator
// recorded first, is now the transaction's; IN_DOUBT when neither could be
// established (the write's outcome is unknown and the recorded decision
// could not be read), so nothing may be fanned out yet.
const TRANSACTION_DECISION_RECORDING = Object.freeze({
  RECORDED: 'recorded',
  IN_DOUBT: 'in_doubt',
});
const TRANSACTION_DECISION_LOG_MSG = Object.freeze({
  FOLLOWED: 'Distributed transaction followed the decision recorded first',
  IN_DOUBT: 'Distributed transaction decision is in doubt; no fanout until ' +
    'the recorded decision is read',
  COMMIT_REFUSED_BY_PARTICIPANT: 'Distributed transaction participant ' +
    'refused a recorded COMMIT decision (atomicity alarm)',
});

export {
  IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES,
  PARTICIPANT_ANSWER_DISPOSITION,
  PARTICIPANT_ANSWER_DISPOSITION_FIELD,
  PARTICIPANT_RETRY_DEFAULT,
  PARTICIPANT_RETRY_LOG_MSG,
  PARTICIPANT_STATUS,
  RECOVERY_COMMIT_TRANSACTION_STATUS,
  RECOVERY_SWEEP_DEFAULT_INTERVAL_MS,
  RECOVERY_SWEEP_DEFER_BASE_MS,
  RECOVERY_SWEEP_DEFER_MAX_MS,
  RECOVERY_SWEEP_LOG_MSG,
  TERMINAL_TRANSACTION_STATUS,
  TIMEOUT_ERROR_MESSAGES,
  TRANSACTION_DECISION_LOG_MSG,
  TRANSACTION_DECISION_RECORDING,
  TRANSACTION_ID_COLLISION_CODE,
  TRANSACTION_ID_MINT_ATTEMPTS,
  TRANSACTION_RECOVERY_OWNER_KEY,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
};
