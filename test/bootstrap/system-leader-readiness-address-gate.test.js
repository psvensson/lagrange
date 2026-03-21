/**
 * Failing tests for strict readiness gates with missing leader addresses.
 *
 * Requirements: 6.1, 6.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const TEST_CONFIG = Object.freeze({
  leadershipWaitTimeoutMs: 5,
  leadershipWaitInitialDelayMs: 1,
  leadershipWaitMaxDelayMs: 1,
  leadershipWaitBackoffMultiplier: 1,
});

const TEST_NODE_ID = 'test-node';
const TEST_NODE_ADDRESS = 'ws://127.0.0.1:9090';
const TEST_PARTITION_ID = 'partitions-p1';
const TEST_GROUP_ID = 'mg-1';
const TEST_LEADER_NODE_ID = 'seed-node';
const NODES_PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.NODES];
const NODE_ENDPOINTS_PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.NODE_ENDPOINTS];
const SERVICES_PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SERVICES];

const createSeedBootstrapCache = ({
  missingRequiredPartitionAddress = false,
  includeMessageGroupLeader = true,
} = {}) => {
  const tables = {
    [TABLES.PARTITIONS]: [
      {
        [COLUMN.PARTITION_ID]: NODES_PARTITION_ID,
        [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
      },
      {
        [COLUMN.PARTITION_ID]: NODE_ENDPOINTS_PARTITION_ID,
        [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
      },
      {
        [COLUMN.PARTITION_ID]: SERVICES_PARTITION_ID,
        [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
      },
    ],
    [TABLES.MESSAGE_GROUPS]: [{
      [COLUMN.GROUP_ID]: TEST_GROUP_ID,
      [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
    }],
    [TABLES.SERVICES]: [
      {
        [COLUMN.SERVICE_ID]: 'svc-nodes-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: NODES_PARTITION_ID,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
        [COLUMN.ADDRESS]: missingRequiredPartitionAddress ?
          null :
          `${TEST_LEADER_NODE_ID}/partition/${NODES_PARTITION_ID}`,
      },
      {
        [COLUMN.SERVICE_ID]: 'svc-node-endpoints-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: NODE_ENDPOINTS_PARTITION_ID,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
        [COLUMN.ADDRESS]:
          `${TEST_LEADER_NODE_ID}/partition/${NODE_ENDPOINTS_PARTITION_ID}`,
      },
      {
        [COLUMN.SERVICE_ID]: 'svc-services-leader',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: SERVICES_PARTITION_ID,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
        [COLUMN.ADDRESS]: null,
      },
    ],
  };

  if (includeMessageGroupLeader) {
    tables[TABLES.SERVICES].push({
      [COLUMN.SERVICE_ID]: 'svc-message-group-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.GROUP_ID]: TEST_GROUP_ID,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
      [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/message-group/${TEST_GROUP_ID}`,
    });
  } else {
    tables[TABLES.SERVICES].push({
      [COLUMN.SERVICE_ID]: 'svc-message-group-stopped',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.GROUP_ID]: TEST_GROUP_ID,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
      [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/message-group/${TEST_GROUP_ID}`,
    });
  }

  return {
    getAll: (tableName) => tables[tableName] || [],
    filter: (tableName, predicate) => {
      const records = tables[tableName] || [];
      return records.filter(predicate);
    },
  };
};

test('BootstrapService readiness waiter blocks when required system-table leader addresses are missing', async (t) => {
  const bootstrapService = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    config: TEST_CONFIG,
  });
  bootstrapService.systemTableCache = createSeedBootstrapCache({
    missingRequiredPartitionAddress: true,
    includeMessageGroupLeader: false,
  });

  let error = null;
  try {
    await bootstrapService.seedCacheHydrationPhase
      .waitForSystemServiceLeadersInCache();
  } catch (caughtError) {
    error = caughtError;
  }

  t.ok(error, 'waiter should timeout instead of passing when addresses are missing');
  t.same(
    error?.missingLeaders?.missingPartitionLeaderAddresses || [],
    [NODES_PARTITION_ID],
    'timeout diagnostics should include the missing required partition leader address',
  );
  t.same(
    error?.missingLeaders?.missingMessageGroupLeaderAddresses || [],
    [],
    'waiter should ignore message-group activation gaps before seed publication completes',
  );
});

test('BootstrapService readiness waiter ignores missing message-group leaders before activation', async (t) => {
  const bootstrapService = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    config: TEST_CONFIG,
  });
  bootstrapService.systemTableCache = createSeedBootstrapCache({
    missingRequiredPartitionAddress: false,
    includeMessageGroupLeader: false,
  });

  await bootstrapService.seedCacheHydrationPhase
    .waitForSystemServiceLeadersInCache();
  t.pass('seed bootstrap waiter should only block on required system-table write leaders');
});

test('NodeJoiningService join waiter allows missing leader_node_id metadata', async (t) => {
  const cache = {
    getAll: (tableName) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
          // Intentionally missing leader_node_id: it is asynchronously populated.
        }];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{
          [COLUMN.GROUP_ID]: TEST_GROUP_ID,
          // Intentionally missing leader_node_id: it is asynchronously populated.
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            [COLUMN.SERVICE_ID]: 'svc-partition-leader',
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
            [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
            [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/partition/${TEST_PARTITION_ID}`,
          },
          {
            [COLUMN.SERVICE_ID]: 'svc-message-group-leader',
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
            [COLUMN.GROUP_ID]: TEST_GROUP_ID,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
            [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/message-group/${TEST_GROUP_ID}`,
          },
        ];
      }
      return [];
    },
    filter: (tableName, predicate) => {
      const records = cache.getAll(tableName);
      return records.filter(predicate);
    },
  };

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
    config: TEST_CONFIG,
  });

  await service.waitForLeadershipPhase.waitForSystemServiceLeaders(cache);
  t.pass('join waiter should not require leader_node_id when leader services are routable');
});

test('NodeJoiningService join waiter ignores missing message-group leader rows', async (t) => {
  const cache = {
    getAll: (tableName) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
          [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
        }];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{
          [COLUMN.GROUP_ID]: TEST_GROUP_ID,
          [COLUMN.LEADER_NODE_ID]: TEST_LEADER_NODE_ID,
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            [COLUMN.SERVICE_ID]: 'svc-partition-leader',
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
            [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
            [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/partition/${TEST_PARTITION_ID}`,
          },
          // Deliberately no message-group LEADER row in services table.
          // This mirrors MOVE_REPLICA handoff windows where local leadership is
          // established, but service-role rows are not yet converged by CDC.
          {
            [COLUMN.SERVICE_ID]: 'svc-message-group-follower',
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
            [COLUMN.GROUP_ID]: TEST_GROUP_ID,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.NODE_ID]: TEST_LEADER_NODE_ID,
            [COLUMN.ADDRESS]: `${TEST_LEADER_NODE_ID}/message-group/${TEST_GROUP_ID}`,
          },
        ];
      }
      return [];
    },
    filter: (tableName, predicate) => {
      const records = cache.getAll(tableName);
      return records.filter(predicate);
    },
  };

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
    config: TEST_CONFIG,
  });

  await service.waitForLeadershipPhase.waitForSystemServiceLeaders(cache);
  t.pass('join waiter should not block on missing message-group leader cache rows');
});
