#!/usr/bin/env node
/**
 * Runner for the `pressure-admission-flagless-defer-policy` quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (attempt-2 design after the live falsification of
 * the fixed-hint always-DEFER shape on 2026-07-18: cold-formation joins rely
 * on tight retry against flickering backpressure, so pacing must be derived
 * from measured pressure and hot paths must queue for capacity):
 *   pressure-admission-flagless-defer-policy
 *     - test/control-plane/pressure-governor.test.js
 *       (flagless decision table: admission derives only from work class +
 *        measured pressure; DEGRADE retired; reserve rows intact; pacing
 *        hint derived from saturation depth, near-immediate under shallow
 *        flicker; bounded priority-ordered admit-on-capacity queue)
 *     - test/control-plane/control-plane-system-table-gateway.test.js
 *       (both gateway pressure contracts collapse to one flagless builder;
 *        reads/queries park in the admission queue and surface typed
 *        deferred outcomes with derived retry hints)
 *     - test/control-plane/authoritative-control-plane-view.test.js
 *       (authoritative reads defer instead of running in degraded mode;
 *        typed pressure result carries the defer action)
 *     - test/query/sql-query-engine-execution.test.js
 *       (query-plane ingress defers flaglessly with derived hints; plane
 *        isolation between query and metadata ingress preserved)
 *     - test/control-plane/replica-dispatch-node-state-update.test.js
 *       (node-state publication parking derives from work class, not
 *        per-call flags: background parks, critical escalates)
 *
 * NOTE (live validation): unit evidence alone was proven insufficient for
 * this policy - 1074 unit tests passed while live formation failed 9x
 * slower. Any admission-policy change must ALSO be validated with a full
 * `node examples/service-data-affinity/run-affinity-demo.js` run before
 * committing (see the quest log finding of 2026-07-18T15:03Z).
 *
 * Usage: node scripts/run-pressure-admission-flagless-defer-policy-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'pressure-admission-flagless-defer-policy': [
    'test/control-plane/pressure-governor.test.js',
    'test/control-plane/control-plane-system-table-gateway.test.js',
    'test/control-plane/authoritative-control-plane-view.test.js',
    'test/query/sql-query-engine-execution.test.js',
    'test/control-plane/replica-dispatch-node-state-update.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
