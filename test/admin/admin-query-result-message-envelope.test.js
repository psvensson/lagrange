import {test} from '../../src/test-helpers/tap.js';
import {
  createAdminQueryResultMessageEnvelope,
  resolveAdminQueryResultAffectedRows,
  resolveAdminQueryResultPayloadContext,
} from '../../src/admin/admin-query-result-message-envelope.js';
import {ADMIN_WEBSOCKET_API_SHARED} from
  '../../src/admin/admin-websocket-api-shared.js';

const {
  ADMIN_QUERY_RESULT,
  EXECUTION_MODE,
  ErrorCode,
  MessageType,
  QUERY_RESULT_MESSAGE_KIND,
} = ADMIN_WEBSOCKET_API_SHARED;

const TEST_QUERY_ID = 'query-envelope-1';
const TEST_TABLE_NAME = 'widgets';
const TEST_PARTITION_ID = 'partition-a';
const TEST_REASON_CODE = 'admission_deferred';
const TEST_WARNING = 'partial_result';
const TEST_HOST_RESULT = {
  accepted: true,
};
const TEST_CALLBACK_MODULE_REF = 'module:callbacks';
const TEST_CALLBACK_EXPORT = 'run';
const TEST_ERROR_MESSAGE = 'query failed';
const TEST_ERROR_HINT = 'retry later';
const TEST_RETRY_AFTER_MS = 250.9;
const EXPECTED_RETRY_AFTER_MS = 250;
const EXPECTED_AFFECTED_ROWS = 2;
const EXPECTED_DEFAULT_AFFECTED_ROWS = 0;
const TEST_DURABLE_COMMIT_WITNESS = Object.freeze({
  partitionId: TEST_PARTITION_ID,
  leaderNodeId: 'node-2',
  leaderReplicaId: 'partition-a-r2',
  term: 7,
  logIndex: 42,
  entryId: 'entry-write-operation-1',
  operationId: 'write-operation-1',
  idempotencyKey: 'write-operation-1',
});

test('admin query result envelope builds row payload messages', async (t) => {
  const row = {
    id: 'row-1',
  };
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: true,
    rows: [row],
    count: 3,
    partitions: [TEST_PARTITION_ID],
    tableName: TEST_TABLE_NAME,
    warning: TEST_WARNING,
    reasonCode: TEST_REASON_CODE,
  });

  t.equal(message.type, MessageType.QUERY_RESULT, 'should use query result type');
  t.equal(message.queryId, TEST_QUERY_ID, 'should preserve query id');
  t.equal(
    Number.isFinite(message.timestamp),
    true,
    'should stamp the envelope',
  );
  t.same(message.results, [row], 'should expose row payload as results');
  t.equal(message.count, 3, 'should preserve explicit row count');
  t.same(message.partitions, [TEST_PARTITION_ID], 'should preserve partitions');
  t.equal(message.tableName, TEST_TABLE_NAME, 'should preserve table name');
  t.equal(message.warning, TEST_WARNING, 'should preserve warning');
  t.equal(message.reasonCode, TEST_REASON_CODE, 'should append metadata');
});

test('admin query result envelope builds write payload messages', async (t) => {
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: true,
    operation: 'INSERT',
    operationId: 'write-operation-1',
    idempotencyKey: 'write-operation-1',
    affectedRows: String(EXPECTED_AFFECTED_ROWS),
    partitions: [TEST_PARTITION_ID],
    tableName: TEST_TABLE_NAME,
    participantResults: [{
      partitionId: TEST_PARTITION_ID,
      role: 'primary',
      success: true,
      durableCommitWitness: TEST_DURABLE_COMMIT_WITNESS,
      acceptingNodeId: 'node-2',
      acknowledgedAtMs: 1785630280000,
    }],
  });

  t.equal(message.operation, 'INSERT', 'should preserve write operation');
  t.equal(
    message.affectedRows,
    EXPECTED_AFFECTED_ROWS,
    'should normalize numeric affected rows',
  );
  t.same(message.partitions, [TEST_PARTITION_ID], 'should preserve partitions');
  t.equal(message.tableName, TEST_TABLE_NAME, 'should preserve table name');
  t.same(message.writeReceipt, {
    operationId: 'write-operation-1',
    idempotencyKey: 'write-operation-1',
    successfulParticipantCount: 1,
    witnessedParticipantCount: 1,
    commitWitnessComplete: true,
    missingCommitWitnessPartitions: [],
    durableCommitWitnesses: [TEST_DURABLE_COMMIT_WITNESS],
    participantReceipts: [{
      partitionId: TEST_PARTITION_ID,
      acceptingNodeId: 'node-2',
      acknowledgedAtMs: 1785630280000,
      durableCommitWitness: TEST_DURABLE_COMMIT_WITNESS,
      complete: true,
    }],
  }, 'should project a bounded write receipt for the harness ledger');
});

test('admin write receipt exposes every successful participant missing evidence',
  async (t) => {
    const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
      success: true,
      operation: 'INSERT',
      operationId: 'write-operation-1',
      idempotencyKey: 'write-operation-1',
      affectedRows: 2,
      participantResults: [{
        partitionId: TEST_PARTITION_ID,
        success: true,
        durableCommitWitness: TEST_DURABLE_COMMIT_WITNESS,
        acceptingNodeId: 'node-2',
        acknowledgedAtMs: 1785630280000,
      }, {
        partitionId: 'partition-b',
        success: true,
      }],
    });

    t.equal(message.writeReceipt.commitWitnessComplete, false);
    t.equal(message.writeReceipt.successfulParticipantCount, 2);
    t.equal(message.writeReceipt.witnessedParticipantCount, 1);
    t.same(
      message.writeReceipt.missingCommitWitnessPartitions,
      ['partition-b'],
    );
  });

