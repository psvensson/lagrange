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
  transaction_id: 'a'.repeat(32),
  session_id: 'session-poison-incomplete-frozen',
  status: TRANSACTION_STATUS.COMMITTING,
  transaction_epoch: 1,
  timeout_deadline: 100,
  transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
  participant_set_text: JSON.stringify([[`${'a'.repeat(32)}:p1`, 'p1']]),
  commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
  frozen_participant_count: 2,
  created_at: 1,
  updated_at: 1,
});

const INCOMPLETE_FROZEN_PARTICIPANTS = Object.freeze([
  Object.freeze({
    participant_id: `${'a'.repeat(32)}:p1`,
    transaction_id: INCOMPLETE_FROZEN_ROW.transaction_id,
    partition_id: 'p1',
    status: TRANSACTION_STATUS.COMMITTING,
  }),
]);

// The retired ONE_PHASE_COMMIT mode (TX1 prepare-first, design 9.2
// derivation 4): a legacy row naming it is a poison row for recovery.
const RETIRED_ONE_PHASE_COMMIT_MODE = 'ONE_PHASE_COMMIT';

const MULTI_PARTICIPANT_ONE_PHASE_ROW = Object.freeze({
  transaction_id: 'b'.repeat(32),
  session_id: 'session-poison-multi-participant-1pc',
  status: TRANSACTION_STATUS.COMMITTING,
  transaction_epoch: 1,
  timeout_deadline: 100,
  transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
  participant_set_text: JSON.stringify([
    [`${'b'.repeat(32)}:p1`, 'p1'],
    [`${'b'.repeat(32)}:p2`, 'p2'],
  ]),
  commit_mode: RETIRED_ONE_PHASE_COMMIT_MODE,
  frozen_participant_count: 2,
  created_at: 1,
  updated_at: 1,
});

const MULTI_PARTICIPANT_ONE_PHASE_PARTICIPANTS = Object.freeze(
  ['p1', 'p2'].map((partitionId) =>
    Object.freeze({
      participant_id: `${'b'.repeat(32)}:${partitionId}`,
      transaction_id: MULTI_PARTICIPANT_ONE_PHASE_ROW.transaction_id,
      partition_id: partitionId,
      status: TRANSACTION_STATUS.COMMITTING,
    }),
  ),
);

async function redriveAuthoritativeExpectingRefusal(transactions, participants) {
  const mutations = [];
  const coordinator = new DistributedTransactionCoordinator({
    now: () => 200,
    participantRetryMaxRetries: 0,
    persistTransaction: async (row) => mutations.push(`tx:${row.status}`),
    persistTransactionDecision: async (record) => mutations.push(`decision:${record.decision}`),
    persistTransactionParticipantSet: async () => mutations.push('set'),
    commitParticipant: async () => mutations.push('COMMIT'),
    rollbackParticipant: async () => mutations.push('ROLLBACK'),
  });
  coordinator.readTransactionRecoveryState = async () => ({
    state: 'available',
    transaction: transactions[0],
    participants,
  });
  coordinator.recoverFromSystemTables({transactions, participants});
  const replay = await coordinator.resumeRecoveredTransactions();
  return {coordinator, replay, mutations};
}

test(
  'an incomplete frozen participant set is attributed to the ' +
    'frozen_participant_count decision dimension through authoritative recovery',
  async (t) => {
    const {coordinator, replay, mutations} =
      await redriveAuthoritativeExpectingRefusal(
        [INCOMPLETE_FROZEN_ROW],
        [...INCOMPLETE_FROZEN_PARTICIPANTS],
      );

    t.equal(replay.resumed, 0, 'authoritative recovery rejects the poison row');
    t.equal(replay.failed, 1);
    t.equal(replay.results[0].decisionReadState, 'invalid');
    t.equal(
      replay.results[0].decisionDimension,
      'frozen_participant_count',
      'authoritative recovery names the exact failed decision dimension',
    );
    t.equal(
      replay.results[0].transactionId,
      INCOMPLETE_FROZEN_ROW.transaction_id,
      'authoritative recovery identifies the offending durable transaction row',
    );
    t.equal(
      replay.results[0].sessionId,
      INCOMPLETE_FROZEN_ROW.session_id,
      'authoritative recovery identifies the offending row session',
    );
    t.same(mutations, [], 'no mutation occurs when authoritative validation refuses');
    t.equal(
      coordinator.recoveredTransactionIds.has(INCOMPLETE_FROZEN_ROW.transaction_id),
      true,
    );
    t.end();
  },
);

