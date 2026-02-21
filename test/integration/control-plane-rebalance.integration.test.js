/**
 * Integration test: control plane dispatch of replica operations.
 * Requirements: 5.2, 5.3, 5.4
 *
 * Refactored to use real components from BootstrapService instead of mocks.
 * Requirements: 1.1, 2.1, 2.2, 3.1, 3.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {EndpointService} from '../../src/control-plane/endpoint-service.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {ClusterReadinessSignal} from '../../src/rebalancer/cluster-readiness-signal.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {CDCPipelineReadinessGate} from '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cache-constants.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {CDCConfirmationTracker} from '../../src/cdc/cdc-confirmation-tracker.js';
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

      const cdcReadinessGate = new CDCPipelineReadinessGate({
        systemTableCache,
        cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      });
      const clusterReadinessSignal = new ClusterReadinessSignal({
        cdcPipelineReadinessGate: cdcReadinessGate,
        systemTableCache,
        expectedNodeCount: 1,
      });

      const clusterReady = await waitFor(() => {
        const result = clusterReadinessSignal.evaluate({
          partitionServices: bootstrapResult.partitionServices,
          messageGroupServices: bootstrapResult.messageGroupServices,
        });
        return result.ready;
      }, 3000, 25);
      t.ok(clusterReady, 'cluster readiness should be satisfied');

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
        // Intercept handler deliveries to the fake target node.
        // This avoids needing a real network connection while preserving
        // the dispatch logic and payload formatting.
        if (
          typeof target === 'string' &&
          target.startsWith('node-target-dispatch/service/')
        ) {
          if (target.includes('/service/replica-handler')) {
          deliveries.push({target, payload, options});
          }
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

      // Create decomposed control-plane services
      const heartbeatSvc = new HeartbeatService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        cdcIntegrationService,
        systemTableCache,
      });
      heartbeatSvc.initialize();

      const leaseSvc = new LeaseService({
        nodeId: seedNodeId,
        cdcIntegrationService,
        systemTableCache,
        sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
      });
      leaseSvc.initialize();

      const endpointSvc = new EndpointService({
        nodeId: seedNodeId,
        cdcIntegrationService,
        systemTableCache,
        sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
      });
      endpointSvc.initialize();

      const dispatchSvc = new ReplicaDispatchService({
        nodeId: seedNodeId,
        messageRouter: realMessageRouter,
        cdcIntegrationService,
        systemTableCache,
        rebalanceCoordinator,
        sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
      });
      dispatchSvc.initialize();

      // Attach message group services for CDC event handling
      for (const mgService of
        bootstrapResult.messageGroupServices.values()) {
        dispatchSvc.attachMessageGroupService(mgService);
        leaseSvc.messageGroupServices.add(mgService);
      }

      // Add a target node to the cache (simulating a node that has joined and is ready)
      const now = Date.now();
      const targetNodeId = 'node-target-dispatch';

      // Ensure the target node exists in SQL (ReplicaDispatchService uses SQLQueryEngine
      // to validate handler registration).
      await cdcIntegrationService.upsertSystemTableRow(SystemTableName.NODES, {
        node_id: targetNodeId,
        node_address: 'ws://node-target-dispatch:9001',
        cpu_cores: 4,
        memory_mb: 1024,
        disk_gb: 10,
        cpu_usage_percent: 10,
        memory_usage_percent: 10,
        disk_usage_percent: 10,
        status: NodeStatus.ACTIVE,
        connection_state: STATE.READY,
        capabilities: '[]',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
        created_at: now,
        updated_at: now,
      });

      // Get a partition ID from the bootstrapped partitions
      const systemPartitionReady = await waitFor(() => {
        const partitions = systemTableCache.getAll(SystemTableName.PARTITIONS) || [];
        return partitions.some(
          (p) => typeof p?.partition_id === 'string' && p.partition_id.endsWith('-p1'),
        );
      }, 3000, 25);
      t.ok(systemPartitionReady, 'should have at least one system-table partition (*-p1)');

      const partitions = systemTableCache.getAll(SystemTableName.PARTITIONS) || [];
      const selectedPartition = partitions.find(
        (p) => typeof p?.partition_id === 'string' && p.partition_id.endsWith('-p1'),
      );
      t.ok(selectedPartition, 'should select a system-table partition');
      const partitionId = selectedPartition.partition_id;

      // Add a service entry for the target node so the handler
      // registration check in dispatchOperationRow passes.
      await cdcIntegrationService.upsertSystemTableRow(SystemTableName.SERVICES, {
        service_id: `replica-${targetNodeId}-${partitionId}`,
        node_id: targetNodeId,
        partition_id: partitionId,
        service_type: 'partition',
        status: SERVICE_STATUS.ACTIVE,
        address: `${targetNodeId}/partition/replica-${targetNodeId}-${partitionId}`,
        raft_role: 'follower',
        created_at: now,
        updated_at: now,
      });

      // The coordinator insert triggers a cache update async; ensure a deterministic
      // confirmation primitive is in place for subsequent waits.
      const cdcConfirmationTracker = new CDCConfirmationTracker({
        systemTableCache,
        timeoutMs: 5000,
      });

      // Create a replica operation using the real coordinator
      // This will trigger the real CDC flow:
      // 1. Operation is persisted via SQL engine
      // 2. CDC event is emitted when the operation is written to the partition
      // 3. ReplicaDispatchService handles the CDC event (via attached MGs)
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
      await cdcConfirmationTracker.awaitConfirmation(
        SystemTableName.REPLICA_OPERATIONS,
        operation.operationId,
        5000,
      );

      const dispatched = await waitFor(() => deliveries.length >= 1, 3000, 25);
      t.ok(dispatched, 'operation should be dispatched via CDC flow');

      // Verify the operation was dispatched
      t.ok(deliveries.length >= 1, 'should dispatch replica operation');
      t.equal(
        deliveries[0].target,
        `${targetNodeId}/service/replica-handler`,
        'should target replica-handler on target node',
      );

      // Verify the operation moves from SENDING to CREATING after dispatch ACK.
      const movedToCreating = await waitFor(() => {
        const current = systemTableCache.get(
          SystemTableName.REPLICA_OPERATIONS,
          operation.operationId,
        );
        return current?.workflow_step === 'CREATING';
      }, 1500, 25);
      const updatedOperation = systemTableCache.get(
        SystemTableName.REPLICA_OPERATIONS,
        operation.operationId,
      );
      t.ok(
        movedToCreating,
        `operation should move to CREATING (got ${updatedOperation?.workflow_step})`,
      );

      // Restore original deliver method before cleanup
      realMessageRouter.deliver = originalDeliver;

      cdcConfirmationTracker.shutdown();

      // Cleanup
      heartbeatSvc.stop();
      leaseSvc.stop();
      endpointSvc.stop();
      dispatchSvc.stop();
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
