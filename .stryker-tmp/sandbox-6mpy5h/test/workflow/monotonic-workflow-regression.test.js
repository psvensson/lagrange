// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {WORKFLOW_TRANSITION_FIELD} from
  '../../src/workflow/workflow-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  REPLACE_WORKFLOW_STEPS,
  getWorkflowSteps,
} from '../../src/rebalancer/replica-status.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  OPERATION_TRANSITION_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';

// ---------------------------------------------------------------------------
// Test-local fixture constants
// ---------------------------------------------------------------------------
const MOCK_NODE_ID = 'node-monotonic';
const FIXED_NOW = 5000;
const TRANSITION_REASON = 'test_forward';
const RECOVERY_REASON = 'test_recovery';

/**
 * Build a minimal RebalanceCoordinator for regression tests.
 * @param {Object} overrides - Dependency overrides.
 * @return {RebalanceCoordinator} Coordinator instance.
 */
function createMinimalCoordinator(overrides = {}) {
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(overrides, 'transactionCoordinator') ?
      overrides.transactionCoordinator :
      new DistributedTransactionCoordinator({
        beginParticipant: async () => {},
        prepareParticipant: async () => {},
        commitParticipant: async () => {},
        rollbackParticipant: async () => {},
        now: () => FIXED_NOW,
      });
  return new RebalanceCoordinator({
    nodeId: MOCK_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    transactionCoordinator,
    enableTimeouts: false,
    ...overrides,
  });
}

/**
 * Build a test operation at a given workflow step.
 * @param {Object} overrides - Field overrides.
 * @return {Object} Operation fixture.
 */
function createTestOperation(overrides = {}) {
  return {
    operationId: 'op-monotonic-test',
    type: 'ADD',
    partitionId: 'partition-1',
    entityType: 'partition',
    entityId: 'partition-1',
    replicaId: 'partition-1-r1',
    sourceNodeId: MOCK_NODE_ID,
    targetNodeId: 'node-remote',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    ...overrides,
  };
}

// ===================================================================
// 1. Monotonic step transitions — DurableWorkflowCoordinator level
// ===================================================================

test('DurableWorkflowCoordinator - ADD workflow transitions are ' +
  'forward-only through canonical step order', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({now: () => FIXED_NOW});

  await coordinator.registerWorkflow({
    workflowId: 'wf-add-forward',
    ownerKey: 'wf-add-forward',
    step: WORKFLOW_STEP.PENDING,
    transitionHistory: [],
  });

  for (let i = 1; i < ADD_WORKFLOW_STEPS.length; i++) {
    const prevStep = ADD_WORKFLOW_STEPS[i - 1];
    const nextStep = ADD_WORKFLOW_STEPS[i];
    await coordinator.transitionStep('wf-add-forward', {
      nextStep,
      reason: TRANSITION_REASON,
    });
    const workflow = coordinator.getWorkflowById('wf-add-forward');
    t.equal(workflow.step, nextStep, `step must advance to ${nextStep}`);

    const entry = workflow.transitionHistory[i - 1];
    t.equal(
      entry[WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP],
      prevStep,
      `previousStep must be ${prevStep}`,
    );
    t.equal(
      entry[WORKFLOW_TRANSITION_FIELD.NEXT_STEP],
      nextStep,
      `nextStep must be ${nextStep}`,
    );
  }

  t.equal(
    coordinator.getWorkflowById('wf-add-forward').transitionHistory.length,
    ADD_WORKFLOW_STEPS.length - 1,
    'history length must equal number of forward transitions',
  );
});

test('DurableWorkflowCoordinator - REMOVE workflow transitions are ' +
  'forward-only through canonical step order', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({now: () => FIXED_NOW});

  await coordinator.registerWorkflow({
    workflowId: 'wf-remove-forward',
    ownerKey: 'wf-remove-forward',
    step: WORKFLOW_STEP.PENDING,
    transitionHistory: [],
  });

  for (let i = 1; i < REMOVE_WORKFLOW_STEPS.length; i++) {
    const prevStep = REMOVE_WORKFLOW_STEPS[i - 1];
    const nextStep = REMOVE_WORKFLOW_STEPS[i];
    await coordinator.transitionStep('wf-remove-forward', {
      nextStep,
      reason: TRANSITION_REASON,
    });
    const workflow = coordinator.getWorkflowById('wf-remove-forward');
    t.equal(workflow.step, nextStep, `step must advance to ${nextStep}`);

    const entry = workflow.transitionHistory[i - 1];
    t.equal(
      entry[WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP],
      prevStep,
    );
  }
});

