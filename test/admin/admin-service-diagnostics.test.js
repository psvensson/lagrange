import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';

describe('AdminWebSocketAPI service diagnostics route', () => {
  it('returns unified lifecycle diagnostics when provider is configured', async () => {
    const api = new AdminWebSocketAPI({
      nodeId: 'node-diag-1',
      serviceDiagnosticsProvider: () => ({
        reconciler: {
          stats: {cycleCount: 1},
          recentDecisions: [],
        },
        lifecycle: {
          adapterSelections: {
            adapters: [{serviceType: 'partition'}],
          },
        },
      }),
      enableAdminStream: false,
    });

    await api.initialize(0, {listen: false});
    try {
      const response = await api.getFastify().inject({
        method: 'GET',
        url: ADMIN_ROUTE.SERVICE_DIAGNOSTICS,
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.nodeId, 'node-diag-1');
      assert.equal(body.diagnostics.reconciler.stats.cycleCount, 1);
      assert.equal(
        body.diagnostics.lifecycle.adapterSelections.adapters[0].serviceType,
        'partition',
      );
    } finally {
      await api.shutdown();
    }
  });

  it('returns service unavailable when diagnostics provider is missing', async () => {
    const api = new AdminWebSocketAPI({
      nodeId: 'node-diag-2',
      enableAdminStream: false,
    });

    await api.initialize(0, {listen: false});
    try {
      const response = await api.getFastify().inject({
        method: 'GET',
        url: ADMIN_ROUTE.SERVICE_DIAGNOSTICS,
      });

      assert.equal(response.statusCode, 503);
      const body = response.json();
      assert.equal(
        body.error,
        'Service lifecycle diagnostics provider is not available',
      );
    } finally {
      await api.shutdown();
    }
  });
});
