import t from 'tap';

import {assertFreshModelTlcCases} from '../test-helpers/model-tlc-contract.js';

const CASES = Object.freeze([
  Object.freeze({
    report: 'local-leader-row-visibility-fixed.model.report.json',
    converged: true,
    mode: 'local-leader-row-visibility-fixed',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-missing-seed.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-missing-seed',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-stale-publish.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-stale-publish',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-timestamp-bump.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-timestamp-bump',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-demoted-replay.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-demoted-replay',
  }),
]);

// The TLC route takes ~19s alone and 30s+ on a loaded machine; tap's
// default 30s budget (both the root file watchdog and the per-test
// timeout) is too tight for a model-checker-bound test. The inner
// spawn keeps its own 60s bound.
t.setTimeout(120000);
t.test('focused local leader-row TLC route and mutants meet their declared outcomes', {timeout: 120000}, (t) => {
  assertFreshModelTlcCases(t, CASES);
  t.end();
});
