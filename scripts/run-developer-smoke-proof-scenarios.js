#!/usr/bin/env node

import {
  runProjectHardeningAcceptance,
} from './run-project-hardening-acceptance.js';

const result = runProjectHardeningAcceptance({
  manifestPath: 'test/manifests/developer-smoke-proof-manifest.json',
  receiptDir: 'test-output/acceptance/developer-smoke',
  scenario: 'developer-smoke-proof',
});

process.exitCode = result.run.passed ? 0 : 1;
