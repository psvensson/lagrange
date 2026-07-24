import {test} from '../../src/test-helpers/tap.js';
import {DistributedQueryPlanner} from '../../src/query/distributed/distributed-query-planner.js';
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
    getAll(type) {
      if (type === 'partitions') {
        return this.partitions;
      }
      if (type === 'tables') {
        return this.tables;
      }
      return [];
    },
  };
}

function getTablePartitionsFactory(partitions) {
  return (tableName) =>
    partitions.filter((partition) => partition.table_name === tableName);
}

test('DistributedQueryPlanner - builds table plans for all aliases', async (t) => {
  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 5,
    },
    {
      partition_id: 'users-p2',
      table_name: 'users',
      partition_key_start: 5,
      partition_key_end: null,
    },
    {
      partition_id: 'orders-p1',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: 5,
    },
    {
      partition_id: 'orders-p2',
      table_name: 'orders',
      partition_key_start: 5,
      partition_key_end: null,
    },
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
    {table_name: 'orders', primaryKey: 'user_id'},
  ];
  const systemCache = createSystemCache(partitions, tables);
  const resolver = new PartitionResolver({systemCache});
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: getTablePartitionsFactory(partitions),
  });

  const ast = new SQLParser(
    'SELECT * FROM users AS u JOIN orders AS o ON u.id = o.user_id',
  ).parse();
  const plan = planner.planSelect(ast, []);

  t.ok(plan.planId);
  t.equal(plan.statementType, 'SELECT');
  t.ok(plan.tablePlans.has('u'));
  t.ok(plan.tablePlans.has('o'));
  t.equal(plan.tablePlans.get('u').partitions.length, 2);
  t.equal(plan.tablePlans.get('o').partitions.length, 2);
  t.equal(plan.joinPlan.length, 1);
});

test('DistributedQueryPlanner - creates deterministic plan IDs', async (t) => {
  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
  ];
  const resolver = new PartitionResolver({
    systemCache: createSystemCache(partitions, tables),
  });
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: getTablePartitionsFactory(partitions),
  });

  const ast = new SQLParser('SELECT * FROM users WHERE id = ?').parse();
  const planA = planner.planSelect(ast, ['alice']);
  const planB = planner.planSelect(ast, ['alice']);

  t.equal(planA.planId, planB.planId);
});

test('DistributedQueryPlanner - records predicate shapes per table', async (t) => {
  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 'm',
    },
    {
      partition_id: 'users-p2',
      table_name: 'users',
      partition_key_start: 'm',
      partition_key_end: null,
    },
    {
      partition_id: 'orders-p1',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
    {table_name: 'orders', primaryKey: 'user_id'},
  ];
  const resolver = new PartitionResolver({
    systemCache: createSystemCache(partitions, tables),
  });
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: getTablePartitionsFactory(partitions),
  });

  const ast = new SQLParser(
    'SELECT u.id, o.user_id FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'WHERE u.id = ?',
  ).parse();
  const plan = planner.planSelect(ast, ['alice']);

  t.equal(plan.tablePlans.get('u').keyPredicateShape, 'eq');
  t.equal(plan.tablePlans.get('o').keyPredicateShape, 'scatter');
});

test('DistributedQueryPlanner - emits fragment SQL with predicate pushdown', async (t) => {
  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    },
    {
      partition_id: 'orders-p1',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
    {table_name: 'orders', primaryKey: 'user_id'},
  ];
  const resolver = new PartitionResolver({
    systemCache: createSystemCache(partitions, tables),
  });
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: getTablePartitionsFactory(partitions),
  });

  const ast = new SQLParser(
    'SELECT u.name FROM users AS u ' +
    'JOIN orders AS o ON u.id = o.user_id ' +
    'WHERE u.id = ? AND o.status = \'open\'',
  ).parse();
  const plan = planner.planSelect(ast, ['alice']);

  const userFragment = plan.fragmentPlans.find((fragment) => fragment.tableAlias === 'u');
  const orderFragment = plan.fragmentPlans.find((fragment) => fragment.tableAlias === 'o');

  t.match(userFragment.sql, /SELECT .* FROM users AS u/);
  t.match(userFragment.sql, /u\.id = \?/);
  t.notMatch(userFragment.sql, /o\.status/);
  t.equal(userFragment.pushdown.predicatePushedDown, true);
  t.equal(userFragment.pushdown.projectionPushedDown, true);

  t.match(orderFragment.sql, /SELECT .* FROM orders AS o/);
  t.match(orderFragment.sql, /o\.status = 'open'/);
});

test('DistributedQueryPlanner - records pushdown diagnostics', async (t) => {
  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
  ];
  const resolver = new PartitionResolver({
    systemCache: createSystemCache(partitions, tables),
  });
  const planner = new DistributedQueryPlanner({
    partitionResolver: resolver,
    getTablePartitions: getTablePartitionsFactory(partitions),
  });

  const ast = new SQLParser(
    'SELECT id FROM users WHERE id = ?',
  ).parse();
  const plan = planner.planSelect(ast, ['alice'], {explain: true});

  t.ok(Array.isArray(plan.diagnostics.pushdownDecisions));
  t.equal(plan.diagnostics.pushdownDecisions.length, 1);
  t.equal(plan.diagnostics.pushdownDecisions[0].tableAlias, 'users');
  t.equal(plan.diagnostics.pushdownDecisions[0].predicatePushedDown, true);
  t.equal(plan.diagnostics.pushdownDecisions[0].projectionPushedDown, true);
});

test('DistributedQueryPlanner - quotes qualified logical table names in fragments',
  async (t) => {
    const tableName = 'global.request_binding_audit';
    const partitions = [{
      partition_id: 'request-binding-audit-p1',
      table_name: tableName,
      partition_key_start: null,
      partition_key_end: null,
    }];
    const tables = [{table_name: tableName, primaryKey: 'key'}];
    const resolver = new PartitionResolver({
      systemCache: createSystemCache(partitions, tables),
    });
    const planner = new DistributedQueryPlanner({
      partitionResolver: resolver,
      getTablePartitions: getTablePartitionsFactory(partitions),
    });

    const ast = new SQLParser(
      'SELECT key, value FROM "global.request_binding_audit"',
    ).parse();
    const plan = planner.planSelect(ast, []);

    t.equal(
      plan.fragmentPlans[0].sql,
      'SELECT key, value FROM "global.request_binding_audit"',
    );
  });

test('DistributedQueryPlanner - consumes updated partition map after split-style changes',
  async (t) => {
    const partitions = [
      {
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      },
    ];
    const tables = [{table_name: 'users', primaryKey: 'id'}];
    const resolver = new PartitionResolver({
      systemCache: createSystemCache(partitions, tables),
    });
    const planner = new DistributedQueryPlanner({
      partitionResolver: resolver,
      getTablePartitions: getTablePartitionsFactory(partitions),
    });
    const ast = new SQLParser('SELECT * FROM users').parse();

    const beforeSplitPlan = planner.planSelect(ast, []);
    t.same(beforeSplitPlan.tablePlans.get('users').partitions, ['users-p1']);

    partitions.splice(0, partitions.length, ...[
      {
        partition_id: 'users-p1a',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: 'm',
      },
      {
        partition_id: 'users-p1b',
        table_name: 'users',
        partition_key_start: 'm',
        partition_key_end: null,
      },
    ]);

    const afterSplitPlan = planner.planSelect(ast, []);
    t.same(afterSplitPlan.tablePlans.get('users').partitions, ['users-p1a', 'users-p1b']);
  });
