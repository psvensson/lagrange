// A write redirect whose target is cooling down waits for the target before it
// submits; a client cancellation during that wait ends the attempt before any
// delivery reaches the router.
import {test} from '../../src/test-helpers/tap.js';
import {executePartitionLeaderRedirectAttempt} from
  '../../src/query/query-executor-recovery-read-delivery.js';
import {createInvocationTermFloorTracker} from
  '../../src/query/query-executor-self-leader-term-floor.js';
import {createPartitionTargetRetryTracker} from
  '../../src/query/query-executor-partition-candidate-state.js';

const PARTITION = 'sys_ledger-p1';

test('abort during a redirected write target cooldown prevents submission', async (t) => {
  const controller = new AbortController();
  const waiting = Promise.withResolvers();
  const releaseWait = Promise.withResolvers();
  const targetRetryTracker = createPartitionTargetRetryTracker({
    now: () => 0,
    defaultRetryDelayMs: 10,
    waitForRetryBudget: async () => {
      waiting.resolve();
      await releaseWait.promise;
      return true;
    },
  });
  targetRetryTracker.recordTargetFailure('A', {backpressured: true, retryAfterMs: 100});
  const deliveries = [];
  const executor = {
    logger: {debug() {}},
    messageRouter: {deliver: (address) => deliveries.push(address)},
  };
  const invocation = createInvocationTermFloorTracker(executor, PARTITION, {
    forRead: false, executionOptions: {signal: controller.signal},
  });
  const redirected = executePartitionLeaderRedirectAttempt({
    address: 'B', response: {leaderAddress: 'A'}, partitionId: PARTITION,
    candidateQueue: [{address: 'B'}], candidateIndex: 0,
    attemptedAddresses: new Set(['A', 'B']), executor, invocation, targetRetryTracker,
  });
  await waiting.promise;
  controller.abort(new Error('client cancelled during target cooldown'));
  releaseWait.resolve();
  await t.rejects(redirected, /client cancelled during target cooldown/);
  t.same(deliveries, [], 'no write reached the router after cancellation');
});
