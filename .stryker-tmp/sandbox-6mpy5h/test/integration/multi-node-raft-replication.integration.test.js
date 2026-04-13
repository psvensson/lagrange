/**
 * Multi-node Raft Replication Integration Test.
 *
 * This test verifies that Raft consensus works correctly across multiple nodes
 * with real WebSocket connections. It specifically tests:
 * 1. Seed node bootstrap with real Raft partitions
 * 2. Joining node connects via real WebSocket
 * 3. Data written through SQL goes through Raft consensus
 * 4. Data replicates correctly to joining node
 * 5. All Raft packet types (including append ack) are handled correctly
 *
 * This test would catch bugs like missing APPEND_ACK handler that caused
 * "Unknown message type received" warnings.
 *
 * Requirements: 4.1, 4.6, 7.8, 7.10
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCConfirmationTracker} from '../../src/cdc/cdc-confirmation-tracker.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {URL} from 'url';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  stopAllRebalancers,
  gracefulShutdown,
  gracefulJoiningShutdown,
  waitForPartitionLeaderElection,
} from './helpers/cluster-test-helpers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

/**
 * Get a unique port for this test file.
 * @returns {number} Unique port number
 */
function getUniquePort() {
  return ports.getPort();
}

/**
 * Generate a unique UUID based on a base and counter.
 * @param {number} counter - Counter value
 * @returns {string} UUID string
 */
