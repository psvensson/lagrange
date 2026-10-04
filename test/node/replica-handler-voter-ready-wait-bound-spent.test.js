/**
 * The voter-ready activation wait (ReplicaHandler.waitForVoterReadyActivation,
 * bound REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS) is a spent wait when the
 * replica never becomes a routable voter: exactly one wait_bound_spent ERROR
 * naming the bound and the role / services row the handler last observed,
 * and the same throw as before. A replica that becomes voter-ready logs none.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const REPLICA_ID = 'nodes-p1-r4';
const PARTITION_ID = 'nodes-p1';
const SYNC_TIMEOUT_MS = 1;

const waitForVoterReady = ReplicaHandler.prototype.waitForVoterReadyActivation;

function handlerThis(capture, {voterReady}) {
  return {
    nodeId: 'node-a',
    logger: capture.logger,
    syncTimeoutMs: SYNC_TIMEOUT_MS,
    throwIfShuttingDown() {},
    isReplicaVoterReady: () => voterReady,
    getTrackedReplicaRole: () => 'learner',
    systemTableCache: {
      get: () => ({
        service_id: REPLICA_ID,
        status: 'syncing',
        raft_role: 'learner',
        address: 'ws://127.0.0.1:8082',
      }),
    },
    seedLocalReplicaVoterRaftRole() {},
    getTrackedService: () => null,
  };
}

test('a replica that never becomes voter-ready spends the bound: one ' +
  'wait_bound_spent ERROR and the same throw', async (t) => {
  const capture = captureLogger();
  await t.rejects(
    waitForVoterReady.call(
      handlerThis(capture, {voterReady: false}), REPLICA_ID, PARTITION_ID),
    new RegExp(`did not become voter-ready within ${SYNC_TIMEOUT_MS}ms`),
    'the expiry still throws the same error',
  );
  const errors = capture.errors();
  t.equal(errors.length, 1, 'exactly one ERROR');
  const context = errors[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS');
  t.equal(context.boundMs, SYNC_TIMEOUT_MS);
  t.match(context.lastObserved, {
    trackedRaftRole: 'learner',
    serviceRowPresent: true,
    serviceRowStatus: 'syncing',
    serviceRowRaftRole: 'learner',
    serviceRowHasAddress: true,
  }, 'lastObserved carries the role and services row last seen');
  t.ok(context.lastObserved.polls >= 1, 'the polls made are counted');
  t.same(context.scope, {
    nodeId: 'node-a',
    partitionId: PARTITION_ID,
    replicaId: REPLICA_ID,
  });
  t.notOk(capture.lines.some((line) => line.level === 'warn'),
    'the old WARN line is replaced, not doubled');
});

test('a replica that becomes voter-ready logs no spent wait', async (t) => {
  const capture = captureLogger();
  await waitForVoterReady.call(
    handlerThis(capture, {voterReady: true}), REPLICA_ID, PARTITION_ID);
  t.equal(capture.errors().length, 0, 'no ERROR on normal completion');
});
