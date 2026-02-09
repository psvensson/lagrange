/**
 * Tests for TablePolicyService.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';

// Mock SQL query engine
function createMockSqlEngine(data = {}) {
  return {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM tables') && params?.[0]) {
        const table = data.tables?.[params[0]] || null;
        return {rows: table ? [table] : []};
      }
      if (sql.includes('FROM partitions') && params?.[0]) {
        const partition = data.partitions?.[params[0]] || null;
        return {rows: partition ? [partition] : []};
      }
      return {rows: []};
    },
  };
}

// Mock CDC integration service
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, id, updateData) => {
      updates.push({tableName, id, data: updateData});
      return {success: true};
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

    t.equal(policy.replicaCount, 3,
      'Default replica count should be 3');
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
    t.end();
  });

test('TablePolicyService - getTablePolicy without engine returns default',
  async (t) => {
    const service = new TablePolicyService();
    const policy = await service.getTablePolicy('non-existent');

    t.equal(policy.replicaCount, 3,
      'Should return default policy without engine');
    t.end();
  });

test('TablePolicyService - getTablePolicy merges stored policy',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_name: 'test_table',
          table_policies: JSON.stringify({
            replicaCount: 5,
            splitStorageThreshold: 5 * 1024 * 1024 * 1024,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const policy = await service.getTablePolicy('table-1');

    t.equal(policy.replicaCount, 5,
      'Should use stored replica count');
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
        },
      },
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({replicaCount: 5}),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const policy =
      await service.getPolicyForPartition('partition-1');

    t.equal(policy.replicaCount, 5,
      'Should get policy from partition table');
    t.end();
  });

test('TablePolicyService - validatePolicy accepts valid policy',
  async (t) => {
    const service = new TablePolicyService();

    const validPolicy = {
      replicaCount: 5,
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
      replicaCount: 4,
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

test('TablePolicyService - updateTablePolicy writes via CDC',
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

    await service.updateTablePolicy('table-1', {replicaCount: 5});

    t.equal(mockCDC.updates.length, 1,
      'Should have one CDC update');
    t.equal(mockCDC.updates[0].tableName, 'tables',
      'Should update tables table');
    t.equal(mockCDC.updates[0].id, 'table-1',
      'Should update correct table');

    const updatedPolicy =
      JSON.parse(mockCDC.updates[0].data.table_policies);
    t.equal(updatedPolicy.replicaCount, 5,
      'Should have updated replica count');
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
      await service.updateTablePolicy('table-1', {replicaCount: 4});
      t.fail('Should have thrown error');
    } catch (error) {
      t.ok(error.message.includes('Invalid'),
        'Should throw validation error');
    }

    t.equal(mockCDC.updates.length, 0,
      'Should not have written to CDC');
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

test('TablePolicyService - getReplicationSettings returns values',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            replicaCount: 5,
            minReplicaCount: 3,
            maxReplicaCount: 9,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });
    const settings =
      await service.getReplicationSettings('table-1');

    t.equal(settings.replicaCount, 5,
      'Should return replica count');
    t.equal(settings.minReplicaCount, 3,
      'Should return min replica count');
    t.equal(settings.maxReplicaCount, 9,
      'Should return max replica count');
    t.end();
  });

test('TablePolicyService - shouldSplitPartition evaluates correctly',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      partitions: {
        'p1': {partition_id: 'p1', table_id: 'table-1'},
      },
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            splitStorageThreshold: 10 * 1024 * 1024 * 1024,
            splitTrafficThreshold: 1000,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });

    // Below thresholds - should not split
    t.notOk(
      await service.shouldSplitPartition('p1', {
        sizeBytes: 1024, queriesPerMinute: 10,
      }),
      'Should not split below thresholds',
    );

    // Above storage threshold - should split
    t.ok(
      await service.shouldSplitPartition('p1', {
        sizeBytes: 11 * 1024 * 1024 * 1024,
        queriesPerMinute: 10,
      }),
      'Should split above storage threshold',
    );

    // Above traffic threshold - should split
    t.ok(
      await service.shouldSplitPartition('p1', {
        sizeBytes: 1024, queriesPerMinute: 1500,
      }),
      'Should split above traffic threshold',
    );

    t.end();
  });

test('TablePolicyService - shouldMergePartitions evaluates correctly',
  async (t) => {
    const mockEngine = createMockSqlEngine({
      partitions: {
        'p1': {partition_id: 'p1', table_id: 'table-1'},
        'p2': {partition_id: 'p2', table_id: 'table-1'},
      },
      tables: {
        'table-1': {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            mergeStorageThreshold: 2 * 1024 * 1024 * 1024,
            mergeTrafficThreshold: 200,
          }),
        },
      },
    });

    const service = new TablePolicyService({
      sqlQueryEngine: mockEngine,
    });

    // Below both thresholds - should merge
    t.ok(
      await service.shouldMergePartitions(
        'p1', 'p2',
        {sizeBytes: 500 * 1024 * 1024, queriesPerMinute: 50},
        {sizeBytes: 500 * 1024 * 1024, queriesPerMinute: 50},
      ),
      'Should merge when both below thresholds',
    );

    // Above storage threshold - should not merge
    t.notOk(
      await service.shouldMergePartitions(
        'p1', 'p2',
        {
          sizeBytes: 1.5 * 1024 * 1024 * 1024,
          queriesPerMinute: 50,
        },
        {
          sizeBytes: 1.5 * 1024 * 1024 * 1024,
          queriesPerMinute: 50,
        },
      ),
      'Should not merge when combined storage exceeds threshold',
    );

    // Above traffic threshold - should not merge
    t.notOk(
      await service.shouldMergePartitions(
        'p1', 'p2',
        {sizeBytes: 100 * 1024 * 1024, queriesPerMinute: 150},
        {sizeBytes: 100 * 1024 * 1024, queriesPerMinute: 150},
      ),
      'Should not merge when combined traffic exceeds threshold',
    );

    t.end();
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
            table_policies: JSON.stringify({replicaCount: 5}),
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
  await service.getTablePolicy('table-1');
  t.equal(callCount, 1, 'First call should query SQL engine');

  // Second call - should use local cache
  await service.getTablePolicy('table-1');
  t.equal(callCount, 1, 'Second call should use local cache');

  // Invalidate and call again
  service.invalidateCache('table-1');
  await service.getTablePolicy('table-1');
  t.equal(callCount, 2,
    'After invalidation should query SQL engine again');

  t.end();
});
