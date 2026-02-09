import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_REBALANCE_REASON,
} from '../../src/bootstrap/bootstrap-constants.js';
import {STATE} from '../../src/constants/index.js';

function createNodeReadyEvent(nodeId, leaseOffsetMs) {
  return {
    data: {
      node_id: nodeId,
      ws_connection_state: STATE.READY,
      ready_lease_expires_at: Date.now() + leaseOffsetMs,
    },
  };
}

test('BootstrapService node-ready rebalance trigger ownership', async (t) => {
  await t.test('schedules one rebalance trigger per node-ready transition', async (t) => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'localhost:8080',
      config: {
        nodeReadyRebalanceDelayMs: 5,
      },
    });

    const reasons = [];
    bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
      reasons.push(reason);
    };

    const event = createNodeReadyEvent('node-2', 1000);
    const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      STATE.CONNECTED,
    );
    const duplicateScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      STATE.CONNECTING,
    );

    t.equal(firstScheduled, true, 'first ready transition should schedule rebalance');
    t.equal(duplicateScheduled, false, 'duplicate node-ready events should be deduped');

    await new Promise((resolve) => setTimeout(resolve, 20));

    t.same(
      reasons,
      [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
      'should trigger exactly one node_ready rebalance',
    );
  });

  await t.test('ignores invalid transitions and expired ready lease', async (t) => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'localhost:8080',
      config: {
        nodeReadyRebalanceDelayMs: 5,
      },
    });

    let triggerCount = 0;
    bootstrapService.triggerRebalancingOnAllPartitions = () => {
      triggerCount++;
    };

    const expiredLease = createNodeReadyEvent('node-3', -1000);
    const alreadyReady = createNodeReadyEvent('node-4', 1000);

    const scheduledExpired = bootstrapService.handleNodeReadyRebalanceTrigger(
      expiredLease,
      STATE.CONNECTED,
    );
    const scheduledAlreadyReady = bootstrapService.handleNodeReadyRebalanceTrigger(
      alreadyReady,
      STATE.READY,
    );

    t.equal(scheduledExpired, false, 'should not schedule with expired ready lease');
    t.equal(scheduledAlreadyReady, false, 'should not schedule without a state transition');

    await new Promise((resolve) => setTimeout(resolve, 20));

    t.equal(triggerCount, 0, 'invalid transitions should not trigger rebalancing');
  });

  await t.test('cleanup cancels pending node-ready rebalance timers', async (t) => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'localhost:8080',
      config: {
        nodeReadyRebalanceDelayMs: 25,
      },
    });

    let triggerCount = 0;
    bootstrapService.triggerRebalancingOnAllPartitions = () => {
      triggerCount++;
    };

    const event = createNodeReadyEvent('node-5', 1000);
    const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      STATE.CONNECTED,
    );
    t.equal(scheduled, true, 'should schedule trigger before cleanup');

    bootstrapService.clearNodeReadyRebalanceState();

    await new Promise((resolve) => setTimeout(resolve, 40));
    t.equal(triggerCount, 0, 'cleared timers should not fire after cleanup');
    t.equal(
      bootstrapService.pendingNodeReadyRebalanceTimers.size,
      0,
      'timer registry should be empty after cleanup',
    );
    t.equal(
      bootstrapService.rebalanceTriggeredNodeIds.size,
      0,
      'dedupe node set should be empty after cleanup',
    );
  });
});
