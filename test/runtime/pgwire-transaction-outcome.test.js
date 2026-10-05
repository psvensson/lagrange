/**
 * The PG-wire session's transaction state follows the engine's truth after
 * a failed statement (pgwire-transaction-outcome), and the handler answers
 * it on the wire: ROLLBACK/COMMIT with no transaction, a COMMIT of a
 * transaction the engine dropped, a COMMIT failure the engine still holds,
 * and a statement for a transaction the engine no longer holds.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  PgWireProtocolHandler,
  HANDLER_PHASE,
} from '../../src/runtime/pgwire-protocol-handler.js';
import {PgWireSession} from '../../src/runtime/pgwire-session.js';
import {resolveFailedStatementOutcome} from
  '../../src/runtime/pgwire-transaction-outcome.js';
import {
  PG_BACKEND_MSG,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';

const {IDLE, IN_TRANSACTION, FAILED} = PG_TRANSACTION_STATE;
const NO_TRANSACTION = 'NO_TRANSACTION';
const TRANSACTION_ID = 'tx-under-test';
const NOT_CONSULTED = () => {
  throw new Error('the engine truth must not be consulted here');
};

function outcome(stateBefore, statementType, failure, holds = NOT_CONSULTED) {
  return resolveFailedStatementOutcome({
    stateBefore, statementType, failure, engineHoldsTransaction: holds,
  });
}

describe('resolveFailedStatementOutcome', () => {
  it('ROLLBACK the engine answers NO_TRANSACTION ends the block', () => {
    const idle = outcome(IDLE, 'ROLLBACK', {errorCode: NO_TRANSACTION});
    assert.equal(idle.kind, 'complete');
    assert.equal(idle.tag, 'ROLLBACK');
    assert.equal(idle.state, IDLE);
    assert.equal(idle.warning.code, '25P01');
    for (const before of [IN_TRANSACTION, FAILED]) {
      const inBlock = outcome(before, 'ROLLBACK', {errorCode: NO_TRANSACTION});
      assert.equal(inBlock.tag, 'ROLLBACK');
      assert.equal(inBlock.state, IDLE);
      assert.equal(inBlock.warning, null, 'no warning inside a block');
    }
  });

  it('COMMIT while idle with no transaction answers COMMIT + WARNING', () => {
    const idle = outcome(IDLE, 'COMMIT', {errorCode: NO_TRANSACTION});
    assert.equal(idle.kind, 'complete');
    assert.equal(idle.tag, 'COMMIT');
    assert.equal(idle.state, IDLE);
    assert.equal(idle.warning.code, '25P01');
  });

  it('a COMMIT of a transaction the engine dropped: 25P04, nothing ' +
    'committed, idle', () => {
    for (const errorCode of [NO_TRANSACTION, 'TIMEOUT']) {
      const failed = outcome(IN_TRANSACTION, 'COMMIT', {errorCode,
        error: 'engine text'}, () => false);
      assert.equal(failed.kind, 'error');
      assert.equal(failed.sqlState, '25P04');
      assert.match(failed.message, /no changes were committed/u);
      assert.equal(failed.detail.engine_error_code, errorCode);
      assert.equal(failed.state, IDLE);
    }
  });

  it('a COMMIT failure the engine still holds leaves the block failed',
    () => {
      const held = outcome(IN_TRANSACTION, 'COMMIT', {
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE'}, () => true);
      assert.equal(held.kind, 'engine_error',
        'the engine error is answered as is');
      assert.equal(held.state, FAILED);
      const gone = outcome(IN_TRANSACTION, 'COMMIT', {
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE'}, () => false);
      assert.equal(gone.state, IDLE);
    });

  it('a failed ROLLBACK follows the engine', () => {
    assert.equal(outcome(FAILED, 'ROLLBACK', {errorCode: 'ROLLBACK_FAILED'},
      () => true).state, FAILED);
    assert.equal(outcome(FAILED, 'ROLLBACK', {errorCode: 'ROLLBACK_FAILED'},
      () => false).state, IDLE);
  });

  it('a statement for a transaction the engine no longer holds: 25P04 ' +
    'and the block is failed', () => {
    const refused = outcome(IN_TRANSACTION, 'INSERT', {
      errorCode: NO_TRANSACTION, error: 'transaction x is no longer active',
      transactionId: 'x'});
    assert.equal(refused.kind, 'error');
    assert.equal(refused.sqlState, '25P04');
    assert.equal(refused.message, 'transaction x is no longer active');
    assert.equal(refused.detail.transaction_id, 'x');
    assert.equal(refused.state, FAILED);
  });

  it('other failures: idle stays idle, a block becomes failed', () => {
    assert.deepEqual(outcome(IDLE, 'INSERT', {errorCode: 'SYNTAX_ERROR'}),
      {kind: 'engine_error', state: IDLE});
    assert.deepEqual(outcome(IN_TRANSACTION, null, {errorCode: 'X'}),
      {kind: 'engine_error', state: FAILED});
  });
});

// --- The handler answers the outcome on the wire ---

class RecordingSocket {
  constructor() {
    this.messages = [];
  }
  write(buffer) {
    for (let offset = 0; offset < buffer.length;) {
      const length = buffer.readInt32BE(offset + 1);
      this.messages.push({
        type: buffer[offset],
        body: buffer.subarray(offset + 5, offset + 1 + length),
      });
      offset += 1 + length;
    }
    return true;
  }
  on() {}
  removeListener() {}
  end() {}
  destroy() {}
  types() {
    return this.messages.map((message) => message.type);
  }
  /** Field values (by field byte) of the messages of one type. */
  fields(type) {
    return this.messages.filter((message) => message.type === type)
      .map((message) => {
        const values = {};
        let offset = 0;
        while (message.body[offset] !== 0) {
          const end = message.body.indexOf(0, offset + 1);
          values[String.fromCharCode(message.body[offset])] =
            message.body.subarray(offset + 1, end).toString('utf8');
          offset = end + 1;
        }
        return values;
      });
  }
  take() {
    const taken = this;
    this.messages = [];
    return taken;
  }
}