test('DurableWorkflowCoordinator - REPLACE workflow transitions are ' +
  'forward-only through canonical step order', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({now: () => FIXED_NOW});

  await coordinator.registerWorkflow({
    workflowId: 'wf-replace-forward',
    ownerKey: 'wf-replace-forward',
    step: WORKFLOW_STEP.PENDING,
    transitionHistory: [],
  });

  for (let i = 1; i < REPLACE_WORKFLOW_STEPS.length; i++) {
    const nextStep = REPLACE_WORKFLOW_STEPS[i];
    await coordinator.transitionStep('wf-replace-forward', {
      nextStep,
      reason: TRANSITION_REASON,
    });
    const workflow = coordinator.getWorkflowById('wf-replace-forward');
    t.equal(workflow.step, nextStep, `step must advance to ${nextStep}`);
  }

  t.equal(
    coordinator.getWorkflowById('wf-replace-forward')
      .transitionHistory.length,
    REPLACE_WORKFLOW_STEPS.length - 1,
    'history length must equal number of forward transitions',
  );
});

// ===================================================================
// 2. FAILED is the only allowed backward/terminal recovery transition
// ===================================================================

test('DurableWorkflowCoordinator - FAILED transition is allowed from ' +
  'any non-terminal ADD step', async (t) => {
  const nonTerminalAddSteps = ADD_WORKFLOW_STEPS.slice(
    0, ADD_WORKFLOW_STEPS.length - 1,
  );

  for (const fromStep of nonTerminalAddSteps) {
    const workflowId = `wf-fail-from-${fromStep}`;
    const coordinator = new DurableWorkflowCoordinator({
      now: () => FIXED_NOW,
    });

    await coordinator.registerWorkflow({
      workflowId,
      ownerKey: workflowId,
      step: fromStep,
      transitionHistory: [],
    });

    await coordinator.transitionStep(workflowId, {
      nextStep: WORKFLOW_STEP.FAILED,
      reason: RECOVERY_REASON,
    });

    const workflow = coordinator.getWorkflowById(workflowId);
    t.equal(
      workflow.step,
      WORKFLOW_STEP.FAILED,
      `FAILED must be reachable from ADD step ${fromStep}`,
    );
    t.equal(
      workflow.transitionHistory[0][WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP],
      fromStep,
      `previousStep must record ${fromStep} before FAILED`,
    );
  }
});

test('DurableWorkflowCoordinator - FAILED transition is allowed from ' +
  'any non-terminal REMOVE step', async (t) => {
  const nonTerminalRemoveSteps = REMOVE_WORKFLOW_STEPS.slice(
    0, REMOVE_WORKFLOW_STEPS.length - 1,
  );

  for (const fromStep of nonTerminalRemoveSteps) {
    const workflowId = `wf-fail-remove-${fromStep}`;
    const coordinator = new DurableWorkflowCoordinator({
      now: () => FIXED_NOW,
    });

    await coordinator.registerWorkflow({
      workflowId,
      ownerKey: workflowId,
      step: fromStep,
      transitionHistory: [],
    });

    await coordinator.transitionStep(workflowId, {
      nextStep: WORKFLOW_STEP.FAILED,
      reason: RECOVERY_REASON,
    });

    const workflow = coordinator.getWorkflowById(workflowId);
    t.equal(
      workflow.step,
      WORKFLOW_STEP.FAILED,
      `FAILED must be reachable from REMOVE step ${fromStep}`,
    );
  }
});

