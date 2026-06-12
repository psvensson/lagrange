/**
 * CL-027: the load-readiness stable-window clock must measure continuous
 * cluster-green wall time. The selected control snapshot's capture timestamp
 * may only BACKDATE the window start (credit for green observed before the
 * first probe) — it must never forward-date it. Once forced repair re-captures
 * the snapshot on every poll, forward-dating caps stableElapsedMs at one probe
 * round-trip (~130-160ms) and the window can never close against a
 * continuously green cluster; the no-progress budget then fails the run.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {
  LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
  LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
  decideLoadReadinessStableWindow,
  normalizeStableWindowTimestamp,
} from '../cluster-segment-7-alpha-active-wait.js';

const WAIT_START_MS = 1_000_000;
const STABLE_WINDOW_MS = 1000;
const POLL_INTERVAL_MS = 200;
const PROBE_LATENCY_MS = 130;

function buildGreenProbe(nowMs) {
  return {
    allActive: true,
    snapshotCoverage: {
      completeCoverage: true,
      selectedCapturedAtMs: nowMs - PROBE_LATENCY_MS,
    },
  };
}

// Mirrors the waitForLoadReadinessStability poll loop's window-state
// threading (cluster-segment-7-alpha-load-readiness.js:634-651).
function pollOnce(state, {activeProbe, nowMs}) {
  if (activeProbe.allActive !== true) {
    state.startedAt = LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP;
    state.source = LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE;
    state.resetAt = normalizeStableWindowTimestamp(nowMs);
  }
  const stableWindow = decideLoadReadinessStableWindow({
    activeProbe,
    stableWindowMs: STABLE_WINDOW_MS,
    currentStartedAt: state.startedAt,
    currentSource: state.source,
    resetAt: state.resetAt,
    nowMs,
  });
  if (activeProbe.allActive === true) {
    state.startedAt = stableWindow.startedAt;
    state.source = stableWindow.source;
  }
  return stableWindow;
}

function buildFreshWaitState() {
  return {
    startedAt: LOAD_READINESS_STABLE_WINDOW_NO_TIMESTAMP,
    source: LOAD_READINESS_STABLE_WINDOW_SOURCE_NONE,
    resetAt: normalizeStableWindowTimestamp(WAIT_START_MS),
  };
}

test('stable window closes for a continuously green cluster even when ' +
  'every poll re-captures the control snapshot', (t) => {
  const state = buildFreshWaitState();
  let stableWindow = null;
  let closedAtAttempt = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const nowMs = WAIT_START_MS + attempt * POLL_INTERVAL_MS;
    stableWindow = pollOnce(state, {
      activeProbe: buildGreenProbe(nowMs),
      nowMs,
    });
    if (stableWindow.stable && closedAtAttempt === null) {
      closedAtAttempt = attempt;
    }
  }
  assert.equal(
    stableWindow.stable,
    true,
    'the window must close after stableWindowMs of continuous green; a ' +
      'per-poll snapshot re-capture must not restart the clock',
  );
  assert.ok(
    stableWindow.stableElapsedMs >= STABLE_WINDOW_MS,
    'stableElapsedMs must accumulate past the window ' +
      `(got ${stableWindow.stableElapsedMs})`,
  );
  assert.ok(
    closedAtAttempt !== null && closedAtAttempt <= 7,
    'the window must close in roughly stableWindowMs / pollInterval ' +
      `attempts (closed at ${closedAtAttempt})`,
  );
  t.end();
});

test('the selected snapshot still backdates the window start on the ' +
  'first green observation', (t) => {
  const state = buildFreshWaitState();
  const nowMs = WAIT_START_MS + 900;
  const capturedAtMs = WAIT_START_MS + 100;
  const stableWindow = pollOnce(state, {
    activeProbe: {
      allActive: true,
      snapshotCoverage: {
        completeCoverage: true,
        selectedCapturedAtMs: capturedAtMs,
      },
    },
    nowMs,
  });
  assert.equal(
    stableWindow.startedAtMs,
    capturedAtMs,
    'an EARLIER capture must backdate the window start (credit preserved)',
  );
  assert.equal(stableWindow.stable, false, '800ms of credit < 1000ms window');
  t.end();
});

test('an allActive=false observation still resets the window and rejects ' +
  'pre-reset snapshot credit', (t) => {
  const state = buildFreshWaitState();
  pollOnce(state, {
    activeProbe: buildGreenProbe(WAIT_START_MS + 200),
    nowMs: WAIT_START_MS + 200,
  });
  const resetNowMs = WAIT_START_MS + 400;
  const resetWindow = pollOnce(state, {
    activeProbe: {allActive: false},
    nowMs: resetNowMs,
  });
  assert.equal(resetWindow.stable, false);
  const postResetNowMs = WAIT_START_MS + 600;
  const postResetWindow = pollOnce(state, {
    activeProbe: {
      allActive: true,
      snapshotCoverage: {
        completeCoverage: true,
        // Captured BEFORE the reset: must not grant pre-reset credit.
        selectedCapturedAtMs: WAIT_START_MS + 100,
      },
    },
    nowMs: postResetNowMs,
  });
  assert.equal(
    postResetWindow.startedAtMs,
    postResetNowMs,
    'a pre-reset capture must not backdate past the reset boundary',
  );
  assert.equal(postResetWindow.stable, false);
  t.end();
});
