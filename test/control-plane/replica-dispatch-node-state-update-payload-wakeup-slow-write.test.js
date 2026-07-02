/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';


test('ReplicaDispatchService dispatches direct wake-up payload rows before ' +
  'cache visibility converges', async (t) => {
  initEnv();

  const dispatchCalls = [];
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-direct-wakeup-payload-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now,
    updated_at: now,
  };

  const service = createService({
    cacheNodes: [{
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    }],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
  });

  try {
    await service.reconcileOperationDispatch(operationRow.operation_id, {
      row: operationRow,
    });

    t.equal(
      dispatchCalls.length,
      1,
      'direct wake-up payload rows should dispatch without waiting for cache visibility',
    );
    t.equal(
      dispatchCalls[0]?.operationId,
      operationRow.operation_id,
      'payload-backed dispatch should preserve the operation id',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService preserves direct wake-up payload rows across ' +
  'deferred retry re-entry before cache visibility converges',
async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const dispatchCalls = [];
  const now = Date.now();
  const retryableError = new Error(
    'control-plane recovery dispatch temporarily deferred',
  );
  retryableError.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
  retryableError.deferRetry = true;
  retryableError.retryAfterMs = 75;
  const operationRow = {
    operation_id: 'op-direct-wakeup-retry-payload-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now,
    updated_at: now,
  };

  const service = createService({
    cacheNodes: [{
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    }],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        if (dispatchCalls.length === 1) {
          throw retryableError;
        }
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.reconcileOperationDispatch(operationRow.operation_id, {
      row: operationRow,
    });

    t.equal(
      dispatchCalls.length,
      1,
      'the direct wake-up payload should drive the first dispatch attempt',
    );
    t.equal(
      scheduled.length,
      1,
      'retryable direct wake-up failures should arm one deferred retry',
    );
    t.equal(
      scheduled[0].delayMs,
      75,
      'deferred retry should honor the retry-after contract',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred retry should preserve the payload row so cache lag cannot drop the handoff',
    );

    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      enqueues[0].context,
    );

    t.equal(
      dispatchCalls.length,
      2,
      'retry re-entry should dispatch again from the preserved payload row',
    );
    t.equal(
      dispatchCalls[1]?.operationId,
      operationRow.operation_id,
      'preserved payload retry should keep the original operation identity',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService preserves REPLACE source replica metadata ' +
  'when dispatching from a direct payload row',
async (t) => {
  initEnv();

  const SOURCE_REPLICA_ID_METADATA_KEY = 'sourceReplicaId';
  const SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
  const TARGET_REPLICA_ID = 'control_plane_publications-p1-r4';
  const dispatchCalls = [];
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-direct-wakeup-replace-source-replica-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    replica_id: TARGET_REPLICA_ID,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: now,
      [SOURCE_REPLICA_ID_METADATA_KEY]: SOURCE_REPLICA_ID,
    }]),
    created_at: now,
    updated_at: now,
  };

  const service = createService({
    cacheNodes: [{
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    }],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls.length,
      1,
      'dispatch should proceed from the direct payload row',
    );
    t.equal(
      dispatchCalls[0]?.replicaId,
      TARGET_REPLICA_ID,
      'dispatch should retain the replacement replica id',
    );
    t.equal(
      dispatchCalls[0]?.sourceReplicaId,
      SOURCE_REPLICA_ID,
      'dispatch should retain the replace source replica id from metadata',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService ignores stale CONNECTED regression after READY',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const cacheNode = {
      node_id: 'node-4',
      node_address: 'localhost:8084',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: now + 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-4',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8084',
      [ControlPlaneField.STATE]: STATE.CONNECTED,
      [ControlPlaneField.HEARTBEAT_AT]: now - 10000,
    });

    t.equal(
      updates.length,
      0,
      'should ignore stale CONNECTED regressions instead of rewriting nodes',
    );

    service.stop();
  });

test('ReplicaDispatchService accepts lagged READY heartbeat timestamps',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const cacheNode = {
      node_id: 'node-4b',
      node_address: 'localhost:8084',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now - 5000,
      ready_lease_expires_at: now + 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-4b',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8084',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now - 60000,
    });

    t.equal(
      updates.length,
      1,
      'lagged READY payload should still refresh the node heartbeat',
    );
    t.ok(
      updates[0]?.row?.last_heartbeat >= now,
      'applies a fresh heartbeat timestamp at write time',
    );

    service.stop();
  });

