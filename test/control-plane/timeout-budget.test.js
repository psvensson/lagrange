import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  buildControlPlaneQueryOptions,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../../src/control-plane/timeout-budget.js';

test('timeout budget marks exact configured boundaries as boundary hits',
  async (t) => {
    for (const configuredBudgetMs of [4000, 6000, 30000, 60000]) {
      const budget = createTimeoutBudget({
        configuredBudgetMs,
        startedAtMs: 1000,
        now: () => 1000,
      });
      const classification = buildTimeoutClassification({
        budget,
        classification:
          TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        nestedOperation: `boundary-${configuredBudgetMs}`,
        now: () => 1000 + configuredBudgetMs,
      });

      t.equal(classification.configuredBudgetMs, configuredBudgetMs);
      t.equal(classification.remainingBudgetMs, 0);
      t.equal(classification.boundaryHit, true);
      t.equal(
        classification.classification,
        TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
      );
      t.equal(
        classification.originalClassification,
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      );
    }
  });

test('timeout budget refuses child operations when remaining budget is too low',
  async (t) => {
    const parentBudget = createTimeoutBudget({
      configuredBudgetMs: 30,
      startedAtMs: 1000,
      now: () => 1000,
    });
    const allocation = createChildTimeoutBudget(parentBudget, {
      requestedBudgetMs: 30,
      minimumBudgetMs: 5,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: 'cache_wait',
      now: () => 1028,
    });

    t.equal(allocation.allowed, false);
    t.equal(allocation.remainingBudgetMs, 2);
    t.equal(
      allocation.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
    );
    t.equal(
      allocation.timeoutClassification.nestedOperation,
      'cache_wait',
    );
  });

test('timeout budget grants child operations only the remaining budget',
  async (t) => {
    const parentBudget = createTimeoutBudget({
      configuredBudgetMs: 30,
      startedAtMs: 1000,
      now: () => 1000,
    });
    const allocation = createChildTimeoutBudget(parentBudget, {
      requestedBudgetMs: 30,
      minimumBudgetMs: 5,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation: 'cache_wait',
      now: () => 1012,
    });

    t.equal(allocation.allowed, true);
    t.equal(allocation.grantedBudgetMs, 18);
    t.equal(
      allocation.budget.configuredBudgetMs,
      18,
    );
    t.equal(
      allocation.budget.deadlineMs,
      1030,
    );
  });

test('timeout budget errors expose structured timeout classification',
  async (t) => {
    const budget = createTimeoutBudget({
      configuredBudgetMs: 40,
      startedAtMs: 1000,
      now: () => 1000,
    });
    const error = createTimeoutBudgetError({
      message: 'timed out waiting for visibility',
      budget,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation: 'visibility_wait',
      now: () => 1040,
    });

    t.equal(error.message, 'timed out waiting for visibility');
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
    );
    t.equal(
      error.timeoutClassification.originalClassification,
      TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
    );
    t.equal(error.timeoutClassification.boundaryHit, true);
    t.equal(error.timeoutClassification.configuredBudgetMs, 40);
  });

test('control-plane query options use the shared hard timeout by default',
  async (t) => {
    const queryOptions = buildControlPlaneQueryOptions();
    t.equal(
      queryOptions.timeoutMs,
      CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
    );
  });

test('control-plane query options clamp timeout to remaining budget',
  async (t) => {
    const timeoutBudget = createTimeoutBudget({
      configuredBudgetMs: 30,
      startedAtMs: 1000,
      now: () => 1000,
    });
    const queryOptions = buildControlPlaneQueryOptions({
      timeoutBudget,
      requestedTimeoutMs:
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
      now: () => 1024,
    });
    t.equal(queryOptions.timeoutMs, 6);
  });

// --- Task 6.1: Top-level budgets and derived sub-budgets ---

import {
  TIMEOUT_BUDGET_DEFAULT,
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../../src/control-plane/timeout-budget.js';

test('createTopLevelOperationBudget creates budget with operation name',
  async (t) => {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs: 5000,
      now: () => 5000,
    });

    t.equal(
      budget.configuredBudgetMs,
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    );
    t.equal(budget.operationName, 'rebalance');
    t.equal(budget.startedAtMs, 5000);
    t.equal(
      budget.deadlineMs,
      5000 + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    );
  });

