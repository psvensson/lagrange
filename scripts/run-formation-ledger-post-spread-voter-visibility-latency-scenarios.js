#!/usr/bin/env node
/**
 * Runner for the `formation-ledger-post-spread-voter-visibility-latency`
 * quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-27
 * forensics; evidence under
 * solve/changes/formation-ledger-post-spread-voter-visibility-latency/):
 *   formation-ledger-post-spread-voter-visibility-latency
 *     - test/partition/durable-voter-visibility-role-write.test.js
 *       (run-27: a promoted priority-control-plane replica's durable
 *        services.raft_role write was silently lost — the CL-035 local
 *        voter-ready seed satisfied the role-mutation helper's
 *        cache-equality dedup, so the cluster read a raft LEADER as a
 *        learner forever; the quorum-spread admission hold never released
 *        and the demo CREATE TABLE starved. Fix: capability-gated
 *        authoritative dedup + CAS guard from the authoritative row in the
 *        mutation helper, level-triggered owner re-assert at the seed seam,
 *        CRITICAL delivery class for priority-partition role writes.
 *        Guards: seed-mask repro, CAS-miss anti-livelock, hold release on
 *        durable convergence.)
 *     - test/rebalancer/interlock-skip-label-fidelity.test.js
 *       (ledger-interlock rejections mislabeled as budget_exceeded/limit 1
 *        while the true reason code sat unread in error.admissionResult —
 *        the skip result now carries the admission evidence.)
 *
 * Usage: node scripts/run-formation-ledger-post-spread-voter-visibility-latency-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-post-spread-voter-visibility-latency': [
    'test/partition/durable-voter-visibility-role-write.test.js',
    'test/rebalancer/interlock-skip-label-fidelity.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
