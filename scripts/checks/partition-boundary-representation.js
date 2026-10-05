#!/usr/bin/env node
import fs from 'node:fs';

const SCHEMA_PATH = 'src/bootstrap/system-table-core-schema-definitions.js';
const SPLIT_PATH = 'src/partition/partition-split-merge-manager-core-methods.js';
const WORKFLOW_PATH = 'src/partition/managed-split-workflow.js';
const READ_PATH = 'src/partition/partition-service-write-metrics-base.js';
const DECODER_PATH = 'src/partition/partition-boundary-representation.js';
const WITNESS_PATH = 'test/partition/partition-boundary-representation.test.js';
const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/partition-boundary-representation.json';
const TEXT_ENCODING = 'utf8';

const schema = fs.readFileSync(SCHEMA_PATH, TEXT_ENCODING);
const split = fs.readFileSync(SPLIT_PATH, TEXT_ENCODING);
const workflow = fs.readFileSync(WORKFLOW_PATH, TEXT_ENCODING);
const readPath = fs.readFileSync(READ_PATH, TEXT_ENCODING);
const decoder = fs.readFileSync(DECODER_PATH, TEXT_ENCODING);
const witness = fs.readFileSync(WITNESS_PATH, TEXT_ENCODING);
let policy = null;
try {
  policy = JSON.parse(fs.readFileSync(POLICY_PATH, TEXT_ENCODING));
} catch {
  policy = null;
}

const dimensions = {
  policyVersion: policy?.version === 1,
  integerEncoding: policy?.integerEncoding === 'sqlite_integer_exact',
  typeAuthority: policy?.typeAuthority === 'declared_primary_key_type',
  legacyRevalidation:
    policy?.legacyAmbiguousBoundary === 'fail_closed_revalidate',
  scopedSafeInteger: policy?.globalSafeIntegerMode === false,
  schemaAuthority: schema.includes('partition_key_type'),
  exactMedianRead: split.includes('{safeIntegers: true}') &&
    readPath.includes('stmt.safeIntegers(options.safeIntegers === true)'),
  splitPropagation:
    workflow.includes('partition_key_type: sourcePartitionKeyType'),
  exactLargeInteger: decoder.includes('BigInt(value)') &&
    witness.includes('9007199254740993n'),
};
const failed = Object.entries(dimensions)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const metric = failed.length;
if (failed.length > 0) {
  process.stderr.write(`A2 failed dimensions: ${failed.join(', ')}\\n`);
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