test('sub-budgets derive from remaining parent time, not fresh defaults',
  async (t) => {
    const topLevel = createTopLevelOperationBudget({
      configuredBudgetMs: 1000,
      operationName: 'rebalance',
      startedAtMs: 0,
      now: () => 0,
    });

    // Simulate 600ms elapsed
    const child = createChildTimeoutBudget(topLevel, {
      requestedBudgetMs: 800,
      minimumBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      now: () => 600,
    });

    t.equal(child.allowed, true);
    // Granted must be clamped to remaining 400ms, not the requested 800ms
    t.equal(child.grantedBudgetMs, 400);
    t.equal(child.budget.configuredBudgetMs, 400);
    t.equal(child.budget.deadlineMs, 1000);
  });

test('sub-budget rejected when remaining time below minimum viable budget',
  async (t) => {
    const topLevel = createTopLevelOperationBudget({
      configuredBudgetMs: 100,
      operationName: 'dispatch',
      startedAtMs: 0,
      now: () => 0,
    });

    // Simulate 97ms elapsed — only 3ms remain, below default minimum of 5ms
    const child = createChildTimeoutBudget(topLevel, {
      requestedBudgetMs: 50,
      minimumBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: 'step_check',
      now: () => 97,
    });

    t.equal(child.allowed, false);
    t.equal(child.budget, null);
    t.equal(child.remainingBudgetMs, 3);
    t.equal(
      child.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
    );
  });

test('chained sub-budgets each derive from their parent remaining time',
  async (t) => {
    const topLevel = createTopLevelOperationBudget({
      configuredBudgetMs: 500,
      operationName: 'split',
      startedAtMs: 0,
      now: () => 0,
    });

    // First child at t=100, remaining=400
    const first = createChildTimeoutBudget(topLevel, {
      requestedBudgetMs: 300,
      now: () => 100,
    });
    t.equal(first.allowed, true);
    t.equal(first.grantedBudgetMs, 300);

    // Second child derived from first child at t=250, remaining=150
    const second = createChildTimeoutBudget(first.budget, {
      requestedBudgetMs: 200,
      now: () => 250,
    });
    t.equal(second.allowed, true);
    // Clamped to remaining 150ms of first child budget
    t.equal(second.grantedBudgetMs, 150);
    t.equal(second.budget.deadlineMs, 400);
  });

test('getRemainingBudgetMs returns correct remaining for top-level budget',
  async (t) => {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.DISPATCH_OPERATION_BUDGET_MS,
      operationName: 'dispatch',
      startedAtMs: 1000,
      now: () => 1000,
    });

    const remaining = getRemainingBudgetMs(budget, {now: () => 31000});
    t.equal(
      remaining,
      TIMEOUT_BUDGET_DEFAULT.DISPATCH_OPERATION_BUDGET_MS - 30000,
    );
  });

test('top-level budget constants are defined for all operation types',
  async (t) => {
    t.ok(
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS > 0,
      'rebalance budget defined',
    );
    t.ok(
      TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS > 0,
      'split budget defined',
    );
    t.ok(
      TIMEOUT_BUDGET_DEFAULT.DISPATCH_OPERATION_BUDGET_MS > 0,
      'dispatch budget defined',
    );
    t.ok(
      TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS > 0,
      'minimum viable budget defined',
    );
  });

// --- Task 6.2: Standardize timeout classification ---

const EXACT_BOUNDARY_BUDGET_MS = 200;
const NON_BOUNDARY_BUDGET_MS = 100;
const NON_BOUNDARY_ELAPSED_MS = 60;
const EXACT_BOUNDARY_START_MS = 0;

