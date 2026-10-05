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

let metric = 0;
metric += policy?.version === 1 ? 0 : 1;
metric += policy?.integerEncoding === 'sqlite_integer_exact' ? 0 : 1;
metric += policy?.typeAuthority === 'declared_primary_key_type' ? 0 : 1;
metric += policy?.legacyAmbiguousBoundary === 'fail_closed_revalidate' ? 0 : 1;
metric += policy?.globalSafeIntegerMode === false ? 0 : 1;
metric += schema.includes('partition_key_type') ? 0 : 1;
metric += split.includes('{safeIntegers: true}') &&
  readPath.includes('stmt.safeIntegers(options.safeIntegers === true)') ? 0 : 1;
metric += workflow.includes('partition_key_type: sourcePartitionKeyType') ? 0 : 1;
metric += decoder.includes('BigInt(value)') &&
  witness.includes('9007199254740993n') ? 0 : 1;

process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
