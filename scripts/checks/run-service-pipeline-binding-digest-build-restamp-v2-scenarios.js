#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Build-stage binding digest restamp guard: after runBuild stamps the
// real artifact descriptor into manifest.json, the generated bindings
// file must pin the canonical digest of that stamped normalized
// manifest (the binding contract's package_id + manifest_digest
// identity), or CREATE BINDING deterministically rejects every
// genuinely built component (PACKAGE_STATE_CORRUPT, live witness
// public-path-multinode-baseline-20260811T090119Z). The generator test
// proves the restamp owner's digest and byte-canonical rewrite; the
// pipeline CLI test proves the real-componentize build path leaves the
// tree's bindings pinned to the stamped manifest digest (red on
// revert).
const SCENARIOS = {
  'service-pipeline-binding-digest-build-restamp-v2': [
    'test/service/service-deployment-record-generator.test.js',
    'test/cli/service-pipeline-command.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
