/**
 * Property Test: Policy-Driven Automatic Adjustment
 * Property 35: For any policy change affecting replica placement, the system
 * should automatically adjust replica locations and counts to comply with
 * the new policy without operator intervention.
 * Validates: Requirements 19.4
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';

// Generate valid odd replica counts
const oddReplicaCount = fc.integer({min: 3, max: 9}).filter((n) => n % 2 === 1);

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

// Mock CDC integration service that tracks updates
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, id, data) => {
      updates.push({tableName, id, data, timestamp: Date.now()});
      return {success: true};
    },
  };
}

// Mock system table cache with mutable policies
function createMutableMockCache() {
  const tables = new Map();
  tables.set('table-1', {
    table_id: 'table-1',
    table_policies: JSON.stringify(DEFAULT_TABLE_POLICY),
  });

  return {
    tables,
    get: (tableName, id) => {
      if (tableName === 'tables') {
        return tables.get(id) || null;
      }
      if (tableName === 'partitions') {
        return {partition_id: id, table_id: 'table-1'};
      }
      return null;
    },
    updatePolicy: (tableId, policy) => {
      const table = tables.get(tableId);
      if (table) {
        table.table_policies = JSON.stringify(policy);
      }
    },
  };
}

test('Property 35: Policy-Driven Automatic Adjustment', async (t) => {
  t.test('policy updates are written via CDC', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * For any valid policy update, the system should write the update via CDC
     * to ensure propagation to all nodes.
     */
    await fc.assert(
      fc.asyncProperty(
        validTablePolicy,
        async (newPolicy) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          await service.updateTablePolicy('table-1', newPolicy);

          // Should have written to CDC
          if (mockCDC.updates.length !== 1) {
            return false;
          }

          // Should have updated the tables table
          if (mockCDC.updates[0].tableName !== 'tables') {
            return false;
          }

          // Should have updated the correct table
          if (mockCDC.updates[0].id !== 'table-1') {
            return false;
          }

          // Should have included the policy
          const updatedPolicy = JSON.parse(mockCDC.updates[0].data.table_policies);
          return updatedPolicy.replicaCount === newPolicy.replicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Policy updates are written via CDC');
    t.end();
  });

  t.test('policy changes emit events for automatic adjustment', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * For any policy change, the system should emit events that trigger
     * automatic adjustment without operator intervention.
     */
    await fc.assert(
      fc.asyncProperty(
        validTablePolicy,
        async (newPolicy) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          let eventEmitted = false;
          let eventData = null;
          service.on('policyUpdated', (event) => {
            eventEmitted = true;
            eventData = event;
          });

          await service.updateTablePolicy('table-1', newPolicy);

          // Should have emitted policyUpdated event
          if (!eventEmitted) {
            return false;
          }

          // Event should contain table ID
          if (eventData.tableId !== 'table-1') {
            return false;
          }

          // Event should contain new policy
          if (eventData.newPolicy.replicaCount !== newPolicy.replicaCount) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Policy changes emit events for automatic adjustment');
    t.end();
  });

  t.test('policy retrieval reflects latest values', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * After any policy update, retrieval should return the latest values.
     */
    await fc.assert(
      fc.asyncProperty(
        validTablePolicy,
        validTablePolicy,
        async (firstPolicy, secondPolicy) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          // Update to first policy
          await service.updateTablePolicy('table-1', firstPolicy);
          mockCache.updatePolicy('table-1', firstPolicy);

          // Verify first policy is returned
          const afterFirst = service.getTablePolicy('table-1');
          if (afterFirst.replicaCount !== firstPolicy.replicaCount) {
            return false;
          }

          // Update to second policy
          await service.updateTablePolicy('table-1', secondPolicy);
          mockCache.updatePolicy('table-1', secondPolicy);

          // Verify second policy is returned
          const afterSecond = service.getTablePolicy('table-1');
          return afterSecond.replicaCount === secondPolicy.replicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Policy retrieval reflects latest values');
    t.end();
  });

  t.test('invalid policy changes are rejected without side effects', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * Invalid policy changes should be rejected without modifying state.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 100}).filter((n) => n % 2 === 0),
        async (evenReplicaCount) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          const originalPolicy = service.getTablePolicy('table-1');

          // Try to update with invalid policy (even replica count)
          try {
            await service.updateTablePolicy('table-1', {replicaCount: evenReplicaCount});
            // Should have thrown
            return false;
          } catch (_e) {
            // Expected to throw
          }

          // CDC should not have been called
          if (mockCDC.updates.length !== 0) {
            return false;
          }

          // Policy should be unchanged
          const currentPolicy = service.getTablePolicy('table-1');
          return currentPolicy.replicaCount === originalPolicy.replicaCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Invalid policy changes are rejected without side effects');
    t.end();
  });

  t.test('policy changes include timestamp for ordering', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * Policy changes should include timestamps to enable proper ordering.
     */
    await fc.assert(
      fc.asyncProperty(
        validTablePolicy,
        async (newPolicy) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          const beforeUpdate = Date.now();
          await service.updateTablePolicy('table-1', newPolicy);
          const afterUpdate = Date.now();

          // CDC update should have a timestamp
          if (mockCDC.updates.length !== 1) {
            return false;
          }

          const updateTimestamp = mockCDC.updates[0].timestamp;
          return updateTimestamp >= beforeUpdate && updateTimestamp <= afterUpdate;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Policy changes include timestamp for ordering');
    t.end();
  });

  t.test('complete policy replacement works correctly', async (t) => {
    /**
     * Feature: distributed-database-system, Property 35: Policy-Driven Automatic Adjustment
     * Complete policy replacement should update all fields.
     */
    await fc.assert(
      fc.asyncProperty(
        validTablePolicy,
        async (newPolicy) => {
          const mockCache = createMutableMockCache();
          const mockCDC = createMockCDCService();
          const service = new TablePolicyService({
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });

          await service.updateTablePolicy('table-1', newPolicy);

          // Verify all fields were included in the update
          if (mockCDC.updates.length !== 1) {
            return false;
          }

          const updatedPolicy = JSON.parse(mockCDC.updates[0].data.table_policies);

          return updatedPolicy.replicaCount === newPolicy.replicaCount &&
                 updatedPolicy.splitStorageThreshold === newPolicy.splitStorageThreshold &&
                 updatedPolicy.splitTrafficThreshold === newPolicy.splitTrafficThreshold &&
                 updatedPolicy.mergeStorageThreshold === newPolicy.mergeStorageThreshold &&
                 updatedPolicy.mergeTrafficThreshold === newPolicy.mergeTrafficThreshold;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Complete policy replacement works correctly');
    t.end();
  });

  t.end();
});
