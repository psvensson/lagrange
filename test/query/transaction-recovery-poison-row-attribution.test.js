/**
 * transaction-recovery-poison-row-invariant guard: poison durable
 * transaction-row state is attributed to its owning writer/replay path. When
 * replay validation rejects a durable row, the thrown
 * TRANSACTION_RECOVERY_INCOMPLETE error must name the exact failed decision
 * dimension and the offending row identity so failure classification routes
 * the fatal to the writer/replay owner instead of masking it behind generic
 * admission load.
 *
 * The current validator throws a bare message with no attribution fields;
 * these guards pin the sealed attribution contract and go red until replay
 * validation carries the dimension and row identity.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../src/constants/index.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator-constants.js';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';

const INCOMPLETE_FROZEN_ROW = Object.freeze({
  transaction_id: 'tx-poison-incomplete-frozen',
  session_id: 'session-poison-incomplete-frozen',
  status: TRANSACTION_STATUS.COMMITTING,
  transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
  commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
  frozen_participant_count: 2,
  created_at: 1,
  updated_at: 1,
});

const INCOMPLETE_FROZEN_PARTICIPANTS = Object.freeze([
  Object.freeze({
    transaction_id: INCOMPLETE_FROZEN_ROW.transaction_id,
    partition_id: 'p1',
    status: TRANSACTION_STATUS.COMMITTING,
  }),
]);

const MULTI_PARTICIPANT_ONE_PHASE_ROW = Object.freeze({
  transaction_id: 'tx-poison-multi-participant-1pc',
  session_id: 'session-poison-multi-participant-1pc',
  status: TRANSACTION_STATUS.COMMITTING,
  transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
  commit_mode: COMMIT_MODE.ONE_PHASE_COMMIT,
  frozen_participant_count: 2,
  created_at: 1,
  updated_at: 1,
});

const MULTI_PARTICIPANT_ONE_PHASE_PARTICIPANTS = Object.freeze(
  ['p1', 'p2'].map((partitionId) =>
    Object.freeze({
      transaction_id: MULTI_PARTICIPANT_ONE_PHASE_ROW.transaction_id,
      partition_id: partitionId,
      status: TRANSACTION_STATUS.COMMITTING,
    }),
  ),
);

function recoverExpectingThrow(transactions, participants) {
  const coordinator = new DistributedTransactionCoordinator();
  let thrown = null;
  try {
    coordinator.recoverFromSystemTables({transactions, participants});
  } catch (error) {
    thrown = error;
  }
  return thrown;
}

test(
  'an incomplete frozen participant set is attributed to the ' +
    'frozen_participant_count decision dimension and the offending row',
  (t) => {
    const error = recoverExpectingThrow(
      [INCOMPLETE_FROZEN_ROW],
      [...INCOMPLETE_FROZEN_PARTICIPANTS],
    );

    t.ok(error, 'replay validation rejects the poison row');
    t.equal(
      error?.message,
      QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
      'the fatal stays the canonical incomplete-recovery message',
    );
    t.equal(
      error?.errorCode,
      QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
      'the fatal carries the canonical incomplete-recovery error code',
    );
    t.equal(
      error?.decisionDimension,
      'frozen_participant_count',
      'the fatal names the exact failed decision dimension',
    );
    t.equal(
      error?.transactionId,
      INCOMPLETE_FROZEN_ROW.transaction_id,
      'the fatal identifies the offending durable transaction row',
    );
    t.equal(
      error?.sessionId,
      INCOMPLETE_FROZEN_ROW.session_id,
      'the fatal identifies the offending row session for writer attribution',
    );
    t.end();
  },
);

test(
  'a multi-participant one-phase commit row is attributed to the ' +
    'commit_mode decision dimension and the offending row',
  (t) => {
    const error = recoverExpectingThrow(
      [MULTI_PARTICIPANT_ONE_PHASE_ROW],
      [...MULTI_PARTICIPANT_ONE_PHASE_PARTICIPANTS],
    );

    t.ok(error, 'replay validation rejects the poison row');
    t.equal(
      error?.errorCode,
      QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
      'the fatal carries the canonical incomplete-recovery error code',
    );
    t.equal(
      error?.decisionDimension,
      'commit_mode',
      'the fatal names the exact failed decision dimension',
    );
    t.equal(
      error?.transactionId,
      MULTI_PARTICIPANT_ONE_PHASE_ROW.transaction_id,
      'the fatal identifies the offending durable transaction row',
    );
    t.end();
  },
);

test(
  'a valid recovered row installs without attribution fields (no false ' +
    'positive on the attribution contract)',
  (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    coordinator.recoverFromSystemTables({
      transactions: [{
        transaction_id: 'tx-valid-frozen',
        session_id: 'session-valid-frozen',
        status: TRANSACTION_STATUS.COMMITTING,
        transaction_mode: TRANSACTION_MODE.EXPLICIT,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
        frozen_participant_count: 2,
        created_at: 1,
        updated_at: 1,
      }],
      participants: ['p1', 'p2'].map((partitionId) => ({
        transaction_id: 'tx-valid-frozen',
        partition_id: partitionId,
        status: TRANSACTION_STATUS.COMMITTING,
      })),
    });

    t.equal(
      coordinator.recoveredTransactionIds.has('tx-valid-frozen'),
      true,
      'a valid row replays into the recovered set without a fatal',
    );
    t.end();
  },
);
