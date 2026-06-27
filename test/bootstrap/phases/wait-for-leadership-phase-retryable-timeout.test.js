import assert from 'node:assert/strict';
import {test} from '../../../src/test-helpers/tap.js';
import {
  WaitForLeadershipPhase,
} from '../../../src/bootstrap/phases/wait-for-leadership-phase.js';
import {
  isRetryableControlPlaneError,
} from '../../../src/control-plane/control-plane-error-classification.js';

// A join-time leadership-establishment timeout is transient under load (the
// cluster is SAFE and still converging during a rolling restart). It must be
// classified retryable so the join resume loop re-enters within budget instead
// of the joiner exiting on the first attempt and being dropped from membership
// (NODE_EXIT / nodeSlotUnavailable, observed in calibration gate 073124Z run4).
//
// Red-on-revert: the timeout message ("Message group failed to establish
// leadership within Nms") matches no RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENT, so
// without the explicit tag isRetryableControlPlaneError(error) === false and the
// resume gate (node-joining-admission-readiness.js:667) STOPs → node exits.

function createNoopLogger() {
  const noop = () => {};
  return {debug: noop, info: noop, warn: noop, error: noop};
}

function createTimeoutDrivingDelegates() {
  // A virtual clock that jumps past the leadership wait window on the first
  // sleep, so the wait loop exits via timeout deterministically (no real time).
  let nowMs = 0;
  const config = {
    leadershipWaitTimeoutMs: 120000,
    leadershipWaitInitialDelayMs: 10,
    leadershipWaitMaxDelayMs: 100,
    leadershipWaitBackoffMultiplier: 2,
  };
  return {
    getConfig: () => config,
    getLogger: () => createNoopLogger(),
    getNow: () => () => nowMs,
    // Advancing the clock inside sleep makes the next while-condition false.
    getSleep: () => async (delayMs) => {
      nowMs += Math.max(delayMs, config.leadershipWaitTimeoutMs);
    },
    // No local message-group replica ever reports ingress-ready → wait times out.
    getMessageGroupServices: () => new Map(),
    getMessageGroupServicesSize: () => 0,
  };
}

test(
  'phaseWaitForLeadership timeout is tagged retryable for the join resume loop',
  async () => {
    const phase = new WaitForLeadershipPhase({
      nodeId: 'joiner-1',
      delegates: createTimeoutDrivingDelegates(),
    });

    let thrown = null;
    try {
      await phase.phaseWaitForLeadership();
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, 'leadership wait should throw on timeout');
    assert.match(thrown.message, /failed to establish leadership within/);
    // The explicit transient tags (consumed by resolveJoinFailureRetryable).
    assert.equal(thrown.deferRetry, true, 'deferRetry must be set');
    assert.equal(thrown.retryable, true, 'retryable must be set');
    // The REAL consumer that gates the inner join-resume decision must agree.
    assert.equal(
      isRetryableControlPlaneError(thrown),
      true,
      'the join resume gate must classify the leadership timeout retryable',
    );
  },
);
