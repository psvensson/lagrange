/**
 * Scenario runner for the replica-retirement-terminal-actuals-coherence quest.
 *
 * Binds the coherence contract to its deterministic guards: a retiring
 * operation (REMOVE, or the source-retirement phase of REPLACE) may rest
 * terminal only on corroborated retirement evidence — a successful-but-empty
 * authoritative read contradicted by a live cache row fails closed into the
 * stopping defer/retry lane instead of terminalizing against stale actuals.
 * The sibling stopping-reconcile suites pin that the honest completion,
 * handoff, visibility, and redrive paths are preserved.
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const COHERENCE_GUARDS = Object.freeze([
  'test/rebalancer/replica-retirement-terminal-actuals-coherence.test.js',
  'test/rebalancer/rebalance-coordinator-stopping-reconcile-source-removal.test.js',
  'test/rebalancer/rebalance-coordinator-stopping-reconcile-source-handoff.test.js',
  'test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js',
  'test/rebalancer/rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js',
  'test/rebalancer/remove-active-dispatch-redrive.test.js',
]);

const SCENARIOS = Object.freeze({
  'replica-retirement-terminal-actuals-coherence-main': COHERENCE_GUARDS,
  'replica-retirement-terminal-actuals-coherence': COHERENCE_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