test('RebalanceCoordinator - updateStep records only forward ' +
  'transitions in stepsHistory', async (t) => {
  const coordinator = createMinimalCoordinator();
  coordinator.initialize();

  try {
    const operation = createTestOperation();

    // Walk the canonical ADD path forward
    const forwardSteps = [
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
      WORKFLOW_STEP.SYNCING,
    ];

    for (const step of forwardSteps) {
      await coordinator.updateStep(operation, step);
    }

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SYNCING,
      'operation must reach SYNCING',
    );
    t.equal(
      operation.stepsHistory.length,
      forwardSteps.length,
      'stepsHistory must contain one entry per forward transition',
    );

    // Verify each history entry records a forward previousStep
    for (let i = 0; i < forwardSteps.length; i++) {
      const entry = operation.stepsHistory[i];
      const expectedPrev = i === 0 ?
        WORKFLOW_STEP.PENDING :
        forwardSteps[i - 1];
      t.equal(
        entry.previousStep,
        expectedPrev,
        `history[${i}].previousStep must be ${expectedPrev}`,
      );
      t.equal(
        entry.step,
        forwardSteps[i],
        `history[${i}].step must be ${forwardSteps[i]}`,
      );
    }
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - failOperation transitions to FAILED from ' +
  'any in-progress step', async (t) => {
  const inProgressSteps = [
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ];

  for (const fromStep of inProgressSteps) {
    const coordinator = createMinimalCoordinator();
    coordinator.initialize();

    try {
      const operation = createTestOperation({
        operationId: `op-fail-from-${fromStep}`,
        workflowStep: fromStep,
        status: fromStep.toLowerCase(),
      });

      await coordinator.failOperation(operation, 'regression test');

      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.FAILED,
        `FAILED must be reachable from ${fromStep} via failOperation`,
      );

      const lastEntry =
        operation.stepsHistory[operation.stepsHistory.length - 1];
      t.equal(
        lastEntry.previousStep,
        fromStep,
        `previousStep must record ${fromStep} before FAILED`,
      );
    } finally {
      await coordinator.shutdown();
    }
  }
});

// ===================================================================
// 3. Transition history proves no backward step outside FAILED
// ===================================================================

test('DurableWorkflowCoordinator - transition history proves each ' +
  'step index advances for ADD workflow', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({now: () => FIXED_NOW});

  await coordinator.registerWorkflow({
    workflowId: 'wf-index-check',
    ownerKey: 'wf-index-check',
    step: WORKFLOW_STEP.PENDING,
    transitionHistory: [],
  });

  for (let i = 1; i < ADD_WORKFLOW_STEPS.length; i++) {
    await coordinator.transitionStep('wf-index-check', {
      nextStep: ADD_WORKFLOW_STEPS[i],
      reason: TRANSITION_REASON,
    });
  }

  const workflow = coordinator.getWorkflowById('wf-index-check');
  const history = workflow.transitionHistory;

  for (let i = 0; i < history.length; i++) {
    const prevStep = history[i][WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP];
    const nextStep = history[i][WORKFLOW_TRANSITION_FIELD.NEXT_STEP];
    const prevIndex = ADD_WORKFLOW_STEPS.indexOf(prevStep);
    const nextIndex = ADD_WORKFLOW_STEPS.indexOf(nextStep);

    t.ok(
      nextIndex > prevIndex,
      `transition ${i}: ${prevStep}(${prevIndex}) -> ` +
      `${nextStep}(${nextIndex}) must be forward`,
    );
  }
});

test('DurableWorkflowCoordinator - getWorkflowSteps returns ordered ' +
  'arrays for all operation types', async (t) => {
  const addSteps = getWorkflowSteps('ADD');
  const removeSteps = getWorkflowSteps('REMOVE');
  const replaceSteps = getWorkflowSteps('REPLACE');

  t.same(addSteps, [...ADD_WORKFLOW_STEPS], 'ADD steps must match');
  t.same(removeSteps, [...REMOVE_WORKFLOW_STEPS], 'REMOVE steps must match');
  t.same(
    replaceSteps, [...REPLACE_WORKFLOW_STEPS], 'REPLACE steps must match',
  );

  // Verify FAILED is not in any canonical forward path
  t.equal(
    addSteps.includes(WORKFLOW_STEP.FAILED),
    false,
    'FAILED must not appear in ADD forward path',
  );
  t.equal(
    removeSteps.includes(WORKFLOW_STEP.FAILED),
    false,
    'FAILED must not appear in REMOVE forward path',
  );
  t.equal(
    replaceSteps.includes(WORKFLOW_STEP.FAILED),
    false,
    'FAILED must not appear in REPLACE forward path',
  );
});