test(
  'a multi-participant one-phase commit row is attributed to the ' +
    'commit_mode decision dimension through authoritative recovery',
  async (t) => {
    const {coordinator, replay, mutations} =
      await redriveAuthoritativeExpectingRefusal(
        [MULTI_PARTICIPANT_ONE_PHASE_ROW],
        [...MULTI_PARTICIPANT_ONE_PHASE_PARTICIPANTS],
      );

    t.equal(replay.resumed, 0, 'authoritative recovery rejects the poison row');
    t.equal(replay.failed, 1);
    t.equal(replay.results[0].decisionReadState, 'invalid');
    t.equal(
      replay.results[0].decisionDimension,
      'commit_mode',
      'authoritative recovery names the exact failed decision dimension',
    );
    t.equal(
      replay.results[0].transactionId,
      MULTI_PARTICIPANT_ONE_PHASE_ROW.transaction_id,
      'authoritative recovery identifies the offending durable transaction row',
    );
    t.same(mutations, [], 'no mutation occurs when authoritative validation refuses');
    t.equal(
      coordinator.recoveredTransactionIds.has(
        MULTI_PARTICIPANT_ONE_PHASE_ROW.transaction_id,
      ),
      true,
    );
    t.end();
  },
);

test(
  'an ACTIVE row omitting explicit decision fields receives no legacy active defaults',
  async (t) => {
    const activeMissingFields = {
      transaction_id: 'c'.repeat(32),
      session_id: 'session-active-missing-fields',
      status: TRANSACTION_STATUS.ACTIVE,
      transaction_epoch: 1,
      timeout_deadline: 100,
      participant_set_text: '[]',
      created_at: 1,
      updated_at: 1,
    };
    const {coordinator, replay, mutations} =
      await redriveAuthoritativeExpectingRefusal([activeMissingFields], []);
    const discovered = coordinator.workflowCoordinator.getWorkflowById(
      activeMissingFields.transaction_id,
    );
    t.equal(discovered.transactionMode, undefined, 'no legacy EXPLICIT default');
    t.equal(discovered.participantSetState, undefined, 'no legacy OPEN default');
    t.equal(discovered.commitMode, undefined, 'no legacy NOT_SELECTED default');
    t.equal(Number.isNaN(discovered.frozenParticipantCount), true, 'no legacy 0 default');
    t.equal(replay.resumed, 0);
    t.equal(replay.results[0].decisionReadState, 'invalid');
    t.equal(replay.results[0].decisionDimension, 'transaction_mode');
    t.same(mutations, []);
    t.end();
  },
);

test(
  'recoverFromSystemTables attributes missing status and invalid epoch directly',
  (t) => {
    const coordinator = new DistributedTransactionCoordinator();
    let thrown = null;
    try {
      coordinator.recoverFromSystemTables({
        transactions: [{
          transaction_id: 'd'.repeat(32),
          session_id: 'session-bad-status',
          transaction_epoch: 1,
          status: null,
        }],
        participants: [],
      });
    } catch (error) {
      thrown = error;
    }
    t.equal(thrown?.message, QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE);
    t.equal(thrown?.errorCode, QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE);
    t.equal(thrown?.decisionDimension, 'status');
    t.equal(thrown?.transactionId, 'd'.repeat(32));
    t.equal(thrown?.sessionId, 'session-bad-status');
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
        transaction_epoch: 1,
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
