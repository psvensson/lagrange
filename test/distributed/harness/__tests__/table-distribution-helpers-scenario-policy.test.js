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
const TEST_POLICY_APPLY_TIMEOUT_MS = 60000;
const OWNER_APPLIED = Object.freeze({success: true, outcome: 'applied'});
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const TEST_POLICY_REMAINING_TIMEOUT_MS = 3;
const TEST_POLICY_REPAIR_REMAINING_TIMEOUT_MS = 9;

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

test('table-distribution-helpers writes table policy through its owner by ' +
  'table_id and never with SQL', async () => {
  const sqlCalls = [];
  const ownerWrites = [];
  const seedNode = {
    id: 'seed-1',
    async updateTablePolicy(tableId, policy) {
      ownerWrites.push({tableId, policy});
      return OWNER_APPLIED;
    },
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
      if (sql.includes('SELECT table_policies FROM tables')) {
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

  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
  assert.ok(ownerWrites.length >= 1, 'the policy owner is invoked');
  assert.ok(arrayEvery(ownerWrites, (write) =>
    write.tableId === 'tbl-benchmark-events-1'),
  'every owner write names the canonical table_id');
  assert.deepEqual(ownerWrites[0].policy, EXPECTED_DEFAULT_TABLE_POLICIES);
  assert.equal(
    arrayFilter(sqlCalls, (sql) => /^\s*(UPDATE|INSERT|DELETE)\b.*\btables\b/i
      .test(sql)).length,
    0,
    'policy preparation issues no system-table SQL write',
  );
});

test('table-distribution-helpers ends policy preparation on a typed owner ' +
  'refusal', async () => {
  let ownerCalls = 0;
  const seedNode = {
    id: 'seed-1',
    async updateTablePolicy() {
      ownerCalls += 1;
      return {
        success: false,
        outcome: 'refused',
        errorCode: 'TABLE_POLICY_INVALID',
        error: 'Invalid policy',
      };
    },
    async queryWithTimeout(sql) {
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {rows: [{table_id: 'tbl-benchmark-events-refused'}]};
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {rows: [{partition_id: 'tbl-benchmark-events-refused-p1'}]};
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
  });

  assert.equal(ownerCalls, 1, 'a refusal is not retried');
  assert.equal(preparation.tablePoliciesApplied, false);
  assert.equal(preparation.tablePoliciesApplyWarning,
    'table_policy_owner_refused:TABLE_POLICY_INVALID');
  assert.throws(() => assertSplitPolicyPrecondition(preparation, {
    scenarioName: 'seven-node-load-during-partitioning',
  }), /table_policy_owner_refused:TABLE_POLICY_INVALID/);
});

test('table-distribution-helpers can prepare table policies once the ' +
  'benchmark partition exists even if service topology is not yet routable',
async () => {
  let serviceQueryCount = 0;
  const seedNode = {
    id: 'seed-1',
    async updateTablePolicy() {
      return OWNER_APPLIED;
    },
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
    async updateTablePolicy() {
      return OWNER_APPLIED;
    },
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

test('table-distribution-helpers bounds policy read-back by the remaining ' +
  'policy visibility deadline', async () => {
  const originalDateNow = Date.now;
  let fakeNow = 0;
  const policyReadTimeouts = [];
  let repairCount = 0;
  Date.now = () => fakeNow;
  try {
    const seedNode = {
      id: 'seed-1',
      async updateTablePolicy() {
        fakeNow =
          TEST_POLICY_APPLY_TIMEOUT_MS - TEST_POLICY_REMAINING_TIMEOUT_MS;
        return OWNER_APPLIED;
      },
      async queryWithTimeout(sql, _params, options = {}) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return {rows: []};
        }
        if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-policy-read-deadline'}],
          };
        }
        if (sql.includes('FROM partitions WHERE table_id')) {
          return {
            rows: [{
              partition_id: 'tbl-benchmark-events-policy-read-deadline-p1',
            }],
          };
        }
        if (sql.includes('FROM services')) {
          return {
            rows: [{
              partition_id: 'tbl-benchmark-events-policy-read-deadline-p1',
              node_id: 'seed-1',
              raft_role: 'leader',
              status: 'active',
            }],
          };
        }
        if (sql.includes('control_snapshot')) {
          repairCount += 1;
          return {rows: []};
        }
        if (sql.includes('SELECT table_policies FROM tables')) {
          policyReadTimeouts.push(options.timeoutMs);
          fakeNow += options.timeoutMs;
          throw new Error('policy read timeout');
        }
        return {rows: []};
      },
    };

    // The owner applied the write; a read-back that never confirms it
    // within the deadline is reported, not retried past the deadline.
    const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
    });

    assert.equal(preparation.tablePoliciesApplyWarning,
      'table_policy_visibility_timeout_assumed_applied');
    assert.deepEqual(policyReadTimeouts, [TEST_POLICY_REMAINING_TIMEOUT_MS]);
    assert.equal(repairCount, 0);
  } finally {
    Date.now = originalDateNow;
  }
});

