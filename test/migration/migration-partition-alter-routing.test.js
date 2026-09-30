import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_ROLE,
} from '../../src/partition/partition-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const PARTITION_ID = 'test-partition';

// The last entry the partition's state machine applied, as the rs-raft
// durable store holds it, read on an INDEPENDENT read-only connection through
// the store's DDL-free committed-entry reader: the operation the routed ALTER
// committed as is the log's, never the partition's in-memory view.
function readLastAppliedCommandIndependently(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const applied =
      RaftRsDurableStore.readCommittedEntriesIn(independent, PARTITION_ID);
    return applied.at(-1)?.command;
  } finally {
    independent.close();
  }
}

test('migration ALTER is routed through dedicated partition Raft operation',
  async (t) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'migration-partition-alter-routing-'));
    t.teardown(() => fs.rmSync(directory, {recursive: true, force: true}));
    const dbPath = path.join(directory, 'partition.sqlite');
    const partition = new PartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: 'users-table',
      tableName: 'users',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'node-1',
      dbPath,
    }));

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

      const latestAppliedCommand = readLastAppliedCommandIndependently(dbPath);
      t.equal(latestAppliedCommand?.type,
        PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE);

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
