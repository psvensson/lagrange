import {test} from '../../src/test-helpers/tap.js';
import {
  LeaderActivationScheduler,
} from '../../src/raft/leader-activation-scheduler.js';
import {LeaderActivationGate} from '../../src/raft/leader-activation-gate.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

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

// The shared scheduler's lifetime is its users' lifetime. Each gate leases the
// node's scheduler and returns the lease when it shuts down; the last return
// disarms the scheduler and drops it, so nothing stays armed after the node's
// services shut down and the node's next services start on their own clock.
test('the last gate to shut down disarms the shared scheduler and drops it',
  (t) => {
    const nodeId = 'lease-node';
    const firstClock = new VirtualTimeSource();
    const shared = {nodeId, spacingMs: 25, timeSource: firstClock};
    const first = new LeaderActivationGate({
      holdoffMs: 0, sharedActivationScheduler: shared,
    });
    const second = new LeaderActivationGate({
      holdoffMs: 0, sharedActivationScheduler: shared,
    });
    const scheduler = first.activationScheduler;
    t.equal(second.activationScheduler, scheduler,
      'gates on one node share one scheduler');
    // Two activations queue behind the node's spacing: the scheduler is armed.
    scheduler.lastDispatchAt = firstClock.now();
    first.schedule(1, () => undefined);
    second.schedule(1, () => undefined);
    t.not(scheduler.dispatchTimer, null, 'queued activations arm the pacing');

    first.shutdown();
    t.not(scheduler.dispatchTimer, null,
      'one user shutting down leaves the other user\'s pacing armed');
    second.shutdown();
    t.equal(scheduler.dispatchTimer, null,
      'the last user shutting down disarms the scheduler');
    t.equal(scheduler.queue.length, 0, 'and nothing stays queued');
    t.equal(firstClock.pendingTimerCount(), 0,
      'the clock it paced on holds no timer of it');
    second.shutdown();
    t.equal(scheduler.sharedLeaseCount, 0, 'a repeated shutdown returns nothing');

    const nextClock = new VirtualTimeSource();
    const next = new LeaderActivationGate({
      holdoffMs: 0,
      sharedActivationScheduler: {nodeId, spacingMs: 25, timeSource: nextClock},
    });
    t.not(next.activationScheduler, scheduler,
      'the node\'s next user gets a fresh scheduler');
    t.equal(next.activationScheduler.timeSource, nextClock,
      'on its own clock, not the clock of the services that shut down');
    next.shutdown();
    t.end();
  });

test('a caller-supplied scheduler is the caller\'s: a gate never releases it',
  (t) => {
    const supplied = new LeaderActivationScheduler({nodeId: 'supplied-node'});
    const gate = new LeaderActivationGate({
      holdoffMs: 0,
      activationScheduler: supplied,
      sharedActivationScheduler: {nodeId: 'supplied-node'},
    });
    t.equal(gate.activationScheduler, supplied, 'the supplied scheduler is used');
    gate.shutdown();
    t.equal(supplied.destroyed, false,
      'and it outlives the gate: its lifetime belongs to whoever supplied it');
    supplied.shutdown();
    t.end();
  });
