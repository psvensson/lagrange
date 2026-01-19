/**
 * Property Test: Table Policy Application
 * Property 16: For any partition operation (split, merge, replication),
 * the operation should follow the policies defined in the table's configuration.
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  TablePolicyService,
  DEFAULT_TABLE_POLICY,
} from '../../src/policy/table-policy-service.js';

// Generate valid odd replica counts
const oddReplicaCount = fc.integer({min: 1, max: 9}).filter((n) => n % 2 === 1);

// Generate valid storage thresholds (1MB to 100GB)
const storageThreshold = fc.integer({min: 1024 * 1024, max: 100 * 1024 * 1024 * 1024});

// Generate valid traffic thresholds (1 to 10000 qpm)
const trafficThreshold = fc.integer({min: 1, max: 10000});

// Generate valid table policies
const validTablePolicy = fc.record({
  replicaCount: oddReplicaCount,
  minReplicaCount: fc.constant(3),
  maxReplicaCount: fc.constant(9),
  splitStorageThreshold: storageThreshold,
  splitTrafficThreshold: trafficThreshold,
  mergeStorageThreshold: storageThreshold,
  mergeTrafficThreshold: trafficThreshold,
});

// Generate partition metrics
const partitionMetrics = fc.record({
  sizeBytes: fc.integer({min: 0, max: 50 * 1024 * 1024 * 1024}),
  queriesPerMinute: fc.integer({min: 0, max: 5000}),
});

// Mock system table cache with configurable policies
function createMockCache(tablePolicy) {
  return {
    get: (tableName, id) => {
      if (tableName === 'tables' && id === 'table-1') {
        return {
          table_id: 'table-1',
          table_policies: JSON.stringify(tablePolicy),
        };
      }
      if (tableName === 'partitions') {
        return {partition_id: id, table_id: 'table-1'};
      }
      return null;
    },
  };
}

test('Property 16: Table Policy Application', async (t) => {
  t.test('split decisions follow table policy thresholds', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any partition metrics and table policy, split decisions should
     * correctly apply the policy's split thresholds.
     */
    fc.assert(
      fc.property(
        validTablePolicy,
        partitionMetrics,
        (policy, metrics) => {
          const mockCache = createMockCache(policy);
          const service = new TablePolicyService({systemTableCache: mockCache});

          const shouldSplit = service.shouldSplitPartition('partition-1', metrics);

          // Split should occur if EITHER threshold is exceeded
          const expectedSplit = metrics.sizeBytes >= policy.splitStorageThreshold ||
                               metrics.queriesPerMinute >= policy.splitTrafficThreshold;

          return shouldSplit === expectedSplit;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Split decisions correctly apply policy thresholds');
    t.end();
  });

  t.test('merge decisions follow table policy thresholds', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any two partition metrics and table policy, merge decisions should
     * correctly apply the policy's merge thresholds.
     */
    fc.assert(
      fc.property(
        validTablePolicy,
        partitionMetrics,
        partitionMetrics,
        (policy, leftMetrics, rightMetrics) => {
          const mockCache = createMockCache(policy);
          const service = new TablePolicyService({systemTableCache: mockCache});

          const shouldMerge = service.shouldMergePartitions(
            'partition-1', 'partition-2',
            leftMetrics, rightMetrics,
          );

          // Merge should occur if BOTH thresholds are satisfied
          const combinedStorage = leftMetrics.sizeBytes + rightMetrics.sizeBytes;
          const combinedTraffic = leftMetrics.queriesPerMinute + rightMetrics.queriesPerMinute;
          const expectedMerge = combinedStorage <= policy.mergeStorageThreshold &&
                               combinedTraffic <= policy.mergeTrafficThreshold;

          return shouldMerge === expectedMerge;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Merge decisions correctly apply policy thresholds');
    t.end();
  });


  t.test('replication settings follow table policy', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any table policy, replication settings should match the policy values.
     */
    fc.assert(
      fc.property(
        validTablePolicy,
        (policy) => {
          const mockCache = createMockCache(policy);
          const service = new TablePolicyService({systemTableCache: mockCache});

          const settings = service.getReplicationSettings('table-1');

          return settings.replicaCount === policy.replicaCount &&
                 settings.minReplicaCount === policy.minReplicaCount &&
                 settings.maxReplicaCount === policy.maxReplicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Replication settings match policy values');
    t.end();
  });

  t.test('policy validation ensures odd replica counts', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any replica count, validation should reject even numbers.
     */
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 100}).filter((n) => n % 2 === 0),
        (evenCount) => {
          const service = new TablePolicyService();
          const result = service.validatePolicy({replicaCount: evenCount});

          // Even replica counts should fail validation
          return !result.valid &&
                 result.errors.some((e) => e.includes('odd'));
        },
      ),
      {numRuns: 10},
    );
    t.pass('Even replica counts are rejected');
    t.end();
  });

  t.test('policy validation ensures min <= max replica count', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any min and max replica counts, validation should reject min > max.
     */
    fc.assert(
      fc.property(
        oddReplicaCount,
        oddReplicaCount,
        (min, max) => {
          const service = new TablePolicyService();
          const result = service.validatePolicy({
            minReplicaCount: min,
            maxReplicaCount: max,
          });

          if (min > max) {
            // Should fail validation
            return !result.valid &&
                   result.errors.some((e) => e.includes('greater'));
          }
          // Should pass validation (for this specific check)
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('min > max replica count is rejected');
    t.end();
  });

  t.test('policy merging preserves custom values', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any partial policy, merging with defaults should preserve custom values.
     */
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        oddReplicaCount,
        storageThreshold,
        (includeReplica, includeStorage, replicaCount, storageThresh) => {
          // Build partial policy without undefined values
          const partialPolicy = {};
          if (includeReplica) {
            partialPolicy.replicaCount = replicaCount;
          }
          if (includeStorage) {
            partialPolicy.splitStorageThreshold = storageThresh;
          }

          const service = new TablePolicyService();
          const merged = service.mergeWithDefaults(partialPolicy);

          // Custom values should be preserved
          if (includeReplica) {
            if (merged.replicaCount !== replicaCount) {
              return false;
            }
          }
          if (includeStorage) {
            if (merged.splitStorageThreshold !== storageThresh) {
              return false;
            }
          }

          // Default values should fill in missing fields
          if (!includeReplica) {
            if (merged.replicaCount !== DEFAULT_TABLE_POLICY.replicaCount) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Policy merging preserves custom values and fills defaults');
    t.end();
  });

  t.test('split threshold comparison is consistent', async (t) => {
    /**
     * Feature: distributed-database-system, Property 16: Table Policy Application
     * For any metrics at exactly the threshold, split should be triggered.
     */
    fc.assert(
      fc.property(
        storageThreshold,
        trafficThreshold,
        (storageThresh, trafficThresh) => {
          const policy = {
            ...DEFAULT_TABLE_POLICY,
            splitStorageThreshold: storageThresh,
            splitTrafficThreshold: trafficThresh,
          };
          const mockCache = createMockCache(policy);
          const service = new TablePolicyService({systemTableCache: mockCache});

          // At exactly the threshold, should split
          const atStorageThreshold = service.shouldSplitPartition('partition-1', {
            sizeBytes: storageThresh,
            queriesPerMinute: 0,
          });

          const atTrafficThreshold = service.shouldSplitPartition('partition-1', {
            sizeBytes: 0,
            queriesPerMinute: trafficThresh,
          });

          // Just below threshold, should not split
          const belowStorageThreshold = service.shouldSplitPartition('partition-1', {
            sizeBytes: storageThresh - 1,
            queriesPerMinute: 0,
          });

          const belowTrafficThreshold = service.shouldSplitPartition('partition-1', {
            sizeBytes: 0,
            queriesPerMinute: trafficThresh - 1,
          });

          return atStorageThreshold === true &&
                 atTrafficThreshold === true &&
                 belowStorageThreshold === false &&
                 belowTrafficThreshold === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Split threshold comparison is consistent at boundaries');
    t.end();
  });

  t.end();
});
