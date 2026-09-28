/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {registerReplicaDispatchNodeStateOperationDispatchRetryTests} from
  './replica-dispatch-node-state-operation-dispatch-retry-test-cases.js';
import {
  createService,
  initEnv,
  READY_NODE_CAPABILITIES_JSON,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  COLUMN,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

test('ReplicaDispatchService ignores non-owner replica_operations cache rows',
  async (t) => {
    initEnv();

    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
    });
    const enqueueCalls = [];
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
      },
    };

    service.handleCdcApplied(null, {
      tableName: 'replica_operations',
      data: {
        operation_id: 'add-op-2',
        partition_id: 'replica_operations-p1',
        entity_type: 'partition',
        entity_id: 'replica_operations-p1',
        replica_id: 'replica_operations-p1-r4',
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        workflow_step: WORKFLOW_STEP.PENDING,
        type: OperationType.ADD,
      },
    });
    service.handleCacheNodeChange('replica_operations', 'INSERT', {
      operation_id: 'add-op-2',
      partition_id: 'replica_operations-p1',
      entity_type: 'partition',
      entity_id: 'replica_operations-p1',
      replica_id: 'replica_operations-p1-r4',
      source_node_id: 'node-2',
      target_node_id: 'node-1',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: OperationType.ADD,
    });

    t.equal(
      enqueueCalls.length,
      0,
      'non-owner nodes must not enqueue replica operation dispatch work',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService refuses missing registered node identity despite ' +
  'a complete NODE_STATE_UPDATE payload',
async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const upserts = [];

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      upsertSystemTableRow: async (tableName, row, options) => {
        upserts.push({tableName, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  const error = await t.rejects(service.publishNodeLifecycleMessage({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.BOOT_INCARNATION]: 1,
    [ControlPlaneField.NODE_ID]: 'node-joiner',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8099',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.NODE_ID]: 'node-joiner',
      [COLUMN.NODE_ADDRESS]: 'localhost:8099',
      [COLUMN.CPU_CORES]: 8,
      [COLUMN.MEMORY_MB]: 16384,
      [COLUMN.DISK_GB]: 500,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now - 1000,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
    },
  }));
  t.equal(error?.code, 'NODE_ROW_MISSING',
    'registration absence remains the creation owner concern');
  t.equal(updates.length, 0,
    'publication does not mutate before authoritative registration exists');
  t.equal(upserts.length, 0,
    'payload contents cannot recreate canonical node identity');

  service.stop();
});

test('ReplicaDispatchService refuses missing registered identity for ' +
  'heartbeat-only NODE_STATE_UPDATE payloads',
async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const upserts = [];

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      upsertSystemTableRow: async (tableName, row, options) => {
        upserts.push({tableName, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  const error = await t.rejects(service.publishNodeLifecycleMessage({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.BOOT_INCARNATION]: 1,
    [ControlPlaneField.NODE_ID]: 'node-joiner-heartbeat-only',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8100',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.NODE_ID]: 'node-joiner-heartbeat-only',
      [COLUMN.NODE_ADDRESS]: 'localhost:8100',
      [COLUMN.CPU_CORES]: 16,
      [COLUMN.MEMORY_MB]: 32768,
      [COLUMN.DISK_GB]: 1000,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now - 1000,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
    },
  }));

  t.equal(error?.code, 'NODE_ROW_MISSING',
    'heartbeat recovery cannot become a registration creator');
  t.equal(updates.length, 0,
    'heartbeat publication does not mutate an absent identity');
  t.equal(upserts.length, 0,
    'heartbeat-only publication never invents canonical identity');

  service.stop();
});

test('ReplicaDispatchService NODE_STATE_UPDATE uses injected control-plane ' +
  'system-table gateway', async (t) => {
  initEnv();

  const gatewayCalls = [];
  const cacheNode = {
    node_id: 'node-gateway',
    node_address: 'localhost:8090',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: READY_NODE_CAPABILITIES_JSON,
    last_heartbeat: Date.now() - 1000,
    ready_lease_expires_at: null,
    created_at: Date.now() - 10000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
      upsertSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        gatewayCalls.push({
          method: 'updateSystemTableRow',
          tableName,
          whereClause,
          row,
          options,
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'upsertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
    },
  });

  await service.publishNodeLifecycleMessage({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.BOOT_INCARNATION]: 1,
    [ControlPlaneField.NODE_ID]: 'node-gateway',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8090',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: Date.now(),
  });

  t.equal(gatewayCalls.length, 1, 'gateway should own the node-state write');
  t.equal(
    gatewayCalls[0].method,
    'updateSystemTableRow',
    'dispatch should route NODE_STATE_UPDATE through the gateway',
  );
  t.equal(
    gatewayCalls[0].tableName,
    'nodes',
    'dispatch gateway writes should target the nodes table',
  );

  service.stop();
});

registerReplicaDispatchNodeStateOperationDispatchRetryTests({
  createService,
  initEnv,
  READY_NODE_CAPABILITIES_JSON,
});
