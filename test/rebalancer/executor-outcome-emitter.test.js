/**
 * Unit tests for ExecutorOutcomeEmitter and buildExecutorOutcome.
 *
 * Verifies that executor-side components can emit typed outcomes
 * instead of writing to replica_operations directly.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ExecutorOutcomeEmitter,
  buildExecutorOutcome,
  OUTCOME_EVENT_NAME,
} from '../../src/rebalancer/executor-outcome-emitter.js';
import {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_FIELD,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const TEST_OPERATION_ID = 'op-1';
const TEST_REPLICA_ID = 'r-1';
const TEST_ERROR_MESSAGE = 'disk full';
const TEST_ERROR_CODE = 'BOOTSTRAP_NOT_READY';
const TEST_RETRY_AFTER_MS = 250;

test('ExecutorOutcomeEmitter', async (t) => {
  await t.test('buildExecutorOutcome creates frozen payload', async (t) => {
    const outcome = buildExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      TEST_OPERATION_ID,
      WORKFLOW_STEP.ACTIVE,
      {replicaId: TEST_REPLICA_ID},
    );

    t.equal(
      outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      'outcomeType should match',
    );
    t.equal(
      outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID],
      TEST_OPERATION_ID,
      'operationId should match',
    );
    t.equal(
      outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP],
      WORKFLOW_STEP.ACTIVE,
      'workflowStep should match',
    );
    t.equal(
      outcome[EXECUTOR_OUTCOME_FIELD.REPLICA_ID],
      TEST_REPLICA_ID,
      'replicaId should be included',
    );
    t.type(
      outcome[EXECUTOR_OUTCOME_FIELD.TIMESTAMP],
      'number',
      'timestamp should be a number',
    );
    t.ok(Object.isFrozen(outcome), 'outcome should be frozen');
  });

  await t.test(
    'buildExecutorOutcome includes errorMessage when provided',
    async (t) => {
      const outcome = buildExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
        'op-2',
        WORKFLOW_STEP.FAILED,
        {
          replicaId: 'r-2',
          errorMessage: TEST_ERROR_MESSAGE,
          errorCode: TEST_ERROR_CODE,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          deferRetry: true,
        },
      );

      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE],
        TEST_ERROR_MESSAGE,
        'errorMessage should be included',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.ERROR_CODE],
        TEST_ERROR_CODE,
        'errorCode should be included',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.RETRY_AFTER_MS],
        TEST_RETRY_AFTER_MS,
        'retryAfterMs should be included',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.DEFER_RETRY],
        true,
        'deferRetry should be included',
      );
    },
  );

  await t.test(
    'buildExecutorOutcome omits optional fields when absent',
    async (t) => {
      const outcome = buildExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
        'op-3',
        WORKFLOW_STEP.REMOVED,
      );

      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.REPLICA_ID],
        undefined,
        'replicaId should be absent',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE],
        undefined,
        'errorMessage should be absent',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.ERROR_CODE],
        undefined,
        'errorCode should be absent',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.RETRY_AFTER_MS],
        undefined,
        'retryAfterMs should be absent',
      );
      t.equal(
        outcome[EXECUTOR_OUTCOME_FIELD.DEFER_RETRY],
        undefined,
        'deferRetry should be absent',
      );
    },
  );

  await t.test('emitOutcome emits event with payload', async (t) => {
    const emitter = new ExecutorOutcomeEmitter({logger: console});
    const received = [];

    emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
      received.push(outcome);
    });

    emitter.emitOutcome(
      EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE,
      'op-4',
      WORKFLOW_STEP.ACTIVE,
      {replicaId: 'mg-1'},
    );

    t.equal(received.length, 1, 'should emit one event');
    t.equal(
      received[0].outcomeType,
      EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE,
      'event outcomeType should match',
    );
    t.equal(
      received[0].operationId,
      'op-4',
      'event operationId should match',
    );
  });

  await t.test(
    'emitOutcome skips emission when operationId is absent',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const received = [];

      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        received.push(outcome);
      });

      emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        null,
        WORKFLOW_STEP.ACTIVE,
      );

      t.equal(received.length, 0,
        'should not emit when operationId is null');
    },
  );

  await t.test(
    'all EXECUTOR_OUTCOME_TYPE values are unique strings',
    async (t) => {
      const values = Object.values(EXECUTOR_OUTCOME_TYPE);
      const unique = new Set(values);

      t.equal(values.length, unique.size,
        'all outcome type values should be unique');
      for (const value of values) {
        t.type(value, 'string',
          `${value} should be a string`);
      }
    },
  );
});
