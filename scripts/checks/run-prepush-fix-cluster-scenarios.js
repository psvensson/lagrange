#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'solver-operator-workflow-land-regressions': [
    'test/solve/operator-workflow.test.js',
  ],
  // Successor of the parked parent quest; identical guard surface.
  'solver-operator-workflow-land-regressions-v2': [
    'test/solve/operator-workflow.test.js',
  ],
  'solver-operator-safety-facade': [
    'test/solve/operator-workflow.test.js',
    'test/solve/scope-pressure.test.js',
    'test/solve/scope-pressure-precommit-enforcement.test.js',
    'test/solve/handoff.test.js',
    'test/solve/meta-friction.test.js',
    'test/scripts/publish-head.test.js',
  ],
  'reservation-reconcile-query-operation-binding': [
    'test/diagnostics/raft-churn-sync-section-attribution.test.js',
    'test/rebalancer/pending-move-tracking.property.test.js',
  ],
  'bootstrap-mode-routing-property-repair': [
    'test/cdc/bootstrap-mode-routing.property.test.js',
  ],
  'service-init-cli-scaffold-contract-repair': [
    'test/cli/service-init-wasm-scaffold.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
