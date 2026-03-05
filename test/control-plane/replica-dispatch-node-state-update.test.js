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

test('ReplicaDispatchService persists NODE_STATE_UPDATE ready heartbeats', async (t) => {
  initEnv();

  const now = Date.now();
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
    created_at: now - 5000,
  };

  const service = new ReplicaDispatchService({
    nodeId: 'node-1',
    messageRouter: {},
    cdcIntegrationService: {
      upsertSystemTableRow: async (tableName, row) => {
        upserts.push({tableName, row});
        return {success: true};
      },
    },
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes' || nodeId !== 'node-2') {
          return null;
        }
        return cacheNode;
      },
      getAll: (_tableName) => [],
    },
    rebalanceCoordinator: {
      executeOperation: async () => ({success: true}),
    },
  });
  service.initialize();

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-2',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(upserts.length, 1, 'persists one nodes row upsert');
  if (upserts.length !== 1) {
    service.stop();
    return;
  }
  t.equal(upserts[0].tableName, 'nodes', 'writes to nodes table');
  t.equal(
    upserts[0].row.connection_state,
    STATE.READY,
    'marks node as ready',
  );
  t.equal(
    upserts[0].row.last_heartbeat,
    now,
    'uses payload heartbeat timestamp',
  );
  t.ok(
    upserts[0].row.ready_lease_expires_at > now,
    'refreshes ready lease expiry',
  );
  t.equal(upserts[0].row.cpu_cores, 8, 'preserves existing node fields');

  service.stop();
});

test('ReplicaDispatchService applies nodeRow payload from NODE_STATE_UPDATE heartbeats',
  async (t) => {
    initEnv();

    const now = Date.now();
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
      created_at: now - 5000,
    };

    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {},
      cdcIntegrationService: {
        upsertSystemTableRow: async (tableName, row) => {
          upserts.push({tableName, row});
          return {success: true};
        },
      },
      systemTableCache: {
        get: (tableName, nodeId) => {
          if (tableName !== 'nodes' || nodeId !== 'node-3') {
            return null;
          }
          return cacheNode;
        },
        getAll: (_tableName) => [],
      },
      rebalanceCoordinator: {
        executeOperation: async () => ({success: true}),
      },
    });
    service.initialize();

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-3',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8083',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
      [ControlPlaneField.HEARTBEAT_AT]: now,
      [ControlPlaneField.NODE_ROW]: {
        cpu_cores: 16,
        memory_mb: 32768,
        disk_gb: 750,
        cpu_usage_percent: 41,
        memory_usage_percent: 52,
        disk_usage_percent: 63,
      },
    });

    t.equal(upserts.length, 1, 'persists one nodes row upsert');
    t.equal(upserts[0].row.cpu_cores, 16, 'should use nodeRow cpu cores');
    t.equal(upserts[0].row.memory_mb, 32768, 'should use nodeRow memory');
    t.equal(upserts[0].row.disk_gb, 750, 'should use nodeRow disk size');
    t.equal(
      upserts[0].row.cpu_usage_percent,
      41,
      'should use nodeRow cpu usage',
    );
    t.equal(
      upserts[0].row.memory_usage_percent,
      52,
      'should use nodeRow memory usage',
    );
    t.equal(
      upserts[0].row.disk_usage_percent,
      63,
      'should use nodeRow disk usage',
    );

    service.stop();
  });