test('ReplicaDispatchService isolates slow NODE_STATE_UPDATE writes by node lane',
  async (t) => {
    initEnv();

    let resolveSlowUpdate = null;
    let slowInFlight = false;
    let fastObservedSlowInFlight = false;
    const writes = [];
    const service = createService({
      nodeStateUpdateQueueShardCount: 2,
      cdcIntegrationService: {},
      cacheNodes: [
        {
          node_id: 'node-slow',
          node_address: 'localhost:8091',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
          capabilities: '[]',
          created_at: Date.now() - 10000,
        },
        {
          node_id: 'node-fast',
          node_address: 'localhost:8092',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
          capabilities: '[]',
          created_at: Date.now() - 10000,
        },
      ],
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          const nodeId = whereClause?.node_id;
          writes.push({nodeId, tableName, row, options});
          if (nodeId === 'node-slow') {
            slowInFlight = true;
            return new Promise((resolve) => {
              resolveSlowUpdate = () => {
                slowInFlight = false;
                resolve({
                  success: true,
                  partitionResult: {affectedRows: 1},
                });
              };
            });
          }
          fastObservedSlowInFlight = slowInFlight;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async () => {},
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };

    const now = Date.now();
    await service.handleMessageReceived(mgService, {
      messageId: 'slow-msg',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-slow',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });
    await service.handleMessageReceived(mgService, {
      messageId: 'fast-msg',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-fast',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8092',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (fastObservedSlowInFlight) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    t.equal(
      fastObservedSlowInFlight,
      true,
      'fast-node update should execute while slow-node write remains in flight',
    );
    t.ok(
      writes.some((entry) => entry.nodeId === 'node-fast'),
      'fast-node write should not be blocked behind slow-node queue ownership',
    );

    resolveSlowUpdate?.();
    await Promise.resolve();
    service.stop();
  });

test('ReplicaDispatchService acknowledges NODE_STATE_UPDATE before slow write completes',
  async (t) => {
    initEnv();

    let resolveUpdate = null;
    const updates = [];
    const acknowledgements = [];
    const service = createService({
      cdcIntegrationService: {},
      cacheNode: {
        node_id: 'node-5',
        node_address: 'localhost:8085',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return new Promise((resolve) => {
            resolveUpdate = () => resolve({
              success: true,
              partitionResult: {affectedRows: 1},
            });
          });
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };

    const now = Date.now();
    const outcome = await Promise.race([
      service.handleMessageReceived(mgService, {
        messageId: 'msg-1',
        payload: {
          [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.NODE_ID]: 'node-5',
          [ControlPlaneField.NODE_ADDRESS]: 'localhost:8085',
          [ControlPlaneField.STATE]: STATE.READY,
          [ControlPlaneField.HEARTBEAT_AT]: now,
        },
      }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 50)),
    ]);

    t.equal(
      outcome,
      'completed',
      'node-state message handling should not wait on the slow write path',
    );
    t.same(
      acknowledgements,
      ['msg-1'],
      'node-state message should be acknowledged once enqueued',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    t.equal(updates.length, 1, 'should still process the queued write');

    resolveUpdate?.();
    await Promise.resolve();
    service.stop();
  });

test('ReplicaDispatchService forwards NODE_STATE_UPDATE when local ingress is not metadata-ready',
  async (t) => {
    initEnv();

    const acknowledgements = [];
    const forwarded = [];
    const service = createService({
      cdcIntegrationService: {},
      cacheNode: {
        node_id: 'node-6',
        node_address: 'localhost:8086',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async () => {
          throw new Error('should not write locally when ingress is not ready');
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: 'leader routing not established',
        retryAfterMs: 250,
      }),
      getLeaderId: () => {
        throw new Error('should not use raw leader-id forwarding');
      },
      buildPeerAddress: () => {
        throw new Error('should not build raw leader address for metadata ingress');
      },
      sendMessage: async () => {
        throw new Error('should not send metadata ingress via raw leader path');
      },
      forwardMetadataIngressPayloadToLeader: async (payload, options) => {
        forwarded.push({payload, options});
      },
    };

    const now = Date.now();
    await service.handleMessageReceived(mgService, {
      messageId: 'msg-forward',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-6',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8086',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });

    t.same(
      acknowledgements,
      ['msg-forward'],
      'forwarded node-state message should still be acknowledged once forwarded',
    );
    t.same(
      forwarded,
      [{
        payload: {
          [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.NODE_ID]: 'node-6',
          [ControlPlaneField.NODE_ADDRESS]: 'localhost:8086',
          [ControlPlaneField.STATE]: STATE.READY,
          [ControlPlaneField.HEARTBEAT_AT]: now,
        },
        options: {
          requiredTables: ['nodes'],
          forwardedByNodeId: 'node-1',
        },
      }],
      'node-state updates should forward through canonical metadata ingress ' +
        'routing instead of writing locally',
    );

    service.stop();
  });

test(
  'ReplicaDispatchService forwards NODE_STATE_UPDATE when canonical metadata ' +
  'ingress selection resolves to forward',
  async (t) => {
    initEnv();

    const acknowledgements = [];
    const forwarded = [];
    let localWriteAttempted = false;
    const service = createService({
      cdcIntegrationService: {},
      cacheNode: {
        node_id: 'node-7',
        node_address: 'localhost:8087',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async () => {
          localWriteAttempted = true;
          throw new Error('should not write locally when canonical ingress action is forward');
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: true,
      }),
      resolveMetadataIngressForwardSelection: async () => ({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        ready: true,
        reason: 'forward_through_canonical_metadata_ingress',
      }),
      getLeaderId: () => {
        throw new Error('dispatch should use canonical metadata ingress selection');
      },
      buildPeerAddress: () => {
        throw new Error('dispatch should not use raw leader addressing');
      },
      sendMessage: async () => {
        throw new Error('dispatch should not use raw leader message send');
      },
      forwardMetadataIngressPayloadToLeader: async (payload, options) => {
        forwarded.push({payload, options});
      },
    };

    const now = Date.now();
    await service.handleMessageReceived(mgService, {
      messageId: 'msg-forward-selection',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-7',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8087',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });

    t.equal(
      localWriteAttempted,
      false,
      'canonical forward selection should bypass the local write lane',
    );
    t.same(
      acknowledgements,
      ['msg-forward-selection'],
      'forwarded node-state message should still be acknowledged once forwarded',
    );
    t.same(
      forwarded,
      [{
        payload: {
          [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.NODE_ID]: 'node-7',
          [ControlPlaneField.NODE_ADDRESS]: 'localhost:8087',
          [ControlPlaneField.STATE]: STATE.READY,
          [ControlPlaneField.HEARTBEAT_AT]: now,
        },
        options: {
          requiredTables: ['nodes'],
          forwardedByNodeId: 'node-1',
        },
      }],
      'node-state updates should forward through the canonical metadata ingress selection when the owner says forward',
    );

    service.stop();
  },
);
