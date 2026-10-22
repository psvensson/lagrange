/**
 * A spent wait is a failure, and is visible (distributed transaction
 * coordinator): a participant operation whose bounded retries
 * (PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES) are exhausted, and a transaction
 * whose timeout budget (TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS) is
 * spent, each log exactly one wait_bound_spent ERROR naming what was awaited
 * and the last observed state; a participant that succeeds within its
 * retries logs none. Post-expiry behaviour is unchanged: the last
 * participant error is rethrown, and the budget abort still returns the
 * TIMEOUT failure after the rollback protocol.
 *
 * The coordinator's own injected clock and sleep hook spend the bounds;
 * nothing waits on wall time.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  abortTimedOutTransaction,
  calculateParticipantRetryDelay,
  emitParticipantRetryDiagnostic,
  executeParticipantOperationWithRetry,
  getRemainingTransactionBudgetMs,
  resolveParticipantCommitMiss,
} from '../../src/query/distributed/distributed-transaction-protocol.js';

const MAX_RETRIES = 2;
const BUDGET_MS = 1_000;

function buildCoordinator() {
  let clock = 10_000;
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  const owner = {
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    logger: {
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
    },
    participantRetryMaxRetries: MAX_RETRIES,
    participantRetryBaseDelayMs: 50,
    participantRetryMaxDelayMs: 200,
    transactionBudgetMs: BUDGET_MS,
    recoveredTransactionIds: new Set(),
    onParticipantRetry: null,
    sleep: async (delayMs) => {
      clock += delayMs;
    },
    isTransactionBudgetExceeded: () => false,
    getRemainingTransactionBudgetMs,
    calculateParticipantRetryDelay,
    emitParticipantRetryDiagnostic,
    resolveParticipantCommitMiss,
    errors: () => lines.filter((line) => line.level === 'error'),
  };
  return owner;
}

function buildTx(owner) {
  return {
    transactionId: 'tx-1',
    sessionId: 'session-1',
    workflowId: 'tx-1',
    status: 'PREPARING',
    commitMode: 'TWO_PHASE_COMMIT',
    createdAt: owner.now(),
    timeoutBudget: {
      configuredBudgetMs: BUDGET_MS,
      startedAtMs: owner.now(),
      deadlineMs: owner.now() + BUDGET_MS,
    },
    participants: new Map([
      ['p1', {partitionId: 'p1', status: 'PREPARED'}],
      ['p2', {partitionId: 'p2', status: 'PREPARING'}],
    ]),
  };
}

test('exhausted participant retries log one wait_bound_spent ERROR and ' +
  'rethrow the last participant error', async (t) => {
  const owner = buildCoordinator();
  const tx = buildTx(owner);
  let calls = 0;
  const failure = new Error('participant unavailable');
  failure.errorCode = 'PARTITION_UNAVAILABLE';
  const error = await executeParticipantOperationWithRetry.call(
    owner, tx, 'PREPARING', 'p2', async () => {
      calls += 1;
      throw failure;
    },
  ).then(() => null, (thrown) => thrown);
  t.equal(error, failure, 'the same last participant error is rethrown');
  t.equal(calls, MAX_RETRIES + 1, 'the retry count is unchanged');
  t.equal(owner.errors().length, 1, 'exactly one ERROR');
  const context = owner.errors()[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES');
  t.equal(context.elapsedMs, 50 + 100, 'elapsed on the coordinator clock');
  t.same(context.lastObserved, {
    stage: 'PREPARING',
    maxRetries: MAX_RETRIES,
    attempts: MAX_RETRIES + 1,
    lastError: 'participant unavailable',
    lastErrorCode: 'PARTITION_UNAVAILABLE',
  });
  t.same(context.scope, {transactionId: 'tx-1', partitionId: 'p2'});
});

test('a participant that succeeds within its retries logs no ' +
  'wait_bound_spent', async (t) => {
  const owner = buildCoordinator();
  const tx = buildTx(owner);
  let calls = 0;
  await executeParticipantOperationWithRetry.call(
    owner, tx, 'PREPARING', 'p2', async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('transient');
      }
    },
  );
  t.equal(calls, 2, 'the second attempt succeeds');
  t.equal(owner.errors().length, 0, 'no ERROR on normal completion');
});

test('a spent transaction budget logs one wait_bound_spent ERROR and still ' +
  'returns the TIMEOUT failure after rollback', async (t) => {
  const owner = buildCoordinator();
  const tx = buildTx(owner);
  owner.advance(BUDGET_MS + 5);
  const statuses = [];
  owner.setTransactionStatus = async (target, status) => {
    statuses.push(status);
    target.status = status;
  };
  owner.runRollbackProtocol = async () => ({failedParticipants: []});
  owner.getOrderedParticipantIds = () => ['p1', 'p2'];
  const result = await abortTimedOutTransaction.call(owner, tx, 'PREPARING');
  t.equal(result.success, false);
  t.equal(result.errorCode, 'TIMEOUT', 'the same TIMEOUT failure result');
  t.same(statuses, ['ROLLING_BACK'], 'the rollback protocol still runs');
  t.equal(owner.errors().length, 1, 'exactly one ERROR');
  const context = owner.errors()[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS');
  t.equal(context.boundMs, BUDGET_MS);
  t.equal(context.elapsedMs, BUDGET_MS + 5);
  t.same(context.lastObserved, {
    stage: 'PREPARING',
    status: 'PREPARING',
    commitMode: 'TWO_PHASE_COMMIT',
    remainingBudgetMs: 0,
    participantStatuses: {PREPARED: 1, PREPARING: 1},
  });
});
