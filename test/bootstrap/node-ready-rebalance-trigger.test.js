import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_REBALANCE_REASON,
} from '../../src/bootstrap/bootstrap-constants.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';

const NODE_READY_REBALANCE_DELAY_MS = 5;
const WAIT_FOR_TIMER_FLUSH_MS = 20;
const CLEANUP_TIMER_DELAY_MS = 25;
const CLEANUP_WAIT_MS = 40;
const LEASE_VALID_MS = 1000;
const LEASE_EXPIRED_MS = -1000;
const CACHE_WAIT_TIMEOUT_MS = 8;
const CACHE_WAIT_DELAY_MS = 1;
const CACHE_GATE_WAIT_MS = 15;
const CACHE_BECOMES_READY_MS = 30;
const CACHE_READY_TIMEOUT_MS = 60;

function createNodeEvent(nodeId, leaseOffsetMs, connectionState = STATE.DISCONNECTED) {
  const now = Date.now();
  return {
    data: {
      node_id: nodeId,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: connectionState,
      ready_lease_expires_at: now + leaseOffsetMs,
    },
  };
}

function createPreviousNodeRow(nodeId, leaseOffsetMs) {
  const now = Date.now();
  return {
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.DISCONNECTED,
    ready_lease_expires_at: now + leaseOffsetMs,
  };
}

function createPreviousReadyHeartbeatRow(nodeId, options = {}) {
  const now = Date.now();
  const lastHeartbeatOffsetMs = Number.isFinite(options.lastHeartbeatOffsetMs) ?
    options.lastHeartbeatOffsetMs :
    LEASE_EXPIRED_MS * 2;
  const leaseOffsetMs = Number.isFinite(options.leaseOffsetMs) ?
    options.leaseOffsetMs :
    LEASE_EXPIRED_MS;
  return {
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.DISCONNECTED,
    last_heartbeat: now + lastHeartbeatOffsetMs,
    ready_lease_expires_at: now + leaseOffsetMs,
  };
}

function setReadyNodeCache(bootstrapService, nodeRows) {
  const rowsByNodeId = new Map(
    nodeRows.map((nodeRow) => [nodeRow.node_id, {...nodeRow}]),
  );
  bootstrapService.systemTableCache = {
    get: (_tableName, nodeId) => {
      const row = rowsByNodeId.get(nodeId);
      return row ? {...row} : null;
    },
  };
}