test('exact boundary hit promotes classification to EXACT_BOUNDARY_HIT',
  async (t) => {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs: EXACT_BOUNDARY_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs: EXACT_BOUNDARY_START_MS,
      now: () => EXACT_BOUNDARY_START_MS,
    });

    const classification = buildTimeoutClassification({
      budget,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.REMOTE_CALL_TIMEOUT,
      nestedOperation: 'step_wait',
      now: () => EXACT_BOUNDARY_START_MS + EXACT_BOUNDARY_BUDGET_MS,
    });

    t.equal(
      classification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
      'exact boundary must promote to EXACT_BOUNDARY_HIT',
    );
    t.equal(classification.boundaryHit, true);
    t.equal(classification.remainingBudgetMs, 0);
    t.equal(
      classification.originalClassification,
      TIMEOUT_BUDGET_CLASSIFICATION.REMOTE_CALL_TIMEOUT,
      'original classification preserved',
    );
    t.equal(
      classification.operationName,
      'rebalance',
      'operationName propagated from budget',
    );
  });

test('non-boundary timeout keeps original classification',
  async (t) => {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs: NON_BOUNDARY_BUDGET_MS,
      operationName: 'dispatch',
      startedAtMs: EXACT_BOUNDARY_START_MS,
      now: () => EXACT_BOUNDARY_START_MS,
    });

    const classification = buildTimeoutClassification({
      budget,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation: 'cache_wait',
      now: () => EXACT_BOUNDARY_START_MS + NON_BOUNDARY_ELAPSED_MS,
    });

    t.equal(
      classification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      'non-boundary keeps original classification',
    );
    t.equal(classification.boundaryHit, false);
    t.equal(
      classification.remainingBudgetMs,
      NON_BOUNDARY_BUDGET_MS - NON_BOUNDARY_ELAPSED_MS,
    );
    t.equal(
      classification.originalClassification,
      null,
      'originalClassification is null when not a boundary hit',
    );
    t.equal(classification.operationName, 'dispatch');
  });

test('all timeout classifications include required payload fields',
  async (t) => {
    const requiredFields = [
      'classification',
      'configuredBudgetMs',
      'remainingBudgetMs',
      'boundaryHit',
      'nestedOperation',
      'operationName',
      'originalClassification',
    ];

    const allClassifications = Object.values(
      TIMEOUT_BUDGET_CLASSIFICATION,
    ).filter(
      (c) => c !== TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
    );

    for (const cls of allClassifications) {
      const budget = createTopLevelOperationBudget({
        configuredBudgetMs: NON_BOUNDARY_BUDGET_MS,
        operationName: 'test_op',
        startedAtMs: EXACT_BOUNDARY_START_MS,
        now: () => EXACT_BOUNDARY_START_MS,
      });

      const result = buildTimeoutClassification({
        budget,
        classification: cls,
        nestedOperation: 'nested_op',
        now: () => EXACT_BOUNDARY_START_MS + NON_BOUNDARY_ELAPSED_MS,
      });

      for (const field of requiredFields) {
        t.ok(
          field in result,
          `classification ${cls} must include ${field}`,
        );
      }
      t.equal(
        typeof result.configuredBudgetMs,
        'number',
        `${cls}: configuredBudgetMs is number`,
      );
      t.equal(
        typeof result.remainingBudgetMs,
        'number',
        `${cls}: remainingBudgetMs is number`,
      );
      t.equal(
        typeof result.boundaryHit,
        'boolean',
        `${cls}: boundaryHit is boolean`,
      );
    }
  });

test('exact boundary on all standard budget sizes is a hard failure',
  async (t) => {
    const standardBudgets = [
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
      TIMEOUT_BUDGET_DEFAULT.DISPATCH_OPERATION_BUDGET_MS,
    ];

    for (const budgetMs of standardBudgets) {
      const budget = createTopLevelOperationBudget({
        configuredBudgetMs: budgetMs,
        operationName: 'boundary_test',
        startedAtMs: EXACT_BOUNDARY_START_MS,
        now: () => EXACT_BOUNDARY_START_MS,
      });

      const classification = buildTimeoutClassification({
        budget,
        classification:
          TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        now: () => EXACT_BOUNDARY_START_MS + budgetMs,
      });

      t.equal(
        classification.classification,
        TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
        `budget ${budgetMs}ms: exact boundary promoted`,
      );
      t.equal(
        classification.boundaryHit,
        true,
        `budget ${budgetMs}ms: boundaryHit flag set`,
      );
      t.equal(
        classification.originalClassification,
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        `budget ${budgetMs}ms: original classification preserved`,
      );
      t.equal(
        classification.operationName,
        'boundary_test',
        `budget ${budgetMs}ms: operationName included`,
      );
    }
  });

