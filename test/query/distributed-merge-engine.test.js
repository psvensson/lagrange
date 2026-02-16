import {test} from '../../src/test-helpers/tap.js';
import {DistributedMergeEngine} from '../../src/query/distributed-merge-engine.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createExecutor() {
  return new QueryExecutor({
    messageRouter: {
      async deliver() {
        return {acknowledged: true, success: true, rows: []};
      },
    },
    systemCache: {
      filter() {
        return [];
      },
    },
  });
}

test('DistributedMergeEngine - applies global ORDER/LIMIT semantics', async (t) => {
  const mergeEngine = new DistributedMergeEngine();
  const executor = createExecutor();
  const ast = new SQLParser(
    'SELECT * FROM users ORDER BY score DESC LIMIT 2',
  ).parse();

  const result = mergeEngine.mergePartitionResults(
    [
      {success: true, rows: [{id: 1, score: 10}, {id: 2, score: 40}]},
      {success: true, rows: [{id: 3, score: 30}, {id: 4, score: 20}]},
    ],
    ast,
    executor,
  );

  t.equal(result.rows.length, 2);
  t.equal(result.rows[0].score, 40);
  t.equal(result.rows[1].score, 30);
});

test('DistributedMergeEngine - applies global DISTINCT semantics', async (t) => {
  const mergeEngine = new DistributedMergeEngine();
  const executor = createExecutor();
  const ast = new SQLParser(
    'SELECT DISTINCT status FROM users',
  ).parse();

  const result = mergeEngine.mergePartitionResults(
    [
      {success: true, rows: [{status: 'active'}, {status: 'inactive'}]},
      {success: true, rows: [{status: 'active'}, {status: 'pending'}]},
    ],
    ast,
    executor,
  );

  t.equal(result.rows.length, 3);
});