test('table-distribution-helpers bounds policy visibility repair by the ' +
  'remaining policy visibility deadline', async () => {
  const originalDateNow = Date.now;
  let fakeNow = 0;
  const repairTimeouts = [];
  Date.now = () => fakeNow;
  try {
    const seedNode = {
      id: 'seed-1',
      async updateTablePolicy() {
        fakeNow = TEST_POLICY_APPLY_TIMEOUT_MS -
          TEST_POLICY_REPAIR_REMAINING_TIMEOUT_MS;
        return OWNER_APPLIED;
      },
      async queryWithTimeout(sql, _params, options = {}) {
        if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
          return {rows: []};
        }
        if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-policy-repair-deadline'}],
          };
        }
        if (sql.includes('FROM partitions WHERE table_id')) {
          return {
            rows: [{
              partition_id: 'tbl-benchmark-events-policy-repair-deadline-p1',
            }],
          };
        }
        if (sql.includes('FROM services')) {
          return {
            rows: [{
              partition_id: 'tbl-benchmark-events-policy-repair-deadline-p1',
              node_id: 'seed-1',
              raft_role: 'leader',
              status: 'active',
            }],
          };
        }
        if (sql.includes('SELECT table_policies FROM tables')) {
          return {rows: [{table_policies: '{}'}]};
        }
        if (sql.includes('control_snapshot')) {
          repairTimeouts.push(options.timeoutMs);
          if (sql.includes('control_snapshot_local(true)')) {
            fakeNow += options.timeoutMs;
          }
          return {rows: []};
        }
        return {rows: []};
      },
    };

    // The owner applied the write; a read-back that never confirms it
    // within the deadline is reported, not retried past the deadline.
    const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
      tableName: 'benchmark_events',
    });

    assert.equal(preparation.tablePoliciesApplyWarning,
      'table_policy_visibility_timeout_assumed_applied');
    assert.ok(repairTimeouts.length >= 1);
    assert.ok(repairTimeouts.every((timeoutMs) =>
      timeoutMs <= TEST_POLICY_REPAIR_REMAINING_TIMEOUT_MS));
  } finally {
    Date.now = originalDateNow;
  }
});

test('table-distribution-helpers retries a not-ready policy owner and ' +
  'keeps its retry-after', async () => {
  let ownerCalls = 0;
  let policyLookupCount = 0;
  const expectedPolicies = {
    splitStorageThreshold: 2048,
  };
  const seedNode = {
    id: 'seed-1',
    async updateTablePolicy() {
      ownerCalls += 1;
      if (ownerCalls === 1) {
        return {
          success: false,
          outcome: 'owner_not_ready',
          errorCode: 'ADMIN_OWNER_NOT_READY',
          retryAfterMs: 7,
        };
      }
      return OWNER_APPLIED;
    },
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
      if (sql.includes('control_snapshot_local(true)')) {
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

  assert.equal(ownerCalls >= 2, true, 'the not-ready owner is retried');
  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
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
    async updateTablePolicy() {
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
      return OWNER_APPLIED;
    },
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