test('BootstrapService node-ready rebalance trigger ownership', async (t) => {
  await t.test('schedules one rebalance trigger per node-ready transition', async (t) => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'localhost:8080',
      config: {
        nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
      },
    });
    setReadyNodeCache(bootstrapService, [
      createNodeEvent('node-2', LEASE_VALID_MS).data,
    ]);

    const reasons = [];
    bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
      reasons.push(reason);
    };

    const event = createNodeEvent('node-2', LEASE_VALID_MS, STATE.DISCONNECTED);
    const previousRow = createPreviousNodeRow('node-2', LEASE_EXPIRED_MS);
    const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      previousRow,
    );
    const duplicateScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      previousRow,
    );

    t.equal(firstScheduled, true, 'first ready transition should schedule rebalance');
    t.equal(duplicateScheduled, false, 'duplicate node-ready events should be deduped');

    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));

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
        nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
      },
    });

    let triggerCount = 0;
    bootstrapService.triggerRebalancingOnAllPartitions = () => {
      triggerCount++;
    };

    const expiredLease = createNodeEvent('node-3', LEASE_EXPIRED_MS, STATE.DISCONNECTED);
    const alreadyReady = createNodeEvent('node-4', LEASE_VALID_MS, STATE.DISCONNECTED);

    const scheduledExpired = bootstrapService.handleNodeReadyRebalanceTrigger(
      expiredLease,
      createPreviousNodeRow('node-3', LEASE_EXPIRED_MS),
    );
    const scheduledAlreadyReady = bootstrapService.handleNodeReadyRebalanceTrigger(
      alreadyReady,
      createPreviousNodeRow('node-4', LEASE_VALID_MS),
    );

    t.equal(scheduledExpired, false, 'should not schedule with expired ready lease');
    t.equal(scheduledAlreadyReady, false, 'should not schedule without a state transition');

    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));

    t.equal(triggerCount, 0, 'invalid transitions should not trigger rebalancing');
  });

  await t.test(
    'accepts delayed ready CDC rows that were ready when written',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });
      const now = Date.now();
      setReadyNodeCache(bootstrapService, [{
        node_id: 'node-delayed-ready',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.DISCONNECTED,
        last_heartbeat: now,
        ready_lease_expires_at: now + LEASE_VALID_MS,
      }]);

      const reasons = [];
      bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
        reasons.push(reason);
      };

      const delayedReadyEvent = {
        data: {
          node_id: 'node-delayed-ready',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.DISCONNECTED,
          last_heartbeat: now - 60000,
          ready_lease_expires_at: now - 30000,
        },
      };
      const previousRow = createPreviousNodeRow(
        'node-delayed-ready',
        LEASE_EXPIRED_MS,
      );
      previousRow.last_heartbeat = now - 120000;
      previousRow.ready_lease_expires_at = now - 121000;

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        delayedReadyEvent,
        previousRow,
      );
      t.equal(
        scheduled,
        true,
        'delayed ready row should still schedule rebalance when it was ready at write time',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'delayed ready row should eventually trigger one rebalance',
      );
    },
  );

  await t.test(
    'logs no-transition skip at debug level to avoid default log noise',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });

      const infoLogs = [];
      const debugLogs = [];
      bootstrapService.logger = {
        info(message, context) {
          infoLogs.push({message, context});
        },
        debug(message, context) {
          debugLogs.push({message, context});
        },
        warn() {},
        error() {},
      };

      const event = createNodeEvent('node-8', LEASE_VALID_MS, STATE.DISCONNECTED);
      const previousRow = createPreviousNodeRow('node-8', LEASE_VALID_MS);
      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        event,
        previousRow,
      );

      t.equal(scheduled, false, 'already-ready nodes should not schedule rebalance');
      t.ok(
        debugLogs.some((entry) =>
          entry.message ===
            'Skipping node-ready rebalance trigger: no not-ready to ready transition'),
        'should emit no-transition diagnostic at debug level',
      );
      t.equal(
        infoLogs.some((entry) =>
          entry.message ===
            'Skipping node-ready rebalance trigger: no not-ready to ready transition'),
        false,
        'no-transition skip should not be emitted at info level',
      );
    },
  );

  await t.test(
    'treats delayed ready-lease refresh from a prior heartbeat as no transition',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });

      const infoLogs = [];
      const debugLogs = [];
      bootstrapService.logger = {
        info(message, context) {
          infoLogs.push({message, context});
        },
        debug(message, context) {
          debugLogs.push({message, context});
        },
        warn() {},
        error() {},
      };

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        {
          data: {
            ...createNodeEvent('node-refresh', LEASE_VALID_MS, STATE.DISCONNECTED).data,
            last_heartbeat: Date.now(),
          },
        },
        createPreviousReadyHeartbeatRow('node-refresh'),
      );

      t.equal(
        scheduled,
        false,
        'delayed lease refresh should not retrigger node_ready rebalancing',
      );
      t.ok(
        debugLogs.some((entry) =>
          entry.message ===
            'Skipping node-ready rebalance trigger: no not-ready to ready transition'),
        'delayed lease refresh should be classified as a no-transition skip',
      );
      t.equal(
        infoLogs.some((entry) =>
          entry.message === 'Scheduling node-ready rebalance trigger'),
        false,
        'delayed lease refresh should not schedule a rebalance timer',
      );
    },
  );

  await t.test(
    'schedules rebalance when UPDATE payload omits node_id but previous row has identity',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });
      setReadyNodeCache(bootstrapService, [
        createNodeEvent('node-6', LEASE_VALID_MS).data,
      ]);

      const reasons = [];
      bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
        reasons.push(reason);
      };

      const eventWithoutNodeId = {
        data: {
          status: SERVICE_STATUS.ACTIVE,
          ready_lease_expires_at: Date.now() + LEASE_VALID_MS,
        },
      };
      const previousRow = createPreviousNodeRow('node-6', LEASE_EXPIRED_MS);

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        eventWithoutNodeId,
        previousRow,
      );
      t.equal(
        scheduled,
        true,
        'should schedule when previous row carries node identity and transitions to ready',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'node_id fallback from previous row should still trigger node_ready rebalance',
      );
    },
  );

  await t.test(
    'waits for cache-visible readiness before firing node-ready rebalance trigger',
    async (t) => {
      const nodeId = 'node-7';
      const readyNodeRow = createNodeEvent(nodeId, LEASE_VALID_MS).data;
      let cacheReady = false;

      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
          leadershipWaitTimeoutMs: CACHE_READY_TIMEOUT_MS,
          leadershipWaitInitialDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitMaxDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitBackoffMultiplier: CACHE_WAIT_DELAY_MS,
        },
      });
      bootstrapService.systemTableCache = {
        get: (_tableName, lookupNodeId) => {
          if (lookupNodeId !== nodeId) {
            return null;
          }
          return cacheReady ? readyNodeRow : createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS);
        },
      };

      let triggerCount = 0;
      bootstrapService.triggerRebalancingOnAllPartitions = () => {
        triggerCount++;
      };

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(scheduled, true, 'should schedule node-ready rebalance trigger');

      await new Promise((resolve) => setTimeout(resolve, CACHE_GATE_WAIT_MS));
      t.equal(triggerCount, 0, 'rebalance should wait while cache row is not ready');

      cacheReady = true;
      await new Promise((resolve) => setTimeout(resolve, CACHE_BECOMES_READY_MS));
      t.equal(triggerCount, 1, 'rebalance should fire after cache row becomes ready');
    },
  );

  await t.test(
    'retries node-ready rebalance scheduling after cache-gated timeout on a later ready update',
    async (t) => {
      const nodeId = 'node-retry';
      const readyNodeRow = createNodeEvent(nodeId, LEASE_VALID_MS).data;
      let cacheReady = false;

      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
          leadershipWaitTimeoutMs: CACHE_WAIT_TIMEOUT_MS,
          leadershipWaitInitialDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitMaxDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitBackoffMultiplier: CACHE_WAIT_DELAY_MS,
        },
      });
      bootstrapService.systemTableCache = {
        get: (_tableName, lookupNodeId) => {
          if (lookupNodeId !== nodeId) {
            return null;
          }
          return cacheReady ? readyNodeRow : createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS);
        },
      };

      let triggerCount = 0;
      bootstrapService.triggerRebalancingOnAllPartitions = () => {
        triggerCount++;
      };

      const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(firstScheduled, true, 'initial not-ready to ready transition should schedule');

      await new Promise((resolve) => setTimeout(resolve, CACHE_GATE_WAIT_MS));
      t.equal(triggerCount, 0, 'initial trigger should not fire before cache becomes ready');

      cacheReady = true;
      const retryScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_VALID_MS),
      );
      t.equal(
        retryScheduled,
        true,
        'ready update should reschedule after prior cache-gated timeout',
      );

      await new Promise((resolve) => setTimeout(resolve, CACHE_BECOMES_READY_MS));
      t.equal(triggerCount, 1, 'retry should trigger node-ready rebalance once');
    },
  );

  await t.test('cleanup cancels pending node-ready rebalance timers', async (t) => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'localhost:8080',
      config: {
        nodeReadyRebalanceDelayMs: CLEANUP_TIMER_DELAY_MS,
      },
    });
    setReadyNodeCache(bootstrapService, [
      createNodeEvent('node-5', LEASE_VALID_MS).data,
    ]);

    let triggerCount = 0;
    bootstrapService.triggerRebalancingOnAllPartitions = () => {
      triggerCount++;
    };

    const event = createNodeEvent('node-5', LEASE_VALID_MS, STATE.DISCONNECTED);
    const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
      event,
      createPreviousNodeRow('node-5', LEASE_EXPIRED_MS),
    );
    t.equal(scheduled, true, 'should schedule trigger before cleanup');

    bootstrapService.clearNodeReadyRebalanceState();

    await new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT_MS));
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

  await t.test(
    'does not reschedule node-ready rebalance after transient lease flap',
    async (t) => {
      const nodeId = 'node-flap';
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });
      setReadyNodeCache(bootstrapService, [
        createNodeEvent(nodeId, LEASE_VALID_MS).data,
      ]);

      const reasons = [];
      bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
        reasons.push(reason);
      };

      const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(firstScheduled, true, 'first not-ready to ready transition should schedule');

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'first transition should trigger exactly one rebalance',
      );

      const transientNotReadyScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_EXPIRED_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_VALID_MS),
      );
      t.equal(
        transientNotReadyScheduled,
        false,
        'not-ready update should not schedule a rebalance',
      );

      const secondReadyScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(
        secondReadyScheduled,
        false,
        'dedupe should prevent repeated node_ready trigger after lease flap',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.equal(
        reasons.length,
        1,
        'lease flap should not create additional node_ready rebalance triggers',
      );
    },
  );

  await t.test(
    'ignores stale not-ready regressions while a newer ready trigger is pending',
    async (t) => {
      const nodeId = 'node-stale-regression';
      const now = Date.now();
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });
      setReadyNodeCache(bootstrapService, [
        {
          node_id: nodeId,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.DISCONNECTED,
          last_heartbeat: now,
          ready_lease_expires_at: now + LEASE_VALID_MS,
        },
      ]);

      const reasons = [];
      bootstrapService.triggerRebalancingOnAllPartitions = (reason) => {
        reasons.push(reason);
      };

      const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        {
          data: {
            node_id: nodeId,
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.DISCONNECTED,
            last_heartbeat: now,
            ready_lease_expires_at: now + LEASE_VALID_MS,
          },
        },
        {
          node_id: nodeId,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.DISCONNECTED,
          last_heartbeat: now - 5000,
          ready_lease_expires_at: now - 6000,
        },
      );
      t.equal(firstScheduled, true, 'fresh ready transition should schedule');

      const staleRegressionScheduled =
        bootstrapService.handleNodeReadyRebalanceTrigger(
          {
            data: {
              node_id: nodeId,
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.DISCONNECTED,
              last_heartbeat: now - 10000,
              ready_lease_expires_at: now - 5000,
            },
          },
          {
            node_id: nodeId,
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.DISCONNECTED,
            last_heartbeat: now,
            ready_lease_expires_at: now + LEASE_VALID_MS,
          },
        );
      t.equal(
        staleRegressionScheduled,
        false,
        'stale regression should be ignored instead of clearing the pending trigger',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'stale regression should not cancel the pending rebalance trigger',
      );
    },
  );

  await t.test(
    'waitForReadyNodeInCache should not require connection_state readiness',
    async (t) => {
      const nodeId = 'node-ready';
      const nodeRow = {
        node_id: nodeId,
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.DISCONNECTED,
        ready_lease_expires_at: Date.now() + LEASE_VALID_MS,
      };

      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          leadershipWaitTimeoutMs: CACHE_WAIT_TIMEOUT_MS,
          leadershipWaitInitialDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitMaxDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitBackoffMultiplier: CACHE_WAIT_DELAY_MS,
        },
      });
      bootstrapService.systemTableCache = {
        get: (_tableName, lookupNodeId) => {
          return lookupNodeId === nodeId ? nodeRow : null;
        },
      };

      await bootstrapService.waitForReadyNodeInCache(nodeId);
      t.pass('cache waiter should use lease-based readiness without transport coupling');
    },
  );

  await t.test(
    'waitForReadyNodeInCache repairs propagated cache tables before timing out',
    async (t) => {
      const nodeId = 'node-repaired';
      const nodeRow = {
        node_id: nodeId,
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.DISCONNECTED,
        ready_lease_expires_at: Date.now() + LEASE_VALID_MS,
      };
      const rowsByNodeId = new Map();
      let repairCount = 0;

      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          leadershipWaitTimeoutMs: CACHE_WAIT_TIMEOUT_MS,
          leadershipWaitInitialDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitMaxDelayMs: CACHE_WAIT_DELAY_MS,
          leadershipWaitBackoffMultiplier: CACHE_WAIT_DELAY_MS,
        },
      });
      bootstrapService.systemTableCache = {
        get: (_tableName, lookupNodeId) => {
          const row = rowsByNodeId.get(lookupNodeId);
          return row ? {...row} : null;
        },
      };
      bootstrapService.getLeaderMessageGroupService = () => ({
        applyCDCEvent: async () => {},
      });
      bootstrapService.hydrateFromLocalPartitions = async () => {
        repairCount++;
        rowsByNodeId.set(nodeId, {...nodeRow});
        return {
          success: true,
          tables: {
            nodes: {success: true, rowCount: 1},
          },
          errors: [],
        };
      };

      await bootstrapService.waitForReadyNodeInCache(nodeId);
      t.equal(repairCount, 1,
        'cache waiter should repair propagated tables once before failing');
    },
  );
});
