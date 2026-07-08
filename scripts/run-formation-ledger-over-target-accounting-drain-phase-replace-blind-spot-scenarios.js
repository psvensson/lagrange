#!/usr/bin/env node
/**
 * Runner for the
 * `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
 * quest scenario.
 *
 * Executes the scenario's committed deterministic guard-test suite (the proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root pinned from affinity-demo run-28 forensics +
 * three adversarial verifications; evidence docs under
 * solve/changes/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot/):
 *   formation-ledger-over-target-accounting-drain-phase-replace-blind-spot
 *     - test/rebalancer/in-flight-aware-drain-phase-replace-credit.test.js
 *       The BINDING accounting defect + its fix: the move planner's
 *       committed-voter read (computeInFlightAwareReplicaAccounting) undercounts
 *       by 1 exactly when a drain-phase REPLACE's SOURCE has left activeCount
 *       while its REPLACEMENT is a durable LEARNER not yet visible as an ACTIVE
 *       voter, so the deficit guards mint a spurious count-increasing ADD and
 *       the ledger ends up +1 over target (4 voters / 3 target). The fix
 *       (`c78833f0`, drainPhaseReplacementCredit) is ROW-OP-LINKED: it credits
 *       only the specific drain-phase REPLACE's replacement replica, excluding
 *       replacements already ACTIVE, so the ADD is suppressed. The suite also
 *       pins the three refuted count-based approximations as anti-regressions
 *       (stale-syncing / serialization / net-neutral-REPLACE double-count).
 *     - test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js
 *       Carries the over-target constraint tuples (active/occupied/inFlightAdd/
 *       drainPhaseReplace/target) alongside the predecessor interlock proof, so
 *       the suppression is exercised in the shared convergence harness.
 *
 * This is the churn-reduction / cleanliness proof: the over-target 4th voter is
 * a formation transient that the existing over-creation cap + surplus drain
 * clear once voters settle. Live ground truth (s13, HEAD 33e0026d, 3 fresh
 * affinity-demo runs) confirms the fix holds in the real cluster:
 * DEFER_ADD_OVER_TARGET=0 and actual 4-voter overshoot=0 in all 3 runs. See
 * solve/changes/formation-ledger-over-target-accounting-drain-phase-replace-blind-spot/live-run-ground-truth-modeb-not-binding.md.
 *
 * Usage:
 *   node scripts/run-formation-ledger-over-target-accounting-drain-phase-replace-blind-spot-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-over-target-accounting-drain-phase-replace-blind-spot': [
    'test/rebalancer/in-flight-aware-drain-phase-replace-credit.test.js',
    'test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
