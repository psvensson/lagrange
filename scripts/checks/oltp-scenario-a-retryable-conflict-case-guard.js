import assert from 'node:assert/strict';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
  createPairedRetryingOltpAdapter,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../../test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js';
import {
  OLTP_SQL_STATEMENT,
} from '../../test/distributed/harness/oltp-baseline-transaction-executor.js';
import {
  LAGRANGE_OLTP_TRANSLATION_AUDIT,
  createLagrangeSession,
} from '../../test/distributed/reference-client/lagrange-oltp-adapter.js';
import {
  TIDB_OLTP_TRANSLATION_AUDIT,
  createTiDbSession,
} from '../../test/distributed/reference-client/tidb-oltp-adapter.js';

const PASS_MESSAGE = 'oltp-scenario-a-retryable-conflict-case-guard: PASS';

const runCaseGuard = async () => {
  const definition = buildScenarioARetryableConflictCase();
  const repeated = buildScenarioARetryableConflictCase();

  assert.equal(definition.identity.caseId, 'scenario-a-retryable-conflict-v1');
  assert.equal(definition.caseSha256, repeated.caseSha256);
  assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS, [
    'outcome:retryableConflictSqlState:40001',
  ]);
  assert.equal(definition.identity.expected.effectsPresent, 2);
  assert.equal(
    definition.identity.expected.loserSqlStateWhenConflicting,
    OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  );
  assert.equal(
    definition.identity.expected.loserOutcomeWhenConflicting,
    OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
  );
  assert.equal(definition.identity.expected.loserCommitsOnRetry, true);

  const classification = classifyOltpAttemptError({sqlState: '40001'});
  assert.deepEqual(classification, {
    retryable: true,
    outcome: OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
    sqlState: '40001',
  });

  const outcomeUnknownClassification = classifyOltpAttemptError({
    sqlState: '40001',
    commitOutcomeUnknown: true,
  });
  assert.deepEqual(outcomeUnknownClassification, {
    retryable: false,
    outcome: OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE,
    commitOutcomeUnknown: true,
    sqlState: '40001',
  });

  for (const variant of [
    {sqlState: '40001', outcome: 'OUTCOME_UNKNOWN'},
    {sqlState: '40001', code: 'OUTCOME_UNKNOWN'},
    {sqlState: '40001', errorCode: 'OUTCOME_UNKNOWN'},
  ]) {
    const classified = classifyOltpAttemptError(variant);
    assert.equal(classified.retryable, false);
    assert.equal(classified.outcome, OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE);
    assert.equal(classified.commitOutcomeUnknown, true);
  }

  let attemptCount = 0;
  const ambiguousCommitAdapter = {
    async executeTransaction() {
      attemptCount += 1;
      const error = new Error('commit transport disconnect');
      error.sqlState = '40001';
      error.commitOutcomeUnknown = true;
      error.commitPhase = true;
      throw error;
    },
  };
  const retryingAdapter = createPairedRetryingOltpAdapter(ambiguousCommitAdapter);
  await assert.rejects(
    async () => {
      await retryingAdapter.executeTransaction({workerId: 1});
    },
    (err) => {
      assert.equal(err.name, 'OltpPairedTransactionError');
      assert.equal(err.commitOutcomeUnknown, true);
      assert.equal(err.sqlState, '40001');
      assert.equal(err.oltpRetryEvidence.attempts, 1);
      assert.equal(err.oltpRetryEvidence.retries, 0);
      assert.equal(
        err.oltpRetryEvidence.failures[0].commitOutcomeUnknown,
        true,
      );
      return true;
    },
  );
  assert.equal(
    attemptCount,
    1,
    'paired retry owner must not retry transactions with unknown commit outcome',
  );
  const retryEvidence = retryingAdapter.getRetryEvidence();
  assert.equal(retryEvidence.attempts, 1);
  assert.equal(retryEvidence.retries, 0);
  assert.equal(retryEvidence.outcomeUnknownTransactions, 1);
  assert.equal(retryEvidence.terminalTransactions, 1);
  assert.equal(retryEvidence.serializationConflicts, 0);

  assert.deepEqual(LAGRANGE_OLTP_TRANSLATION_AUDIT, {
    lockingReadMode: 'snapshot-write-conflict',
    forUpdateStripped: true,
    nativeLockingReadProved: false,
    strippedStatementIds: [
      OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE,
      OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE,
      OLTP_SQL_STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE,
      OLTP_SQL_STATEMENT.DELIVERY_ORDER_FOR_UPDATE,
      OLTP_SQL_STATEMENT.DELIVERY_LINES_FOR_UPDATE,
    ],
  });
  assert.equal(LAGRANGE_OLTP_TRANSLATION_AUDIT.strippedStatementIds.length, 5);

  assert.deepEqual(TIDB_OLTP_TRANSLATION_AUDIT, {
    lockingReadMode: 'pessimistic-for-update',
    forUpdateStripped: false,
    nativeLockingReadProved: true,
    strippedStatementIds: [],
  });
  assert.equal(TIDB_OLTP_TRANSLATION_AUDIT.forUpdateStripped, false);
  assert.equal(TIDB_OLTP_TRANSLATION_AUDIT.nativeLockingReadProved, true);

  async function assertLagrangeSessionCommitBoundaries() {
    {
      const executed = [];
      const client = {
        async query(sql) {
          executed.push(sql);
          return {rows: [], rowCount: 0};
        },
      };
      const session = createLagrangeSession(client);
      await assert.rejects(
        session.transaction(async () => {
          throw new Error('callback before-commit failure');
        }),
        /callback before-commit failure/u,
      );
      assert.deepEqual(executed, ['BEGIN', 'ROLLBACK']);
    }

    {
      const executed = [];
      const client = {
        async query(sql) {
          executed.push(sql);
          if (sql === 'COMMIT') {
            const err = new Error('commit serialization conflict');
            err.code = '40001';
            throw err;
          }
          return {rows: [], rowCount: 0};
        },
      };
      const session = createLagrangeSession(client);
      await assert.rejects(
        session.transaction(async () => 'ok'),
        (err) => {
          assert.equal(err.code, '40001');
          assert.equal(err.commitAborted, true);
          assert.equal(err.commitOutcomeUnknown, undefined);
          return true;
        },
      );
      assert.deepEqual(executed, ['BEGIN', 'COMMIT', 'ROLLBACK']);
    }

    {
      const executed = [];
      const client = {
        async query(sql) {
          executed.push(sql);
          if (sql === 'COMMIT') {
            const err = new Error('connection reset during commit');
            err.code = 'ECONNRESET';
            throw err;
          }
          return {rows: [], rowCount: 0};
        },
      };
      const session = createLagrangeSession(client);
      await assert.rejects(
        session.transaction(async () => 'ok'),
        (err) => {
          assert.equal(err.commitPhase, true);
          assert.equal(err.commitOutcomeUnknown, true);
          return true;
        },
      );
      assert.deepEqual(
        executed,
        ['BEGIN', 'COMMIT'],
        'ambiguous commit error must not issue ROLLBACK',
      );
    }
  }

  async function assertTiDbSessionCommitBoundaries() {
    {
      const executed = [];
      const connection = {
        async beginTransaction() {
          executed.push('BEGIN');
        },
        async commit() {
          executed.push('COMMIT');
        },
        async rollback() {
          executed.push('ROLLBACK');
        },
      };
      const session = createTiDbSession(connection);
      await assert.rejects(
        session.transaction(async () => {
          throw new Error('callback before-commit failure');
        }),
        /callback before-commit failure/u,
      );
      assert.deepEqual(executed, ['BEGIN', 'ROLLBACK']);
    }

    {
      const executed = [];
      const connection = {
        async beginTransaction() {
          executed.push('BEGIN');
        },
        async commit() {
          executed.push('COMMIT');
          const err = new Error('commit serialization conflict');
          err.code = '40001';
          throw err;
        },
        async rollback() {
          executed.push('ROLLBACK');
        },
      };
      const session = createTiDbSession(connection);
      await assert.rejects(
        session.transaction(async () => 'ok'),
        (err) => {
          assert.equal(err.code, '40001');
          assert.equal(err.commitAborted, true);
          assert.equal(err.commitOutcomeUnknown, undefined);
          return true;
        },
      );
      assert.deepEqual(executed, ['BEGIN', 'COMMIT', 'ROLLBACK']);
    }

    {
      const executed = [];
      const connection = {
        async beginTransaction() {
          executed.push('BEGIN');
        },
        async commit() {
          executed.push('COMMIT');
          const err = new Error('connection timeout during commit');
          err.code = 'ETIMEDOUT';
          throw err;
        },
        async rollback() {
          executed.push('ROLLBACK');
        },
      };
      const session = createTiDbSession(connection);
      await assert.rejects(
        session.transaction(async () => 'ok'),
        (err) => {
          assert.equal(err.commitPhase, true);
          assert.equal(err.commitOutcomeUnknown, true);
          return true;
        },
      );
      assert.deepEqual(
        executed,
        ['BEGIN', 'COMMIT'],
        'ambiguous commit error must not issue ROLLBACK',
      );
    }
  }

  await assertLagrangeSessionCommitBoundaries();
  await assertTiDbSessionCommitBoundaries();

  // The observable contract (coordinator decision 5, 2026-11-02): both
  // effects present, by blocking or by one retried 40001.
  const effects = (final) => ({baseline: 100, final, delta: 100});
  const passing = evaluateScenarioARetryableConflictObservation({
    mechanism: 'serialization-conflict', victimSqlState: '40001', retryCommitted: true,
    effects: effects(300)});
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.failures, []);
  assert.deepEqual(
    passing.proofIds,
    OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  );
  const blocking = evaluateScenarioARetryableConflictObservation({
    mechanism: 'blocking-then-commit', victimSqlState: null, retryCommitted: null,
    effects: effects(300)});
  assert.equal(blocking.passed, true);

  const terminal = evaluateScenarioARetryableConflictObservation({
    mechanism: 'other-error', victimSqlState: 'HY000', retryCommitted: false,
    effects: effects(200)});
  assert.equal(terminal.passed, false);
  assert.deepEqual(terminal.failures, ['unexpected_sql_state', 'lost_update']);
  assert.deepEqual(terminal.proofIds, []);

  const absent = evaluateScenarioARetryableConflictObservation({});
  assert.equal(absent.passed, false);
  assert.deepEqual(absent.failures, ['effects_unobserved']);
  assert.deepEqual(absent.proofIds, []);
};

await runCaseGuard();

console.log(PASS_MESSAGE);
