/**
 * Integration test: control plane dispatch of replica operations.
 * Requirements: 5.2, 5.3, 5.4
 *
 * Refactored to use real components from BootstrapService instead of mocks.
 * Requirements: 1.1, 2.1, 2.2, 3.1, 3.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {STATE} from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  waitFor,
} from './helpers/cluster-test-helpers.js';

test('Control plane dispatch integration', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('dispatches replica operation to target node', async (t) => {
    // Use real BootstrapService to create seed node
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440050';
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

      // Track deliveries by wrapping the real message router's deliver method
      // Only intercept deliveries to replica-handler, let SQL queries go through normally
      const deliveries = [];
      const realMessageRouter = bootstrapResult.messageRouter;
      const originalDeliver = realMessageRouter.deliver.bind(realMessageRouter);

      // Create a wrapper that tracks deliveries to replica-handler
      // but lets other deliveries (like SQL queries) go through normally
      realMessageRouter.deliver = async (target, payload, options) => {
        // Only intercept deliveries to replica-handler on the target node
        if (target && target.includes('/service/replica-handler')) {
          deliveries.push({target, payload, options});
          // Return a successful INITIATED response to allow the workflow to proceed
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        }
        // Let all other deliveries (SQL queries, etc.) go through normally
        return originalDeliver(target, payload, options);
      };

      // Override connection state checks to allow dispatch to the target node
      const originalGetConnectionState = realMessageRouter.getConnectionState ?
        realMessageRouter.getConnectionState.bind(realMessageRouter) : null;
      const originalIsOutboundQueueAvailable = realMessageRouter.isOutboundQueueAvailable ?
        realMessageRouter.isOutboundQueueAvailable.bind(realMessageRouter) : null;

      realMessageRouter.getConnectionState = (nodeId) => {
        // Return connected for the target node, use original for others
        if (nodeId === 'node-target-dispatch') {
          return STATE.CONNECTED;
        }
        return originalGetConnectionState ? originalGetConnectionState(nodeId) : STATE.CONNECTED;
      };
      realMessageRouter.isOutboundQueueAvailable = (nodeId) => {
        // Return true for the target node, use original for others
        if (nodeId === 'node-target-dispatch') {
          return true;
        }
        return originalIsOutboundQueueAvailable ?
          originalIsOutboundQueueAvailable(nodeId) : true;
      };

      // Create real SQL query engine
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: realMessageRouter,
        nodeId: seedNodeId,
      });

      // Create real RebalanceCoordinator
      const rebalanceCoordinator = new RebalanceCoordinator({
        nodeId: seedNodeId,
        systemTableCache,
        cdcIntegrationService,
        messageRouter: realMessageRouter,
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
        messageRouter: realMessageRouter,
        rebalanceCoordinator,
      });
      controlPlane.initialize();

      // Attach message group services to control plane for CDC event handling
      for (const mgService of bootstrapResult.messageGroupServices.values()) {
        controlPlane.attachMessageGroupService(mgService);
      }

      // Add a target node to the cache (simulating a node that has joined and is ready)
      const now = Date.now();
      const targetNodeId = 'node-target-dispatch';
      systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
        node_id: targetNodeId,
        node_address: 'ws://node-target-dispatch:9001',
        cpu_cores: 4,
        memory_mb: 1024,
        disk_gb: 10,
        cpu_usage_percent: 10,
        memory_usage_percent: 10,
        disk_usage_percent: 10,
        status: NodeStatus.ACTIVE,
        ws_connection_state: STATE.READY,
        capabilities: '[]',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
        created_at: now,
      });

      // Get a partition ID from the bootstrapped partitions
      const partitions = systemTableCache.getAll('partitions') || [];
      t.ok(partitions.length > 0, 'should have partitions');
      const partitionId = partitions[0].partition_id;

      // Create a replica operation using the real coordinator
      // This will trigger the real CDC flow:
      // 1. Operation is persisted via SQL engine
      // 2. CDC event is emitted when the operation is written to the partition
      // 3. ControlPlaneService handles the CDC event (via attached message group services)
      // 4. Operation is dispatched to target node's replica-handler
      const operation = await rebalanceCoordinator.createOperation({
        type: 'ADD',
        partitionId,
        nodeId: targetNodeId,
        replicaId: `replica-${targetNodeId}-${partitionId}`,
      });

      t.ok(operation, 'should create operation');
      t.ok(operation.operationId, 'operation should have ID');

      // Wait for the CDC event to be processed and the operation to be dispatched
      // The real flow is asynchronous: create -> persist -> CDC -> dispatch
      const dispatched = await waitFor(() => deliveries.length >= 1, 1000, 25);
      t.ok(dispatched, 'operation should be dispatched via CDC flow');

      // Verify the operation was dispatched
      t.ok(deliveries.length >= 1, 'should dispatch replica operation');
      t.equal(
        deliveries[0].target,
        `${targetNodeId}/service/replica-handler`,
        'should target replica-handler on target node',
      );

      // Verify the operation moved to CREATING state
      const updatedOperation = systemTableCache.get(
        SystemTableName.REPLICA_OPERATIONS,
        operation.operationId,
      );
      t.equal(updatedOperation.workflow_step, 'CREATING', 'operation should move to CREATING');

      // Restore original deliver method before cleanup
      realMessageRouter.deliver = originalDeliver;

      // Cleanup
      controlPlane.shutdown();
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
});
