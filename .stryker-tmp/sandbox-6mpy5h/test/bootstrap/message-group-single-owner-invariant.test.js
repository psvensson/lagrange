// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'seed-node-1', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('BootstrapAPI rejects duplicate active message-group owner registration',
  async (t) => {
    initializeTestEnvironment();

    const rows = {
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r1',
          address: 'seed-node-1/message-group/mg-1-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };

    const systemTableCache = {
      getAll(tableName) {
        return rows[tableName] || [];
      },
      get(tableName, id) {
        const tableRows = rows[tableName] || [];
        return tableRows.find((row) => row.service_id === id) || null;
      },
      filter(tableName, predicate) {
        return (rows[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1'];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache,
      messageGroupServices: new Map(),
    });
    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({
      async executeQuery() {
        return {success: true, rows: []};
      },
    });
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: '550e8400-e29b-41d4-a716-446655440401',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        address: '550e8400-e29b-41d4-a716-446655440401/message-group/mg-1-r1',
      },
    });

    t.equal(response.statusCode, 409, 'active duplicate owner registration should fail closed');
    t.equal(
      response.json().code,
      'REPLICA_OWNER_CONFLICT',
      'ownership conflict should emit stable machine-readable reason code',
    );
  });
