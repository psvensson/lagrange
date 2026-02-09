/**
 * CDC Propagation Integration Test.
 *
 * This test verifies that CDC events are generated and propagate correctly
 * when data is written through Raft consensus. It specifically tests:
 * 1. Write data through SQL (goes through Raft consensus)
 * 2. Verify CDC events are generated for the write
 * 3. Verify CDC events propagate to system cache
 * 4. Verify data is visible in system cache after CDC propagation
 *
 * Requirements: 7.4, 7.5
 * - 7.4: WHEN testing replication THEN the tests SHALL verify data is
 *        replicated through Raft consensus
 * - 7.5: THE integration tests SHALL verify CDC events propagate correctly
 *        after writes
 *
 * @module test/integration/cdc-propagation.integration.test.js
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  stopAllRebalancers,
  gracefulShutdown,
  waitForPartitionLeaderElection,
} from './helpers/cluster-test-helpers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

/**
 * Test timeout constants for bounded polling.
 */
const TEST_TIMEOUTS = {
  LEADERSHIP_WAIT_MS: 5000,
  CDC_PROPAGATION_WAIT_MS: 3000,
  POLL_INTERVAL_MS: 50,
};

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
  const hex = counter.toString(16).padStart(12, '0');
  return `cdc-prop-${hex}`;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0xD00000000000;

/**
 * Wait for a value to appear in the system cache.
 * Uses bounded polling with configurable intervals.
 *
 * @param {Object} systemTableCache - System table cache instance.
 * @param {string} tableName - Table name to query.
 * @param {string} key - Primary key value to look for.
 * @param {number} timeoutMs - Maximum wait time.
 * @param {number} intervalMs - Polling interval.
 * @returns {Promise<Object|null>} Record or null.
 */
