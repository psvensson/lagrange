/**
 * Property Test: Table Policy Application
 * Property 16: For any partition operation (split, merge, replication),
 * the operation should follow the policies defined in the table's
 * configuration.
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';

// Generate valid odd replica counts
const oddReplicaCount =
  fc.integer({min: 1, max: 9}).filter((n) => n % 2 === 1);

// Generate valid storage thresholds (1MB to 100GB)
const storageThreshold =
  fc.integer({min: 1024 * 1024, max: 100 * 1024 * 1024 * 1024});

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

// Mock SQL query engine with configurable policies
function createMockSqlEngine(tablePolicy) {
  return {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM tables') &&
          params?.[0] === 'table-1') {
        return {
          rows: [{
            table_id: 'table-1',
            table_policies: JSON.stringify(tablePolicy),
          }],
        };
      }
      if (sql.includes('FROM partitions') && params?.[0]) {
        return {
          rows: [{
            partition_id: params[0],
            table_id: 'table-1',
          }],
        };
      }
      return {rows: []};
    },
  };
}

test('Property 16: Table Policy Application', async (t) => {
  t.test('split decisions follow table policy thresholds',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          partitionMetrics,
          async (policy, metrics) => {
            const engine = createMockSqlEngine(policy);
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
            });

            const shouldSplit =
              await service.shouldSplitPartition(
                'partition-1', metrics,
              );

            const expectedSplit =
              metrics.sizeBytes >=
                policy.splitStorageThreshold ||
              metrics.queriesPerMinute >=
                policy.splitTrafficThreshold;

            return shouldSplit === expectedSplit;
          },
        ),
        {numRuns: 10},
      );
      t.pass(
        'Split decisions correctly apply policy thresholds',
      );
      t.end();
    });

  t.test('merge decisions follow table policy thresholds',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          partitionMetrics,
          partitionMetrics,
          async (policy, leftMetrics, rightMetrics) => {
            const engine = createMockSqlEngine(policy);
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
            });

            const shouldMerge =
              await service.shouldMergePartitions(
                'partition-1', 'partition-2',
                leftMetrics, rightMetrics,
              );

            const combinedStorage =
              leftMetrics.sizeBytes + rightMetrics.sizeBytes;
            const combinedTraffic =
              leftMetrics.queriesPerMinute +
              rightMetrics.queriesPerMinute;
            const expectedMerge =
              combinedStorage <=
                policy.mergeStorageThreshold &&
              combinedTraffic <=
                policy.mergeTrafficThreshold;

            return shouldMerge === expectedMerge;
          },
        ),
        {numRuns: 10},
      );
      t.pass(
        'Merge decisions correctly apply policy thresholds',
      );
      t.end();
    });


  t.test('replication settings follow table policy',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          async (policy) => {
            const engine = createMockSqlEngine(policy);
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
            });

            const settings =
              await service.getReplicationSettings('table-1');

            return settings.replicaCount ===
                     policy.replicaCount &&
                   settings.minReplicaCount ===
                     policy.minReplicaCount &&
                   settings.maxReplicaCount ===
                     policy.maxReplicaCount;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Replication settings match policy values');
      t.end();
    });

  t.test('policy validation ensures odd replica counts',
    async (t) => {
      fc.assert(
        fc.property(
          fc.integer({min: 2, max: 100}).filter(
            (n) => n % 2 === 0,
          ),
          (evenCount) => {
            const service = new TablePolicyService();
            const result = service.validatePolicy({
              replicaCount: evenCount,
            });

            return !result.valid &&
                   result.errors.some((e) => e.includes('odd'));
          },
        ),
        {numRuns: 10},
      );
      t.pass('Even replica counts are rejected');
      t.end();
    });

  t.test('policy validation ensures min <= max replica count',
    async (t) => {
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
              return !result.valid &&
                result.errors.some(
                  (e) => e.includes('greater'),
                );
            }
            return true;
          },
        ),
        {numRuns: 10},
      );
      t.pass('min > max replica count is rejected');
      t.end();
    });

  t.test('policy merging preserves custom values', async (t) => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        oddReplicaCount,
        storageThreshold,
        (
          includeReplica, includeStorage,
          replicaCount, storageThresh,
        ) => {
          const partialPolicy = {};
          if (includeReplica) {
            partialPolicy.replicaCount = replicaCount;
          }
          if (includeStorage) {
            partialPolicy.splitStorageThreshold =
              storageThresh;
          }

          const service = new TablePolicyService();
          const merged =
            service.mergeWithDefaults(partialPolicy);

          if (includeReplica) {
            if (merged.replicaCount !== replicaCount) {
              return false;
            }
          }
          if (includeStorage) {
            if (merged.splitStorageThreshold !==
                storageThresh) {
              return false;
            }
          }

          if (!includeReplica) {
            if (merged.replicaCount !==
                DEFAULT_TABLE_POLICY.replicaCount) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass(
      'Policy merging preserves custom values and defaults',
    );
    t.end();
  });

  t.test('split threshold comparison is consistent',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          storageThreshold,
          trafficThreshold,
          async (storageThresh, trafficThresh) => {
            const policy = {
              ...DEFAULT_TABLE_POLICY,
              splitStorageThreshold: storageThresh,
              splitTrafficThreshold: trafficThresh,
            };
            const engine = createMockSqlEngine(policy);
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
            });

            const atStorage =
              await service.shouldSplitPartition(
                'partition-1', {
                  sizeBytes: storageThresh,
                  queriesPerMinute: 0,
                });

            const atTraffic =
              await service.shouldSplitPartition(
                'partition-1', {
                  sizeBytes: 0,
                  queriesPerMinute: trafficThresh,
                });

            const belowStorage =
              await service.shouldSplitPartition(
                'partition-1', {
                  sizeBytes: storageThresh - 1,
                  queriesPerMinute: 0,
                });

            const belowTraffic =
              await service.shouldSplitPartition(
                'partition-1', {
                  sizeBytes: 0,
                  queriesPerMinute: trafficThresh - 1,
                });

            return atStorage === true &&
                   atTraffic === true &&
                   belowStorage === false &&
                   belowTraffic === false;
          },
        ),
        {numRuns: 10},
      );
      t.pass(
        'Split threshold comparison is consistent',
      );
      t.end();
    });

  t.end();
});
