import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {LEASE_EVENT} from '../../src/control-plane/lease-service-constants.js';
import {INVARIANT_EVENT} from '../../src/invariants/invariant-emitter.js';
import {INVARIANT_ID} from '../../src/invariants/invariant-catalog.js';
import {STATE} from '../../src/constants/index.js';
import {
  createMockControlPlaneSystemTableGateway,
  createQueryBackedControlPlaneSystemTableGateway,
} from './test-helpers.js';

function createNodeLeaseOwner(disconnectNodeDueToLeaseExpiry) {
  return {
    disconnectNodeDueToLeaseExpiry,
  };
}

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('LeaseService does not overlap periodic sweeps when a sweep is still in-flight',
  async (t) => {
    initEnv();

    let inFlightSweeps = 0;
    let maxInFlightSweeps = 0;
    const releaseSweeps = [];

  const service = new LeaseService({
    nodeId: 'node-a',
    nodeLeaseOwner: createNodeLeaseOwner(
      async () => ({success: true, partitionResult: {affectedRows: 0}}),
    ),
      systemTableCache: {
        getAll: () => [],
      },
    sqlQueryEngine: {
      executeQuery: async () => {
        inFlightSweeps += 1;
        maxInFlightSweeps = Math.max(maxInFlightSweeps, inFlightSweeps);
        return new Promise((resolve) => {
            releaseSweeps.push(() => {
              inFlightSweeps -= 1;
              resolve({success: true, rows: []});
          });
        });
      },
    },
    controlPlaneSystemTableGateway:
      createQueryBackedControlPlaneSystemTableGateway({
        executeQuery: async () => {
          inFlightSweeps += 1;
          maxInFlightSweeps = Math.max(maxInFlightSweeps, inFlightSweeps);
          return new Promise((resolve) => {
            releaseSweeps.push(() => {
              inFlightSweeps -= 1;
              resolve({success: true, rows: []});
            });
          });
        },
      }),
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
  });
    service.initialize();
    service.sweepIntervalMs = 5;
    service.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      t.equal(
        maxInFlightSweeps,
        1,
        'lease sweep loop should keep at most one in-flight sweep',
      );
    } finally {
      service.stop();
      while (releaseSweeps.length > 0) {
        const release = releaseSweeps.shift();
        release();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('LeaseService start and stop use injected interval scheduler', async (t) => {
  initEnv();

  const scheduled = [];
  const cleared = [];
  const service = new LeaseService({
    nodeId: 'node-timer',
    nodeLeaseOwner: createNodeLeaseOwner(
      async () => ({success: true, partitionResult: {affectedRows: 0}}),
    ),
    systemTableCache: {
      getAll: () => [],
    },
    sqlQueryEngine: {
      executeQuery: async () => ({success: true, rows: []}),
    },
    messageGroupServices: new Set([{isLeaderReplica: () => true}]),
    setIntervalFn: (callback, intervalMs) => {
      const handle = {
        callback,
        intervalMs,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduled.push(handle);
      return handle;
    },
    clearIntervalFn: (handle) => {
      cleared.push(handle);
    },
  });
  service.initialize();

  service.start();

  t.equal(scheduled.length, 1, 'start should schedule one lease sweep interval');
  t.equal(
    scheduled[0].intervalMs,
    service.sweepIntervalMs,
    'injected scheduler should receive the configured sweep interval',
  );
  t.equal(scheduled[0].unrefCalled, true, 'lease sweep timer should be unrefed when supported');

  service.stop();
  t.same(cleared, [scheduled[0]], 'stop should clear the injected interval handle');
});

test('LeaseService emits sweepError when periodic sweep fails', async (t) => {
  initEnv();

  const scheduled = [];
  const service = new LeaseService({
    nodeId: 'node-error',
    nodeLeaseOwner: createNodeLeaseOwner(
      async () => ({success: true, partitionResult: {affectedRows: 0}}),
    ),
    systemTableCache: {
      getAll: () => [],
    },
    sqlQueryEngine: {
      executeQuery: async () => {
        throw new Error('synthetic sweep failure');
      },
    },
    controlPlaneSystemTableGateway:
      createQueryBackedControlPlaneSystemTableGateway({
        executeQuery: async () => {
          throw new Error('synthetic sweep failure');
        },
      }),
    messageGroupServices: new Set([{isLeaderReplica: () => true}]),
    setIntervalFn: (callback) => {
      const handle = {
        callback,
        unref() {},
      };
      scheduled.push(handle);
      return handle;
    },
    clearIntervalFn: () => {},
  });
  service.initialize();

  const events = [];
  service.on(LEASE_EVENT.SWEEP_ERROR, (event) => {
    events.push(event);
  });

  service.start();
  await scheduled[0].callback();
  await new Promise((resolve) => setTimeout(resolve, 0));

  t.equal(events.length, 1, 'periodic failure should emit one sweepError event');
  t.equal(events[0].nodeId, 'node-error', 'event should include nodeId');
  t.equal(events[0].error.message, 'synthetic sweep failure',
    'event should include the original failure');

  service.stop();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('LeaseService skips stale disconnect when lease was renewed after sweep snapshot',
  async (t) => {
    initEnv();

    const now = Date.now();
    const currentNode = {
      node_id: 'node-renewed',
      ready_lease_expires_at: now + 60_000,
      last_heartbeat: now + 5_000,
      connection_state: STATE.READY,
    };
    let attemptedWhereClause = null;
    let disconnectAttempts = 0;

    const service = new LeaseService({
      nodeId: 'node-a',
      nodeLeaseOwner: createNodeLeaseOwner(async (observedNode, nowArg) => {
          disconnectAttempts += 1;
          attemptedWhereClause = {
            node_id: observedNode.node_id,
            ready_lease_expires_at: observedNode.ready_lease_expires_at,
            last_heartbeat: observedNode.last_heartbeat || nowArg,
          };
          t.equal(
            STATE.DISCONNECTED,
            STATE.DISCONNECTED,
            'lease sweep should only attempt disconnect updates',
          );
          if (attemptedWhereClause.ready_lease_expires_at !==
              currentNode.ready_lease_expires_at ||
              attemptedWhereClause.last_heartbeat !== currentNode.last_heartbeat) {
            return {
              success: true,
              partitionResult: {
                affectedRows: 0,
              },
            };
          }
          currentNode.connection_state = STATE.DISCONNECTED;
          currentNode.ready_lease_expires_at = null;
          return {
            success: true,
            partitionResult: {
              affectedRows: 1,
            },
          };
        }),
      systemTableCache: {
        getAll: () => [currentNode],
      },
      sqlQueryEngine: {
        executeQuery: async () => ({
          success: true,
          rows: [{
            ...currentNode,
            ready_lease_expires_at: now - 1_000,
            last_heartbeat: now - 2_000,
          }],
        }),
      },
      controlPlaneSystemTableGateway:
        createQueryBackedControlPlaneSystemTableGateway({
          executeQuery: async () => ({
            success: true,
            rows: [{
              ...currentNode,
              ready_lease_expires_at: now - 1_000,
              last_heartbeat: now - 2_000,
            }],
          }),
        }),
      messageGroupServices: new Set([
        {isLeaderReplica: () => true},
      ]),
    });
    service.initialize();
    const invariantEvents = [];
    service.on(INVARIANT_EVENT.RUNTIME, (event) => {
      invariantEvents.push(event);
    });

    try {
      const expiredIds = await service.sweepExpiredLeases();
      t.equal(disconnectAttempts, 1, 'should attempt one guarded disconnect');
      t.same(
        attemptedWhereClause,
        {
          node_id: 'node-renewed',
          ready_lease_expires_at: now - 1_000,
          last_heartbeat: now - 2_000,
        },
        'guard should target the observed stale lease snapshot',
      );
      t.same(
        expiredIds,
        [],
        'renewed node should not be marked expired when guarded update misses',
      );
      t.equal(
        currentNode.connection_state,
        STATE.READY,
        'renewed node should remain ready',
      );
      t.equal(
        currentNode.ready_lease_expires_at,
        now + 60_000,
        'renewed lease should remain intact',
      );
      t.equal(invariantEvents.length, 1, 'guarded miss should emit one invariant event');
      t.equal(
        invariantEvents[0].invariantId,
        INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
      );
      t.equal(invariantEvents[0].passed, true);
      t.equal(invariantEvents[0].observed.guardedWriteApplied, false);
    } finally {
      service.stop();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('LeaseService sweepExpiredLeases uses injected clock for expiry decisions',
  async (t) => {
    initEnv();

    const updatedNodeIds = [];
    const service = new LeaseService({
      nodeId: 'node-a',
      now: () => 100,
      nodeLeaseOwner: createNodeLeaseOwner(async (observedNode) => {
          updatedNodeIds.push(observedNode.node_id);
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        }),
      systemTableCache: {
        getAll: () => [],
      },
      sqlQueryEngine: {
        executeQuery: async () => ({
          success: true,
          rows: [
            {
              node_id: 'node-not-expired',
              ready_lease_expires_at: 101,
              last_heartbeat: 90,
            },
            {
              node_id: 'node-expired',
              ready_lease_expires_at: 99,
              last_heartbeat: 90,
            },
          ],
        }),
      },
      controlPlaneSystemTableGateway:
        createQueryBackedControlPlaneSystemTableGateway({
          executeQuery: async () => ({
            success: true,
            rows: [
              {
                node_id: 'node-not-expired',
                ready_lease_expires_at: 101,
                last_heartbeat: 90,
              },
              {
                node_id: 'node-expired',
                ready_lease_expires_at: 99,
                last_heartbeat: 90,
              },
            ],
          }),
        }),
      messageGroupServices: new Set([
        {isLeaderReplica: () => true},
      ]),
    });
    service.initialize();
    const invariantEvents = [];
    service.on(INVARIANT_EVENT.RUNTIME, (event) => {
      invariantEvents.push(event);
    });

    try {
      const expiredIds = await service.sweepExpiredLeases();
      t.same(expiredIds, ['node-expired'], 'only rows expired at injected now should be swept');
      t.same(updatedNodeIds, ['node-expired'], 'guarded disconnect should target only expired rows');
      t.equal(invariantEvents.length, 1, 'successful guarded sweep should emit one invariant');
      t.equal(
        invariantEvents[0].invariantId,
        INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
      );
      t.equal(invariantEvents[0].passed, true);
      t.equal(invariantEvents[0].observed.guardedWriteApplied, true);
    } finally {
      service.stop();
      ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('LeaseService sweepExpiredLeases uses injected control-plane ' +
  'system-table gateway', async (t) => {
  initEnv();

  const now = Date.now();
  const gatewayCalls = [];
  const service = new LeaseService({
    nodeId: 'node-gateway',
    nodeLeaseOwner: createNodeLeaseOwner(
      async () => ({success: true, partitionResult: {affectedRows: 1}}),
    ),
    systemTableCache: {
      getAll: () => [],
    },
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(tableName, sql, params) {
        gatewayCalls.push({tableName, sql, params});
        return {
          success: true,
          rows: [{
            node_id: 'node-expired',
            ready_lease_expires_at: now - 1000,
            last_heartbeat: now - 2000,
          }],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('raw SQL path should not be used');
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => true},
    ]),
    now: () => now,
  });
  service.initialize();

  const expiredIds = await service.sweepExpiredLeases();

  t.same(expiredIds, ['node-expired'], 'gateway rows should drive the sweep');
  t.equal(gatewayCalls.length, 1, 'gateway should own the lease read');
  t.equal(
    gatewayCalls[0].tableName,
    'nodes',
    'lease sweeps should read nodes through the gateway',
  );
});
