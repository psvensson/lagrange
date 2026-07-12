#!/usr/bin/env node
/**
 * Runner for the `managed-partition-merge` quest scenario.
 *
 * Executes the merge guard suites (the committed proof of the quest
 * statement) and writes a scenario-harness report for the Solver's
 * `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   managed-partition-merge
 *     - test/partition/managed-merge-workflow.test.js
 *       (admission refusals: non-adjacent / over-threshold /
 *        already-in-transition / critical / non-leader; durable lifecycle
 *        start ADMISSION_PENDING -> MERGE_PREPARING -> MERGE_BACKFILLING
 *        with target provisioning and both source mirrors started)
 *     - test/partition/merge-cutover-coordination.test.js
 *       (owner-decided epoch cutover only after BOTH sources are
 *        catch-up ready; active_partition_version promotion collapses the
 *        source ranges; post-merge routing epoch guard; dissolution via
 *        reused REMOVE_REPLICA teardown + descriptor deletion)
 *     - test/partition/merge-source-replication.test.js
 *       (source CDC fan-in executor: ack ladder order, data completeness
 *        across snapshot + live writes, mirror-origin loop guard,
 *        cutover-observation wait, no direct system-table writes)
 *     - test/partition/merge-auto-execution.test.js
 *       (merge candidates now auto-execute through the wired
 *        executeMergeCandidate owner, bounded per evaluation)
 *
 * Usage: node scripts/run-managed-partition-merge-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'managed-partition-merge': [
    'test/partition/managed-merge-workflow.test.js',
    'test/partition/merge-cutover-coordination.test.js',
    'test/partition/merge-source-replication.test.js',
    'test/partition/merge-auto-execution.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
