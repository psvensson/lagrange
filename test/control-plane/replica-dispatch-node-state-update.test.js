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
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';

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
  const cacheByNodeId = new Map();
  for (const node of cacheNodes) {
    if (!node || !node.node_id) {
      continue;
    }
    cacheByNodeId.set(node.node_id, node);
  }
  const cdcIntegrationService = options.cdcIntegrationService;

  const service = new ReplicaDispatchService({
    nodeId: 'node-1',
    messageRouter: {},
    cdcIntegrationService,
    nodeStateUpdateQueueShardCount: options.nodeStateUpdateQueueShardCount,
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes') {
          return null;
        }
        return cacheByNodeId.get(nodeId) || null;
      },
      getAll: (_tableName) => [],
    },
    rebalanceCoordinator: {
      executeOperation: async () => ({success: true}),
    },
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
