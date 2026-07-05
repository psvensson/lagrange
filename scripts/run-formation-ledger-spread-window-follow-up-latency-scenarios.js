#!/usr/bin/env node
/**
 * Runner for the `formation-ledger-spread-window-follow-up-latency` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-26
 * forensics; evidence under
 * solve/changes/formation-ledger-spread-window-follow-up-latency/):
 *   formation-ledger-spread-window-follow-up-latency
 *     - test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js
 *       (run-26: the formation ledger-spread window outlasted the CREATE
 *        TABLE budget because remote-owned ledger self-moves idled in
 *        PENDING — the wake's transport ACK was swallowed by a mid-startup
 *        owner with no handler [ACK-before-handler-lookup], the 1s
 *        verification retry self-cancelled silently when the op row was
 *        unreadable through the ledger being moved, and its live window
 *        suppressed the planner's only rearm. Fix: the retry re-wakes from
 *        the retained snapshot LOUDLY, bounded by the existing operation
 *        budget; invisible-row late honors never preempt-cancel the
 *        follow-up; noHandler ACKs route into the warning retry lane.
 *        Guards: the root-cause reproduction, bounded-stop, degenerate
 *        snapshot, R4 preempt-cancel survival, noHandler routing.)
 *
 * Usage: node scripts/run-formation-ledger-spread-window-follow-up-latency-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-spread-window-follow-up-latency': [
    'test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
