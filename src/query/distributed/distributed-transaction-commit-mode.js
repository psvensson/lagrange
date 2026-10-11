import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/index.js';

const TRANSACTION_DECISION_EVENT = Object.freeze({
  PARTICIPANT_SET_FROZEN: 'PARTICIPANT_SET_FROZEN',
  COMMIT_MODE_SELECTED: 'COMMIT_MODE_SELECTED',
});

const TRANSACTION_DECISION_ERROR = Object.freeze({
  INVALID_MODE: 'Invalid persisted transaction mode state',
  PARTICIPANTS_NOT_FROZEN:
    'Commit mode selection requires a frozen participant set',
});

/**
 * Select the coordinator-owned commit protocol from the final participant
 * set: prepare-first for every coordinator-managed transaction, a single
 * participant included (TX1 owner decision 2026-10-10, design 11.2; the
 * ONE_PHASE_COMMIT fast path is retired). DIRECT_AUTOCOMMIT statements never
 * reach the coordinator.
 *
 * @param {Object} input
 * @param {string} input.transactionMode
 * @param {string} input.participantSetState
 * @return {string}
 */
function selectTransactionCommitMode(input) {
  if (!Object.values(TRANSACTION_MODE).includes(input.transactionMode)) {
    throw new Error(TRANSACTION_DECISION_ERROR.INVALID_MODE);
  }
  if (input.participantSetState !== PARTICIPANT_SET_STATE.FROZEN) {
    throw new Error(TRANSACTION_DECISION_ERROR.PARTICIPANTS_NOT_FROZEN);
  }
  return COMMIT_MODE.TWO_PHASE_COMMIT;
}

/**
 * Build the immutable transaction decision and ordered diagnostic trace.
 *
 * @param {Object} input
 * @param {string} input.transactionMode
 * @param {number} input.participantCount
 * @param {number} input.decidedAt
 * @return {Object}
 */
function buildFrozenTransactionDecision(input) {
  const participantSetState = PARTICIPANT_SET_STATE.FROZEN;
  const freezeEvent = Object.freeze({
    sequence: 1,
    event: TRANSACTION_DECISION_EVENT.PARTICIPANT_SET_FROZEN,
    participantCount: input.participantCount,
    timestamp: input.decidedAt,
  });
  const commitMode = selectTransactionCommitMode({
    transactionMode: input.transactionMode,
    participantSetState,
  });
  const modeEvent = Object.freeze({
    sequence: 2,
    event: TRANSACTION_DECISION_EVENT.COMMIT_MODE_SELECTED,
    participantCount: input.participantCount,
    commitMode,
    timestamp: input.decidedAt,
  });
  return Object.freeze({
    participantSetState,
    commitMode,
    frozenParticipantCount: input.participantCount,
    participantSetFrozenAt: input.decidedAt,
    decisionTrace: Object.freeze([freezeEvent, modeEvent]),
  });
}

export {
  buildFrozenTransactionDecision,
};
