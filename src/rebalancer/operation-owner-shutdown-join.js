/**
 * Bounded shutdown join of in-flight operation-owner lanes plus an ownership
 * fence bump (verified-audit finding 14, quest
 * operation-ownership-lease-fencing).
 *
 * Today shutdown is flag-set + map-clear: the coordinator flips
 * isShuttingDown, clears its retry registries, and returns while async lane
 * continuations past an await keep mutating durable operation state
 * unguarded. This module gives the owner an explicit join protocol:
 *
 *  1. The shutdown fence is bumped FIRST so every continuation that wakes
 *    after the flag observes a stale generation and must stand down (the
 *    existing isShuttingDown checks throughout the owner pipeline are the
 *    stand-down arms).
 *  2. Shutdown then AWAITS the currently in-flight owner-lane executions,
 *    bounded by a timeout — a lane wedged on a remote call cannot pin the
 *    node forever. Re-checking the lane map after each settle round catches
 *    executions that re-enter while the join is in progress.
 *
 * The fence epoch is a monotonic counter on the workflow owner
 * (getOperationOwnershipFenceEpoch); lane runners capture it before awaiting
 * and refuse to start a new turn once it advanced (see
 * operation-workflow-owner-execution-lane.js).
 */

const OPERATION_SHUTDOWN_JOIN_RESULT = Object.freeze({
  JOINED: 'joined',
  TIMED_OUT: 'timed_out',
});

const OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS = 5_000;

function normalizeShutdownJoinTimeoutMs(timeoutMs) {
  const numeric = Number(timeoutMs);
  return Number.isFinite(numeric) && numeric > 0 ?
    Math.floor(numeric) :
    OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS;
}

function snapshotInFlightLaneExecutions(inFlightExecutionsByOwnerKey) {
  if (!(inFlightExecutionsByOwnerKey instanceof Map)) {
    return [];
  }
  return Array.from(inFlightExecutionsByOwnerKey.values()).filter(
    (execution) => typeof execution?.then === 'function',
  );
}

function buildShutdownJoinDeadline(nowMs, timeoutMs) {
  return normalizeShutdownJoinTimeoutMs(timeoutMs) +
    (Number.isFinite(Number(nowMs)) ? Math.floor(Number(nowMs)) : Date.now());
}

/**
 * Boundedly await every currently in-flight owner-lane execution. Lane
 * rejections belong to the lane holders and are swallowed by the join; the
 * join only cares that the lane SETTLED. Re-entrants discovered after one
 * settle round get one more bounded round, up to the deadline.
 *
 * @param {Object} options
 * @param {Map} options.inFlightExecutionsByOwnerKey - Live lane map (the
 *   DurableWorkflowCoordinator single-flight registry).
 * @param {number} [options.timeoutMs] - Bounded join budget.
 * @param {Function} [options.nowFn] - Clock seam (virtual-clock tests).
 * @return {Promise<Object>} Frozen typed join result — never raw null.
 */
async function joinInFlightOperationOwnerLanes(options = {}) {
  const inFlightExecutionsByOwnerKey = options.inFlightExecutionsByOwnerKey;
  const nowFn =
    typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
  const deadlineMs = buildShutdownJoinDeadline(nowFn(), options.timeoutMs);
  let lastObservedInFlightCount = 0;
  while (true) {
    const executions = snapshotInFlightLaneExecutions(
      inFlightExecutionsByOwnerKey,
    );
    lastObservedInFlightCount = executions.length;
    if (executions.length === 0) {
      return Object.freeze({
        result: OPERATION_SHUTDOWN_JOIN_RESULT.JOINED,
        timedOut: false,
        joinedExecutions: 0,
      });
    }
    const remainingMs = deadlineMs - nowFn();
    if (remainingMs <= 0) {
      return Object.freeze({
        result: OPERATION_SHUTDOWN_JOIN_RESULT.TIMED_OUT,
        timedOut: true,
        joinedExecutions: executions.length,
      });
    }
    // Explicit settled/timeout race: resolves on EITHER the lane batch
    // settling OR the remaining budget expiring, so a never-settling lane
    // cannot pin the join. The timer is always cleared or fires within the
    // bounded budget, so it cannot keep the event loop alive past the join.
    await new Promise((resolve) => {
      const handle = setTimeout(() => {
        resolve();
      }, remainingMs);
      Promise.allSettled(executions).then(() => {
        clearTimeout(handle);
        resolve();
      });
    });
    if (nowFn() >= deadlineMs) {
      const pending = snapshotInFlightLaneExecutions(
        inFlightExecutionsByOwnerKey,
      );
      return Object.freeze({
        result: pending.length === 0 ?
          OPERATION_SHUTDOWN_JOIN_RESULT.JOINED :
          OPERATION_SHUTDOWN_JOIN_RESULT.TIMED_OUT,
        timedOut: pending.length > 0,
        joinedExecutions: pending.length === 0 ?
          0 :
          lastObservedInFlightCount,
      });
    }
  }
}

export {
  OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS,
  OPERATION_SHUTDOWN_JOIN_RESULT,
  joinInFlightOperationOwnerLanes,
};