/** Engine stand-in answering each statement from a script. */
class ScriptedAdapter {
  constructor(answers) {
    this.answers = answers;
    this.executions = [];
  }
  async execute(sessionId, sql, params, options) {
    this.executions.push({sql, options});
    const answer = this.answers.shift();
    if (!answer) throw new Error(`no scripted answer for ${sql}`);
    return answer;
  }
  closeSession() {}
}

function startedHandler(answers) {
  const socket = new RecordingSocket();
  const adapter = new ScriptedAdapter(answers);
  const handler = new PgWireProtocolHandler({
    adapter, socket, logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  handler._session = new PgWireSession({sessionId: 'session-under-test'});
  handler._phase = HANDLER_PHASE.NORMAL;
  return {handler, socket, adapter};
}

async function query(handler, socket, text) {
  socket.take();
  await handler._handleSimpleQuery(Buffer.from(`${text}\0`, 'utf8'));
  const ready = socket.messages.filter((message) =>
    message.type === PG_BACKEND_MSG.READY_FOR_QUERY);
  return {
    types: socket.types(),
    errors: socket.fields(PG_BACKEND_MSG.ERROR_RESPONSE),
    notices: socket.fields(PG_BACKEND_MSG.NOTICE_RESPONSE),
    tags: socket.messages.filter((message) =>
      message.type === PG_BACKEND_MSG.COMMAND_COMPLETE)
      .map((message) => message.body.subarray(0, -1).toString('utf8')),
    status: String.fromCharCode(ready.at(-1).body[0]),
  };
}

const begun = {success: true, statementType: 'BEGIN_TRANSACTION',
  transactionId: TRANSACTION_ID};
const inserted = {success: true, statementType: 'INSERT', affectedRows: 1};
const noTransaction = (statementType, extra = {}) => ({
  success: false, errorCode: NO_TRANSACTION, error: 'No active transaction',
  statementType, ...extra,
});

describe('PgWireProtocolHandler follows the engine transaction truth', () => {
  it('ROLLBACK and COMMIT while idle: WARNING 25P01, the tag, idle',
    async () => {
      const {handler, socket} = startedHandler([
        noTransaction('ROLLBACK', {sessionTransactionActive: false}),
        noTransaction('COMMIT', {sessionTransactionActive: false}),
      ]);
      for (const [text, tag] of [['ROLLBACK', 'ROLLBACK'],
        ['COMMIT', 'COMMIT']]) {
        const answer = await query(handler, socket, text);
        assert.deepEqual(answer.errors, [], `${text}: no ErrorResponse`);
        assert.deepEqual(answer.tags, [tag]);
        assert.deepEqual(answer.notices.map((notice) => [notice.S, notice.C]),
          [['WARNING', '25P01']]);
        assert.equal(answer.status, 'I');
      }
    });

  it('every statement of a block is sent for the BEGIN\'s transaction',
    async () => {
      const {handler, socket, adapter} = startedHandler([
        begun, inserted, {success: true, statementType: 'COMMIT'},
        {success: true, statementType: 'SELECT', rows: []},
      ]);
      await query(handler, socket, 'BEGIN');
      await query(handler, socket, 'INSERT INTO t (id) VALUES (1)');
      await query(handler, socket, 'COMMIT');
      await query(handler, socket, 'SELECT 1');
      assert.deepEqual(adapter.executions.map((entry) => entry.options), [
        {},
        {expectedTransactionId: TRANSACTION_ID},
        {expectedTransactionId: TRANSACTION_ID},
        {},
      ]);
    });

  it('a COMMIT of a dropped transaction: 25P04 nothing committed, idle; ' +
    'ROLLBACK then answers the WARNING', async () => {
    const {handler, socket} = startedHandler([
      begun, inserted,
      noTransaction('COMMIT', {sessionTransactionActive: false}),
      noTransaction('ROLLBACK', {sessionTransactionActive: false}),
    ]);
    await query(handler, socket, 'BEGIN');
    await query(handler, socket, 'INSERT INTO t (id) VALUES (1)');
    const committed = await query(handler, socket, 'COMMIT');
    assert.equal(committed.errors[0].C, '25P04');
    assert.match(committed.errors[0].M, /no changes were committed/u);
    assert.match(committed.errors[0].D, /NO_TRANSACTION/u);
    assert.equal(committed.status, 'I');
    const rolledBack = await query(handler, socket, 'ROLLBACK');
    assert.deepEqual(rolledBack.tags, ['ROLLBACK']);
    assert.equal(rolledBack.notices.length, 1);
    assert.equal(rolledBack.status, 'I');
  });

  it('a COMMIT failure the engine still holds: failed, ROLLBACK recovers',
    async () => {
      const {handler, socket} = startedHandler([
        begun,
        {success: false, errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          error: 'participant failed', statementType: 'COMMIT',
          sessionTransactionActive: true},
        {success: true, statementType: 'ROLLBACK'},
      ]);
      await query(handler, socket, 'BEGIN');
      const committed = await query(handler, socket, 'COMMIT');
      assert.equal(committed.errors[0].M, 'participant failed');
      assert.equal(committed.status, 'E');
      const rolledBack = await query(handler, socket, 'ROLLBACK');
      assert.deepEqual(rolledBack.tags, ['ROLLBACK']);
      assert.equal(rolledBack.status, 'I');
    });

  it('a COMMIT failure whose answer does not say leaves the block failed',
    async () => {
      const {handler, socket} = startedHandler([
        begun,
        {success: false, errorCode: 'COMMIT_FAILED', error: 'x',
          statementType: 'COMMIT'},
      ]);
      await query(handler, socket, 'BEGIN');
      assert.equal((await query(handler, socket, 'COMMIT')).status, 'E');
    });

  it('a statement for a dropped transaction: 25P04, failed; COMMIT ends ' +
    'the failed block as ROLLBACK', async () => {
    const {handler, socket, adapter} = startedHandler([
      begun,
      {success: false, errorCode: NO_TRANSACTION, transactionId:
        TRANSACTION_ID, error: 'transaction is no longer active'},
      noTransaction('ROLLBACK', {sessionTransactionActive: false}),
    ]);
    await query(handler, socket, 'BEGIN');
    const late = await query(handler, socket, 'INSERT INTO t (id) VALUES (2)');
    assert.equal(late.errors[0].C, '25P04');
    assert.equal(late.status, 'E');
    const ignored = await query(handler, socket, 'SELECT 1');
    assert.equal(ignored.errors[0].C, '25P02');
    const ended = await query(handler, socket, 'COMMIT');
    assert.deepEqual(ended.errors, []);
    assert.deepEqual(ended.tags, ['ROLLBACK']);
    assert.deepEqual(ended.notices, [], 'no warning inside a block');
    assert.equal(ended.status, 'I');
    assert.equal(adapter.executions.at(-1).sql, 'ROLLBACK');
  });
});
