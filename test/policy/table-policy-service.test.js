/**
 * Tests for TablePolicyService.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {NUM, STRING, TYPEOF} from '../../src/constants/index.js';
import {
  POLICY_AUTHORITY_STATE,
  POLICY_ERROR_CODE,
  POLICY_ERROR_MSG,
} from '../../src/policy/policy-constants.js';
import {CDC_TABLE_POLICY_REFUSAL} from '../../src/cache/cdc-table-policy.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';

function lookupMockRow(collection, id) {
  const row = id ? collection?.[id] : null;
  return {rows: row ? [row] : []};
}

// Mock SQL query engine
function createMockSqlEngine(data = {}) {
  return {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM tables')) return lookupMockRow(data.tables, params?.[0]);
      if (sql.includes('FROM partitions')) return lookupMockRow(data.partitions, params?.[0]);
      return {rows: []};
    },
  };
}

// Mock CDC integration service
// `committedTables` is the committed authority a policy write's base is
// read from (census site 6: never the projection).
function createMockCDCService(committedTables = {}) {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, whereClause, updateData) => {
      updates.push({tableName, whereClause, data: updateData});
      return {success: true, affectedRows: 1};
    },
    executeAuthoritativeSystemTableRead: async (_tableName, _sql, params) => {
      const row = committedTables[params[0]];
      return {success: true, rows: row ? [{...row}] : [], rowCount: row ? 1 : 0};
    },
  };
}

test('TablePolicyService - initialization', async (t) => {
  const service = new TablePolicyService();
  service.initialize();

  t.ok(service.initialized, 'Service should be initialized');
  t.end();
});

test('TablePolicyService - getDefaultPolicy returns complete policy',
  async (t) => {
    const service = new TablePolicyService();
    const policy = service.getDefaultPolicy();

    t.notOk(Object.hasOwn(policy, 'targetReplicaCount'),
      'Table defaults do not declare a partition target');
    t.equal(policy.minReplicaCount, 3,
      'Default min replica count should be 3');
    t.equal(policy.maxReplicaCount, 7,
      'Default max replica count should be 7');
    t.equal(policy.splitStorageThreshold,
      10 * 1024 * 1024 * 1024, 'Default split storage 10GB');
    t.equal(policy.splitTrafficThreshold, 1000,
      'Default split traffic 1000 qpm');
    t.equal(policy.mergeStorageThreshold,
      2 * 1024 * 1024 * 1024, 'Default merge storage 2GB');
    t.equal(policy.mergeTrafficThreshold, 200,
      'Default merge traffic 200 qpm');
    t.ok(policy.placementConstraints,
      'Should have placement constraints');
    t.ok(policy.placementConstraints.spreadAcrossNodes,
      'Should spread across nodes');
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE
      ],
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      'Should default min free bytes per node',
    );
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT
      ],
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      'Should default max budget utilization percent',
    );
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM
      ],
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
      'Should default emergency headroom reservation',
    );
    t.end();
  });

test('TablePolicyService - unavailable table read is retryable, never a default',
  async (t) => {
    const service = new TablePolicyService();
    await t.rejects(service.getTablePolicy('non-existent'), {
      code: POLICY_ERROR_CODE.READ_UNAVAILABLE, deferRetry: true,
    });
  });

test('TablePolicyService - getTablePolicy merges stored policy',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_name: 'test_table',
          table_policies: JSON.stringify({
            splitTrafficThreshold: 5,
            splitStorageThreshold: 5 * 1024 * 1024 * 1024,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const policy = await service.getTablePolicy('table-1');

    t.equal(policy.splitTrafficThreshold, 5,
      'Should use stored traffic threshold');
    t.equal(policy.splitStorageThreshold,
      5 * 1024 * 1024 * 1024, 'Should use stored threshold');
    t.equal(policy.minReplicaCount, 3,
      'Should use default min replica count');
    t.equal(policy.mergeTrafficThreshold, 200,
      'Should use default merge traffic');
    t.end();
  });


test('TablePolicyService - getPolicyForPartition looks up table',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      partitions: {
        'partition-1': {
          partition_id: 'partition-1',
          table_id: 'table-1',
          replica_count: 5,
        },
      },
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({splitTrafficThreshold: 5}),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const policy =
      await service.getPolicyForPartition('partition-1');

    t.equal(policy.splitTrafficThreshold, 5,
      'Should get policy from partition table');
    t.end();
  });

test('TablePolicyService - getPolicyForPartition reads the configured system-cache observation',
  async (t) => {
    const mockCache = {
      getAll(tableName) {
        if (tableName === 'partitions') {
          return [{
            partition_id: 'partition-1',
            table_id: 'table-1',
            replica_count: 5,
          }];
        }
        if (tableName === 'tables') {
          return [{
            table_id: 'table-1',
            table_policies: JSON.stringify({
              splitTrafficThreshold: 5,
              splitStorageThreshold: 16384,
            }),
          }];
        }
        return [];
      },
    };

    const service = new TablePolicyService({
      systemTableCache: mockCache,
    });
    const policy =
      await service.getPolicyForPartition('partition-1');

    t.equal(policy.splitTrafficThreshold, 5,
      'Should resolve replica count from cached table policy');
    t.equal(policy.splitStorageThreshold, 16384,
      'Should resolve split threshold from cached table policy');
    t.end();
  });

test('TablePolicyService - validatePolicy accepts valid policy',
  async (t) => {
    const service = new TablePolicyService();

    const validPolicy = {
      minReplicaCount: 3,
      maxReplicaCount: 7,
      splitStorageThreshold: 10 * 1024 * 1024 * 1024,
      splitTrafficThreshold: 1000,
    };

    const result = service.validatePolicy(validPolicy);
    t.ok(result.valid, 'Valid policy should pass validation');
    t.equal(result.errors.length, 0, 'Should have no errors');
    t.end();
  });

test('TablePolicyService - validatePolicy rejects even replica counts',
  async (t) => {
    const service = new TablePolicyService();

    const invalidPolicy = {
      minReplicaCount: 4,
    };

    const result = service.validatePolicy(invalidPolicy);
    t.notOk(result.valid,
      'Even replica count should fail validation');
    t.ok(result.errors.some((e) => e.includes('odd')),
      'Should mention odd requirement');
    t.end();
  });

test('TablePolicyService - validatePolicy rejects min > max',
  async (t) => {
    const service = new TablePolicyService();

    const invalidPolicy = {
      minReplicaCount: 7,
      maxReplicaCount: 3,
    };

    const result = service.validatePolicy(invalidPolicy);
    t.notOk(result.valid, 'min > max should fail validation');
    t.ok(result.errors.some((e) => e.includes('greater')),
      'Should mention constraint');
    t.end();
  });

test('TablePolicyService - validatePolicy rejects negative thresholds',
  async (t) => {
    const service = new TablePolicyService();

    const invalidPolicy = {
      splitStorageThreshold: -100,
    };

    const result = service.validatePolicy(invalidPolicy);
    t.notOk(result.valid,
      'Negative threshold should fail validation');
    t.ok(result.errors.some((e) => e.includes('non-negative')),
      'Should mention non-negative');
    t.end();
  });

test('TablePolicyService - validatePolicy rejects invalid placement constraints',
  async (t) => {
    const service = new TablePolicyService();

    const invalidPolicy = {
      placementConstraints: {
        [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
          -1,
        [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
          NUM.HUNDRED + 1,
        [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
          STRING.EMPTY,
      },
    };

    const result = service.validatePolicy(invalidPolicy);
    t.notOk(result.valid,
      'Invalid placement constraints should fail validation');
    t.ok(result.errors.includes(
      POLICY_ERROR_MSG.PLACEMENT_MIN_FREE_NONNEGATIVE,
    ),
    'Should reject negative min free bytes');
    t.ok(result.errors.includes(
      POLICY_ERROR_MSG.PLACEMENT_MAX_UTIL_RANGE,
    ),
    'Should reject utilization out of range');
    const expectedTypeError = POLICY_ERROR_MSG.fieldTypeMismatch(
      STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM,
      TYPEOF.BOOLEAN,
      TYPEOF.STRING,
    );
    t.ok(result.errors.includes(expectedTypeError),
      'Should reject emergency headroom type mismatch');
    t.end();
  });

test('TablePolicyService - updateTablePolicy writes via CDC',
  async (t) => {
    const tables = {
      'table-1': {
        table_id: 'table-1',
        table_policies: '{}',
      },
    };
    const mockEngine = createMockSqlEngine({tables});
    const mockCDC = createMockCDCService(tables);

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
      cdcIntegrationService: mockCDC,
    });

    await service.updateTablePolicy('table-1', {splitTrafficThreshold: 5});

    t.equal(mockCDC.updates.length, 1,
      'Should have one CDC update');
    t.equal(mockCDC.updates[0].tableName, 'tables',
      'Should update tables table');
    t.same(mockCDC.updates[0].whereClause,
      {table_id: 'table-1', table_policies: '{}', updated_at: null},
      'Should update the table, conditional on its committed policy');

    const updatedPolicy =
      JSON.parse(mockCDC.updates[0].data.table_policies);
    t.equal(updatedPolicy.splitTrafficThreshold, 5,
      'Should have updated traffic threshold');
    t.end();
  });

test('TablePolicyService - updateTablePolicy rejects invalid updates',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: '{}',
        },
      },
    });
    const mockCDC = createMockCDCService();

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
      cdcIntegrationService: mockCDC,
    });

    try {
      await service.updateTablePolicy('table-1', {minReplicaCount: 4});
      t.fail('Should have thrown error');
    } catch (error) {
      t.ok(error.message.includes('Invalid'),
        'Should throw validation error');
    }

    t.equal(mockCDC.updates.length, 0,
      'Should not have written to CDC');
    t.end();
  });

test('TablePolicyService - updateTablePolicy refuses an external CDC request typed, ' +
  'before any write (owner decision D2)', async (t) => {
  const tables = {'table-1': {table_id: 'table-1', table_policies: '{}'}};
  const mockEngine = createMockSqlEngine({tables});
  const mockCDC = createMockCDCService(tables);
  const service = new TablePolicyService({
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
  });
  const refusals = [];
  for (const updates of [{externalCdcAllowed: true},
    {changeDataCapture: {externalCdcAllowed: true}}]) {
    try {
      await service.updateTablePolicy('table-1', updates);
      refusals.push(null);
    } catch (error) {
      refusals.push(error.code ?? error.message);
    }
  }
  await service.updateTablePolicy('table-1', {externalCdcAllowed: false});
  t.same({refusals, writes: mockCDC.updates.length}, {
    refusals: [CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED,
      CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED],
    writes: 1,
  }, 'both request shapes are refused typed with no write; an explicit false is admitted');
  t.end();
});

test('TablePolicyService - getSplitThresholds returns correct values',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            splitStorageThreshold: 5 * 1024 * 1024 * 1024,
            splitTrafficThreshold: 500,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const thresholds =
      await service.getSplitThresholds('table-1');

    t.equal(thresholds.storageThreshold,
      5 * 1024 * 1024 * 1024, 'Should return storage threshold');
    t.equal(thresholds.trafficThreshold, 500,
      'Should return traffic threshold');
    t.end();
  });

test('TablePolicyService - getMergeThresholds returns correct values',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            mergeStorageThreshold: 1 * 1024 * 1024 * 1024,
            mergeTrafficThreshold: 100,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const thresholds =
      await service.getMergeThresholds('table-1');

    t.equal(thresholds.storageThreshold,
      1 * 1024 * 1024 * 1024, 'Should return storage threshold');
    t.equal(thresholds.trafficThreshold, 100,
      'Should return traffic threshold');
    t.end();
  });

test('TablePolicyService - table policy exposes safety limits without a target',
  async (t) => {
    const service = new TablePolicyService({sqlQueryEngine: createMockSqlEngine({
      tables: {'table-1': {table_id: 'table-1',
        table_policies: JSON.stringify({minReplicaCount: 5, maxReplicaCount: 9})}},
    })});
    const policy = await service.getTablePolicy('table-1');
    t.equal(policy.minReplicaCount, 5);
    t.equal(policy.maxReplicaCount, 9);
    t.notOk(Object.hasOwn(policy, 'targetReplicaCount'));
    t.notOk(Object.hasOwn(policy, 'replicaCount'));
    t.equal(service.getReplicationSettings, undefined);
    t.equal(service.setTablePolicy, undefined);
  });

test('TablePolicyService - cache invalidation', async (t) => {
  let callCount = 0;
  const mockEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM tables') &&
          params?.[0] === 'table-1') {
        callCount++;
        return {
          rows: [{
            table_id: 'table-1',
            table_policies: JSON.stringify({splitTrafficThreshold: 5}),
          }],
        };
      }
      return {rows: []};
    },
  };

  const service = new TablePolicyService({
    sqlQueryEngine: mockEngine,
  });

  // First call - should hit SQL engine
  const first = await service.getTablePolicy('table-1');
  t.equal(callCount, 1, 'First call should query SQL engine');

  // Observe the row, then reuse its parsed policy within the TTL.
  t.equal(await service.getTablePolicy('table-1'), first);
  t.equal(callCount, 2, 'Every read still observes table availability');

  // Invalidate and call again
  service.invalidateCache('table-1');
  t.not(await service.getTablePolicy('table-1'), first);
  t.equal(callCount, 3,
    'After invalidation should query and resolve policy again');

  t.end();
});


// --- Message group policy tests (Task 8, Req 6.1, 6.3, 6.4, 6.5) ---

test('TablePolicyService - getDefaultMessageGroupPolicy returns complete policy',
  async (t) => {
    const service = new TablePolicyService();
    const policy = service.getDefaultMessageGroupPolicy();

    t.equal(policy.targetReplicaCount, 3,
      'Default target replica count should be 3');
    t.equal(policy.maxReplicaCount, 5,
      'Default max replica count should be 5');
    t.equal(policy.ensureLocalAccess, true,
      'Should ensure local access by default');
    t.ok(policy.placementConstraints,
      'Should have placement constraints');
    t.ok(policy.placementConstraints.spreadAcrossNodes,
      'Should spread across nodes');
    t.ok(policy.placementConstraints.preferNearbyNodes,
      'Should prefer nearby nodes');
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE
      ],
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      'Should default min free bytes per node',
    );
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT
      ],
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      'Should default max budget utilization percent',
    );
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM
      ],
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
      'Should default emergency headroom reservation',
    );
    t.end();
  });

test('TablePolicyService - unavailable message group read is retryable, never a default',
  async (t) => {
    const service = new TablePolicyService();
    await t.rejects(service.getMessageGroupPolicy('mg-1'), {
      code: POLICY_ERROR_CODE.READ_UNAVAILABLE,
      deferRetry: true,
    });
    const decision = await service.resolveMessageGroupPolicyFact('mg-1');
    t.equal(decision.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
  });

test('TablePolicyService - getMessageGroupPolicy reads the configured system-cache observation',
  async (t) => {
    const service = new TablePolicyService({
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'message_groups') {
            return [];
          }
          return [
            {
              group_id: 'mg-self-hosted-1',
              replica_count: 3,
              policy: JSON.stringify({
                ensureLocalAccess: false,
                placementConstraints: {
                  spreadAcrossNodes: false,
                },
              }),
            },
          ].filter(predicate);
        },
      },
    });

    const policy = await service.getMessageGroupPolicy('mg-self-hosted-1');

    t.equal(policy.targetReplicaCount, 3,
      'Should use declared row replica_count');
    t.equal(policy.ensureLocalAccess, false,
      'Should use cached ensureLocalAccess override');
    t.equal(policy.placementConstraints.spreadAcrossNodes, false,
      'Should use cached spreadAcrossNodes override');
    t.end();
  });

test('TablePolicyService - getMessageGroupPolicy merges stored policy',
  async (t) => {
    const mockEngine = createMockSqlEngine({});
    // Override executeQuery to handle message_groups
    mockEngine.executeQuery = async (sql, params) => {
      if (sql.includes('FROM message_groups') && params?.[0]) {
        if (params[0] === 'mg-1') {
          return {
            rows: [{
              group_id: 'mg-1',
              policy: JSON.stringify({
                targetReplicaCount: 5,
                placementConstraints: {
                  [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
                    1048576,
                },
              }),
            }],
          };
        }
      }
      return {rows: []};
    };

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const policy = await service.getMessageGroupPolicy('mg-1');

    t.equal(policy.targetReplicaCount, 5,
      'Should use stored target replica count');
    t.equal(policy.maxReplicaCount, 5,
      'Should use default max replica count');
    t.equal(policy.ensureLocalAccess, true,
      'Should use default ensureLocalAccess');
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE
      ],
      1048576,
      'Should use stored min free bytes');
    t.equal(
      policy.placementConstraints[
        STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT
      ],
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      'Should use default max utilization for unset keys');
    t.end();
  });

test('TablePolicyService - validateMessageGroupPolicy accepts valid policy',
  async (t) => {
    const service = new TablePolicyService();

    const validPolicy = {
      targetReplicaCount: 5,
      maxReplicaCount: 7,
      ensureLocalAccess: false,
    };

    const result = service.validateMessageGroupPolicy(validPolicy);
    t.ok(result.valid, 'Valid policy should pass validation');
    t.equal(result.errors.length, 0, 'Should have no errors');
    t.end();
  });

test('TablePolicyService - validateMessageGroupPolicy rejects even replica count',
  async (t) => {
    const service = new TablePolicyService();

    const result = service.validateMessageGroupPolicy({
      targetReplicaCount: 4,
    });
    t.notOk(result.valid, 'Even replica count should fail');
    t.ok(result.errors.some((e) => e.includes('odd')),
      'Should mention odd requirement');
    t.end();
  });

test('TablePolicyService - validateMessageGroupPolicy rejects target > max',
  async (t) => {
    const service = new TablePolicyService();

    const result = service.validateMessageGroupPolicy({
      targetReplicaCount: 7,
      maxReplicaCount: 5,
    });
    t.notOk(result.valid, 'target > max should fail');
    t.ok(result.errors.some((e) => e.includes('between')),
      'Should mention constraint');
    t.end();
  });

test('TablePolicyService - validateMessageGroupPolicy rejects invalid placement constraints',
  async (t) => {
    const service = new TablePolicyService();

    const result = service.validateMessageGroupPolicy({
      placementConstraints: {
        [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
          -1,
        [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
          NUM.HUNDRED + 1,
      },
    });
    t.notOk(result.valid,
      'Invalid placement constraints should fail');
    t.ok(result.errors.includes(
      POLICY_ERROR_MSG.PLACEMENT_MIN_FREE_NONNEGATIVE,
    ), 'Should reject negative min free bytes');
    t.ok(result.errors.includes(
      POLICY_ERROR_MSG.PLACEMENT_MAX_UTIL_RANGE,
    ), 'Should reject utilization out of range');
    t.end();
  });

test('TablePolicyService - validateMessageGroupPolicy rejects type mismatches',
  async (t) => {
    const service = new TablePolicyService();

    const result = service.validateMessageGroupPolicy({
      targetReplicaCount: 'three',
      ensureLocalAccess: 'yes',
    });
    t.notOk(result.valid, 'Type mismatches should fail');
    t.ok(result.errors.length >= 2,
      'Should have at least 2 type errors');
    t.end();
  });

test('TablePolicyService - getEffectiveStorageConstraints for table',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            placementConstraints: {
              [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
                5242880,
              [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
                true,
            },
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const constraints =
      await service.getEffectiveStorageConstraints('table-1');

    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE],
      5242880,
      'Should return stored min free bytes');
    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT],
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      'Should return default max utilization');
    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM],
      true,
      'Should return stored emergency headroom');
    t.end();
  });

test('TablePolicyService - getEffectiveMessageGroupStorageConstraints',
  async (t) => {
    const mockEngine = {
      executeQuery: async (sql, params) => {
        if (sql.includes('FROM message_groups') &&
            params?.[0] === 'mg-1') {
          return {
            rows: [{
              group_id: 'mg-1',
              replica_count: 3,
              policy: JSON.stringify({
                placementConstraints: {
                  [STORAGE_PLACEMENT_CONSTRAINT
                    .MAX_BUDGET_UTILIZATION_PERCENT]: 80,
                },
              }),
            }],
          };
        }
        return {rows: []};
      },
    };

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const constraints =
      await service.getEffectiveMessageGroupStorageConstraints('mg-1');

    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT],
      80,
      'Should return stored max utilization');
    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE],
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      'Should return default min free bytes');
    t.equal(
      constraints[STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM],
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
      'Should return default emergency headroom');
    t.end();
  });

test('TablePolicyService - message group policy uses same validation path as table',
  async (t) => {
    const service = new TablePolicyService();

    // Same invalid constraint should fail in both paths
    const tableResult = service.validatePolicy({
      placementConstraints: {
        [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
          -1,
      },
    });
    const mgResult = service.validateMessageGroupPolicy({
      placementConstraints: {
        [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
          -1,
      },
    });

    t.notOk(tableResult.valid, 'Table validation should fail');
    t.notOk(mgResult.valid, 'Message group validation should fail');
    t.equal(
      tableResult.errors[0],
      mgResult.errors[0],
      'Both should produce the same error message',
    );
    t.end();
  });

test('TablePolicyService - message group policy cache works',
  async (t) => {
    let callCount = 0;
    const mockEngine = {
      executeQuery: async (sql, params) => {
        if (sql.includes('FROM message_groups') &&
            params?.[0] === 'mg-1') {
          callCount++;
          return {
            rows: [{
              group_id: 'mg-1',
              policy: JSON.stringify({targetReplicaCount: 5}),
            }],
          };
        }
        return {rows: []};
      },
    };

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });

    const first = await service.getMessageGroupPolicy('mg-1');
    t.equal(callCount, 1, 'First call should query SQL engine');

    t.equal(await service.getMessageGroupPolicy('mg-1'), first);
    t.equal(callCount, 2, 'Every read still observes message-group availability');

    service.clearCache();
    t.not(await service.getMessageGroupPolicy('mg-1'), first);
    t.equal(callCount, 3,
      'After clearCache should query and resolve policy again');
    t.end();
  });

test('TablePolicyService - resolveMessageGroupPolicyFact distinguishes authoritative policy, authoritative absence, and stale/unavailable evidence',
  async (t) => {
    let row = {
      group_id: 'mg-fact',
      replica_count: 5,
      policy: JSON.stringify({targetReplicaCount: 5}),
    };
    let readAvailable = true;
    let witnessRole = 'leader';
    let rowSetComplete = true;
    const service = new TablePolicyService({
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => {
          if (!readAvailable) {
            return {success: false, error: 'authority_unavailable'};
          }
          return {
            success: true,
            rowSetComplete,
            rows: row ? [row] : [],
            readAuthorityWitness: {
              state: 'observed',
              partitionId: 'message_groups-p1',
              servingNodeId: 'node-1',
              servingReplicaId: 'message_groups-p1-r1',
              role: witnessRole,
              leaderNodeId: 'node-1',
              term: 1,
              commitIndex: 1,
              appliedIndex: 1,
              observedAtMs: 1_000_000,
            },
          };
        },
      },
    });

    const validDecision = await service.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(validDecision.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY);
    t.equal(validDecision.minReplicaCount, 5);
    t.equal(validDecision.targetReplicaCount, 5);

    witnessRole = 'follower';
    const followerDecision = await service.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(followerDecision.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);

    witnessRole = 'leader';
    rowSetComplete = false;
    const incompleteDecision = await service.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(incompleteDecision.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);

    rowSetComplete = true;
    readAvailable = false;
    const staleDecision = await service.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(staleDecision.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
    t.equal(staleDecision.minReplicaCount, null);

    readAvailable = true;
    row = null;
    const absentDecision = await service.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(absentDecision.state, POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE);
    t.equal(absentDecision.minReplicaCount, null);

    const cacheOnlyService = new TablePolicyService({
      systemTableCache: {
        get: () => ({
          group_id: 'mg-fact',
          replica_count: 5,
          policy: JSON.stringify({targetReplicaCount: 5}),
        }),
      },
    });
    const cacheOnlyDecision = await cacheOnlyService.resolveMessageGroupPolicyFact(
      'mg-fact',
      {requireAuthoritative: true},
    );
    t.equal(cacheOnlyDecision.state, POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE);
    t.end();
  });

test('TablePolicyService - updateTablePolicy enforces read-your-writes fence ' +
  'and refreshes cached policy when systemTableCache advances', async (t) => {
  const tableRow = {
    table_id: 'table-fence',
    table_policies: '{}',
    updated_at: 1000,
  };
  let capturedOptions = null;
  const service = new TablePolicyService({
    systemTableCache: {
      filter: (_tableName, predicate) => [tableRow].filter(predicate),
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      executeRead: async ({readFromCache}) => ({rows: readFromCache()}),
      readAuthoritativeRows: async () => ({success: true, rows: [{...tableRow}]}),
      submitMutation: async (_mutation, options) => {
        capturedOptions = options;
        // Simulate CDC cache update lagging behind durable commit completion.
        return {
          success: true,
          outcome: 'applied',
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  // Prime policyCache with pre-update default policy.
  const initialPolicy = await service.getTablePolicy('table-fence');
  t.equal(initialPolicy.splitTrafficThreshold, 1000);

  await service.updateTablePolicy('table-fence', {
    splitTrafficThreshold: 5,
    mergeStorageThreshold: 1,
    mergeTrafficThreshold: 0,
  });
  t.equal(capturedOptions?.expectedCacheFields, undefined,
    'submitMutation carries no projection-field wait: writes answer at their commit');
  t.equal(capturedOptions?.minimumCacheFields, undefined,
    'submitMutation carries no minimum projection fields');

  // Even before systemTableCache receives the CDC event, getTablePolicy
  // must return the newly committed policy and never cache the stale pre-update row.
  const fencedPolicy = await service.getTablePolicy('table-fence');
  t.equal(fencedPolicy.splitTrafficThreshold, 5);
  t.equal(fencedPolicy.mergeStorageThreshold, 1);
  t.equal(fencedPolicy.mergeTrafficThreshold, 0);

  // When systemTableCache subsequently advances to a newer policy, getTablePolicy
  // observes the newer table_policies instead of serving a stale cached entry.
  tableRow.table_policies = JSON.stringify({splitTrafficThreshold: 7});
  tableRow.updated_at = Date.now() + 1000;
  const advancedPolicy = await service.getTablePolicy('table-fence');
  t.equal(advancedPolicy.splitTrafficThreshold, 7,
    'policyCache invalidates when systemTableCache table_policies advances');
  t.end();
});

// Census site 6 (lead decision 2026-11-02): the TABLES row is shared (table
// creation, split, policy). A policy update's base is this node's own last
// committed policy (the committed policy fence) or, at an unknown position,
// one committed read through the gateway - never the projection - and the
// write is conditional on that base (table_policies and updated_at), with a
// typed conflict and a committed re-read after it.
function committedPolicyGateway(row) {
  const gateway = {
    row: {...row},
    writes: [],
    committedReads: 0,
    projectionReads: 0,
    readUnavailable: false,
    async readAuthoritativeRows(_tableName, _sql, params) {
      gateway.committedReads += 1;
      if (gateway.readUnavailable) {
        return {success: false, error: 'authoritative_row_source_unavailable',
          retryAfterMs: 250};
      }
      return {success: true,
        rows: params[0] === gateway.row.table_id ? [{...gateway.row}] : []};
    },
    async executeRead() {
      gateway.projectionReads += 1;
      return {rows: []};
    },
    async submitMutation(mutation) {
      gateway.writes.push(mutation);
      const matches = Object.entries(mutation.whereClause).every(
        ([column, value]) => (gateway.row[column] ?? null) === value);
      if (!matches) {
        return {success: true, outcome: 'applied',
          partitionResult: {affectedRows: 0}};
      }
      Object.assign(gateway.row, mutation.data);
      return {success: true, outcome: 'applied',
        partitionResult: {affectedRows: 1}};
    },
  };
  return gateway;
}

function policyServiceOver(gateway) {
  return new TablePolicyService({
    systemTableCache: {filter: () => [], getAll: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: gateway,
  });
}

test('site 6: with the projection paused, consecutive policy updates keep ' +
  'the committed policy as their base - one committed read, no projection ' +
  'read, each write conditional on its base', async (t) => {
  const gateway = committedPolicyGateway(
    {table_id: 'table-site6', table_policies: null, updated_at: 1000});
  const service = policyServiceOver(gateway);

  await service.updateTablePolicy('table-site6', {splitTrafficThreshold: 5});
  const afterFirst = {...gateway.row};
  await service.updateTablePolicy('table-site6', {mergeStorageThreshold: 1});

  t.equal(gateway.committedReads, 1,
    'only the first update (unknown position) reads the committed row');
  t.equal(gateway.projectionReads, 0, 'no projection read');
  t.same(gateway.writes[0].whereClause,
    {table_id: 'table-site6', table_policies: null, updated_at: 1000},
    'the first write is conditional on the committed base');
  t.same(gateway.writes[1].whereClause, {table_id: 'table-site6',
    table_policies: afterFirst.table_policies,
    updated_at: afterFirst.updated_at},
  'the second write is conditional on the kept committed policy');
  t.same(JSON.parse(gateway.row.table_policies),
    {splitTrafficThreshold: 5, mergeStorageThreshold: 1},
    'both updates applied, none lost');
  t.end();
});

test('site 6: a second writer between policy updates answers a typed ' +
  'conflict, loses no update, and the next update re-reads the committed row',
async (t) => {
  const gateway = committedPolicyGateway(
    {table_id: 'table-site6', table_policies: null, updated_at: 1000});
  const service = policyServiceOver(gateway);
  await service.updateTablePolicy('table-site6', {splitTrafficThreshold: 5});
  // Another writer of the shared TABLES row (another node's policy update).
  gateway.row.table_policies = JSON.stringify({splitTrafficThreshold: 7});
  gateway.row.updated_at += 1;
  const otherWriter = {...gateway.row};

  const conflict = await service.updateTablePolicy('table-site6',
    {mergeStorageThreshold: 1}).then(() => null, (error) => error);
  t.equal(conflict?.code, 'TABLE_POLICY_MUTATION_OBSERVATION_CHANGED',
    'the conditional write answers a typed conflict');
  t.same(gateway.row, otherWriter,
    'the other writer\'s committed policy is not overwritten');

  const readsBefore = gateway.committedReads;
  await service.updateTablePolicy('table-site6', {mergeStorageThreshold: 1});
  t.equal(gateway.committedReads, readsBefore + 1,
    'after a conflict the base is re-read from the committed authority');
  t.same(JSON.parse(gateway.row.table_policies),
    {splitTrafficThreshold: 7, mergeStorageThreshold: 1},
    'the retry builds on the other writer\'s committed policy');
  t.equal(gateway.projectionReads, 0, 'no projection read');
  t.end();
});

test('site 6: an unavailable committed read refuses the update typed and ' +
  'writes nothing', async (t) => {
  const gateway = committedPolicyGateway(
    {table_id: 'table-site6', table_policies: null, updated_at: 1000});
  gateway.readUnavailable = true;
  const service = policyServiceOver(gateway);
  const refusal = await service.updateTablePolicy('table-site6',
    {splitTrafficThreshold: 5}).then(() => null, (error) => error);
  t.equal(refusal?.code, 'TABLE_POLICY_BASE_UNAVAILABLE', 'typed unavailable');
  t.equal(refusal?.retryAfterMs, 250, 'with the authority\'s retryAfterMs');
  t.equal(gateway.writes.length, 0, 'no write without a committed base');
  t.equal(gateway.projectionReads, 0, 'no projection read');
  t.end();
});

test('strict policy fact resolution rejects in-flight stale reads across ' +
  'single and multi-write policy updates without pairing cached policy ' +
  'with a stale witness', async (t) => {
  let row = {
    table_id: 'table-fenced',
    table_policies: JSON.stringify({
      minReplicaCount: 3,
    }),
    updated_at: 100,
  };
  let releaseHeldRead = null;
  const heldReadGate = new Promise((resolve) => {
    releaseHeldRead = resolve;
  });
  let holdNextRead = false;
  const gateway = {
    async readAuthoritativeRows() {
      const captured = {...row};
      if (holdNextRead) {
        holdNextRead = false;
        await heldReadGate;
      }
      return {
        success: true,
        source: 'owner_rpc_lane',
        rowSetComplete: true,
        rows: [captured],
        readAuthorityWitness: {
          state: 'observed',
          role: 'leader',
          partitionId: 'tables-p1',
          servingNodeId: 'n1',
          servingReplicaId: 'tables-p1-r1',
          term: 1,
          commitIndex: captured.updated_at,
          appliedIndex: captured.updated_at,
          observedAtMs: 1700000000000,
        },
      };
    },
    async submitMutation(mutation) {
      row = {
        ...row,
        table_policies: mutation.data.table_policies,
        updated_at: mutation.data.updated_at,
      };
      return {
        success: true,
        outcome: 'applied',
        partitionResult: {affectedRows: 1},
      };
    },
  };
  const service = policyServiceOver(gateway);

  // Warm committed base at 3, then hold an authoritative read at 3 while
  // two updates (3 -> 5 -> 7) commit.
  await service.resolveTablePolicyFact('table-fenced', {
    requireAuthoritative: true,
  });
  holdNextRead = true;
  const inFlightStaleRead = service.resolveTablePolicyFact('table-fenced', {
    requireAuthoritative: true,
  });
  await Promise.resolve();
  await service.updateTablePolicy('table-fenced', {
    minReplicaCount: 5,
  });
  await service.updateTablePolicy('table-fenced', {
    minReplicaCount: 7,
  });
  releaseHeldRead();

  const staleFact = await inFlightStaleRead;
  t.equal(
    staleFact.state,
    'unavailable_or_stale',
    'in-flight pre-update read must be rejected after 3 -> 5 -> 7 commits',
  );
  t.equal(
    staleFact.readAuthorityWitness,
    null,
    'rejected stale policy read must not retain a witness',
  );
  t.equal(
    service.committedPolicyFences.has('table-fenced'),
    true,
    'stale read must not delete the active committed policy fence',
  );

  // A subsequent fresh read observing the committed 7 snapshot succeeds and
  // clears the fence.
  const freshFact = await service.resolveTablePolicyFact('table-fenced', {
    requireAuthoritative: true,
  });
  t.equal(freshFact.state, 'authoritative_policy');
  t.equal(freshFact.minReplicaCount, 7);
  t.equal(freshFact.readAuthorityWitness?.commitIndex, row.updated_at);
  t.equal(
    service.committedPolicyFences.has('table-fenced'),
    false,
    'fence clears once authoritative read catches up to latest commit',
  );
  t.end();
});
