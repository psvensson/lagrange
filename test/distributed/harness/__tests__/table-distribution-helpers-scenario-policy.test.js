import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertSplitPolicyPrecondition,
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
