/**
 * Recovered decision state reaches no mutation before its validation.
 *
 * Cache rows only discover obligations (accepted R2 refinement,
 * design-query-recovery-set-2026-10-11): `recoverFromSystemTables` retains
 * every identified row, and the re-drive restores the authoritative row and
 * validates it with validateRecoveredTransactionDecision before it freezes,
 * decides or fans out (a malformed one is held INVALID). Since 4151a3ab4 the
 * restored obligation was also bound to its session, and a session COMMIT,
 * ROLLBACK or statement ran straight on the unvalidated restored state: an
 * invalid recovered row (a retired commit mode, a frozen set with no
 * selected mode, a count that is not the admitted set, an unknown mode or
 * set state) was frozen, decided and fanned out, and even a valid recovered
 * transaction was decided by the client instead of by recovery (Invariant
 * 0). A recovered obligation is now owned by recovery under its own key and
 * no session holds it; these witnesses feed each shape through the real
 * entries with the obligation's exact ID and require the recovery owner's
 * typed in-doubt answer on COMMIT and ROLLBACK, a refused statement, no
 * mutation, the obligation retained, and a valid recovered row still
 * applied by the recovery owner.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {recoveryDecisionColumns, recoveryRowsOf} from
  '../test-helpers/transaction-recovery-rows-fixture.js';

const TRANSACTION_ID = 'a'.repeat(32);
const SESSION_ID = 'recovered-session';

// A canonical FROZEN, prepared, undecided row over `partitions`, then the
// shape under test.
function recoveryRows(overrides = {}, {partitions = ['p1'],
  participantPartitions = partitions} = {}) {
  return recoveryRowsOf({transactionId: TRANSACTION_ID, sessionId: SESSION_ID,
    partitions, participantPartitions, overrides});
}

function decisionColumns(partitions, decision = 'COMMIT') {
  return recoveryDecisionColumns(TRANSACTION_ID, partitions, decision);
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

// Every stage a client can send naming the recovered obligation's exact ID.
async function sessionStages(coordinator) {
  const exact = {expectedTransactionId: TRANSACTION_ID};
  return {
    commit: await coordinator.commit(SESSION_ID, exact),
    rollback: await coordinator.rollback(SESSION_ID, exact),
    statement: await coordinator.executeWriteStatement(SESSION_ID,
      {operationId: 'op-1', statementType: 'UPDATE', partitionIds: ['p1']},
      async () => ({success: true}), TRANSACTION_ID),
  };
}

// COMMIT and ROLLBACK reach the recovery owner's in-doubt answer; a
// statement is refused, since no session holds the obligation.
function assertHeldInDoubt(stages) {
  for (const [stage, answer] of Object.entries(stages)) {
    assert.equal(answer.success, false, stage);
    assert.equal(answer.errorCode, stage === 'statement' ?
      QUERY_ERROR_CODE.NO_TRANSACTION :
      QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT,
    `${stage} is answered by the recovery owner, never adopted`);
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
  const commit = await coordinator.commit(SESSION_ID,
    {expectedTransactionId: TRANSACTION_ID});
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
