// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {TIMEOUT_BUDGET_CLASSIFICATION} from
  '../../src/control-plane/timeout-budget.js';
import {TimeoutPolicy} from '../../src/workflow/timeout-policy.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {WorkflowStepRunner} from '../../src/workflow/workflow-step-runner.js';

const FIXTURE_NOW_MS = 5000;

test('WorkflowStepRunner requires an explicit workflow coordinator owner',
  (t) => {
    t.throws(
      () => new WorkflowStepRunner(),
      /workflow coordinator/,
    );
    t.end();
  });

test('WorkflowStepRunner advances a durable workflow through the shared ' +
  'owner lane', async (t) => {
  const persisted = [];
  const workflowCoordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async (workflow) => {
      persisted.push({
        workflowId: workflow.workflowId,
        step: workflow.step,
        status: workflow.status,
      });
    },
    now: () => FIXTURE_NOW_MS,
  });
  await workflowCoordinator.registerWorkflow({
    workflowId: 'wf-1',
    ownerKey: 'partition:p-1',
    step: 'admission_pending',
    status: 'admission_pending',
    transitionHistory: [],
  });

  const runner = new WorkflowStepRunner({
    workflowCoordinator,
    timeoutPolicy: new TimeoutPolicy({
      operationName: 'split',
      configuredBudgetMs: 1000,
      now: () => FIXTURE_NOW_MS,
    }),
    now: () => FIXTURE_NOW_MS,
  });

  const result = await runner.runStep({
    workflowId: 'wf-1',
    stepName: 'prepare_split',
    requestedBudgetMs: 400,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
    timeoutError: 'prepare split timed out',
    execute: async ({workflow, timeoutBudget}) => {
      t.equal(workflow.workflowId, 'wf-1');
      t.equal(timeoutBudget.configuredBudgetMs, 400);
      return {
        nextStep: 'split_preparing',
        reason: 'prepared',
        updates: {
          status: 'split_preparing',
          metadata: {prepared: true},
        },
        result: {ok: true},
      };
    },
  });

  const workflow = workflowCoordinator.getWorkflowById('wf-1');
  t.same(result, {ok: true});
  t.equal(workflow.step, 'split_preparing');
  t.equal(workflow.status, 'split_preparing');
  t.same(workflow.metadata, {prepared: true});
  t.equal(persisted.at(-1).step, 'split_preparing');
});
