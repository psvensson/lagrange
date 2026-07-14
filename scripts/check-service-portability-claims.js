#!/usr/bin/env node

import {checkServicePortabilityClaimsContract} from
  './checks/service-portability-claims-contract.js';

const SUCCESS_MESSAGE = 'service-portability claims: valid\n';

const result = checkServicePortabilityClaimsContract();
if (!result.valid) {
  for (const problem of result.problems) {
    process.stderr.write(`service-portability claim violation: ${problem}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(SUCCESS_MESSAGE);
}
