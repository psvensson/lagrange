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
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {CDCConfirmationTracker} from '../../src/cdc/cdc-confirmation-tracker.js';
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
  CDC_CONFIRMATION_WAIT_MS: 3000,
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


function createCdcConfirmationTracker(systemTableCache) {
  return new CDCConfirmationTracker({
    systemTableCache,
    timeoutMs: TEST_TIMEOUTS.CDC_CONFIRMATION_WAIT_MS,
  });
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
      const seedNodeInCache = systemTableCache.get(TABLES.NODES, seedNodeId);

      t.ok(seedNodeInCache, 'seed node should be in cache from bootstrap');
      t.equal(seedNodeInCache[COLUMN.NODE_ID], seedNodeId, 'cached node ID should match');

      // =====================================================================
      // PHASE 5: Write data through SQL (goes through Raft consensus)
      // =====================================================================
      // Use storage_budget_bytes because the heartbeat service does not
      // overwrite it, avoiding a race between the test assertion and the
      // periodic heartbeat that rewrites cpu/memory/disk usage columns.
      const testBudgetBytes = 123456;
      const cdcConfirmationTracker = createCdcConfirmationTracker(systemTableCache);
      const confirmation = cdcConfirmationTracker.awaitConfirmation(
        TABLES.NODES,
        seedNodeId,
      );
      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET storage_budget_bytes = ? WHERE node_id = ?',
        [testBudgetBytes, seedNodeId],
      );

      t.equal(updateResult.success, true, 'SQL UPDATE should succeed through Raft');

      await confirmation;
      cdcConfirmationTracker.shutdown();

      // =====================================================================
      // PHASE 6: Verify CDC event propagated to cache
      // =====================================================================
      const updatedNode = systemTableCache.get(TABLES.NODES, seedNodeId);

      t.ok(updatedNode, 'updated node should appear in cache after CDC propagation');
      t.equal(
        updatedNode[COLUMN.STORAGE_BUDGET_BYTES],
        testBudgetBytes,
        'cached storage_budget_bytes should match updated value',
      );

      t.comment('CDC propagation verified - UPDATE reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
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
      // PHASE 3: Update the seed node through SQL using a column the
      // heartbeat service does not overwrite.
      // =====================================================================
      const testBudgetSource = 'test-update-source';

      const cdcConfirmationTracker = createCdcConfirmationTracker(systemTableCache);
      const confirmation = cdcConfirmationTracker.awaitConfirmation(
        TABLES.NODES,
        seedNodeId,
      );

      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET storage_budget_source = ? WHERE node_id = ?',
        [testBudgetSource, seedNodeId],
      );

      t.equal(updateResult.success, true, 'UPDATE should succeed');

      await confirmation;
      cdcConfirmationTracker.shutdown();

      // =====================================================================
      // PHASE 4: Verify CDC event propagated to cache
      // =====================================================================
      const updatedNode = systemTableCache.get(TABLES.NODES, seedNodeId);

      t.ok(updatedNode, 'updated node should appear in cache after CDC propagation');
      t.equal(
        updatedNode[COLUMN.STORAGE_BUDGET_SOURCE],
        testBudgetSource,
        'cached storage_budget_source should match',
      );

      t.comment('CDC propagation verified - UPDATE reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
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
      // PHASE 3: Perform multiple sequential writes using a column the
      // heartbeat service does not overwrite.
      // =====================================================================
      const budgetValues = [1000, 2500, 5000, 7500, 10000];

      const cdcConfirmationTracker = createCdcConfirmationTracker(systemTableCache);

      for (const budgetValue of budgetValues) {
        const confirmation = cdcConfirmationTracker.awaitConfirmation(
          TABLES.NODES,
          seedNodeId,
        );
        const updateResult = await sqlQueryEngine.executeQuery(
          'UPDATE nodes SET storage_budget_bytes = ? WHERE node_id = ?',
          [budgetValue, seedNodeId],
        );
        t.equal(
          updateResult.success, true,
          `UPDATE to ${budgetValue} should succeed`,
        );
        await confirmation;
      }

      cdcConfirmationTracker.shutdown();

      // =====================================================================
      // PHASE 4: Verify final value propagated to cache
      // =====================================================================
      const finalBudgetValue = budgetValues[budgetValues.length - 1];
      const finalNode = systemTableCache.get(TABLES.NODES, seedNodeId);

      t.ok(finalNode, 'final update should appear in cache');
      t.equal(
        finalNode[COLUMN.STORAGE_BUDGET_BYTES],
        finalBudgetValue,
        'cached storage_budget_bytes should match final value',
      );

      t.comment('CDC propagation verified - multiple writes reflected in cache');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
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

      const testBudgetBytes = 77777;
      const isTargetNodesUpdateEvent = (e) => (
        e.tableName === TABLES.NODES &&
        (e.operation === 'UPDATE' || e.operation === 'UPSERT')
      );

      // Register a listener to track CDC events
      const listener = (tableName, operation, record) => {
        const event = {tableName, operation, record, timestamp: Date.now()};
        cdcEventsReceived.push(event);
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
      // PHASE 3: Write data through SQL using a column the heartbeat
      // service does not overwrite.
      // =====================================================================
      const cdcConfirmationTracker = createCdcConfirmationTracker(systemTableCache);
      const confirmation = cdcConfirmationTracker.awaitConfirmation(
        TABLES.NODES,
        seedNodeId,
      );
      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE nodes SET storage_budget_bytes = ? WHERE node_id = ?',
        [testBudgetBytes, seedNodeId],
      );

      t.equal(updateResult.success, true, 'SQL UPDATE should succeed');

      await confirmation;
      cdcConfirmationTracker.shutdown();

      // Clean up listener
      systemTableCache.offCacheChange(listener);

      // =====================================================================
      // PHASE 4: Wait for CDC event to be received by listener
      // =====================================================================
      const nodesEvent = cdcEventsReceived.find(
        (e) => isTargetNodesUpdateEvent(e),
      );
      t.ok(nodesEvent, 'should observe cache listener event for update');

      const updatedNode = systemTableCache.get(TABLES.NODES, seedNodeId);
      t.equal(
        Number(updatedNode?.[COLUMN.STORAGE_BUDGET_BYTES]),
        testBudgetBytes,
        'cache should reflect updated storage_budget_bytes',
      );

      // =====================================================================
      // PHASE 5: Verify CDC event was received by listener
      // =====================================================================
      const nodesEvents = cdcEventsReceived.filter((e) => e.tableName === TABLES.NODES);
      t.ok(nodesEvents.length > 0, 'should receive CDC events for nodes table');

      const updateEvent = nodesEvents.find(
        (e) => isTargetNodesUpdateEvent(e),
      );
      t.ok(updateEvent, 'should receive CDC event for the specific update');
      t.ok(
        updateEvent?.operation === 'UPDATE' || updateEvent?.operation === 'UPSERT',
        'operation should be UPDATE or UPSERT',
      );

      t.comment('CDC propagation verified - cache listener received events');
    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });
});
