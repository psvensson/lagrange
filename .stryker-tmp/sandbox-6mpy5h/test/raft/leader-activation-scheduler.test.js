// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  LeaderActivationScheduler,
} from '../../src/raft/leader-activation-scheduler.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('LeaderActivationScheduler spaces queued activations on the same node', async (t) => {
  const scheduler = new LeaderActivationScheduler({
    nodeId: 'node-1',
    spacingMs: 20,
  });
  const startedAt = [];

  scheduler.enqueue(() => {
    startedAt.push(Date.now());
  });
  scheduler.enqueue(() => {
    startedAt.push(Date.now());
  });

  await sleep(80);

  t.equal(startedAt.length, 2, 'both activations should run');
  t.ok(
    startedAt[1] - startedAt[0] >= 15,
    'activations should be staggered on the same node',
  );
  scheduler.shutdown();
});

test('LeaderActivationScheduler cancels queued activations before dispatch', async (t) => {
  const scheduler = new LeaderActivationScheduler({
    nodeId: 'node-1',
    spacingMs: 20,
  });
  let activations = 0;

  scheduler.enqueue(() => {
    activations += 1;
  });
  const canceled = scheduler.enqueue(() => {
    activations += 1;
  });
  canceled.cancel();

  await sleep(80);

  t.equal(activations, 1, 'canceled activation should never run');
  scheduler.shutdown();
});
