#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const PACKAGE_SCENARIO = 'lagrange-server-npm-release';
const PUBLISH_SCENARIO = 'lagrange-server-npm-publish';
const SCENARIO_FIDELITY = 'clean-installed-production-artifact';
const SCENARIO_REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/integration/lagrange-server-npm-package.integration.test.js',
  'test/scripts/release-npm-package.test.js',
  'test/release/public-api-side-effect-boundary.test.js',
  'test/release/version-single-source.test.js',
  'test/packaging/single-executable-behavioral-equivalence.property.test.js',
  'test/packaging/service-cli-pg-runtime-dependency.test.js',
]);

runGuardTestScenarios({
  [PACKAGE_SCENARIO]: TEST_FILES,
  [PUBLISH_SCENARIO]: TEST_FILES,
}, {
  fidelity: SCENARIO_FIDELITY,
  reportDir: SCENARIO_REPORT_DIR,
});
