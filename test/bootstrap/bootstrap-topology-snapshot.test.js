import {test} from '../../src/test-helpers/tap.js';
import {
  buildBootstrapTopologySnapshotEnvelope,
} from '../../src/bootstrap/bootstrap-topology-snapshot.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

function createMockSystemTableCache() {
  const rowsByTable = new Map([
    [TABLES.NODES, [
      {
        [COLUMN.NODE_ID]: 'seed-node',
        [COLUMN.STATUS]: 'active',
      },
      {
        [COLUMN.NODE_ID]: 'joining-node',
        [COLUMN.STATUS]: 'active',
      },
      {
        [COLUMN.NODE_ID]: 'warming-node',
        [COLUMN.STATUS]: 'joining',
      },
    ]],
    [TABLES.PARTITIONS, [
      {partition_id: 'nodes-p1', table_name: TABLES.NODES},
    ]],
    [TABLES.SERVICES, [
      {service_id: 'svc-1', node_id: 'seed-node'},
      {service_id: 'svc-2', node_id: 'joining-node'},
    ]],
    [TABLES.TABLES, [
      {table_id: TABLES.NODES, table_name: TABLES.NODES},
    ]],
    [TABLES.MESSAGE_GROUPS, [
      {group_id: 'mg-1'},
    ]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);

  return {
    getAll(tableName) {
      return rowsByTable.get(tableName) || [];
    },
  };
}

test('buildBootstrapTopologySnapshotEnvelope publishes topology snapshot metadata',
  async (t) => {
    const envelope = buildBootstrapTopologySnapshotEnvelope({
      systemTableCache: createMockSystemTableCache(),
      currentEpoch: {
        epoch: 7,
        assignments: {},
        proposedBy: 'seed-node',
        timestamp: '1740000000000:1:seed-node',
      },
    });

    t.ok(envelope.systemTableSnapshots,
      'envelope should include system table snapshots');
    t.ok(envelope.topologySnapshotMeta,
      'envelope should include topology snapshot metadata');
    t.equal(envelope.topologySnapshotMeta.topologyEpoch, 7,
      'metadata should include the published topology epoch');
    t.same(
      envelope.topologySnapshotMeta.activeNodeIds.sort(),
      ['joining-node', 'seed-node'],
      'metadata should retain active node IDs from the bootstrap snapshot',
    );
    t.same(
      envelope.topologySnapshotMeta.hydrationTables,
      CACHE_HYDRATION_TABLES,
      'metadata should advertise the sanctioned cache hydration tables',
    );
    t.equal(
      envelope.topologySnapshotMeta.tableRowCounts[TABLES.NODES],
      3,
      'metadata should include per-table row counts',
    );
    t.equal(
      envelope.topologySnapshotMeta.tableRowCounts[TABLES.SERVICES],
      2,
      'metadata should count services rows',
    );
  },
);
