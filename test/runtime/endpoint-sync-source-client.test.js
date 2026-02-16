import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {
  EndpointSyncSourceClient,
  EndpointSyncSourceQueryError,
  EndpointSyncSourceTimeoutError,
  buildAuthHeaders,
  readQueryResultMessage,
} from '../../src/runtime/endpoint-sync-source-client.js';
import {ADMIN_MESSAGE_TYPE} from '../../src/admin/admin-constants.js';
import {EP_COL} from '../../src/wasm-service/service-endpoint-builder.js';

class MockWebSocket extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.sentMessages = [];
    this.closed = false;
    if (typeof MockWebSocket.onConstruct === 'function') {
      MockWebSocket.onConstruct(this);
    }
  }

  send(payload) {
    this.sentMessages.push(payload);
    if (typeof MockWebSocket.onSend === 'function') {
      MockWebSocket.onSend(this, payload);
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit('close');
  }
}

function resetMock() {
  MockWebSocket.onConstruct = null;
  MockWebSocket.onSend = null;
}

function createQueryResult(queryId, rows) {
  return {
    type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
    queryId,
    results: rows,
  };
}

describe('endpoint-sync-source-client', () => {
  it('buildAuthHeaders returns authorization header when token provided', () => {
    assert.deepEqual(buildAuthHeaders('abc'), {
      authorization: 'Bearer abc',
    });
    assert.deepEqual(buildAuthHeaders(null), {});
  });

  it('readQueryResultMessage returns done=true for matching query_result', () => {
    const result = readQueryResultMessage(
      createQueryResult('q-1', []),
      'q-1',
    );
    assert.equal(result.done, true);
    assert.deepEqual(result.rows, []);
  });

  it('readQueryResultMessage ignores other query ids', () => {
    const result = readQueryResultMessage(
      createQueryResult('q-2', []),
      'q-1',
    );
    assert.equal(result.done, false);
  });

  it('fetchEndpointRows resolves normalized rows from query_result', async () => {
    resetMock();
    MockWebSocket.onConstruct = (socket) => {
      setImmediate(() => socket.emit('open'));
    };
    MockWebSocket.onSend = (socket, payload) => {
      const query = JSON.parse(payload);
      const row = {
        [EP_COL.ENDPOINT_ID]: 'ep-1',
        [EP_COL.SERVICE_ID]: 'sys-postgres-wire',
        [EP_COL.NODE_ID]: 'node-1',
        [EP_COL.PROTOCOL]: 'postgresql',
        [EP_COL.ADDRESS]: '10.0.0.2',
        [EP_COL.PORT]: 5432,
        [EP_COL.HEALTH_STATUS]: 'healthy',
        [EP_COL.METADATA]: '{}',
        updated_at: 10,
      };
      const frame = createQueryResult(query.queryId, [row]);
      setImmediate(() => {
        socket.emit('message', Buffer.from(JSON.stringify(frame)));
      });
    };

    const client = new EndpointSyncSourceClient({
      WebSocketImpl: MockWebSocket,
    });

    const rows = await client.fetchEndpointRows({
      adminStreamUrl: 'ws://127.0.0.1:8081/api/admin/stream',
      healthyOnly: false,
      maxRetries: 0,
      timeoutMs: 100,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].endpointId, 'ep-1');
    assert.equal(rows[0].port, 5432);
  });

  it('fetchEndpointRows retries on failure and eventually succeeds', async () => {
    resetMock();
    let attempt = 0;

    MockWebSocket.onConstruct = (socket) => {
      setImmediate(() => socket.emit('open'));
    };
    MockWebSocket.onSend = (socket, payload) => {
      attempt += 1;
      if (attempt === 1) {
        setImmediate(() => socket.emit('error', new Error('first-failure')));
        return;
      }

      const query = JSON.parse(payload);
      const row = {
        [EP_COL.ENDPOINT_ID]: 'ep-2',
        [EP_COL.SERVICE_ID]: 'sys-postgres-wire',
        [EP_COL.NODE_ID]: 'node-2',
        [EP_COL.PROTOCOL]: 'postgresql',
        [EP_COL.ADDRESS]: '10.0.0.3',
        [EP_COL.PORT]: 5432,
        [EP_COL.HEALTH_STATUS]: 'healthy',
        [EP_COL.METADATA]: '{}',
        updated_at: 20,
      };
      const frame = createQueryResult(query.queryId, [row]);
      setImmediate(() => {
        socket.emit('message', Buffer.from(JSON.stringify(frame)));
      });
    };

    const client = new EndpointSyncSourceClient({
      WebSocketImpl: MockWebSocket,
    });

    const rows = await client.fetchEndpointRows({
      adminStreamUrl: 'ws://127.0.0.1:8081/api/admin/stream',
      healthyOnly: false,
      maxRetries: 1,
      retryDelayMs: 1,
      timeoutMs: 100,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].endpointId, 'ep-2');
    assert.equal(attempt, 2);
  });

  it('fetchEndpointRows throws after max retries', async () => {
    resetMock();
    MockWebSocket.onConstruct = (socket) => {
      setImmediate(() => socket.emit('open'));
    };
    MockWebSocket.onSend = (socket) => {
      setImmediate(() => socket.emit('error', new Error('always-fail')));
    };

    const client = new EndpointSyncSourceClient({
      WebSocketImpl: MockWebSocket,
    });

    await assert.rejects(
      client.fetchEndpointRows({
        adminStreamUrl: 'ws://127.0.0.1:8081/api/admin/stream',
        maxRetries: 1,
        retryDelayMs: 1,
        timeoutMs: 100,
      }),
      (error) => {
        assert.ok(error instanceof EndpointSyncSourceQueryError);
        return true;
      },
    );
  });

  it('execute query once throws timeout error when no response is received', async () => {
    resetMock();
    MockWebSocket.onConstruct = (socket) => {
      setImmediate(() => socket.emit('open'));
    };
    MockWebSocket.onSend = () => {
      // no response frame
    };

    const client = new EndpointSyncSourceClient({
      WebSocketImpl: MockWebSocket,
    });

    await assert.rejects(
      client._executeQueryOnce({
        adminStreamUrl: 'ws://127.0.0.1:8081/api/admin/stream',
        adminAuthToken: null,
        sql: 'SELECT 1',
        params: [],
        timeoutMs: 5,
      }),
      (error) => {
        assert.ok(error instanceof EndpointSyncSourceTimeoutError);
        return true;
      },
    );
  });
});
