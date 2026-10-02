#!/usr/bin/env node
import fs from 'node:fs';

const SCHEMA_PATH = 'src/bootstrap/system-table-core-schema-definitions.js';
const SPLIT_PATH = 'src/partition/partition-split-merge-manager-core-methods.js';
const PERSIST_PATH = 'src/partition/managed-split-workflow-persistence-methods.js';
const POLICY_PATH =
  'solve/specs/release-0-3-queryable-core/partition-boundary-representation.json';
const TEXT_ENCODING = 'utf8';

const schema = fs.readFileSync(SCHEMA_PATH, TEXT_ENCODING);
const split = fs.readFileSync(SPLIT_PATH, TEXT_ENCODING);
const persist = fs.readFileSync(PERSIST_PATH, TEXT_ENCODING);
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
metric += split.includes('safeIntegers(true)') ? 0 : 1;
metric += persist.includes('partition_key_type') ? 0 : 1;
metric += split.includes('9007199254740993') ? 0 : 1;

process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
