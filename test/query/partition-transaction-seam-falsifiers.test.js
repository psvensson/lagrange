/**
 * TX1 (quest replicated-transaction-decision-and-apply) seam falsifiers for the
 * query lane: the coordinator and engine obligations of seam-2026-10-10.md
 * (revision-4 and revision-5 sections) and design-leg-a-v5-2026-10-10.md section
 * 11. They are recorded here, not repaired: the query owner owns the change, and
 * every falsifier is red on the sealed head. Moved out of the participant witness
 * file partition-transaction-replicated-apply-v3.test.js in revision 5.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {PARTICIPANT_SET_STATE, TRANSACTION_MODE} from '../../src/constants/index.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {resolveParticipantCommitMiss} from
  '../../src/query/distributed/distributed-transaction-protocol.js';
import {EPOCH, identityOf, pick} from '../test-helpers/participant-transaction-fixture.js';

const PRIMARY_KEY_COLLISION = Object.freeze({code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  message: 'UNIQUE constraint failed: sql_transactions.transaction_id'});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function twoParticipantCoordinator(overrides) {
  const calls = {prepare: [], commit: [], rollback: []};
  const coordinator = new DistributedTransactionCoordinator({
    participantRetryMaxRetries: 0,
    sleep: async () => {},
    beginParticipant: async () => {},
    prepareParticipant: async (sessionId, partitionId) => {
      calls.prepare.push(partitionId);
    },
    commitParticipant: async (sessionId, partitionId) => {
      calls.commit.push(partitionId);
    },
    rollbackParticipant: async (sessionId, partitionId) => {
      calls.rollback.push(partitionId);
    },
    ...overrides(calls),
  });
  return {coordinator, calls};
}
const statusOf = (coordinator, sessionId) =>
  coordinator.getTransaction(sessionId)?.status ?? 'ended';
const frozenRow = (transactionId, sessionId, status, count) => ({transaction_id: transactionId,
  session_id: sessionId, status, transaction_mode: TRANSACTION_MODE.EXPLICIT,
  participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
  commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT, frozen_participant_count: count,
  created_at: 1, updated_at: 1});
const participantRow = (transactionId, partitionId, status) => ({
  participant_id: `${transactionId}:${partitionId}`, transaction_id: transactionId,
  partition_id: partitionId, status, created_at: 1, updated_at: 1});

// --- identity (seam B) ---

test('TX1 seam W10a: two coordinators on the same node, in the same incarnation, with the same ' +
  'clock, mint distinct 128-bit random transaction identities', () => {
  const sameNode = {now: () => 1000, nodeId: 'node-a', bootIncarnation: 1};
  const ids = [new DistributedTransactionCoordinator(sameNode),
    new DistributedTransactionCoordinator(sameNode)]
    .map((coordinator) => coordinator.createTransactionId('default'));
  assert.deepEqual({distinct: ids[0] !== ids[1],
    random128: ids.map((id) => /^[0-9a-f]{32}$/u.test(id))},
  {distinct: true, random128: [true, true]},
  'no node, incarnation, sequence, session or clock component (seam B)');
});

test('TX1 seam W10c: BEGIN persists the identity insert-once before any fanout, re-mints only ' +
  'on a primary-key collision, and refuses typed on any other persistence error', async () => {
  const beginWith = async (failFirst) => {
    const calls = [];
    const coordinator = new DistributedTransactionCoordinator({
      persistTransaction: async (record, options) => {
        calls.push({id: record.transactionId, insertOnce: options?.insertOnce === true});
        if (calls.length === 1) {
          throw Object.assign(new Error(failFirst.message), {code: failFirst.code});
        }
      },
    });
    const begun = await coordinator.begin('w10c').catch((error) => ({thrown: error.message}));
    return {success: begun.success === true, attempts: calls.length,
      insertOnce: calls.map((call) => call.insertOnce),
      remintedDistinct: calls.length === 2 && calls[0].id !== calls[1].id};
  };
  const facts = {collision: await beginWith(PRIMARY_KEY_COLLISION),
    otherError: await beginWith({code: 'GATEWAY_UNAVAILABLE', message: 'gateway down'})};
  assert.deepEqual(facts, {
    collision: {success: true, attempts: 2, insertOnce: [true, true], remintedDistinct: true},
    otherError: {success: false, attempts: 1, insertOnce: [true], remintedDistinct: false}},
  'only the sql_transactions primary-key collision class re-mints');
});

// --- the decision (seams C, C', U, G) ---

test('TX1 seam S1: once a transaction is COMMITTING, an exceeded budget never rolls a ' +
  'participant back, and the caller learns the commit point was reached', async () => {
  let nowMs = 1_000;
  const {coordinator, calls} = twoParticipantCoordinator((record) => ({
    now: () => nowMs,
    participantRetryMaxRetries: 1,
    commitParticipant: async (sessionId, partitionId) => {
      record.commit.push(partitionId);
      if (partitionId === 'p2') {
        nowMs += 120_000;
        throw new Error('commit answer lost');
      }
    },
  }));
  await coordinator.begin('s1');
  await coordinator.enlistParticipants('s1', ['p1', 'p2']);
  const result = await coordinator.commit('s1');
  assert.deepEqual({rollbackCalls: calls.rollback, status: statusOf(coordinator, 's1'),
    commitPointReached: result.commitPointReached ?? null},
  {rollbackCalls: [], status: TRANSACTION_STATUS.COMMITTING, commitPointReached: true},
  'the client answer is in doubt (TRANSACTION_OUTCOME_UNKNOWN), never a rollback');
});

test('TX1 seam S3: a non-timeout commit failure after COMMITTING keeps the transaction ' +
  'COMMITTING; re-driving it never prepares or rolls back again', async () => {
  const {coordinator, calls} = twoParticipantCoordinator((record) => ({
    commitParticipant: async (sessionId, partitionId) => {
      record.commit.push(partitionId);
      if (partitionId === 'p2' && record.commit.length <= 2) {
        throw new Error('commit answer lost');
      }
    },
  }));
  await coordinator.begin('s3');
  await coordinator.enlistParticipants('s3', ['p1', 'p2']);
  await coordinator.commit('s3');
  const statusAfterFailure = statusOf(coordinator, 's3');
  const preparesBefore = calls.prepare.length;
  await coordinator.commit('s3');
  assert.deepEqual({statusAfterFailure, reprepares: calls.prepare.length - preparesBefore,
    rollbackCalls: calls.rollback}, {statusAfterFailure: TRANSACTION_STATUS.COMMITTING,
    reprepares: 0, rollbackCalls: []}, 'protocol.js:396-398 sets FAILED, :299-310 re-prepares');
});

test('TX1 seam S4a: recovery completes a transaction left FAILED after its COMMIT decision',
  async () => {
    const {coordinator, calls} = twoParticipantCoordinator(() => ({}));
    coordinator.recoverFromSystemTables({
      transactions: [frozenRow('t-s4', 's4', TRANSACTION_STATUS.FAILED, 2)],
      participants: [participantRow('t-s4', 'p1', TRANSACTION_STATUS.COMMITTED),
        participantRow('t-s4', 'p2', TRANSACTION_STATUS.COMMITTING)],
      decisions: [{transaction_id: 't-s4', decision: 'COMMIT'}],
    });
    await coordinator.resumeRecoveredTransactions();
    assert.deepEqual({commitCalls: calls.commit, rollbackCalls: calls.rollback,
      active: coordinator.hasActiveTransaction('s4')},
    {commitCalls: ['p2'], rollbackCalls: [], active: false},
    'recovery.js:297-306 and :404-410 skip FAILED, stranding PREPARED reservations');
  });

test('TX1 seam S8: two recovering coordinators driving one transaction record exactly one ' +
  'insert-once decision (seam G)', async () => {
  const decisions = new Map();
  const recovering = () => twoParticipantCoordinator(() => ({
    persistTransactionDecision: async (record) => {
      if (decisions.has(record.transactionId)) {
        throw Object.assign(new Error(PRIMARY_KEY_COLLISION.message),
          {code: PRIMARY_KEY_COLLISION.code});
      }
      decisions.set(record.transactionId, record.decision);
    },
  }));
  const pair = [recovering(), recovering()];
  for (const {coordinator} of pair) {
    coordinator.recoverFromSystemTables({
      transactions: [frozenRow('t-s8', 's8', TRANSACTION_STATUS.PREPARED, 1)],
      participants: [participantRow('t-s8', 'p1', TRANSACTION_STATUS.PREPARED)],
    });
  }
  await Promise.all(pair.map(({coordinator}) => coordinator.resumeRecoveredTransactions()));
  assert.deepEqual({decisions: [...decisions.entries()],
    rollbackCalls: pair.flatMap(({calls}) => calls.rollback)},
  {decisions: [['t-s8', 'COMMIT']], rollbackCalls: []},
  'concurrent recovery converges on the first inserted decision (finding F-REC)');
});

// --- outcomes, persistence, wire, retained answers, 1PC (seams D, S4b, A, E, F) ---

test('TX1 seam S2: a two-phase NO_TRANSACTION commit miss is resolved by an outcome read, ' +
  'never assumed COMMITTED', async () => {
  const reads = [];
  const owner = {resolveParticipantCommitOutcome: async (...args) => {
    reads.push(args);
    return PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
  }};
  const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
  error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
  const resolution = await resolveParticipantCommitMiss.call(owner,
    {sessionId: 's2', transactionEpoch: EPOCH, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT},
    TRANSACTION_STATUS.COMMITTING, 'p1', error);
  assert.deepEqual({resolution, reads: reads.length},
    {resolution: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, reads: 1},
    'protocol.js resolveParticipantCommitMiss must read the participant outcome');
});

test('TX1 seam S4b: an engine that cannot persist transaction state refuses an explicit BEGIN, ' +
  'typed, before any fanout', async () => {
  const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false});
  const begun = await engine.transactionCoordinator.begin('s4b')
    .catch((error) => ({success: false, errorCode: error?.code ?? error?.message}));
  assert.deepEqual(pick(begun, ['success', 'errorCode']), {success: false,
    errorCode: 'TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE'},
  'sql-query-engine.js:115-117 skips persistence silently; DIRECT_AUTOCOMMIT stays unaffected');
});

test('TX1 seam S5: every participant request carries the transaction identity (seam A)',
  async () => {
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false});
    let request = null;
    engine.queryExecutor = {executeOnPartition: async (...args) => {
      request = args[6].buildRequest();
      return {success: true};
    }};
    await engine.deliverTransactionOperation('s5', 'p1', PARTITION_SERVICE_OPERATION.COMMIT, {
      transactionEpoch: EPOCH, ...identityOf('t-s5', {partitionId: 'p1'})});
    assert.deepEqual(pick(request, ['transactionId', 'participantId', 'commitMode',
      'transactionEpoch']), {transactionId: 't-s5', participantId: 't-s5:p1',
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT, transactionEpoch: EPOCH},
    'sql-query-engine.js:569-627 sends only sessionId (and an optional epoch)');
  });

test('TX1 seam S6: each participant\'s PREPARE answer (digest, index, term) is retained on ' +
  'its durable row before the COMMIT decision (seam E)', async () => {
  const persisted = [];
  const {coordinator} = twoParticipantCoordinator(() => ({
    prepareParticipant: async (sessionId, partitionId) => ({success: true,
      preparedDigest: `digest-${partitionId}`, prepareIndex: 5, prepareTerm: 2}),
    persistParticipant: async (record) => {
      persisted.push(record);
    },
  }));
  await coordinator.begin('s6');
  await coordinator.enlistParticipants('s6', ['p1', 'p2']);
  await coordinator.commit('s6');
  const retained = persisted.find((record) => record.partitionId === 'p1' &&
    record.preparedDigest === 'digest-p1');
  assert.deepEqual(pick(retained, ['preparedDigest', 'prepareIndex', 'prepareTerm']),
    {preparedDigest: 'digest-p1', prepareIndex: 5, prepareTerm: 2},
    'the decision text is built from retained answers');
});

test('TX1 seam S7: a single-participant transaction prepares before its decision (seam F, ' +
  'option A; replaced if the query owner chooses option B)', async () => {
  const order = [];
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {
      order.push('prepare');
    },
    commitParticipant: async () => {
      order.push('commit');
    },
    resolveParticipantCommitOutcome: async () => PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  });
  await coordinator.begin('s7');
  await coordinator.enlistParticipants('s7', ['p1']);
  await coordinator.commit('s7');
  assert.deepEqual(order, ['prepare', 'commit'], 'prepare-first single participant');
});
