// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {
  CDC_SUBSCRIPTION_STATUS,
} from '../../src/bootstrap/node-joining-constants.js';

const TEST_NODE_ID_1 = 'node-diag-1';
const TEST_NODE_ID_2 = 'node-diag-2';
const TEST_NODE_ID_3 = 'node-diag-3';
const TEST_NODE_ID_4 = 'node-diag-4';
const TEST_CYCLE_COUNT = 1;
const TEST_TABLE_NAME = 'services';

describe('AdminWebSocketAPI service diagnostics route', () => {
  it('returns unified lifecycle diagnostics when provider is configured',
    async () => {
      const api = new AdminWebSocketAPI({
        nodeId: TEST_NODE_ID_1,
        serviceDiagnosticsProvider: () => ({
          reconciler: {
            stats: {cycleCount: TEST_CYCLE_COUNT},
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
        assert.equal(body.nodeId, TEST_NODE_ID_1);
        assert.equal(
          body.diagnostics.reconciler.stats.cycleCount,
          TEST_CYCLE_COUNT,
        );
        assert.equal(
          body.diagnostics.lifecycle.adapterSelections
            .adapters[0].serviceType,
          'partition',
        );
      } finally {
        await api.shutdown();
      }
    });

  it('returns service unavailable when diagnostics provider is missing',
    async () => {
      const api = new AdminWebSocketAPI({
        nodeId: TEST_NODE_ID_2,
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

  it('includes cdcSubscriptionStatus when provider returns it',
    async () => {
      const cdcStatus = {
        active: true,
        tables: [
          {
            tableName: TEST_TABLE_NAME,
            status: CDC_SUBSCRIPTION_STATUS.SUBSCRIBED,
          },
        ],
        eventTypes: {insert: 1, update: 1, delete: 1, upsert: 1},
      };

      const api = new AdminWebSocketAPI({
        nodeId: TEST_NODE_ID_3,
        serviceDiagnosticsProvider: () => ({
          lifecycle: null,
          reconciler: null,
          resources: null,
          cdcSubscriptionStatus: cdcStatus,
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
        assert.equal(body.nodeId, TEST_NODE_ID_3);
        assert.deepStrictEqual(
          body.diagnostics.cdcSubscriptionStatus,
          cdcStatus,
        );
        assert.equal(
          body.diagnostics.cdcSubscriptionStatus.active,
          true,
        );
        assert.equal(
          body.diagnostics.cdcSubscriptionStatus.tables[0].status,
          CDC_SUBSCRIPTION_STATUS.SUBSCRIBED,
        );
      } finally {
        await api.shutdown();
      }
    });

  it('returns null cdcSubscriptionStatus when owner lacks the method',
    async () => {
      const api = new AdminWebSocketAPI({
        nodeId: TEST_NODE_ID_4,
        serviceDiagnosticsProvider: () => ({
          lifecycle: {metrics: {}},
          reconciler: null,
          resources: null,
          cdcSubscriptionStatus: null,
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
        assert.equal(body.nodeId, TEST_NODE_ID_4);
        assert.equal(
          body.diagnostics.cdcSubscriptionStatus,
          null,
        );
        assert.ok(
          body.diagnostics.lifecycle !== null,
          'lifecycle diagnostics still present',
        );
      } finally {
        await api.shutdown();
      }
    });
});
