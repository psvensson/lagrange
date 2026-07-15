import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {initializeTestEnvironment} from './bootstrap-api-test-fixtures.js';

const TEST_PARTITION_ID = 'nodes-p1';
const TEST_SECOND_PARTITION_ID = 'tables-p1';
const TEST_LEADER_NODE_ID = 'seed-node-1';

function createSystemTableCache({partitions, services = []}) {
  const rowsByTable = new Map([
    [TABLES.PARTITIONS, partitions],
    [TABLES.SERVICES, services],
    [TABLES.MESSAGE_GROUPS, []],
  ]);
  return {
    get(tableName, id) {
      if (tableName === TABLES.PARTITIONS) {
        return partitions.find((row) => row.partition_id === id) || null;
      }
      return null;
    },
    getAll(tableName) {
      return rowsByTable.get(tableName) || [];
    },
    filter(tableName, predicate) {
      return (rowsByTable.get(tableName) || []).filter(predicate);
    },
    find(tableName, predicate) {
      return (rowsByTable.get(tableName) || []).find(predicate) || null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function createPartitionRow(partitionId, tableName, leaderNodeId = null) {
  return {
    partition_id: partitionId,
    table_id: tableName,
    table_name: tableName,
    leader_node_id: leaderNodeId,
  };
}

function createLeaderService(partitionId, leaderNodeId = TEST_LEADER_NODE_ID) {
  return {
    service_id: `${partitionId}-leader`,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: leaderNodeId,
    address: `${leaderNodeId}/partition/${partitionId}-leader`,
    raft_role: RAFT_ROLE.LEADER,
    status: SERVICE_STATUS.ACTIVE,
  };
}

function createAuthoritativeView({partitionRows, serviceRows, calls}) {
  return {
    async readRows(tableName, sql, params, options) {
      calls.push({tableName, sql, params, options});
      if (tableName === TABLES.PARTITIONS) {
        return {success: true, rows: partitionRows};
      }
      if (tableName === TABLES.SERVICES) {
        return {success: true, rows: serviceRows};
      }
      return {success: false, rows: []};
    },
  };
}

test('seed join gate refreshes stale leader metadata from bounded authoritative reads',
  async (t) => {
    initializeTestEnvironment();
    const calls = [];
    const partitions = [
      createPartitionRow(TEST_PARTITION_ID, TABLES.NODES),
      createPartitionRow(TEST_SECOND_PARTITION_ID, TABLES.TABLES),
    ];
    const authoritativePartitions = [
      createPartitionRow(
        TEST_PARTITION_ID,
        TABLES.NODES,
        TEST_LEADER_NODE_ID,
      ),
      createPartitionRow(
        TEST_SECOND_PARTITION_ID,
        TABLES.TABLES,
        TEST_LEADER_NODE_ID,
      ),
    ];
    const api = new BootstrapAPI({
      seedNodeId: TEST_LEADER_NODE_ID,
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createSystemTableCache({partitions}),
      authoritativeControlPlaneView: createAuthoritativeView({
        partitionRows: authoritativePartitions,
        serviceRows: [
          createLeaderService(TEST_PARTITION_ID),
          createLeaderService(TEST_SECOND_PARTITION_ID),
        ],
        calls,
      }),
    });
    api.checkForConflicts = async () => null;
    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440730',
        nodeAddress: 'ws://localhost:9730',
      },
    });
    const responseBody = JSON.parse(response.body);

    t.equal(response.statusCode, 200,
      'fresh authoritative leader metadata should admit the joiner');
    t.equal(responseBody.leaderReadiness.ready, true,
      'the bootstrap response should report a satisfied leader gate');
    t.equal(calls.length, 2,
      'the miss path should use a fixed two-read aggregate refresh');
    t.same(calls.map((call) => call.tableName).sort(), [
      TABLES.PARTITIONS,
      TABLES.SERVICES,
    ].sort(), 'the aggregate refresh should read only owner and service rows');
    for (const call of calls) {
      t.same(call.params, [TEST_PARTITION_ID, TEST_SECOND_PARTITION_ID],
        'each read should batch every missing partition into one query');
      t.equal(call.options.allowSqlFallback, false,
        'the refresh should remain on the authoritative owner read path');
      t.equal(call.options.queryTimeoutMs, 1500,
        'each authoritative read should carry a finite timeout');
    }
    await api.shutdown();
  });

