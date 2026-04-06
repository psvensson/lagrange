import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertSplitPolicyPrecondition,
  prepareBenchmarkPartitioningTable,
} from '../../scenarios/table-distribution-helpers.js';

test('table-distribution-helpers split policy precondition accepts table ' +
  'preparations with applied policy by default', async () => {
  const preparation = {
    tableName: 'benchmark_events',
    tableId: 'tbl-1',
  };
  assert.doesNotThrow(() => {
    assertSplitPolicyPrecondition(preparation, {
      scenarioName: 'scenario-test',
    });
  });
});

test('table-distribution-helpers split policy precondition fails fast when ' +
  'policy mutation was detected as no-op', async () => {
  const preparation = {
    tableName: 'benchmark_events',
    tableId: 'tbl-1',
    tablePoliciesApplied: false,
    tablePoliciesApplyWarning: 'sql_system_table_update_noop_detected',
  };
  let thrownError = null;
  try {
    assertSplitPolicyPrecondition(preparation, {
      scenarioName: 'seven-node-load-during-partitioning',
    });
  } catch (error) {
    thrownError = error;
  }
  assert(thrownError instanceof Error);
  assert.match(
    thrownError.message,
    /sql_system_table_update_noop_detected/i,
  );
});

test('table-distribution-helpers keeps table policy mutation on the ' +
  'canonical table_id write path', async () => {
  const sqlCalls = [];
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      sqlCalls.push(sql);
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-1'}],
        };
      }
      if (sql.includes('SELECT partition_id FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-1-p1'}],
        };
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        return {changes: 0};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name')) {
        return {
          rows: [{table_policies: '{}'}],
        };
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        return {
          rows: [{table_policies: '{}'}],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
  });

  assert.equal(preparation.tablePoliciesApplied, false);
  assert.equal(
    preparation.tablePoliciesApplyWarning,
    'sql_system_table_update_noop_detected',
  );
  assert.equal(
    sqlCalls.filter((sql) =>
      sql.includes('UPDATE tables SET table_policies') &&
      sql.includes('WHERE table_name')).length,
    0,
    'policy preparation must not retry table policy mutation by table_name',
  );
  assert.ok(
    sqlCalls.some((sql) =>
      sql.includes('UPDATE tables SET table_policies') &&
      sql.includes('WHERE table_id')),
    'policy preparation must still issue the canonical table_id update',
  );
});
