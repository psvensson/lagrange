#!/usr/bin/env node

import {executeHistoricalArtifactBatch} from
  './solve/historical-artifact-batch-v2.js';

const BATCH_PREFIX = 'solver-historical-artifact-batch-';
const USAGE = 'usage: migrate-solver-historical-artifact-batch.js <NNN>';
const batch = process.argv[2];
if (!/^\d{3}$/u.test(batch || '')) {
  throw new Error(USAGE);
}
const result = executeHistoricalArtifactBatch(
  process.cwd(),
  `${BATCH_PREFIX}${batch}`,
);
process.stdout.write(`${result.receiptPath}\n`);
