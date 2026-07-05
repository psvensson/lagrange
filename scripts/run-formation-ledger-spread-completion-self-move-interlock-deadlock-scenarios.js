#!/usr/bin/env node
/**
 * Runner for the `formation-ledger-spread-completion-self-move-interlock-deadlock`
 * quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof of
 * the quest statement) and writes a scenario-harness report for the Solver's
 * `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-28 forensics;
 * evidence docs under
 * solve/changes/formation-ledger-spread-completion-self-move-interlock-deadlock/):
 *   formation-ledger-spread-completion-self-move-interlock-deadlock
 *     - test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js
 *       The BINDING deadlock: after a mid-drain ledger-leadership handoff the new
 *       leader's CACHE-FIRST incomplete-operation observation holds a stale ghost
 *       of the prior spread self-move, so the interlock rejects every subsequent
 *       count-neutral spread REPLACE
 *       `operation_ledger_self_move_waiting_for_idle_ledger` and the ledger never
 *       de-concentrates (dependent CREATE TABLE starves past its 30s budget;
 *       CL-043's 60s self-heal is too slow). The fix re-verifies a
 *       same-ledger-partition self-move blocker via a CACHE-BYPASSING owner-RPC
 *       read: a genuine in-flight reconfiguration reads non-terminal (keeps
 *       blocking, run-20 serialization preserved); a bookkeeping-lag ghost reads
 *       terminal and is dropped so the spread admits and the ledger
 *       de-concentrates.
 *
 *       The over-target accounting root (the spurious count-increasing ADD minted
 *       while the prior REPLACE's replacement is a not-yet-visible voter) is a
 *       SEPARABLE defect entangled with the voter-visibility read path — split to
 *       the successor quest
 *       `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
 *       (three adversarial verifications refuted every count-based move-planner
 *       approximation). The over-target 4th voter is a formation transient the
 *       existing over-creation cap + surplus drain clear once voters settle.
 *
 * Usage:
 *   node scripts/run-formation-ledger-spread-completion-self-move-interlock-deadlock-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-spread-completion-self-move-interlock-deadlock': [
    'test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
