/**
 * Admin CDC Propagation Integration Test.
 * Tests that CDC events from node registration propagate to AdminWebSocketAPI.
 *
 * This test simulates the production scenario where:
 * 1. Seed node bootstraps with AdminWebSocketAPI
 * 2. Second and third nodes join
 * 3. AdminWebSocketAPI should receive CDC notifications for new nodes
 *
 * Requirements: 32.1, 32.2, 32.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {URL} from 'url';

function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

async function waitForCdcEvent(events, predicate, timeoutMs = 3000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const match = events.find(predicate);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
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
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

test('Admin CDC propagation when nodes join', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('AdminWebSocketAPI receives CDC events when third node joins', async (t) => {
    // =========================================================================
    // This test verifies the exact production scenario:
    // 1. Seed node bootstraps with AdminWebSocketAPI
    // 2. AdminWebSocketAPI subscribes to cache notifications
    // 3. When third node joins, CDC event should reach AdminWebSocketAPI
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440020';
    const seedWsPort = 20080;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 500,
        leadershipWaitInitialDelayMs: 5,
        leadershipWaitMaxDelayMs: 25,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;
    let seedApi;
    let adminApi;
    let sqlQueryEngine;
    let joiningService2;
    let joiningService3;

    // Track CDC events received by AdminWebSocketAPI
    const cdcEventsReceived = [];

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node (like src/index.js does)
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Get system table cache from NodeService singleton (like src/index.js)
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cacheId = systemTableCache._cacheId;
      t.ok(cacheId, 'cache should have an ID for tracking');
      t.comment(`Seed node cache ID: ${cacheId}`);

      // Create SQL query engine (like src/index.js)
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =========================================================================
      // PHASE 2: Start Bootstrap API (like src/index.js)
      // =========================================================================
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Start AdminWebSocketAPI (like src/index.js)
      // =========================================================================
      adminApi = new AdminWebSocketAPI({
        nodeId: seedNodeId,
        systemTableCache: systemTableCache,
        sqlQueryEngine: sqlQueryEngine,
      });

      // Verify AdminWebSocketAPI is using the same cache
      const adminCacheId = adminApi.systemTableCache._cacheId;
      t.equal(adminCacheId, cacheId, 'AdminWebSocketAPI should use same cache as bootstrap');
      t.comment(`AdminWebSocketAPI cache ID: ${adminCacheId}`);

      // Hook into broadcastCDCEvent to track CDC events
      const originalBroadcast = adminApi.broadcastCDCEvent.bind(adminApi);
      adminApi.broadcastCDCEvent = (tableName, operation, record) => {
        cdcEventsReceived.push({tableName, operation, record, timestamp: Date.now()});
        t.comment(`CDC event received: ${tableName} ${operation} ${JSON.stringify(record)}`);
        return originalBroadcast(tableName, operation, record);
      };

      await adminApi.initialize(0, {listen: false});
      t.ok(adminApi.isInitialized(), 'AdminWebSocketAPI should be initialized');

      // Verify cache has listeners registered
      const listenerCount = systemTableCache.listeners.size;
      t.ok(listenerCount > 0, `Cache should have listeners, got ${listenerCount}`);
      t.comment(`Cache listener count: ${listenerCount}`);

      // =========================================================================
      // PHASE 4: Wait for partition leaders to be elected
      // Partitions need time to elect leaders before joining nodes can write
      // Poll for leader availability rather than fixed wait
      // =========================================================================
      const maxWaitMs = 2000;
      const pollIntervalMs = 50;
      const startWait = Date.now();
      let leadersReady = false;

      while (Date.now() - startWait < maxWaitMs && !leadersReady) {
        // Check if all system table partitions have leaders
        const services = systemTableCache.getAll('services') || [];
        const systemPartitions = ['nodes-p1', 'services-p1', 'tables-p1', 
          'partitions-p1', 'message_groups-p1', 'replica_operations-p1'];
        
        const leaderCounts = {};
        for (const partition of systemPartitions) {
          leaderCounts[partition] = services.filter(
            (s) => s.partition_id === partition && s.raft_role === 'leader',
          ).length;
        }

        leadersReady = systemPartitions.every((p) => leaderCounts[p] > 0);

        if (!leadersReady) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }

      if (!leadersReady) {
        t.fail('Partition leaders not elected within timeout');
        return;
      }

      t.comment('All partition leaders elected and ready');

      const result1 = await sqlQueryEngine.executeQuery('SELECT * FROM nodes');
      t.equal(result1.success !== false, true, 'initial query should succeed');
      const nodes1 = result1.rows || [];
      t.comment(`Initial nodes: ${JSON.stringify(nodes1.map((n) => n.node_id))}`);

      // =========================================================================
      // PHASE 5: Join second node
      // =========================================================================
      const joiningNodeId2 = '550e8400-e29b-41d4-a716-446655440021';
      const joiningWsPort2 = 20090;

      joiningService2 = new NodeJoiningService({
        nodeId: joiningNodeId2,
        nodeAddress: `ws://localhost:${joiningWsPort2}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort2,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
          leadershipWaitInitialDelayMs: 5,
          leadershipWaitMaxDelayMs: 25,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const cdcCountBefore2 = cdcEventsReceived.length;
      const joinResult2 = await joiningService2.join();
      t.equal(joinResult2.success, true, 'second node join should succeed');

      // Check if CDC event was received for second node
      const cdcCountAfter2 = cdcEventsReceived.length;
      t.comment(`CDC events before 2nd join: ${cdcCountBefore2}, after: ${cdcCountAfter2}`);

      const node2CdcEvent = await waitForCdcEvent(
        cdcEventsReceived,
        (e) => e.tableName === 'nodes' && e.record?.node_id === joiningNodeId2,
      );
      t.ok(node2CdcEvent, 'should receive CDC event for second node joining');

      // =========================================================================
      // PHASE 6: Join third node
      // =========================================================================
      const joiningNodeId3 = '550e8400-e29b-41d4-a716-446655440022';
      const joiningWsPort3 = 20100;

      joiningService3 = new NodeJoiningService({
        nodeId: joiningNodeId3,
        nodeAddress: `ws://localhost:${joiningWsPort3}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort3,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
          leadershipWaitInitialDelayMs: 5,
          leadershipWaitMaxDelayMs: 25,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const cdcCountBefore3 = cdcEventsReceived.length;
      const joinResult3 = await joiningService3.join();
      t.equal(joinResult3.success, true, 'third node join should succeed');

      // Check if CDC event was received for third node
      const cdcCountAfter3 = cdcEventsReceived.length;
      t.comment(`CDC events before 3rd join: ${cdcCountBefore3}, after: ${cdcCountAfter3}`);

      const node3CdcEvent = await waitForCdcEvent(
        cdcEventsReceived,
        (e) => e.tableName === 'nodes' && e.record?.node_id === joiningNodeId3,
      );
      t.ok(node3CdcEvent, 'should receive CDC event for third node joining');

      // =========================================================================
      // PHASE 7: Verify all nodes in cache (SQL query may fail due to NodeService reset)
      // The key verification is that CDC events were received, which we check below
      // =========================================================================
      // Note: SQL query may return 0 rows because NodeService was reset during
      // node joins (simulating separate processes). The cache verification below
      // is the authoritative check.

      // =========================================================================
      // PHASE 8: Verify cache state has all 3 nodes
      // =========================================================================
      const cachedNodes = systemTableCache.getAll('nodes');
      t.comment(`Cached nodes: ${JSON.stringify(cachedNodes.map((n) => n.node_id))}`);
      t.equal(cachedNodes.length, 3, `cache should have 3 nodes, got ${cachedNodes.length}`);

      // Verify each node is present in cache
      const cachedNodeIds = cachedNodes.map((n) => n.node_id);
      t.ok(cachedNodeIds.includes(seedNodeId), 'cache should contain seed node');
      t.ok(cachedNodeIds.includes(joiningNodeId2), 'cache should contain second node');
      t.ok(cachedNodeIds.includes(joiningNodeId3), 'cache should contain third node');

      // =========================================================================
      // PHASE 9: Summary of CDC events
      // =========================================================================
      t.comment('=== CDC Events Summary ===');
      const nodesCdcEvents = cdcEventsReceived.filter((e) => e.tableName === 'nodes');
      t.comment(`Total CDC events for nodes table: ${nodesCdcEvents.length}`);
      for (const event of nodesCdcEvents) {
        t.comment(`  ${event.operation}: ${event.record?.node_id}`);
      }

      // We should have received at least 2 CDC events for nodes (2nd and 3rd node)
      // The seed node is registered during bootstrap before AdminWebSocketAPI starts
      t.ok(
        nodesCdcEvents.length >= 2,
        `should have at least 2 CDC events for nodes, got ${nodesCdcEvents.length}`,
      );
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      if (joiningService3) {
        await joiningService3.cleanup().catch(() => {});
      }
      if (joiningService2) {
        await joiningService2.cleanup().catch(() => {});
      }
      if (adminApi) {
        await adminApi.shutdown().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });

  await t.test('cache instance shared between MessageGroupService and AdminWebSocketAPI',
    async (t) => {
      // =======================================================================
      // This test verifies that the cache instance is truly shared
      // =======================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440030';
      const seedWsPort = 21080;

      const bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: {
          leadershipWaitTimeoutMs: 2000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
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
        t.comment(`NodeService cache ID: ${cacheId}`);
        t.comment(`MessageGroupService cache ID: ${messageGroupCacheId}`);

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
        t.comment(`AdminWebSocketAPI cache ID: ${adminCacheId}`);

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
        if (bootstrapService && bootstrapService.shutdown) {
          await bootstrapService.shutdown().catch(() => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch(() => {});
        }
      }
    });

  await t.test('nodes system table contains all three nodes after two joins', async (t) => {
    // =========================================================================
    // This test verifies that the nodes system table contains exactly 3 entries
    // after bootstrapping a seed node and joining two additional nodes.
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440040';
    const seedWsPort = 22080;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 2000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;
    let seedApi;
    let sqlQueryEngine;
    let joiningService2;
    let joiningService3;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      // Create SQL query engine
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =========================================================================
      // PHASE 2: Start Bootstrap API
      // =========================================================================
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Wait for partition leaders to be elected
      // =========================================================================
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Use cache directly (authoritative source) instead of SQL query
      const initialNodes = systemTableCache.getAll('nodes') || [];
      t.comment(`Initial nodes count: ${initialNodes.length}`);
      t.equal(initialNodes.length, 1, 'should have exactly 1 node initially (seed)');
      t.equal(initialNodes[0].node_id, seedNodeId, 'initial node should be seed node');

      // =========================================================================
      // PHASE 4: Join second node
      // =========================================================================
      const joiningNodeId2 = '550e8400-e29b-41d4-a716-446655440041';
      const joiningWsPort2 = 22090;

      joiningService2 = new NodeJoiningService({
        nodeId: joiningNodeId2,
        nodeAddress: `ws://localhost:${joiningWsPort2}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort2,
        config: {
          httpTimeoutMs: 2000,
          leadershipWaitTimeoutMs: 2000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult2 = await joiningService2.join();
      t.equal(joinResult2.success, true, 'second node join should succeed');

      // Wait for registration to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      // =========================================================================
      // PHASE 5: Join third node
      // =========================================================================
      const joiningNodeId3 = '550e8400-e29b-41d4-a716-446655440042';
      const joiningWsPort3 = 22100;

      joiningService3 = new NodeJoiningService({
        nodeId: joiningNodeId3,
        nodeAddress: `ws://localhost:${joiningWsPort3}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort3,
        config: {
          httpTimeoutMs: 2000,
          leadershipWaitTimeoutMs: 2000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult3 = await joiningService3.join();
      t.equal(joinResult3.success, true, 'third node join should succeed');

      // Wait for registration to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      // =========================================================================
      // PHASE 6: Verify nodes system table contains all 3 nodes
      // =========================================================================
      // Query via cache (authoritative source after CDC propagation)
      const cachedNodes = systemTableCache.getAll('nodes');
      t.comment(`Nodes in cache: ${cachedNodes.length}`);
      for (const node of cachedNodes) {
        t.comment(`  - ${node.node_id} (${node.node_address})`);
      }

      t.equal(cachedNodes.length, 3, 'nodes table should contain exactly 3 nodes');

      // Verify each specific node is present
      const nodeIds = cachedNodes.map((n) => n.node_id);
      t.ok(nodeIds.includes(seedNodeId), 'nodes table should contain seed node');
      t.ok(nodeIds.includes(joiningNodeId2), 'nodes table should contain second node');
      t.ok(nodeIds.includes(joiningNodeId3), 'nodes table should contain third node');

      // Verify node addresses are correct
      const seedNode = cachedNodes.find((n) => n.node_id === seedNodeId);
      const node2 = cachedNodes.find((n) => n.node_id === joiningNodeId2);
      const node3 = cachedNodes.find((n) => n.node_id === joiningNodeId3);

      t.equal(seedNode.node_address, `ws://localhost:${seedWsPort}`, 'seed node address');
      t.equal(node2.node_address, `ws://localhost:${joiningWsPort2}`, 'second node address');
      t.equal(node3.node_address, `ws://localhost:${joiningWsPort3}`, 'third node address');

      // Verify all nodes have active status
      t.equal(seedNode.status, 'active', 'seed node should be active');
      t.equal(node2.status, 'active', 'second node should be active');
      t.equal(node3.status, 'active', 'third node should be active');

      t.comment('=== All 3 nodes verified in nodes system table ===');
    } finally {
      if (joiningService3) {
        await joiningService3.cleanup().catch(() => {});
      }
      if (joiningService2) {
        await joiningService2.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });
});
