import {test} from '../../src/test-helpers/tap.js';
import {OPERATION_WORKFLOW_OWNER_SHARED as SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {createTestCoordinator} from './test-helpers.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = SHARED;

const OWNER_NODE_ID = 'owner-node';
const TARGET_NODE_ID = 'remove-node';
const PARTITION_ID = 'shape-b-p1';
const ENTITY_ID = PARTITION_ID;
const REPLICA_ID = 'shape-b-p1-r1';
const PENDING_OPERATION_ID = 'op-shape-b-pending-remove';
const ACTIVE_OPERATION_ID = 'op-shape-b-active-remove';
const REPLACE_OPERATION_ID = 'op-shape-b-pending-replace';
const REPLACE_SOURCE_REPLICA_ID = 'shape-b-p1-r0';
const CREATED_AT_LAG_MS = 5000;
const UPDATED_AT_LAG_MS = 1000;
const OBSERVED_STATE = OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED;

function buildOperationRow({
  operationId,
  operationType = OperationType.REMOVE,
  replicaId = REPLICA_ID,
  sourceReplicaId = null,
  workflowStep = WORKFLOW_STEP.PENDING,
  status = ReplicaStatus.PENDING,
}) {
  const now = Date.now();
  const firstStep = {
    step: WORKFLOW_STEP.PENDING,
    timestamp: now - CREATED_AT_LAG_MS,
  };
  if (sourceReplicaId) {
    firstStep.sourceReplicaId = sourceReplicaId;
  }
  const stepsHistory = [firstStep];
  if (workflowStep !== WORKFLOW_STEP.PENDING) {
    stepsHistory.push({
      step: workflowStep,
      timestamp: now - UPDATED_AT_LAG_MS,
    });
  }
  return {
    operation_id: operationId,
    type: operationType,
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    source_node_id: OWNER_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status,
    workflow_step: workflowStep,
    created_at: now - CREATED_AT_LAG_MS,
    updated_at: now - UPDATED_AT_LAG_MS,
    completed_at: null,
    error_message: null,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: ENTITY_ID,
    steps_history: JSON.stringify(stepsHistory),
  };
}

function buildActiveServiceRow(replicaId = REPLICA_ID) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: TARGET_NODE_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: `${TARGET_NODE_ID}/partition/${replicaId}`,
  };
}

function createRemoveCoordinator({
  operationRow,
  serviceRows = [buildActiveServiceRow()],
  removeResponseStatus = ReplicaOperationResponseStatus.INITIATED,
}) {
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: OWNER_NODE_ID,
    enableTimeouts: false,
    cacheData: {
      services: serviceRows,
      replicaOperations: [operationRow],
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {
          acknowledged: true,
          status: payload.type === ReplicaOperationMessageType.REMOVE_REPLICA ?
            removeResponseStatus :
            ReplicaOperationResponseStatus.INITIATED,
        };
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
  });
  coordinator.repository.getActualReplicaObservation = async (
    replicaId,
    partitionId,
    targetNodeId,
  ) => {
    const serviceRow = serviceRows.find((row) =>
      row.replica_id === replicaId &&
      row.partition_id === partitionId &&
      row.node_id === targetNodeId,
    );
    if (!serviceRow) {
      return {state: 'absent', lifecycleStatus: null};
    }
    return {
      state: OBSERVED_STATE,
      lifecycleStatus: serviceRow.status,
    };
  };
  return {coordinator, deliveries};
}

function removeDeliveries(deliveries) {
  return deliveries.filter((entry) =>
    entry.payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA,
  );
}

test('dispatch wake for PENDING REMOVE with ACTIVE target dispatches removal',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: PENDING_OPERATION_ID,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({operationRow});

    try {
      const result = await coordinator.dispatchOperation(operationRow);
      const persistedOperation = await coordinator.getOperation(
        PENDING_OPERATION_ID,
      );

      t.equal(result?.success, true, 'dispatch wake reports successful progress');
      t.equal(
        removeDeliveries(deliveries).length,
        1,
        'PENDING REMOVE with ACTIVE target must dispatch REMOVE_REPLICA',
      );
      t.not(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'target ACTIVE is not create-progress evidence for REMOVE',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'remove dispatch advances to STOPPING through the stop-phase path',
      );
      t.equal(
        persistedOperation?.completedAt,
        null,
        'an initiated remove stays incomplete until source absence is observed',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('periodic orphan reconcile re-drives REMOVE already stranded at ACTIVE',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: ACTIVE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow,
      removeResponseStatus: ReplicaOperationResponseStatus.NOT_FOUND,
    });

    try {
      const cachedIncompleteIds = coordinator.repository
        .queryCachedIncompleteOperations()
        .map((operation) => operation.operationId);
      t.same(
        cachedIncompleteIds,
        [ACTIVE_OPERATION_ID],
        'REMOVE+ACTIVE remains visible to the periodic incomplete-op sweep',
      );

      await coordinator.reconcileOrphanedOperations();
      const persistedOperation = await coordinator.getOperation(
        ACTIVE_OPERATION_ID,
      );

      t.equal(
        removeDeliveries(deliveries).length,
        1,
        'orphan reconcile re-drives REMOVE_REPLICA for ACTIVE REMOVE',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.REMOVED,
        'source-absent remove response completes through completeOperation',
      );
      t.equal(
        persistedOperation?.status,
        ReplicaStatus.REMOVED,
        'completed REMOVE persists removed status',
      );
      t.ok(
        Number.isFinite(persistedOperation?.completedAt),
        'completed REMOVE has completedAt set',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('PENDING REPLACE keeps create-phase dispatch-wake target shortcut',
  async (t) => {
    const operationRow = buildOperationRow({
      operationId: REPLACE_OPERATION_ID,
      operationType: OperationType.REPLACE,
      sourceReplicaId: REPLACE_SOURCE_REPLICA_ID,
    });
    const {coordinator, deliveries} = createRemoveCoordinator({
      operationRow,
      serviceRows: [buildActiveServiceRow(REPLICA_ID)],
    });

    try {
      const result = await coordinator.dispatchOperation(operationRow);
      const persistedOperation = await coordinator.getOperation(
        REPLACE_OPERATION_ID,
      );

      t.equal(result?.success, true, 'replace dispatch wake reports progress');
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'PENDING REPLACE remains in the create-phase target-progress shortcut',
      );
      t.equal(
        deliveries.length,
        0,
        'REPLACE target progress is reconciled without replaying create dispatch',
      );
    } finally {
      await coordinator.shutdown();
    }
  });
