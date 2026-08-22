/**
 * Integration test: control plane dispatch of replica operations.
 * Requirements: 5.2, 5.3, 5.4
 *
 * Uses the real control-plane services created and owned by
 * BootstrapService (single-owner contract: bootstrap attaches the
 * message-group services to its ReplicaDispatchService exactly once;
 * the test must consume those instances, never construct duplicates).
 * Requirements: 1.1, 2.1, 2.2, 3.1, 3.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ClusterReadinessSignal} from '../../src/rebalancer/cluster-readiness-signal.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {CDCPipelineReadinessGate} from '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cache-constants.js';
import {STATE} from '../../src/constants/index.js';
import {CDCConfirmationTracker} from '../../src/cdc/cdc-confirmation-tracker.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  waitFor,
} from './helpers/cluster-test-helpers.js';

async function shutdownOrFail(t, promise, label) {
  try {
    await promise;
  } catch (error) {
    t.comment(`${label}: ${error.message}`);
    throw error;
  }
}

test('Control plane dispatch integration', async (t) => {
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

      // Track remote deliveries through one controlled remote-delivery path.
      const deliveries = [];
      const realMessageRouter = bootstrapResult.messageRouter;
      const originalDeliverRemote =
        realMessageRouter.deliverRemote.bind(realMessageRouter);
      realMessageRouter.deliverRemote = async (
        targetAddress,
        messageId,
        payload,
        targetNodeId,
        correlationId,
      ) => {
        deliveries.push({
          target: targetAddress,
          payload,
          options: {
            targetNodeId,
            messageId,
            correlationId,
          },
        });
        return {
          messageId,
          correlationId,
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
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

      // Use the control-plane services created and owned by bootstrap.
      // Bootstrap already attached every message-group service to its
      // ReplicaDispatchService; re-attaching a second dispatch service
      // is forbidden by the single-completion-handler contract.
      const rebalanceCoordinator = bootstrapService.rebalanceCoordinator;
      t.ok(rebalanceCoordinator, 'bootstrap should own a rebalance coordinator');

      const dispatchSvc = bootstrapService.dispatchService;
      t.ok(dispatchSvc, 'bootstrap should own a replica dispatch service');
      t.ok(
        dispatchSvc.messageGroupServices.size > 0,
        'bootstrap dispatch service should already have message groups attached',
      );

      // Add a target node to the cache (simulating a node that has joined and is ready)
      const now = Date.now();
      const targetNodeId = 'node-target-dispatch';

      // Ensure the target node exists in SQL (ReplicaDispatchService uses SQLQueryEngine
      // to validate handler registration).
      await cdcIntegrationService.upsertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
        node_id: targetNodeId,
        node_address: 'ws://node-target-dispatch:9001',
        cpu_cores: 4,
        memory_mb: 1024,
        disk_gb: 10,
        storage_budget_bytes: 10 * 1024 * 1024 * 1024,
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

      // Target the operation-ledger partition (replica_operations-p1).
      // An ADD onto an emergency control-plane spine partition is exempt
      // from the operation-ledger quorum-spread hold, which otherwise
      // defers dependent admissions once a second ACTIVE node makes
      // spreading the concentrated single-node ledger quorum actionable.
      const ledgerPartitionId = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
      const systemPartitionReady = await waitFor(() => {
        const partitions = systemTableCache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || [];
        return partitions.some((p) => p?.partition_id === ledgerPartitionId);
      }, 3000, 25);
      t.ok(systemPartitionReady, 'should have the operation-ledger partition');

      const partitions = systemTableCache.getAll(SYSTEM_TABLE_NAME.PARTITIONS) || [];
      const selectedPartition = partitions.find(
        (p) => p?.partition_id === ledgerPartitionId,
      );
      t.ok(selectedPartition, 'should select the operation-ledger partition');
      const partitionId = selectedPartition.partition_id;

      // Deliberately do NOT pre-insert a SERVICES row for the target
      // replica: under the current contract an ACTIVE replica service row
      // for the exact target replica means "replica already exists", which
      // short-circuits the dispatch (workflow completes as ACTIVE with
      // reason dispatch_already_exists and no replica-handler delivery).

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
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operation.operationId,
        5000,
      );

      const expectedTarget =
        `${targetNodeId}/service/replica-handler`;
      const dispatched = await waitFor(
        () => deliveries.some((d) => d.target === expectedTarget),
        3000,
        25,
      );
      t.ok(dispatched, 'operation should be dispatched via CDC flow');

      // Verify the operation was dispatched to the correct target
      const replicaDelivery = deliveries.find(
        (d) => d.target === expectedTarget,
      );
      t.ok(replicaDelivery, 'should dispatch replica operation');
      t.equal(
        replicaDelivery.target,
        expectedTarget,
        'should target replica-handler on target node',
      );

      // Verify the operation advances beyond SENDING after the dispatch ACK.
      // In the full integration flow the transient CREATING step can be
      // observed or skipped if the operation converges to ACTIVE quickly.
      const progressedBeyondSending = await waitFor(() => {
        const current = systemTableCache.get(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          operation.operationId,
        );
        return current?.workflow_step === 'CREATING' ||
          current?.workflow_step === 'SYNCING' ||
          current?.workflow_step === 'ACTIVE';
      }, 1500, 25);
      const updatedOperation = systemTableCache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operation.operationId,
      );
      t.ok(
        progressedBeyondSending,
        `operation should advance beyond SENDING after dispatch (got ${updatedOperation?.workflow_step})`,
      );

      // Restore original router methods before cleanup; the control-plane
      // services themselves are owned (and shut down) by bootstrap.
      realMessageRouter.deliverRemote = originalDeliverRemote;
      if (originalGetConnectionState) {
        realMessageRouter.getConnectionState = originalGetConnectionState;
      }
      if (originalIsOutboundQueueAvailable) {
        realMessageRouter.isOutboundQueueAvailable =
          originalIsOutboundQueueAvailable;
      }

      cdcConfirmationTracker.shutdown();
    } finally {
      if (bootstrapService) {
        await shutdownOrFail(
          t,
          bootstrapService.shutdown(),
          'bootstrap shutdown failed',
        );
      }
      if (bootstrapResult?.messageRouter) {
        await shutdownOrFail(
          t,
          bootstrapResult.messageRouter.shutdown(),
          'message router shutdown failed',
        );
      }
    }
  });
});
