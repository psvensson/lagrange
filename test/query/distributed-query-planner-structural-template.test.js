// Characterization of the planner's two derivations of one SELECT plan: a
// statement parsed through the SQL parse cache carries a structural template
// key (cold template, then the retained one); the same SQL parsed directly
// carries none. Both must yield the same plan.
import {test} from '../../src/test-helpers/tap.js';
import {DistributedQueryPlanner} from '../../src/query/distributed/distributed-query-planner.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {SqlParseCache} from '../../src/query/sql-parse-cache.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const KEY_TYPE = 'INTEGER';
const PARTITIONS = Object.freeze([
  {partition_id: 'users-p1', table_name: 'users', partition_key_start: null, partition_key_end: 5},
  {partition_id: 'users-p2', table_name: 'users', partition_key_start: 5, partition_key_end: null},
  {partition_id: 'orders-p1', table_name: 'orders', partition_key_start: null, partition_key_end: 5},
  {partition_id: 'orders-p2', table_name: 'orders', partition_key_start: 5, partition_key_end: null},
].map((row) => ({...row, partition_key_type: KEY_TYPE})));
const TABLES = Object.freeze([
  {table_name: 'users', primaryKey: 'id'},
  {table_name: 'orders', primaryKey: 'user_id'},
]);

function createPlanner() {
  const systemCache = {
    get: (type, key) => (type === 'tables' ? TABLES.find((row) => row.table_name === key) || null : null),
    filter: (type, predicate) => {
      if (type === 'partitions') return PARTITIONS.filter(predicate);
      return type === 'tables' ? TABLES.filter(predicate) : [];
    },
    getAll: (type) => {
      if (type === 'partitions') return [...PARTITIONS];
      return type === 'tables' ? [...TABLES] : [];
    },
  };
  return new DistributedQueryPlanner({
    partitionResolver: new PartitionResolver({systemCache}),
    getTablePartitions: (tableName) => PARTITIONS.filter((row) => row.table_name === tableName),
  });
}

// The plan as plain data: Maps as entry lists; the diagnostics' wall-clock
// stamp is not part of the plan.
function planData(plan) {
  const data = JSON.parse(JSON.stringify(plan, (_key, value) =>
    (value instanceof Map ? [...value.entries()] : value)));
  delete data.diagnostics.generatedAt;
  return data;
}

const CASES = Object.freeze([
  {sql: 'SELECT * FROM users WHERE id = ?', params: [3]},
  {sql: 'SELECT name FROM users WHERE id > ? ORDER BY name LIMIT 2', params: [1]},
  {
    sql: 'SELECT u.id, o.total FROM users AS u JOIN orders AS o ON u.id = o.user_id WHERE u.id = ?',
    params: [7],
  },
  {sql: 'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)', params: []},
]);

for (const {sql, params} of CASES) {
  test(`a template-keyed and a plain parse of one SELECT plan identically: ${sql}`, (t) => {
    const cache = new SqlParseCache();
    cache.set(sql, null, new SQLParser(sql).parse());
    const planner = createPlanner();
    const plain = planner.planSelect(new SQLParser(sql).parse(), params);
    const cold = planner.planSelect(cache.get(sql, null), params);
    const warm = planner.planSelect(cache.get(sql, null), params);
    t.equal(planner.structuralTemplates.size, 1, 'the keyed statement retained one template');
    t.same(planData(cold), planData(plain), 'cold template plan equals the plain plan');
    t.same(planData(warm), planData(plain), 'retained template plan equals the plain plan');
    t.end();
  });
}
