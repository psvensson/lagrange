#!/usr/bin/env node

import assert from 'node:assert/strict';

import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {PG_WIRE_SQLSTATE} from '../../src/query/pg/pg-wire-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {PARTITION_SERVICE_ERROR_MSG} from
  '../../src/partition/partition-service-constants.js';
import {PgWireProtocolHandler} from
  '../../src/runtime/pgwire-protocol-handler.js';
import {
  PG_BACKEND_MSG,
  PG_TRANSACTION_STATE,
} from '../../src/runtime/pgwire-protocol-constants.js';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';

const PASS_LINE = 'pgwire-transaction-conflict-guard: PASS\n';
const SESSION_ID = 'pg-conflict-guard';

function authHandler() {
  return {
    async authenticate({database, user}) {
      return {
        authenticated: true,
        context: {
          tenantId: database,
          principal: user,
        },
      };
    },
    authorizeQuery() {
      return {authorized: true};
    },
  };
}

async function buildCoordinatorConflictResult() {
  const coordinator = new DistributedTransactionCoordinator({
    participantRetryMaxRetries: 0,
    beginParticipant: async () => {},
    prepareParticipant: async (_sessionId, partitionId) => {
      if (partitionId === 'p2') {
        throw new Error(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT);
      }
    },
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
  });
  await coordinator.begin('coordinator-conflict');
  await coordinator.enlistParticipants('coordinator-conflict', ['p1', 'p2']);
  const result = await coordinator.commit('coordinator-conflict');
  assert.equal(result.success, false);
  assert.equal(result.errorCode, QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE);
  assert.equal(result.failedParticipants.length, 1);
  assert.equal(
    result.failedParticipants[0].error,
    PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT,
  );
  return result;
}

async function createAuthenticatedAdapter(result) {
  const adapter = new PostgresWireAdapter({
    sqlCore: {
      async executeRequest() {
        return result;
      },
    },
    authHandler: authHandler(),
    logger: {debug() {}, warn() {}, error() {}},
  });
  await adapter.authenticate(SESSION_ID, {
    tenantId: 'lagrange_benchmark',
    user: 'benchmark',
  });
  return adapter;
}

async function assertAdapterProjection(conflictResult) {
  const adapter = await createAuthenticatedAdapter(conflictResult);
  const projected = await adapter.execute(SESSION_ID, 'COMMIT');
  assert.equal(projected.success, false);
  assert.equal(projected.errorCode, QUERY_ERROR_CODE.WRITE_CONFLICT);
  assert.equal(projected.error, QUERY_ERROR_MSG.WRITE_CONFLICT);
  assert.equal(projected.sqlState, PG_WIRE_SQLSTATE.SERIALIZATION_FAILURE);

  const genericAdapter = await createAuthenticatedAdapter({
    success: false,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    failedParticipants: [{partitionId: 'p2', error: 'transport failure'}],
  });
  const generic = await genericAdapter.execute(SESSION_ID, 'COMMIT');
  assert.equal(
    generic.errorCode,
    QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
  );
  assert.equal(generic.sqlState, undefined);
  return adapter;
}

async function assertProtocolSqlState(adapter) {
  const writes = [];
  const socket = {
    write(buffer) {
      writes.push(Buffer.from(buffer));
      return true;
    },
  };
  let transactionState = PG_TRANSACTION_STATE.IN_TRANSACTION;
  const handler = new PgWireProtocolHandler({
    adapter,
    socket,
    logger: {debug() {}, warn() {}, error() {}},
  });
  handler._session = {
    sessionId: SESSION_ID,
    getTransactionState() {
      return transactionState;
    },
    setTransactionState(nextState) {
      transactionState = nextState;
    },
  };

  await handler._executeAndSend('COMMIT', []);
  assert.equal(transactionState, PG_TRANSACTION_STATE.FAILED);
  const errorResponse = writes.find((buffer) =>
    buffer[0] === PG_BACKEND_MSG.ERROR_RESPONSE);
  assert.ok(errorResponse, 'PG wire must emit ErrorResponse');
  assert.ok(
    errorResponse.includes(Buffer.from('40001\0', 'utf8')),
    'PG ErrorResponse must carry serialization_failure SQLSTATE 40001',
  );
}

async function main() {
  const conflictResult = await buildCoordinatorConflictResult();
  const adapter = await assertAdapterProjection(conflictResult);
  await assertProtocolSqlState(adapter);
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
