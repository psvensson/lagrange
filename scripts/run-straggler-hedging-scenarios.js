#!/usr/bin/env node
/**
 * Runner for the `distributed-query-straggler-hedging` quest scenario.
 *
 * Executes the committed guard suites proving that a slow-but-alive
 * replica no longer stalls a distributed SELECT fan-out in the wired
 * production path: straggler hedging launches a speculative retry against
 * an alternative replica through the partitionQueryExecutor callback,
 * first result wins with no duplicate rows, single-replica partitions do
 * not hedge, and the coordinator's existing chunk/speculation contracts
 * stay intact. Writes a scenario-harness report for the Solver's probe;
 * see `scripts/checks/guard-test-scenario-runner.js` for the machinery.
 *
 * Scenario -> guard tests:
 *   distributed-query-straggler-hedging
 *     - test/query/distributed-query-straggler-hedging.test.js
 *       (real-SQLite two-replica partitions with a delayed primary:
 *        hedged completion bound, no duplicates, alternative-address
 *        hedge, metric count, no-hedge-without-alternative, config-off
 *        legacy waiting, loser swallow)
 *     - test/query/parallel-query-coordinator.test.js
 *       (coordinator chunk scheduling, failure diagnostics, speculative
 *        loser guard, timeout/cancellation contracts)
 *
 * Usage: node scripts/run-straggler-hedging-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'distributed-query-straggler-hedging': [
    'test/query/distributed-query-straggler-hedging.test.js',
    'test/query/parallel-query-coordinator.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
