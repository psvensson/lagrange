import {test} from '../../src/test-helpers/tap.js';
import {
  BootstrapJoinAdmissionOwner,
} from '../../src/bootstrap/owners/bootstrap-join-admission-owner.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';

function createActivationHarness({raftRole = 'leader'} = {}) {
  const lifecycleCalls = [];
  const updates = [];
  const systemTableWriter = {
    async updateSystemTableRow(tableName, whereClause, updateData, options) {
      updates.push({tableName, whereClause, updateData, options});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const replicaStateMachine = {
    async activateRegisteredReplica(options) {
      lifecycleCalls.push(options);
      return {
        service_id: options.replicaId,
        service_type: 'partition',
        partition_id: options.partitionId,
        node_id: options.nodeId,
        raft_role: raftRole,
        status: 'active',
        updated_at: options.timestamp,
      };
    },
  };
  return {lifecycleCalls, replicaStateMachine, systemTableWriter, updates};
}

test('PartitionServiceRowOwner - activateReplica delegates lifecycle to ReplicaStateMachine',
  async (t) => {
    const harness = createActivationHarness();
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: harness.systemTableWriter,
      replicaStateMachine: harness.replicaStateMachine,
    });

    const row = await owner.activateReplica({
      partitionId: 'p1',
      replicaId: 'p1-r1',
      nodeId: 'node-a',
      service: {
        isLeaderReplica: () => true,
      },
    });

    t.equal(row.status, 'active', 'activation should project active status');
    t.equal(harness.lifecycleCalls.length, 1,
      'activation should use the lifecycle owner exactly once');
    t.same(
      {
        partitionId: harness.lifecycleCalls[0].partitionId,
        replicaId: harness.lifecycleCalls[0].replicaId,
        nodeId: harness.lifecycleCalls[0].nodeId,
        timestamp: harness.lifecycleCalls[0].timestamp,
      },
      {partitionId: 'p1', replicaId: 'p1-r1', nodeId: 'node-a', timestamp: 1234},
    );
    t.equal(
      harness.lifecycleCalls[0].writeOptions?.deliveryPriority,
      'background',
      'activation update should use background delivery',
    );
    t.equal(
      harness.lifecycleCalls[0].writeOptions?.coalescingKey,
      'services:p1-r1',
      'activation update should coalesce by service row',
    );
    t.equal(harness.updates.length, 1,
      'the row owner should only publish its raft-owned leader field');
    t.equal(harness.updates[0].tableName, 'partitions');
    t.same(harness.updates[0].whereClause, {
      partition_id: 'p1',
    });
    t.same(harness.updates[0].updateData, {
      leader_node_id: 'node-a',
      updated_at: 1234,
    });
    t.equal(
      harness.updates[0].options?.coalescingKey,
      'partitions:leader:p1',
      'leader publication should coalesce by partition leader row',
    );
  });

test('PartitionServiceRowOwner - critical system partitions use critical service-row writes',
  async (t) => {
    const harness = createActivationHarness();
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: harness.systemTableWriter,
      replicaStateMachine: harness.replicaStateMachine,
    });

    await owner.activateReplica({
      partitionId: 'services-p1',
      replicaId: 'services-p1-r2',
      nodeId: 'node-b',
      service: {
        isLeaderReplica: () => true,
      },
    });

    t.equal(harness.lifecycleCalls.length, 1);
    t.equal(harness.updates.length, 1);
    t.equal(
      harness.lifecycleCalls[0].writeOptions?.deliveryPriority,
      'critical',
      'critical system partition activation should use critical delivery',
    );
    t.equal(
      harness.lifecycleCalls[0].writeOptions?.workClass,
      'critical',
      'critical system partition activation should use critical work class',
    );
    t.equal(
      harness.lifecycleCalls[0].writeOptions?.coalescingKey,
      'services:services-p1-r2',
      'critical system partition activation should still coalesce by service row',
    );
    t.equal(
      harness.updates[0].tableName,
      'partitions',
      'critical activation should also publish canonical partition leader',
    );
    t.equal(
      harness.updates[0].options?.deliveryPriority,
      'critical',
      'critical partition leader publication should use critical delivery',
    );
    t.equal(
      harness.updates[0].options?.coalescingKey,
      'partitions:leader:services-p1',
      'critical partition leader publication should coalesce by partition',
    );
  });

