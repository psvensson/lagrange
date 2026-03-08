/**
 * Integration test for atomic dispatch claims in ReplicaDispatchService.
 * Task 18: expected to fail until atomic PENDING->SENDING claim is enforced.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneField} from
  '../../src/control-plane/control-plane-constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {REBALANCE_COORDINATOR_EVENT} from
  '../../src/rebalancer/rebalancer-constants.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function claimPendingOperation(operation, operationId) {
  const currentOperationId =
    operation?.operation_id ||
    operation?.operationId ||
    null;
  const currentStep =
    operation?.workflow_step ||
    operation?.workflowStep ||
    null;
  if (!currentOperationId ||
      currentOperationId !== operationId ||
      currentStep !== WORKFLOW_STEP.PENDING) {
    return null;
  }

  const updatedAt = Date.now();
  if (Object.prototype.hasOwnProperty.call(operation, 'workflow_step') ||
      Object.prototype.hasOwnProperty.call(operation, 'operation_id')) {
    operation.workflow_step = WORKFLOW_STEP.SENDING;
    operation.updated_at = updatedAt;
  }
  if (Object.prototype.hasOwnProperty.call(operation, 'workflowStep') ||
      Object.prototype.hasOwnProperty.call(operation, 'operationId')) {
    operation.workflowStep = WORKFLOW_STEP.SENDING;
    operation.updatedAt = updatedAt;
  }

  return {operationId};
}

test(
  'ReplicaDispatchService dispatches a pending operation once across triggers',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-atomic-claim-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const leaderMessageGroup = {
      isLeaderReplica: () => true,
    };

    try {
      await service.handleCdcApplied(leaderMessageGroup, {
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        data: operationRow,
      });
      await service.handleReplicaOperationDispatch({
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      t.equal(
        executeCount,
        1,
        'should dispatch exactly once after a single operation claim',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService dispatches coordinator-created pending operation without CDC trigger',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operation = {
      operationId: 'op-coordinator-created-1',
      type: 'ADD',
      partitionId: 'tables-p1',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'tables-p1',
      replicaId: 'tables-p1-r4',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    let executeCount = 0;
    const coordinator = new EventEmitter();
    coordinator.cdcGroupPropagationService = {
      getPublicationModeDiagnostics: () => ({
        currentMode: 'grouped',
        reasonCode: 'normal',
        enteredAt: new Date().toISOString(),
        recentTransitions: [],
      }),
    };
    coordinator.claimDispatchTransition = async (opId) => {
      return claimPendingOperation(operation, opId);
    };
    coordinator.executeOperation = async () => {
      executeCount += 1;
      return {success: true};
    };
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.DISCONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operation.operationId &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operation.workflowStep === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operation.workflowStep = updateData.workflow_step;
            operation.updatedAt = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          return null;
        },
        getAll: (_tableName) => [],
      },
      rebalanceCoordinator: coordinator,
    });
    service.initialize();

    try {
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {
        operation,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      t.equal(
        executeCount,
        1,
        'should dispatch coordinator-created pending operation',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'operation should be claimed after coordinator event',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService dispatches pending CDC from non-leader replica',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-cdc-non-leader-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r5',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const followerMessageGroup = {
      isLeaderReplica: () => false,
    };

    try {
      await service.handleCdcApplied(followerMessageGroup, {
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        data: operationRow,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      t.equal(
        executeCount,
        1,
        'should dispatch pending CDC even when source replica is not leader',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'pending operation should be claimed after non-leader CDC',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService retries pending dispatch when target node becomes ready',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-retry-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.DISCONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    let routerConnectionState = STATE.DISCONNECTED;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => routerConnectionState,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async (_tableName, row) => {
          nodeStore.set(row.node_id, {...row});
          return {success: true};
        },
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES) {
            return nodeStore.get(key) || null;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
            return [operationRow];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    try {
      await service.dispatchOperationRow(operationRow);
      t.equal(
        executeCount,
        0,
        'should not dispatch while target node is not ready',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.PENDING,
        'operation should remain pending before readiness update',
      );

      routerConnectionState = STATE.CONNECTED;
      await service.handleNodeStateUpdate({
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now + 1000,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      t.equal(
        executeCount,
        1,
        'should dispatch pending operation once target becomes ready',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'pending operation should be claimed for dispatch',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService dispatches pending operation when lease is ready ' +
    'even if router state is disconnected',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-router-disconnected-ready-lease',
      type: 'ADD',
      partition_id: 'services-p1',
      replica_id: 'services-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.DISCONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
      sqlQueryEngine: {
        executeQuery: async (sql) => {
          if (sql.includes('FROM services')) {
            return {
              success: true,
              rows: [{
                service_id: 'svc-partition-handler',
                [COLUMN.NODE_ID]: 'node-2',
                [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
                [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              }],
            };
          }
          return {success: true, rows: []};
        },
      },
    });
    service.initialize();

    try {
      await service.dispatchOperationRow(operationRow);

      t.equal(
        executeCount,
        1,
        'should dispatch using lease readiness even when router state is disconnected',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'pending operation should be claimed and move to sending',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService retries pending dispatch on nodes CDC ready update',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-cdc-retry-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES) {
            return nodeStore.get(key) || null;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
            return [operationRow];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const leaderMessageGroup = {
      isLeaderReplica: () => true,
    };

    try {
      await service.dispatchOperationRow(operationRow);
      t.equal(
        executeCount,
        0,
        'should not dispatch while ready lease is missing',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.PENDING,
        'operation should remain pending before ready lease update',
      );

      const readyNodeRow = {
        ...nodeStore.get('node-2'),
        connection_state: STATE.READY,
        ready_lease_expires_at: now + 30000,
      };
      nodeStore.set('node-2', readyNodeRow);

      await service.handleCdcApplied(leaderMessageGroup, {
        tableName: SYSTEM_TABLE_NAME.NODES,
        data: readyNodeRow,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      t.equal(
        executeCount,
        1,
        'should dispatch pending operation once nodes CDC marks target ready',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'pending operation should be claimed after nodes CDC retry',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService retries pending dispatch on nodes cache ready update',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-cache-retry-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    let cacheListener = null;
    const systemTableCache = {
      onCacheChange: (listener) => {
        cacheListener = listener;
      },
      offCacheChange: (listener) => {
        if (cacheListener === listener) {
          cacheListener = null;
          return true;
        }
        return false;
      },
      get: (tableName, key) => {
        if (tableName === SYSTEM_TABLE_NAME.NODES) {
          return nodeStore.get(key) || null;
        }
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            key === operationRow.operation_id) {
          return operationRow;
        }
        return null;
      },
      getAll: (tableName) => {
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
          return [operationRow];
        }
        return [];
      },
    };

    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;

          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache,
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    try {
      await service.dispatchOperationRow(operationRow);
      t.equal(
        executeCount,
        0,
        'should not dispatch while ready lease is missing',
      );
      t.ok(
        typeof cacheListener === 'function',
        'should subscribe to cache change notifications',
      );

      const readyNodeRow = {
        ...nodeStore.get('node-2'),
        connection_state: STATE.READY,
        ready_lease_expires_at: now + 30000,
      };
      nodeStore.set('node-2', readyNodeRow);

      cacheListener(SYSTEM_TABLE_NAME.NODES, 'UPDATE', readyNodeRow);
      await new Promise((resolve) => setTimeout(resolve, 5));

      t.equal(
        executeCount,
        1,
        'should dispatch pending operation once cache marks target ready',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'pending operation should be claimed after cache-change retry',
      );
    } finally {
      service.stop();
    }
  },
);

async function waitForRetryDrain(service) {
  while (service.retryInFlightNodes.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test(
  'ReplicaDispatchService coalesces duplicate ready triggers for one heartbeat',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-trigger-coalesce-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r9',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };
    const readyNodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: now + 30000,
      last_heartbeat: now,
    };

    let executeCount = 0;
    let pendingReadCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;
          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return readyNodeRow;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            pendingReadCount += 1;
            return operationRow.workflow_step === WORKFLOW_STEP.PENDING ?
              [operationRow] :
              [];
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const leaderMessageGroup = {
      isLeaderReplica: () => true,
    };

    try {
      await service.handleNodeStateUpdate({
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
        [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 30000,
      });
      await service.handleCdcApplied(leaderMessageGroup, {
        tableName: SYSTEM_TABLE_NAME.NODES,
        data: readyNodeRow,
      });
      service.handleCacheNodeChange(
        SYSTEM_TABLE_NAME.NODES,
        readyNodeRow,
      );
      await waitForRetryDrain(service);

      t.equal(
        executeCount,
        1,
        'should dispatch pending operation exactly once',
      );
      t.equal(
        pendingReadCount,
        1,
        'should scan pending rows once for one ready heartbeat',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService retries again when ready watermark advances',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-trigger-newer-watermark-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r10',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };
    const readyNodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: now + 30000,
      last_heartbeat: now,
    };

    let executeCount = 0;
    let pendingReadCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;
          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return readyNodeRow;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            pendingReadCount += 1;
            return operationRow.workflow_step === WORKFLOW_STEP.PENDING ?
              [operationRow] :
              [];
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    try {
      await service.handleNodeStateUpdate({
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
        [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 30000,
      });
      await waitForRetryDrain(service);

      t.equal(
        executeCount,
        1,
        'should dispatch on the first ready watermark',
      );
      t.equal(
        pendingReadCount,
        1,
        'should scan pending rows for the first watermark',
      );

      readyNodeRow.last_heartbeat = now + 1000;
      readyNodeRow.ready_lease_expires_at = now + 31000;

      await service.handleNodeStateUpdate({
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now + 1000,
        [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 31000,
      });
      await waitForRetryDrain(service);

      t.equal(
        executeCount,
        1,
        'should not redispatch once the operation is no longer pending',
      );
      t.equal(
        pendingReadCount,
        2,
        'should rescan pending rows when the ready watermark advances',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService keeps pending retry loop deterministic when claim path times out',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-ready-timeout-loop-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r10',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };
    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: now + 30000,
      last_heartbeat: now,
    });

    let claimAttemptCount = 0;
    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async (_tableName, row) => {
          if (row?.node_id) {
            nodeStore.set(row.node_id, {
              ...row,
              last_heartbeat: row.last_heartbeat ?? Date.now(),
            });
          }
          return {success: true};
        },
        updateSystemTableRow: async (_tableName, whereClause) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING;
          if (!isPendingClaim) {
            return {
              success: true,
              partitionResult: {affectedRows: 0},
            };
          }
          claimAttemptCount += 1;
          throw new Error('Query timeout after 5000ms');
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES) {
            return nodeStore.get(key) || null;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            return [operationRow];
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) => {
          if (opId !== operationRow.operation_id ||
              operationRow.workflow_step !== WORKFLOW_STEP.PENDING) {
            return null;
          }
          claimAttemptCount += 1;
          throw new Error('Query timeout after 5000ms');
        },
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    const leaderMessageGroup = {
      isLeaderReplica: () => true,
    };

    try {
      await service.handleNodeStateUpdate({
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now + 1000,
      });
      await waitForRetryDrain(service);

      const cdcReadyRow = {
        ...nodeStore.get('node-2'),
        last_heartbeat: now + 2000,
        ready_lease_expires_at: now + 32000,
      };
      nodeStore.set('node-2', cdcReadyRow);
      await service.handleCdcApplied(leaderMessageGroup, {
        tableName: SYSTEM_TABLE_NAME.NODES,
        data: cdcReadyRow,
      });
      await waitForRetryDrain(service);

      const cacheReadyRow = {
        ...nodeStore.get('node-2'),
        last_heartbeat: now + 3000,
        ready_lease_expires_at: now + 33000,
      };
      nodeStore.set('node-2', cacheReadyRow);
      service.handleCacheNodeChange(
        SYSTEM_TABLE_NAME.NODES,
        cacheReadyRow,
      );
      await waitForRetryDrain(service);

      t.equal(
        claimAttemptCount,
        3,
        'ready triggers should deterministically retry the same pending claim',
      );
      t.equal(
        executeCount,
        0,
        'timed-out claim path should never enter operation execution',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.PENDING,
        'operation should remain pending while claim attempts time out',
      );
    } finally {
      service.stop();
    }
  },
);

test(
  'ReplicaDispatchService retries pending operation when target handler appears',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = {
      operation_id: 'op-handler-activation-retry-1',
      type: 'REMOVE',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r9',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    };
    const nodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: now + 30000,
      last_heartbeat: now,
    };
    let serviceRows = [];
    let executeCount = 0;

    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const isPendingClaim =
            whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === WORKFLOW_STEP.PENDING &&
            operationRow.workflow_step === WORKFLOW_STEP.PENDING;
          if (isPendingClaim) {
            operationRow.workflow_step = updateData.workflow_step;
            operationRow.updated_at = updateData.updated_at;
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
          return {
            success: true,
            partitionResult: {
              affectedRows: 0,
            },
          };
        },
      },
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-2') {
            return nodeRow;
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            return operationRow.workflow_step === WORKFLOW_STEP.PENDING ?
              [operationRow] :
              [];
          }
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            return serviceRows;
          }
          return [];
        },
      },
      rebalanceCoordinator: {
        cdcGroupPropagationService: {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: 'normal',
            enteredAt: new Date().toISOString(),
            recentTransitions: [],
          }),
        },
        claimDispatchTransition: async (opId) =>
          claimPendingOperation(operationRow, opId),
        executeOperation: async () => {
          executeCount += 1;
          return {success: true};
        },
      },
    });
    service.initialize();

    try {
      await service.dispatchOperationRow(operationRow);
      t.equal(
        executeCount,
        0,
        'should not dispatch remove before handler exists',
      );

      serviceRows = [{
        [COLUMN.NODE_ID]: 'node-2',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      }];
      service.handleCacheNodeChange(SYSTEM_TABLE_NAME.SERVICES, serviceRows[0]);
      await waitForRetryDrain(service);

      t.equal(
        executeCount,
        1,
        'should retry and dispatch when handler becomes active',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'operation should be claimed after handler activation retry',
      );
    } finally {
      service.stop();
    }
  },
);
