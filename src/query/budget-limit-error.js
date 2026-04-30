/**
 * BudgetLimitError — typed error for query budget violations.
 *
 * Thrown when any per-query resource budget is exceeded.
 * Carries structured context so callers can identify which
 * budget was violated, the configured limit, and actual usage.
 *
 * Requirements: 9.1, 9.4
 * @module query/budget-limit-error
 */

import {BaseError} from '../utils/base-error.js';

const LOCAL_STR_BUDGETENFORCER = 'BudgetEnforcer';
const LOCAL_STR_BUDGETCHECK = 'budgetCheck';

/**
 * Budget category identifiers for error context.
 * @enum {string}
 */
const BUDGET_CATEGORY = Object.freeze({
  CPU_TIME: 'cpuTime',
  MEMORY: 'memory',
  WALL_TIME: 'wallTime',
  LOOKUP_KEYS: 'lookupKeys',
  LOOKUP_BYTES: 'lookupBytes',
  EMIT_BYTES: 'emitBytes',
  BROADCAST_BYTES: 'broadcastBytes',
  OUT_BYTES: 'outBytes',
  NESTED_CALLS: 'nestedCalls',
  NESTED_KEYS: 'nestedKeys',
  NESTED_BYTES: 'nestedBytes',
  INFLIGHT: 'inflight',
});

/**
 * Typed error thrown when a query budget limit is exceeded.
 *
 * Requirement 9.4: IF any budget is exceeded, THEN THE System
 * SHALL terminate the operation and return a descriptive limit
 * error.
 *
 * @extends BaseError
 */
class BudgetLimitError extends BaseError {
  /**
   * @param {string} message - Human-readable error message.
   * @param {Object} options - Error options.
   * @param {string} options.category - Budget category from
   *   BUDGET_CATEGORY enum.
   * @param {number} options.limit - Configured budget limit.
   * @param {number} options.usage - Actual usage that exceeded
   *   the limit.
   */
  constructor(message, options = {}) {
    super(message, {
      context: {
        component: LOCAL_STR_BUDGETENFORCER,
        operation: LOCAL_STR_BUDGETCHECK,
        metadata: {
          category: options.category,
          limit: options.limit,
          usage: options.usage,
        },
      },
    });

    /** @type {string} */
    this.category = options.category;

    /** @type {number} */
    this.limit = options.limit;

    /** @type {number} */
    this.usage = options.usage;
  }
}

export {BudgetLimitError, BUDGET_CATEGORY};
