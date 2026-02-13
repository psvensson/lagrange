/**
 * RuntimeRunner — `runtime.run(userFn, opts?)` entrypoint.
 *
 * Constructs an ExecutionContext with session, snapshot, and
 * budget defaults, then invokes the user function. Handles
 * cleanup and error propagation.
 *
 * Requirements: 4.1, 4.2
 * @module query/runtime-runner
 */

import {TYPEOF} from '../constants/index.js';
import {BudgetEnforcer} from './budget-enforcer.js';
import {CancellationToken} from './cancellation-token.js';
import {LineageTracker} from './lineage-tracker.js';
import {ExecutionContext} from './execution-context.js';
import {ResultStream} from './result-stream.js';
import {
  SNAPSHOT_MODE,
  DEFAULT_SNAPSHOT_MODE,
  DEFAULT_RUNTIME_SESSION,
  RUNTIME_ERROR_MSG as ERR,
} from './runtime-constants.js';

/**
 * Counter for generating unique query IDs per process.
 * @type {number}
 */
let queryIdCounter = 0;

/**
 * Generate a unique query ID for lineage tracking.
 * @return {string} Unique query identifier.
 */
function generateQueryId() {
  return `rt-${Date.now()}-${++queryIdCounter}`;
}

/**
 * Stub query executor used when no real SqlCore is wired.
 * Real wiring happens in task 3.
 *
 * @param {string} _query - SQL query string.
 * @param {unknown[]} _params - Bind parameters.
 * @return {Promise<{rows: Array}>} Empty result.
 */
async function stubQueryExecutor(_query, _params) {
  return {rows: []};
}

/**
 * Validate the snapshot option.
 * @param {Object} snapshot - Snapshot configuration.
 * @throws {Error} If snapshot is invalid.
 */
function validateSnapshot(snapshot) {
  if (snapshot.mode !== SNAPSHOT_MODE.READ_COMMITTED &&
      snapshot.mode !== SNAPSHOT_MODE.SNAPSHOT) {
    throw new Error(ERR.INVALID_SNAPSHOT_MODE);
  }
  if (snapshot.ts !== undefined &&
      typeof snapshot.ts !== TYPEOF.NUMBER) {
    throw new Error(ERR.INVALID_SNAPSHOT_TS);
  }
}

/**
 * Validate runtime.run options.
 * @param {Object} [opts] - Execution options.
 * @throws {Error} If options are invalid.
 */
function validateOpts(opts) {
  if (!opts) return;
  if (opts.session !== undefined &&
      typeof opts.session !== TYPEOF.STRING) {
    throw new Error(ERR.INVALID_SESSION);
  }
  if (opts.budgets !== undefined &&
      (typeof opts.budgets !== TYPEOF.OBJECT ||
       opts.budgets === null)) {
    throw new Error(ERR.INVALID_BUDGETS);
  }
  if (opts.snapshot !== undefined) {
    validateSnapshot({
      mode: opts.snapshot.mode ?? DEFAULT_SNAPSHOT_MODE,
      ts: opts.snapshot.ts,
    });
  }
}

/**
 * Top-level runtime execution entrypoint.
 *
 * Accepts an async user function and optional execution
 * options. Constructs an ExecutionContext with session,
 * snapshot, and budget defaults, invokes the user function,
 * and returns the result.
 *
 * @param {Function} userFn - Async function receiving ctx.
 * @param {Object} [opts] - Execution options.
 * @param {string} [opts.session] - Session identity.
 * @param {Object} [opts.snapshot] - Snapshot configuration.
 * @param {string} [opts.snapshot.mode] - 'readCommitted' or
 *   'snapshot'.
 * @param {number} [opts.snapshot.ts] - Snapshot timestamp.
 * @param {Object} [opts.budgets] - Budget overrides.
 * @return {Promise<*>} Result of the user function.
 * @throws {Error} If userFn is not a function or execution
 *   fails.
 */
async function run(userFn, opts) {
  if (userFn === undefined || userFn === null) {
    throw new Error(ERR.USER_FN_REQUIRED);
  }
  if (typeof userFn !== TYPEOF.FUNCTION) {
    throw new Error(ERR.USER_FN_MUST_BE_FUNCTION);
  }
  validateOpts(opts);

  const session = opts?.session ?? DEFAULT_RUNTIME_SESSION;
  const snapshot = {
    mode: opts?.snapshot?.mode ?? DEFAULT_SNAPSHOT_MODE,
    ts: opts?.snapshot?.ts,
  };
  const budgets = opts?.budgets ?? {};

  const queryId = generateQueryId();
  const budgetEnforcer = new BudgetEnforcer(budgets);
  const cancellationToken = new CancellationToken();
  const lineageTracker = new LineageTracker(queryId);
  const resultStream = new ResultStream(budgets);

  const ctx = new ExecutionContext({
    session,
    snapshot,
    budgetEnforcer,
    cancellationToken,
    lineageTracker,
    queryExecutor: opts?.queryExecutor ?? stubQueryExecutor,
    resultStream,
  });

  try {
    const result = await userFn(ctx);
    ctx.closeOutputStream();
    const outputRows = ctx.getResults();
    if (outputRows.length > 0) {
      const telemetry = ctx.getOutTelemetry();
      return {result, output: outputRows, telemetry};
    }
    return result;
  } catch (err) {
    ctx.closeOutputStream();
    cancellationToken.cancel(
      err?.message ?? ERR.EXECUTION_FAILED,
    );
    throw err;
  }
}

/**
 * The runtime namespace object exposing `run`.
 * @type {Readonly<{run: Function}>}
 */
const runtime = Object.freeze({run});

export {runtime, run, generateQueryId};
