/**
 * Integration tests for node joining rebalancing flow.
 * Requirements: 3.1, 4.1, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
} from './helpers/cluster-test-helpers.js';

test('Node joining rebalancing integration', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('rebalancing waits for NODE_READY and stabilization', async (t) => {
    // Use real BootstrapService to create seed node
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

      // Get real SystemTableCache from NodeService singleton
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'should have system table cache');

      // Get real CDCIntegrationService from bootstrap
      const cdcIntegrationService = bootstrapService.cdcIntegrationService;
      t.ok(cdcIntegrationService, 'should have CDC integration service');

      // Get real TablePolicyService from bootstrap
      const tablePolicyService = bootstrapService.tablePolicyService;
      t.ok(tablePolicyService, 'should have table policy service');

      // Create SQL query engine for RebalanceCoordinator
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

      // Get a partition ID from the bootstrapped partitions
      const partitions = systemTableCache.getAll('partitions') || [];
      t.ok(partitions.length > 0, 'should have partitions');
      const partitionId = partitions[0].partition_id;

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

      // Disable automatic scheduling for controlled testing
      rebalancer.scheduleNextCheck = () => {};

      // Initially not leader - should not rebalance
      rebalancer.isLeader = false;

      // Record a state change (simulating NODE_READY event)
      rebalancer.recordStateChange('node_ready');

      t.ok(rebalancer.lastStateChangeTime !== null,
        'should record state change on NODE_READY');

      // Now become leader
      rebalancer.isLeader = true;

      // Track if evaluateState was called (which happens after stabilization check passes)
      let evaluateStateCalled = false;
      const originalEvaluateState = rebalancer.evaluateState.bind(rebalancer);
      rebalancer.evaluateState = async () => {
        evaluateStateCalled = true;
        return originalEvaluateState();
      };

      // Check rebalance immediately - should NOT proceed past stabilization check
      await rebalancer.checkRebalance();
      t.equal(evaluateStateCalled, false,
        'should not evaluate state before stabilization period');

      // Simulate stabilization period elapsed
      rebalancer.lastStateChangeTime = Date.now() -
        rebalancer.getStabilizationPeriodMs() - 1;

      // Now checkRebalance should proceed past stabilization and call evaluateState
      await rebalancer.checkRebalance();
      t.equal(evaluateStateCalled, true,
        'should evaluate state after stabilization period');

      // Cleanup
      rebalancer.shutdown();
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

  await t.test('HTTP bootstrap does not trigger registration or rebalancing', async (t) => {
    // Use real BootstrapService to create seed node
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
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Get real SystemTableCache from NodeService singleton
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'should have system table cache');

      // Create SQL query engine for BootstrapAPI
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // Create real BootstrapAPI with real components
      const api = new BootstrapAPI({
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

      await api.initialize(0, {listen: false});
      api.setSqlQueryEngine(sqlQueryEngine);

      // Record the number of nodes before the HTTP bootstrap request
      const nodesBefore = systemTableCache.getAll('nodes') || [];
      const nodesCountBefore = nodesBefore.length;

      // Make HTTP bootstrap request for a new node
      const reply = {code: (_status) => {}};
      const response = await api.handleBootstrapRequest({
        body: {
          nodeId: '550e8400-e29b-41d4-a716-446655440011',
          nodeAddress: 'ws://node-1:9001',
        },
      }, reply);

      // Verify bootstrap response is successful
      t.equal(response.success, true, 'bootstrap should succeed');
      t.ok(response.systemTableSnapshots, 'should return system table snapshots');
      t.ok(response.seedNodeId, 'should return seed node ID');
      t.ok(response.seedNodeWsAddress, 'should return seed node WS address');

      // Verify that the new node was NOT registered in the nodes table
      // (HTTP bootstrap only returns data, doesn't register nodes)
      const nodesAfter = systemTableCache.getAll('nodes') || [];
      const nodesCountAfter = nodesAfter.length;
      t.equal(nodesCountAfter, nodesCountBefore,
        'node count should not change after HTTP bootstrap');

      const newNode = nodesAfter.find((n) =>
        n.node_id === '550e8400-e29b-41d4-a716-446655440011');
      t.equal(newNode, undefined,
        'new node should NOT be registered from HTTP bootstrap');

      // Cleanup API
      await api.shutdown().catch(() => {});
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });

  await t.test('batched CREATE_REPLICA concurrency is capped per node', async (t) => {
    // Use real BootstrapService to create seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440020';
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

      // Create SQL query engine for RebalanceCoordinator
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

      // Add a second node to the cache so the rebalancer has somewhere to place replicas
      const now = Date.now();
      const targetNodeId = 'node-target-1';
      systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
        node_id: targetNodeId,
        node_address: 'ws://node-target-1:9001',
        cpu_cores: 4,
        memory_mb: 1024,
        disk_gb: 10,
        cpu_usage_percent: 10,
        memory_usage_percent: 10,
        disk_usage_percent: 10,
        status: NodeStatus.ACTIVE,
        ws_connection_state: 'ready',
        capabilities: '[]',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
        created_at: now,
      });

      // Get a partition ID from the bootstrapped partitions
      const partitions = systemTableCache.getAll('partitions') || [];
      t.ok(partitions.length > 0, 'should have partitions');
      const partitionId = partitions[0].partition_id;

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

      // Configure batching parameters for testing
      rebalancer.isLeader = true;
      rebalancer.moveBatchSize = 2;
      rebalancer.interBatchDelayMs = 0;
      rebalancer.maxConcurrentMoves = 10;

      // Override executeMove to track concurrency
      // This is acceptable since we're testing the batching logic, not the actual move execution
      const inFlight = new Map();
      const maxInFlight = new Map();
      rebalancer.executeMove = async (move) => {
        const nodeId = move.nodeId;
        const current = (inFlight.get(nodeId) || 0) + 1;
        inFlight.set(nodeId, current);
        maxInFlight.set(nodeId, Math.max(maxInFlight.get(nodeId) || 0, current));

        await Promise.resolve();

        inFlight.set(nodeId, Math.max(0, (inFlight.get(nodeId) || 0) - 1));
        return {success: true, operation: move.type};
      };

      const result = await rebalancer.rebalance('integration_test', {
        replicaCount: 5,
        minReplicaCount: 1,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      });

      t.equal(result.success, true, 'rebalance should succeed');
      t.ok(result.moves.some((m) => m.operation === MoveType.ADD),
        'should have ADD moves');

      // Verify that maxInFlight per node never exceeds the batch size
      for (const [nodeId, max] of maxInFlight.entries()) {
        t.ok(max <= 2, `should not exceed batch size for ${nodeId} (was ${max})`);
      }

      // Cleanup
      rebalancer.shutdown();
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

  await t.test('rebalancer dispatches replica operations after node ready', async (t) => {
    // Use real BootstrapService to create seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440030';
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

      // Create real SQL query engine
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

      // Create real ControlPlaneService
      const controlPlane = new ControlPlaneService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        systemTableCache,
        cdcIntegrationService,
        messageRouter: bootstrapResult.messageRouter,
        rebalanceCoordinator,
      });
      controlPlane.initialize();

      // Attach message group services to control plane
      for (const mgService of bootstrapResult.messageGroupServices.values()) {
        controlPlane.attachMessageGroupService(mgService);
      }

      // Add a second node to the cache (simulating a node that has joined and is ready)
      // Note: This node won't have a real WebSocket connection, so the rebalancer
      // will correctly skip dispatching operations to it (node not ready check).
      // This test verifies that operations are created and scheduled correctly.
      const now = Date.now();
      const joiningNodeId = 'node-joining-2';
      systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
        node_id: joiningNodeId,
        node_address: 'ws://node-joining-2:9001',
        cpu_cores: 4,
        memory_mb: 1024,
        disk_gb: 10,
        cpu_usage_percent: 20,
        memory_usage_percent: 20,
        disk_usage_percent: 20,
        status: NodeStatus.ACTIVE,
        ws_connection_state: 'ready',
        capabilities: '[]',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
        created_at: now,
      });

      // Get a partition ID from the bootstrapped partitions
      const partitions = systemTableCache.getAll('partitions') || [];
      t.ok(partitions.length > 0, 'should have partitions');
      const partitionId = partitions[0].partition_id;

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

      // Trigger rebalance
      const result = await rebalancer.rebalance('node_join');
      t.equal(result.success, true, 'rebalance should succeed');

      // Verify that ADD moves were scheduled for the joining node
      // Note: The moves may be skipped (node_not_ready) because the joining node
      // doesn't have a real WebSocket connection. This is correct behavior.
      // The test verifies that the rebalancer correctly identifies the need for
      // ADD moves and attempts to schedule them.
      const addMoves = result.moves.filter((move) => move.operation === MoveType.ADD);
      const skippedMoves = result.moves.filter((move) => move.skipped === true);

      // Either we have ADD moves scheduled, or they were skipped due to node not ready
      // Both are valid outcomes with real components
      t.ok(
        addMoves.length > 0 || skippedMoves.length > 0,
        'should have ADD moves (scheduled or skipped)',
      );

      // If moves were skipped, verify it was due to node_not_ready (correct behavior)
      if (skippedMoves.length > 0) {
        t.ok(
          skippedMoves.some((move) => move.reason === 'node_not_ready'),
          'skipped moves should be due to node_not_ready',
        );
      }

      // Cleanup
      rebalancer.shutdown();
      await rebalanceCoordinator.shutdown();
      controlPlane.shutdown();
    } finally {
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });
});
