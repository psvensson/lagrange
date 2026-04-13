// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {AdminPreflightSnapshot} from '../../src/admin/admin-preflight-snapshot.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

test('AdminPreflightSnapshot accepts canonical leader backed by active replica without address', async (t) => {
  const snapshot = new AdminPreflightSnapshot({
    nodeId: 'node-1',
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            [COLUMN.PARTITION_ID]: 'nodes-p1',
            [COLUMN.LEADER_NODE_ID]: 'node-2',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.SERVICE_TYPE]: 'partition',
            [COLUMN.PARTITION_ID]: 'nodes-p1',
            [COLUMN.RAFT_ROLE]: 'leader',
            [COLUMN.STATUS]: 'active',
            [COLUMN.NODE_ID]: 'node-2',
            [COLUMN.ADDRESS]: null,
          }];
        }
        return [];
      },
    },
  });

  t.same(
    snapshot.buildPreflightControlPlanePartitionEntry(TABLES.NODES),
    {
      leaderKnown: true,
      leaderNodeId: 'node-2',
      isLeaderLocal: false,
      lastErrorCode: null,
    },
  );
});

test('AdminPreflightSnapshot still reports missing leader when canonical leader has no active replica', async (t) => {
  const snapshot = new AdminPreflightSnapshot({
    nodeId: 'node-1',
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            [COLUMN.PARTITION_ID]: 'nodes-p1',
            [COLUMN.LEADER_NODE_ID]: 'node-2',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.SERVICE_TYPE]: 'partition',
            [COLUMN.PARTITION_ID]: 'nodes-p1',
            [COLUMN.RAFT_ROLE]: 'follower',
            [COLUMN.STATUS]: 'active',
            [COLUMN.NODE_ID]: 'node-3',
            [COLUMN.ADDRESS]: 'ws://node-3:8082',
          }];
        }
        return [];
      },
    },
  });

  t.same(
    snapshot.buildPreflightControlPlanePartitionEntry(TABLES.NODES),
    {
      leaderKnown: false,
      leaderNodeId: null,
      isLeaderLocal: false,
      lastErrorCode: 'leader_service_missing',
    },
  );
});