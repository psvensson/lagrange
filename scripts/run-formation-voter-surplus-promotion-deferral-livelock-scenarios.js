#!/usr/bin/env node
/**
 * Runner for the `formation-voter-surplus-promotion-deferral-livelock` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-21
 * forensics, data/examples/service-data-affinity-demo/node-{0..4}.log +
 * direct ledger query):
 *   formation-voter-surplus-promotion-deferral-livelock
 *     - test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js
 *       (the run-21 wedge: a 5-voters-over-target-3 surplus whose drain
 *        livelocked NOT on the promotion<->drain circular wait — that
 *        self-breaks by design via the executor's 60s voter-ready timeout —
 *        but on a LOST TERMINAL TRANSITION: failOperation reported committed
 *        while the FAILED update never landed, leaving an immortal SYNCING
 *        ghost row that held the global budget and blocked every
 *        same-partition REMOVE and re-planned REPLACE at admission. The fix
 *        makes terminal persistence honest (persist result returned and
 *        checked) and arms a terminal-transition repair loop when the
 *        post-commit visibility confirmation throws or defers. Guarded
 *        shapes: BOTH observed loss modes (silent-ack and swallowed
 *        zero-row), surplus drains 5 -> 3 through the real admission chain
 *        with the real promotion guard composed through the cache seam,
 *        self-breaking-cycle control, determinism.)
 *
 * Usage: node scripts/run-formation-voter-surplus-promotion-deferral-livelock-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-voter-surplus-promotion-deferral-livelock': [
    'test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
