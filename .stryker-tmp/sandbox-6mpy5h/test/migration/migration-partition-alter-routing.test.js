// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_ROLE,
} from '../../src/partition/partition-service-constants.js';

test('migration ALTER is routed through dedicated partition Raft operation',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'users-table',
      tableName: 'users',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
    });

    try {
      await partition.initialize();
      partition.role = PARTITION_SERVICE_ROLE.LEADER;
      partition.db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

      const alterResult = await partition.handleRemoteQuery({
        sql: 'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 5',
        params: [],
        migrationOperation: PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE,
        migrationId: 'migration-42',
      });
      t.equal(alterResult.acknowledged, true);
      t.equal(alterResult.success, true);

      const latestLogEntry = partition.storage.log[partition.storage.log.length - 1];
      t.equal(latestLogEntry.data.type, PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE);

      const insertResult = await partition.executeQuery(
        'INSERT INTO users (id, name) VALUES (?, ?)',
        [1, 'Alice'],
      );
      t.equal(insertResult.success, true);

      const rows = partition.db.prepare('SELECT age FROM users WHERE id = 1').all();
      t.equal(rows.length, 1);
      t.equal(rows[0].age, 5);
      t.equal(partition.migrationColumnDefaultsByTable.get('users').get('age'), '5');
    } finally {
      await partition.shutdown();
    }
  });