test('createTimeoutBudgetError includes operationName from budget',
  async (t) => {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs: NON_BOUNDARY_BUDGET_MS,
      operationName: 'split',
      startedAtMs: EXACT_BOUNDARY_START_MS,
      now: () => EXACT_BOUNDARY_START_MS,
    });

    const error = createTimeoutBudgetError({
      message: 'split timed out',
      budget,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
      nestedOperation: 'step_commit',
      now: () => EXACT_BOUNDARY_START_MS + NON_BOUNDARY_ELAPSED_MS,
    });

    t.equal(error.message, 'split timed out');
    t.equal(
      error.timeoutClassification.operationName,
      'split',
    );
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
    );
    t.equal(
      error.timeoutClassification.nestedOperation,
      'step_commit',
    );
  });

test('child budget rejection at exact boundary classifies as ' +
  'EXACT_BOUNDARY_HIT', async (t) => {
  const parent = createTopLevelOperationBudget({
    configuredBudgetMs: EXACT_BOUNDARY_BUDGET_MS,
    operationName: 'rebalance',
    startedAtMs: EXACT_BOUNDARY_START_MS,
    now: () => EXACT_BOUNDARY_START_MS,
  });

  const child = createChildTimeoutBudget(parent, {
    requestedBudgetMs: 50,
    minimumBudgetMs:
      TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
    nestedOperation: 'cache_wait',
    now: () => EXACT_BOUNDARY_START_MS + EXACT_BOUNDARY_BUDGET_MS,
  });

  t.equal(child.allowed, false);
  t.equal(child.remainingBudgetMs, 0);
  t.equal(
    child.timeoutClassification.classification,
    TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
  );
  t.equal(
    child.timeoutClassification.originalClassification,
    TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
  );
  t.equal(
    child.timeoutClassification.operationName,
    'rebalance',
  );
  t.equal(child.timeoutClassification.boundaryHit, true);
});

test('budget without operationName returns null for operationName field',
  async (t) => {
    const budget = createTimeoutBudget({
      configuredBudgetMs: NON_BOUNDARY_BUDGET_MS,
      startedAtMs: EXACT_BOUNDARY_START_MS,
      now: () => EXACT_BOUNDARY_START_MS,
    });

    const classification = buildTimeoutClassification({
      budget,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.LOCAL_SCHEDULER_STARVATION,
      now: () => EXACT_BOUNDARY_START_MS + NON_BOUNDARY_ELAPSED_MS,
    });

    t.equal(
      classification.operationName,
      null,
      'plain budget without operationName returns null',
    );
  });

// --- Task 6.3: Timeout contract regressions ---

const THREE_LEVEL_TOP_BUDGET_MS = 1000;
const THREE_LEVEL_START_MS = 0;
const THREE_LEVEL_L1_ELAPSED_MS = 200;
const THREE_LEVEL_L1_REQUESTED_MS = 900;
const THREE_LEVEL_L2_ELAPSED_MS = 500;
const THREE_LEVEL_L2_REQUESTED_MS = 600;
const THREE_LEVEL_L3_ELAPSED_MS = 650;
const THREE_LEVEL_L3_REQUESTED_MS = 400;

