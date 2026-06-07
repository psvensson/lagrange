/**
 * Admin CDC Propagation Integration Test.
 * Tests that CDC events propagate to AdminWebSocketAPI when system cache is updated.
 *
 * This test verifies the CDC event flow mechanism that enables real-time updates
 * to admin clients when system tables are modified.
 *
 * Requirements: 32.1, 32.2, 32.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';

// Use random ports to avoid conflicts between test runs
function getRandomPort() {
  return 30000 + Math.floor(Math.random() * 20000);
}

/**
 * Initialize test environment with fast Raft elections.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
    },
    rebalancer: {
      periodicCheckIntervalMs: 1000,
      periodicCheckJitterMs: 100,
      stabilizationPeriodMs: 1000,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
async function cleanupTestEnvironment() {
  try {
    await NodeService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore
  }
  try {
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore
  }
  try {
    await LoggingService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore
  }
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

test('Admin CDC propagation', async (t) => {
  t.teardown(() => {
    if (process.env.TAP === '1') {
      setTimeout(() => {
        if (!process.exitCode || process.exitCode === 0) {
          process.exit(0);
        }
      }, 1000);
    }
  });

  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('AdminWebSocketAPI receives CDC events when cache is updated', async (t) => {
    // =========================================================================
    // This test verifies that AdminWebSocketAPI receives CDC notifications
    // when the system cache is updated. This is the core CDC propagation
    // mechanism that enables real-time updates to admin clients.
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440020';
    const seedWsPort = getRandomPort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://127.0.0.1:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 500,
        leadershipWaitInitialDelayMs: 5,
        leadershipWaitMaxDelayMs: 25,
        replicaStaggerDelayMs: 10,
      },
    });

    let bootstrapResult;
    let adminApi;

    // Track CDC events received by AdminWebSocketAPI
    const cdcEventsReceived = [];

    try {
      // Bootstrap seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Get system table cache from NodeService singleton
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cacheId = systemTableCache._cacheId;
      t.ok(cacheId, 'cache should have an ID for tracking');

      // Create AdminWebSocketAPI with the same cache
      adminApi = new AdminWebSocketAPI({
        nodeId: seedNodeId,
        systemTableCache: systemTableCache,
      });

      // Hook into broadcastCDCEvent to track CDC events
      const originalBroadcast = adminApi.broadcastCDCEvent.bind(adminApi);
      adminApi.broadcastCDCEvent = (tableName, operation, record) => {
        cdcEventsReceived.push({tableName, operation, record, timestamp: Date.now()});
        return originalBroadcast(tableName, operation, record);
      };

      await adminApi.initialize(0, {listen: false});
      t.ok(adminApi.isInitialized(), 'AdminWebSocketAPI should be initialized');

      // Verify AdminWebSocketAPI is using the same cache
      const adminCacheId = adminApi.systemTableCache._cacheId;
      t.equal(adminCacheId, cacheId, 'AdminWebSocketAPI should use same cache as bootstrap');

      // Verify cache has listeners registered
      const listenerCount = systemTableCache.listeners.size;
      t.ok(listenerCount > 0, `Cache should have listeners, got ${listenerCount}`);

      // Simulate a CDC event by directly updating the cache
      // This mimics what happens when a partition leader broadcasts a CDC event
      const testNodeId = '550e8400-e29b-41d4-a716-446655440099';
      const testNodeRecord = {
        node_id: testNodeId,
        node_address: 'ws://127.0.0.1:9999',
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      // Insert into cache (simulating CDC event from partition)
      systemTableCache.applySystemTableChange('nodes', 'INSERT', testNodeRecord);

      // Wait for setImmediate callbacks to execute (cache notifications are async)
      await new Promise((resolve) => setImmediate(resolve));

      // Verify CDC event was received by AdminWebSocketAPI
      const nodesCdcEvents = cdcEventsReceived.filter((e) => e.tableName === 'nodes');
      t.ok(nodesCdcEvents.length > 0, 'should receive CDC event for nodes table update');

      const testNodeEvent = nodesCdcEvents.find(
        (e) => e.record?.node_id === testNodeId,
      );
      t.ok(testNodeEvent, 'should receive CDC event for the specific test node');
      t.equal(testNodeEvent.operation, 'INSERT', 'operation should be INSERT');

      // Verify the node is in the cache
      const cachedNode = systemTableCache.get('nodes', testNodeId);
      t.ok(cachedNode, 'test node should be in cache');
      t.equal(cachedNode.node_id, testNodeId, 'cached node ID should match');
    } finally {
      if (adminApi) {
        await adminApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  await t.test('cache instance shared between MessageGroupService and AdminWebSocketAPI',
    async (t) => {
      // =======================================================================
      // This test verifies that the cache instance is truly shared
      // =======================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440030';
      const seedWsPort = getRandomPort();

      const bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://127.0.0.1:${seedWsPort}`,
        wsPort: seedWsPort,
        config: {
          leadershipWaitTimeoutMs: 500,
          leadershipWaitInitialDelayMs: 5,
          leadershipWaitMaxDelayMs: 25,
          replicaStaggerDelayMs: 10,
        },
      });

      let bootstrapResult;
      let adminApi;

      try {
        bootstrapResult = await bootstrapService.bootstrap();
        t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

        // Get cache from NodeService (like src/index.js does)
        const systemTableCache = NodeService.getInstance().getSystemTableCache();
        const cacheId = systemTableCache._cacheId;

        // Get cache from first message group service
        let messageGroupCache = null;
        let messageGroupCacheId = null;
        for (const mgService of bootstrapResult.messageGroupServices.values()) {
          messageGroupCache = mgService.systemTableCache;
          messageGroupCacheId = messageGroupCache._cacheId;
          break;
        }

        t.ok(messageGroupCache, 'message group should have cache');
        t.equal(
          messageGroupCacheId,
          cacheId,
          'MessageGroupService should use same cache as NodeService',
        );

        // Create AdminWebSocketAPI with the same cache
        adminApi = new AdminWebSocketAPI({
          nodeId: seedNodeId,
          systemTableCache: systemTableCache,
        });

        const adminCacheId = adminApi.systemTableCache._cacheId;
        t.equal(
          adminCacheId,
          cacheId,
          'AdminWebSocketAPI should use same cache as NodeService',
        );

        // Verify all three are the exact same object
        t.equal(
          systemTableCache,
          messageGroupCache,
          'NodeService and MessageGroupService should share exact same cache object',
        );
        t.equal(
          systemTableCache,
          adminApi.systemTableCache,
          'NodeService and AdminWebSocketAPI should share exact same cache object',
        );
      } finally {
        if (adminApi) {
          await adminApi.shutdown().catch(() => {});
        }
        if (bootstrapService) {
          await bootstrapService.shutdown().catch(() => {});
        }
      }
    });

  await t.test('CDC events propagate for INSERT, UPDATE, and DELETE operations', async (t) => {
    // =========================================================================
    // This test verifies that all CDC operation types are properly propagated
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440040';
    const seedWsPort = getRandomPort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://127.0.0.1:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 500,
        leadershipWaitInitialDelayMs: 5,
        leadershipWaitMaxDelayMs: 25,
        replicaStaggerDelayMs: 10,
      },
    });

    let bootstrapResult;
    let adminApi;
    const cdcEventsReceived = [];

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      // Create AdminWebSocketAPI
      adminApi = new AdminWebSocketAPI({
        nodeId: seedNodeId,
        systemTableCache: systemTableCache,
      });

      // Hook into broadcastCDCEvent
      const originalBroadcast = adminApi.broadcastCDCEvent.bind(adminApi);
      adminApi.broadcastCDCEvent = (tableName, operation, record) => {
        cdcEventsReceived.push({tableName, operation, record});
        return originalBroadcast(tableName, operation, record);
      };

      await adminApi.initialize(0, {listen: false});

      // Test INSERT
      const testNodeId = '550e8400-e29b-41d4-a716-446655440098';
      systemTableCache.applySystemTableChange('nodes', 'INSERT', {
        node_id: testNodeId,
        node_address: 'ws://127.0.0.1:9998',
        status: 'active',
      });

      // Wait for setImmediate callbacks to execute (cache notifications are async)
      await new Promise((resolve) => setImmediate(resolve));

      const insertEvent = cdcEventsReceived.find(
        (e) => e.tableName === 'nodes' && e.record?.node_id === testNodeId,
      );
      t.ok(insertEvent, 'should receive INSERT event');
      t.equal(insertEvent.operation, 'INSERT', 'first set should be INSERT');

      // Test UPDATE (set same key again)
      systemTableCache.applySystemTableChange('nodes', 'UPDATE', {
        node_id: testNodeId,
        node_address: 'ws://127.0.0.1:9998',
        status: 'inactive',
      });

      // Wait for setImmediate callbacks to execute (cache notifications are async)
      await new Promise((resolve) => setImmediate(resolve));

      const updateEvent = cdcEventsReceived.find(
        (e) => e.tableName === 'nodes' &&
               e.record?.node_id === testNodeId &&
               e.operation === 'UPDATE',
      );
      t.ok(updateEvent, 'should receive UPDATE event');
      t.equal(updateEvent.record.status, 'inactive', 'updated status should be inactive');

      // Test DELETE
      systemTableCache.applySystemTableChange('nodes', 'DELETE', {node_id: testNodeId});

      // Wait for setImmediate callbacks to execute (cache notifications are async)
      await new Promise((resolve) => setImmediate(resolve));

      const deleteEvent = cdcEventsReceived.find(
        (e) => e.tableName === 'nodes' &&
               e.record?.node_id === testNodeId &&
               e.operation === 'DELETE',
      );
      t.ok(deleteEvent, 'should receive DELETE event');
    } finally {
      if (adminApi) {
        await adminApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });
});
