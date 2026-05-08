import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  buildMembershipOwnerOutcome,
} from '../../src/control-plane/membership-lifecycle-controller.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCacheWithLeaderPartitions() {
  const partitionRows = [
    {partition_id: 'nodes-p1', table_id: TABLES.NODES, table_name: TABLES.NODES},
    {
      partition_id: 'node-endpoints-p1',
      table_id: TABLES.NODE_ENDPOINTS,
      table_name: TABLES.NODE_ENDPOINTS,
    },
    {
      partition_id: 'message-groups-p1',
      table_id: TABLES.MESSAGE_GROUPS,
      table_name: TABLES.MESSAGE_GROUPS,
    },
    {
      partition_id: 'replica-operations-p1',
      table_id: TABLES.REPLICA_OPERATIONS,
      table_name: TABLES.REPLICA_OPERATIONS,
    },
  ];
  return {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return partitionRows;
      }
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

test('BootstrapAPI leader readiness consumes membership owner outcome',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createCacheWithLeaderPartitions(),
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: [
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingPartitionLeaderNodes: [
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingPartitionLeaderAddresses: [
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    const status = await api.waitForServiceLeaders({
      startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
      membershipOwnerOutcome: buildMembershipOwnerOutcome({
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      }),
    });

    t.equal(
      status.ready,
      true,
      'restart reentry outcome should dominate conflicting fresh startup mode',
    );
  });
