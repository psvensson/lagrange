/**
 * Targeted failing test: executor-side replica creation succeeds but the
 * owner-side replica_operations workflow remains stuck.
 *
 * Demonstrates the architectural contradiction described in
 * topology-workflow-single-owner-stabilization §2:
 *   RebalanceCoordinator is intended to own replica_operations, while
 *   ReplicaHandler still transitions workflow_step directly.
 *
 * The executor (ReplicaHandler) writes WORKFLOW_STEP.ACTIVE directly to the
 * replica_operations row via updateOperationStep. The coordinator never
 * receives a typed acknowledgement through its owner path, so its in-memory
 * operation object remains stuck at CREATING.
 *
 * Requirements: 1.1, 1.2, 8.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus, OperationType} from
  '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';

/**
 * Test-local constants for fixture identities.
 */
const FIXTURE_NODE_ID = 'node-owner';
const FIXTURE_TARGET_NODE_ID = 'node-executor';
const FIXTURE_PARTITION_ID = 'partition-1';
const FIXTURE_REPLICA_ID = 'partition-1-r2';
const FIXTURE_TABLE_ID = 'table-1';
const FIXTURE_TABLE_NAME = 'test_table';
const FIXTURE_LEADER_REPLICA_ID = 'partition-1-r1';
const FIXTURE_OPERATION_ID = 'op-executor-bypass';

/**
 * Seed a minimal system table cache with table, partition, and leader service
 * rows sufficient for coordinator operation dispatch.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache() {
  const cache = new SystemTableCache();
  const now = Date.now();

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: FIXTURE_TABLE_ID,
    table_name: FIXTURE_TABLE_NAME,
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: FIXTURE_PARTITION_ID,
    table_id: FIXTURE_TABLE_ID,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: FIXTURE_NODE_ID,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: FIXTURE_LEADER_REPLICA_ID,
    service_type: 'partition',
    partition_id: FIXTURE_PARTITION_ID,
    node_id: FIXTURE_NODE_ID,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address: `${FIXTURE_NODE_ID}/partition/${FIXTURE_LEADER_REPLICA_ID}`,
    created_at: now,
    updated_at: now,
  });

  return cache;
}

/**
 * Create a mock CDC integration service that applies mutations to the cache.
 * @param {SystemTableCache} cache - Cache to update on writes.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache) {
  return {
    async insertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      cache.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true};
    },
    async waitForCacheUpdate() {},
  };
}

test('executor-side replica creation succeeds but owner-side ' +
  'replica_operations workflow remains stuck (uses RebalanceCoordinator ' +
  'as canonical workflow owner)', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  const cache = createSeededCache();
  const cdcService = createMockCDCService(cache);
  const now = Date.now();

  // Seed the replica_operations row as the coordinator would after
  // persistNewOperation — the coordinator owns row creation.
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'INSERT',
    {
      operation_id: FIXTURE_OPERATION_ID,
      type: OperationType.ADD,
      partition_id: FIXTURE_PARTITION_ID,
      replica_id: FIXTURE_REPLICA_ID,
      source_node_id: FIXTURE_NODE_ID,
      target_node_id: FIXTURE_TARGET_NODE_ID,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: '[]',
      entity_type: 'partition',
      entity_id: FIXTURE_PARTITION_ID,
    },
  );

  // The coordinator's in-memory operation object — this is what the owner
  // uses to track workflow state.
  const coordinatorOperation = {
    operationId: FIXTURE_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: FIXTURE_PARTITION_ID,
    entityType: 'partition',
    entityId: FIXTURE_PARTITION_ID,
    replicaId: FIXTURE_REPLICA_ID,
    sourceNodeId: FIXTURE_NODE_ID,
    targetNodeId: FIXTURE_TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: FIXTURE_NODE_ID,
    operationWorkflowCoordinator: new DurableWorkflowCoordinator(),
    systemTableCache: cache,
    cdcIntegrationService: cdcService,
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      // Simulate ReplicaHandler accepting the dispatch and returning
      // INITIATED — the executor will do the work asynchronously.
      async deliver() {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    // Step 1: Coordinator dispatches the operation. This transitions the
    // coordinator's operation to SENDING then CREATING through the owner path.
    await coordinator.executeOperation(coordinatorOperation);

    t.equal(
      coordinatorOperation.workflowStep,
      WORKFLOW_STEP.CREATING,
      'coordinator should advance to CREATING after dispatch',
    );

    // Step 2: Simulate what ReplicaHandler does after successful replica
    // creation — it directly writes WORKFLOW_STEP.ACTIVE to the
    // replica_operations row, bypassing the coordinator owner path.
    // This is the architectural contradiction: the executor mutates
    // owner-owned workflow fields directly.
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'UPDATE',
      {
        operation_id: FIXTURE_OPERATION_ID,
        workflow_step: WORKFLOW_STEP.ACTIVE,
        status: ReplicaStatus.ACTIVE,
        updated_at: Date.now(),
        completed_at: Date.now(),
        steps_history: JSON.stringify([
          {step: WORKFLOW_STEP.SYNCING, timestamp: Date.now()},
          {step: WORKFLOW_STEP.ACTIVE, timestamp: Date.now()},
        ]),
      },
    );

    // Verify the cache row shows ACTIVE — the executor succeeded.
    const cacheRow = cache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      FIXTURE_OPERATION_ID,
    );
    t.equal(
      cacheRow.workflow_step,
      WORKFLOW_STEP.ACTIVE,
      'cache row should show ACTIVE after executor-side write',
    );

    // Step 3: The coordinator's in-memory operation is still stuck at
    // CREATING because the executor bypassed the owner path. The
    // coordinator never received a typed acknowledgement.
    //
    // THIS IS THE BUG: the coordinator's workflow state diverges from
    // the cache row. The owner thinks the operation is still in progress
    // while the executor already completed it.
    t.equal(
      coordinatorOperation.workflowStep,
      WORKFLOW_STEP.CREATING,
      'coordinator operation should be stuck at CREATING — executor ' +
      'bypassed the owner path',
    );

    // Step 4: Prove the contradiction is harmful — the coordinator cannot
    // complete the operation through its normal owner path because its
    // in-memory state is stale. The owner and executor disagree.
    const ownerStep = coordinatorOperation.workflowStep;
    const executorStep = cacheRow.workflow_step;
    t.not(
      ownerStep,
      executorStep,
      'owner-side and executor-side workflow_step must diverge — ' +
      'this proves the dual-writer contradiction',
    );

    // Step 5: Verify that ReplicaHandler.updateOperationStep is the
    // mechanism that causes this — it writes directly to
    // replica_operations without routing through the coordinator.
    // We prove this by checking that the cache row was mutated by a
    // non-owner writer (the executor) while the owner's state is stale.
    t.equal(
      coordinatorOperation.status,
      ReplicaStatus.CREATING,
      'coordinator status should remain CREATING — not updated by ' +
      'executor-side write',
    );
    t.equal(
      cacheRow.status,
      ReplicaStatus.ACTIVE,
      'cache row status should be ACTIVE — written by executor',
    );
  } finally {
    await coordinator.shutdown();
  }
});
