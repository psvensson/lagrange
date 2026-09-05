/**
 * Integration test for atomic dispatch claims in ReplicaDispatchService.
 * Task 18: expected to fail until atomic PENDING->SENDING claim is enforced.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneField} from
  '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {DISPATCH_SUBSYSTEM} from
  '../../src/control-plane/replica-dispatch-service-constants.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {REBALANCE_COORDINATOR_EVENT} from
  '../../src/rebalancer/rebalancer-constants.js';
import {
  claimPendingOperation,
  createCanonicalPartitionOperationRow,
  initializeAtomicClaimTestEnvironment as initEnv,
} from './replica-dispatch-atomic-claim-test-support.js';

function createObservableCache({get, getAll}) {
  const listeners = new Set();
  return {
    get,
    getAll,
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      return listeners.delete(listener);
    },
    publishChange(tableName, operation, record) {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
  };
}

test(
  'ReplicaDispatchService dispatches a pending operation once across triggers',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = createCanonicalPartitionOperationRow({
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
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            return {
              success: true,
              partitionResult: {affectedRows: 1},
            };
          }

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
  'ReplicaDispatchService unions authoritative priority retry rows when ' +
  'cache has stale rows',
  async (t) => {
    initEnv();

    const now = Date.now();
    const targetNodeId = 'node-target';
    const sourceNodeId = 'node-source';
    const staleCacheOperationId = 'op-stale-cache-retry-dispatch';
    const authoritativeOperationId = 'op-authoritative-priority-retry-dispatch';
    const staleCacheRow = createCanonicalPartitionOperationRow({
      operation_id: staleCacheOperationId,
      type: 'REPLACE',
      partition_id: 'sql_transactions-p1',
      replica_id: 'sql_transactions-p1-r4',
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: '[]',
    });
    const authoritativeQueryOptions = [];
    const service = new ReplicaDispatchService({
      nodeId: targetNodeId,
      messageRouter: {},
      cdcIntegrationService: {},
      systemTableCache: {
        get() {
          return null;
        },
        getAll(tableName) {
          return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ?
            [staleCacheRow] :
            [];
        },
      },
      rebalanceCoordinator: {
        isOperationLocallyOwned(operation) {
          return (
            operation?.targetNodeId === targetNodeId ||
            operation?.target_node_id === targetNodeId
          );
        },
        repository: {
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [{
              operationId: authoritativeOperationId,
              type: 'REPLACE',
              partitionId: 'sql_write_operations-p1',
              replicaId: 'sql_write_operations-p1-r4',
              sourceNodeId,
              targetNodeId,
              status: 'pending',
              workflowStep: WORKFLOW_STEP.PENDING,
              createdAt: now,
              updatedAt: now,
              completedAt: null,
              errorMessage: null,
              stepsHistory: [],
              entityType: SERVICE_TYPE.PARTITION,
              entityId: 'sql_write_operations-p1',
            }];
          },
        },
      },
      controlPlaneReadinessService: {
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 3,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: [targetNodeId],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 3,
              readyEligibleNodeCount: 2,
              blockedPartitions: [{
                partitionId: 'sql_write_operations-p1',
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 2,
                spreadGap: 1,
              }],
              missingPartitionIds: ['sql_write_operations-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: [targetNodeId],
              projectedServingNodeIds: [targetNodeId],
            },
          };
        },
      },
    });

    const dispatchRows =
      await service.getDispatchRetryRowsForNode(targetNodeId);

    t.same(
      authoritativeQueryOptions,
      [{
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      }],
      'priority recovery should still query authoritative retry rows when cache has replayable work',
    );
    t.same(
      dispatchRows.map((row) => row.operation_id),
      [
        authoritativeOperationId,
        staleCacheOperationId,
      ],
      'authoritative retry rows should be unioned ahead of cache rows',
    );
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
  'ReplicaDispatchService reconciles authoritative pending operation when cache visibility lags',
  async (t) => {
    initEnv();

    const now = Date.now();
    const operationRow = createCanonicalPartitionOperationRow({
      operation_id: 'op-authoritative-only-1',
      type: 'ADD',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      completed_at: null,
      error_message: null,
      steps_history: '[]',
    });

    let authoritativeReadCount = 0;
    let dispatchedOperation = null;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.CONNECTED,
      },
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows(tableName, sql, params, options) {
          authoritativeReadCount += 1;
          t.equal(
            tableName,
            SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
            'should read authoritative replica operations',
          );
          t.match(
            sql,
            /SELECT \* FROM replica_operations WHERE operation_id = \?/,
            'should query by operation id',
          );
          t.same(
            params,
            [operationRow.operation_id],
            'should request the missing operation row',
          );
          t.equal(
            options?.owner,
            DISPATCH_SUBSYSTEM,
            'should use dispatch subsystem ownership for the fallback read',
          );
          return {
            success: true,
            rows: [{...operationRow}],
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .REPAIR_ELIGIBLE]: true,
            },
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
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
        isOperationLocallyOwned(operation) {
          return (
            operation?.sourceNodeId === 'node-1' ||
            operation?.source_node_id === 'node-1'
          );
        },
        async dispatchOperation(operation) {
          dispatchedOperation = operation;
          return {success: true};
        },
      },
    });
    service.initialize();

    try {
      await service.reconcileOperationDispatch(operationRow.operation_id);

      t.equal(
        authoritativeReadCount,
        1,
        'should fall back to an authoritative operation lookup once',
      );
      t.equal(
        dispatchedOperation?.operationId,
        operationRow.operation_id,
        'should dispatch the authoritative pending operation',
      );
      t.equal(
        dispatchedOperation?.targetNodeId,
        operationRow.target_node_id,
        'should preserve the target node from the authoritative row',
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
    const operationRow = createCanonicalPartitionOperationRow({
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
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.DISCONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    let routerConnectionState = STATE.DISCONNECTED;
    const systemTableCache = createObservableCache({
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
    });
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
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            const existing = nodeStore.get(nodeId);
            if (!existing) {
              return {
                success: true,
                partitionResult: {
                  affectedRows: 0,
                },
              };
            }
            Object.assign(existing, updateData || {});
            systemTableCache.publishChange(
              SYSTEM_TABLE_NAME.NODES,
              'UPDATE',
              existing,
            );
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });

    let executeCount = 0;
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: () => STATE.DISCONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }
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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    // Node-aware transport mock: node-2 starts without transport
    // connectivity (no ready lease yet). Once the ready lease is
    // set, transport also becomes connected. Per §1.4.12 transport
    // connectivity is the strongest evidence of node health.
    let node2TransportConnected = false;
    const systemTableCache = createObservableCache({
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
    });
    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {
        getConnectionState: (nodeId) =>
          nodeId === 'node-2' && !node2TransportConnected ?
            STATE.DISCONNECTED :
            STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            const existing = nodeStore.get(nodeId);
            if (!existing) {
              return {
                success: true,
                partitionResult: {
                  affectedRows: 0,
                },
              };
            }
            Object.assign(existing, updateData);
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

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
      node2TransportConnected = true;
      systemTableCache.publishChange(
        SYSTEM_TABLE_NAME.NODES,
        'UPDATE',
        readyNodeRow,
      );

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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });

    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
    });

    let executeCount = 0;
    let cacheListener = null;
    // Node-aware transport mock: node-2 starts without transport
    // connectivity (no ready lease yet). Per §1.4.12 transport
    // connectivity is the strongest evidence of node health.
    const node2CacheTransportConnected = false;
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
        getConnectionState: (nodeId) => nodeId === 'node-2' && !node2CacheTransportConnected ? STATE.DISCONNECTED : STATE.CONNECTED,
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async (_tableName, whereClause, updateData) => {
          const nodeId =
            whereClause?.[COLUMN.NODE_ID] ||
            whereClause?.node_id ||
            whereClause?.nodeId ||
            null;
          if (nodeId) {
            const existing = nodeStore.get(nodeId);
            if (!existing) {
              return {
                success: true,
                partitionResult: {
                  affectedRows: 0,
                },
              };
            }
            Object.assign(existing, updateData);
            return {
              success: true,
              partitionResult: {
                affectedRows: 1,
              },
            };
          }

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
      // The cache-change retry lands after the readiness planning barrier
      // closes (a macrotask hop, not a fixed delay): wait for the observable
      // with a bounded budget instead of a fixed sleep.
      const retryDeadline = Date.now() + 2000;
      while (executeCount === 0 && Date.now() < retryDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

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
