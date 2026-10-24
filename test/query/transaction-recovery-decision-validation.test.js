/**
 * Recovered decision state reaches no mutation before its validation.
 *
 * Cache rows only discover obligations (accepted R2 refinement,
 * design-query-recovery-set-2026-10-11): `recoverFromSystemTables` retains
 * every identified row, and the re-drive restores the authoritative row and
 * validates it with validateRecoveredTransactionDecision before it freezes,
 * decides or fans out (a malformed one is held INVALID). Since 4151a3ab4 the
 * restored obligation is also bound to its session, and a session COMMIT,
 * ROLLBACK or statement ran straight on the unvalidated restored state: an
 * invalid recovered row (a retired commit mode, a frozen set with no
 * selected mode, a count that is not the admitted set, an unknown mode or
 * set state) was frozen, decided and fanned out, and even a valid recovered
 * transaction was decided by the client instead of by recovery (Invariant
 * 0). These witnesses feed each shape through the real entries and require
 * the typed in-doubt answer with no mutation, the obligation retained, and a
 * valid recovered row still applied by the recovery owner.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {participantIdOf} from
  '../../src/query/distributed/distributed-transaction-identity.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

const TRANSACTION_ID = 'a'.repeat(32);
const SESSION_ID = 'recovered-session';
const PREPARED = Object.freeze({prepared_digest: 'b'.repeat(64),
  prepare_index: 3, prepare_term: 1});

function participantRow(transactionId, partitionId) {
  return {transaction_id: transactionId,
    participant_id: participantIdOf(transactionId, partitionId),
    partition_id: partitionId, status: 'PREPARED', ...PREPARED,
    created_at: 1, updated_at: 1};
}

// A canonical FROZEN, prepared, undecided row over `partitions`, then the
// shape under test.
function recoveryRows(overrides = {}, {partitions = ['p1'],
  participantPartitions = partitions, transactionId = TRANSACTION_ID,
  sessionId = SESSION_ID} = {}) {
  return {
    transactions: [{transaction_id: transactionId, session_id: sessionId,
      status: 'PREPARED', transaction_epoch: 7, timeout_deadline: 1,
      transaction_mode: 'EXPLICIT', participant_set_state: 'FROZEN',
      participant_set_text: participantSetTextOf(transactionId, partitions),
      commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: partitions.length,
      created_at: 1, updated_at: 2, ...overrides}],
    participants: participantPartitions.map((partitionId) =>
      participantRow(transactionId, partitionId)),
    writeOperations: [],
  };
}

function decisionColumns(partitions, decision = 'COMMIT') {
  const record = buildTransactionDecisionRecord({transactionId: TRANSACTION_ID,
    participants: new Map(partitions.map((partitionId) => [partitionId, {
      partitionId, preparedDigest: PREPARED.prepared_digest,
      prepareIndex: PREPARED.prepare_index, prepareTerm: PREPARED.prepare_term}]))},
  decision);
  return {decision: record.decision, decision_text: record.decisionText,
    decision_digest: record.decisionDigest};
}

// Every mutation the coordinator can perform, in order.
function recordingCoordinator(authority = null) {
  const mutations = [];
  const warnings = [];
  const record = (name) => async (value) => {
    mutations.push(`${name}:${value?.status ?? value?.decision ?? ''}`);
  };
  const coordinator = new DistributedTransactionCoordinator({
    logger: {warn: (message, fields) => warnings.push(fields), error() {}, debug() {}},
    now: () => 100, participantRetryMaxRetries: 0,
    persistTransaction: record('transaction'),
    persistParticipant: record('participant'),
    persistTransactionDecision: record('decision'),
    persistTransactionParticipantSet: record('participant-set'),
    prepareParticipant: async () => {
      mutations.push('PREPARE');
      return {preparedDigest: 'c'.repeat(64), prepareIndex: 1, prepareTerm: 1};
    },
    commitParticipant: async () => {
      mutations.push('COMMIT');
      return {success: true, outcome: 'COMMITTED'};
    },
    rollbackParticipant: async () => {
      mutations.push('ROLLBACK');
      return {success: true};
    },
  });
  coordinator.readTransactionRecoveryState = async (transactionId) => {
    const rows = authority?.(transactionId);
    return rows ? {state: 'available', transaction: rows.transactions[0],
      participants: rows.participants} : {state: 'missing'};
  };
  return {coordinator, mutations, warnings};
}

const INVALID_RECOVERED_SHAPES = Object.freeze([
  {name: 'a retired ONE_PHASE_COMMIT mode',
    rows: () => recoveryRows({commit_mode: 'ONE_PHASE_COMMIT'})},
  {name: 'a frozen set with no selected commit mode',
    rows: () => recoveryRows({commit_mode: 'NOT_SELECTED'})},
  {name: 'an open set with a selected commit mode',
    rows: () => recoveryRows({participant_set_state: 'OPEN', status: 'ACTIVE',
      frozen_participant_count: 0})},
  {name: 'a frozen count that is not the admitted set',
    rows: () => recoveryRows({frozen_participant_count: 3})},
  {name: 'an unknown transaction mode',
    rows: () => recoveryRows({transaction_mode: 'IMPLICIT'})},
  {name: 'an unknown participant-set state',
    rows: () => recoveryRows({participant_set_state: 'CLOSING'})},
  {name: 'an unreadable admitted participant set',
    rows: () => recoveryRows({participant_set_text: '[["forged","p1"]]'})},
  {name: 'a recorded COMMIT over another participant set',
    rows: () => recoveryRows({status: 'COMMITTING', ...decisionColumns(['p1'])},
      {partitions: ['p1', 'p2']})},
  {name: 'a recorded decision whose bytes do not verify',
    rows: () => recoveryRows({status: 'COMMITTING', ...decisionColumns(['p1']),
      decision_digest: 'f'.repeat(64)})},
]);

// Every session stage a client can send for its session's transaction.
async function sessionStages(coordinator) {
  return {
    commit: await coordinator.commit(SESSION_ID),
    rollback: await coordinator.rollback(SESSION_ID),
    statement: await coordinator.executeWriteStatement(SESSION_ID,
      {operationId: 'op-1', statementType: 'UPDATE', partitionIds: ['p1']},
      async () => ({success: true})),
  };
}

function assertHeldInDoubt(stages) {
  for (const [stage, answer] of Object.entries(stages)) {
    assert.equal(answer.success, false, stage);
    assert.equal(answer.errorCode, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT,
      `${stage} is answered in doubt`);
  }
}

for (const shape of INVALID_RECOVERED_SHAPES) {
  test(`${shape.name} reaches no freeze, decision, status or fanout from ` +
    'recovery or from the session', async () => {
    const rows = shape.rows();
    const {coordinator, mutations} = recordingCoordinator(() => rows);
    coordinator.recoverFromSystemTables(rows);
    const stages = await sessionStages(coordinator);
    const replay = await coordinator.resumeRecoveredTransactions();
    assert.deepEqual(mutations, [], 'nothing is mutated');
    assertHeldInDoubt(stages);
    assert.equal(replay.resumed, 0);
    assert.equal(replay.results[0].decisionReadState, 'invalid',
      'the re-drive refuses the authoritative decision state');
    assert.equal(coordinator.recoveredTransactionIds.has(TRANSACTION_ID), true,
      'the exact obligation stays retained for the sweep');
  });
}

test('a valid recovered transaction is decided by recovery, never by the ' +
  'session that inherits it', async () => {
  const rows = recoveryRows();
  const {coordinator, mutations} = recordingCoordinator(() => rows);
  coordinator.recoverFromSystemTables(rows);
  const stages = await sessionStages(coordinator);
  assert.deepEqual(mutations, [], 'the session decides nothing');
  assertHeldInDoubt(stages);
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 1);
  assert.equal(replay.results[0].replayPath, 'COMMIT');
  assert.deepEqual(mutations.filter((entry) => !entry.startsWith('participant:')),
    ['decision:COMMIT', 'transaction:COMMITTING', 'COMMIT', 'transaction:COMMITTED']);
  assert.equal(coordinator.getTransaction(SESSION_ID), null);
});

test('an authoritative row that fails the decision validator holds a valid ' +
  'discovered obligation with no mutation', async () => {
  const rows = recoveryRows();
  const {coordinator, mutations} = recordingCoordinator(() =>
    recoveryRows({frozen_participant_count: 2}));
  coordinator.recoverFromSystemTables(rows);
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 0);
  assert.equal(replay.results[0].decisionReadState, 'invalid');
  assert.equal(coordinator.recoveredTransactionIds.has(TRANSACTION_ID), true);
  assert.deepEqual(mutations, []);
});

test('a live transaction whose admission answer was lost is not frozen on ' +
  'its stale set by a later COMMIT', async () => {
  const {coordinator, mutations} = recordingCoordinator();
  coordinator.persistTransactionParticipantSet = async () => {
    throw new Error('admission answer lost');
  };
  const begun = await coordinator.begin(SESSION_ID);
  await assert.rejects(coordinator.enlistParticipants(SESSION_ID, ['p1']),
    /admission answer lost/u);
  assert.equal(coordinator.recoveredTransactionIds.has(begun.transactionId), true,
    'the exact ID moved to the authoritative recovery path');
  mutations.length = 0;
  const commit = await coordinator.commit(SESSION_ID);
  assert.equal(commit.errorCode, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT);
  assert.deepEqual(mutations, []);
});

test('a held session COMMIT never claims nothing was committed from the ' +
  'restored progress status (the decision-recorded, status-PREPARED window)',
async () => {
  // The decision write precedes the COMMITTING status write, so a durable
  // row can record COMMIT while its status still says PREPARED.
  const rows = recoveryRows({...decisionColumns(['p1'])});
  const {coordinator, mutations} = recordingCoordinator(() => rows);
  coordinator.recoverFromSystemTables(rows);
  const commit = await coordinator.commit(SESSION_ID);
  assert.equal(commit.errorCode, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT);
  assert.equal(Object.hasOwn(commit, 'commitPointReached'), false,
    'the outcome is unknown to the session, never "not committed"');
  assert.equal(commit.decisionReadState, 'not_read',
    'the refusal names that no authoritative read answered it yet');
  assert.deepEqual(mutations, []);
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 1);
  assert.equal(replay.results[0].replayPath, 'COMMIT',
    'the recovery owner completes the recorded COMMIT');
});