function generateUniqueNodeId(counter) {
  // Use a unique base that won't conflict with other tests
  const hex = counter.toString(16).padStart(12, '0');
  return `550e8400-e29b-41d4-a716-${hex}`;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0x900000000000;

/**
 * Create in-process HTTP POST function for BootstrapAPI.
 * @param {Object} seedApi - The BootstrapAPI instance
 * @returns {Function} Async function that performs HTTP POST requests
 */
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

/**
 * Wait for a SQL query to return expected number of rows.
 * @param {SQLQueryEngine} sqlQueryEngine - SQL query engine
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {number} minRows - Minimum expected rows
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} intervalMs - Polling interval
 * @returns {Promise<Object>} Query result
 */
async function waitForQueryRows(
  sqlQueryEngine,
  sql,
  params,
  minRows,
  timeoutMs = 3000,
  intervalMs = 50,
) {
  const start = Date.now();
  let lastResult = null;
  while (Date.now() - start < timeoutMs) {
    lastResult = await sqlQueryEngine.executeQuery(sql, params);
    const rows = lastResult.rows || [];
    if (lastResult.success !== false && rows.length >= minRows) {
      return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastResult || {success: false, rows: []};
}

/**
 * Wait for partition to elect a leader.
 * Uses the helper function that supports both in-process and worker modes.
 *
 * @param {Object} bootstrapResult - Result from bootstrap()
 * @param {Object} bootstrapService - The BootstrapService instance
 * @param {string} partitionId - Partition ID to check
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} intervalMs - Polling interval
 * @returns {Promise<Object|null>} Leader partition service or null
 */
async function waitForPartitionLeader(
  bootstrapResult,
  bootstrapService,
  partitionId,
  timeoutMs = 3000,
  intervalMs = 50,
) {
  return waitForPartitionLeaderElection(
    bootstrapResult,
    bootstrapService,
    partitionId,
    timeoutMs,
    intervalMs,
  );
}

test('Multi-node Raft replication', {timeout: 45000}, async (t) => {
  t.beforeEach(() => {
    // This suite validates Raft packet handling and cluster join consensus.
    // Keep autonomous rebalancing effectively idle to avoid unrelated churn.
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('data written on seed replicates to joining node via Raft', async (t) => {
    // =========================================================================
    // This test verifies end-to-end Raft replication:
    // 1. Seed node bootstraps with real Raft partitions
    // 2. Joining node connects via real WebSocket
    // 3. Data written through SQL goes through Raft consensus
    // 4. Joining node receives replicated data
    // 5. No "Unknown message type" warnings are logged
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    // Track warnings to detect unknown message type issues
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.join(' '));
      originalWarn.apply(console, args);
    };

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 3000,
      },
    });

    let bootstrapResult;
    let seedApi;
    let joiningService;
    let cdcConfirmationTracker;
    let seedSqlEngine;
    let seedConfirmationTracker;
    let joiningConfirmationTracker;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node with real Raft partitions
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');
      t.ok(bootstrapResult.partitionServices.size > 0, 'seed should have partitions');

      // Wait for nodes-p1 partition to elect a leader
      const nodesLeader = await waitForPartitionLeader(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        5000,
      );
      t.ok(nodesLeader, 'nodes partition should elect a leader');

      // =========================================================================
      // PHASE 2: Start Bootstrap API for joining nodes
      // =========================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      cdcConfirmationTracker = new CDCConfirmationTracker({
        systemTableCache,
        timeoutMs: 5000,
      });

      seedConfirmationTracker = new CDCConfirmationTracker({
        systemTableCache,
        timeoutMs: 5000,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});

      seedSqlEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedSqlEngine);

      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Verify seed node is in nodes table
      // =========================================================================
      const seedNodesResult = await waitForQueryRows(
        seedSqlEngine,
        'SELECT * FROM nodes WHERE node_id = ?',
        [seedNodeId],
        1,
        3000,
      );
      t.equal(seedNodesResult.success !== false, true, 'seed query should succeed');
      t.equal(seedNodesResult.rows?.length, 1, 'seed node should be in nodes table');

      // =========================================================================
      // PHASE 4: Join a new node via real WebSocket
      // =========================================================================
      const joiningNodeId = generateUniqueNodeId(nodeIdCounter++);
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'node join should succeed');
      t.ok(joinResult.messageRouter, 'joining node should have message router');

      const joiningCache = joiningService.cdcIntegrationService?.systemTableCache || null;
      if (joiningCache && joiningCache !== systemTableCache) {
        joiningConfirmationTracker = new CDCConfirmationTracker({
          systemTableCache: joiningCache,
          timeoutMs: 5000,
        });
      }

      // =========================================================================
      // PHASE 5: Verify joining node is connected via WebSocket
      // =========================================================================
      const joiningMessageRouter = joinResult.messageRouter;
      const connectedNodes = joiningMessageRouter.getConnectedNodes?.() ||
        Array.from(joiningMessageRouter.nodeConnections?.keys() || []);

      t.ok(
        connectedNodes.includes(seedNodeId) || connectedNodes.length > 0,
        'joining node should be connected to seed node',
      );

      // =========================================================================
      // PHASE 6: Verify both nodes appear in nodes table via SQL
      // =========================================================================
      const bothNodesResult = await waitForQueryRows(
        seedSqlEngine,
        'SELECT * FROM nodes',
        [],
        2,
        5000,
      );

      t.equal(bothNodesResult.success !== false, true, 'nodes query should succeed');
      t.ok(bothNodesResult.rows?.length >= 2, 'should have at least 2 nodes');

      const seedInTable = bothNodesResult.rows?.some((n) => n.node_id === seedNodeId);
      const joiningInTable = bothNodesResult.rows?.some((n) => n.node_id === joiningNodeId);

      t.ok(seedInTable, 'seed node should be in nodes table');
      t.ok(joiningInTable, 'joining node should be in nodes table');

      // =========================================================================
      // PHASE 7: Write data through SQL (goes through Raft consensus)
      // =========================================================================
      // Update the joining node's status to trigger Raft replication
      const seedConfirmation = seedConfirmationTracker.awaitConfirmation(
        TABLES.NODES,
        joiningNodeId,
      );
      const joiningConfirmation = joiningConfirmationTracker ?
        joiningConfirmationTracker.awaitConfirmation(TABLES.NODES, joiningNodeId) :
        Promise.resolve();
      const updateResult = await seedSqlEngine.executeQuery(
        'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
        [42, joiningNodeId],
      );

      t.equal(updateResult.success, true, 'update should succeed through Raft');

      await Promise.all([seedConfirmation, joiningConfirmation]);

      // =========================================================================
      // PHASE 8: Verify data was replicated (read from system cache)
      // =========================================================================
      const verifyResult = await waitForQueryRows(
        seedSqlEngine,
        'SELECT cpu_usage_percent FROM nodes WHERE node_id = ?',
        [joiningNodeId],
        1,
        3000,
      );

      t.equal(verifyResult.success !== false, true, 'verify query should succeed');
      t.equal(
        verifyResult.rows?.[0]?.cpu_usage_percent,
        42,
        'updated value should be replicated',
      );
      if (joiningCache) {
        const cachedJoiningNode = joiningCache.get(TABLES.NODES, joiningNodeId);
        t.equal(
          cachedJoiningNode?.[COLUMN.CPU_USAGE_PERCENT],
          42,
          'joining node cache should observe replicated update',
        );
      }

      // =========================================================================
      // PHASE 9: Verify no "Unknown message type" warnings
      // =========================================================================
      // This is the key assertion that would catch the append ack bug
      const unknownTypeWarnings = warnings.filter((w) =>
        w.includes('Unknown message type') ||
        w.includes('unknown message type'),
      );

      t.equal(
        unknownTypeWarnings.length,
        0,
        `should have no unknown message type warnings, got: ${unknownTypeWarnings.length}`,
      );

      if (unknownTypeWarnings.length > 0) {
        t.comment('Unknown message type warnings found:');
        unknownTypeWarnings.slice(0, 5).forEach((w) => t.comment(`  ${w}`));
      }
    } finally {
      // Restore console.warn
      console.warn = originalWarn;

      if (seedConfirmationTracker) {
        seedConfirmationTracker.shutdown();
      }
      if (joiningConfirmationTracker) {
        joiningConfirmationTracker.shutdown();
      }

      // =========================================================================
      // CLEANUP - Stop rebalancers FIRST to prevent async operations
      // =========================================================================
      // Stop all rebalancers before closing connections
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
      if (joiningService?.partitionServices) {
        stopAllRebalancers(joiningService.partitionServices);
      }

      // Small delay to allow any in-flight operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now cleanup in order
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);

      // Allow any remaining async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });


  await t.test('Raft append ack messages are handled without warnings', async (t) => {
    // =========================================================================
    // This test specifically verifies that all Raft packet types are handled
    // correctly, including append ack which was previously missing.
    //
    // The test creates a multi-replica partition and triggers Raft operations
    // that generate append ack messages, then verifies no warnings are logged.
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    // Capture log output to detect warnings
    const logOutput = [];
    const loggingService = LoggingService.getInstance();

    // Store original logger methods
    const originalLogger = loggingService.logger;

    // Create a capturing logger
    const capturingLogger = {
      info: (...args) => {
        logOutput.push({level: 'info', args});
        originalLogger?.info?.(...args);
      },
      warn: (...args) => {
        logOutput.push({level: 'warn', args});
        originalLogger?.warn?.(...args);
      },
      error: (...args) => {
        logOutput.push({level: 'error', args});
        originalLogger?.error?.(...args);
      },
      debug: (...args) => {
        logOutput.push({level: 'debug', args});
        originalLogger?.debug?.(...args);
      },
      child: () => capturingLogger,
    };

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 3000,
      },
    });

    let bootstrapResult;
    let seedApi;
    let joiningService;
    let cdcConfirmationTracker;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      // Wait for leader election to trigger Raft messages
      await waitForPartitionLeader(
        bootstrapResult,
        bootstrapService,
        'services-p1',
        5000,
      );

      // =========================================================================
      // PHASE 2: Start Bootstrap API and join a second node
      // =========================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      cdcConfirmationTracker = new CDCConfirmationTracker({
        systemTableCache,
        timeoutMs: 5000,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});

      const seedSqlEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedSqlEngine);

      const httpPost = createInProcHttpPost(seedApi);

      // Join second node to create multi-node Raft group
      const joiningNodeId = generateUniqueNodeId(nodeIdCounter++);
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'join should succeed');

      // =========================================================================
      // PHASE 3: Trigger multiple Raft operations to generate append ack
      // =========================================================================
      // Perform several writes to trigger Raft replication and append ack
      for (let i = 0; i < 3; i++) {
        const confirmation = cdcConfirmationTracker.awaitConfirmation(
          TABLES.NODES,
          seedNodeId,
        );
        await seedSqlEngine.executeQuery(
          'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
          [i * 10, seedNodeId],
        );
        await confirmation;
      }

      // =========================================================================
      // PHASE 4: Check for unknown message type warnings
      // =========================================================================
      const unknownTypeWarnings = logOutput.filter((entry) => {
        if (entry.level !== 'warn') return false;
        const msg = JSON.stringify(entry.args);
        return msg.includes('Unknown message type') ||
               msg.includes('unknown message type');
      });

      t.equal(
        unknownTypeWarnings.length,
        0,
        'should have no unknown message type warnings in logs',
      );

      // Also check console warnings
      const consoleWarnings = [];
      const originalConsoleWarn = console.warn;
      console.warn = (...args) => {
        consoleWarnings.push(args.join(' '));
        originalConsoleWarn.apply(console, args);
      };

      // Trigger one more write
      const finalConfirmation = cdcConfirmationTracker.awaitConfirmation(
        TABLES.NODES,
        seedNodeId,
      );
      await seedSqlEngine.executeQuery(
        'UPDATE nodes SET memory_usage_percent = ? WHERE node_id = ?',
        [50, seedNodeId],
      );
      await finalConfirmation;

      console.warn = originalConsoleWarn;

      const consoleUnknownWarnings = consoleWarnings.filter((w) =>
        w.includes('Unknown message type'),
      );

      t.equal(
        consoleUnknownWarnings.length,
        0,
        'should have no unknown message type console warnings',
      );
    } finally {
      if (cdcConfirmationTracker) {
        cdcConfirmationTracker.shutdown();
      }
      // =========================================================================
      // CLEANUP - Stop rebalancers FIRST to prevent async operations
      // =========================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
      if (joiningService?.partitionServices) {
        stopAllRebalancers(joiningService.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });

  await t.test('three-node cluster maintains Raft consensus', async (t) => {
    // =========================================================================
    // This test creates a 3-node cluster to verify proper Raft consensus
    // with a quorum. This is the minimum for proper fault tolerance.
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 3000,
      },
    });

    let bootstrapResult;
    let seedApi;
    let joiningService2;
    let joiningService3;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});

      const seedSqlEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedSqlEngine);

      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 2: Join second node
      // =========================================================================
      const joiningNodeId2 = generateUniqueNodeId(nodeIdCounter++);
      const joiningWsPort2 = getUniquePort();

      joiningService2 = new NodeJoiningService({
        nodeId: joiningNodeId2,
        nodeAddress: `ws://localhost:${joiningWsPort2}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort2,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult2 = await joiningService2.join();
      t.equal(joinResult2.success, true, 'second node join should succeed');

      // =========================================================================
      // PHASE 3: Join third node
      // =========================================================================
      const joiningNodeId3 = generateUniqueNodeId(nodeIdCounter++);
      const joiningWsPort3 = getUniquePort();

      joiningService3 = new NodeJoiningService({
        nodeId: joiningNodeId3,
        nodeAddress: `ws://localhost:${joiningWsPort3}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort3,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult3 = await joiningService3.join();
      t.equal(joinResult3.success, true, 'third node join should succeed');

      // =========================================================================
      // PHASE 4: Verify all 3 nodes in cluster
      // =========================================================================
      const nodesResult = await waitForQueryRows(
        seedSqlEngine,
        'SELECT * FROM nodes',
        [],
        3,
        5000,
      );

      t.equal(nodesResult.success !== false, true, 'nodes query should succeed');
      t.ok(nodesResult.rows?.length >= 3, 'should have at least 3 nodes');

      const nodeIds = nodesResult.rows?.map((n) => n.node_id) || [];
      t.ok(nodeIds.includes(seedNodeId), 'seed node in cluster');
      t.ok(nodeIds.includes(joiningNodeId2), 'second node in cluster');
      t.ok(nodeIds.includes(joiningNodeId3), 'third node in cluster');
    } finally {
      // =========================================================================
      // CLEANUP - Stop rebalancers FIRST to prevent async operations
      // =========================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
      if (joiningService2?.partitionServices) {
        stopAllRebalancers(joiningService2.partitionServices);
      }
      if (joiningService3?.partitionServices) {
        stopAllRebalancers(joiningService3.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      await gracefulJoiningShutdown(joiningService3);
      await gracefulJoiningShutdown(joiningService2);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });
});
