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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TYPEOF } from '../constants/index.js';
import { BudgetEnforcer } from './budget-enforcer.js';
import { CancellationToken } from './cancellation-token.js';
import { LineageTracker } from './lineage-tracker.js';
import { ExecutionContext } from './execution-context.js';
import { ResultStream } from './result-stream.js';
import { SNAPSHOT_MODE, DEFAULT_SNAPSHOT_MODE, DEFAULT_RUNTIME_SESSION, RUNTIME_ERROR_MSG as ERR } from './runtime-constants.js';

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
  if (stryMutAct_9fa48("118689")) {
    {}
  } else {
    stryCov_9fa48("118689");
    return stryMutAct_9fa48("118690") ? `` : (stryCov_9fa48("118690"), `rt-${Date.now()}-${stryMutAct_9fa48("118691") ? --queryIdCounter : (stryCov_9fa48("118691"), ++queryIdCounter)}`);
  }
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
  if (stryMutAct_9fa48("118692")) {
    {}
  } else {
    stryCov_9fa48("118692");
    return stryMutAct_9fa48("118693") ? {} : (stryCov_9fa48("118693"), {
      rows: stryMutAct_9fa48("118694") ? ["Stryker was here"] : (stryCov_9fa48("118694"), [])
    });
  }
}

/**
 * Validate the snapshot option.
 * @param {Object} snapshot - Snapshot configuration.
 * @throws {Error} If snapshot is invalid.
 */
function validateSnapshot(snapshot) {
  if (stryMutAct_9fa48("118695")) {
    {}
  } else {
    stryCov_9fa48("118695");
    if (stryMutAct_9fa48("118698") ? snapshot.mode !== SNAPSHOT_MODE.READ_COMMITTED || snapshot.mode !== SNAPSHOT_MODE.SNAPSHOT : stryMutAct_9fa48("118697") ? false : stryMutAct_9fa48("118696") ? true : (stryCov_9fa48("118696", "118697", "118698"), (stryMutAct_9fa48("118700") ? snapshot.mode === SNAPSHOT_MODE.READ_COMMITTED : stryMutAct_9fa48("118699") ? true : (stryCov_9fa48("118699", "118700"), snapshot.mode !== SNAPSHOT_MODE.READ_COMMITTED)) && (stryMutAct_9fa48("118702") ? snapshot.mode === SNAPSHOT_MODE.SNAPSHOT : stryMutAct_9fa48("118701") ? true : (stryCov_9fa48("118701", "118702"), snapshot.mode !== SNAPSHOT_MODE.SNAPSHOT)))) {
      if (stryMutAct_9fa48("118703")) {
        {}
      } else {
        stryCov_9fa48("118703");
        throw new Error(ERR.INVALID_SNAPSHOT_MODE);
      }
    }
    if (stryMutAct_9fa48("118706") ? snapshot.ts !== undefined || typeof snapshot.ts !== TYPEOF.NUMBER : stryMutAct_9fa48("118705") ? false : stryMutAct_9fa48("118704") ? true : (stryCov_9fa48("118704", "118705", "118706"), (stryMutAct_9fa48("118708") ? snapshot.ts === undefined : stryMutAct_9fa48("118707") ? true : (stryCov_9fa48("118707", "118708"), snapshot.ts !== undefined)) && (stryMutAct_9fa48("118710") ? typeof snapshot.ts === TYPEOF.NUMBER : stryMutAct_9fa48("118709") ? true : (stryCov_9fa48("118709", "118710"), typeof snapshot.ts !== TYPEOF.NUMBER)))) {
      if (stryMutAct_9fa48("118711")) {
        {}
      } else {
        stryCov_9fa48("118711");
        throw new Error(ERR.INVALID_SNAPSHOT_TS);
      }
    }
  }
}

/**
 * Validate runtime.run options.
 * @param {Object} [opts] - Execution options.
 * @throws {Error} If options are invalid.
 */
