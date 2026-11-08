// The capture quiet bound: the earliest observed moment after which a node
// could produce no output, with its source named (quest
// failure-bundle-evidence-completeness, round 4).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  parseObservedExitMs,
  resolveCaptureQuietBound,
} from '../capture-quiet-bound.js';
import {
  CAPTURE_QUIET_BOUND_SOURCE,
  HARNESS_STOP_ACTIONS,
  NODE_LIFECYCLE_ACTION,
} from '../constants.js';

const TEARDOWN_MS = 1_000_000;

describe('parseObservedExitMs', () => {
  it('parses Docker FinishedAt once to epoch ms', () => {
    assert.equal(parseObservedExitMs('2026-06-12T15:03:45.521Z'),
      Date.parse('2026-06-12T15:03:45.521Z'));
    assert.equal(parseObservedExitMs('2026-06-12T15:03:45.521234567Z'),
      Date.parse('2026-06-12T15:03:45.521Z'));
  });

  it('observes nothing from an absent, unparseable or zero-time value', () => {
    for (const value of [null, undefined, '', 'not-a-time', 42,
      '0001-01-01T00:00:00Z', '1970-01-01T00:00:00Z']) {
      assert.equal(parseObservedExitMs(value), null, String(value));
    }
  });
});

describe('resolveCaptureQuietBound', () => {
  it('is teardown when nothing earlier was observed', () => {
    assert.deepEqual(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS}), {
      atMs: TEARDOWN_MS, source: CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN,
      action: null});
  });

  for (const action of HARNESS_STOP_ACTIONS) {
    it(`is the ${action} mark, naming the action`, () => {
      assert.deepEqual(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
        expectedDown: {action, sinceMs: 400_000}}), {
        atMs: 400_000, source: CAPTURE_QUIET_BOUND_SOURCE.HARNESS_STOP, action});
    });
  }

  it('ignores restart and start marks: the node is expected to log again',
    () => {
      for (const action of [NODE_LIFECYCLE_ACTION.RESTART,
        NODE_LIFECYCLE_ACTION.START]) {
        assert.equal(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
          expectedDown: {action, sinceMs: 400_000}}).source,
        CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN, action);
      }
    });

  it('is the observed container exit when nothing earlier was observed', () => {
    assert.deepEqual(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
      observedExitMs: 500_000}), {
      atMs: 500_000, source: CAPTURE_QUIET_BOUND_SOURCE.CONTAINER_EXIT,
      action: null});
  });

  it('takes the earliest observation', () => {
    const killedAfterExit = resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
      expectedDown: {action: NODE_LIFECYCLE_ACTION.KILL, sinceMs: 600_000},
      observedExitMs: 500_000});
    assert.equal(killedAfterExit.source, CAPTURE_QUIET_BOUND_SOURCE.CONTAINER_EXIT);
    assert.equal(killedAfterExit.atMs, 500_000);
    const exitAfterStop = resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
      expectedDown: {action: NODE_LIFECYCLE_ACTION.STOP, sinceMs: 400_000},
      observedExitMs: 405_000});
    assert.equal(exitAfterStop.source, CAPTURE_QUIET_BOUND_SOURCE.HARNESS_STOP);
    assert.equal(exitAfterStop.atMs, 400_000);
    assert.equal(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
      observedExitMs: TEARDOWN_MS + 1}).source,
    CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN, 'never later than teardown');
  });

  it('a missing exit observation never acquits', () => {
    assert.equal(resolveCaptureQuietBound({teardownWallMs: TEARDOWN_MS,
      observedExitMs: parseObservedExitMs('garbage')}).source,
    CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN);
  });
});
