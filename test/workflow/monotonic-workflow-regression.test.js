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

// ---------------------------------------------------------------------------
// Test-local fixture constants
// ---------------------------------------------------------------------------
const MOCK_NODE_ID = 'node-monotonic';
const FIXED_NOW = 5000;
const TRANSITION_REASON = 'test_forward';
const RECOVERY_REASON = 'test_recovery';
const REPLICA_OPERATION_SELECT_BY_ID_QUERY =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const REPLICA_OPERATION_UPDATE_QUERY_FRAGMENT = 'UPDATE replica_operations';
const DEFAULT_SQL_MUTATION_RESULT = Object.freeze({
  success: true,
  rows: [],
  changes: 1,
});

function buildPersistedReplicaOperationRowFromUpdate(
  params = [],
  existingRow = {},
) {
  return {
    ...existingRow,
    operation_id: params[7] || existingRow.operation_id || null,
    type: existingRow.type || 'ADD',
    partition_id: existingRow.partition_id || 'partition-1',
    replica_id: params[6] ?? existingRow.replica_id ?? null,
    source_node_id: existingRow.source_node_id || MOCK_NODE_ID,
    target_node_id: existingRow.target_node_id || 'node-remote',
    status: params[0] ?? existingRow.status ?? null,
    workflow_step: params[1] ?? existingRow.workflow_step ?? null,
    created_at: existingRow.created_at ?? FIXED_NOW,
    updated_at: params[2] ?? existingRow.updated_at ?? FIXED_NOW,
    completed_at: params[3] ?? existingRow.completed_at ?? null,
    error_message: params[4] ?? existingRow.error_message ?? null,
    steps_history: params[5] ?? existingRow.steps_history ?? JSON.stringify([]),
    entity_type: existingRow.entity_type || 'partition',
    entity_id: existingRow.entity_id || 'partition-1',
  };
}

/**
 * Build a minimal RebalanceCoordinator for regression tests.
 * @param {Object} overrides - Dependency overrides.
 * @return {RebalanceCoordinator} Coordinator instance.
 */
function createMinimalCoordinator(overrides = {}) {
  const {
    sqlQueryEngine: overrideSqlQueryEngine,
    controlPlaneSystemTableGateway: overrideControlPlaneSystemTableGateway,
    ...coordinatorOverrides
  } = overrides;
  const authoritativeReplicaOperations = new Map();
  const baseSqlQueryEngine = overrideSqlQueryEngine || {
    async executeQuery() {
      return DEFAULT_SQL_MUTATION_RESULT;
    },
  };
  const sqlQueryEngine = {
    async executeQuery(sql, params = [], queryOptions = {}) {
      if (sql.includes(REPLICA_OPERATION_SELECT_BY_ID_QUERY)) {
        const operationId = params[0] || null;
        const operationRow = authoritativeReplicaOperations.get(operationId);
        return {
          success: true,
          rows: operationRow ? [operationRow] : [],
          changes: operationRow ? 1 : 0,
        };
      }

      const result = await baseSqlQueryEngine.executeQuery(
        sql,
        params,
        queryOptions,
      );
      if (result?.success === false) {
        return result;
      }

      if (sql.includes(REPLICA_OPERATION_UPDATE_QUERY_FRAGMENT)) {
        const operationId = params[7] || null;
        const existingRow = authoritativeReplicaOperations.get(operationId) || {};
        authoritativeReplicaOperations.set(
          operationId,
          buildPersistedReplicaOperationRowFromUpdate(params, existingRow),
        );
      }

      return result;
    },
  };
  const controlPlaneSystemTableGateway = overrideControlPlaneSystemTableGateway || {
    async executeQuery(sql, params = [], queryOptions = {}) {
      return sqlQueryEngine.executeQuery(sql, params, queryOptions);
    },
    async readAuthoritativeRows(_tableName, sql, params = []) {
      return sqlQueryEngine.executeQuery(sql, params);
    },
    async readRows(_tableName, sql, params = []) {
      return sqlQueryEngine.executeQuery(sql, params);
    },
  };
  const coordinator = new RebalanceCoordinator({
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
    sqlQueryEngine,
    controlPlaneSystemTableGateway,
    enableTimeouts: false,
    ...coordinatorOverrides,
  });
  coordinator.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 0;
  coordinator.repository.replicaOperationAuthoritativeVisibilityRetryDelayMs = 0;
  return coordinator;
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
// 4. Guarded autocommit transition + authoritative row commit
// ===================================================================

test('RebalanceCoordinator - updateStep persists once through the guarded ' +
  'autocommit lane', async (t) => {
  const persistCalls = [];
  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery(sql, params, queryOptions) {
        persistCalls.push({sql, params, queryOptions});
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation();
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(persistCalls.length, 1, 'transition must persist exactly once');
    t.equal(
      persistCalls[0].queryOptions?.disableSystemWriteSession,
      true,
      'the rebalancer delegates commit mode through independent autocommit',
    );
    t.equal(persistCalls[0].queryOptions?.sessionId, undefined,
      'the rebalancer must not manufacture a transaction session');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - guarded transition propagates a durable ' +
  'persist failure', async (t) => {
  let persistAttempts = 0;
  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery() {
        persistAttempts += 1;
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
    t.equal(persistAttempts, 1,
      'the guarded durable mutation must not fork into another write path');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - completeOperation persists one terminal ' +
  'transition', async (t) => {
  let persistCalls = 0;
  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (sql.includes(REPLICA_OPERATION_UPDATE_QUERY_FRAGMENT)) {
          persistCalls += 1;
        }
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: 'syncing',
    });

    await coordinator.completeOperation(operation);

    t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE);
    t.equal(persistCalls, 1, 'terminal transition must persist exactly once');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator - failOperation persists one FAILED transition',
  async (t) => {
    let persistCalls = 0;
    const coordinator = createMinimalCoordinator({
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (sql.includes(REPLICA_OPERATION_UPDATE_QUERY_FRAGMENT)) {
            persistCalls += 1;
          }
          return {success: true, rows: [], changes: 1};
        },
      },
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
      t.equal(persistCalls, 1, 'FAILED transition must persist exactly once');

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