test('3-level nested budget chain derives from remaining parent, ' +
  'never fresh defaults', async (t) => {
  const topLevel = createTopLevelOperationBudget({
    configuredBudgetMs: THREE_LEVEL_TOP_BUDGET_MS,
    operationName: 'rebalance',
    startedAtMs: THREE_LEVEL_START_MS,
    now: () => THREE_LEVEL_START_MS,
  });

  // Level 1: t=200, remaining=800, requested=900 → granted=800
  const level1 = createChildTimeoutBudget(topLevel, {
    requestedBudgetMs: THREE_LEVEL_L1_REQUESTED_MS,
    minimumBudgetMs:
      TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
    now: () => THREE_LEVEL_START_MS + THREE_LEVEL_L1_ELAPSED_MS,
  });

  t.equal(level1.allowed, true, 'level 1 allowed');
  t.equal(
    level1.grantedBudgetMs,
    THREE_LEVEL_TOP_BUDGET_MS - THREE_LEVEL_L1_ELAPSED_MS,
    'level 1 clamped to remaining parent budget',
  );
  t.equal(level1.budget.configuredBudgetMs, 800);

  // Level 2: t=500, remaining from level1=500, requested=600 → granted=500
  const level2 = createChildTimeoutBudget(level1.budget, {
    requestedBudgetMs: THREE_LEVEL_L2_REQUESTED_MS,
    minimumBudgetMs:
      TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
    now: () => THREE_LEVEL_START_MS + THREE_LEVEL_L2_ELAPSED_MS,
  });

  t.equal(level2.allowed, true, 'level 2 allowed');
  t.equal(
    level2.grantedBudgetMs,
    THREE_LEVEL_TOP_BUDGET_MS - THREE_LEVEL_L2_ELAPSED_MS,
    'level 2 clamped to remaining level-1 budget',
  );
  t.equal(level2.budget.configuredBudgetMs, 500);

  // Level 3: t=650, remaining from level2=350, requested=400 → granted=350
  const level3 = createChildTimeoutBudget(level2.budget, {
    requestedBudgetMs: THREE_LEVEL_L3_REQUESTED_MS,
    minimumBudgetMs:
      TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
    now: () => THREE_LEVEL_START_MS + THREE_LEVEL_L3_ELAPSED_MS,
  });

  t.equal(level3.allowed, true, 'level 3 allowed');
  t.equal(
    level3.grantedBudgetMs,
    THREE_LEVEL_TOP_BUDGET_MS - THREE_LEVEL_L3_ELAPSED_MS,
    'level 3 clamped to remaining level-2 budget',
  );
  t.equal(level3.budget.configuredBudgetMs, 350);

  // All three deadlines converge on the original top-level deadline
  t.equal(
    level1.budget.deadlineMs,
    THREE_LEVEL_TOP_BUDGET_MS,
    'level 1 deadline equals top-level deadline',
  );
  t.equal(
    level2.budget.deadlineMs,
    THREE_LEVEL_TOP_BUDGET_MS,
    'level 2 deadline equals top-level deadline',
  );
  t.equal(
    level3.budget.deadlineMs,
    THREE_LEVEL_TOP_BUDGET_MS,
    'level 3 deadline equals top-level deadline',
  );
});

const STANDARD_BOUNDARY_BUDGETS_MS = [4000, 6000, 30000, 60000];
const BOUNDARY_REGRESSION_START_MS = 0;

test('exact-boundary classification at each standard budget size ' +
  '(4s, 6s, 30s, 60s) is a hard correctness failure', async (t) => {
  for (const budgetMs of STANDARD_BOUNDARY_BUDGETS_MS) {
    const budget = createTopLevelOperationBudget({
      configuredBudgetMs: budgetMs,
      operationName: `boundary_regression_${budgetMs}`,
      startedAtMs: BOUNDARY_REGRESSION_START_MS,
      now: () => BOUNDARY_REGRESSION_START_MS,
    });

    const classification = buildTimeoutClassification({
      budget,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.REMOTE_CALL_TIMEOUT,
      nestedOperation: `op_at_${budgetMs}`,
      now: () => BOUNDARY_REGRESSION_START_MS + budgetMs,
    });

    t.equal(
      classification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
      `${budgetMs}ms: exact boundary promoted to EXACT_BOUNDARY_HIT`,
    );
    t.equal(
      classification.boundaryHit,
      true,
      `${budgetMs}ms: boundaryHit flag is true`,
    );
    t.equal(
      classification.originalClassification,
      TIMEOUT_BUDGET_CLASSIFICATION.REMOTE_CALL_TIMEOUT,
      `${budgetMs}ms: original classification preserved`,
    );
    t.equal(
      classification.operationName,
      `boundary_regression_${budgetMs}`,
      `${budgetMs}ms: operationName included in payload`,
    );
    t.equal(
      classification.remainingBudgetMs,
      0,
      `${budgetMs}ms: remaining budget is zero`,
    );
    t.equal(
      classification.configuredBudgetMs,
      budgetMs,
      `${budgetMs}ms: configuredBudgetMs matches`,
    );
  }
});

