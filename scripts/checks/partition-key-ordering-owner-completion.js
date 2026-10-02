#!/usr/bin/env node
// Read-only doneWhen probe for partition-key-ordering-owner-completion.
//
// The probe measures current production semantics/shape and never mutates the
// tree or starts a harness. Zero means:
//   * routing TEXT order matches the deterministic SQLite BINARY baseline;
//   * the existing numeric/TEXT compatibility and mixed-space refusal survive;
//   * the routing owner no longer calls localeCompare;
//   * split/merge adjacency consumes compareRoutingKeys rather than retaining
//     its raw comparePartitionKeys owner.
//
// Behavioral tests created by the Quest remain mandatory; this checker is the
// binary seal/closure measurement, not the whole proof.

import fs from 'node:fs';

import {
  compareRoutingKeys,
} from '../../src/partition/split-key-comparator.js';

const UTF8 = 'utf8';
const COMPARATOR_URL = new URL(
  '../../src/partition/split-key-comparator.js',
  import.meta.url,
);
const MERGE_MANAGER_URL = new URL(
  '../../src/partition/partition-split-merge-manager-core-methods.js',
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
]);
const RIGHT_NUMERIC_KEY = 1000;
const STORED_NUMERIC_BOUNDARY = '500.0';
const NON_NUMERIC_BOUNDARY = 'abc';

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

  let refused = false;
  try {
    compareRoutingKeys(RIGHT_NUMERIC_KEY, NON_NUMERIC_BOUNDARY);
  } catch (_error) {
    refused = true;
  }
  if (!refused) problems += 1;

  return problems;
}

function structuralProblemCount() {
  const comparatorSource = fs.readFileSync(COMPARATOR_URL, UTF8);
  const mergeManagerSource = fs.readFileSync(MERGE_MANAGER_URL, UTF8);
  let problems = 0;

  if (LOCALE_CALL_PATTERN.test(comparatorSource)) problems += 1;
  if (DUPLICATE_METHOD_PATTERN.test(mergeManagerSource)) problems += 1;
  if (!OWNER_USE_PATTERN.test(mergeManagerSource)) problems += 1;

  return problems;
}

const metric = behavioralProblemCount() + structuralProblemCount();
if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