function validateOpts(opts) {
  if (stryMutAct_9fa48("118712")) {
    {}
  } else {
    stryCov_9fa48("118712");
    if (stryMutAct_9fa48("118715") ? false : stryMutAct_9fa48("118714") ? true : stryMutAct_9fa48("118713") ? opts : (stryCov_9fa48("118713", "118714", "118715"), !opts)) return;
    if (stryMutAct_9fa48("118718") ? opts.session !== undefined || typeof opts.session !== TYPEOF.STRING : stryMutAct_9fa48("118717") ? false : stryMutAct_9fa48("118716") ? true : (stryCov_9fa48("118716", "118717", "118718"), (stryMutAct_9fa48("118720") ? opts.session === undefined : stryMutAct_9fa48("118719") ? true : (stryCov_9fa48("118719", "118720"), opts.session !== undefined)) && (stryMutAct_9fa48("118722") ? typeof opts.session === TYPEOF.STRING : stryMutAct_9fa48("118721") ? true : (stryCov_9fa48("118721", "118722"), typeof opts.session !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("118723")) {
        {}
      } else {
        stryCov_9fa48("118723");
        throw new Error(ERR.INVALID_SESSION);
      }
    }
    if (stryMutAct_9fa48("118726") ? opts.budgets !== undefined || typeof opts.budgets !== TYPEOF.OBJECT || opts.budgets === null : stryMutAct_9fa48("118725") ? false : stryMutAct_9fa48("118724") ? true : (stryCov_9fa48("118724", "118725", "118726"), (stryMutAct_9fa48("118728") ? opts.budgets === undefined : stryMutAct_9fa48("118727") ? true : (stryCov_9fa48("118727", "118728"), opts.budgets !== undefined)) && (stryMutAct_9fa48("118730") ? typeof opts.budgets !== TYPEOF.OBJECT && opts.budgets === null : stryMutAct_9fa48("118729") ? true : (stryCov_9fa48("118729", "118730"), (stryMutAct_9fa48("118732") ? typeof opts.budgets === TYPEOF.OBJECT : stryMutAct_9fa48("118731") ? false : (stryCov_9fa48("118731", "118732"), typeof opts.budgets !== TYPEOF.OBJECT)) || (stryMutAct_9fa48("118734") ? opts.budgets !== null : stryMutAct_9fa48("118733") ? false : (stryCov_9fa48("118733", "118734"), opts.budgets === null)))))) {
      if (stryMutAct_9fa48("118735")) {
        {}
      } else {
        stryCov_9fa48("118735");
        throw new Error(ERR.INVALID_BUDGETS);
      }
    }
    if (stryMutAct_9fa48("118738") ? opts.snapshot === undefined : stryMutAct_9fa48("118737") ? false : stryMutAct_9fa48("118736") ? true : (stryCov_9fa48("118736", "118737", "118738"), opts.snapshot !== undefined)) {
      if (stryMutAct_9fa48("118739")) {
        {}
      } else {
        stryCov_9fa48("118739");
        validateSnapshot(stryMutAct_9fa48("118740") ? {} : (stryCov_9fa48("118740"), {
          mode: stryMutAct_9fa48("118741") ? opts.snapshot.mode && DEFAULT_SNAPSHOT_MODE : (stryCov_9fa48("118741"), opts.snapshot.mode ?? DEFAULT_SNAPSHOT_MODE),
          ts: opts.snapshot.ts
        }));
      }
    }
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
  if (stryMutAct_9fa48("118742")) {
    {}
  } else {
    stryCov_9fa48("118742");
    if (stryMutAct_9fa48("118745") ? userFn === undefined && userFn === null : stryMutAct_9fa48("118744") ? false : stryMutAct_9fa48("118743") ? true : (stryCov_9fa48("118743", "118744", "118745"), (stryMutAct_9fa48("118747") ? userFn !== undefined : stryMutAct_9fa48("118746") ? false : (stryCov_9fa48("118746", "118747"), userFn === undefined)) || (stryMutAct_9fa48("118749") ? userFn !== null : stryMutAct_9fa48("118748") ? false : (stryCov_9fa48("118748", "118749"), userFn === null)))) {
      if (stryMutAct_9fa48("118750")) {
        {}
      } else {
        stryCov_9fa48("118750");
        throw new Error(ERR.USER_FN_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("118753") ? typeof userFn === TYPEOF.FUNCTION : stryMutAct_9fa48("118752") ? false : stryMutAct_9fa48("118751") ? true : (stryCov_9fa48("118751", "118752", "118753"), typeof userFn !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("118754")) {
        {}
      } else {
        stryCov_9fa48("118754");
        throw new Error(ERR.USER_FN_MUST_BE_FUNCTION);
      }
    }
    validateOpts(opts);
    const session = stryMutAct_9fa48("118755") ? opts?.session && DEFAULT_RUNTIME_SESSION : (stryCov_9fa48("118755"), (stryMutAct_9fa48("118756") ? opts.session : (stryCov_9fa48("118756"), opts?.session)) ?? DEFAULT_RUNTIME_SESSION);
    const snapshot = stryMutAct_9fa48("118757") ? {} : (stryCov_9fa48("118757"), {
      mode: stryMutAct_9fa48("118758") ? opts?.snapshot?.mode && DEFAULT_SNAPSHOT_MODE : (stryCov_9fa48("118758"), (stryMutAct_9fa48("118760") ? opts.snapshot?.mode : stryMutAct_9fa48("118759") ? opts?.snapshot.mode : (stryCov_9fa48("118759", "118760"), opts?.snapshot?.mode)) ?? DEFAULT_SNAPSHOT_MODE),
      ts: stryMutAct_9fa48("118762") ? opts.snapshot?.ts : stryMutAct_9fa48("118761") ? opts?.snapshot.ts : (stryCov_9fa48("118761", "118762"), opts?.snapshot?.ts)
    });
    const budgets = stryMutAct_9fa48("118763") ? opts?.budgets && {} : (stryCov_9fa48("118763"), (stryMutAct_9fa48("118764") ? opts.budgets : (stryCov_9fa48("118764"), opts?.budgets)) ?? {});
    const queryId = generateQueryId();
    const budgetEnforcer = new BudgetEnforcer(budgets);
    const cancellationToken = new CancellationToken();
    const lineageTracker = new LineageTracker(queryId);
    const resultStream = new ResultStream(budgets);
    const ctx = new ExecutionContext(stryMutAct_9fa48("118765") ? {} : (stryCov_9fa48("118765"), {
      session,
      snapshot,
      budgetEnforcer,
      cancellationToken,
      lineageTracker,
      queryExecutor: stryMutAct_9fa48("118766") ? opts?.queryExecutor && stubQueryExecutor : (stryCov_9fa48("118766"), (stryMutAct_9fa48("118767") ? opts.queryExecutor : (stryCov_9fa48("118767"), opts?.queryExecutor)) ?? stubQueryExecutor),
      resultStream
    }));
    try {
      if (stryMutAct_9fa48("118768")) {
        {}
      } else {
        stryCov_9fa48("118768");
        const result = await userFn(ctx);
        ctx.closeOutputStream();
        const outputRows = ctx.getResults();
        if (stryMutAct_9fa48("118772") ? outputRows.length <= 0 : stryMutAct_9fa48("118771") ? outputRows.length >= 0 : stryMutAct_9fa48("118770") ? false : stryMutAct_9fa48("118769") ? true : (stryCov_9fa48("118769", "118770", "118771", "118772"), outputRows.length > 0)) {
          if (stryMutAct_9fa48("118773")) {
            {}
          } else {
            stryCov_9fa48("118773");
            const telemetry = ctx.getOutTelemetry();
            return stryMutAct_9fa48("118774") ? {} : (stryCov_9fa48("118774"), {
              result,
              output: outputRows,
              telemetry
            });
          }
        }
        return result;
      }
    } catch (err) {
      if (stryMutAct_9fa48("118775")) {
        {}
      } else {
        stryCov_9fa48("118775");
        ctx.closeOutputStream();
        cancellationToken.cancel(stryMutAct_9fa48("118776") ? err?.message && ERR.EXECUTION_FAILED : (stryCov_9fa48("118776"), (stryMutAct_9fa48("118777") ? err.message : (stryCov_9fa48("118777"), err?.message)) ?? ERR.EXECUTION_FAILED));
        throw err;
      }
    }
  }
}

/**
 * The runtime namespace object exposing `run`.
 * @type {Readonly<{run: Function}>}
 */
const runtime = Object.freeze(stryMutAct_9fa48("118778") ? {} : (stryCov_9fa48("118778"), {
  run
}));
export { runtime, run, generateQueryId };