const EXHAUSTION_CHAIN_BUDGET_MS = 500;
const EXHAUSTION_CHAIN_START_MS = 0;
const EXHAUSTION_L1_ELAPSED_MS = 100;
const EXHAUSTION_L2_ELAPSED_MS = 497;

test('budget exhaustion mid-chain propagates exhaustion classification',
  async (t) => {
    const topLevel = createTopLevelOperationBudget({
      configuredBudgetMs: EXHAUSTION_CHAIN_BUDGET_MS,
      operationName: 'split',
      startedAtMs: EXHAUSTION_CHAIN_START_MS,
      now: () => EXHAUSTION_CHAIN_START_MS,
    });

    // Level 1: t=100, remaining=400, granted=400
    const level1 = createChildTimeoutBudget(topLevel, {
      requestedBudgetMs: EXHAUSTION_CHAIN_BUDGET_MS,
      minimumBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      now: () => EXHAUSTION_CHAIN_START_MS + EXHAUSTION_L1_ELAPSED_MS,
    });

    t.equal(level1.allowed, true, 'level 1 allowed');
    t.equal(level1.timeoutClassification, null,
      'level 1 has no timeout classification');

    // Level 2: t=497, remaining from level1=3ms, below minimum 5ms
    const level2 = createChildTimeoutBudget(level1.budget, {
      requestedBudgetMs: 200,
      minimumBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification:
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: 'step_commit',
      now: () => EXHAUSTION_CHAIN_START_MS + EXHAUSTION_L2_ELAPSED_MS,
    });

    t.equal(level2.allowed, false, 'level 2 rejected — budget exhausted');
    t.equal(level2.budget, null, 'level 2 budget is null');
    t.equal(
      level2.remainingBudgetMs,
      EXHAUSTION_CHAIN_BUDGET_MS - EXHAUSTION_L2_ELAPSED_MS,
      'remaining budget reflects actual remaining time',
    );
    t.ok(
      level2.timeoutClassification,
      'level 2 has timeout classification',
    );
    t.equal(
      level2.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      'exhaustion classification propagated',
    );
    t.equal(
      level2.timeoutClassification.nestedOperation,
      'step_commit',
      'nested operation name propagated',
    );
    t.equal(
      level2.timeoutClassification.operationName,
      null,
      'child budget does not carry operationName from top-level',
    );
  });

test('timeout budget errors always include typed classification, ' +
  'never only generic strings', async (t) => {
  const budget = createTopLevelOperationBudget({
    configuredBudgetMs: EXHAUSTION_CHAIN_BUDGET_MS,
    operationName: 'dispatch',
    startedAtMs: EXHAUSTION_CHAIN_START_MS,
    now: () => EXHAUSTION_CHAIN_START_MS,
  });

  const error = createTimeoutBudgetError({
    message: 'operation timed out',
    budget,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.LOCAL_SCHEDULER_STARVATION,
    nestedOperation: 'scheduler_wait',
    now: () => EXHAUSTION_CHAIN_START_MS + 300,
  });

  // Error must have typed classification — not just a string message
  t.ok(
    error.timeoutClassification,
    'error has timeoutClassification property',
  );
  t.equal(
    typeof error.timeoutClassification.classification,
    'string',
    'classification is a typed string category',
  );
  t.ok(
    Object.values(TIMEOUT_BUDGET_CLASSIFICATION).includes(
      error.timeoutClassification.classification,
    ),
    'classification is a known TIMEOUT_BUDGET_CLASSIFICATION value',
  );
  t.equal(
    typeof error.timeoutClassification.configuredBudgetMs,
    'number',
    'configuredBudgetMs is a number',
  );
  t.equal(
    typeof error.timeoutClassification.remainingBudgetMs,
    'number',
    'remainingBudgetMs is a number',
  );
  t.equal(
    typeof error.timeoutClassification.boundaryHit,
    'boolean',
    'boundaryHit is a boolean',
  );
});
