/**
 * Quest serve-eligibility-committed-epoch-read, attempt 2 (provisioning / F10).
 *
 * Below quorum, CREATE TABLE answers engine error PROVISIONING_UNAVAILABLE
 * mapped to SQLSTATE 57P03 (CANNOT_CONNECT_NOW) carrying {epoch, reasons, retryAfterMs}.
 *
 * At quorum minimum but below RF, CREATE TABLE answers contractState 'under_replicated'
 * and surfaces a NoticeResponse to the client before CommandComplete.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {
  PgWireProtocolHandler,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {OWNER_CONTRACT_STATE} from '../../src/control-plane/owner-contract-outcome.js';

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
  sessionId: 'pg-provisioning-session',
  getTransactionState: () => PG_TRANSACTION_STATE.IDLE,
  setTransactionState() {},
});

const LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

test('below quorum CREATE TABLE surfaces SQLSTATE 57P03 PROVISIONING_UNAVAILABLE', async () => {
  const socket = new RecordingSocket();
  const epoch = {publicationEpoch: 3, publicationId: 'pub-3'};
  const reasons = ['ready_lease_expired'];
  const handler = new PgWireProtocolHandler({
    adapter: {
      async execute() {
        const error = new Error('Provisioning unavailable: quorum not reachable');
        error.code = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.errorCode = QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE;
        error.epoch = epoch;
        error.reasons = reasons;
        error.retryAfterMs = 500;
        error.detail = {
          epoch,
          reasons,
          retryAfterMs: 500,
        };
        throw error;
      },
    },
    socket,
    logger: LOGGER,
  });
  handler._session = SESSION;

  await handler._executeAndSend('CREATE TABLE users (id TEXT PRIMARY KEY)', []);

  assert.equal(socket.messages.length, 1);
  assert.equal(socket.messages[0][0], PG_BACKEND_MSG.ERROR_RESPONSE);
  // SQLSTATE 57P03
  assert.ok(socket.messages[0].includes(Buffer.from('57P03')),
    'must contain SQLSTATE 57P03');
  assert.equal(
    socket.messages.some((message) =>
      message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE),
    false,
  );
});

test('quorum reached below RF surfaces NoticeResponse for under_replicated outcome', async () => {
  const socket = new RecordingSocket();
  const epoch = {publicationEpoch: 3, publicationId: 'pub-3'};
  const handler = new PgWireProtocolHandler({
    adapter: {
      async execute() {
        return {
          success: true,
          operation: 'CREATE_TABLE',
          statementType: 'CREATE_TABLE',
          contractState: OWNER_CONTRACT_STATE.UNDER_REPLICATED,
          epoch,
          requestedReplicaCount: 3,
          committedReplicaCount: 2,
          missingReplicaCount: 1,
        };
      },
    },
    socket,
    logger: LOGGER,
  });
  handler._session = SESSION;

  await handler._executeAndSend('CREATE TABLE users (id TEXT PRIMARY KEY)', []);

  const noticeMessages = socket.messages.filter(
    (message) => message[0] === PG_BACKEND_MSG.NOTICE_RESPONSE,
  );
  assert.equal(noticeMessages.length, 1, 'must emit exactly one NoticeResponse');
  assert.ok(noticeMessages[0].includes(Buffer.from('under_replicated')),
    'notice must state under_replicated');
  const commandComplete = socket.messages.find(
    (message) => message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE,
  );
  assert.ok(commandComplete, 'must complete command');
});
