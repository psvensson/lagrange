#!/usr/bin/env node
/**
 * Runner for the `ledger-participant-transaction-zombie-lifecycle` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-23
 * forensics; evidence under
 * solve/changes/formation-ledger-leader-local-persistence-wedge/):
 *   ledger-participant-transaction-zombie-lifecycle
 *     - test/convergence/dt6-zombie-transaction-lifecycle.test.js
 *       (the run-23 zombie root: an orphaned 2PC participant BEGIN whose
 *        coordinator committed against an empty participant set after
 *        recovery clobbered the live registry with CDC-lagging rows. The fix
 *        sweeps ACTIVE participant holds under the same 60s legal bound as
 *        prepared holds with the heal gated on role — follower/learner or
 *        solo heal crash-equivalently WITH the JS-memory state cleared
 *        (apply-dedup set, committed-index cache); a leader/candidate defers
 *        to the durability-fitness demotion; recovery never clobbers a live
 *        workflow registry; a stage never silently succeeds against lost
 *        enlistment; sessionless writes are never absorbed into a foreign
 *        transaction.)
 *
 * Usage: node scripts/run-ledger-participant-transaction-zombie-lifecycle-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'ledger-participant-transaction-zombie-lifecycle': [
    'test/convergence/dt6-zombie-transaction-lifecycle.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
