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

const arrayFind = Function.call.bind(Array.prototype.find);
const bufferIncludes = Function.call.bind(Buffer.prototype.includes);

const PASS_LINE = 'pgwire-transaction-conflict-guard: PASS\n';
const SESSION_ID = 'pg-conflict-guard';
const COORDINATOR_TX_ID = 'coordinator-conflict';
const PARTITION_P1 = 'p1';
const PARTITION_P2 = 'p2';
const ENLISTED_PARTICIPANTS = Object.freeze([PARTITION_P1, PARTITION_P2]);
const DIGEST_CHAR = 'a';
const DIGEST_LENGTH = 64;
const BENCHMARK_TENANT_ID = 'lagrange_benchmark';
const BENCHMARK_USER = 'benchmark';
const SQL_COMMIT = 'COMMIT';
const TRANSPORT_FAILURE = 'transport failure';
const ASSERT_MSG_ERROR_RESPONSE = 'PG wire must emit ErrorResponse';
const ASSERT_MSG_SQLSTATE =
  'PG ErrorResponse must carry serialization_failure SQLSTATE 40001';
const SQLSTATE_PATTERN = '40001\0';
const ENCODING_UTF8 = 'utf8';

function authHandler() {
  return {
    async authenticate({database, user}) {
      return {
        authenticated: true,
        context: {
          tenantId: database,
          principal: user,
          roles: [],
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
      if (partitionId === PARTITION_P2) {
        throw new Error(PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT);
      }
      return {
        preparedDigest: DIGEST_CHAR.repeat(DIGEST_LENGTH),
        prepareIndex: 1,
        prepareTerm: 1,
      };
    },
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
  });
  await coordinator.begin(COORDINATOR_TX_ID);
  await coordinator.enlistParticipants(COORDINATOR_TX_ID, ENLISTED_PARTICIPANTS);
  const result = await coordinator.commit(COORDINATOR_TX_ID);
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
    tenantId: BENCHMARK_TENANT_ID,
    user: BENCHMARK_USER,
  });
  return adapter;
}

async function assertAdapterProjection(conflictResult) {
  const adapter = await createAuthenticatedAdapter(conflictResult);
  const projected = await adapter.execute(SESSION_ID, SQL_COMMIT);
  assert.equal(projected.success, false);
  assert.equal(projected.errorCode, QUERY_ERROR_CODE.WRITE_CONFLICT);
  assert.equal(projected.error, QUERY_ERROR_MSG.WRITE_CONFLICT);
  assert.equal(projected.sqlState, PG_WIRE_SQLSTATE.SERIALIZATION_FAILURE);

  const genericAdapter = await createAuthenticatedAdapter({
    success: false,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    failedParticipants: [{partitionId: PARTITION_P2, error: TRANSPORT_FAILURE}],
  });
  const generic = await genericAdapter.execute(SESSION_ID, SQL_COMMIT);
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

  await handler._executeAndSend(SQL_COMMIT, []);
  assert.equal(transactionState, PG_TRANSACTION_STATE.FAILED);
  const errorResponse = arrayFind(
    writes,
    (buffer) => buffer[0] === PG_BACKEND_MSG.ERROR_RESPONSE,
  );
  assert.ok(errorResponse, ASSERT_MSG_ERROR_RESPONSE);
  assert.ok(
    bufferIncludes(errorResponse, Buffer.from(SQLSTATE_PATTERN, ENCODING_UTF8)),
    ASSERT_MSG_SQLSTATE,
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