test('PartitionServiceRowOwner - follower activation does not rewrite canonical partition leader',
  async (t) => {
    const harness = createActivationHarness({raftRole: 'follower'});
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: harness.systemTableWriter,
      replicaStateMachine: harness.replicaStateMachine,
    });

    await owner.activateReplica({
      partitionId: 'p1',
      replicaId: 'p1-r2',
      nodeId: 'node-b',
      service: {
        isLeaderReplica: () => false,
        getRole: () => 'follower',
      },
    });

    t.equal(harness.lifecycleCalls.length, 1);
    t.equal(harness.updates.length, 0,
      'follower activation should not publish canonical leader metadata');
  });

test('PartitionServiceRowOwner - registerReplica uses insert-only admission',
  async (t) => {
    const inserts = [];
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: {
        async insertSystemTableRow(tableName, row, options) {
          inserts.push({tableName, row, options});
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
    });

    await owner.registerReplica({
      partitionId: 'p1',
      replicaId: 'p1-r2',
      nodeId: 'node-b',
    });

    t.equal(inserts.length, 1, 'registration should issue one insert');
    t.equal(inserts[0].tableName, 'services');
    t.equal(inserts[0].row.service_id, 'p1-r2');
    t.equal(inserts[0].row.service_type, 'partition');
    t.equal(
      inserts[0].options?.coalescingKey,
      'services:p1-r2:create:1234',
      'registration should carry generation-specific diagnostics',
    );
    t.equal(inserts[0].options?.allowCoalescing, false,
      'create admissions must not coalesce across lifetimes');
  });

