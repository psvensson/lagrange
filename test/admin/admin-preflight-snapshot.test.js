import {test} from '../../src/test-helpers/tap.js';
import {AdminPreflightSnapshot} from '../../src/admin/admin-preflight-snapshot.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';

test(
  'AdminPreflightSnapshot accepts canonical leader backed by active replica ' +
    'without address',
  async (t) => {
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
  },
);

test(
  'AdminPreflightSnapshot still reports missing leader when canonical ' +
    'leader has no active replica',
  async (t) => {
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
  },
);

test('AdminPreflightSnapshot summarizes selected and excluded discovery nodes', async (t) => {
  const SELECTED_NODE_ID = 'node-selected';
  const EXCLUDED_NODE_ID = 'node-excluded';
  const EXCLUDED_REASON_CODES = ['leadership_unstable', 'replay_backlog'];
  const discoveryCalls = [];
  const snapshot = new AdminPreflightSnapshot({
    nodeId: 'node-1',
    buildLocalServiceDiscoverySnapshot(options) {
      discoveryCalls.push(options);
      return {
        services: [{
          replicas: [{
            nodeId: SELECTED_NODE_ID,
            readiness: {
              reasons: [],
            },
          }, {
            nodeId: EXCLUDED_NODE_ID,
            readiness: {
              reasons: [{
                code: EXCLUDED_REASON_CODES[1],
              }, {
                code: EXCLUDED_REASON_CODES[0],
              }, {
                code: EXCLUDED_REASON_CODES[0],
              }],
            },
          }, {
            nodeId: null,
            readiness: {
              reasons: [{
                code: 'ignored_missing_node',
              }],
            },
          }],
        }],
      };
    },
  });

  t.same(
    snapshot.buildPreflightDiscoverySummary(),
    {
      selectedNodeIds: [SELECTED_NODE_ID],
      excludedByNodeId: {
        [EXCLUDED_NODE_ID]: EXCLUDED_REASON_CODES,
      },
    },
  );
  t.same(
    discoveryCalls,
    [{
      serviceIdAllowlist: [META_SERVICE_ID.POSTGRES_WIRE],
    }],
    'preflight discovery should scope the snapshot to postgres wire',
  );
});
