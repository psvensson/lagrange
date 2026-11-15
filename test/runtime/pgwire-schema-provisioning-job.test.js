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

test(
  'active schema job without retryAfterMs projects unavailable instead of 0',
  async () => {
    const socket = new RecordingSocket();
    const handler = new PgWireProtocolHandler({
      adapter: {
        async execute() {
          return {
            success: true,
            provisioningDeadlineExpired: true,
            jobId: 'schema-job-order-line',
          };
        },
      },
      socket,
      logger: LOGGER,
    });
    handler._session = SESSION;

    await handler._executeAndSend(
      'CREATE TABLE order_line (ol_o_id INT PRIMARY KEY)',
      [],
    );

    assert.equal(socket.messages.length, 1);
    assert.equal(socket.messages[0][0], PG_BACKEND_MSG.ERROR_RESPONSE);
    assert.ok(socket.messages[0].includes(Buffer.from(JSON.stringify({
      provisioning_job_id: 'schema-job-order-line',
      retry_after_ms: 'unavailable',
    }))));
  },
);

test(
  'distributed participant failure projects firstFailedParticipant detail ' +
  'on PG-wire ErrorResponse',
  async () => {
    const socket = new RecordingSocket();
    const firstFailedParticipant = {
      partitionId: 'tbl-order_line-p1',
      error: 'Partition service not found: tbl-order_line-p1',
      failureReason: 'PARTITION_UNAVAILABLE',
    };
    const handler = new PgWireProtocolHandler({
      adapter: {
        async execute() {
          return {
            success: false,
            errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
            error: 'Distributed operation failed due to participant failures',
            statementType: 'SELECT',
            participantFailures: [firstFailedParticipant],
            firstFailedParticipant,
          };
        },
      },
      socket,
      logger: LOGGER,
    });
    handler._session = SESSION;

    await handler._executeAndSend(
      'SELECT COUNT(*) AS row_count FROM order_line',
      [],
    );

    assert.equal(socket.messages.length, 1);
    assert.equal(socket.messages[0][0], PG_BACKEND_MSG.ERROR_RESPONSE);
    assert.ok(socket.messages[0].includes(Buffer.from(JSON.stringify({
      participantFailuresOmittedCount: 0,
      firstFailedParticipant,
    }))));
  },
);
