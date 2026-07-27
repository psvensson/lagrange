#!/usr/bin/env node

import {
  createBenchmarkResourceDurableResolver,
} from '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  validateBenchmarkResourceEvidenceRoot,
} from '../../test/distributed/harness/benchmark-resource-evidence-root.js';

const [, , rootDirectory, rootDigest] = process.argv;
const result = validateBenchmarkResourceEvidenceRoot({
  rootDigest,
  resolver: createBenchmarkResourceDurableResolver(rootDirectory),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.valid || !result.claimEligible) process.exitCode = 1;
