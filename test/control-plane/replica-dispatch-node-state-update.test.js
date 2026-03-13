/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createService(options = {}) {
  const cacheNode = options.cacheNode || null;
  const cacheNodes = Array.isArray(options.cacheNodes) ?
    options.cacheNodes :
    (cacheNode ? [cacheNode] : []);
  const cacheReplicaOperations = Array.isArray(options.cacheReplicaOperations) ?
    options.cacheReplicaOperations :
    [];
  const cacheByNodeId = new Map();
  for (const node of cacheNodes) {
    if (!node || !node.node_id) {
      continue;
    }
    cacheByNodeId.set(node.node_id, node);
  }
  const cdcIntegrationService = options.cdcIntegrationService;
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService;
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway;
  const rebalanceCoordinator = options.rebalanceCoordinator || {
    executeOperation: async () => ({success: true}),
  };

  const service = new ReplicaDispatchService({
    nodeId: 'node-1',
    messageRouter: {},
    cdcIntegrationService,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService,
    nodeStateUpdateQueueShardCount: options.nodeStateUpdateQueueShardCount,
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes') {
          return null;
        }
        return cacheByNodeId.get(nodeId) || null;
      },
      getAll: (tableName) => {
        if (tableName === 'replica_operations') {
          return cacheReplicaOperations;
        }
        if (tableName === 'nodes') {
          return cacheNodes;
        }
        return [];
      },
    },
    rebalanceCoordinator,
  });
  service.initialize();
  return service;
}

test('ReplicaDispatchService updates existing node rows for NODE_STATE_UPDATE',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const upserts = [];
    const cacheNode = {
      node_id: 'node-2',
      node_address: 'localhost:8082',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      storage_budget_bytes: 1024,
      created_at: now - 5000,
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
        upsertSystemTableRow: async (tableName, row) => {
          upserts.push({tableName, row});
          return {success: true};
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-2',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(updates.length, 1, 'persists one nodes row update');
    t.equal(upserts.length, 0, 'should not upsert when update affects row');
    t.equal(updates[0].tableName, 'nodes', 'writes to nodes table');
    t.same(
      updates[0].whereClause,
      {node_id: 'node-2'},
      'targets the node row by node_id',
    );
    t.equal(
      updates[0].options?.skipCacheWait,
      true,
      'node-state updates should not wait on cache convergence',
    );
    t.equal(
      updates[0].row.connection_state,
      STATE.READY,
      'marks node as ready',
    );
    t.ok(
      updates[0].row.last_heartbeat >= now,
      'heartbeat timestamp should be fresh at apply time',
    );
    t.ok(
      updates[0].row.ready_lease_expires_at > updates[0].row.last_heartbeat,
      'ready lease should extend from the applied heartbeat timestamp',
    );
    t.equal(
      updates[0].row.storage_budget_bytes,
      undefined,
      'update payload should not mutate storage budget ownership fields',
    );

    service.stop();
  });

test('ReplicaDispatchService fallback upsert preserves storage budget fields',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const upserts = [];
    const cacheNode = {
      node_id: 'node-3',
      node_address: 'localhost:8083',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      storage_budget_bytes: 107374182400,
      storage_budget_source: 'absolute',
      storage_budget_updated_at: now - 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
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
          return {success: true};
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-3',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8083',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(updates.length, 1, 'attempts update first');
    t.equal(upserts.length, 1, 'falls back to upsert when row is missing');
    t.equal(
      upserts[0].options?.skipCacheWait,
      true,
      'fallback upsert should not wait on cache convergence',
    );
    t.equal(
      upserts[0].row.storage_budget_bytes,
      107374182400,
      'fallback upsert preserves storage budget bytes',
    );
    t.equal(
      upserts[0].row.storage_budget_source,
      'absolute',
      'fallback upsert preserves storage budget source',
    );

    service.stop();
  });

test('ReplicaDispatchService ready-node retry re-enters operationDispatchQueue',
  async (t) => {
    initEnv();

    const now = Date.now();
    const readyNode = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    };
    const pendingRow = {
      operation_id: 'op-ready-retry-1',
      target_node_id: 'node-2',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: 'ADD',
    };
    const dispatchCalls = [];
    const enqueueCalls = [];
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [pendingRow],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        dispatchOperation: async (operationId) => {
          dispatchCalls.push(operationId);
          return {success: true};
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          };
        },
      },
    });
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        enqueueCalls.push({operationId, reason, context});
      },
    };

    await service.retryPendingDispatchesForReadyNode({
      nodeId: 'node-2',
      nodeRow: readyNode,
    });

    t.same(
      enqueueCalls,
      [{
        operationId: 'op-ready-retry-1',
        reason: RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        context: {row: pendingRow},
      }],
      'ready-node retries must route pending operations through the canonical operation queue',
    );
    t.same(
      dispatchCalls,
      [],
      'ready-node retries must not dispatch operations inline',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService upserts startup storage budget fields from ' +
  'NODE_STATE_UPDATE payload when the node row is first inserted',
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
        return {success: true};
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
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
  });

  t.equal(updates.length, 1, 'attempts update before fallback upsert');
  t.equal(upserts.length, 1, 'falls back to upsert when the node row is absent');
  t.equal(
    upserts[0].row.storage_budget_bytes,
    107374182400,
    'first-insert NODE_STATE_UPDATE should persist storage budget bytes from the payload node row',
  );
  t.equal(
    upserts[0].row.storage_budget_source,
    'backfill',
    'first-insert NODE_STATE_UPDATE should persist storage budget source from the payload node row',
  );
  t.equal(
    upserts[0].row.storage_budget_updated_at,
    now - 500,
    'first-insert NODE_STATE_UPDATE should persist storage budget updated timestamp from the payload node row',
  );

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
    capabilities: '[]',
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

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
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
      cdcIntegrationService: {
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
        upsertSystemTableRow: async () => ({success: true}),
      },
    });
    const mgService = {
      acknowledgeMessage: async () => {},
      isLeaderReplica: () => true,
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
      cacheNode: {
        node_id: 'node-5',
        node_address: 'localhost:8085',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return new Promise((resolve) => {
            resolveUpdate = () => resolve({
              success: true,
              partitionResult: {affectedRows: 1},
            });
          });
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => true,
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
