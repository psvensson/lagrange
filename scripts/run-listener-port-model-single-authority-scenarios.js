#!/usr/bin/env node
/**
 * Deterministic scenario runner for the listener-port-model Quest.
 *
 * The guard set binds configuration wiring and collision validation, canonical
 * derivation consumers, Helm alignment, and helper-script defaults. Reports use
 * the Solver scenario-harness shape so three independent green executions can
 * satisfy the sealed consecutive-run gate.
 */

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'listener-port-model-single-authority': [
    'test/config/configuration-manager.test.js',
    'test/transport/node-address-resolution-contract.test.js',
    'test/helm/lagrange-node-admin-default-deny.test.js',
    'test/scripts/entrypoint-defaults.test.js',
    'test/cli/core/help-overlay.test.js',
  ],
  'listener-port-model-config-authority': [
    'test/config/configuration-manager.test.js',
  ],
  'listener-port-model-runtime-consumers': [
    'test/transport/node-address-resolution-contract.test.js',
  ],
  'listener-port-model-surface-alignment': [
    'test/helm/lagrange-node-admin-default-deny.test.js',
  ],
  'listener-port-model-doc-helper-alignment': [
    'test/scripts/entrypoint-defaults.test.js',
  ],
  'listener-port-model-cli-guidance-gap': [
    'test/cli/core/help-overlay.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
