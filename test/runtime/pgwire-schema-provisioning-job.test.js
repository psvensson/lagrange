import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {
  PgWireProtocolHandler,
  buildErrorResponse,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_ERROR_CODE,
  PG_SEVERITY,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';

class RecordingSocket extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
  }

  write(message) {
    this.messages.push(Buffer.from(message));
    return true;
  }

  end() {}
  destroy() {}
}

const SESSION = Object.freeze({
  sessionId: 'pg-schema-job-session',
  getTransactionState: () => PG_TRANSACTION_STATE.IDLE,
  setTransactionState() {},
});

const LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

test('active schema job projects retryable PostgreSQL structured detail',
  async () => {
    const socket = new RecordingSocket();
    const handler = new PgWireProtocolHandler({
      adapter: {
        async execute() {
          return {
            success: true,
            provisioningDeadlineExpired: true,
            jobId: 'schema-job-users',
            retryAfterMs: 250,
          };
        },
      },
      socket,
      logger: LOGGER,
    });
    handler._session = SESSION;

    await handler._executeAndSend('CREATE TABLE users (id TEXT PRIMARY KEY)', []);

    assert.equal(socket.messages.length, 1);
    assert.equal(socket.messages[0][0], PG_BACKEND_MSG.ERROR_RESPONSE);
    assert.ok(socket.messages[0].includes(Buffer.from(
      PG_ERROR_CODE.LOCK_NOT_AVAILABLE,
    )));
    assert.ok(socket.messages[0].includes(Buffer.from(JSON.stringify({
      provisioning_job_id: 'schema-job-users',
      retry_after_ms: 250,
    }))));
    assert.equal(
      socket.messages.some((message) =>
        message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE),
      false,
    );
  });

test('error response encodes object detail as JSON', () => {
  const detail = {provisioning_job_id: 'schema-job-users', retry_after_ms: 250};
  const message = buildErrorResponse(
    PG_SEVERITY.ERROR,
    PG_ERROR_CODE.LOCK_NOT_AVAILABLE,
    'Schema provisioning remains active',
    detail,
  );
  assert.ok(message.includes(Buffer.from(JSON.stringify(detail))));
});
