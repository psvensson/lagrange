/**
 * Corrective 2b: the pgwire session's destroy ends a lifecycle command's
 * projection wait typed, and the signal reaches the wait through every layer
 * (handler -> adapter -> SqlRequest -> engine dispatch -> command owner ->
 * policy owner). The write stays committed. The signal is not a cancellation
 * of the statement's work: only the lifecycle path reads it.
 */

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {PgWireProtocolHandler} from '../../src/runtime/pgwire-protocol-handler.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {SQLQueryEngineServiceLifecycleExecution} from
  '../../src/query/sql-query-engine-service-lifecycle-execution.js';
import {PostgresWireAdapter} from '../../src/query/pg/postgres-wire-adapter.js';

function handlerOver(adapter = {closeSession() {}}) {
  const socket = Object.assign(new EventEmitter(), {write() {}, destroy() {}});
  return new PgWireProtocolHandler({adapter, socket,
    logger: {debug() {}, info() {}, warn() {}, error() {}}});
}

test('destroy aborts the signal every statement of the session carries',
  () => {
    const handler = handlerOver();
    handler._session = {transactionId: null, isClosed: () => true};
    const {abortSignal} = handler._executionOptions();
    assert.equal(abortSignal.aborted, false);
    handler.destroy();
    assert.equal(abortSignal.aborted, true);
  });

test('the transaction expectation still travels with the signal', () => {
  const handler = handlerOver();
  handler._session = {transactionId: 'tx-1', isClosed: () => true};
  assert.equal(handler._executionOptions().expectedTransactionId, 'tx-1');
});

test('the SqlRequest carries the signal to the lifecycle command owner',
  async () => {
    const {signal} = new AbortController();
    const request = createSqlRequest({statement: 'SELECT 1', tenantId: 't',
      abortSignal: signal});
    assert.equal(request.abortSignal, signal);

    const received = [];
    const engine = Object.create(
      SQLQueryEngineServiceLifecycleExecution.prototype);
    engine.hasActiveTransaction = () => false;
    engine.serviceLifecycleCommandOwnerBinding = {state: 'ready', owner: {
      async execute(...args) {
        received.push(args);
        return {success: true};
      },
    }};
    await engine.tryExecuteServiceLifecycleSql(
      'CONFIGURE SERVICE ACCESS $1', [JSON.stringify({binding_name: 'b',
        schema_version: 1, tables: []})],
      {sessionId: 's', abortSignal: signal, securityContext: {tenantId: 't',
        principal: 'p', roles: []}});
    assert.equal(received.length, 1);
    assert.equal(received[0][3].abortSignal, signal);
  });

test('the adapter hands the session signal to the request', async () => {
  assert.match(PostgresWireAdapter.prototype.execute.toString(),
    /abortSignal: options\.abortSignal/u);
});