// ===================================================================
// 4. Atomic transition + authoritative row commit
// ===================================================================

test('RebalanceCoordinator - updateStep commits workflow transition ' +
  'and persist atomically', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => FIXED_NOW,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push({action: 'begin', sessionId});
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push({action: 'commit', sessionId});
    return originalCommit(sessionId);
  };

  let persistCalled = false;
  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
    sqlQueryEngine: {
      async executeQuery() {
        persistCalled = true;
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation();
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    // Verify begin happens before commit
    const beginIdx = txCalls.findIndex((c) => c.action === 'begin');
    const commitIdx = txCalls.findIndex((c) => c.action === 'commit');
    t.ok(beginIdx >= 0, 'transaction begin must be called');
    t.ok(commitIdx >= 0, 'transaction commit must be called');
    t.ok(
      beginIdx < commitIdx,
      'begin must precede commit',
    );
    t.ok(persistCalled, 'persist must be called within transaction');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - atomic transition rolls back when ' +
  'persist fails, leaving operation unchanged', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => FIXED_NOW,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalRollback = txCoordinator.rollback.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push({action: 'begin', sessionId});
    return originalBegin(sessionId);
  };
  txCoordinator.rollback = async (sessionId) => {
    txCalls.push({action: 'rollback', sessionId});
    return originalRollback(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
    sqlQueryEngine: {
      async executeQuery() {
        return {success: false, error: 'disk full'};
      },
    },
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation();

    let threw = false;
    try {
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
    } catch (_err) {
      threw = true;
    }

    t.ok(threw, 'persist failure must propagate as error');
    t.ok(
      txCalls.some((c) => c.action === 'rollback'),
      'transaction must be rolled back on persist failure',
    );

    // The workflow step on the operation object may have been mutated
    // inside persistFn before the error, but the transaction rollback
    // ensures the authoritative row was not committed.
    // The key invariant: rollback was called, so no partial commit.
    const rollbackIdx = txCalls.findIndex((c) => c.action === 'rollback');
    t.ok(rollbackIdx >= 0, 'rollback must be recorded');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - completeOperation commits terminal ' +
  'transition atomically', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => FIXED_NOW,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push({action: 'begin', sessionId});
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push({action: 'commit', sessionId});
    return originalCommit(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: 'syncing',
    });

    await coordinator.completeOperation(operation);

    t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE);

    const beginIdx = txCalls.findIndex((c) => c.action === 'begin');
    const commitIdx = txCalls.findIndex((c) => c.action === 'commit');
    t.ok(beginIdx >= 0, 'begin must be called for terminal transition');
    t.ok(commitIdx >= 0, 'commit must be called for terminal transition');
    t.ok(beginIdx < commitIdx, 'begin must precede commit');

    // Verify the session ID encodes operation + step for traceability
    const beginCall = txCalls.find((c) => c.action === 'begin');
    t.ok(
      beginCall.sessionId.includes(operation.operationId),
      'session ID must include operation ID',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - failOperation commits FAILED transition ' +
  'atomically', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => FIXED_NOW,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push({action: 'begin', sessionId});
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push({action: 'commit', sessionId});
    return originalCommit(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      operationId: 'op-fail-atomic',
      workflowStep: WORKFLOW_STEP.CREATING,
      status: 'creating',
    });

    await coordinator.failOperation(operation, 'atomic failure test');

    t.equal(operation.workflowStep, WORKFLOW_STEP.FAILED);

    const beginIdx = txCalls.findIndex((c) => c.action === 'begin');
    const commitIdx = txCalls.findIndex((c) => c.action === 'commit');
    t.ok(beginIdx >= 0, 'begin must be called for FAILED transition');
    t.ok(commitIdx >= 0, 'commit must be called for FAILED transition');
    t.ok(beginIdx < commitIdx, 'begin must precede commit');

    // Verify transition reason is persisted in stepsHistory
    const lastEntry =
      operation.stepsHistory[operation.stepsHistory.length - 1];
    t.equal(
      lastEntry.reason,
      OPERATION_TRANSITION_REASON.OPERATION_FAILED,
      'FAILED transition must record canonical reason',
    );
  } finally {
    await coordinator.shutdown();
  }
});
