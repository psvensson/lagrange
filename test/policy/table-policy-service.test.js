/**
 * Tests for TablePolicyService.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {test} from 'tap';
import {
  TablePolicyService,
  DEFAULT_TABLE_POLICY,
} from '../../src/policy/table-policy-service.js';

// Mock system table cache
function createMockCache(tables = {}) {
  return {
    get: (tableName, id) => {
      if (tableName === 'tables') {
        return tables[id] || null;
      }
      if (tableName === 'partitions') {
        // Return partition with table_id
        return {partition_id: id, table_id: 'table-1'};
      }
      return null;
    },
  };
}

// Mock CDC integration service
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, id, data) => {
      updates.push({tableName, id, data});
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

test('TablePolicyService - getDefaultPolicy returns complete policy', async (t) => {
  const service = new TablePolicyService();
  const policy = service.getDefaultPolicy();

  t.equal(policy.replicaCount, 3, 'Default replica count should be 3');
  t.equal(policy.minReplicaCount, 3, 'Default min replica count should be 3');
  t.equal(policy.maxReplicaCount, 7, 'Default max replica count should be 7');
  t.equal(policy.splitStorageThreshold, 10 * 1024 * 1024 * 1024, 'Default split storage 10GB');
  t.equal(policy.splitTrafficThreshold, 1000, 'Default split traffic 1000 qpm');
  t.equal(policy.mergeStorageThreshold, 2 * 1024 * 1024 * 1024, 'Default merge storage 2GB');
  t.equal(policy.mergeTrafficThreshold, 200, 'Default merge traffic 200 qpm');
  t.ok(policy.placementConstraints, 'Should have placement constraints');
  t.ok(policy.placementConstraints.spreadAcrossNodes, 'Should spread across nodes');
  t.end();
});

test('TablePolicyService - getTablePolicy with no cache returns defaults', async (t) => {
  const service = new TablePolicyService();
  const policy = service.getTablePolicy('non-existent');

  t.same(policy, DEFAULT_TABLE_POLICY, 'Should return default policy');
  t.end();
});

test('TablePolicyService - getTablePolicy merges stored policy with defaults', async (t) => {
  const mockCache = createMockCache({
    'table-1': {
      table_id: 'table-1',
      table_name: 'test_table',
      table_policies: JSON.stringify({
        replicaCount: 5,
        splitStorageThreshold: 5 * 1024 * 1024 * 1024,
      }),
    },
  });

  const service = new TablePolicyService({systemTableCache: mockCache});
  const policy = service.getTablePolicy('table-1');

  t.equal(policy.replicaCount, 5, 'Should use stored replica count');
  t.equal(policy.splitStorageThreshold, 5 * 1024 * 1024 * 1024, 'Should use stored threshold');
  t.equal(policy.minReplicaCount, 3, 'Should use default min replica count');
  t.equal(policy.mergeTrafficThreshold, 200, 'Should use default merge traffic');
  t.end();
});


test('TablePolicyService - getPolicyForPartition looks up table', async (t) => {
  const mockCache = {
    get: (tableName, id) => {
      if (tableName === 'partitions' && id === 'partition-1') {
        return {partition_id: 'partition-1', table_id: 'table-1'};
      }
      if (tableName === 'tables' && id === 'table-1') {
        return {
          table_id: 'table-1',
          table_policies: JSON.stringify({replicaCount: 5}),
        };
      }
      return null;
    },
  };

  const service = new TablePolicyService({systemTableCache: mockCache});
  const policy = service.getPolicyForPartition('partition-1');

  t.equal(policy.replicaCount, 5, 'Should get policy from partition table');
  t.end();
});

test('TablePolicyService - validatePolicy accepts valid policy', async (t) => {
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

test('TablePolicyService - validatePolicy rejects even replica counts', async (t) => {
  const service = new TablePolicyService();

  const invalidPolicy = {
    replicaCount: 4, // Even number - invalid for Raft
  };

  const result = service.validatePolicy(invalidPolicy);
  t.notOk(result.valid, 'Even replica count should fail validation');
  t.ok(result.errors.some((e) => e.includes('odd')), 'Should mention odd requirement');
  t.end();
});

test('TablePolicyService - validatePolicy rejects min > max', async (t) => {
  const service = new TablePolicyService();

  const invalidPolicy = {
    minReplicaCount: 7,
    maxReplicaCount: 3,
  };

  const result = service.validatePolicy(invalidPolicy);
  t.notOk(result.valid, 'min > max should fail validation');
  t.ok(result.errors.some((e) => e.includes('greater')), 'Should mention constraint');
  t.end();
});

test('TablePolicyService - validatePolicy rejects negative thresholds', async (t) => {
  const service = new TablePolicyService();

  const invalidPolicy = {
    splitStorageThreshold: -100,
  };

  const result = service.validatePolicy(invalidPolicy);
  t.notOk(result.valid, 'Negative threshold should fail validation');
  t.ok(result.errors.some((e) => e.includes('non-negative')), 'Should mention non-negative');
  t.end();
});

test('TablePolicyService - updateTablePolicy writes via CDC', async (t) => {
  const mockCache = createMockCache({
    'table-1': {
      table_id: 'table-1',
      table_policies: '{}',
    },
  });
  const mockCDC = createMockCDCService();

  const service = new TablePolicyService({
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  await service.updateTablePolicy('table-1', {replicaCount: 5});

  t.equal(mockCDC.updates.length, 1, 'Should have one CDC update');
  t.equal(mockCDC.updates[0].tableName, 'tables', 'Should update tables table');
  t.equal(mockCDC.updates[0].id, 'table-1', 'Should update correct table');

  const updatedPolicy = JSON.parse(mockCDC.updates[0].data.table_policies);
  t.equal(updatedPolicy.replicaCount, 5, 'Should have updated replica count');
  t.end();
});

test('TablePolicyService - updateTablePolicy rejects invalid updates', async (t) => {
  const mockCache = createMockCache({'table-1': {table_id: 'table-1', table_policies: '{}'}});
  const mockCDC = createMockCDCService();

  const service = new TablePolicyService({
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  try {
    await service.updateTablePolicy('table-1', {replicaCount: 4}); // Even - invalid
    t.fail('Should have thrown error');
  } catch (error) {
    t.ok(error.message.includes('Invalid'), 'Should throw validation error');
  }

  t.equal(mockCDC.updates.length, 0, 'Should not have written to CDC');
  t.end();
});

test('TablePolicyService - getSplitThresholds returns correct values', async (t) => {
  const mockCache = createMockCache({
    'table-1': {
      table_id: 'table-1',
      table_policies: JSON.stringify({
        splitStorageThreshold: 5 * 1024 * 1024 * 1024,
        splitTrafficThreshold: 500,
      }),
    },
  });

  const service = new TablePolicyService({systemTableCache: mockCache});
  const thresholds = service.getSplitThresholds('table-1');

  t.equal(thresholds.storageThreshold, 5 * 1024 * 1024 * 1024, 'Should return storage threshold');
  t.equal(thresholds.trafficThreshold, 500, 'Should return traffic threshold');
  t.end();
});

test('TablePolicyService - getMergeThresholds returns correct values', async (t) => {
  const mockCache = createMockCache({
    'table-1': {
      table_id: 'table-1',
      table_policies: JSON.stringify({
        mergeStorageThreshold: 1 * 1024 * 1024 * 1024,
        mergeTrafficThreshold: 100,
      }),
    },
  });

  const service = new TablePolicyService({systemTableCache: mockCache});
  const thresholds = service.getMergeThresholds('table-1');

  t.equal(thresholds.storageThreshold, 1 * 1024 * 1024 * 1024, 'Should return storage threshold');
  t.equal(thresholds.trafficThreshold, 100, 'Should return traffic threshold');
  t.end();
});

test('TablePolicyService - getReplicationSettings returns correct values', async (t) => {
  const mockCache = createMockCache({
    'table-1': {
      table_id: 'table-1',
      table_policies: JSON.stringify({
        replicaCount: 5,
        minReplicaCount: 3,
        maxReplicaCount: 9,
      }),
    },
  });

  const service = new TablePolicyService({systemTableCache: mockCache});
  const settings = service.getReplicationSettings('table-1');

  t.equal(settings.replicaCount, 5, 'Should return replica count');
  t.equal(settings.minReplicaCount, 3, 'Should return min replica count');
  t.equal(settings.maxReplicaCount, 9, 'Should return max replica count');
  t.end();
});

test('TablePolicyService - shouldSplitPartition evaluates correctly', async (t) => {
  const mockCache = {
    get: (tableName, id) => {
      if (tableName === 'partitions') {
        return {partition_id: id, table_id: 'table-1'};
      }
      if (tableName === 'tables') {
        return {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            splitStorageThreshold: 10 * 1024 * 1024 * 1024,
            splitTrafficThreshold: 1000,
          }),
        };
      }
      return null;
    },
  };

  const service = new TablePolicyService({systemTableCache: mockCache});

  // Below thresholds - should not split
  t.notOk(
    service.shouldSplitPartition('p1', {sizeBytes: 1024, queriesPerMinute: 10}),
    'Should not split below thresholds',
  );

  // Above storage threshold - should split
  t.ok(
    service.shouldSplitPartition('p1', {sizeBytes: 11 * 1024 * 1024 * 1024, queriesPerMinute: 10}),
    'Should split above storage threshold',
  );

  // Above traffic threshold - should split
  t.ok(
    service.shouldSplitPartition('p1', {sizeBytes: 1024, queriesPerMinute: 1500}),
    'Should split above traffic threshold',
  );

  t.end();
});

test('TablePolicyService - shouldMergePartitions evaluates correctly', async (t) => {
  const mockCache = {
    get: (tableName, id) => {
      if (tableName === 'partitions') {
        return {partition_id: id, table_id: 'table-1'};
      }
      if (tableName === 'tables') {
        return {
          table_id: 'table-1',
          table_policies: JSON.stringify({
            mergeStorageThreshold: 2 * 1024 * 1024 * 1024,
            mergeTrafficThreshold: 200,
          }),
        };
      }
      return null;
    },
  };

  const service = new TablePolicyService({systemTableCache: mockCache});

  // Below both thresholds - should merge
  t.ok(
    service.shouldMergePartitions(
      'p1', 'p2',
      {sizeBytes: 500 * 1024 * 1024, queriesPerMinute: 50},
      {sizeBytes: 500 * 1024 * 1024, queriesPerMinute: 50},
    ),
    'Should merge when both below thresholds',
  );

  // Above storage threshold - should not merge
  t.notOk(
    service.shouldMergePartitions(
      'p1', 'p2',
      {sizeBytes: 1.5 * 1024 * 1024 * 1024, queriesPerMinute: 50},
      {sizeBytes: 1.5 * 1024 * 1024 * 1024, queriesPerMinute: 50},
    ),
    'Should not merge when combined storage exceeds threshold',
  );

  // Above traffic threshold - should not merge
  t.notOk(
    service.shouldMergePartitions(
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
  const mockCache = {
    get: (tableName, id) => {
      if (tableName === 'tables' && id === 'table-1') {
        callCount++;
        return {
          table_id: 'table-1',
          table_policies: JSON.stringify({replicaCount: 5}),
        };
      }
      return null;
    },
  };

  const service = new TablePolicyService({systemTableCache: mockCache});

  // First call - should hit cache
  service.getTablePolicy('table-1');
  t.equal(callCount, 1, 'First call should query cache');

  // Second call - should use local cache
  service.getTablePolicy('table-1');
  t.equal(callCount, 1, 'Second call should use local cache');

  // Invalidate and call again
  service.invalidateCache('table-1');
  service.getTablePolicy('table-1');
  t.equal(callCount, 2, 'After invalidation should query cache again');

  t.end();
});