test('PartitionServiceRowOwner - same-ID recreation cannot reuse a durable ' +
  'registration incarnation', async (t) => {
  const rows = [];
  const owner = new PartitionServiceRowOwner({
    now: () => 100,
    systemTableWriter: {
      async insertSystemTableRow(_tableName, row) {
        rows.push(row);
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
  });

  const first = await owner.registerReplica({
    partitionId: 'p1',
    replicaId: 'p1-r-incarnation',
    nodeId: 'node-a',
  });
  const recreated = await owner.registerReplica({
    partitionId: 'p1',
    replicaId: 'p1-r-incarnation',
    nodeId: 'node-a',
  });

  t.equal(rows.length, 2,
    'the fixture should model deletion between two applied acquisitions');
  t.equal(recreated.created_at > first.created_at, true,
    'one process cannot mint the same durable incarnation twice');
  t.equal(recreated.updated_at, recreated.created_at,
    'the recreated STOPPED lifecycle starts at its unique incarnation');
});

test('PartitionServiceRowOwner + BootstrapJoinAdmissionOwner preserve canonical ' +
  'partition leader authority across all 45 seed partitions, election transfer, ' +
  'stale services.raft_role, non-seed join, and single-partition refusal', async (t) => {
  const partitions = new Map();
  const services = new Map();
  const systemTableWriter = {
    async insertSystemTableRow(tableName, row) {
      if (tableName === 'services') {
        services.set(row.service_id, {...row});
      }
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow(tableName, whereClause, updateData) {
      if (tableName === 'partitions') {
        const existing = partitions.get(whereClause.partition_id) || {
          partition_id: whereClause.partition_id,
        };
        partitions.set(whereClause.partition_id, {
          ...existing,
          ...updateData,
        });
      }
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const replicaStateMachine = {
    async activateRegisteredReplica(options) {
      const existing = services.get(options.replicaId);
      const activated = {
        ...existing,
        status: 'active',
        updated_at: options.timestamp,
      };
      services.set(options.replicaId, activated);
      return activated;
    },
  };
  const owner = new PartitionServiceRowOwner({
    now: () => 2000,
    systemTableWriter,
    replicaStateMachine,
  });
  const systemTableCache = {
    filter(tableName, predicate) {
      const rows = tableName === 'partitions' ?
        [...partitions.values()] :
        tableName === 'services' ?
          [...services.values()] :
          [];
      return rows.filter(predicate);
    },
  };
  const joinAdmissionOwner = new BootstrapJoinAdmissionOwner({
    delegates: {
      getSystemTableCache: () => systemTableCache,
    },
  });

  // 1. Fresh seed: all 46 system partitions register and activate with
  // services.raft_role collapsed to follower while partitions.leader_node_id
  // is published from live Raft leadership.
  t.equal(SYSTEM_TABLE_SCHEMAS.length, 46,
    'fresh seed schema corpus should cover all 46 system tables');
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const tableName = schema.tableName;
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    const replicaId = `${partitionId}-r1`;
    partitions.set(partitionId, {
      partition_id: partitionId,
      table_id: tableName,
      table_name: tableName,
      leader_node_id: null,
    });
    const registration = await owner.registerReplica({
      partitionId,
      replicaId,
      nodeId: 'seed-node',
      service: {isLeaderReplica: () => true, getRole: () => 'leader'},
    });
    t.equal(registration.raft_role, 'follower',
      `${partitionId} registration collapses leader to follower in services.raft_role`);
    await owner.activateReplica({
      partitionId,
      replicaId,
      nodeId: 'seed-node',
      registrationEvidence: registration,
      service: {isLeaderReplica: () => true, getRole: () => 'leader'},
    });
    t.equal(partitions.get(partitionId).leader_node_id, 'seed-node',
      `${partitionId} publishes canonical leader_node_id from live Raft authority`);
    const resolved = joinAdmissionOwner.getLeaderPartitionForTable(tableName);
    t.same(resolved, {
      partitionId,
      tableName,
      leaderNodeId: 'seed-node',
      replicaId,
      address: services.get(replicaId).address,
    }, `${tableName} resolves leader from canonical partitions.leader_node_id`);
  }

  // 2. Leader election and subsequent leader transfer to node-2, plus
  // 3. Restart with stale services.raft_role ('leader' left on seed-node), and
  // 4. Joining through a non-seed node (node-2 is canonical leader).
  const nodesPartitionId = INITIAL_PARTITION_IDS.nodes;
  const node2Registration = await owner.registerReplica({
    partitionId: nodesPartitionId,
    replicaId: `${nodesPartitionId}-r2`,
    nodeId: 'node-2',
    service: {isLeaderReplica: () => false, getRole: () => 'follower'},
  });
  await owner.activateReplica({
    partitionId: nodesPartitionId,
    replicaId: `${nodesPartitionId}-r2`,
    nodeId: 'node-2',
    registrationEvidence: node2Registration,
    service: {isLeaderReplica: () => true, getRole: () => 'leader'},
  });
  services.set(`${nodesPartitionId}-r1`, {
    ...services.get(`${nodesPartitionId}-r1`),
    raft_role: 'leader',
  });
  t.same(joinAdmissionOwner.getLeaderPartitionForTable('nodes'), {
    partitionId: nodesPartitionId,
    tableName: 'nodes',
    leaderNodeId: 'node-2',
    replicaId: `${nodesPartitionId}-r2`,
    address: services.get(`${nodesPartitionId}-r2`).address,
  }, 'canonical leader transfer to non-seed node wins over stale services.raft_role=leader');

  // 5. Refusal when leader_node_id is absent, stale, or points to an inactive replica,
  // and when a table has multiple partitions.
  services.set(`${nodesPartitionId}-r2`, {
    ...services.get(`${nodesPartitionId}-r2`),
    status: 'stopped',
  });
  t.equal(joinAdmissionOwner.getLeaderPartitionForTable('nodes'), null,
    'refuses when canonical leader_node_id points to an inactive replica');
  partitions.set(nodesPartitionId, {
    ...partitions.get(nodesPartitionId),
    leader_node_id: 'ghost-node',
  });
  t.equal(joinAdmissionOwner.getLeaderPartitionForTable('nodes'), null,
    'refuses when canonical leader_node_id is stale/unmatched');
  partitions.set(nodesPartitionId, {
    ...partitions.get(nodesPartitionId),
    leader_node_id: null,
  });
  services.set(`${nodesPartitionId}-r1`, {
    ...services.get(`${nodesPartitionId}-r1`),
    raft_role: 'follower',
    status: 'active',
  });
  t.equal(joinAdmissionOwner.getLeaderPartitionForTable('nodes'), null,
    'refuses when canonical leader_node_id is absent and no witness exists');
  partitions.set('user-p1', {
    partition_id: 'user-p1',
    table_id: 'multi_part_table',
    leader_node_id: 'seed-node',
  });
  partitions.set('user-p2', {
    partition_id: 'user-p2',
    table_id: 'multi_part_table',
    leader_node_id: 'seed-node',
  });
  t.equal(joinAdmissionOwner.getLeaderPartitionForTable('multi_part_table'), null,
    'explicitly refuses multi-partition tables');
});
