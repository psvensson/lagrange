import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import Database from 'better-sqlite3';

import {PartitionService} from '../../src/partition/partition-service.js';

describe('partition service qualified table names', () => {
  test('creates the global access-policy identity as one SQLite identifier',
    () => {
      const partition = new PartitionService({
        partitionId: 'qualified-table-p1',
        replicaId: 'qualified-table-p1-r1',
        replicaIds: ['qualified-table-p1-r1'],
        schema: {
          columns: [
            {name: 'key', primaryKey: true, type: 'INTEGER'},
            {name: 'value', type: 'INTEGER'},
          ],
          tableName: 'global.request_binding_audit',
        },
        tableId: 'qualified-table',
        tableName: 'global.request_binding_audit',
      });
      partition.db = new Database(':memory:');

      try {
        partition.createTable();
        partition.db.prepare(
          'INSERT INTO "global.request_binding_audit" ' +
            '(key, value) VALUES (?, ?)',
        ).run(7, 42);
        assert.deepEqual(
          partition.db.prepare(
            'SELECT key, value FROM "global.request_binding_audit"',
          ).all(),
          [{key: 7, value: 42}],
        );
      } finally {
        partition.db.close();
      }
    },
  );
});
