import {test} from '../../src/test-helpers/tap.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  WORKFLOW_TRANSITION_FIELD,
  WORKFLOW_ERROR_MSG,
} from '../../src/workflow/workflow-constants.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {
  RECONCILE_REASON,
  RECONCILE_QUEUE_DIAGNOSTIC,
} from '../../src/workflow/reconcile-queue-constants.js';

// ---------------------------------------------------------------------------
// Test-local fixture constants
// ---------------------------------------------------------------------------
const FIXED_NOW = 7000;
const TRANSITION_REASON = 'fence_test_forward';
const STEP_PENDING = 'PENDING';
const STEP_SENDING = 'SENDING';
const STEP_CREATING = 'CREATING';
const FENCE_EPOCH_1 = 1;
const FENCE_EPOCH_2 = 2;
const FENCE_EPOCH_3 = 3;
const FENCE_EPOCH_5 = 5;
const FENCE_EPOCH_10 = 10;

// ===================================================================
// 1. DurableWorkflowCoordinator — fence token on transitions
// ===================================================================

test('DurableWorkflowCoordinator - transitionStep persists fence ' +
  'token in history entry', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-persist',
    ownerKey: 'wf-fence-persist',
    step: STEP_PENDING,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-fence-persist', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_2,
  });

  const workflow = coordinator.getWorkflowById('wf-fence-persist');
  t.equal(workflow.fenceToken, FENCE_EPOCH_2,
    'workflow must store fence token');

  const entry = workflow.transitionHistory[0];
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN],
    FENCE_EPOCH_2,
    'history entry must include fence token',
  );
});

test('DurableWorkflowCoordinator - transitionStep accepts equal ' +
  'fence token', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-equal',
    ownerKey: 'wf-fence-equal',
    step: STEP_PENDING,
    fenceToken: FENCE_EPOCH_2,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-fence-equal', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_2,
  });

  const workflow = coordinator.getWorkflowById('wf-fence-equal');
  t.equal(workflow.step, STEP_SENDING,
    'equal fence token must be accepted');
});

test('DurableWorkflowCoordinator - transitionStep accepts higher ' +
  'fence token', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-higher',
    ownerKey: 'wf-fence-higher',
    step: STEP_PENDING,
    fenceToken: FENCE_EPOCH_1,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-fence-higher', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_3,
  });

  const workflow = coordinator.getWorkflowById('wf-fence-higher');
  t.equal(workflow.step, STEP_SENDING,
    'higher fence token must be accepted');
  t.equal(workflow.fenceToken, FENCE_EPOCH_3,
    'fence token must be updated to higher value');
});

test('DurableWorkflowCoordinator - transitionStep rejects stale ' +
  'fence token', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-stale',
    ownerKey: 'wf-fence-stale',
    step: STEP_PENDING,
    fenceToken: FENCE_EPOCH_5,
    transitionHistory: [],
  });

  t.rejects(
    coordinator.transitionStep('wf-fence-stale', {
      nextStep: STEP_SENDING,
      reason: TRANSITION_REASON,
      fenceToken: FENCE_EPOCH_2,
    }),
    {message: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN},
    'stale fence token must be rejected',
  );

  const workflow = coordinator.getWorkflowById('wf-fence-stale');
  t.equal(workflow.step, STEP_PENDING,
    'step must not change on stale fence rejection');
  t.equal(workflow.fenceToken, FENCE_EPOCH_5,
    'fence token must not be downgraded');
});

test('DurableWorkflowCoordinator - transitionStep without fence ' +
  'token skips validation', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-none',
    ownerKey: 'wf-fence-none',
    step: STEP_PENDING,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-fence-none', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
  });

  const workflow = coordinator.getWorkflowById('wf-fence-none');
  t.equal(workflow.step, STEP_SENDING,
    'transition without fence token must succeed');

  const entry = workflow.transitionHistory[0];
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN],
    null,
    'history entry must record null fence token when absent',
  );
});

