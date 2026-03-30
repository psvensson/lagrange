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
    t.equal(updates.length, 1, 'activation should use one update write');
    t.equal(updates[0].tableName, 'services');
    t.same(updates[0].whereClause, {
      service_id: 'p1-r1',
      service_type: 'partition',
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
      updates[0].options?.allowPressureDefer,
      true,
      'activation update should allow pressure deferral',
    );
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

    t.equal(updates.length, 1, 'activation should use one update write');
    t.equal(
      updates[0].options?.allowPressureDefer,
      false,
      'critical system partition activation should not allow pressure deferral',
    );
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
  });
