#!/usr/bin/env node

// Lists required provider/world cases. It never executes SDK code or reports
// conformance passing; CI acceptance needs a separate witnessed runtime run.

import {
  evaluateSdkHostConformance,
  loadSdkHostConformanceInputs,
} from './checks/sdk-host-conformance-plan.js';

try {
  if (process.argv.length !== 2) {
    throw new Error('this inventory command takes no arguments');
  }
  const result = evaluateSdkHostConformance(loadSdkHostConformanceInputs());
  if (!result.valid) {
    throw new Error(result.problems.join('; '));
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'unexecuted-sdk-host-conformance-plan',
    evidence: 'none',
    cases: result.plan,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`SDK conformance inventory refused: ${error.message}\n`);
  process.exitCode = 1;
}
