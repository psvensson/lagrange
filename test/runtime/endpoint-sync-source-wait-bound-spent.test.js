/**
 * Spent-wait witness for the runtime endpoint-sync source: a query whose
 * admin stream never answers logs exactly one wait_bound_spent ERROR per
 * timed-out attempt (with the socket phase it reached), the exhausted retry
 * loop logs one more, a query that is answered logs none, and the typed
 * timeout / source-query errors are unchanged.
 */

import {EventEmitter} from 'node:events';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  EndpointSyncSourceClient,
  EndpointSyncSourceQueryError,
  EndpointSyncSourceTimeoutError,
} from '../../src/runtime/endpoint-sync-source-client.js';
import {ADMIN_MESSAGE_TYPE} from '../../src/admin/admin-constants.js';

const STREAM_URL = 'ws://127.0.0.1:8081/api/admin/stream';


function createSocketClass(onSend) {
  return class FakeSocket extends EventEmitter {
    constructor() {
      super();
      setImmediate(() => this.emit('open'));
    }

    send(payload) {
      onSend(this, JSON.parse(payload));
    }

    close() {}
  };
}

test('a source query the stream never answers logs one wait_bound_spent ' +
  'ERROR and still rejects with the typed timeout error', async (t) => {
  const capture = captureLogger();
  const client = new EndpointSyncSourceClient({
    WebSocketImpl: createSocketClass(() => {}),
    logger: capture.logger,
  });

  let rejected = null;
  try {
    await client._executeQueryOnce({
      adminStreamUrl: STREAM_URL,
      adminAuthToken: null,
      sql: 'SELECT 1',
      params: [],
      timeoutMs: 5,
    });
  } catch (error) {
    rejected = error;
  }

  t.ok(rejected instanceof EndpointSyncSourceTimeoutError);
  t.equal(capture.errors().length, 1, 'exactly one ERROR');
  const context = capture.spent()[0].context;
  t.equal(context.wait, 'ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS');
  t.equal(context.boundMs, 5);
  t.same(context.lastObserved, {phase: 'query_sent'});
  t.equal(context.scope.adminStreamUrl, STREAM_URL);
  t.end();
});

test('an exhausted source retry loop logs its own wait_bound_spent ERROR ' +
  'and still throws the source-query error', async (t) => {
  const capture = captureLogger();
  const client = new EndpointSyncSourceClient({
    WebSocketImpl: createSocketClass((socket) => {
      setImmediate(() => socket.emit('error', new Error('always-fail')));
    }),
    logger: capture.logger,
  });

  let rejected = null;
  try {
    await client.fetchEndpointRows({
      adminStreamUrl: STREAM_URL,
      maxRetries: 1,
      retryDelayMs: 1,
      timeoutMs: 1000,
    });
  } catch (error) {
    rejected = error;
  }

  t.ok(rejected instanceof EndpointSyncSourceQueryError);
  t.equal(capture.errors().length, 1, 'exactly one ERROR');
  const context = capture.spent()[0].context;
  t.equal(context.wait, 'ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES');
  t.equal(context.lastObserved.attempts, 2);
  t.ok(context.lastObserved.lastError, 'names the last failure');
  t.end();
});

test('an answered source query logs no wait_bound_spent ERROR',
  async (t) => {
    const capture = captureLogger();
    const client = new EndpointSyncSourceClient({
      WebSocketImpl: createSocketClass((socket, query) => {
        setImmediate(() => socket.emit('message', Buffer.from(JSON.stringify({
          type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
          queryId: query.queryId,
          results: [{one: 1}],
        }))));
      }),
      logger: capture.logger,
    });

    const rows = await client._executeQueryOnce({
      adminStreamUrl: STREAM_URL,
      adminAuthToken: null,
      sql: 'SELECT 1',
      params: [],
      timeoutMs: 1000,
    });

    t.same(rows, [{one: 1}]);
    t.equal(capture.errors().length, 0);
    t.end();
  });