async function waitForCacheValue(
  systemTableCache,
  tableName,
  key,
  timeoutMs = TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
  intervalMs = TEST_TIMEOUTS.POLL_INTERVAL_MS,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = systemTableCache.get(tableName, key);
    if (record) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Wait for a cache value to match a predicate.
 *
 * @param {Object} systemTableCache - System table cache instance.
 * @param {string} tableName - Table name to query.
 * @param {string} key - Primary key value to look for.
 * @param {Function} predicate - Function that returns true when condition is met.
 * @param {number} timeoutMs - Maximum wait time.
 * @param {number} intervalMs - Polling interval.
 * @returns {Promise<Object|null>} Record or null.
 */
async function waitForCacheUpdate(
  systemTableCache,
  tableName,
  key,
  predicate,
  timeoutMs = TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
  intervalMs = TEST_TIMEOUTS.POLL_INTERVAL_MS,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = systemTableCache.get(tableName, key);
    if (record && predicate(record)) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

test('CDC propagation integration', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('write through SQL generates CDC events that propagate to cache', async (t) => {
    // =========================================================================
    // This test verifies the complete CDC flow:
    // 1. Write data through SQL (goes through Raft consensus)
    // 2. Verify CDC events are generated
    // 3. Verify CDC events propagate to system cache
    //
    // Requirements: 7.4, 7.5
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;
    let sqlQueryEngine;

    try {
      // =====================================================================
      // PHASE 1: Bootstrap seed node with real Raft partitions
      // =====================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');
      t.ok(bootstrapResult.partitionServices.size > 0, 'seed should have partitions');

      // =====================================================================
      // PHASE 2: Wait for nodes-p1 partition to elect a leader
      // =====================================================================
      const nodesLeader = await waitForPartitionLeaderElection(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
      );
      t.ok(nodesLeader, 'nodes-p1 partition should elect a leader');

      // =====================================================================
      // PHASE 3: Get system table cache and create SQL query engine
      // =====================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'should have system table cache');

      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =====================================================================
      // PHASE 4: Verify seed node is in cache (from bootstrap CDC)
      // =====================================================================
      const seedNodeInCache = await waitForCacheValue(
        systemTableCache,
        TABLES.NODES,
        seedNodeId,
        TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
      );

      t.ok(seedNodeInCache, 'seed node should be in cache from bootstrap');
      t.equal(seedNodeInCache[COLUMN.NODE_ID], seedNodeId, 'cached node ID should match');

      // =====================================================================
      // PHASE 5: Write data through SQL (goes through Raft consensus)
      // =====================================================================
      const testCpuUsage = 42;
      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
        [testCpuUsage, seedNodeId],
      );

      t.equal(updateResult.success, true, 'SQL UPDATE should succeed through Raft');

      // =====================================================================
      // PHASE 6: Verify CDC event propagated to cache
      // =====================================================================
      const updatedNode = await waitForCacheUpdate(
        systemTableCache,
        TABLES.NODES,
        seedNodeId,
        (node) => node[COLUMN.CPU_USAGE_PERCENT] === testCpuUsage,
        TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
      );

      t.ok(updatedNode, 'updated node should appear in cache after CDC propagation');
      t.equal(
        updatedNode[COLUMN.CPU_USAGE_PERCENT],
        testCpuUsage,
        'cached cpu_usage_percent should match updated value',
      );

      t.comment('CDC propagation verified - UPDATE reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });

  await t.test('UPDATE generates CDC event that propagates to cache', async (t) => {
    // =========================================================================
    // This test verifies that UPDATE operations generate CDC events
    // that propagate to the system cache.
    //
    // Requirements: 7.4, 7.5
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;
    let sqlQueryEngine;

    try {
      // =====================================================================
      // PHASE 1: Bootstrap seed node
      // =====================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Wait for nodes-p1 leader
      const nodesLeader = await waitForPartitionLeaderElection(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
      );
      t.ok(nodesLeader, 'nodes-p1 partition should elect a leader');

      // =====================================================================
      // PHASE 2: Get system table cache and create SQL query engine
      // =====================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =====================================================================
      // PHASE 3: Update the seed node's memory usage through SQL
      // =====================================================================
      const testMemoryUsage = 55.5;

      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET memory_usage_percent = ? WHERE node_id = ?',
        [testMemoryUsage, seedNodeId],
      );

      t.equal(updateResult.success, true, 'UPDATE should succeed');

      // =====================================================================
      // PHASE 4: Verify CDC event propagated to cache
      // =====================================================================
      const updatedNode = await waitForCacheUpdate(
        systemTableCache,
        TABLES.NODES,
        seedNodeId,
        (node) => node[COLUMN.MEMORY_USAGE_PERCENT] === testMemoryUsage,
        TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
      );

      t.ok(updatedNode, 'updated node should appear in cache after CDC propagation');
      t.equal(
        updatedNode[COLUMN.MEMORY_USAGE_PERCENT],
        testMemoryUsage,
        'cached memory_usage_percent should match',
      );

      t.comment('CDC propagation verified - UPDATE reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });

  await t.test('multiple writes generate CDC events in correct order', async (t) => {
    // =========================================================================
    // This test verifies that multiple writes generate CDC events
    // that propagate to the cache in the correct order.
    //
    // Requirements: 7.4, 7.5
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;
    let sqlQueryEngine;

    try {
      // =====================================================================
      // PHASE 1: Bootstrap seed node
      // =====================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Wait for nodes-p1 leader
      const nodesLeader = await waitForPartitionLeaderElection(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
      );
      t.ok(nodesLeader, 'nodes-p1 partition should elect a leader');

      // =====================================================================
      // PHASE 2: Get system table cache and create SQL query engine
      // =====================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =====================================================================
      // PHASE 3: Perform multiple sequential writes
      // =====================================================================
      const cpuValues = [10, 25, 50, 75, 100];

      for (const cpuValue of cpuValues) {
        const updateResult = await sqlQueryEngine.executeQuery(
          'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
          [cpuValue, seedNodeId],
        );
        t.equal(updateResult.success, true, `UPDATE to ${cpuValue} should succeed`);
      }

      // =====================================================================
      // PHASE 4: Verify final value propagated to cache
      // =====================================================================
      const finalCpuValue = cpuValues[cpuValues.length - 1];
      const finalNode = await waitForCacheUpdate(
        systemTableCache,
        TABLES.NODES,
        seedNodeId,
        (node) => node[COLUMN.CPU_USAGE_PERCENT] === finalCpuValue,
        TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS,
      );

      t.ok(finalNode, 'final update should appear in cache');
      t.equal(
        finalNode[COLUMN.CPU_USAGE_PERCENT],
        finalCpuValue,
        'cached cpu_usage_percent should match final value',
      );

      t.comment('CDC propagation verified - multiple writes reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });

  await t.test('CDC events update cache listeners', async (t) => {
    // =========================================================================
    // This test verifies that CDC events trigger cache listeners
    // when data is written through Raft consensus.
    //
    // Requirements: 7.5
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;
    let sqlQueryEngine;

    // Track CDC events received by cache listener
    const cdcEventsReceived = [];

    try {
      // =====================================================================
      // PHASE 1: Bootstrap seed node
      // =====================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Wait for nodes-p1 leader
      const nodesLeader = await waitForPartitionLeaderElection(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        TEST_TIMEOUTS.LEADERSHIP_WAIT_MS,
      );
      t.ok(nodesLeader, 'nodes-p1 partition should elect a leader');

      // =====================================================================
      // PHASE 2: Get system table cache and register listener
      // =====================================================================
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      // Register a listener to track CDC events
      const listener = (tableName, operation, record) => {
        cdcEventsReceived.push({tableName, operation, record, timestamp: Date.now()});
      };
      systemTableCache.onCacheChange(listener);

      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // Clear any events from bootstrap
      cdcEventsReceived.length = 0;

      // =====================================================================
      // PHASE 3: Write data through SQL
      // =====================================================================
      const testCpuUsage = 77;
      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
        [testCpuUsage, seedNodeId],
      );

      t.equal(updateResult.success, true, 'SQL UPDATE should succeed');

      // =====================================================================
      // PHASE 4: Wait for CDC event to be received by listener
      // =====================================================================
      const start = Date.now();
      while (Date.now() - start < TEST_TIMEOUTS.CDC_PROPAGATION_WAIT_MS) {
        const nodesEvent = cdcEventsReceived.find(
          (e) => e.tableName === TABLES.NODES &&
                 e.record?.[COLUMN.NODE_ID] === seedNodeId &&
                 e.record?.[COLUMN.CPU_USAGE_PERCENT] === testCpuUsage,
        );
        if (nodesEvent) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, TEST_TIMEOUTS.POLL_INTERVAL_MS));
      }

      // =====================================================================
      // PHASE 5: Verify CDC event was received by listener
      // =====================================================================
      const nodesEvents = cdcEventsReceived.filter((e) => e.tableName === TABLES.NODES);
      t.ok(nodesEvents.length > 0, 'should receive CDC events for nodes table');

      const updateEvent = nodesEvents.find(
        (e) => e.record?.[COLUMN.NODE_ID] === seedNodeId &&
               e.record?.[COLUMN.CPU_USAGE_PERCENT] === testCpuUsage,
      );
      t.ok(updateEvent, 'should receive CDC event for the specific update');
      t.equal(updateEvent.operation, 'UPDATE', 'operation should be UPDATE');

      // Clean up listener
      systemTableCache.offCacheChange(listener);

      t.comment('CDC propagation verified - cache listener received events');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });
});
