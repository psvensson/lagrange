import {test} from '../../src/test-helpers/tap.js';
import {
  DistributedQueryPlanner,
} from '../../src/query/distributed/distributed-query-planner.js';
import {
  DISTRIBUTED_QUERY_ERROR_MSG,
} from '../../src/query/distributed/distributed-query-plan-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';

const PARTITIONS = [
  {
    partition_id: 'users-p1',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: null,
  },
];

function buildPlanner(getTableInfo) {
  return new DistributedQueryPlanner({
    getTablePartitions: (tableName) =>
      PARTITIONS.filter((partition) => partition.table_name === tableName),
    getTableInfo,
  });
}

function parseUpdate(sql) {
  return new SQLParser(sql).parse();
}

test('planUpdate rejects an UPDATE assigning the partition key column: ' +
  'no extraction order can re-home the row atomically', async (t) => {
  const planner = buildPlanner(() => ({
    table_name: 'users',
    partition_key: 'id',
  }));
  const ast = parseUpdate('UPDATE users SET id = ?, name = ? WHERE id = ?');

  t.throws(
    () => planner.planUpdate(ast, ['new-id', 'Ada', 'old-id']),
    {
      message: DISTRIBUTED_QUERY_ERROR_MSG
        .PARTITION_KEY_UPDATE_REJECTED_PREFIX +
        '\'id\'' +
        DISTRIBUTED_QUERY_ERROR_MSG.PARTITION_KEY_UPDATE_REJECTED_SUFFIX,
    },
    'a key-changing UPDATE must fail closed at plan time',
  );
});

test('planUpdate partition-key rejection is case-insensitive across ' +
  'snake/camel table descriptors', async (t) => {
  const planner = buildPlanner(() => ({
    tableName: 'users',
    partitionKey: 'ID',
  }));
  const ast = parseUpdate('UPDATE users SET id = ? WHERE id = ?');

  t.throws(
    () => planner.planUpdate(ast, ['b', 'a']),
    /must not modify partition key column/,
  );
});

test('planUpdate still plans UPDATEs that leave the partition key ' +
  'untouched', async (t) => {
  const planner = buildPlanner(() => ({
    table_name: 'users',
    partition_key: 'id',
  }));
  const ast = parseUpdate('UPDATE users SET name = ? WHERE id = ?');

  const plan = planner.planUpdate(ast, ['Ada', 'a']);
  t.equal(plan.statementType, 'UPDATE');
  t.ok(plan.tablePlans.has('users'));
});

test('planUpdate does not reject when no partition key metadata is ' +
  'available', async (t) => {
  const planner = buildPlanner(() => null);
  const ast = parseUpdate('UPDATE users SET id = ? WHERE id = ?');

  const plan = planner.planUpdate(ast, ['b', 'a']);
  t.equal(plan.statementType, 'UPDATE');
});
