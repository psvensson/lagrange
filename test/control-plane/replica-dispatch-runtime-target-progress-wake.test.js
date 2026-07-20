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
  REPLICA_DISPATCH_SERVICE_SHARED,
} from '../../src/control-plane/replica-dispatch-service-shared.js';
import {
  OPERATION_OWNER_TURN_POLICY,
} from '../../src/rebalancer/operation-owner-turn-policy.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  createMockControlPlaneReadinessService,
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const SOURCE_NODE_ID = 'node-1';
const TARGET_NODE_ID = 'node-2';
const OPERATION_ID = 'runtime-service-target-progress-wake';
const SERVICE_ID = 'svc-movielens-topn';
const REPLICA_ID = `${SERVICE_ID}-r2`;
const TARGET_PROGRESS_RETRY_AFTER_MS = 25;
const {
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
} = REPLICA_DISPATCH_SERVICE_SHARED;

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
  'target-progress ingress retains its owner mode across a retryable reconcile',
  async (t) => {
    initEnv();

    const operationRow = buildRuntimeCreatingOperationRow({
      operation_id: `${OPERATION_ID}-retry`,
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
    const dispatchOperation =
      sourceCoordinator.dispatchOperation.bind(sourceCoordinator);
    let dispatchCallCount = 0;
    sourceCoordinator.dispatchOperation = async (...args) => {
      dispatchCallCount += 1;
      if (dispatchCallCount === 1) {
        const retryableError =
          new Error('source owner visibility is temporarily unavailable');
        retryableError.retryAfterMs = TARGET_PROGRESS_RETRY_AFTER_MS;
        throw retryableError;
      }
      return dispatchOperation(...args);
    };
    const deferredTimers = [];
    const registeredHandlers = new Map();
    const sourceDispatch = createService({
      messageRouter: {
        register(address, handler) {
          registeredHandlers.set(address, handler);
        },
        unregister(address) {
          registeredHandlers.delete(address);
        },
      },
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: sourceCoordinator,
      setTimeoutFn(callback, delayMs) {
        const timerHandle = {callback, delayMs};
        deferredTimers.push(timerHandle);
        return timerHandle;
      },
      clearTimeoutFn(timerHandle) {
        timerHandle.cleared = true;
      },
    });

    try {
      const ingressHandler = registeredHandlers.get(
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
      );
      const ingressResult = await ingressHandler({
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
          [ControlPlaneField.OPERATION_ROW]: operationRow,
          [ControlPlaneField.HANDOFF_MODE]:
            COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        },
      });
      await drainOperationDispatchQueue(sourceDispatch);

      t.equal(
        ingressResult?.acknowledged,
        true,
        'registered transport ingress should acknowledge the marked wake',
      );
      t.equal(
        dispatchCallCount,
        1,
        'the first marked owner reconcile should reach the retryable failure',
      );
      t.equal(
        deferredTimers.length,
        1,
        'the retryable reconcile should arm the existing deferred retry',
      );
      t.equal(
        sourceDispatch.operationDispatchDeferredRetries.get(
          operationRow.operation_id,
        )?.context?.[ControlPlaneField.HANDOFF_MODE],
        COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        'the deferred owner slot should retain target-progress evidence',
      );

      await deferredTimers[0].callback();
      await drainOperationDispatchQueue(sourceDispatch);

      const completedOperation =
        await sourceCoordinator.repository.queryOperationById(
          operationRow.operation_id,
        );
      t.equal(
        dispatchCallCount,
        2,
        'the deferred wake should re-enter the marked owner reconcile',
      );
      t.equal(
        completedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the retried wake should complete from exact target ACTIVE proof',
      );
      t.equal(
        completedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the source-owned durable operation should become ACTIVE after retry',
      );
    } finally {
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
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
  'marked target progress outranks stale cached PENDING for the same ADD',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-stale-cached-pending`;
    const staleCachedRow = buildRuntimeCreatingOperationRow({
      operation_id: operationId,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: 1700000000000,
    });
    const targetProgressRow = buildRuntimeCreatingOperationRow({
      operation_id: operationId,
      updated_at: 1700000000500,
    });
    const activeServiceRow = {
      service_id: REPLICA_ID,
      service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      created_at: 1700000000510,
      updated_at: 1700000000514,
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [targetProgressRow],
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
    let cachedOperationRow = staleCachedRow;
    sourceDispatch.replicaOperationsOwner = {
      async getReplicaOperationFromCache(requestedOperationId) {
        return requestedOperationId === operationId ?
          {...cachedOperationRow} :
          null;
      },
    };
    const markedProgressContext = {
      row: targetProgressRow,
      [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true,
      [ControlPlaneField.HANDOFF_MODE]:
        COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
    };

    try {
      cachedOperationRow = {
        ...targetProgressRow,
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
        updated_at: 1700000000600,
      };
      const selectedTerminalRow =
        await sourceDispatch.resolveOperationDispatchReconcileRow(
          operationId,
          markedProgressContext,
        );
      t.equal(
        selectedTerminalRow?.workflow_step,
        WORKFLOW_STEP.ACTIVE,
        'terminal local progress must outrank an older target payload',
      );

      cachedOperationRow = {
        ...targetProgressRow,
        workflow_step: 'FUTURE_STEP',
        updated_at: 1700000000700,
      };
      const selectedUnknownStepRow =
        await sourceDispatch.resolveOperationDispatchReconcileRow(
          operationId,
          markedProgressContext,
        );
      t.equal(
        selectedUnknownStepRow?.workflow_step,
        'FUTURE_STEP',
        'an unknown refreshed step must fail closed under version skew',
      );

      cachedOperationRow = staleCachedRow;
      const selectedIncompatibleRow =
        await sourceDispatch.resolveOperationDispatchReconcileRow(
          operationId,
          {
            ...markedProgressContext,
            row: {
              ...targetProgressRow,
              target_node_id: 'node-3',
            },
          },
        );
      t.equal(
        selectedIncompatibleRow?.workflow_step,
        WORKFLOW_STEP.PENDING,
        'an incompatible target identity must not replace the local row',
      );
      const selectedUnmarkedRow =
        await sourceDispatch.resolveOperationDispatchReconcileRow(
          operationId,
          {
            ...markedProgressContext,
            [ControlPlaneField.HANDOFF_MODE]: undefined,
          },
        );
      t.equal(
        selectedUnmarkedRow?.workflow_step,
        WORKFLOW_STEP.PENDING,
        'an ordinary refresh must retain cache-first row selection',
      );
      const selectedNonRuntimeRow =
        await sourceDispatch.resolveOperationDispatchReconcileRow(
          operationId,
          {
            ...markedProgressContext,
            row: {
              ...targetProgressRow,
              entity_type: 'partition',
            },
          },
        );
      t.equal(
        selectedNonRuntimeRow?.workflow_step,
        WORKFLOW_STEP.PENDING,
        'a marked non-runtime row must remain outside target-progress selection',
      );

      await sourceDispatch.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: targetProgressRow,
        [ControlPlaneField.HANDOFF_MODE]:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      const completedOperation =
        await sourceCoordinator.repository.queryOperationById(operationId);
      t.equal(
        completedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the advanced target payload should reach exact ACTIVE progress',
      );
      t.equal(
        completedOperation?.status,
        ReplicaStatus.ACTIVE,
        'stale cached PENDING must not mask the marked target payload',
      );
    } finally {
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
    }
  },
);

test(
  'fresh EMPTY runtime ACTIVE retries through SENDING target visibility ' +
  'and source termination',
  async (t) => {
    initEnv();

    const sourceOperationRow = buildRuntimeCreatingOperationRow({
      updated_at: 1700000000514,
    });
    const targetOperationRow = buildRuntimeCreatingOperationRow({
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.SENDING,
      updated_at: 1700000000508,
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
        replicaOperations: [{...sourceOperationRow}],
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
    const targetVisibilityRetryTimers = [];
    const targetCoordinator = createTestCoordinator({
      nodeId: TARGET_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [{...targetOperationRow}],
      },
      setTimeoutFn(callback, delayMs) {
        const timerHandle = {callback, delayMs};
        targetVisibilityRetryTimers.push(timerHandle);
        return timerHandle;
      },
      clearTimeoutFn(timerHandle) {
        timerHandle.cleared = true;
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
              [ControlPlaneField.OPERATION_ROW]: {...sourceOperationRow},
            });
          await Promise.all([targetProgressWake, ordinaryDispatch]);
          return {acknowledged: true};
        },
      },
    });
    const readTargetVisibility =
      targetCoordinator.repository.getOperationByIdVisibilityObservation.bind(
        targetCoordinator.repository,
      );
    let targetVisibilityReadCount = 0;
    targetCoordinator.repository.getOperationByIdVisibilityObservation =
      async (...args) => {
        targetVisibilityReadCount++;
        if (targetVisibilityReadCount === 1) {
          return {
            state: INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
            operation: null,
            deferredOutcome: null,
            retryAfterMs: null,
          };
        }
        return readTargetVisibility(...args);
      };

    try {
      await targetCoordinator.workflowOwner.reconcileExecutorOutcome({
        [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: OPERATION_ID,
        [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
          EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
        [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
        [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: REPLICA_ID,
        [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now(),
      });
      t.equal(
        targetVisibilityRetryTimers.length,
        1,
        'fresh EMPTY runtime outcome should retain one bounded retry',
      );
      if (targetVisibilityRetryTimers[0]) {
        await targetVisibilityRetryTimers[0].callback();
      }
      await drainOperationDispatchQueue(sourceDispatch);

      const completedOperation =
        await sourceCoordinator.repository.queryOperationById(OPERATION_ID);
      t.equal(
        targetDeliveries.length,
        1,
        'target ACTIVE should send one immediate canonical owner wake',
      );
      t.equal(
        targetVisibilityReadCount,
        2,
        'retry should re-read the independently cloned target operation',
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

// Quest runtime-service-creating-owner-wake-progress-admission, theory
// theory-20260720-creating-wake-no-owner-after-handoff-budget (live forensics
// run 2026-07-20T12:37). Live sequence reproduced deterministically:
//   1. The source-owned coordinator-created runtime ADD dispatch defers once
//      with the retryable 'Cache update not observed for replica operation
//      <id>' failure and re-arms after ~250ms
//      (replica-dispatch-retry-scheduling.js deferOperationDispatchRetry).
//   2. The target creates the replica: the exact target services row is
//      durably ACTIVE (live 12:31:20, seeded here as authoritative proof).
//   3. The target's coordinator-created remote-handoff retry exhausts its
//      operation budget without ever reaching the source ('Coordinator-created
//      remote handoff retry stopped at its operation budget'); simulated by
//      never delivering any TARGET_EXECUTOR_OUTCOME wake to the source.
//   4. No node-readiness transition fires afterwards and no planner rearm
//      runs, so the trigger-gated ready-node replay never re-enters the row.
//   5. The virtual clock drains every armed timer through twice the
//      REPLICA_OPERATION_DISPATCH_TIMEOUT_MS budget plus the dispatch queue.
// The terminal assertions are the theory discriminator: once the exact target
// services row is durably ACTIVE, the source-owned replica_operations ADD must
// still reach its terminal ACTIVE progression. On current code the deferred
// retry's second reconcile pass drops the wake (CREATING is outside
// DISPATCH_PENDING_WORKFLOW_STEPS and the unmarked retry context fails the
// runtime-target-progress admission), so the row stays CREATING forever and
// the final assertions FAIL — that red is the recorded discriminator.
test(
  'lost target handoff still reaches terminal ACTIVE for a source-owned CREATING runtime ' +
  'ADD from durable target ACTIVE proof within the dispatch timeout budget',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-lost-handoff-budget`;
    const cacheVisibilityRetryAfterMs = 250;
    const preCommitPendingRow = buildRuntimeCreatingOperationRow({
      operation_id: operationId,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: 1700000000000,
    });
    const durableCreatingRow = buildRuntimeCreatingOperationRow({
      operation_id: operationId,
      updated_at: 1700000000500,
    });
    const activeServiceRow = {
      service_id: REPLICA_ID,
      service_type: 'runtime_service',
      node_id: TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      created_at: 1700000000510,
      updated_at: 1700000000514,
    };
    const scheduledTimers = [];
    const captureTimer = (callback, delayMs) => {
      const timerHandle = {callback, delayMs};
      scheduledTimers.push(timerHandle);
      return timerHandle;
    };
    const releaseTimer = (timerHandle) => {
      if (timerHandle) {
        timerHandle.cleared = true;
      }
    };
    const sourceCoordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [activeServiceRow],
        replicaOperations: [durableCreatingRow],
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
      setTimeoutFn: captureTimer,
      clearTimeoutFn: releaseTimer,
    });
    const dispatchOperation =
      sourceCoordinator.dispatchOperation.bind(sourceCoordinator);
    let dispatchCallCount = 0;
    sourceCoordinator.dispatchOperation = async (...args) => {
      dispatchCallCount += 1;
      if (dispatchCallCount === 1) {
        const retryableError = new Error(
          `${REPLICA_DISPATCH_SERVICE_LITERAL.CACHE_UPDATE_NOT_OBSERVED_FOR_REPLICA_OPERATION} ${operationId}`,
        );
        retryableError.retryAfterMs = cacheVisibilityRetryAfterMs;
        throw retryableError;
      }
      return dispatchOperation(...args);
    };
    const sourceDispatch = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: sourceCoordinator,
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
      }),
      setTimeoutFn: captureTimer,
      clearTimeoutFn: releaseTimer,
    });
    // Authoritative row visibility as the source dispatch owner observes it:
    // the first reconcile pass still sees the pre-commit PENDING row (the
    // unobserved cache update behind the live deferral); visibility converges
    // to the durable CREATING commit before the deferred retry fires.
    let visibleOperationRow = preCommitPendingRow;
    sourceDispatch.replicaOperationsOwner = {
      async getReplicaOperationFromCache(requestedOperationId) {
        return requestedOperationId === operationId ?
          {...visibleOperationRow} :
          null;
      },
    };

    try {
      await sourceDispatch.handleReplicaOperationDispatch({
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: operationId,
        [ControlPlaneField.OPERATION_ROW]: preCommitPendingRow,
      });
      await drainOperationDispatchQueue(sourceDispatch);

      t.equal(
        dispatchCallCount,
        1,
        'the initial source dispatch pass should reach the owner once',
      );
      const deferredRetry =
        sourceDispatch.operationDispatchDeferredRetries.get(operationId);
      t.ok(
        deferredRetry,
        'the retryable cache-visibility failure should arm a deferred retry',
      );
      t.ok(
        String(deferredRetry?.errorMessage || '').includes(
          REPLICA_DISPATCH_SERVICE_LITERAL
            .CACHE_UPDATE_NOT_OBSERVED_FOR_REPLICA_OPERATION,
        ),
        'the deferred retry should retain the live cache-visibility reason',
      );

      // Cache visibility converges to the durable CREATING commit; the target
      // replica is durably ACTIVE; the target handoff wake is never delivered
      // (its retry budget stopped without reaching the source); no readiness
      // transition and no planner rearm occur.
      visibleOperationRow = durableCreatingRow;

      // Drain every armed timer through 2x the dispatch timeout budget.
      let remainingVirtualBudgetMs = REPLICA_OPERATION_DISPATCH_TIMEOUT_MS * 2;
      for (;;) {
        const dueTimer = scheduledTimers
          .filter(
            (timer) =>
              !timer.cleared &&
              !timer.fired &&
              timer.delayMs <= remainingVirtualBudgetMs,
          )
          .sort((left, right) => left.delayMs - right.delayMs)[0];
        if (!dueTimer) {
          break;
        }
        dueTimer.fired = true;
        remainingVirtualBudgetMs -= dueTimer.delayMs;
        await dueTimer.callback();
        await drainOperationDispatchQueue(sourceDispatch);
      }

      const progressedOperation =
        await sourceCoordinator.repository.queryOperationById(operationId);
      t.equal(
        progressedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the source-owned ADD must progress to ACTIVE once the exact target ' +
        'services row is durably ACTIVE, without a delivered handoff wake',
      );
      t.equal(
        progressedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the source-owned durable operation must reach its terminal state instead of ' +
        'remaining CREATING forever after the lost handoff budget',
      );
    } finally {
      sourceDispatch.stop();
      await sourceCoordinator.shutdown();
    }
  },
);
