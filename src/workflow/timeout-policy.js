import {
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {NUM, TYPEOF} from '../constants/index.js';

function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

class TimeoutPolicy {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.operationName = options.operationName || null;
    this.configuredBudgetMs = normalizePositiveInteger(
      options.configuredBudgetMs,
    );
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
  }

  /**
   * Create one top-level timeout budget.
   * @param {Object} [options]
   * @return {Object|null}
   */
  createTopLevelBudget(options = {}) {
    const configuredBudgetMs = normalizePositiveInteger(
      options.configuredBudgetMs,
      this.configuredBudgetMs,
    );
    if (configuredBudgetMs <= NUM.ZERO) {
      return null;
    }
    return createTopLevelOperationBudget({
      configuredBudgetMs,
      operationName: options.operationName || this.operationName,
      startedAtMs: options.startedAtMs,
      now: options.now || this.now,
    });
  }

  /**
   * Allocate one child budget from the remaining parent deadline.
   * When no parent exists, a new top-level budget is created instead.
   * @param {Object} [options]
   * @return {Object}
   */
  allocate(options = {}) {
    if (options.timeoutBudget) {
      const allocation = createChildTimeoutBudget(options.timeoutBudget, {
        requestedBudgetMs: options.requestedBudgetMs,
        minimumBudgetMs: options.minimumBudgetMs,
        classification: options.classification,
        nestedOperation: options.nestedOperation,
        now: options.now || this.now,
      });
      if (!allocation.allowed || !allocation.budget) {
        return allocation;
      }
      return Object.freeze({
        ...allocation,
        budget: Object.freeze({
          ...allocation.budget,
          operationName:
            options.timeoutBudget.operationName ||
            this.operationName ||
            null,
        }),
      });
    }

    const budget = this.createTopLevelBudget({
      configuredBudgetMs: options.requestedBudgetMs,
      startedAtMs: options.startedAtMs,
      operationName: options.operationName || this.operationName,
      now: options.now || this.now,
    });
    if (!budget) {
      return Object.freeze({
        allowed: true,
        budget: null,
        grantedBudgetMs: null,
        remainingBudgetMs: null,
        timeoutClassification: null,
      });
    }

    return Object.freeze({
      allowed: true,
      budget,
      grantedBudgetMs: budget.configuredBudgetMs,
      remainingBudgetMs: getRemainingBudgetMs(
        budget,
        {now: options.now || this.now},
      ),
      timeoutClassification: null,
    });
  }

  /**
   * Allocate one budget or throw a typed timeout error.
   * @param {Object} [options]
   * @return {Object|null}
   */
  allocateOrThrow(options = {}) {
    const allocation = this.allocate(options);
    if (allocation.allowed) {
      return allocation.budget;
    }
    const error = new Error(options.timeoutError || 'Operation timed out');
    error.timeoutClassification = allocation.timeoutClassification;
    throw error;
  }
}

export {TimeoutPolicy};
