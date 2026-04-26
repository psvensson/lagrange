import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_REBALANCE_REASON,
} from '../../src/bootstrap/bootstrap-constants.js';
import {SERVICE_STATUS, STATE, TABLES} from '../../src/constants/index.js';

const NODE_READY_REBALANCE_DELAY_MS = 5;
const WAIT_FOR_TIMER_FLUSH_MS = 20;
const CLEANUP_TIMER_DELAY_MS = 25;
const CLEANUP_WAIT_MS = 40;
const LEASE_VALID_MS = 1000;
const LEASE_EXPIRED_MS = -1000;

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
  await t.test(
    'limits node_ready rebalance fanout to convergence-critical leader partitions',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
      });

      const triggered = [];
      const createPartition = (partitionId, tableName, isLeader = true) => ({
        partitionId,
        tableName,
        isLeader,
        triggerRebalanceCheck(reason) {
          triggered.push({partitionId, reason});
        },
      });

      bootstrapService.partitionServices = new Map([
        ['nodes', createPartition('nodes-p1', TABLES.NODES)],
        [
          'control-plane-publications',
          createPartition(
            'control_plane_publications-p1',
            TABLES.CONTROL_PLANE_PUBLICATIONS,
          ),
        ],
        [
          'replica-ops',
          createPartition('replica_operations-p1', null),
        ],
        [
          'svc-defs',
          createPartition(
            'service_definitions-p1',
            TABLES.SERVICE_DEFINITIONS,
          ),
        ],
        ['logs', createPartition('logs-p1', TABLES.LOGS)],
        ['orders', createPartition('orders-p1', 'orders')],
        [
          'service-endpoints-follower',
          createPartition(
            'service_endpoints-p1',
            TABLES.SERVICE_ENDPOINTS,
            false,
          ),
        ],
      ]);

      bootstrapService.triggerRebalancingOnAllPartitions(
        BOOTSTRAP_REBALANCE_REASON.NODE_READY,
      );

      t.same(
        triggered,
        [
          {
            partitionId: 'nodes-p1',
            reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          },
          {
            partitionId: 'control_plane_publications-p1',
            reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          },
          {
            partitionId: 'replica_operations-p1',
            reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          },
          {
            partitionId: 'service_definitions-p1',
            reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          },
        ],
        'node_ready should only fan out to convergence-critical leader partitions',
      );
    },
  );

  await t.test(
    'keeps non-node_ready rebalance fanout on all leader partitions',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
      });

      const triggered = [];
      const createPartition = (partitionId, tableName, isLeader = true) => ({
        partitionId,
        tableName,
        isLeader,
        triggerRebalanceCheck(reason) {
          triggered.push({partitionId, reason});
        },
      });

      bootstrapService.partitionServices = new Map([
        ['nodes', createPartition('nodes-p1', TABLES.NODES)],
        ['logs', createPartition('logs-p1', TABLES.LOGS)],
        ['orders', createPartition('orders-p1', 'orders')],
        [
          'services-follower',
          createPartition('services-p1', TABLES.SERVICES, false),
        ],
      ]);

      bootstrapService.triggerRebalancingOnAllPartitions('periodic');

      t.same(
        triggered,
        [
          {partitionId: 'nodes-p1', reason: 'periodic'},
          {partitionId: 'logs-p1', reason: 'periodic'},
          {partitionId: 'orders-p1', reason: 'periodic'},
        ],
        'non-node_ready triggers should still fan out to every leader partition',
      );
    },
  );

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
    'ignores local node ready transitions because self-readiness is runtime-owned',
    async (t) => {
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

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent('seed-node', LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow('seed-node', LEASE_EXPIRED_MS),
      );
      t.equal(
        scheduled,
        false,
        'local seed readiness should not schedule bootstrap-wide node_ready fanout',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.equal(triggerCount, 0, 'local readiness should not trigger rebalancing');
    },
  );

  await t.test(
    'ignores remote node ready transitions after bootstrap hands off to runtime ownership',
    async (t) => {
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });
      bootstrapService.phase = BOOTSTRAP_PHASE.COMPLETE;

      let triggerCount = 0;
      bootstrapService.triggerRebalancingOnAllPartitions = () => {
        triggerCount++;
      };

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent('joiner-node', LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow('joiner-node', LEASE_EXPIRED_MS),
      );
      t.equal(
        scheduled,
        false,
        'bootstrap-owned node_ready fanout should stop once bootstrap is complete',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.equal(
        triggerCount,
        0,
        'runtime-owned readiness refreshes should not trigger bootstrap-wide rebalancing',
      );
    },
  );

  await t.test(
    'fails closed for delayed ready CDC rows that are no longer ready at decision time',
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
        false,
        'delayed ready row should not schedule rebalance from write-time readiness alone',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [],
        'delayed ready row should not trigger rebalance after the delay window',
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
    'treats delayed ready-lease refresh from an expired prior row as a fresh transition',
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
        true,
        'delayed lease refresh should schedule rebalancing when the prior row is no longer ready',
      );
      t.equal(
        infoLogs.some((entry) =>
          entry.message === 'Scheduling node-ready rebalance trigger'),
        true,
        'delayed lease refresh should schedule a rebalance timer when it restores current readiness',
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
    'does not wait for cache-visible readiness before firing node-ready rebalance trigger',
    async (t) => {
      const nodeId = 'node-7';

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

      const scheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(scheduled, true, 'should schedule node-ready rebalance trigger');

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.equal(triggerCount, 1, 'rebalance should fire without waiting for cache-visible readiness');
    },
  );

  await t.test(
    'does not depend on cache-gated retry state for later ready updates',
    async (t) => {
      const nodeId = 'node-retry';

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

      const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(firstScheduled, true, 'initial not-ready to ready transition should schedule');

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.equal(triggerCount, 1, 'initial trigger should fire without cache gating');

      const retryScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_VALID_MS),
      );
      t.equal(
        retryScheduled,
        false,
        'later ready updates should not rely on cache-gated retry state once the first trigger already fired',
      );
      t.equal(triggerCount, 1, 'later ready updates should not create another rebalance trigger');
    },
  );

  await t.test(
    'uses locally observed readiness to suppress stale cache replay of later ready heartbeats',
    async (t) => {
      const nodeId = 'node-local-observed-ready';
      const now = Date.now();
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });

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
      t.equal(firstScheduled, true, 'first ready transition should still schedule');

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'first ready transition should trigger one node_ready rebalance',
      );

      const replayScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        {
          data: {
            node_id: nodeId,
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.DISCONNECTED,
            last_heartbeat: now + 100,
            ready_lease_expires_at: now + LEASE_VALID_MS + 100,
          },
        },
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(
        replayScheduled,
        false,
        'stale cache evidence should not turn a later ready heartbeat into a fresh transition',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'locally observed readiness should prevent duplicate node_ready fanout',
      );
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
    'dedupes duplicate ready transitions while the timer is still pending',
    async (t) => {
      const nodeId = 'node-pending-dedupe';
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: CLEANUP_TIMER_DELAY_MS,
        },
      });

      let triggerCount = 0;
      bootstrapService.triggerRebalancingOnAllPartitions = () => {
        triggerCount++;
      };

      const firstScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(firstScheduled, true, 'first ready transition should schedule');

      const secondScheduled = bootstrapService.handleNodeReadyRebalanceTrigger(
        createNodeEvent(nodeId, LEASE_VALID_MS, STATE.DISCONNECTED),
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
      );
      t.equal(
        secondScheduled,
        false,
        'duplicate ready transitions should stay deduped until the pending timer fires',
      );

      await new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT_MS));
      t.equal(triggerCount, 1, 'pending dedupe should still produce one trigger');
    },
  );

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
        true,
        'a later real ready restoration should schedule again after the previous trigger fired',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [
          BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          BOOTSTRAP_REBALANCE_REASON.NODE_READY,
        ],
        'lease flap should create a second node_ready trigger once the prior one completed',
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
    'ignores stale not-ready replay even when cached previous row is older than local observation',
    async (t) => {
      const nodeId = 'node-local-observed-stale-regression';
      const now = Date.now();
      const bootstrapService = new BootstrapService({
        nodeId: 'seed-node',
        nodeAddress: 'localhost:8080',
        config: {
          nodeReadyRebalanceDelayMs: NODE_READY_REBALANCE_DELAY_MS,
        },
      });

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
        createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
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
          createPreviousNodeRow(nodeId, LEASE_EXPIRED_MS),
        );
      t.equal(
        staleRegressionScheduled,
        false,
        'local heartbeat watermark should reject stale not-ready replay',
      );

      await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TIMER_FLUSH_MS));
      t.same(
        reasons,
        [BOOTSTRAP_REBALANCE_REASON.NODE_READY],
        'stale replay should not cancel or duplicate the pending rebalance trigger',
      );
    },
  );
});
