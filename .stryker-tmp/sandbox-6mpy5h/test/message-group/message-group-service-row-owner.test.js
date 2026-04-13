// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';

test('MessageGroupServiceRowOwner - activateReplica updates status without rewriting created_at',
  async (t) => {
    const updates = [];
    const owner = new MessageGroupServiceRowOwner({
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
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-a',
      service: {
        isLeaderReplica: () => true,
      },
    });

    t.equal(row.status, 'active', 'activation should project active status');
    t.equal(updates.length, 1, 'activation should use one update write');
    t.equal(updates[0].tableName, 'services');
    t.same(updates[0].whereClause, {
      service_id: 'mg-1-r1',
      service_type: 'message_group',
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
      'services:mg-1-r1',
      'activation update should coalesce by service row',
    );
  });
