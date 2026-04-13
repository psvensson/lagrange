// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {TIMEOUT_BUDGET_CLASSIFICATION} from
  '../../src/control-plane/timeout-budget.js';
import {OperationLane} from '../../src/workflow/operation-lane.js';
import {TimeoutPolicy} from '../../src/workflow/timeout-policy.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';

test('OperationLane requires an explicit workflow coordinator owner', (t) => {
  t.throws(
    () => new OperationLane(),
    /workflow coordinator/,
  );
  t.end();
});

test('OperationLane reuses the shared owner-key single-flight and step ' +
  'budget for one owner', async (t) => {
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const timeoutPolicy = new TimeoutPolicy({
    operationName: 'rebalance',
    configuredBudgetMs: 80,
    now: () => 0,
  });
  const lane = new OperationLane({
    name: 'rebalance-lane',
    workflowCoordinator,
    timeoutPolicy,
    ownerKeyFactory: ({operationId}) => `operation:${operationId}`,
  });

  let releaseExecution;
  const executionBarrier = new Promise((resolve) => {
    releaseExecution = resolve;
  });
  let executionCount = 0;
  let capturedBudget = null;

  const first = lane.run({
    operationId: 'op-1',
    requestedBudgetMs: 70,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
    nestedOperation: 'owner-step',
    timeoutError: 'rebalance owner step timed out',
  }, async ({timeoutBudget}) => {
    executionCount += 1;
    capturedBudget = timeoutBudget;
    await executionBarrier;
    return {attempt: executionCount};
  });
  const second = lane.run({
    operationId: 'op-1',
    requestedBudgetMs: 70,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
    nestedOperation: 'owner-step',
    timeoutError: 'rebalance owner step timed out',
  }, async () => {
    executionCount += 1;
    return {attempt: executionCount};
  });

  t.equal(
    first,
    second,
    'duplicate owner executions must reuse the same in-flight promise',
  );
  t.equal(
    lane.resolveOwnerKey({operationId: 'op-1'}),
    'operation:op-1',
    'owner keys must be derived through the shared lane factory',
  );

  releaseExecution();
  const result = await first;

  t.same(result, {attempt: 1});
  t.equal(executionCount, 1);
  t.equal(capturedBudget.configuredBudgetMs, 70);
  t.equal(capturedBudget.deadlineMs, 70);
});
