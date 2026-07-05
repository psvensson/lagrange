#!/usr/bin/env node
/**
 * Runner for the `formation-ledger-quorum-spread-first` quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-22
 * forensics; evidence docs under
 * solve/changes/formation-replace-dispatch-deferred-retry-hold/):
 *   formation-ledger-quorum-spread-first
 *     - test/convergence/dt6-formation-ledger-quorum-spread-first.test.js
 *       (the run-22 wedge: the operation ledger's quorum stayed concentrated
 *        on the overloaded seed after a leadership-only self-move, and every
 *        dependent control-plane move piled onto a ledger whose commits
 *        needed the slow node. The fix holds dependent operation admission
 *        while any ledger partition's quorum is concentrated AND spread is
 *        actionable — ledger self-moves and emergency ADDs exempt — and
 *        feeds the same concentration evidence into the planner's
 *        priority-recovery gate so the cure is always planned. Guarded
 *        shapes: the run-22 release-too-early gap, the fully-concentrated
 *        bootstrap window, already-spread and infeasible-spread controls,
 *        the planner-gate evidence arm, determinism.)
 *
 * Usage: node scripts/run-formation-ledger-quorum-spread-first-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-quorum-spread-first': [
    'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
