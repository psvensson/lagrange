/**
 * The retryable replica status write (persistReplicaStatusWithRetry) names
 * its owner when its retry budget is spent: one wait_bound_spent ERROR on
 * the handler's own logger, naming the bound and the replica, and the last
 * failed result is returned unchanged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {assignReplicaHandlerStatusMethods} from
  '../../src/node/replica-handler-status-methods.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const PAST_STATUS_WRITE_BUDGET_MS = 31000;

test('a replica status write whose retry budget is spent names the ' +
  'replica in the wait_bound_spent ERROR', async (t) => {
  class Handler {}
  assignReplicaHandlerStatusMethods(Handler);
  const capture = captureLogger();
  const failed = {success: false, deferRetry: true, error: 'busy'};
  const handler = Object.assign(new Handler(), {
    nodeId: 'node-status-owner',
    logger: capture.logger,
    updateReplicaStatus: async () => failed,
  });
  // Each clock read lands past the 30 s status-write budget, so the first
  // retryable failure finds the budget spent.
  const realNow = Date.now;
  let clockMs = realNow();
  Date.now = () => {
    clockMs += PAST_STATUS_WRITE_BUDGET_MS;
    return clockMs;
  };
  let result;
  try {
    result = await handler.persistReplicaStatusWithRetry(
      'p1-r2', 'ACTIVE', {partitionId: 'p1'});
  } finally {
    Date.now = realNow;
  }

  t.equal(result, failed, 'the last failed result is returned unchanged');
  const spent = capture.spent();
  t.equal(spent.length, 1,
    'exactly one wait_bound_spent ERROR on the handler logger');
  t.equal(spent[0].context.wait,
    'REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS');
  t.same(spent[0].context.scope, {
    nodeId: 'node-status-owner',
    replicaId: 'p1-r2',
    partitionId: 'p1',
    newStatus: 'ACTIVE',
  }, 'scope names the replica whose status write was spent');
});
