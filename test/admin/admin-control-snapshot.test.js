import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import './admin-control-snapshot-publication-convergence-test-cases.js';
import './admin-control-snapshot-repair-handoff-outcome-test-cases.js';
import './admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js';
import {registerAdminControlSnapshotTailTests} from './admin-control-snapshot-tail-test-cases.js';

registerAdminControlSnapshotTailTests({
  test,
  TABLES,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
});

test('AdminControlSnapshot queries authoritative services and replica operations and updates cache', async (t) => {
  const cachedServices = [{service_id: 's-cached', state: 'active'}];
  const authoritativeServices = [{service_id: 's-auth', state: 'active'}];
  const cachedOps = [{operation_id: 'op-cached', state: 'active'}];
  const authoritativeOps = [{operation_id: 'op-auth', state: 'active'}];
  const cacheMutations = [];

  const cache = {
    getAll(table) {
      if (table === TABLES.SERVICES) return cachedServices;
      if (table === TABLES.REPLICA_OPERATIONS) return cachedOps;
      return [];
    },
  };
  const gateway = {
    async querySystemTable(tableName) {
      if (tableName === TABLES.SERVICES) return {rows: authoritativeServices};
      if (tableName === TABLES.REPLICA_OPERATIONS) return {rows: authoritativeOps};
      return {rows: []};
    },
    applySystemTableRowsToCache(target, tableName, rows) {
      cacheMutations.push({tableName, rows});
    },
  };

  const snapshot = new AdminControlSnapshot({
    systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway,
    nowFn: () => 1000,
  });

  const res = await snapshot.buildLocalControlSnapshot({});
  t.ok(res, 'should return control snapshot');
  t.equal(cacheMutations.length, 2, 'should apply services and operations to cache');
  t.equal(cacheMutations[0].tableName, TABLES.SERVICES);
  t.equal(cacheMutations[1].tableName, TABLES.REPLICA_OPERATIONS);
});

test('AdminControlSnapshot falls back to cached services and replica operations when querySystemTable fails', async (t) => {
  const cachedServices = [{service_id: 's-cached', state: 'active'}];
  const cachedOps = [{operation_id: 'op-cached', state: 'active'}];

  const cache = {
    getAll(table) {
      if (table === TABLES.SERVICES) return cachedServices;
      if (table === TABLES.REPLICA_OPERATIONS) return cachedOps;
      return [];
    },
  };
  const gateway = {
    async querySystemTable() {
      throw new Error('db unavailable');
    },
  };

  const snapshot = new AdminControlSnapshot({
    systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway,
    nowFn: () => 1000,
  });

  const res = await snapshot.buildLocalControlSnapshot({});
  t.ok(res, 'should fall back to cached services and operations');
});
