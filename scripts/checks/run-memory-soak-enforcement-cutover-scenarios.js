/**
 * Scenario runner for the memory-soak-enforcement-cutover quest.
 *
 * Binds the two frontier scenarios to their deterministic guard tests:
 *  - memory-soak-configured-duration: sustained-write-throughput honors the
 *    configured load duration (warmup + analysis window can complete).
 *  - memory-soak-required-analysis: requireSamples fails closed on deferred,
 *    insufficient, under-sampled, or unanalyzed per-node evidence, and on
 *    detected leaks.
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const ORACLE =
  'test/distributed/harness/__tests__/memory-soak-enforcement-oracle.test.js';
const SCENARIO =
  'test/distributed/harness/__tests__/sustained-write-throughput-scenario.test.js';
const RUNTIME = 'test/distributed/harness/__tests__/run.test.js';

const SCENARIOS = Object.freeze({
  'memory-soak-configured-duration': Object.freeze([ORACLE, SCENARIO]),
  'memory-soak-required-analysis': Object.freeze([ORACLE, RUNTIME]),
  'memory-soak-enforcement-cutover': Object.freeze([ORACLE, SCENARIO, RUNTIME]),
});

runGuardTestScenarios(SCENARIOS);
