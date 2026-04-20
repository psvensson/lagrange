import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertSplitPolicyPrecondition,
  prepareBenchmarkPartitioningTable,
} from '../../scenarios/table-distribution-helpers.js';

const EXPECTED_DEFAULT_TABLE_POLICIES = Object.freeze({
  externalCdcAllowed: false,
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

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
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-1-p1'}],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-1-p1',
            node_id: 'seed-1',
            raft_role: 'leader',
            status: 'active',
          }],
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

test('table-distribution-helpers can prepare table policies once the ' +
  'benchmark partition exists even if service topology is not yet routable',
async () => {
  let serviceQueryCount = 0;
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-bootstrap-policy'}],
        };
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-bootstrap-policy-p1'}],
        };
      }
      if (sql.includes('FROM services')) {
        serviceQueryCount += 1;
        return {rows: []};
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        return {changes: 1};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name')) {
        return {
          rows: [{table_policies: JSON.stringify(
            EXPECTED_DEFAULT_TABLE_POLICIES,
          )}],
        };
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        return {
          rows: [{table_policies: JSON.stringify(
            EXPECTED_DEFAULT_TABLE_POLICIES,
          )}],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
  });

  assert.equal(
    preparation.tableId,
    'tbl-benchmark-events-bootstrap-policy',
  );
  assert.equal(
    preparation.tablePoliciesApplyWarning,
    undefined,
  );
  assert.equal(
    serviceQueryCount,
    0,
    'policy preparation should defer routable topology checks to the later load-admission owner',
  );
});

test('table-distribution-helpers repairs table policy visibility from ' +
  'authoritative control snapshot before failing', async () => {
  let repairCount = 0;
  const expectedPolicies = {
    splitStorageThreshold: 1024,
  };
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-repair-policy'}],
        };
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-repair-policy-p1'}],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-repair-policy-p1',
            node_id: 'seed-1',
            raft_role: 'leader',
            status: 'active',
          }],
        };
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        return {changes: 1};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name')) {
        return {
          rows: [{
            table_policies: JSON.stringify(
              repairCount > 0 ? expectedPolicies : {},
            ),
          }],
        };
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        return {
          rows: [{
            table_policies: JSON.stringify(
              repairCount > 0 ? expectedPolicies : {},
            ),
          }],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    tablePolicies: expectedPolicies,
  });

  assert.equal(repairCount, 1);
  assert.equal(preparation.tablePoliciesVisibilityRepairApplied, true);
  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
});

test('table-distribution-helpers preserves deferred policy visibility ' +
  'without forced repair', async () => {
  let repairCount = 0;
  let policyLookupCount = 0;
  const expectedPolicies = {
    splitStorageThreshold: 2048,
  };
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-deferred-policy'}],
        };
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-deferred-policy-p1'}],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-deferred-policy-p1',
            node_id: 'seed-1',
            raft_role: 'leader',
            status: 'active',
          }],
        };
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        return {
          changes: 1,
          visibilityState: 'deferred_by_pressure',
          retryAfterMs: 7,
        };
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name')) {
        policyLookupCount += 1;
        return {
          rows: [{
            table_policies: JSON.stringify(
              policyLookupCount >= 2 ? expectedPolicies : {},
            ),
          }],
        };
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        policyLookupCount += 1;
        return {
          rows: [{
            table_policies: JSON.stringify(
              policyLookupCount >= 2 ? expectedPolicies : {},
            ),
          }],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    tablePolicies: expectedPolicies,
  });

  assert.equal(repairCount, 0);
  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
  assert.equal(
    preparation.tablePoliciesApplyVisibilityState,
    'deferred_by_pressure',
  );
  assert.equal(
    preparation.tablePoliciesApplyVisibilityRetryAfterMs,
    7,
  );
});

test('table-distribution-helpers preserves authority-establishment deferred ' +
  'policy errors without forced repair', async () => {
  let repairCount = 0;
  let applyAttemptCount = 0;
  let policyLookupCount = 0;
  const expectedReasonCode = 'publication_epoch_pending';
  const expectedPolicies = {
    splitStorageThreshold: 4096,
  };
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-authority-deferred'}],
        };
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{partition_id: 'tbl-benchmark-events-authority-deferred-p1'}],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-authority-deferred-p1',
            node_id: 'seed-1',
            raft_role: 'leader',
            status: 'active',
          }],
        };
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        applyAttemptCount += 1;
        if (applyAttemptCount === 1) {
          const error = new Error('Message timeout');
          error.code = 'QUERY_TIMEOUT';
          error.retryAfterMs = 1;
          error.outcome = 'deferred';
          error.reasonCode = expectedReasonCode;
          error.reasonCodes = [expectedReasonCode];
          error.failedDimensions = ['publishedConvergencePending'];
          error.runtimeAuthority = {
            state: 'establishing',
            visibility: {
              state: 'pending_publication',
            },
          };
          throw error;
        }
        return {changes: 1};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name')) {
        policyLookupCount += 1;
        return {
          rows: [{
            table_policies: JSON.stringify(
              policyLookupCount >= 2 ? expectedPolicies : {},
            ),
          }],
        };
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        policyLookupCount += 1;
        return {
          rows: [{
            table_policies: JSON.stringify(
              policyLookupCount >= 2 ? expectedPolicies : {},
            ),
          }],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    tablePolicies: expectedPolicies,
  });

  assert.equal(repairCount, 0);
  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
  assert.equal(
    preparation.tablePoliciesApplyVisibilityState,
    null,
  );
  assert.equal(
    preparation.tablePoliciesApplyVisibilityRetryAfterMs,
    1,
  );
});
