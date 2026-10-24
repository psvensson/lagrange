/**
 * The read-back that replaced the harness partition repair: the benchmark
 * readiness wait never rewrites partitions.table_name; a partition row found
 * by table_id that does not carry its table name fails the scenario with a
 * named finding instead of being repaired.
 */
import {test} from '../../../../src/test-helpers/tap.js';
import {POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE} from
  '../../scenarios/postgres-baseline-comparison-benchmark-table-load.js';

const stringIncludes = Function.call.bind(String.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const {waitForSutBenchmarkTableReady} =
  POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE;
const TABLE_NAME = 'benchmark_events';
const NODES = Object.freeze([{id: 'seed-1'}]);

function createNodeClient({partitionsByName}) {
  const statements = [];
  return {
    statements,
    async queryControl(_node, sql) {
      const statement = String(sql);
      statements.push(statement);
      if (stringIncludes(statement, 'FROM partitions WHERE table_name')) {
        return {rows: partitionsByName};
      }
      if (stringIncludes(statement, 'FROM partitions WHERE table_id')) {
        return {rows: [{partition_id: 'p1'}]};
      }
      if (stringIncludes(statement, 'FROM tables WHERE table_name')) {
        return {rows: [{table_id: 'tbl-benchmark'}]};
      }
      return {rows: []};
    },
  };
}

function virtualTiming() {
  let nowMs = 0;
  return {
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
  };
}

test('a partition row without its table name fails the readiness wait',
  async (t) => {
    const nodeClient = createNodeClient({partitionsByName: []});
    await t.rejects(
      waitForSutBenchmarkTableReady(nodeClient, NODES, TABLE_NAME, {
        timing: virtualTiming(),
        timeoutMs: 1000,
        pollIntervalMs: 10,
      }),
      /partition_table_name_missing/,
    );
    t.equal(arrayFilter(nodeClient.statements, (sql) =>
      /^\s*UPDATE\s+partitions\b/i.test(sql)).length, 0,
    'the harness never rewrites partitions.table_name');
  });

test('partition rows that carry their table name pass the readiness wait',
  async (t) => {
    const nodeClient = createNodeClient({
      partitionsByName: [{partition_id: 'p1'}],
    });
    await waitForSutBenchmarkTableReady(nodeClient, NODES, TABLE_NAME, {
      timing: virtualTiming(),
      timeoutMs: 1000,
      pollIntervalMs: 10,
    });
    t.equal(arrayFilter(nodeClient.statements, (sql) =>
      /^\s*UPDATE\b/i.test(sql)).length, 0, 'no SQL writes');
  });
