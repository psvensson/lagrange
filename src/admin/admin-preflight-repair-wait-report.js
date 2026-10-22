/**
 * The admin preflight waits a bounded budget for the authoritative discovery
 * repair; a spent wait is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const PREFLIGHT_REPAIR_WAIT = Object.freeze({
  wait: 'PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS',
  awaited: 'authoritative discovery cache repair settled',
  repairStateInFlight: 'in_flight',
});

// The preflight stopped waiting for the repair; the snapshot reports the
// repair as skipped and the repair keeps running unobserved.
function reportPreflightRepairWaitSpent(owner, waitBudgetMs, startedAtMs) {
  reportWaitBoundSpent(owner.logger, {
    wait: PREFLIGHT_REPAIR_WAIT.wait,
    awaited: PREFLIGHT_REPAIR_WAIT.awaited,
    boundMs: waitBudgetMs,
    startedAtMs,
    lastObserved: {repairState: PREFLIGHT_REPAIR_WAIT.repairStateInFlight},
    scope: {nodeId: owner.nodeId},
  });
}

export {reportPreflightRepairWaitSpent};
