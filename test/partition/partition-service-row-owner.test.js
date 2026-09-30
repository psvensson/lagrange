import {test} from '../../src/test-helpers/tap.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';

test('PartitionServiceRowOwner - activateReplica updates status without rewriting created_at',
  async (t) => {
    const updates = [];
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: {
        async upsertSystemTableRow() {
          throw new Error('should not fall back to upsert when update is available');
        },
        async updateSystemTableRow(tableName, whereClause, updateData, options) {
          updates.push({tableName, whereClause, updateData, options});
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
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
    t.equal(updates.length, 2, 'leader activation should update service row and canonical partition leader');
    t.equal(updates[0].tableName, 'services');
    t.same(updates[0].whereClause, {
      service_id: 'p1-r1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'node-a',
    });
    t.notOk(
      Object.prototype.hasOwnProperty.call(
        updates[0].updateData,
        'created_at',
      ),
      'activation update should not rewrite created_at',
    );
    t.equal(updates[0].updateData.status, 'active');
    t.equal(
      updates[0].options?.deliveryPriority,
      'background',
      'activation update should use background delivery',
    );
    t.equal(
      updates[0].options?.coalescingKey,
      'services:p1-r1',
      'activation update should coalesce by service row',
    );
    t.equal(updates[1].tableName, 'partitions');
    t.same(updates[1].whereClause, {
      partition_id: 'p1',
    });
    t.same(updates[1].updateData, {
      leader_node_id: 'node-a',
      updated_at: 1234,
    });
    t.equal(
      updates[1].options?.coalescingKey,
      'partitions:leader:p1',
      'leader publication should coalesce by partition leader row',
    );
  });

test('PartitionServiceRowOwner - critical system partitions use critical service-row writes',
  async (t) => {
    const updates = [];
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: {
        async upsertSystemTableRow() {
          throw new Error('should not fall back to upsert when update is available');
        },
        async updateSystemTableRow(tableName, whereClause, updateData, options) {
          updates.push({tableName, whereClause, updateData, options});
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
    });

    await owner.activateReplica({
      partitionId: 'services-p1',
      replicaId: 'services-p1-r2',
      nodeId: 'node-b',
      service: {
        isLeaderReplica: () => true,
      },
    });

    t.equal(updates.length, 2, 'critical leader activation should update service row and canonical partition leader');
    t.equal(
      updates[0].options?.deliveryPriority,
      'critical',
      'critical system partition activation should use critical delivery',
    );
    t.equal(
      updates[0].options?.workClass,
      'critical',
      'critical system partition activation should use critical work class',
    );
    t.equal(
      updates[0].options?.coalescingKey,
      'services:services-p1-r2',
      'critical system partition activation should still coalesce by service row',
    );
    t.equal(
      updates[1].tableName,
      'partitions',
      'critical activation should also publish canonical partition leader',
    );
    t.equal(
      updates[1].options?.deliveryPriority,
      'critical',
      'critical partition leader publication should use critical delivery',
    );
    t.equal(
      updates[1].options?.coalescingKey,
      'partitions:leader:services-p1',
      'critical partition leader publication should coalesce by partition',
    );
  });

test('PartitionServiceRowOwner - follower activation does not rewrite canonical partition leader',
  async (t) => {
    const updates = [];
    const owner = new PartitionServiceRowOwner({
      now: () => 1234,
      systemTableWriter: {
        async upsertSystemTableRow() {
          throw new Error('should not fall back to upsert when update is available');
        },
        async updateSystemTableRow(tableName, whereClause, updateData, options) {
          updates.push({tableName, whereClause, updateData, options});
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
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

    t.equal(updates.length, 1);
    t.equal(updates[0].tableName, 'services');
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
