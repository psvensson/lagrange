/**
 * A spent wait is a failure, and is visible: the bounded critical replica
 * operation dispatch (REPLICA_OPERATION_DISPATCH_TIMEOUT_MS, the
 * Promise.race deadline in awaitReplicaOperationDispatchDeadline) logs
 * exactly one wait_bound_spent ERROR naming the operation it was waiting on
 * when no response arrives, and none when the response wins the race. The
 * post-expiry behaviour is unchanged: the same retryable
 * ROUTER_MESSAGE_TIMEOUT error rejects the dispatch.
 *
 * Fake timers (node:test mock.timers) spend the bound; nothing waits on
 * wall time.
 */

import {mock} from 'node:test';
import {test} from '../../src/test-helpers/tap.js';
import {
  awaitReplicaOperationDispatchDeadline,
  buildReplicaOperationDispatchTimeoutError,
} from '../../src/rebalancer/operation-workflow-dispatch-response-reconcile.js';

const DISPATCH_TIMEOUT_MS = 5_000;
const START_MS = 1_000_000;
const DISPATCH_WAIT = 'REPLICA_OPERATION_DISPATCH_TIMEOUT_MS';

function buildOwner() {
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  return {
    lines,
    errors: () => lines.filter((line) => line.level === 'error'),
    nodeId: 'node-a',
    replicaOperationDispatchTimeoutMs: DISPATCH_TIMEOUT_MS,
    logger: {
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
    },
    buildReplicaOperationDispatchTimeoutError(operation) {
      return buildReplicaOperationDispatchTimeoutError(operation);
    },
  };
}

function buildOperation(operationId) {
  return {
    operationId,
    partitionId: 'operation_ledger-p0',
    type: 'ADD',
    workflowStep: 'SENDING',
    sourceNodeId: 'node-a',
    targetNodeId: 'node-c',
  };
}

test('a spent dispatch deadline logs one wait_bound_spent ERROR and still ' +
  'rejects with the retryable timeout', async (t) => {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
  t.teardown(() => mock.timers.reset());
  const owner = buildOwner();
  const operation = buildOperation('op-dispatch-spent');
  const never = new Promise(() => {});
  const outcome = awaitReplicaOperationDispatchDeadline
    .call(owner, operation, never)
    .then(() => null, (error) => error);
  mock.timers.tick(DISPATCH_TIMEOUT_MS);
  const error = await outcome;
  t.ok(error, 'the dispatch rejected at its deadline');
  t.equal(error.deferRetry, true, 'with the same retryable timeout error');
  t.equal(error.operationId, 'op-dispatch-spent');
  const errors = owner.errors();
  t.equal(errors.length, 1, 'exactly one ERROR');
  const context = errors[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, DISPATCH_WAIT, 'names the wait');
  t.equal(context.boundMs, DISPATCH_TIMEOUT_MS, 'names the bound');
  t.equal(context.elapsedMs, DISPATCH_TIMEOUT_MS,
    'elapsed measured on the deadline clock');
  t.same(context.lastObserved, {
    workflowStep: 'SENDING',
    type: 'ADD',
    targetNodeId: 'node-c',
    sourceNodeId: 'node-a',
  }, 'lastObserved names what the dispatch was waiting on');
  t.same(context.scope, {
    nodeId: 'node-a',
    partitionId: 'operation_ledger-p0',
    operationId: 'op-dispatch-spent',
  });
  t.end();
});

test('a dispatch answered before the deadline logs no wait_bound_spent',
  async (t) => {
    mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
    t.teardown(() => mock.timers.reset());
    const owner = buildOwner();
    const operation = buildOperation('op-dispatch-answered');
    const response = {success: true, status: 'initiated'};
    const result = await awaitReplicaOperationDispatchDeadline.call(
      owner, operation, Promise.resolve(response));
    t.equal(result, response, 'the response won the race');
    mock.timers.tick(DISPATCH_TIMEOUT_MS * 2);
    t.equal(owner.errors().length, 0, 'no ERROR on normal completion');
    t.end();
  });
