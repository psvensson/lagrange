import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {
  NODE_HEALTH_UNAVAILABLE_REASON,
  sharedNodeHealthBuffer,
} from '../../src/diagnostics/node-health-buffer.js';

const NODE_ID = 'node-health-route-1';

describe('AdminWebSocketAPI node health route', () => {
  it('answers this node\'s health slice from memory, with a named state per collector',
    async () => {
      const api = new AdminWebSocketAPI({nodeId: NODE_ID, enableAdminStream: false});
      await api.initialize(0, {listen: false});
      try {
        const before = await api.getFastify().inject({method: 'GET',
          url: ADMIN_ROUTE.NODE_HEALTH});
        assert.equal(before.statusCode, 200);
        assert.equal(before.json().nodeId, NODE_ID);
        // No diagnostics tick runs in this process: every collector says so.
        assert.equal(before.json().health.collectors.peerTraffic.reason,
          NODE_HEALTH_UNAVAILABLE_REASON.FEED_NOT_STARTED);

        const atMs = Date.now();
        sharedNodeHealthBuffer.tick(atMs);
        const after = await api.getFastify().inject({method: 'GET',
          url: `${ADMIN_ROUTE.NODE_HEALTH}?sinceMs=${atMs}`});
        const health = after.json().health;
        assert.equal(health.sinceMs, atMs);
        assert.equal(health.collectors.process.state, 'measured');
        assert.equal(health.collectors.process.raw.length, 1);
        assert.ok(health.retention.entryCapacity > 0);

        const later = await api.getFastify().inject({method: 'GET',
          url: `${ADMIN_ROUTE.NODE_HEALTH}?sinceMs=${atMs + 1}`});
        assert.equal(later.json().health.collectors.process.reason,
          NODE_HEALTH_UNAVAILABLE_REASON.NOTHING_SINCE);
      } finally {
        await api.shutdown();
      }
    });
});
