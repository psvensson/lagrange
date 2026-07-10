#!/usr/bin/env node

import {
  runProjectHardeningAcceptance,
} from './run-project-hardening-acceptance.js';

const result = runProjectHardeningAcceptance({
  scenario: 'solver-acceptance-proof-manifest',
});
process.exitCode = result.run.passed ? 0 : 1;
