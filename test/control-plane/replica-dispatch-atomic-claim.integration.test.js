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
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneField} from
  '../../src/control-plane/control-plane-constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
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
          if (tableName === SystemTableName.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: STATE.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SystemTableName.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: STATE.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
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
        tableName: SystemTableName.REPLICA_OPERATIONS,
        data: operationRow,
      });
      await service.handleReplicaOperationDispatch({
        [ControlPlaneField.OPERATION_ID]: operationRow.operation_id,
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
          if (tableName === SystemTableName.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: STATE.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          return null;
        },
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
          if (tableName === SystemTableName.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: STATE.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SystemTableName.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: STATE.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
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
        tableName: SystemTableName.REPLICA_OPERATIONS,
        data: operationRow,
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
      status: STATE.ACTIVE,
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
          if (tableName === SystemTableName.NODES) {
            return nodeStore.get(key) || null;
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
      },
      sqlQueryEngine: {
        executeQuery: async (sql, params) => {
          if (sql.includes('FROM nodes') &&
              params?.[0] === 'node-2') {
            const row = nodeStore.get('node-2');
            return {success: true, rows: row ? [row] : []};
          }
          if (sql.includes('FROM replica_operations') &&
              sql.includes('target_node_id') &&
              params?.[0] === 'node-2' &&
              params?.[1] === WORKFLOW_STEP.PENDING &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
            return {success: true, rows: [operationRow]};
          }
          if (sql.includes('FROM services')) {
            return {
              success: true,
              rows: [{
                service_id: 'svc-partition-handler',
                [COLUMN.NODE_ID]: 'node-2',
                [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
                [COLUMN.STATUS]: STATE.ACTIVE,
              }],
            };
          }
          return {success: true, rows: []};
        },
      },
      rebalanceCoordinator: {
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
  'ReplicaDispatchService dispatches pending operation when lease is ready even if router state is disconnected',
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
          if (tableName === SystemTableName.NODES && key === 'node-2') {
            return {
              node_id: 'node-2',
              status: STATE.ACTIVE,
              connection_state: STATE.READY,
              ready_lease_expires_at: Date.now() + 30000,
            };
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
        getAll: (tableName) => {
          if (tableName === SystemTableName.SERVICES) {
            return [{
              [COLUMN.NODE_ID]: 'node-2',
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.STATUS]: STATE.ACTIVE,
            }];
          }
          return [];
        },
      },
      rebalanceCoordinator: {
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
                [COLUMN.STATUS]: STATE.ACTIVE,
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
      status: STATE.ACTIVE,
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
          if (tableName === SystemTableName.NODES) {
            return nodeStore.get(key) || null;
          }
          if (tableName === SystemTableName.REPLICA_OPERATIONS &&
              key === operationRow.operation_id) {
            return operationRow;
          }
          return null;
        },
      },
      sqlQueryEngine: {
        executeQuery: async (sql, params) => {
          if (sql.includes('FROM replica_operations') &&
              sql.includes('target_node_id') &&
              params?.[0] === 'node-2' &&
              params?.[1] === WORKFLOW_STEP.PENDING &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
            return {success: true, rows: [operationRow]};
          }
          return {success: true, rows: []};
        },
      },
      rebalanceCoordinator: {
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
        tableName: SystemTableName.NODES,
        data: readyNodeRow,
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
      status: STATE.ACTIVE,
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
        if (tableName === SystemTableName.NODES) {
          return nodeStore.get(key) || null;
        }
        if (tableName === SystemTableName.REPLICA_OPERATIONS &&
            key === operationRow.operation_id) {
          return operationRow;
        }
        return null;
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
      sqlQueryEngine: {
        executeQuery: async (sql, params) => {
          if (sql.includes('FROM replica_operations') &&
              sql.includes('target_node_id') &&
              params?.[0] === 'node-2' &&
              params?.[1] === WORKFLOW_STEP.PENDING &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING) {
            return {success: true, rows: [operationRow]};
          }
          return {success: true, rows: []};
        },
      },
      rebalanceCoordinator: {
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

      cacheListener(SystemTableName.NODES, 'UPDATE', readyNodeRow);
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
