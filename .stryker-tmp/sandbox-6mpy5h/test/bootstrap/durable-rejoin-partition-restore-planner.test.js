// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  buildDurableRejoinPartitionRestorePlans,
} from '../../src/bootstrap/shared/durable-rejoin-partition-restore-planner.js';
import {
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

function createCache(rowsByTable) {
  return {
    getAll(tableName) {
      return rowsByTable.get(tableName) || [];
    },
    get(tableName, key) {
      const rows = rowsByTable.get(tableName) || [];
      return rows.find((row) =>
        row.partition_id === key ||
        row.table_id === key ||
        row.service_id === key
      ) || null;
    },
  };
}

test('buildDurableRejoinPartitionRestorePlans derives canonical local restore plans',
  async (t) => {
    const schemaDefinition = {
      tableName: 'nodes',
      columns: [{name: 'node_id', type: 'TEXT', primaryKey: true}],
    };
    const rowsByTable = new Map([
      [TABLES.TABLES, [{
        table_id: 'nodes',
        table_name: 'nodes',
        schema_definition: JSON.stringify(schemaDefinition),
      }]],
      [TABLES.PARTITIONS, [{
        partition_id: 'nodes-p1',
        table_id: 'nodes',
        table_name: 'nodes',
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'durable-node',
      }]],
      [TABLES.SERVICES, [{
        service_id: 'nodes-p1-r1',
        replica_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'durable-node',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'durable-node/partition/nodes-p1-r1',
      }, {
        service_id: 'nodes-p1-r2',
        replica_id: 'nodes-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'peer-node-2',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'peer-node-2/partition/nodes-p1-r2',
      }, {
        service_id: 'nodes-p1-r3',
        replica_id: 'nodes-p1-r3',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'peer-node-3',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'peer-node-3/partition/nodes-p1-r3',
      }, {
        service_id: 'nodes-p1-r4',
        replica_id: 'nodes-p1-r4',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'other-node',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'other-node/partition/nodes-p1-r4',
      }]],
    ]);

    const restorePlans = buildDurableRejoinPartitionRestorePlans({
      systemTableCache: createCache(rowsByTable),
      nodeId: 'durable-node',
      dataDir: '/tmp/durable-rejoin-data',
    });

    t.equal(restorePlans.length, 1,
      'only local durable partition replicas should be restored');
    t.same(
      restorePlans[0].replicaIds,
      ['nodes-p1-r1', 'nodes-p1-r2', 'nodes-p1-r3', 'nodes-p1-r4'],
      'restore plan should preserve the canonical durable peer set',
    );
    t.same(
      restorePlans[0].peerAddresses,
      [
        'durable-node/partition/nodes-p1-r1',
        'peer-node-2/partition/nodes-p1-r2',
        'peer-node-3/partition/nodes-p1-r3',
        'other-node/partition/nodes-p1-r4',
      ],
      'restore plan should preserve canonical peer addresses',
    );
    t.equal(
      restorePlans[0].leaderAddress,
      'durable-node/partition/nodes-p1-r1',
      'restore plan should preserve the canonical leader address',
    );
    t.match(
      restorePlans[0].dbPath,
      /\/tmp\/durable-rejoin-data\/partitions\/nodes-p1\/nodes-p1-r1\.db$/,
      'restore plan should point at the durable local partition database path',
    );
  });

test('buildDurableRejoinPartitionRestorePlans fails closed when partition metadata is missing',
  async (t) => {
    const rowsByTable = new Map([
      [TABLES.TABLES, []],
      [TABLES.PARTITIONS, []],
      [TABLES.SERVICES, [{
        service_id: 'nodes-p1-r1',
        replica_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'durable-node',
        partition_id: 'nodes-p1',
        status: 'active',
      }]],
    ]);

    t.throws(
      () => buildDurableRejoinPartitionRestorePlans({
        systemTableCache: createCache(rowsByTable),
        nodeId: 'durable-node',
        dataDir: '/tmp/durable-rejoin-data',
      }),
      /Missing partition metadata for durable rejoin replica nodes-p1-r1/,
      'restore planning should fail closed when canonical metadata is incomplete',
    );
  });

test('buildDurableRejoinPartitionRestorePlans skips over-target local restore ' +
  'without an active replica-operation owner', async (t) => {
  const schemaDefinition = {
    tableName: 'control_plane_publications',
    columns: [{name: 'publication_id', type: 'TEXT', primaryKey: true}],
  };
  const rowsByTable = new Map([
    [TABLES.TABLES, [{
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      schema_definition: JSON.stringify(schemaDefinition),
    }]],
    [TABLES.PARTITIONS, [{
      partition_id: 'control_plane_publications-p1',
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      partition_key_start: null,
      partition_key_end: null,
      leader_node_id: 'seed-node',
      replica_count: 3,
    }]],
    [TABLES.SERVICES, [{
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'seed-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'seed-node/partition/control_plane_publications-p1-r1',
    }, {
      service_id: 'control_plane_publications-p1-r2',
      replica_id: 'control_plane_publications-p1-r2',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-2',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-2/partition/control_plane_publications-p1-r2',
    }, {
      service_id: 'control_plane_publications-p1-r3',
      replica_id: 'control_plane_publications-p1-r3',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-3',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-3/partition/control_plane_publications-p1-r3',
    }, {
      service_id: 'control_plane_publications-p1-r4',
      replica_id: 'control_plane_publications-p1-r4',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'durable-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'durable-node/partition/control_plane_publications-p1-r4',
    }]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);

  const restorePlans = buildDurableRejoinPartitionRestorePlans({
    systemTableCache: createCache(rowsByTable),
    nodeId: 'durable-node',
    dataDir: '/tmp/durable-rejoin-data',
  });

  t.same(
    restorePlans,
    [],
    'durable rejoin should not restore ambiguous over-target replicas ' +
      'without a canonical operation owner',
  );
});

test('buildDurableRejoinPartitionRestorePlans keeps over-target local restore ' +
  'when a replica operation still owns the topology', async (t) => {
  const schemaDefinition = {
    tableName: 'control_plane_publications',
    columns: [{name: 'publication_id', type: 'TEXT', primaryKey: true}],
  };
  const rowsByTable = new Map([
    [TABLES.TABLES, [{
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      schema_definition: JSON.stringify(schemaDefinition),
    }]],
    [TABLES.PARTITIONS, [{
      partition_id: 'control_plane_publications-p1',
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      partition_key_start: null,
      partition_key_end: null,
      leader_node_id: 'seed-node',
      replica_count: 3,
    }]],
    [TABLES.SERVICES, [{
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'seed-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'seed-node/partition/control_plane_publications-p1-r1',
    }, {
      service_id: 'control_plane_publications-p1-r2',
      replica_id: 'control_plane_publications-p1-r2',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-2',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-2/partition/control_plane_publications-p1-r2',
    }, {
      service_id: 'control_plane_publications-p1-r3',
      replica_id: 'control_plane_publications-p1-r3',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-3',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-3/partition/control_plane_publications-p1-r3',
    }, {
      service_id: 'control_plane_publications-p1-r4',
      replica_id: 'control_plane_publications-p1-r4',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'durable-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'durable-node/partition/control_plane_publications-p1-r4',
    }]],
    [TABLES.REPLICA_OPERATIONS, [{
      operation_id: 'replace-control-plane-publications-r4',
      partition_id: 'control_plane_publications-p1',
      entity_type: 'partition',
      entity_id: 'control_plane_publications-p1',
      type: 'REPLACE',
      workflow_step: 'SYNCING',
      status: 'syncing',
      target_node_id: 'durable-node',
      replica_id: 'control_plane_publications-p1-r4',
      created_at: 1000,
      updated_at: 2000,
    }]],
  ]);

  const restorePlans = buildDurableRejoinPartitionRestorePlans({
    systemTableCache: createCache(rowsByTable),
    nodeId: 'durable-node',
    dataDir: '/tmp/durable-rejoin-data',
  });

  t.equal(
    restorePlans.length,
    1,
    'durable rejoin should preserve legitimate over-target topology while ' +
      'the canonical operation owner is still active',
  );
  t.same(
    restorePlans[0].replicaIds,
    [
      'control_plane_publications-p1-r1',
      'control_plane_publications-p1-r2',
      'control_plane_publications-p1-r3',
      'control_plane_publications-p1-r4',
    ],
    'restore plan should keep the active peer set when the topology is still ' +
      'owned by replica_operations',
  );
});
