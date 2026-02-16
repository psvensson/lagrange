import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {DistributedQueryPlanner} from '../../src/query/distributed-query-planner.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createSystemCache(partitions, tables) {
  return {
    partitions,
    tables,
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((row) => row.table_name === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'tables') {
        return this.tables.filter(predicate);
      }
      return [];
    },
  };
}

test('DistributedQueryPlanner property - alias plans cover all table partitions', async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({min: 1, max: 4}),
      fc.integer({min: 1, max: 4}),
      (usersPartitionCount, ordersPartitionCount) => {
        const usersPartitions = Array.from(
          {length: usersPartitionCount},
          (_unused, index) => ({
            partition_id: `users-p${index + 1}`,
            table_name: 'users',
            partition_key_start: null,
            partition_key_end: null,
          }),
        );
        const ordersPartitions = Array.from(
          {length: ordersPartitionCount},
          (_unused, index) => ({
            partition_id: `orders-p${index + 1}`,
            table_name: 'orders',
            partition_key_start: null,
            partition_key_end: null,
          }),
        );
        const partitions = [...usersPartitions, ...ordersPartitions];
        const tables = [
          {table_name: 'users', primaryKey: 'id'},
          {table_name: 'orders', primaryKey: 'user_id'},
        ];

        const resolver = new PartitionResolver({
          systemCache: createSystemCache(partitions, tables),
        });
        const planner = new DistributedQueryPlanner({
          partitionResolver: resolver,
          getTablePartitions: (tableName) =>
            partitions.filter((partition) => partition.table_name === tableName),
        });

        const ast = new SQLParser(
          'SELECT * FROM users AS u JOIN orders AS o ON u.id = o.user_id',
        ).parse();
        const plan = planner.planSelect(ast, []);

        return (
          plan.tablePlans.get('u').partitions.length === usersPartitionCount &&
          plan.tablePlans.get('o').partitions.length === ordersPartitionCount
        );
      },
    ),
    {numRuns: 10},
  );
  t.pass('planner table access plans include complete partition sets');
});

test('DistributedQueryPlanner property - deterministic planId for same inputs', async (t) => {
  await fc.assert(
    fc.property(
      fc.array(fc.string({minLength: 1, maxLength: 5}), {minLength: 1, maxLength: 3}),
      (partitionSuffixes) => {
        const partitions = partitionSuffixes.map((suffix) => ({
          partition_id: `users-${suffix}`,
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
        }));
        const tables = [{table_name: 'users', primaryKey: 'id'}];
        const resolver = new PartitionResolver({
          systemCache: createSystemCache(partitions, tables),
        });
        const planner = new DistributedQueryPlanner({
          partitionResolver: resolver,
          getTablePartitions: () => partitions,
        });

        const ast = new SQLParser('SELECT * FROM users WHERE id = ?').parse();
        const planA = planner.planSelect(ast, ['alice']);
        const planB = planner.planSelect(ast, ['alice']);
        return planA.planId === planB.planId;
      },
    ),
    {numRuns: 10},
  );
  t.pass('planner plan IDs are deterministic');
});
