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
        async updateSystemTableRow(tableName, whereClause, updateData) {
          updates.push({tableName, whereClause, updateData});
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
  });