test('admin write receipt rejects a witness from a different accepting leader',
  async (t) => {
    const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
      success: true,
      operation: 'INSERT',
      operationId: 'write-operation-1',
      idempotencyKey: 'write-operation-1',
      affectedRows: 1,
      participantResults: [{
        partitionId: TEST_PARTITION_ID,
        success: true,
        durableCommitWitness: TEST_DURABLE_COMMIT_WITNESS,
        acceptingNodeId: 'different-node',
        acknowledgedAtMs: 1785630280000,
      }],
    });

    t.equal(message.writeReceipt.commitWitnessComplete, false);
    t.equal(message.writeReceipt.witnessedParticipantCount, 0);
    t.same(
      message.writeReceipt.missingCommitWitnessPartitions,
      [TEST_PARTITION_ID],
    );
  });

test('admin write receipt rejects invalid Raft term and entry positions',
  async (t) => {
    for (const durableCommitWitness of [
      {...TEST_DURABLE_COMMIT_WITNESS, term: -1},
      {...TEST_DURABLE_COMMIT_WITNESS, logIndex: 0},
    ]) {
      const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
        success: true,
        operation: 'INSERT',
        operationId: 'write-operation-1',
        idempotencyKey: 'write-operation-1',
        affectedRows: 1,
        participantResults: [{
          partitionId: TEST_PARTITION_ID,
          success: true,
          durableCommitWitness,
          acceptingNodeId: 'node-2',
          acknowledgedAtMs: 1785630280000,
        }],
      });
      t.equal(message.writeReceipt.commitWitnessComplete, false);
      t.equal(message.writeReceipt.witnessedParticipantCount, 0);
    }
  });

test('admin write receipt rejects a negative acceptance timestamp',
  async (t) => {
    const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
      success: true,
      operation: 'INSERT',
      operationId: 'write-operation-1',
      idempotencyKey: 'write-operation-1',
      affectedRows: 1,
      participantResults: [{
        partitionId: TEST_PARTITION_ID,
        success: true,
        durableCommitWitness: TEST_DURABLE_COMMIT_WITNESS,
        acceptingNodeId: 'node-2',
        acknowledgedAtMs: -1,
      }],
    });

    t.equal(message.writeReceipt.commitWitnessComplete, false);
    t.equal(message.writeReceipt.witnessedParticipantCount, 0);
    t.equal(message.writeReceipt.participantReceipts[0].acknowledgedAtMs, null);
  });

test('admin query result envelope builds host callback messages', async (t) => {
  const callbackResult = {
    executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
    results: [{ok: true}],
    hostResult: TEST_HOST_RESULT,
    callbackModuleRef: TEST_CALLBACK_MODULE_REF,
    callbackExport: TEST_CALLBACK_EXPORT,
  };
  const message = createAdminQueryResultMessageEnvelope(
    TEST_QUERY_ID,
    callbackResult,
  );

  t.equal(
    message.operation,
    EXECUTION_MODE.PARTITION_CALLBACK,
    'should mark host callback operation',
  );
  t.same(message.results, callbackResult.results, 'should preserve results');
  t.same(message.hostResult, TEST_HOST_RESULT, 'should preserve host result');
  t.equal(
    message.callbackModuleRef,
    TEST_CALLBACK_MODULE_REF,
    'should preserve callback module ref',
  );
  t.equal(
    message.callbackExport,
    TEST_CALLBACK_EXPORT,
    'should preserve callback export',
  );
});

test('admin query result envelope builds error messages', async (t) => {
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: false,
    error: TEST_ERROR_MESSAGE,
    hint: TEST_ERROR_HINT,
    details: {
      reason: TEST_REASON_CODE,
    },
    deferRetry: true,
    retryAfterMs: TEST_RETRY_AFTER_MS,
  });

  t.equal(message.error, TEST_ERROR_MESSAGE, 'should preserve error message');
  t.equal(
    message.errorCode,
    ErrorCode.INTERNAL_ERROR,
    'should default missing error code',
  );
  t.equal(message.hint, TEST_ERROR_HINT, 'should preserve hint');
  t.same(message.details, {reason: TEST_REASON_CODE}, 'should preserve details');
  t.equal(message.deferRetry, true, 'should preserve defer retry flag');
  t.equal(
    message.retryAfterMs,
    EXPECTED_RETRY_AFTER_MS,
    'should normalize retry-after milliseconds',
  );
});

test('admin query result envelope preserves default write fallback', async (t) => {
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: true,
    operation: 'VACUUM',
  });

  t.equal(message.operation, 'VACUUM', 'should preserve operation');
  t.equal(
    message.affectedRows,
    EXPECTED_DEFAULT_AFFECTED_ROWS,
    'should apply default affected row count',
  );
  t.same(message.partitions, [], 'should apply empty partitions');
  t.equal(message.tableName, null, 'should apply absent table name');
});

test('admin query result context and affected-row helpers stay stable',
  async (t) => {
    t.same(
      resolveAdminQueryResultPayloadContext({
        success: false,
      }),
      {
        kind: QUERY_RESULT_MESSAGE_KIND.ERROR,
        hasRowPayload: false,
      },
      'should classify errors first',
    );
    t.equal(
      resolveAdminQueryResultAffectedRows('5', false),
      5,
      'should parse numeric affected rows',
    );
    t.equal(
      resolveAdminQueryResultAffectedRows('unknown', true),
      'unknown',
      'should preserve original value when requested',
    );
    t.equal(
      resolveAdminQueryResultAffectedRows(undefined, false),
      ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT,
      'should fall back to default affected rows',
    );
  });
