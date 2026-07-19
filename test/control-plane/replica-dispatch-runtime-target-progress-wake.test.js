import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  COORDINATOR_CREATED_REMOTE_HANDOFF_MODE,
} from '../../src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {createTestCoordinator} from '../rebalancer/test-helpers.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const SOURCE_NODE_ID = 'node-1';
const TARGET_NODE_ID = 'node-2';
const OPERATION_ID = 'runtime-service-target-progress-wake';
const SERVICE_ID = 'svc-movielens-topn';
const REPLICA_ID = `${SERVICE_ID}-r2`;

function buildRuntimeCreatingOperationRow(overrides = {}) {
  return {
    operation_id: OPERATION_ID,
    type: OperationType.ADD,
    partition_id: SERVICE_ID,
    entity_type: 'runtime_service',
    entity_id: SERVICE_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: 1700000000000,
    updated_at: 1700000000500,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    ...overrides,
  };
}

async function drainOperationDispatchQueue(service) {
  await new Promise((resolve) => setImmediate(resolve));
  while (
    service.operationDispatchQueue.size > 0 ||
    service.operationDispatchQueue.draining
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test(
  'target-progress wake re-enters a source-owned CREATING runtime ADD',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRow = buildRuntimeCreatingOperationRow();
    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        async dispatchOperation(operation, options) {
          dispatchCalls.push({operation, options});
          return {success: true};
        },
        isOperationLocallyOwned(operation) {
          return (
            operation?.source_node_id === SOURCE_NODE_ID ||
            operation?.sourceNodeId === SOURCE_NODE_ID
          );
        },
      },
    });

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: OPERATION_ID,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'the explicit target-progress wake should reach the source owner',
      );
      t.equal(
        dispatchCalls[0]?.operation?.workflowStep,
        WORKFLOW_STEP.CREATING,
        'progress re-entry should preserve the authoritative workflow step',
      );
      t.equal(
        dispatchCalls[0]?.operation?.entityType,
        'runtime_service',
        'progress re-entry should preserve the runtime-service owner shape',
      );
      t.equal(
        dispatchCalls[0]?.options?.cause,
        'replica_operation_dispatch',
        'progress re-entry should use the canonical dispatch cause',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ordinary CREATING runtime rows remain outside dispatch replay',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: `${OPERATION_ID}-ordinary`,
    });
    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        async dispatchOperation(operation, options) {
          dispatchCalls.push({operation, options});
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
    });

    try {
      await service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
      });
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        0,
        'an unmarked non-system CREATING row must not become replayable',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'target-progress admission stays bounded to runtime create-side shapes',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRows = [
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-replace`,
        type: OperationType.REPLACE,
      }),
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-remove`,
        type: OperationType.REMOVE,
      }),
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-partition`,
        entity_type: 'partition',
      }),
    ];
    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        async dispatchOperation(operation, options) {
          dispatchCalls.push({operation, options});
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
    });

    try {
      for (const operationRow of operationRows) {
        await service.handleReplicaOperationDispatch({
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
          [ControlPlaneField.OPERATION_ROW]: operationRow,
          [ControlPlaneField.HANDOFF_MODE]:
            COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        });
      }
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'marked REMOVE and non-runtime rows must stay excluded',
      );
      t.equal(
        dispatchCalls[0]?.operation?.type,
        OperationType.REPLACE,
        'the bounded create-side REPLACE shape should remain admitted',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'remote runtime ACTIVE crosses target wake and source termination',
  async (t) => {
    initEnv();

    const operationRow = buildRuntimeCreatingOperationRow({
      updated_at: 1700000000514,
    });
    const activeServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      created_at: 1700000000510,
      updated_at: 1700000000514,
    };
    const cdcIntegrationService = {
      async insertSystemTableRow() {
        return {success: true};
      },
      async updateSystemTableRow() {
        return {success: true};
      },
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [operationRow],
      },
      cdcIntegrationService,
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [activeServiceRow],
        },
      },
    });
    const sourceDispatch = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: sourceCoordinator,
    });
    const targetDeliveries = [];
    const targetCoordinator = createTestCoordinator({
      nodeId: TARGET_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [operationRow],
      },
      messageRouter: {
        async deliver(address, payload, options) {
          targetDeliveries.push({address, payload, options});
          await sourceDispatch.handleReplicaOperationDispatch(payload);
          return {acknowledged: true};
        },
      },
    });

    try {
      await targetCoordinator.workflowOwner.reconcileExecutorOutcome({
        [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: OPERATION_ID,
        [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
          EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
        [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
        [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: REPLICA_ID,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      const completedOperation =
        await sourceCoordinator.repository.queryOperationById(OPERATION_ID);
      t.equal(
        targetDeliveries.length,
        1,
        'target ACTIVE should send one immediate canonical owner wake',
      );
      t.equal(
        targetDeliveries[0]?.address,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'target ACTIVE should wake the source replica-dispatch ingress',
      );
      t.equal(
        targetDeliveries[0]?.payload?.[ControlPlaneField.HANDOFF_MODE],
        COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        'the cross-node wake should retain target-progress semantics',
      );
      t.equal(
        completedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the source owner should terminate from exact ACTIVE services proof',
      );
      t.equal(
        completedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the source-owned durable operation should become ACTIVE',
      );
    } finally {
      sourceDispatch.stop();
      await targetCoordinator.shutdown();
      await sourceCoordinator.shutdown();
    }
  },
);

test(
  'runtime progress observation rejects an ACTIVE row on the wrong target',
  async (t) => {
    initEnv();

    const wrongTargetServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: 'node-3',
      status: ReplicaStatus.ACTIVE,
    };
    const coordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [wrongTargetServiceRow],
        },
      },
    });

    try {
      const observedStatus =
        await coordinator.workflowOwner.getReconciledReplicaStatus(
          REPLICA_ID,
          SERVICE_ID,
          TARGET_NODE_ID,
        );
      t.equal(
        observedStatus,
        null,
        'same-replica ACTIVE evidence on another node must not terminate',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'runtime progress observation requires an ACTIVE row target identity',
  async (t) => {
    initEnv();

    const targetlessServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      status: ReplicaStatus.ACTIVE,
    };
    const coordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [targetlessServiceRow],
        },
      },
    });

    try {
      const observedStatus =
        await coordinator.workflowOwner.getReconciledReplicaStatus(
          REPLICA_ID,
          SERVICE_ID,
          TARGET_NODE_ID,
        );
      t.equal(
        observedStatus,
        null,
        'ACTIVE evidence without node identity must not terminate',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'target-progress wake does not terminate from non-ACTIVE services proof',
  async (t) => {
    initEnv();

    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: `${OPERATION_ID}-non-active`,
    });
    const creatingServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.CREATING,
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [creatingServiceRow],
        replicaOperations: [operationRow],
      },
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [creatingServiceRow],
        },
      },
    });
    const sourceDispatch = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: sourceCoordinator,
    });

    try {
      await sourceDispatch.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      const retainedOperation =
        await sourceCoordinator.repository.queryOperationById(
          operationRow.operation_id,
        );
      t.equal(
        retainedOperation?.workflowStep,
        WORKFLOW_STEP.CREATING,
        'a non-ACTIVE services row must retain the source-owned workflow step',
      );
      t.equal(
        retainedOperation?.status,
        ReplicaStatus.CREATING,
        'a non-ACTIVE services row must not terminate the durable operation',
      );
    } finally {
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
    }
  },
);
