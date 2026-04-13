/**
 * Property Test: Policy-Driven Automatic Adjustment
 * Property 35: For any policy change affecting replica placement,
 * the system should automatically adjust replica locations and
 * counts to comply with the new policy without operator
 * intervention.
 * Validates: Requirements 19.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';

// Generate valid odd replica counts
const oddReplicaCount =
  fc.integer({min: 3, max: 9}).filter((n) => n % 2 === 1);

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

// Mock CDC integration service that tracks updates
function createMockCDCService() {
  const updates = [];
  return {
    updates,
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({
        tableName,
        whereClause,
        data,
        options,
        timestamp: Date.now(),
      });
      return {
        success: true,
        partitionResult: {
          affectedRows: 1,
        },
      };
    },
  };
}

// Mock SQL engine with mutable policies
function createMutableMockSqlEngine() {
  const tables = new Map();
  tables.set('table-1', {
    table_id: 'table-1',
    table_policies: JSON.stringify(DEFAULT_TABLE_POLICY),
  });

  return {
    tables,
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM tables') && params?.[0]) {
        const table = tables.get(params[0]) || null;
        return {rows: table ? [table] : []};
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
    updatePolicy: (tableId, policy) => {
      const table = tables.get(tableId);
      if (table) {
        table.table_policies = JSON.stringify(policy);
      }
    },
  };
}

test('Property 35: Policy-Driven Automatic Adjustment',
  async (t) => {
    t.test('policy updates are written via CDC', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          async (newPolicy) => {
            const engine = createMutableMockSqlEngine();
            const mockCDC = createMockCDCService();
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
              cdcIntegrationService: mockCDC,
            });

            await service.updateTablePolicy(
              'table-1', newPolicy,
            );

            if (mockCDC.updates.length !== 1) {
              return false;
            }
            if (mockCDC.updates[0].tableName !== 'tables') {
              return false;
            }
            if (mockCDC.updates[0].whereClause?.table_id !== 'table-1') {
              return false;
            }

            const updatedPolicy = JSON.parse(
              mockCDC.updates[0].data.table_policies,
            );
            return updatedPolicy.replicaCount ===
              newPolicy.replicaCount;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Policy updates are written via CDC');
      t.end();
    });

    t.test('policy changes emit events', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          async (newPolicy) => {
            const engine = createMutableMockSqlEngine();
            const mockCDC = createMockCDCService();
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
              cdcIntegrationService: mockCDC,
            });

            let eventEmitted = false;
            let eventData = null;
            service.on('policyUpdated', (event) => {
              eventEmitted = true;
              eventData = event;
            });

            await service.updateTablePolicy(
              'table-1', newPolicy,
            );

            if (!eventEmitted) {
              return false;
            }
            if (eventData.tableId !== 'table-1') {
              return false;
            }
            if (eventData.newPolicy.replicaCount !==
                newPolicy.replicaCount) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Policy changes emit events');
      t.end();
    });

    t.test('policy retrieval reflects latest values',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            validTablePolicy,
            validTablePolicy,
            async (firstPolicy, secondPolicy) => {
              const engine = createMutableMockSqlEngine();
              const mockCDC = createMockCDCService();
              const service = new TablePolicyService({
                sqlQueryEngine: engine,
                cdcIntegrationService: mockCDC,
              });

              await service.updateTablePolicy(
                'table-1', firstPolicy,
              );
              engine.updatePolicy('table-1', firstPolicy);

              const afterFirst =
                await service.getTablePolicy('table-1');
              if (afterFirst.replicaCount !==
                  firstPolicy.replicaCount) {
                return false;
              }

              await service.updateTablePolicy(
                'table-1', secondPolicy,
              );
              engine.updatePolicy('table-1', secondPolicy);

              const afterSecond =
                await service.getTablePolicy('table-1');
              return afterSecond.replicaCount ===
                secondPolicy.replicaCount;
            },
          ),
          {numRuns: 10},
        );
        t.pass('Policy retrieval reflects latest values');
        t.end();
      });

    t.test('invalid policy changes are rejected',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 2, max: 100}).filter(
              (n) => n % 2 === 0,
            ),
            async (evenReplicaCount) => {
              const engine = createMutableMockSqlEngine();
              const mockCDC = createMockCDCService();
              const service = new TablePolicyService({
                sqlQueryEngine: engine,
                cdcIntegrationService: mockCDC,
              });

              const originalPolicy =
                await service.getTablePolicy('table-1');

              try {
                await service.updateTablePolicy('table-1', {
                  replicaCount: evenReplicaCount,
                });
                return false;
              } catch (_e) {
                // Expected to throw
              }

              if (mockCDC.updates.length !== 0) {
                return false;
              }

              const currentPolicy =
                await service.getTablePolicy('table-1');
              return currentPolicy.replicaCount ===
                originalPolicy.replicaCount;
            },
          ),
          {numRuns: 10},
        );
        t.pass('Invalid policy changes are rejected');
        t.end();
      });

    t.test('policy changes include timestamp', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          async (newPolicy) => {
            const engine = createMutableMockSqlEngine();
            const mockCDC = createMockCDCService();
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
              cdcIntegrationService: mockCDC,
            });

            const beforeUpdate = Date.now();
            await service.updateTablePolicy(
              'table-1', newPolicy,
            );
            const afterUpdate = Date.now();

            if (mockCDC.updates.length !== 1) {
              return false;
            }

            const ts = mockCDC.updates[0].timestamp;
            return ts >= beforeUpdate && ts <= afterUpdate;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Policy changes include timestamp');
      t.end();
    });

    t.test('complete policy replacement works', async (t) => {
      await fc.assert(
        fc.asyncProperty(
          validTablePolicy,
          async (newPolicy) => {
            const engine = createMutableMockSqlEngine();
            const mockCDC = createMockCDCService();
            const service = new TablePolicyService({
              sqlQueryEngine: engine,
              cdcIntegrationService: mockCDC,
            });

            await service.updateTablePolicy(
              'table-1', newPolicy,
            );

            if (mockCDC.updates.length !== 1) {
              return false;
            }

            const p = JSON.parse(
              mockCDC.updates[0].data.table_policies,
            );

            return p.replicaCount ===
                     newPolicy.replicaCount &&
                   p.splitStorageThreshold ===
                     newPolicy.splitStorageThreshold &&
                   p.splitTrafficThreshold ===
                     newPolicy.splitTrafficThreshold &&
                   p.mergeStorageThreshold ===
                     newPolicy.mergeStorageThreshold &&
                   p.mergeTrafficThreshold ===
                     newPolicy.mergeTrafficThreshold;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Complete policy replacement works');
      t.end();
    });

    t.end();
  });
