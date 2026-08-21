/**
 * Integration test coverage for ready-trigger and handler-appearance retries in
 * ReplicaDispatchService.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
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
import {
  claimPendingOperation,
  createCanonicalPartitionOperationRow,
  initializeAtomicClaimTestEnvironment as initEnv,
} from './replica-dispatch-atomic-claim-test-support.js';

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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });
    const readyNodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
      last_heartbeat: now,
    };

    let executeCount = 0;
    let pendingReadCount = 0;
    let exposeOperationRows = false;
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
            if (nodeId !== readyNodeRow.node_id) {
              return {
                success: true,
                partitionResult: {
                  affectedRows: 0,
                },
              };
            }
            Object.assign(readyNodeRow, updateData);
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
            return exposeOperationRows &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING ?
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
    await waitForRetryDrain(service);
    pendingReadCount = 0;
    exposeOperationRows = true;

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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });
    const readyNodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
      last_heartbeat: now,
    };

    let executeCount = 0;
    let pendingReadCount = 0;
    let exposeOperationRows = false;
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
            if (nodeId !== readyNodeRow.node_id) {
              return {
                success: true,
                partitionResult: {
                  affectedRows: 0,
                },
              };
            }
            Object.assign(readyNodeRow, updateData);
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
            return exposeOperationRows &&
              operationRow.workflow_step === WORKFLOW_STEP.PENDING ?
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
    await waitForRetryDrain(service);
    pendingReadCount = 0;
    exposeOperationRows = true;

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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });
    const nodeStore = new Map();
    nodeStore.set('node-2', {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: null,
      last_heartbeat: now,
    });

    let claimAttemptCount = 0;
    let executeCount = 0;
    let exposeOperationRows = false;
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
                partitionResult: {affectedRows: 0},
              };
            }
            nodeStore.set(nodeId, {
              ...existing,
              ...(updateData || {}),
            });
            return {
              success: true,
              partitionResult: {affectedRows: 1},
            };
          }

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
            return exposeOperationRows ? [operationRow] : [];
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
    await waitForRetryDrain(service);
    claimAttemptCount = 0;
    exposeOperationRows = true;

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
    const operationRow = createCanonicalPartitionOperationRow({
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
    });
    const nodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: now + 30000,
      last_heartbeat: now,
    };
    const serviceRows = [];
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
        1,
        'should dispatch remove through replica-handler owner path',
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        'operation should be claimed immediately for remove dispatch',
      );
    } finally {
      service.stop();
    }
  },
);
