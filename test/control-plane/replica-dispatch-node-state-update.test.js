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
import {STATE} from '../../src/constants/index.js';

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
    status: STATE.ACTIVE,
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
    },
    sqlQueryEngine: {
      executeQuery: async (sql, params) => {
        if (sql.includes('FROM nodes') &&
            params?.[0] === 'node-2') {
          return {success: true, rows: [cacheNode]};
        }
        return {success: true, rows: []};
      },
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