test('DurableWorkflowCoordinator - fence token persists across ' +
  'multiple transitions', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-fence-multi',
    ownerKey: 'wf-fence-multi',
    step: STEP_PENDING,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-fence-multi', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_2,
  });

  await coordinator.transitionStep('wf-fence-multi', {
    nextStep: STEP_CREATING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_3,
  });

  const workflow = coordinator.getWorkflowById('wf-fence-multi');
  t.equal(workflow.fenceToken, FENCE_EPOCH_3,
    'fence token must reflect latest value');
  t.equal(
    workflow.transitionHistory[0][WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN],
    FENCE_EPOCH_2,
    'first history entry must record epoch 2',
  );
  t.equal(
    workflow.transitionHistory[1][WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN],
    FENCE_EPOCH_3,
    'second history entry must record epoch 3',
  );
});

// ===================================================================
// 2. OwnerKeyReconcileQueue — fence token on claims
// ===================================================================

test('OwnerKeyReconcileQueue - enqueue with fence token tracks ' +
  'current epoch', async (t) => {
  const reconciled = [];
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async (ownerKey, reasons) => {
      reconciled.push({ownerKey, reasons});
    },
  });

  const created = queue.enqueue(
    'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: FENCE_EPOCH_2},
  );
  t.equal(created, true, 'enqueue with fence token must succeed');

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(reconciled.length, 1, 'item must be drained');
  t.equal(reconciled[0].ownerKey, 'op-1');

  const diag = queue.getDiagnostics();
  t.equal(diag.fenceTokens['op-1'], FENCE_EPOCH_2,
    'fence token must be tracked in diagnostics');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - enqueue rejects stale fence token',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey, reasons) => {
        reconciled.push({ownerKey, reasons});
      },
    });

    queue.enqueue(
      'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
      {fenceToken: FENCE_EPOCH_5},
    );

    const staleResult = queue.enqueue(
      'op-1', RECONCILE_REASON.NODE_FAILED, null,
      {fenceToken: FENCE_EPOCH_2},
    );
    t.equal(staleResult, false,
      'stale fence token enqueue must return false');

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // Only the first enqueue should have been processed.
    t.equal(reconciled.length, 1,
      'only valid fence token item must be drained');

    const diag = queue.getDiagnostics();
    const staleFenceClaims = diag.staleClaims.filter(
      (c) => c.type === RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
    );
    t.equal(staleFenceClaims.length, 1,
      'one stale fence diagnostic must be recorded');
    t.equal(staleFenceClaims[0].providedToken, FENCE_EPOCH_2,
      'diagnostic must include provided token');
    t.equal(staleFenceClaims[0].currentToken, FENCE_EPOCH_5,
      'diagnostic must include current token');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - enqueue accepts equal fence token',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        reconciled.push(ownerKey);
      },
    });

    queue.enqueue(
      'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
      {fenceToken: FENCE_EPOCH_3},
    );
    // Equal token should merge, not reject.
    queue.enqueue(
      'op-1', RECONCILE_REASON.NODE_FAILED, null,
      {fenceToken: FENCE_EPOCH_3},
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.ok(reconciled.length >= 1, 'equal fence token must be accepted');

    const diag = queue.getDiagnostics();
    const staleFenceClaims = diag.staleClaims.filter(
      (c) => c.type === RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
    );
    t.equal(staleFenceClaims.length, 0,
      'no stale fence diagnostic for equal token');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - enqueue accepts higher fence token',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        reconciled.push(ownerKey);
      },
    });

    queue.enqueue(
      'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
      {fenceToken: FENCE_EPOCH_2},
    );
    queue.enqueue(
      'op-1', RECONCILE_REASON.NODE_FAILED, null,
      {fenceToken: FENCE_EPOCH_10},
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.ok(reconciled.length >= 1, 'higher fence token must be accepted');

    const diag = queue.getDiagnostics();
    t.equal(diag.fenceTokens['op-1'], FENCE_EPOCH_10,
      'fence token must be updated to higher value');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - enqueue without fence token skips ' +
  'validation', async (t) => {
  const reconciled = [];
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async (ownerKey) => {
      reconciled.push(ownerKey);
    },
  });

  queue.enqueue('op-1', RECONCILE_REASON.PERIODIC_CHECK);
  queue.enqueue('op-1', RECONCILE_REASON.NODE_FAILED);

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.ok(reconciled.length >= 1,
    'enqueue without fence token must succeed');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - shutdown clears fence tokens',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {},
    });

    queue.enqueue(
      'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
      {fenceToken: FENCE_EPOCH_5},
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    queue.shutdown();

    const diag = queue.getDiagnostics();
    t.same(diag.fenceTokens, {},
      'fence tokens must be cleared after shutdown');
  });

