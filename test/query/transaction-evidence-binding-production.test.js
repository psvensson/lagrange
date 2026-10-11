import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {
  committedAnswerOf,
  preparedEvidenceOf,
  transactionOutcomeAnswerOf,
} from '../../src/query/sql-query-engine-participant-wire.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

const TABLE = 'users';
const PARTITION_ID = 'p1';
const INSERT = `INSERT INTO ${TABLE} (id, name) VALUES (?, ?)`;
const PARTITION = Object.freeze({
  partition_id: PARTITION_ID,
  table_name: TABLE,
  partition_key_start: null,
  partition_key_end: null,
});

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'transaction-evidence-binding'},
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function durableRowOf(gateway, transactionId) {
  const row = gateway.db.prepare(`SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
    'WHERE transaction_id = ?').get(transactionId);
  return row === undefined ? null : {
    transactionId: row.transaction_id,
    status: row.status,
    decision: row.decision,
  };
}

function transactionRequests(deliveries, operation = null) {
  return deliveries.filter((message) =>
    message.type === QUERY_OPERATION.TRANSACTION &&
    (operation === null || message.operation === operation));
}

function createHarness(answer) {
  resetEnvironment();
  const gateway = createTransactionPersistenceGateway();
  const deliveries = [];
  const replyBoundaryRows = [];
  const cache = createMockSystemCache(
    [{table_name: TABLE, primaryKey: 'id'}],
    [PARTITION],
  );
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      const captured = structuredClone(message);
      deliveries.push(captured);
      if (message.type !== QUERY_OPERATION.TRANSACTION) {
        return {acknowledged: true, success: true, rows: [], changes: 1};
      }
      const recordReplyBoundary = () => {
        replyBoundaryRows.push({
          operation: message.operation,
          row: durableRowOf(gateway, message.transactionId),
        });
      };
      return answer?.({
        message: captured,
        partitionId,
        recordReplyBoundary,
      }) ?? answerParticipantTransactionRequest(message, partitionId);
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
  });
  engine.transactionCoordinator.sleep = async () => {};
  return {engine, gateway, deliveries, replyBoundaryRows};
}

async function beginAndWrite(engine, sessionId) {
  const begun = await engine.executeQuery('BEGIN', [], {sessionId});
  assert.equal(begun.success, true);
  const written = await engine.executeQuery(INSERT, [sessionId, 'value'], {
    sessionId,
  });
  assert.equal(written.success, true);
  return begun;
}

function terminalOutcomeAnswer(message, partitionId) {
  return {
    acknowledged: true,
    success: true,
    operation: QUERY_OPERATION.TRANSACTION_OUTCOME,
    partitionId,
    transactionId: message.transactionId,
    participantId: message.participantId,
    durable: true,
    state: 'COMMITTED',
    outcome: 'COMMITTED',
  };
}

function assertStandaloneAnswerContract(operation, answer) {
  if (operation === QUERY_OPERATION.PREPARE) {
    assert.deepEqual(preparedEvidenceOf(answer), {
      preparedDigest: answer.preparedDigest,
      prepareIndex: answer.prepareIndex,
      prepareTerm: answer.prepareTerm,
    });
    return;
  }
  if (operation === QUERY_OPERATION.COMMIT) {
    assert.equal(committedAnswerOf(answer).outcome, 'COMMITTED');
    return;
  }
  assert.equal(transactionOutcomeAnswerOf(answer).outcome, 'COMMITTED');
}

const PREPARE_CASES = Object.freeze([
  ['prepared_digest_missing', (answer) => {
    delete answer.preparedDigest;
  }],
  ['prepared_digest_malformed', (answer) => {
    answer.preparedDigest = 7;
  }],
  ['prepare_index_missing', (answer) => {
    delete answer.prepareIndex;
  }],
  ['prepare_index_malformed', (answer) => {
    answer.prepareIndex = 0;
  }],
  ['prepare_term_missing', (answer) => {
    delete answer.prepareTerm;
  }],
  ['prepare_term_malformed', (answer) => {
    answer.prepareTerm = 1.5;
  }],
  ['prepare_other_transaction', (answer) => {
    const foreignTransactionId = 'f'.repeat(32);
    answer.transactionId = foreignTransactionId;
    answer.participantId = `${foreignTransactionId}:${answer.partitionId}`;
  }, true],
  ['prepare_other_participant', (answer) => {
    answer.partitionId = 'p2';
    answer.participantId = `${answer.transactionId}:${answer.partitionId}`;
  }, true],
]);

test('production evidence matrix: malformed, incomplete and foreign PREPARE ' +
  'replies cannot persist or fan out COMMIT', async (t) => {
  for (const [caseName, mutate, standaloneValid = false] of PREPARE_CASES) {
    await t.test(caseName, async () => {
      const harness = createHarness(({message, partitionId,
        recordReplyBoundary}) => {
        const answer = answerParticipantTransactionRequest(message, partitionId);
        if (message.operation === QUERY_OPERATION.PREPARE) {
          recordReplyBoundary();
          mutate(answer);
          if (standaloneValid) {
            assertStandaloneAnswerContract(QUERY_OPERATION.PREPARE, answer);
          }
        }
        return answer;
      });
      t.after(async () => {
        await harness.engine.shutdown();
        harness.gateway.db.close();
      });
      const sessionId = `matrix-${caseName}`;
      const begun = await beginAndWrite(harness.engine, sessionId);
      const committed = await harness.engine.executeQuery('COMMIT', [], {
        sessionId,
        expectedTransactionId: begun.transactionId,
      });
      const after = durableRowOf(harness.gateway, begun.transactionId);
      const before = harness.replyBoundaryRows.filter((entry) =>
        entry.operation === QUERY_OPERATION.PREPARE).map((entry) => entry.row);
      const commits = transactionRequests(harness.deliveries,
        QUERY_OPERATION.COMMIT);
      const rollbacks = transactionRequests(harness.deliveries,
        QUERY_OPERATION.ROLLBACK);
      assert.deepEqual({
        commitSuccess: committed.success,
        beforeIsPreparingWithoutDecision: before.length > 0 &&
          before.every((row) => row.status === 'PREPARING' &&
            row.decision === null),
        after,
        commitFanout: commits.length,
        rollbackFanout: rollbacks.length,
      }, {
        commitSuccess: false,
        beforeIsPreparingWithoutDecision: true,
        after: {transactionId: begun.transactionId, status: 'ROLLED_BACK',
          decision: 'ROLLBACK'},
        commitFanout: 0,
        rollbackFanout: 1,
      }, 'invalid or foreign PREPARE cannot create durable COMMIT or fanout');
    });
  }
});

test('production evidence matrix: a complete bound PREPARE is the positive ' +
  'control and persists COMMIT before fanout', async (t) => {
  const harness = createHarness(({message, partitionId,
    recordReplyBoundary}) => {
    if (message.operation === QUERY_OPERATION.PREPARE ||
        message.operation === QUERY_OPERATION.COMMIT) {
      recordReplyBoundary();
    }
    return answerParticipantTransactionRequest(message, partitionId);
  });
  t.after(async () => {
    await harness.engine.shutdown();
    harness.gateway.db.close();
  });
  const begun = await beginAndWrite(harness.engine, 'matrix-valid-prepare');
  const committed = await harness.engine.executeQuery('COMMIT', [], {
    sessionId: 'matrix-valid-prepare',
    expectedTransactionId: begun.transactionId,
  });
  const beforePrepare = harness.replyBoundaryRows.filter((entry) =>
    entry.operation === QUERY_OPERATION.PREPARE).map((entry) => entry.row);
  const beforeCommit = harness.replyBoundaryRows.filter((entry) =>
    entry.operation === QUERY_OPERATION.COMMIT).map((entry) => entry.row);
  const after = durableRowOf(harness.gateway, begun.transactionId);
  assert.deepEqual({
    committed: committed.success,
    beforePrepare,
    beforeCommit,
    after,
    commits: transactionRequests(harness.deliveries,
      QUERY_OPERATION.COMMIT).length,
    rollbacks: transactionRequests(harness.deliveries,
      QUERY_OPERATION.ROLLBACK).length,
  }, {
    committed: true,
    beforePrepare: [{transactionId: begun.transactionId, status: 'PREPARING',
      decision: null}],
    beforeCommit: [{transactionId: begun.transactionId, status: 'COMMITTING',
      decision: 'COMMIT'}],
    after: {transactionId: begun.transactionId, status: 'COMMITTED',
      decision: 'COMMIT'},
    commits: 1,
    rollbacks: 0,
  });
});

const TERMINAL_CASES = Object.freeze([
  ['commit_other_transaction', QUERY_OPERATION.COMMIT, (answer) => {
    const foreignTransactionId = 'e'.repeat(32);
    answer.transactionId = foreignTransactionId;
    answer.participantId = `${foreignTransactionId}:${answer.partitionId}`;
  }],
  ['commit_other_participant', QUERY_OPERATION.COMMIT, (answer) => {
    answer.partitionId = 'p2';
    answer.participantId = `${answer.transactionId}:${answer.partitionId}`;
  }],
  ['outcome_other_transaction', QUERY_OPERATION.TRANSACTION_OUTCOME,
    (answer) => {
      const foreignTransactionId = 'd'.repeat(32);
      answer.transactionId = foreignTransactionId;
      answer.participantId = `${foreignTransactionId}:${answer.partitionId}`;
    }],
  ['outcome_other_participant', QUERY_OPERATION.TRANSACTION_OUTCOME,
    (answer) => {
      answer.partitionId = 'p2';
      answer.participantId = `${answer.transactionId}:${answer.partitionId}`;
    }],
]);

test('production evidence matrix: foreign terminal replies after durable ' +
  'COMMIT preserve forward recovery under the same decision', async (t) => {
  for (const [caseName, targetOperation, mutate] of TERMINAL_CASES) {
    await t.test(caseName, async () => {
      let inject = true;
      const harness = createHarness(({message, partitionId,
        recordReplyBoundary}) => {
        if (!inject) {
          return answerParticipantTransactionRequest(message, partitionId);
        }
        if (targetOperation === QUERY_OPERATION.TRANSACTION_OUTCOME &&
            message.operation === QUERY_OPERATION.COMMIT) {
          return {
            acknowledged: true,
            success: false,
            error: 'participant no longer has an active volatile session',
            errorCode: 'NO_TRANSACTION',
            failureCode: 'participant_transaction_not_active',
            operation: message.operation,
            partitionId,
            transactionId: message.transactionId,
            participantId: message.participantId,
            durable: false,
            state: 'ABSENT',
            outcome: 'UNKNOWN',
          };
        }
        if (message.operation === targetOperation) {
          recordReplyBoundary();
          const answer = targetOperation === QUERY_OPERATION.COMMIT ?
            answerParticipantTransactionRequest(message, partitionId) :
            terminalOutcomeAnswer(message, partitionId);
          mutate(answer);
          assertStandaloneAnswerContract(targetOperation, answer);
          return answer;
        }
        return answerParticipantTransactionRequest(message, partitionId);
      });
      t.after(async () => {
        await harness.engine.shutdown();
        harness.gateway.db.close();
      });
      const sessionId = `matrix-${caseName}`;
      const begun = await beginAndWrite(harness.engine, sessionId);
      const first = await harness.engine.executeQuery('COMMIT', [], {
        sessionId,
        expectedTransactionId: begun.transactionId,
      });
      const afterRefusal = durableRowOf(harness.gateway, begun.transactionId);
      const preparesBeforeRecovery = transactionRequests(harness.deliveries,
        QUERY_OPERATION.PREPARE).length;
      inject = false;
      const recovered = await harness.engine.executeQuery('COMMIT', [], {
        sessionId,
        expectedTransactionId: begun.transactionId,
      });
      const afterRecovery = durableRowOf(harness.gateway, begun.transactionId);
      const commits = transactionRequests(harness.deliveries,
        QUERY_OPERATION.COMMIT);
      const rollbacks = transactionRequests(harness.deliveries,
        QUERY_OPERATION.ROLLBACK);
      const before = harness.replyBoundaryRows.filter((entry) =>
        entry.operation === targetOperation).map((entry) => entry.row);
      assert.deepEqual({
        firstSuccess: first.success,
        commitPointReached: first.commitPointReached,
        replyBoundaryIsDurableCommit: before.length > 0 &&
          before.every((row) => row.status === 'COMMITTING' &&
            row.decision === 'COMMIT'),
        afterRefusal,
      }, {
        firstSuccess: false,
        commitPointReached: true,
        replyBoundaryIsDurableCommit: true,
        afterRefusal: {transactionId: begun.transactionId,
          status: 'COMMITTING', decision: 'COMMIT'},
      }, 'foreign terminal reply cannot settle the durable COMMIT fanout');
      assert.equal(recovered.success, true);
      assert.equal(recovered.transactionId, begun.transactionId);
      assert.deepEqual(afterRecovery, {
        transactionId: begun.transactionId,
        status: 'COMMITTED',
        decision: 'COMMIT',
      });
      assert.equal(transactionRequests(harness.deliveries,
        QUERY_OPERATION.PREPARE).length, preparesBeforeRecovery,
      'forward recovery cannot PREPARE again');
      assert.equal(rollbacks.length, 0,
        'a durable COMMIT can never be rewritten or fanned out as ROLLBACK');
      assert.ok(commits.every((request) =>
        request.transactionId === begun.transactionId &&
        request.decision === 'COMMIT'));
    });
  }
});
