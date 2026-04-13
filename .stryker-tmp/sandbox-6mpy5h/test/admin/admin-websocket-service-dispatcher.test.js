// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  AdminWebSocketAPI,
  MessageType,
} from '../../src/admin/admin-websocket-api.js';

describe('AdminWebSocketAPI service-dispatch integration', () => {
  it(
    'translates query messages through ServiceDispatcher when configured',
    async () => {
      const dispatched = [];
      const sentMessages = [];

      const api = new AdminWebSocketAPI({
        nodeId: 'node-1',
        serviceDispatcher: {
          dispatch: async (envelope, context) => {
            dispatched.push({envelope, context});
            return {
              envelope,
              delivery: {
                acknowledged: true,
                payload: {
                  results: [{ok: true}],
                },
              },
            };
          },
        },
        enableAdminStream: false,
      });

      const clientInfo = {
        id: 'client-1',
        socket: {
          send: (json) => {
            sentMessages.push(JSON.parse(json));
          },
        },
      };

      api.handleMessage(clientInfo, JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-dispatch-1',
        sql: 'SELECT 1',
        params: [],
        traceId: 'trace-admin-1',
      }));

      await Promise.resolve();
      await Promise.resolve();

      assert.equal(dispatched.length, 1);
      assert.equal(dispatched[0].envelope.messageId, 'q-dispatch-1');
      assert.equal(dispatched[0].envelope.payload.sql, 'SELECT 1');
      assert.equal(dispatched[0].envelope.traceId, 'trace-admin-1');
      assert.equal(dispatched[0].context.traceId, 'trace-admin-1');
      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0].type, MessageType.QUERY_RESULT);
      assert.equal(sentMessages[0].queryId, 'q-dispatch-1');
      assert.deepEqual(sentMessages[0].results, [{ok: true}]);
    },
  );

  it('maps refresh dispatch responses to cache_dump envelopes', async () => {
    const sentMessages = [];

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      serviceDispatcher: {
        dispatch: async (envelope, _context) => ({
          envelope,
          delivery: {
            acknowledged: true,
            payload: {
              cacheDump: {
                services: [{service_id: 'svc-1'}],
              },
            },
          },
        }),
      },
      enableAdminStream: false,
    });

    const clientInfo = {
      id: 'client-1',
      socket: {
        send: (json) => {
          sentMessages.push(JSON.parse(json));
        },
      },
    };

    api.handleMessage(clientInfo, JSON.stringify({
      type: MessageType.REFRESH,
      traceId: 'trace-admin-refresh-1',
    }));

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].type, MessageType.CACHE_DUMP);
    assert.deepEqual(sentMessages[0].data.services, [{service_id: 'svc-1'}]);
  });
});
