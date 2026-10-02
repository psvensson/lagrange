#!/usr/bin/env node
// Read-only doneWhen probe for partition-key-ordering-owner-completion-v2.
//
// Zero means the partition-key order has one complete semantic owner:
// - string/TEXT order matches SQLite BINARY's UTF-8 byte ordering, including
//   the non-BMP/BMP case that differs from JavaScript UTF-16 relational order;
// - the existing numeric/TEXT compatibility remains intact;
// - unrelated mixed key spaces raise the exact typed mismatch outcome;
// - KeyRange/PartitionResolver/QueryGroup keep consuming compareRoutingKeys;
// - split/merge sort AND adjacency no longer retain comparePartitionKeys.
//
// Behavioral Quest witnesses remain mandatory. This is the binary closure
// predicate and therefore deliberately rejects incomplete lookalikes.

import fs from 'node:fs';

import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  compareRoutingKeys,
} from '../../src/partition/split-key-comparator.js';

const UTF8 = 'utf8';
const COMPARATOR_URL = new URL(
  '../../src/partition/split-key-comparator.js',
  import.meta.url,
);
const MERGE_CORE_URL = new URL(
  '../../src/partition/partition-split-merge-manager-core-methods.js',
  import.meta.url,
);
const MERGE_EVALUATION_URL = new URL(
  '../../src/partition/partition-split-merge-manager-evaluation-methods.js',
  import.meta.url,
);
const LOCALE_CALL_PATTERN = /\.localeCompare\s*\(/u;
const DUPLICATE_METHOD_PATTERN = /\bcomparePartitionKeys\s*\(/u;
const OWNER_USE_PATTERN = /\bcompareRoutingKeys\s*\(/u;
const TEXT_CASES = Object.freeze([
  Object.freeze(['Z', 'a']),
  Object.freeze(['a', 'A']),
  Object.freeze(['z', '~']),
  Object.freeze(['0', 'A']),
  Object.freeze(['\uE000', '\u{10000}']),
]);
const RIGHT_NUMERIC_KEY = 1000;
const STORED_NUMERIC_BOUNDARY = '500.0';
const NON_NUMERIC_BOUNDARY = 'abc';
const EXPECTED_MIXED_REFUSAL =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number', 'string');

function sign(value) {
  if (value < 0) return -1;
  if (value > 0) return 1;
  return 0;
}

function sqliteBinaryTextCompare(left, right) {
  return Buffer.compare(Buffer.from(left, UTF8), Buffer.from(right, UTF8));
}

function behavioralProblemCount() {
  let problems = 0;

  for (const [left, right] of TEXT_CASES) {
    if (sign(compareRoutingKeys(left, right)) !==
        sign(sqliteBinaryTextCompare(left, right))) {
      problems += 1;
    }
  }

  if (compareRoutingKeys(
    RIGHT_NUMERIC_KEY,
    STORED_NUMERIC_BOUNDARY,
  ) <= 0) {
    problems += 1;
  }

  try {
    compareRoutingKeys(RIGHT_NUMERIC_KEY, NON_NUMERIC_BOUNDARY);
    problems += 1;
  } catch (error) {
    if (error?.message !== EXPECTED_MIXED_REFUSAL) {
      problems += 1;
    }
  }

  return problems;
}

function structuralProblemCount() {
  const comparatorSource = fs.readFileSync(COMPARATOR_URL, UTF8);
  const mergeCoreSource = fs.readFileSync(MERGE_CORE_URL, UTF8);
  const mergeEvaluationSource = fs.readFileSync(MERGE_EVALUATION_URL, UTF8);
  let problems = 0;

  if (LOCALE_CALL_PATTERN.test(comparatorSource)) problems += 1;
  if (DUPLICATE_METHOD_PATTERN.test(mergeCoreSource)) problems += 1;
  if (DUPLICATE_METHOD_PATTERN.test(mergeEvaluationSource)) problems += 1;
  if (!OWNER_USE_PATTERN.test(mergeCoreSource)) problems += 1;
  if (!OWNER_USE_PATTERN.test(mergeEvaluationSource)) problems += 1;

  return problems;
}

const metric = behavioralProblemCount() + structuralProblemCount();
if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v2: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
