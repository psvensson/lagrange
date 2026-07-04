/**
 * CDC parameterized-INSERT extraction must understand every INSERT variant
 * the write path emits — including OR IGNORE (the idempotent op-row insert
 * from replica-operation-insert-retry-idempotency).
 *
 * Production witness (affinity-demo run 18): the extraction regex accepted
 * only INSERT [OR REPLACE] INTO, so OR-IGNORE statements fell through to the
 * literal-SQL fallback which parsed the raw '?' placeholders as VALUES —
 * emitting CDC events whose every column was the string '?' (3,712
 * "Failed to parse steps_history JSON" / operationId:"?" errors, garbage
 * rows in subscriber projections).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  extractParamInsertData,
} from '../../src/partition/partition-cdc-parameterized-sql.js';

const silentLogger = {info() {}, warn() {}, error() {}, debug() {}};

function extract(sql) {
  const fetched = [];
  const result = extractParamInsertData({
    sql,
    params: ['op-1', 'ADD', 'partition-1'],
    tableName: 'replica_operations',
    logger: silentLogger,
    fetchInsertRow: (_tableName, _keyColumn, _keyValue, data) => {
      fetched.push(data);
      return data;
    },
  });
  return {result, fetched};
}

test('parameterized INSERT OR IGNORE extraction binds params to columns', async (t) => {
  const {result} = extract(
    'INSERT OR IGNORE INTO replica_operations ' +
      '(operation_id, type, partition_id) VALUES (?, ?, ?)',
  );

  t.same(
    result,
    {operation_id: 'op-1', type: 'ADD', partition_id: 'partition-1'},
    'OR IGNORE inserts must extract real param values — never fall through ' +
      'to literal parsing that emits "?" placeholder strings as CDC data',
  );
});

test('plain and OR REPLACE inserts keep extracting', async (t) => {
  const plain = extract(
    'INSERT INTO replica_operations ' +
      '(operation_id, type, partition_id) VALUES (?, ?, ?)',
  );
  t.equal(plain.result.operation_id, 'op-1', 'plain INSERT still extracts');

  const orReplace = extract(
    'INSERT OR REPLACE INTO replica_operations ' +
      '(operation_id, type, partition_id) VALUES (?, ?, ?)',
  );
  t.equal(
    orReplace.result.operation_id,
    'op-1',
    'OR REPLACE INSERT still extracts',
  );
});
