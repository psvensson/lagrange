#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-artifact-export-contract';
const REPORT_DIR =
  'test-output/reports/minimal-deployment-artifact-export-contract';
const TEST_FILES = Object.freeze([
  'test/service/external-service-manifest.test.js',
  'test/service/minimal-deployment-artifact-owner-guard.test.js',
  'test/service/installable-service-artifact-resolver.test.js',
  'test/service/service-local-oci-layout-builder.test.js',
  'test/service/service-lifecycle-command-owner.test.js',
  'test/control-plane/service-install-catalog-owner.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/cli/service-init-scaffold.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
