import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ERROR_MESSAGE} from '../../src/admin/admin-constants.js';

describe('admin WebSocket external bind policy', () => {
  it('rejects an external bind without explicit insecure trust', async () => {
    const api = new AdminWebSocketAPI({nodeId: 'external-bind-test'});
    await assert.rejects(
      api.initialize(0, {host: '0.0.0.0'}),
      new RegExp(
        ADMIN_ERROR_MESSAGE.EXTERNAL_BIND_REQUIRES_EXPLICIT_TRUST,
        'u',
      ),
    );
  });
});