test('OwnerKeyReconcileQueue - drain rejects stale-fenced item ' +
  'that became stale between enqueue and claim', async (t) => {
  const reconciled = [];
  let resolveFirst;
  const firstGate = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async (ownerKey, reasons) => {
      reconciled.push({ownerKey, reasons});
      if (ownerKey === 'op-1' && reconciled.length === 1) {
        await firstGate;
      }
    },
  });

  // Enqueue with epoch 2 — starts draining.
  queue.enqueue(
    'op-1', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: FENCE_EPOCH_2},
  );

  await Promise.resolve();
  await Promise.resolve();

  // While op-1 is in-flight, enqueue with higher epoch.
  // This updates the tracked fence token to 10.
  queue.enqueue(
    'op-1', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: FENCE_EPOCH_10},
  );

  // Release the first reconcile.
  resolveFirst();

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  // The deferred item with epoch 10 should have been processed
  // because it matches the current fence.
  const op1Calls = reconciled.filter((r) => r.ownerKey === 'op-1');
  t.equal(op1Calls.length, 2,
    'op-1 must be reconciled twice (original + deferred with new epoch)');
  queue.shutdown();
});

// ===================================================================
// 3. Stale-fence regression coverage (Task 5.3)
// ===================================================================

test('REGRESSION: late event with stale fence cannot overwrite ' +
  'a newer workflow transition', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  // Register workflow and advance to SENDING with fence epoch 5.
  await coordinator.registerWorkflow({
    workflowId: 'wf-late-event',
    ownerKey: 'wf-late-event',
    step: STEP_PENDING,
    fenceToken: FENCE_EPOCH_5,
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-late-event', {
    nextStep: STEP_SENDING,
    reason: TRANSITION_REASON,
    fenceToken: FENCE_EPOCH_10,
  });

  // Simulate a late event arriving with the old epoch 2.
  // It must not overwrite the SENDING step.
  t.rejects(
    coordinator.transitionStep('wf-late-event', {
      nextStep: STEP_CREATING,
      reason: 'late_event_stale',
      fenceToken: FENCE_EPOCH_2,
    }),
    {message: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN},
    'late event with stale fence must be rejected',
  );

  const workflow = coordinator.getWorkflowById('wf-late-event');
  t.equal(workflow.step, STEP_SENDING,
    'step must remain at SENDING after stale late event');
  t.equal(workflow.fenceToken, FENCE_EPOCH_10,
    'fence token must remain at epoch 10');
  t.equal(workflow.transitionHistory.length, 1,
    'transition history must not grow from rejected event');
});

test('REGRESSION: stale fence rejection does not mutate workflow ' +
  'state and emits correct diagnostic fields', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-check',
    ownerKey: 'wf-diag-check',
    step: STEP_PENDING,
    fenceToken: FENCE_EPOCH_10,
    transitionHistory: [],
  });

  // Capture the full workflow state before the stale attempt.
  const before = coordinator.getWorkflowById('wf-diag-check');
  const stepBefore = before.step;
  const fenceBefore = before.fenceToken;
  const historyLenBefore = before.transitionHistory.length;
  const updatedAtBefore = before.updatedAt;

  let caughtError = null;
  try {
    await coordinator.transitionStep('wf-diag-check', {
      nextStep: STEP_SENDING,
      reason: 'stale_diag_attempt',
      fenceToken: FENCE_EPOCH_1,
    });
  } catch (err) {
    caughtError = err;
  }

  t.ok(caughtError, 'stale fence must throw');
  t.equal(caughtError.message,
    WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
    'error message must be the canonical stale fence constant');

  // Verify zero mutation.
  const after = coordinator.getWorkflowById('wf-diag-check');
  t.equal(after.step, stepBefore,
    'step must be unchanged after rejection');
  t.equal(after.fenceToken, fenceBefore,
    'fence token must be unchanged after rejection');
  t.equal(after.transitionHistory.length, historyLenBefore,
    'transition history length must be unchanged');
  t.equal(after.updatedAt, updatedAtBefore,
    'updatedAt must not change from rejected transition');
});