test('seed join gate still rejects genuinely leaderless authoritative metadata',
  async (t) => {
    initializeTestEnvironment();
    const calls = [];
    const partitions = [
      createPartitionRow(TEST_PARTITION_ID, TABLES.NODES),
    ];
    const api = new BootstrapAPI({
      seedNodeId: TEST_LEADER_NODE_ID,
      systemTableCache: createSystemTableCache({partitions}),
      authoritativeControlPlaneView: createAuthoritativeView({
        partitionRows: partitions,
        serviceRows: [],
        calls,
      }),
    });

    const status = await api.waitForServiceLeaders();

    t.equal(status.ready, false,
      'missing authoritative leader evidence should preserve the rejection');
    t.same(status.missingPartitionLeaders, [TEST_PARTITION_ID]);
    t.equal(calls.length, 2,
      'a cache miss should perform only the fixed aggregate refresh');
  });

test('seed join gate preserves rejection when authoritative refresh is unavailable',
  async (t) => {
    initializeTestEnvironment();
    const calls = [];
    const partitions = [
      createPartitionRow(TEST_PARTITION_ID, TABLES.NODES),
    ];
    const api = new BootstrapAPI({
      seedNodeId: TEST_LEADER_NODE_ID,
      systemTableCache: createSystemTableCache({partitions}),
      authoritativeControlPlaneView: {
        async readRows(tableName) {
          calls.push(tableName);
          throw new Error('authoritative read unavailable');
        },
      },
    });

    const status = await api.waitForServiceLeaders();

    t.equal(status.ready, false,
      'refresh failure should fail open to the existing not-ready result');
    t.same(status.missingPartitionLeaders, [TEST_PARTITION_ID]);
    t.equal(calls.length, 2,
      'refresh failure should not trigger retries or per-partition fanout');
  });

test('seed join gate performs no authoritative reads on cache-hit and probe paths',
  async (t) => {
    initializeTestEnvironment();
    const calls = [];
    const leaderPartition = createPartitionRow(
      TEST_PARTITION_ID,
      TABLES.NODES,
      TEST_LEADER_NODE_ID,
    );
    const authoritativeControlPlaneView = createAuthoritativeView({
      partitionRows: [leaderPartition],
      serviceRows: [createLeaderService(TEST_PARTITION_ID)],
      calls,
    });
    const hitApi = new BootstrapAPI({
      seedNodeId: TEST_LEADER_NODE_ID,
      systemTableCache: createSystemTableCache({
        partitions: [leaderPartition],
        services: [createLeaderService(TEST_PARTITION_ID)],
      }),
      authoritativeControlPlaneView,
    });

    const hitStatus = await hitApi.waitForServiceLeaders();
    t.equal(hitStatus.ready, true, 'cached leader metadata should stay ready');
    t.equal(calls.length, 0,
      'the cache-hit path should not consult authoritative storage');

    const missApi = new BootstrapAPI({
      seedNodeId: TEST_LEADER_NODE_ID,
      systemTableCache: createSystemTableCache({
        partitions: [createPartitionRow(TEST_PARTITION_ID, TABLES.NODES)],
      }),
      authoritativeControlPlaneView,
    });

    const probeStatus = missApi.getLeaderReadinessStatusForProbe();
    t.equal(probeStatus.ready, false,
      'the high-frequency probe should remain cache-only');
    t.equal(calls.length, 0,
      'the high-frequency probe should never trigger authoritative reads');
  });
