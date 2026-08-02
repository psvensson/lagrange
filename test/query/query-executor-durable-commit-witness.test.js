import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {resolvePartitionExecutionBuilders} from
  '../../src/query/query-executor-partition-request-builders.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {createMockSystemCache} from './query-executor-test-support.js';

const DURABLE_COMMIT_WITNESS = Object.freeze({
  partitionId: 'widgets-p1',
  leaderNodeId: 'node-2',
  leaderReplicaId: 'widgets-p1-r2',
  term: 7,
  logIndex: 42,
  entryId: 'entry-write-operation-1',
  operationId: 'write-operation-1',
  idempotencyKey: 'write-operation-1',
});

test('default partition delivery preserves the durable commit witness',
  async (t) => {
    const builders = resolvePartitionExecutionBuilders({
      partitionId: DURABLE_COMMIT_WITNESS.partitionId,
      sql: 'INSERT INTO widgets (id) VALUES (?)',
      params: ['widget-1'],
    });

    const result = builders.buildSuccessResult({
      acknowledged: true,
      success: true,
      rows: [],
      changes: 1,
      durableCommitWitness: DURABLE_COMMIT_WITNESS,
      acceptingNodeId: 'node-2',
      acknowledgedAtMs: 1785630280000,
    });

    t.same(
      result.durableCommitWitness,
      DURABLE_COMMIT_WITNESS,
      'the query coordinator must receive the partition commit identity',
    );
    t.equal(result.acceptingNodeId, 'node-2');
    t.equal(result.acknowledgedAtMs, 1785630280000);
  });

test('INSERT rendering returns the durable commit witness to the coordinator',
  async (t) => {
    const executor = new QueryExecutor({
      systemCache: createMockSystemCache(['widgets-p1']),
      messageRouter: {
        async deliver() {
          return {
            acknowledged: true,
            success: true,
            rows: [],
            changes: 1,
            durableCommitWitness: DURABLE_COMMIT_WITNESS,
            acceptingNodeId: 'node-2',
            acknowledgedAtMs: 1785630280000,
          };
        },
      },
    });
    const ast = new SQLParser(
      'INSERT INTO widgets (id) VALUES (\'widget-1\')',
    ).parse();

    const result = await executor.executeInsert(ast, 'widgets-p1');

    t.same(result.durableCommitWitness, DURABLE_COMMIT_WITNESS);
    t.equal(result.acceptingNodeId, 'node-2');
    t.equal(result.acknowledgedAtMs, 1785630280000);
  });
