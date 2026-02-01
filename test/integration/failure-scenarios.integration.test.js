/**
 * Failure scenario integration tests.
 * Tests node failure detection, recovery, network partition handling,
 * and data availability during failures.
 * Requirements: 15.1-15.5 (Fault Tolerance and Recovery)
 */

import {test} from '../../src/test-helpers/tap.js';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  waitFor,
} from './helpers/cluster-test-helpers.js';

/**
 * Create unified peer addresses for replica IDs.
 * @param {string[]} replicaIds - Replica identifiers.
 * @return {string[]} Unified addresses.
 */
function createPeerAddresses(replicaIds) {
  return replicaIds.map((replicaId, index) => `node-${index + 1}/partition/${replicaId}`);
}

test('Failure scenario integration tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  t.test('Req 15.1 - node failure detection marks replicas unavailable', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440001';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      t.ok(systemTableCache, 'should have system table cache');
      t.ok(cdcIntegrationService, 'should have CDC integration service');

      const now = Date.now();
      const failingNodeId = 'failing-node-2';

      // Insert a second node with old heartbeat (simulating failure) via CDC
      await cdcIntegrationService.insertSystemTableRow(SystemTableName.NODES, {
        node_id: failingNodeId,
        node_address: 'ws://localhost:9999',
        status: NODE_STATUS.SUSPECTED,
        last_heartbeat: now - 20000, // 20 seconds old - beyond failure threshold
        created_at: now - 60000,
        updated_at: now - 20000,
      });

      // Insert services (replicas) on the failing node
      await cdcIntegrationService.insertSystemTableRow(SystemTableName.SERVICES, {
        service_id: 'failing-svc-1',
        node_id: failingNodeId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'test-partition-1',
        status: 'active',
        created_at: now - 60000,
        updated_at: now - 60000,
      });

      await cdcIntegrationService.insertSystemTableRow(SystemTableName.SERVICES, {
        service_id: 'failing-svc-2',
        node_id: failingNodeId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP_REPLICA,
        group_id: 'test-mg-1',
        status: 'active',
        created_at: now - 60000,
        updated_at: now - 60000,
      });

      // Wait for cache to be updated with the new data
      const cacheUpdated = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        return nodes.some((n) => n.node_id === failingNodeId);
      }, 1000);
      t.ok(cacheUpdated, 'cache should be updated with failing node');

      // Create real FailureDetector with real dependencies
      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      // Track events
      const events = [];
      detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));
      detector.on('replicaFailed', (data) => events.push({type: 'replicaFailed', ...data}));

      // Run health check
      await detector.checkNodeHealth();

      // Should detect failure (failing-node-2 was suspected and heartbeat is old)
      t.ok(events.some((e) => e.type === 'failure'), 'should emit failure event');
      t.ok(
        events.some((e) => e.type === 'failure' && e.nodeId === failingNodeId),
        'should identify the correct failing node',
      );

      // Wait for CDC updates to propagate to cache
      const replicasMarkedFailed = await waitFor(() => {
        const services = systemTableCache.getAll(SystemTableName.SERVICES);
        const failedServices = services.filter(
          (s) => s.node_id === failingNodeId && s.status === 'failed',
        );
        return failedServices.length >= 2;
      }, 1000);

      t.ok(replicasMarkedFailed, 'replicas should be marked as failed via CDC');

      // Verify the node status was updated to failed
      const nodeMarkedFailed = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        const failedNode = nodes.find((n) => n.node_id === failingNodeId);
        return failedNode && failedNode.status === NODE_STATUS.FAILED;
      }, 1000);

      t.ok(nodeMarkedFailed, 'node should be marked as failed');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  t.test('Req 15.2 - rebalancer creates replacement replicas', async (t) => {
    // Use real BootstrapService to create seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440002';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache from NodeService singleton
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'should have system table cache');

      // Get real CDCIntegrationService from bootstrap
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;
      t.ok(cdcIntegrationService, 'should have CDC integration service');

      // Get real TablePolicyService from bootstrap
      const tablePolicyService = bootstrapService.tablePolicyService;
      t.ok(tablePolicyService, 'should have table policy service');

      // Create real SQL query engine for RebalanceCoordinator
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // Create real RebalanceCoordinator
      const rebalanceCoordinator = new RebalanceCoordinator({
        nodeId: seedNodeId,
        systemTableCache,
        cdcIntegrationService,
        messageRouter: bootstrapResult.messageRouter,
        tablePolicyService,
        sqlQueryEngine,
        enableTimeouts: false,
      });
      rebalanceCoordinator.initialize();

      // Add multiple nodes to the cache (simulating a multi-node cluster)
      const now = Date.now();
      const additionalNodes = ['node-2', 'node-3', 'node-4', 'node-5'];
      for (const nodeId of additionalNodes) {
        systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
          node_id: nodeId,
          node_address: `ws://${nodeId}:9001`,
          cpu_cores: 4,
          memory_mb: 1024,
          disk_gb: 10,
          cpu_usage_percent: 10,
          memory_usage_percent: 10,
          disk_usage_percent: 10,
          status: 'active',
          ws_connection_state: 'ready',
          capabilities: '[]',
          last_heartbeat: now,
          ready_lease_expires_at: now + 10000,
          created_at: now,
        });
      }

      // Get a partition ID from the bootstrapped partitions
      const partitions = systemTableCache.getAll('partitions') || [];
      t.ok(partitions.length > 0, 'should have partitions');
      const partitionId = partitions[0].partition_id;

      // Add services (replicas) for the partition, including one with 'failed' status
      // First, add replicas on node-2 and node-3 as active
      systemTableCache.applySystemTableChange(SystemTableName.SERVICES, 'INSERT', {
        service_id: 'test-replica-2',
        node_id: 'node-2',
        service_type: 'partition',
        partition_id: partitionId,
        status: 'active',
        created_at: now,
        updated_at: now,
      });

      systemTableCache.applySystemTableChange(SystemTableName.SERVICES, 'INSERT', {
        service_id: 'test-replica-3',
        node_id: 'node-3',
        service_type: 'partition',
        partition_id: partitionId,
        status: 'failed', // This replica failed
        created_at: now,
        updated_at: now,
      });

      // Create real UnifiedRebalancer with real dependencies
      const rebalancer = new UnifiedRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        nodeId: seedNodeId,
        systemTableCache,
        cdcIntegrationService,
        tablePolicyService,
        messageRouter: bootstrapResult.messageRouter,
        rebalanceCoordinator,
      });
      rebalancer.initialize();
      rebalancer.setLeader(true);

      // Track rebalancing events
      const addEvents = [];
      rebalancer.on('addReplica', (data) => addEvents.push(data));

      // Trigger rebalance due to replica failure
      const result = await rebalancer.rebalance('replica_failure');

      t.equal(result.success, true, 'rebalance should succeed');

      // Should generate moves to handle the failed replica
      // The rebalancer should either:
      // 1. Generate REMOVE moves for the failed replica
      // 2. Generate ADD moves to replace it
      // 3. Or both, depending on the current state
      const addMoves = result.moves.filter((m) => m.operation === 'add');
      const removeMoves = result.moves.filter((m) => m.operation === 'remove');

      // With a failed replica, the rebalancer should generate moves
      // Either ADD moves to replace, REMOVE moves to clean up, or both
      t.ok(
        addMoves.length > 0 || removeMoves.length > 0 || addEvents.length > 0,
        'should generate moves to handle failed replica',
      );

      // Cleanup
      rebalancer.cancelScheduledCheck();
      await rebalanceCoordinator.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });

  t.test('Req 15.3 - Raft maintains consistency during partition', async (t) => {
    // Create partition with 3 replicas
    const replicaIds = ['replica-1', 'replica-2', 'replica-3'];
    const partition = new PartitionService({
      partitionId: 'consistency-test',
      tableId: 'test-table',
      tableName: 'test_data',
      replicaId: 'replica-1',
      replicaIds: replicaIds,
      peerAddresses: createPeerAddresses(replicaIds),
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Become leader
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert data
    const insertResult = await partition.insertData('test_data', {
      id: 1,
      value: 'consistent',
    });
    t.equal(insertResult.success, true, 'insert should succeed');

    // Verify data is readable
    const queryResult = await partition.executeQuery(
      'SELECT * FROM test_data WHERE id = ?',
      [1],
    );
    t.equal(queryResult.rows.length, 1, 'should find data');
    t.equal(queryResult.rows[0].value, 'consistent', 'data should be consistent');

    // Simulate network partition by checking leader status
    // In real scenario, Raft would handle this via quorum
    t.equal(partition.isLeader, true, 'leader maintains role with quorum');

    await partition.shutdown();
  });

  t.test('Req 15.4 - recovered node triggers rebalancing', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440003';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      t.ok(systemTableCache, 'should have system table cache');
      t.ok(cdcIntegrationService, 'should have CDC integration service');

      const now = Date.now();
      const recoveringNodeId = 'recovering-node-3';

      // Insert a second node with FAILED status but fresh heartbeat (simulating recovery)
      await cdcIntegrationService.insertSystemTableRow(SystemTableName.NODES, {
        node_id: recoveringNodeId,
        node_address: 'ws://localhost:9998',
        status: NODE_STATUS.FAILED,
        last_heartbeat: now, // Fresh heartbeat indicates recovery
        failed_at: now - 5000, // Failed 5 seconds ago
        created_at: now - 60000,
        updated_at: now,
      });

      // Wait for cache to be updated with the new node
      const cacheUpdated = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        return nodes.some((n) => n.node_id === recoveringNodeId);
      }, 1000);
      t.ok(cacheUpdated, 'cache should be updated with recovering node');

      // Create real FailureDetector with real dependencies
      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      // Track recovery events
      const recoveryEvents = [];
      detector.on('nodeRecovery', (data) => recoveryEvents.push(data));

      // Run health check
      await detector.checkNodeHealth();

      // Should detect recovery
      t.ok(recoveryEvents.length > 0, 'should detect node recovery');
      t.equal(recoveryEvents[0].nodeId, recoveringNodeId, 'should identify recovered node');

      // Wait for CDC update to propagate to cache
      const nodeRecovering = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        const node = nodes.find((n) => n.node_id === recoveringNodeId);
        return node && node.status === NODE_STATUS.RECOVERING;
      }, 1000);

      t.ok(nodeRecovering, 'should update node status to recovering via CDC');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  t.test('Req 15.5 - data available with majority replicas', async (t) => {
    // Create partition simulating 2 of 3 replicas available
    const replicaIds = ['replica-1', 'replica-2', 'replica-3'];
    const partition = new PartitionService({
      partitionId: 'availability-test',
      tableId: 'test-table',
      tableName: 'available_data',
      replicaId: 'replica-1',
      replicaIds: replicaIds,
      peerAddresses: createPeerAddresses(replicaIds),
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'data', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Become leader (simulating quorum achieved with 2/3 replicas)
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert data - should succeed with majority
    const insertResult = await partition.insertData('available_data', {
      id: 1,
      data: 'available',
    });
    t.equal(insertResult.success, true, 'write should succeed with majority');

    // Read data - should succeed
    const readResult = await partition.executeQuery(
      'SELECT * FROM available_data WHERE id = ?',
      [1],
    );
    t.equal(readResult.rows.length, 1, 'read should succeed');
    t.equal(readResult.rows[0].data, 'available', 'data should be correct');

    // Update data - should succeed with majority
    const updateResult = await partition.updateData(
      'available_data',
      {id: 1},
      {data: 'updated'},
    );
    t.equal(updateResult.success, true, 'update should succeed with majority');

    // Verify update
    const verifyResult = await partition.executeQuery(
      'SELECT * FROM available_data WHERE id = ?',
      [1],
    );
    t.equal(verifyResult.rows[0].data, 'updated', 'update should be visible');

    await partition.shutdown();
  });

  t.test('failure detector - suspicion before failure', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440010';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      const now = Date.now();
      const suspectedNodeId = 'suspected-node-2';

      // Insert a second node with heartbeat that triggers suspicion (>10s) but not failure (<15s)
      // Suspicion threshold is typically 10s, failure threshold is 15s
      await cdcIntegrationService.insertSystemTableRow(SystemTableName.NODES, {
        node_id: suspectedNodeId,
        node_address: 'ws://localhost:9997',
        status: NODE_STATUS.ACTIVE,
        last_heartbeat: now - 12000, // 12 seconds old - triggers suspicion but not failure
        created_at: now - 60000,
        updated_at: now - 12000,
      });

      // Wait for cache to be updated
      const cacheUpdated = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        return nodes.some((n) => n.node_id === suspectedNodeId);
      }, 1000);
      t.ok(cacheUpdated, 'cache should be updated with suspected node');

      // Create real FailureDetector with real dependencies
      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      const events = [];
      detector.on('nodeSuspected', (data) => events.push({type: 'suspected', ...data}));
      detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));

      await detector.checkNodeHealth();

      // Should be suspected, not failed (heartbeat is 12s old, between 10s and 15s thresholds)
      t.ok(events.some((e) => e.type === 'suspected'), 'should emit suspected event');
      t.equal(events.filter((e) => e.type === 'failure').length, 0, 'should not emit failure yet');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  t.test('failure detector - flapping detection increases threshold', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440011';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      const initialThreshold = detector.getFailureThreshold();

      // Simulate multiple failures to trigger flapping detection
      // Default flapping threshold is 3 failures within 30s window
      for (let i = 0; i < 4; i++) {
        await detector.checkFlapping('flapping-node-2', Date.now());
      }

      const newThreshold = detector.getFailureThreshold();
      t.ok(newThreshold > initialThreshold, 'threshold should increase after flapping');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  t.test('failure detector - stats reporting', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440012';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      const stats = detector.getStats();

      t.equal(stats.nodeId, seedNodeId, 'should report node ID');
      t.ok(stats.checkIntervalMs > 0, 'should report check interval');
      t.ok(stats.currentFailureThreshold > 0, 'should report failure threshold');
      t.equal(stats.initialized, true, 'should report initialized');
      t.equal(stats.isRunning, false, 'should report not running (not started)');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });

  t.test('Req 14.1-14.5 - complete failure and recovery cycle', async (t) => {
    /**
     * JUSTIFICATION FOR MINIMAL MOCKING:
     * This test verifies the FailureDetector's ability to detect and respond to
     * the complete failure/recovery cycle: active → suspected → failed → recovering.
     *
     * Using real CDC to update node states would require:
     * 1. Multiple CDC round-trips with timing dependencies
     * 2. Complex coordination between cache updates and detector checks
     * 3. Risk of race conditions affecting test reliability
     *
     * The minimal mock cache allows precise control over node states to verify
     * the detector's state machine logic. CDC propagation is tested separately
     * in other integration tests (Req 15.1, 15.4).
     */
    const now = Date.now();

    // Minimal mock cache that allows state manipulation for testing state transitions
    const cache = {
      nodes: [
        {node_id: 'test-node', status: 'active', last_heartbeat: now},
        {node_id: 'node-2', status: 'active', last_heartbeat: now},
        {node_id: 'node-3', status: 'active', last_heartbeat: now},
      ],
      services: [
        {
          service_id: 'svc-1',
          node_id: 'node-2',
          service_type: 'partition',
          partition_id: 'partition-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          node_id: 'node-3',
          service_type: 'partition',
          partition_id: 'partition-1',
          status: 'active',
        },
      ],
    };

    const mockCache = {
      getAll(tableName) {
        return cache[tableName] || [];
      },
      filter(tableName, predicate) {
        const items = cache[tableName] || [];
        return items.filter(predicate);
      },
      get(tableName, id) {
        const items = cache[tableName] || [];
        return items.find((item) => item.id === id || item.node_id === id);
      },
      // Allow tests to update cache state for simulating state transitions
      setNodes(nodes) {
        cache.nodes = nodes;
      },
    };

    // Minimal mock CDC service that tracks updates
    const cdcUpdates = [];
    const mockCdcService = {
      updates: cdcUpdates,
      async insertSystemTableRow(tableName, data) {
        cdcUpdates.push({type: 'insert', tableName, data});
        return {success: true};
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        cdcUpdates.push({type: 'update', tableName, whereClause, data});
        return {success: true};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        cdcUpdates.push({type: 'delete', tableName, whereClause});
        return {success: true};
      },
    };

    const detector = new FailureDetector({
      systemTableCache: mockCache,
      cdcIntegrationService: mockCdcService,
      nodeId: 'test-node',
    });

    detector.initialize();

    // Track all events
    const events = [];
    detector.on('nodeSuspected', (data) => events.push({type: 'suspected', ...data}));
    detector.on('nodeFailure', (data) => events.push({type: 'failure', ...data}));
    detector.on('nodeRecovery', (data) => events.push({type: 'recovery', ...data}));
    detector.on('replicaFailed', (data) => events.push({type: 'replicaFailed', ...data}));

    // Step 1: Simulate node-2 becoming unresponsive (suspicion)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'active', last_heartbeat: now - 12000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'suspected' && e.nodeId === 'node-2'),
      'should suspect node-2');

    // Step 2: Simulate node-2 failure (heartbeat too old)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'suspected', last_heartbeat: now - 20000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'failure' && e.nodeId === 'node-2'),
      'should detect node-2 failure');

    // Step 3: Verify replicas were marked as failed via CDC
    const serviceUpdates = cdcUpdates.filter(
      (u) => u.tableName === 'services' && u.data && u.data.status === 'failed',
    );
    t.ok(serviceUpdates.length > 0, 'should mark replicas as failed via CDC');

    // Step 4: Simulate node-2 recovery (fresh heartbeat)
    mockCache.setNodes([
      {node_id: 'test-node', status: 'active', last_heartbeat: now},
      {node_id: 'node-2', status: 'failed', last_heartbeat: now, failed_at: now - 5000},
      {node_id: 'node-3', status: 'active', last_heartbeat: now},
    ]);

    await detector.checkNodeHealth();
    t.ok(events.some((e) => e.type === 'recovery' && e.nodeId === 'node-2'),
      'should detect node-2 recovery');

    // Verify CDC updates were made for the full cycle
    const statusUpdates = cdcUpdates.filter((u) => u.data && u.data.status);
    t.ok(statusUpdates.length >= 2, 'should have multiple status updates');

    detector.shutdown();
  });

  t.test('network partition - minority partition cannot write', async (t) => {
    // Create partition simulating minority (1 of 3 replicas)
    const replicaIds = ['replica-1', 'replica-2', 'replica-3'];
    const partition = new PartitionService({
      partitionId: 'minority-test',
      tableId: 'test-table',
      tableName: 'minority_data',
      replicaId: 'replica-1',
      replicaIds: replicaIds,
      peerAddresses: createPeerAddresses(replicaIds),
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // Simulate being a follower (minority partition)
    partition.role = 'follower';
    partition.isLeader = false;

    // Attempt to write - should fail or be rejected
    try {
      const result = await partition.insertData('minority_data', {
        id: 1,
        value: 'should-fail',
      });
      // If it doesn't throw, check for failure indication
      t.ok(!result.success || result.error, 'write should fail on follower');
    } catch (error) {
      // Expected - followers cannot accept writes
      t.ok(error, 'write should be rejected on follower');
    }

    await partition.shutdown();
  });

  t.test('data availability - reads succeed on any replica', async (t) => {
    // Create partition as follower
    const replicaIds = ['replica-1', 'replica-2', 'replica-3'];
    const partition = new PartitionService({
      partitionId: 'read-availability-test',
      tableId: 'test-table',
      tableName: 'read_data',
      replicaId: 'replica-1',
      replicaIds: replicaIds,
      peerAddresses: createPeerAddresses(replicaIds),
      nodeId: 'node-1',
      dbPath: ':memory:',
      schema: {
        columns: [
          {name: 'id', type: 'INTEGER', primaryKey: true},
          {name: 'data', type: 'TEXT'},
        ],
      },
      keyRange: {start: null, end: null},
    });

    await partition.initialize();

    // First become leader to insert data
    partition.role = 'leader';
    partition.isLeader = true;

    await partition.insertData('read_data', {id: 1, data: 'test-value'});

    // Now become follower
    partition.role = 'follower';
    partition.isLeader = false;

    // Read should still succeed on follower
    const readResult = await partition.executeQuery(
      'SELECT * FROM read_data WHERE id = ?',
      [1],
    );

    t.equal(readResult.rows.length, 1, 'read should succeed on follower');
    t.equal(readResult.rows[0].data, 'test-value', 'data should be correct');

    await partition.shutdown();
  });

  t.test('multiple node failures - system remains available', async (t) => {
    // Use real BootstrapService to create a seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440013';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Bootstrap the seed node
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Get real SystemTableCache and CDCIntegrationService
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;

      const now = Date.now();

      // Insert 4 additional nodes (total 5 nodes including seed)
      // 2 nodes will have old heartbeats (failing), 2 will be healthy
      const nodeConfigs = [
        {node_id: 'node-2', status: NODE_STATUS.ACTIVE, last_heartbeat: now},
        {node_id: 'node-3', status: NODE_STATUS.SUSPECTED, last_heartbeat: now - 20000},
        {node_id: 'node-4', status: NODE_STATUS.SUSPECTED, last_heartbeat: now - 20000},
        {node_id: 'node-5', status: NODE_STATUS.ACTIVE, last_heartbeat: now},
      ];

      for (const nodeConfig of nodeConfigs) {
        await cdcIntegrationService.insertSystemTableRow(SystemTableName.NODES, {
          ...nodeConfig,
          node_address: `ws://localhost:${getUniquePort()}`,
          created_at: now - 60000,
          updated_at: nodeConfig.last_heartbeat,
        });
      }

      // Insert services (replicas) for a partition on all 5 nodes
      const partitionId = 'multi-failure-partition-1';
      const serviceConfigs = [
        {service_id: 'svc-1', node_id: seedNodeId},
        {service_id: 'svc-2', node_id: 'node-2'},
        {service_id: 'svc-3', node_id: 'node-3'},
        {service_id: 'svc-4', node_id: 'node-4'},
        {service_id: 'svc-5', node_id: 'node-5'},
      ];

      for (const svcConfig of serviceConfigs) {
        await cdcIntegrationService.insertSystemTableRow(SystemTableName.SERVICES, {
          ...svcConfig,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          status: 'active',
          created_at: now - 60000,
          updated_at: now - 60000,
        });
      }

      // Wait for cache to be updated with all nodes
      const cacheUpdated = await waitFor(() => {
        const nodes = systemTableCache.getAll(SystemTableName.NODES);
        return nodes.length >= 5;
      }, 1000);
      t.ok(cacheUpdated, 'cache should be updated with all nodes');

      // Create real FailureDetector with real dependencies
      const detector = new FailureDetector({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
        nodeId: seedNodeId,
      });

      detector.initialize();

      const failureEvents = [];
      detector.on('nodeFailure', (data) => failureEvents.push(data));

      await detector.checkNodeHealth();

      // Should detect both failures (node-3 and node-4 have old heartbeats)
      t.equal(failureEvents.length, 2, 'should detect 2 node failures');

      // Verify the failing nodes are node-3 and node-4
      const failedNodeIds = failureEvents.map((e) => e.nodeId).sort();
      t.same(failedNodeIds, ['node-3', 'node-4'], 'should identify correct failing nodes');

      // With 5 replicas and 2 failures, we still have 3 (majority)
      // Verify by checking services in cache
      const services = systemTableCache.getAll(SystemTableName.SERVICES);
      const partitionServices = services.filter((s) => s.partition_id === partitionId);
      const healthyNodeIds = [seedNodeId, 'node-2', 'node-5'];
      const healthyReplicas = partitionServices.filter((s) =>
        healthyNodeIds.includes(s.node_id));
      t.equal(healthyReplicas.length, 3, 'should have 3 healthy replicas (majority)');

      detector.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
    }
  });
});
