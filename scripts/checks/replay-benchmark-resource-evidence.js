#!/usr/bin/env node

import {
  createBenchmarkResourceDurableResolver,
} from '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  validateBenchmarkResourceEvidenceRoot,
} from '../../test/distributed/harness/benchmark-resource-evidence-root.js';

const ALLOW_NON_MEASURING = '--allow-non-measuring';
const [, , rootDirectory, rootDigest, ...options] = process.argv;
const allowNonMeasuring = options.includes(ALLOW_NON_MEASURING);
const result = validateBenchmarkResourceEvidenceRoot({
  rootDigest,
  resolver: createBenchmarkResourceDurableResolver(rootDirectory),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
if (
  !result.valid ||
  (!allowNonMeasuring && !result.claimEligible)
) {
  process.exitCode = 1;
}
