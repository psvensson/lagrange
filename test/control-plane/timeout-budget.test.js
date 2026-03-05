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
