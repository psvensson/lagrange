import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  COORDINATOR_CREATED_REMOTE_HANDOFF_MODE,
} from '../../src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js';
import {
  OPERATION_OWNER_TURN_POLICY,
} from '../../src/rebalancer/operation-owner-turn-policy.js';
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
      t.equal(
        dispatchCalls[0]?.options?.ownerTurnPolicy,
        OPERATION_OWNER_TURN_POLICY.RETAIN,
        'target progress should retain its exact source-owner turn',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'target-progress wake survives an ordinary coalesced dispatch request',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: `${OPERATION_ID}-coalesced`,
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
      const targetProgressWake = service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      const ordinaryDispatch = service.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
      });
      await Promise.all([targetProgressWake, ordinaryDispatch]);
      await drainOperationDispatchQueue(service);

      t.equal(
        dispatchCalls.length,
        1,
        'ordinary coalescing must not erase the stronger target-progress wake',
      );
      t.equal(
        dispatchCalls[0]?.operation?.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the retained progress wake should re-enter authoritative CREATING',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'early target-progress wake owns a turn after source commits CREATING',
  async (t) => {
    initEnv();

    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: `${OPERATION_ID}-in-flight-owner`,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.SENDING,
    });
    const activeServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      created_at: 1700000000510,
      updated_at: 1700000000514,
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [operationRow],
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
        async updateSystemTableRow() {
          return {success: true};
        },
        async refreshAuthoritativeCacheRow() {
          return true;
        },
      },
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
    const ownerKey =
      sourceCoordinator.getOperationOwnerSingleFlightKey(
        operationRow.operation_id,
      );
    let releaseOwnerTurn;
    let markOwnerTurnStarted;
    const ownerTurnStarted = new Promise((resolve) => {
      markOwnerTurnStarted = resolve;
    });
    const initialDispatchTurn =
      sourceCoordinator.operationWorkflowRunExclusive(
        ownerKey,
        async () => {
          markOwnerTurnStarted();
          await new Promise((resolve) => {
            releaseOwnerTurn = resolve;
          });
          const sendingOperation =
            await sourceCoordinator.repository.queryOperationById(
              operationRow.operation_id,
            );
          await sourceCoordinator.workflowOwner.updateStep(
            sendingOperation,
            WORKFLOW_STEP.CREATING,
          );
        },
      );

    try {
      await ownerTurnStarted;
      await sourceDispatch.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      await new Promise((resolve) => setImmediate(resolve));
      releaseOwnerTurn();
      await initialDispatchTurn;
      await drainOperationDispatchQueue(sourceDispatch);

      const completedOperation =
        await sourceCoordinator.repository.queryOperationById(
          operationRow.operation_id,
        );
      t.equal(
        completedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the early target outcome must reconcile after CREATING commits',
      );
      t.equal(
        completedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the retained progress turn should terminalize the durable operation',
      );
    } finally {
      releaseOwnerTurn?.();
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
    }
  },
);

test(
  'retained progress turns exclude broader marked replay shapes',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRows = [
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-system-create`,
        partition_id: 'nodes-p1',
        entity_type: 'partition',
        entity_id: 'nodes-p1',
      }),
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-system-sending`,
        partition_id: 'nodes-p1',
        entity_type: 'partition',
        entity_id: 'nodes-p1',
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
      }),
      buildRuntimeCreatingOperationRow({
        operation_id: `${OPERATION_ID}-active-replace`,
        type: OperationType.REPLACE,
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
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
        2,
        'the established broader replay shapes should still dispatch',
      );
      t.notOk(
        dispatchCalls.some(
          ({operation}) =>
            operation?.operationId === `${OPERATION_ID}-system-sending`,
        ),
        'marked system SENDING must remain outside retained replay',
      );
      t.ok(
        dispatchCalls.every(
          ({options}) => options.ownerTurnPolicy === undefined,
        ),
        'system create/SENDING and ACTIVE replace must remain coalescing',
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
          const targetProgressWake =
            sourceDispatch.handleReplicaOperationDispatch(payload);
          const ordinaryDispatch =
            sourceDispatch.handleReplicaOperationDispatch({
              type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
              [ControlPlaneField.OPERATION_ID]: OPERATION_ID,
              [ControlPlaneField.OPERATION_ROW]: operationRow,
            });
          await Promise.all([targetProgressWake, ordinaryDispatch]);
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
        'the coalesced source wake should terminate from exact ACTIVE proof',
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
  'target-progress wake rejects an ACTIVE partition sibling on the target',
  async (t) => {
    initEnv();

    const siblingOperationId = `${OPERATION_ID}-partition-sibling`;
    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: siblingOperationId,
    });
    const activeSiblingRow = {
      service_id: `${SERVICE_ID}-unrelated`,
      replica_id: `${SERVICE_ID}-unrelated`,
      service_type: 'partition',
      partition_id: SERVICE_ID,
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeSiblingRow],
        replicaOperations: [operationRow],
      },
      sqlQueryResults: {
        'FROM services WHERE service_id = ?': {
          success: true,
          rows: [],
        },
        'WHERE partition_id = ? AND node_id = ?': {
          success: true,
          rows: [activeSiblingRow],
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
        [ControlPlaneField.OPERATION_ID]: siblingOperationId,
        [ControlPlaneField.OPERATION_ROW]: operationRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      const retainedOperation =
        await sourceCoordinator.repository.queryOperationById(
          siblingOperationId,
        );
      t.equal(
        retainedOperation?.workflowStep,
        WORKFLOW_STEP.CREATING,
        'an unrelated ACTIVE partition sibling must not complete runtime ADD',
      );
      t.equal(
        retainedOperation?.status,
        ReplicaStatus.CREATING,
        'partition-node fallback must not satisfy exact runtime target proof',
      );
    } finally {
      sourceDispatch.stop();
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
          {entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE},
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
          {entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE},
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
