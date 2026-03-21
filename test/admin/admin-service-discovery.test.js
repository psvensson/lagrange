import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';

test('AdminServiceDiscovery routes authoritative cache repair through the ' +
  'gateway instead of mutating the cache directly', async (t) => {
  const repairCalls = [];
  const discovery = new AdminServiceDiscovery({
    nodeId: 'node-a',
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    cacheMutationTarget: {
      applySystemTableChange() {
        throw new Error('service discovery must not mutate cache directly');
      },
    },
    controlPlaneSystemTableGateway: {
      reconcileAuthoritativeCacheRows(tableName, rows, options) {
        repairCalls.push({tableName, rows, options});
        return Promise.resolve({success: true, mutationCount: 3});
      },
    },
  });

  const mutationCount = await discovery.applyAuthoritativeSystemTableRows(
    TABLES.SERVICES,
    [{service_id: 'svc-1'}],
    'admin-discovery:test',
  );

  t.equal(mutationCount, 3, 'gateway-provided mutation count should propagate');
  t.equal(repairCalls.length, 1, 'service discovery should delegate once');
  t.equal(
    repairCalls[0].options.causeId,
    'admin-discovery:test',
    'service discovery should preserve the repair cause',
  );
});

test(
  'AdminServiceDiscovery does not report applied repair when any authoritative read fails',
  async (t) => {
    const reconcileCalls = [];
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          readCalls.push(tableName);
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              error: 'authoritative_services_unavailable',
            };
          }
          return {
            success: true,
            tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return {success: true, mutationCount: 1};
        },
      },
    });

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-partial-read-failure',
    });

    t.equal(repair.applied, false, 'repair should fail when any table read fails');
    t.equal(repair.tableCount, 0,
      'failed repair should not apply partial cache mutations');
    t.equal(
      Array.isArray(repair.failedTables) &&
        repair.failedTables.includes(TABLES.SERVICES),
      true,
      'failed table should be surfaced in repair diagnostics',
    );
    t.equal(reconcileCalls.length, 0,
      'repair should not mutate cache state after a read-stage failure');
    t.equal(readCalls.length > 0, true,
      'repair should attempt authoritative table reads through the gateway');
  },
);

test('AdminServiceDiscovery marks repair as applied only after all tables are reconciled',
  async (t) => {
    const reconcileCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          return {
            success: true,
            tableName: String(readIntent?.tableName || ''),
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return {success: true, mutationCount: 1};
        },
      },
    });

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-full-success',
    });

    t.equal(repair.applied, true,
      'repair should report applied only when all requested tables succeed');
    t.equal(
      repair.tableCount,
      repair.tableNames.length,
      'applied repair should report all reconciled tables',
    );
    t.equal(
      reconcileCalls.length,
      repair.tableNames.length,
      'applied repair should reconcile every requested table',
    );
  });
