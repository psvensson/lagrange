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
